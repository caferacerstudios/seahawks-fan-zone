const COMPARABLE_FEES = new Set(["all_in", "provider_reported_all_in"]);
const SORTS = new Set(["lowest_total", "lowest_per_ticket", "best_zone_within_budget", "official_first", "most_recent"]);

const compareText = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "en");
const compareNumber = (a, b) => a - b;
const identity = (listing) => `${listing.provider}:${listing.providerListingId}`;
const isOfficial = (listing) => listing.sourceKind === "official-primary";
const normalizedText = (value) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");

function assertOptions({ quantity, now, sort, productMode, budgetCents, priceToleranceCents, priceToleranceRatio }) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) throw new RangeError("quantity must be an integer from 1 through 20");
  if (!Number.isFinite(Date.parse(now))) throw new TypeError("now must be an ISO timestamp");
  if (!SORTS.has(sort)) throw new TypeError(`unsupported sort: ${sort}`);
  if (!["admission", "parking"].includes(productMode)) throw new TypeError("productMode must be admission or parking");
  if (budgetCents !== null && (!Number.isSafeInteger(budgetCents) || budgetCents < 0)) throw new TypeError("budgetCents must be non-negative integer cents or null");
  if (!Number.isSafeInteger(priceToleranceCents) || priceToleranceCents < 0) throw new TypeError("priceToleranceCents must be non-negative integer cents");
  if (typeof priceToleranceRatio !== "number" || priceToleranceRatio < 0) throw new TypeError("priceToleranceRatio must be non-negative");
}

export function isQuantityEligible(listing, quantity) {
  return Number.isSafeInteger(quantity) && Array.isArray(listing?.allowedQuantities) && listing.allowedQuantities.includes(quantity);
}

/**
 * Produces a comparison price without guessing about provider split rules or
 * allocating an order-level fee. A group total on a multi-quantity record has
 * no canonical quantity basis, so it is deliberately not reused.
 */
export function normalizeListingPrice(listing, quantity) {
  if (!isQuantityEligible(listing, quantity) || !COMPARABLE_FEES.has(listing.feeCompleteness)) return null;

  let groupTotalCents = null;
  if (listing.allowedQuantities.length === 1 && listing.allInGroupTotalCents !== null) {
    groupTotalCents = listing.allInGroupTotalCents;
  } else if (listing.feeCompleteness === "all_in" && listing.mandatoryFeesCents !== null && listing.allInPerTicketCents !== null) {
    // The canonical all_in invariant defines mandatoryFeesCents per ticket.
    groupTotalCents = listing.allInPerTicketCents * quantity;
  }
  if (!Number.isSafeInteger(groupTotalCents) || groupTotalCents < 0) return null;

  const perTicketCents = groupTotalCents / quantity;
  return { groupTotalCents, perTicketCents, currency: listing.currency };
}

