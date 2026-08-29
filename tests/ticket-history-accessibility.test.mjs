import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../src/components/tickets/PriceHistory.astro", import.meta.url), "utf8");
const page = await readFile(new URL("../src/pages/tickets.astro", import.meta.url), "utf8");

test("history chart has a programmatic name, description, and equivalent table", () => {
  assert.match(component, /role="img" aria-labelledby="history-chart-title history-chart-desc"/);
  assert.match(component, /<title id="history-chart-title">/); assert.match(component, /<desc id="history-chart-desc">/);
  assert.match(component, /<caption>Equivalent price-history data<\/caption>/); assert.match(component, /<th scope="col">/); assert.match(component, /<th scope="row">/);
});

test("history has a separate flag and minimum-point launch gate", () => {
  assert.match(page, /TICKET_PRICE_HISTORY_STATE !== "disabled"/); assert.match(page, /history\.points\.length >= TICKET_PRICE_HISTORY_MINIMUM_POINTS/);
});

test("watchlist controls and status are explicitly labelled", () => {
  assert.match(page, />Save browser watch<\/button>/); assert.match(page, />Reset saved watch<\/button>/); assert.match(page, /role="status" aria-live="polite"/);
});
