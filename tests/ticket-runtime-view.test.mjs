import test from "node:test";
import assert from "node:assert/strict";
import { runtimeEventUrl, runtimeTicketView } from "../src/lib/tickets/runtime-view.mjs";
import { eventSummaryAdapterPayload, listingAdapterPayload } from "../scripts/tickets/listing-adapter.mjs";

const future = "2030-01-01T00:00:00Z";
const past = "2020-01-01T00:00:00Z";

test("event-summary price ranges never become listing inventory", () => {
  const view = runtimeTicketView({
    providerReferences: [{ provider: "summary", mode: "event-summary", canonicalUrl: "https://example.invalid/event", expiresAt: future, summary: { priceRanges: [{ min: 10, max: 100, currency: "USD" }] } }],
    listings: { admission: [], parking: [], other: [] },
  }, Date.parse("2029-01-01T00:00:00Z"));
  assert.equal(view.listings.length, 0);
  assert.equal(view.summaries.length, 1);
});

test("zero-listing state keeps matched event summaries separate", () => {
  const view = runtimeTicketView({ providerReferences: [{ mode: "event-summary", canonicalUrl: "https://example.invalid/event", expiresAt: future }], listings: {} }, Date.parse("2029-01-01T00:00:00Z"));
  assert.deepEqual(view.listings, []);
  assert.equal(view.summaries.length, 1);
});

test("a listing-level fixture reaches the comparison view", () => {
  const listing = { provider: "fixture-market", providerListingId: "one", stale: false, rankEligible: true, expiresAt: future };
  const view = runtimeTicketView({ providerReferences: [], listings: { admission: [listing], parking: [], other: [] } }, Date.parse("2029-01-01T00:00:00Z"));
  assert.deepEqual(view.listings, [listing]);
});

test("stale, expired, and rank-ineligible provider data is not rendered", () => {
  const base = { provider: "fixture-market", stale: false, rankEligible: true, expiresAt: future };
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
