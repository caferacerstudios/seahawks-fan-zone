import test from "node:test";
import assert from "node:assert/strict";
import { groupSimilarOffers, isQuantityEligible, normalizeListingPrice, rankTicketListings } from "../src/lib/tickets/rank.mjs";

const NOW = "2026-08-29T12:00:00Z";
const listing = (overrides = {}) => ({
  provider: "market-a", providerListingId: "A", sourceKind: "resale-marketplace",
  sectionNormalized: "CLUB", rowRaw: "A", allowedQuantities: [2], currency: "USD",
  basePriceCents: 9000, mandatoryFeesCents: 1000, allInPerTicketCents: 10000,
  allInGroupTotalCents: 20000, feeCompleteness: "all_in", productType: "admission",
  canonicalUrl: "https://market-a.example.invalid/a", fetchedAt: "2026-08-29T11:00:00Z",
  expiresAt: "2026-08-29T13:00:00Z", ...overrides,
});
const rank = (listings, options = {}) => rankTicketListings(listings, { quantity: 2, now: NOW, ...options });

test("only explicitly allowed quantities from one through eight are eligible", () => {
  const offer = listing({ allowedQuantities: [1, 2, 3, 4, 5, 6, 7, 8] });
  for (let quantity = 1; quantity <= 8; quantity += 1) assert.equal(isQuantityEligible(offer, quantity), true);
  for (const quantity of [0, 9, 2.5, null]) assert.equal(isQuantityEligible(offer, quantity), false);
  assert.equal(isQuantityEligible(listing({ allowedQuantities: [4] }), 2), false);
  assert.throws(() => rankTicketListings([], { quantity: 0, now: NOW }), /quantity must be an integer/);
});

test("group total dominates per-ticket and base prices", () => {
  const result = rank([
    listing({ providerListingId: "low-base", basePriceCents: 100, allInPerTicketCents: 11000, allInGroupTotalCents: 22000 }),
    listing({ providerListingId: "low-total", basePriceCents: 9500, allInPerTicketCents: 10000, allInGroupTotalCents: 20000 }),
  ]);
  assert.equal(result.rankingsByCurrency.USD.ranked[0].listing.providerListingId, "low-total");
});

test("a supplied group total retains per-order fees and ambiguous totals are not multiplied", () => {
  const withOrderFee = listing({ allInPerTicketCents: 10500, allInGroupTotalCents: 21000 });
  assert.deepEqual(normalizeListingPrice(withOrderFee, 2), { groupTotalCents: 21000, perTicketCents: 10500, currency: "USD" });
  const ambiguous = listing({ allowedQuantities: [2, 4], feeCompleteness: "provider_reported_all_in", mandatoryFeesCents: null, allInGroupTotalCents: 21000 });
  assert.equal(normalizeListingPrice(ambiguous, 2), null);
  assert.equal(rank([ambiguous]).excluded.unsafeTotal.length, 1);
});

test("unknown and estimated fees, including tax or shipping exclusions, cannot claim cheapest", () => {
  const result = rank([
    listing({ providerListingId: "unknown", feeCompleteness: "unknown", mandatoryFeesCents: null, allInPerTicketCents: null, allInGroupTotalCents: null }),
    listing({ providerListingId: "estimated", feeCompleteness: "estimated", sanitizedNotes: ["tax and shipping excluded"] }),
    listing({ providerListingId: "all-in" }),
  ]);
  assert.equal(result.rankingsByCurrency.USD.ranked.length, 1);
  assert.equal(result.unknownFeeOffers[0].providerListingId, "unknown");
  assert.equal(result.excluded.incompleteFees.length, 2);
});

test("expired and stale offers are excluded while stale links and state are preserved", () => {
  const result = rank([
    listing({ provider: "stale-market", providerListingId: "stale" }),
    listing({ providerListingId: "expired", expiresAt: NOW }),
    listing({ providerListingId: "fresh" }),
  ], { staleProviders: ["stale-market"] });
  assert.equal(result.excluded.expired.length, 1);
  assert.equal(result.staleOffers[0].canonicalUrl, "https://market-a.example.invalid/a");
  assert.equal(result.staleOffers[0].stale, true);
  assert.match(result.explanation[2], /1 provider is currently stale/);
});

