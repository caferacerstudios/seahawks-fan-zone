import test from "node:test";
import assert from "node:assert/strict";
import { compactHistory, pacificDay, summarizeObservation } from "../src/lib/tickets/price-history.mjs";

const terms = { a: { approved: true, historicalRetentionDays: 30 }, b: { approved: true, historicalRetentionDays: 10 } };
const listing = (provider = "a", price = 10000) => ({ provider, productType: "admission", feeCompleteness: "all_in", sectionNormalized: "upper", currency: "USD", allInPerTicketCents: price, allowedQuantities: [2] });
const observation = (observedAt, listings = [listing()], states = { a: "healthy" }, requested = ["a"]) => ({ eventId: "game-1", observedAt, requestedProviders: requested, providerStates: states, listings });

test("retention is bounded by the strictest contributing provider and expires old points", () => {
  const old = summarizeObservation(observation("2026-08-10T12:00:00Z"));
  const result = compactHistory({ points: [old] }, observation("2026-08-29T12:00:00Z", [listing("a"), listing("b")], { a: "healthy", b: "healthy" }, ["a", "b"]), { now: "2026-08-29T12:00:00Z", requestedRetentionDays: 90, providerTerms: terms });
  assert.equal(result.retentionDays, 10); assert.equal(result.points.length, 1);
});

test("unapproved or pending provider retention fails closed", () => {
  assert.throws(() => compactHistory(null, observation("2026-08-29T12:00:00Z"), { now: "2026-08-29T12:00:00Z", requestedRetentionDays: 30, providerTerms: { a: { approved: false } } }), { code: "HISTORY_RETENTION_NOT_APPROVED" });
});

test("missing and stale periods remain explicit and contain no fabricated groups", () => {
  const point = summarizeObservation(observation("2026-08-29T12:00:00Z", [], { a: "stale", b: "error" }, ["a", "b"]));
  assert.equal(point.coverage, "missing"); assert.deepEqual(point.staleProviders, ["a"]); assert.deepEqual(point.missingProviders, ["a", "b"]); assert.deepEqual(point.groups, []);
});

test("provider removal conservatively purges every affected summary", () => {
  const affected = summarizeObservation(observation("2026-08-28T12:00:00Z", [listing("a"), listing("b")], { a: "healthy", b: "healthy" }, ["a", "b"]));
  const result = compactHistory({ points: [affected] }, observation("2026-08-29T12:00:00Z", [], { a: "error" }, ["a"]), { now: "2026-08-29T12:00:00Z", requestedRetentionDays: 30, providerTerms: terms, removedProviders: ["b"] });
  assert.equal(result.points.some((point) => point.localDate === "2026-08-28"), false);
});

test("daily compaction uses Pacific dates across UTC and daylight-saving boundaries", () => {
  assert.equal(pacificDay("2026-03-08T07:59:59Z"), "2026-03-07");
  assert.equal(pacificDay("2026-03-08T08:00:00Z"), "2026-03-08");
  const first = summarizeObservation(observation("2026-11-01T08:30:00Z"));
  const result = compactHistory({ points: [first] }, observation("2026-11-01T09:30:00Z", [listing("a", 9000)]), { now: "2026-11-01T10:00:00Z", requestedRetentionDays: 30, providerTerms: terms });
  assert.equal(result.points.length, 1); assert.equal(result.points[0].groups[0].minimumCents, 18000);
});

test("summaries include exact statistics, coverage, and fee-complete sample size", () => {
  const point = summarizeObservation(observation("2026-08-29T12:00:00Z", [listing("a", 100), listing("a", 200), listing("b", 300), listing("b", 400)], { a: "healthy", b: "healthy" }, ["a", "b"]));
  assert.deepEqual(point.groups[0], { quantity: 2, zone: "upper", currency: "USD", minimumCents: 200, medianCents: 500, percentile25Cents: 200, percentile75Cents: 600, feeCompleteSampleSize: 4, contributingProviders: ["a", "b"] });
});
