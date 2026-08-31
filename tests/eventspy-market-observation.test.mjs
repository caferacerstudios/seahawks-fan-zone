import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AUTHORIZED_EVENTSPY_URL, parseEventSpyHtml, validateMarketObservation } from "../src/lib/tickets/market-observation.mjs";

const fixture = await readFile(new URL("./fixtures/eventspy-sanitized.html", import.meta.url), "utf8");
const fetchedAt = "2026-08-31T02:00:00Z";
const now = Date.parse(fetchedAt);
const parse = (html = fixture, options = {}) => parseEventSpyHtml(html, { sourceUrl: AUTHORIZED_EVENTSPY_URL, fetchedAt, now, ...options });

test("parses the authorized sanitized EventSpy observation with source attribution", () => {
  assert.deepEqual(parse(), {
    source: "eventspy", sourceEventId: "374440", sourceUrl: AUTHORIZED_EVENTSPY_URL,
    sfzGameId: "1392216", metric: "aggregate-lowest-observed", priceCents: 14225,
    currency: "USD", feeBasis: "estimated-fees-and-taxes-where-available",
    observedAt: "2026-08-31T01:45:00Z", fetchedAt, samplingCadence: "twice-daily",
    sevenDayLowCents: 13100, winnerMarketplace: "Example Tickets",
  });
});

test("fails closed for missing fields and changed or ambiguous labels", () => {
  assert.throws(() => parse(fixture.replace(/<dt>Fee Basis<\/dt><dd>[^<]+<\/dd>/, "")), /Fee Basis/);
  assert.throws(() => parse(fixture.replace("Lowest Observed Price", "Get-In Price")), /Lowest Observed Price/);
  assert.throws(() => parse(fixture.replace("<dt>Lowest Observed Price</dt>", "<dt>Lowest Observed Price</dt><dd>$1.00</dd><dt>Lowest Observed Price</dt>")), /ambiguous/);
});

test("rejects the wrong EventSpy event identity and every unmatched URL", () => {
  assert.throws(() => parse(fixture.replace("<dd>374440</dd>", "<dd>999999</dd>")), /identity/);
  assert.throws(() => parse(fixture, { sourceUrl: "https://www.event-spy.com/event/another-event/374440" }), /authorized/);
  assert.throws(() => parse(fixture, { sourceUrl: `${AUTHORIZED_EVENTSPY_URL}?token=secret` }), /authorized/);
});

test("rejects malformed, ambiguous, non-USD, and out-of-bounds prices", () => {
  for (const value of ["142.25", "USD 142.25", "$142", "$1,2.00", "$999999.99"]) {
    assert.throws(() => parse(fixture.replace("$142.25", value)), /Malformed|priceCents/);
  }
});

test("strict contract rejects secrets and provider min/max claims", () => {
  const observation = parse();
  for (const prohibited of ["apiKey", "secret", "minCents", "maxCents", "providerMaximumCents"]) {
    assert.throws(() => validateMarketObservation({ ...observation, [prohibited]: prohibited === "maxCents" ? 20000 : "do-not-store" }, { now }), /prohibited/);
  }
  assert.equal(Object.hasOwn(observation, "minCents"), false);
  assert.equal(Object.hasOwn(observation, "maxCents"), false);
  assert.equal(Object.hasOwn(observation, "provider"), false);
});

test("optional fields are emitted only when explicitly supplied", () => {
  const html = fixture
    .replace(/\s*<dt>Seven-Day Low<\/dt><dd>[^<]+<\/dd>/, "")
    .replace(/\s*<dt>Winning Marketplace<\/dt><dd>[^<]+<\/dd>/, "");
  const observation = parse(html);
  assert.equal(Object.hasOwn(observation, "sevenDayLowCents"), false);
  assert.equal(Object.hasOwn(observation, "winnerMarketplace"), false);
});

test("bounds response size, timestamps, identifiers, and string fields", () => {
  assert.throws(() => parse("x".repeat(64 * 1024 + 1)), /size limit/);
  assert.throws(() => parse(fixture, { fetchedAt: "not-a-timestamp" }), /fetchedAt/);
  assert.throws(() => parse(fixture.replace("2026-08-31T01:45:00Z", "2026-09-01T01:45:00Z")), /observedAt|timestamps/);
  assert.throws(() => validateMarketObservation({ ...parse(), sourceEventId: "3".repeat(33) }, { now }), /identity/);
  assert.throws(() => validateMarketObservation({ ...parse(), winnerMarketplace: "x".repeat(81) }, { now }), /winnerMarketplace/);
});