test("admission excludes parking and every other non-admission product; parking mode is separate", () => {
  const products = ["admission", "parking", "hospitality", "tailgate", "donation", "deposit", "non-admission"]
    .map((productType, index) => listing({ providerListingId: String(index), productType }));
  assert.deepEqual(rank(products).rankingsByCurrency.USD.ranked.map(({ listing }) => listing.productType), ["admission"]);
  assert.deepEqual(rank(products, { productMode: "parking" }).rankingsByCurrency.USD.ranked.map(({ listing }) => listing.productType), ["parking"]);
});

test("currencies are ranked independently and event-summary values cannot enter listing rankings", () => {
  const result = rank([listing(), listing({ providerListingId: "cad", currency: "CAD" })]);
  assert.deepEqual(result.currencies, ["CAD", "USD"]);
  assert.equal(result.rankingsByCurrency.CAD.ranked.length, 1);
  assert.equal(result.rankingsByCurrency.USD.ranked.length, 1);
  assert.equal(rank([], {}).currencies.length, 0); // event summaries are references, not TicketListing inputs
});

test("sorting is deterministic for ties and supports all requested strategies", () => {
  const resale = listing({ providerListingId: "resale", sectionNormalized: "UPPER", fetchedAt: "2026-08-29T10:00:00Z" });
  const official = listing({ provider: "box-office", providerListingId: "official", sourceKind: "official-primary", sectionNormalized: "LOWER", allInPerTicketCents: 12000, allInGroupTotalCents: 24000, fetchedAt: "2026-08-29T11:30:00Z" });
  assert.equal(rank([resale, official], { sort: "official_first" }).rankingsByCurrency.USD.ranked[0].listing.providerListingId, "official");
  assert.equal(rank([resale, official], { sort: "lowest_total" }).rankingsByCurrency.USD.ranked[0].listing.providerListingId, "resale");
  assert.equal(rank([resale, official], { sort: "most_recent" }).rankingsByCurrency.USD.ranked[0].listing.providerListingId, "official");
  assert.equal(rank([resale, official], { sort: "best_zone_within_budget", budgetCents: 25000, zoneOrder: ["LOWER", "UPPER"] }).rankingsByCurrency.USD.ranked[0].listing.providerListingId, "official");
  const tied = rank([listing({ provider: "z", providerListingId: "2" }), listing({ provider: "a", providerListingId: "1" })]);
  assert.equal(tied.rankingsByCurrency.USD.ranked[0].listing.provider, "a");
});

test("commercial incentives are never ranking inputs", () => {
  const first = listing({ provider: "a", providerListingId: "first", affiliateCommissionCents: 0, expectedConversion: 0, providerPayoutCents: 0 });
  const second = listing({ provider: "z", providerListingId: "second", affiliateCommissionCents: 999999, expectedConversion: 1, providerPayoutCents: 999999 });
  assert.equal(rank([second, first]).rankingsByCurrency.USD.ranked[0].listing.providerListingId, "first");
});

test("similar syndicated offers are labeled, not deduplicated or inventory-summed", () => {
  const result = rank([
    listing({ provider: "market-a", providerListingId: "syndicated-a" }),
    listing({ provider: "market-b", providerListingId: "syndicated-b", allInGroupTotalCents: 20050, allInPerTicketCents: 10025 }),
    listing({ provider: "market-c", providerListingId: "different-row", rowRaw: "B" }),
  ]);
  const groups = result.rankingsByCurrency.USD.similarOfferGroups;
  assert.equal(groups[0].label, "similar offers");
  assert.equal(groups[0].offers.length, 2);
  assert.equal(groups[0].uniqueSeatCount, undefined);
  assert.equal(result.rankingsByCurrency.USD.ranked.length, 3);
  assert.equal(groupSimilarOffers(result.rankingsByCurrency.USD.ranked, { quantity: 2, priceToleranceCents: 100, priceToleranceRatio: 0 }).length, 2);
});

test("result explanations state quantity, fee exclusions, and stale providers", () => {
  const result = rank([listing({ feeCompleteness: "estimated" }), listing({ provider: "stale", providerListingId: "s" })], { staleProviders: ["stale"] });
  assert.deepEqual(result.explanation, [
    "Ranked by all-in total for 2 tickets",
    "Excluded 1 offer with incomplete fee information",
    "1 provider is currently stale",
  ]);
});
