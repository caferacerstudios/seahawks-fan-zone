import test from "node:test";
import assert from "node:assert/strict";
import { loadRuntimeTicketData, runtimeEventUrl, runtimeProviderCoverage, runtimeTicketView, ticketModeUsesFixtures, ticketmasterSummaryModel, validateRuntimeEvent, validateRuntimeStatus } from "../src/lib/tickets/runtime-view.mjs";
import { eventSummaryAdapterPayload, listingAdapterPayload } from "../scripts/tickets/listing-adapter.mjs";

const future = "2030-01-01T00:00:00Z";
const past = "2020-01-01T00:00:00Z";

test("only preview mode permits bundled fixture records", () => {
  assert.equal(ticketModeUsesFixtures("preview"), true);
  assert.equal(ticketModeUsesFixtures("beta"), false);
  assert.equal(ticketModeUsesFixtures("live"), false);
  assert.equal(ticketModeUsesFixtures("disabled"), false);
});

test("event-summary price ranges never become listing inventory", () => {
  const view = runtimeTicketView({
    providerReferences: [{ provider: "ticketmaster", mode: "event-summary", canonicalUrl: "https://www.ticketmaster.com/event/one", expiresAt: future, summary: { priceRanges: [{ min: 10, max: 100, currency: "USD" }] } }],
    listings: { admission: [], parking: [], other: [] },
  }, Date.parse("2029-01-01T00:00:00Z"));
  assert.equal(view.listings.length, 0);
  assert.equal(view.summaries.length, 1);
});

test("zero-listing state keeps matched event summaries separate", () => {
  const view = runtimeTicketView({ providerReferences: [{ provider: "ticketmaster", mode: "event-summary", canonicalUrl: "https://www.ticketmaster.com/event/one", expiresAt: future }], listings: {} }, Date.parse("2029-01-01T00:00:00Z"));
  assert.deepEqual(view.listings, []);
  assert.equal(view.summaries.length, 1);
});

test("a listing-level fixture reaches the comparison view", () => {
  const listing = { provider: "fictional-market-a", canonicalUrl: "https://fictional-market-a.example.invalid/one", providerListingId: "one", stale: false, rankEligible: true, expiresAt: future };
  const view = runtimeTicketView({ providerReferences: [], listings: { admission: [listing], parking: [], other: [] } }, Date.parse("2029-01-01T00:00:00Z"));
  assert.deepEqual(view.listings, [listing]);
});

test("stale, expired, and rank-ineligible provider data is not rendered", () => {
  const base = { provider: "fictional-market-a", canonicalUrl: "https://fictional-market-a.example.invalid/one", stale: false, rankEligible: true, expiresAt: future };
  const view = runtimeTicketView({ providerReferences: [], listings: { admission: [
    { ...base, providerListingId: "fresh" },
    { ...base, providerListingId: "stale", stale: true, rankEligible: false },
    { ...base, providerListingId: "expired", expiresAt: past },
  ], parking: [], other: [] } }, Date.parse("2029-01-01T00:00:00Z"));
  assert.deepEqual(view.listings.map(({ providerListingId }) => providerListingId), ["fresh"]);
});

test("browser runtime paths accept only the published event contract", () => {
  assert.equal(runtimeEventUrl({ eventFile: "events/sea_2026-regular-1.json" }), "/data/tickets/events/sea_2026-regular-1.json");
  assert.throws(() => runtimeEventUrl({ eventFile: "../status.json" }), /Invalid runtime ticket event path/);
  assert.throws(() => runtimeEventUrl({ eventFile: "events/not-seahawks.json" }), /Invalid runtime ticket event path/);
});

test("listing adapter boundary fails closed when listings are absent", () => {
  assert.equal(listingAdapterPayload({ events: [{ id: "event", listings: [] }] }).events.length, 1);
  assert.throws(() => listingAdapterPayload({ events: [{ id: "event" }] }), { code: "INVALID_RESPONSE" });
  assert.equal(eventSummaryAdapterPayload({ events: [{ id: "event", priceRanges: [] }] }).events.length, 1);
});

