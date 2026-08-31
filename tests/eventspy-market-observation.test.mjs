import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AUTHORIZED_EVENTSPY_URL, parseEventSpyHtml, validateMarketObservation } from "../src/lib/tickets/market-observation.mjs";
const fixture = await readFile(new URL("./fixtures/eventspy-sanitized.html", import.meta.url), "utf8");
const collectedAt = "2026-08-31T02:00:00Z", now = Date.parse(collectedAt);
const parse = (html = fixture, options = {}) => parseEventSpyHtml(html, { sourceUrl: AUTHORIZED_EVENTSPY_URL, collectedAt, now, ...options });

test("parses summary separately from a four-marketplace series point", () => {
  const value = parse(); assert.equal(value.gameId, "1392216"); assert.equal(value.summary.currentLowestPriceCents, 26775);
  assert.equal(value.summary.currentLowestSeenAt, "2026-08-31T01:40:00Z"); assert.equal(value.seriesPoint.observedAt, "2026-08-31T01:45:00Z");
  assert.deepEqual(value.seriesPoint.marketplaces.map((item) => [item.marketplace, item.lowestPriceCents]), [["ticketmaster",26775],["stubhub",30200],["vividseats",28300],["seatgeek",35300]]);
  assert.equal(value.seriesPoint.marketplaces[0].sectionLabel, "Section 300"); assert.equal(Object.hasOwn(value.seriesPoint.marketplaces[3], "sectionLabel"), false);
});
test("missing marketplace is an explicit gap, not zero", () => assert.equal(parse(fixture.replace("<dd>$302.00</dd>", "<dd>Unavailable</dd>")).seriesPoint.marketplaces[1].lowestPriceCents, null));
test("fails closed on selector failure, malformed prices, wrong identity and URL", () => {
  assert.throws(() => parse(fixture.replace("Ticketmaster Price", "Ticketmaster Get In")), /label/);
  for (const bad of ["$12", "USD 12.00", "$1,2.00"]) assert.throws(() => parse(fixture.replace("$302.00", bad)), /Malformed/);
  assert.throws(() => parse(fixture.replace("<dd>374440</dd>", "<dd>1</dd>")), /identity/);
  assert.throws(() => parse(fixture, { sourceUrl: `${AUTHORIZED_EVENTSPY_URL}?token=x` }), /authorized/);
});
test("validation rejects duplicates, wrong game and secret-bearing or future observations", () => {
  const value = parse(); assert.throws(() => validateMarketObservation({ ...value, gameId: "1" }, { now }), /identity/);
  const duplicate = structuredClone(value); duplicate.seriesPoint.marketplaces[1].marketplace = "ticketmaster"; assert.throws(() => validateMarketObservation(duplicate, { now }), /Duplicate/);
  const secret = structuredClone(value); secret.seriesPoint.marketplaces[0].sectionLabel = "api_key=bad"; assert.throws(() => validateMarketObservation(secret, { now }), /sectionLabel|secret/);
  const future = structuredClone(value); future.seriesPoint.observedAt = "2026-09-01T02:00:00Z"; assert.throws(() => validateMarketObservation(future, { now }), /observedAt/);
});
test("summary need not equal the series point when source timestamps differ", () => { const value = parse(fixture.replace("$267.75</dd><dt>Current Lowest Marketplace", "$260.00</dd><dt>Current Lowest Marketplace")); assert.equal(value.summary.currentLowestPriceCents, 26000); assert.equal(value.seriesPoint.marketplaces[0].lowestPriceCents, 26775); });
test("there is no coordinate, color, OCR, or pixel fallback", () => assert.throws(() => parse('<svg><circle cx="1" cy="2" fill="red"/></svg>'), /label/));