function zoneRank(listing, zoneOrder) {
  const zone = normalizedText(listing.sectionNormalized);
  const rank = zoneOrder.map(normalizedText).indexOf(zone);
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

function comparator(sort, { budgetCents, zoneOrder }) {
  const total = (a, b) => compareNumber(a.comparison.groupTotalCents, b.comparison.groupTotalCents);
  const perTicket = (a, b) => compareNumber(a.comparison.perTicketCents, b.comparison.perTicketCents);
  const official = (a, b) => Number(isOfficial(b.listing)) - Number(isOfficial(a.listing));
  const recent = (a, b) => Date.parse(b.listing.fetchedAt) - Date.parse(a.listing.fetchedAt);
  const stable = (a, b) => compareText(identity(a.listing), identity(b.listing));
  const chain = (...comparators) => (a, b) => {
    for (const compare of comparators) { const result = compare(a, b); if (result) return result; }
    return 0;
  };

  if (sort === "lowest_per_ticket") return chain(perTicket, total, official, recent, stable);
  if (sort === "official_first") return chain(official, total, perTicket, recent, stable);
  if (sort === "most_recent") return chain(recent, total, perTicket, official, stable);
  if (sort === "best_zone_within_budget") {
    const withinBudget = (item) => budgetCents !== null && item.comparison.groupTotalCents <= budgetCents;
    return chain(
      (a, b) => Number(withinBudget(b)) - Number(withinBudget(a)),
      (a, b) => withinBudget(a) && withinBudget(b) ? zoneRank(a.listing, zoneOrder) - zoneRank(b.listing, zoneOrder) : 0,
      total, perTicket, official, recent, stable,
    );
  }
  return chain(total, perTicket, official, recent, stable);
}

function similar(a, b, { quantity, priceToleranceCents, priceToleranceRatio }) {
  if (a.listing.currency !== b.listing.currency) return false;
  if (normalizedText(a.listing.sectionNormalized) !== normalizedText(b.listing.sectionNormalized)) return false;
  if (normalizedText(a.listing.rowRaw) !== normalizedText(b.listing.rowRaw)) return false;
  if (!isQuantityEligible(a.listing, quantity) || !isQuantityEligible(b.listing, quantity)) return false;
  const difference = Math.abs(a.comparison.groupTotalCents - b.comparison.groupTotalCents);
  const ratioLimit = Math.min(a.comparison.groupTotalCents, b.comparison.groupTotalCents) * priceToleranceRatio;
  return difference <= Math.max(priceToleranceCents, ratioLimit);
}

export function groupSimilarOffers(ranked, options) {
  const groups = [];
  for (const offer of ranked) {
    const group = groups.find((candidate) => similar(candidate.offers[0], offer, options));
    if (group) group.offers.push(offer);
    else groups.push({ label: "similar offers", offers: [offer] });
  }
  return groups;
}

export function rankTicketListings(listings, options = {}) {
  const settings = {
    quantity: options.quantity,
    now: options.now ?? new Date().toISOString(),
    sort: options.sort ?? "lowest_total",
    productMode: options.productMode ?? "admission",
    budgetCents: options.budgetCents ?? null,
    zoneOrder: options.zoneOrder ?? [],
    staleAfterMs: options.staleAfterMs ?? null,
    staleProviders: new Set(options.staleProviders ?? []),
    currency: options.currency ?? null,
    priceToleranceCents: options.priceToleranceCents ?? 100,
    priceToleranceRatio: options.priceToleranceRatio ?? 0.01,
  };
  assertOptions(settings);
  const nowMs = Date.parse(settings.now);
  const excluded = { invalidQuantity: [], expired: [], stale: [], wrongProduct: [], incompleteFees: [], unsafeTotal: [], otherCurrency: [] };
  const unknownFeeOffers = [];
  const comparable = [];

  for (const listing of listings) {
    if (!isQuantityEligible(listing, settings.quantity)) { excluded.invalidQuantity.push(listing); continue; }
    if (Date.parse(listing.expiresAt) <= nowMs) { excluded.expired.push(listing); continue; }
    const stale = settings.staleProviders.has(listing.provider)
      || (settings.staleAfterMs !== null && nowMs - Date.parse(listing.fetchedAt) > settings.staleAfterMs);
    if (stale) { excluded.stale.push({ ...listing, stale: true }); continue; }
    if (listing.productType !== settings.productMode) { excluded.wrongProduct.push(listing); continue; }
    if (!COMPARABLE_FEES.has(listing.feeCompleteness)) {
      excluded.incompleteFees.push(listing);
      if (listing.feeCompleteness === "unknown") unknownFeeOffers.push(listing);
      continue;
    }
    const comparison = normalizeListingPrice(listing, settings.quantity);
    if (!comparison) { excluded.unsafeTotal.push(listing); continue; }
    if (settings.currency !== null && listing.currency !== settings.currency) { excluded.otherCurrency.push(listing); continue; }
    comparable.push({ listing, comparison });
  }

  const currencies = [...new Set(comparable.map(({ comparison }) => comparison.currency))].sort();
  const rankingsByCurrency = Object.fromEntries(currencies.map((currency) => {
    const ranked = comparable.filter((item) => item.comparison.currency === currency).sort(comparator(settings.sort, settings));
    return [currency, { ranked, similarOfferGroups: groupSimilarOffers(ranked, settings) }];
  }));
  const staleProviderCount = new Set(excluded.stale.map((listing) => listing.provider)).size;
  const explanation = [
    `Ranked by ${settings.sort === "lowest_total" ? "all-in total" : settings.sort.replaceAll("_", " ")} for ${settings.quantity} ticket${settings.quantity === 1 ? "" : "s"}`,
    `Excluded ${excluded.incompleteFees.length} offer${excluded.incompleteFees.length === 1 ? "" : "s"} with incomplete fee information`,
    `${staleProviderCount} provider${staleProviderCount === 1 ? " is" : "s are"} currently stale`,
  ];
  return { quantity: settings.quantity, sort: settings.sort, currencies, rankingsByCurrency, unknownFeeOffers, staleOffers: excluded.stale, excluded, explanation };
}