const now = Date.parse("2029-01-01T00:00:00Z");
const status = { schemaVersion: "1.0.0", generatedAt: "2029-01-01T00:00:00Z", outcome: "success", fixture: false, providers: [{ provider: "ticketmaster", mode: "event-summary", state: "success", lastSuccess: "2029-01-01T00:00:00Z", counts: { fresh: 0, stale: 0, rejected: 2, unmatched: 1 } }] };
const index = { schemaVersion: "1.0.0", generatedAt: status.generatedAt, outcome: "success", events: [
  { eventKey: "sea:game-1", gameId: "game-1", eventFile: "events/sea_game-1.json" },
  { eventKey: "sea:game-2", gameId: "game-2", eventFile: "events/sea_game-2.json" },
] };
const capabilities = { supportsSeatListings: false, supportsResaleListings: false, supportsPriceRange: true, accessTier: "discovery" };
const event = { schemaVersion: "1.0.0", generatedAt: status.generatedAt, event: { eventKey: "sea:game-2", gameId: "game-2" }, providerReferences: [{ provider: "ticketmaster", providerEventId: "real", mode: "event-summary", state: "fresh", canonicalUrl: "https://www.ticketmaster.com/event/real", fetchedAt: status.generatedAt, expiresAt: future, capabilities, summary: { eventStatus: "onsale", inventoryDetailLevel: "price_range", priceRanges: [] } }], listings: { admission: [], parking: [], other: [] } };

test("beta runtime rejects fixtures, stale snapshots, and malformed responses", () => {
  assert.throws(() => validateRuntimeStatus({ ...status, fixture: true }, now), /prohibited/);
  assert.throws(() => validateRuntimeStatus({ ...status, generatedAt: past }, now), /stale/);
  assert.throws(() => validateRuntimeStatus({ ...status, schemaVersion: "2.0.0" }, now), /incompatible/);
});

test("beta loads only the selected event JSON and accepts zero listings", async () => {
  const requested = [];
  const values = new Map([["/data/tickets/status.json", status], ["/data/tickets/index.json", index], ["/data/tickets/events/sea_game-2.json", event]]);
  const loaded = await loadRuntimeTicketData(async (url) => { requested.push(url); return structuredClone(values.get(url)); }, "game-2", ["game-1", "game-2"], now);
  assert.deepEqual(requested.sort(), ["/data/tickets/events/sea_game-2.json", "/data/tickets/index.json", "/data/tickets/status.json"].sort());
  const view = runtimeTicketView(loaded.event, now);
  assert.equal(view.listings.length, 0);
  assert.equal(view.summaries.length, 1);
  assert.equal(runtimeProviderCoverage(loaded.status, loaded.event)[0].freshListings, 0);
});

test("missing or malformed beta runtime data fails closed", async () => {
  await assert.rejects(loadRuntimeTicketData(async (url) => {
    if (url === "/data/tickets/status.json") throw new Error("missing");
    return index;
  }, "game-1", ["game-1"], now), /missing/);
  await assert.rejects(loadRuntimeTicketData(async (url) => url === "/data/tickets/status.json" ? status : { malformed: true }, "game-1", ["game-1"], now), /incompatible/);
});

test("Ticketmaster summary is official, allowlisted, and never converted to a listing", () => {
  const summary = ticketmasterSummaryModel(event.providerReferences[0]);
  assert.equal(summary.status, "On sale");
  assert.equal(summary.priceCopy, "See current prices on Ticketmaster");
  assert.equal(summary.rangeNotice, "This is a range, not an individual ticket listing.");
  assert.equal(new URL(summary.href).hostname, "www.ticketmaster.com");
  assert.equal(runtimeTicketView(event, now).listings.length, 0);
  const unsafe = structuredClone(event); unsafe.providerReferences[0].canonicalUrl = "https://evil.example/event";
  assert.throws(() => validateRuntimeEvent(unsafe, index.events[1], now), /allowlisted/);
});

test("Ticketmaster range copy is explicit and does not imply a live seat listing", () => {
  const ranged = structuredClone(event.providerReferences[0]);
  ranged.summary.priceRanges = [{ currency: "USD", min: 85.5, max: 640 }];
  const summary = ticketmasterSummaryModel(ranged);
  assert.equal(summary.priceCopy, "Ticketmaster advertised price range");
  assert.equal(summary.disclaimer, "Price and availability may change on Ticketmaster.");
  assert.equal(Object.hasOwn(summary, "listings"), false);
});

test("stale Ticketmaster summaries are clearly marked until their freshness limit", () => {
  const stale = structuredClone(event); stale.providerReferences[0].state = "stale";
  assert.equal(validateRuntimeEvent(stale, index.events[1], now), stale);
  const summary = ticketmasterSummaryModel(runtimeTicketView(stale, now).summaries[0]);
  assert.equal(summary.stale, true);
  stale.providerReferences[0].expiresAt = past;
  assert.throws(() => validateRuntimeEvent(stale, index.events[1], now), /freshness limit/);
});
