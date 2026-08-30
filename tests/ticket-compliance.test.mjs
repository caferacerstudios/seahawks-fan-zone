import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { providerOutboundLink, safeProviderUrl } from "../src/lib/tickets/outbound-links.mjs";
import { ticketClickEvent } from "../src/lib/tickets/analytics.mjs";

const ticketsPage = await readFile(new URL("../src/pages/tickets.astro", import.meta.url), "utf8");
const sitemap = await readFile(new URL("../src/pages/sitemap.xml.ts", import.meta.url), "utf8");
const fetchNfl = await readFile(new URL("../scripts/fetch-nfl.mjs", import.meta.url), "utf8");
const syncDockerfile = await readFile(new URL("../deployment/ticket-sync/Dockerfile", import.meta.url), "utf8");

test("ticket disclosure is visible beside the comparison controls and outbound results", () => {
  const copy = "We may earn a commission if you purchase tickets through some links on this page. Commission arrangements do not affect ticket rankings.";
  const controls = ticketsPage.indexOf('id="ticket-controls"');
  const nearbyCopy = ticketsPage.indexOf(copy, controls);
  assert.ok(nearbyCopy > controls);
  assert.ok(nearbyCopy < ticketsPage.indexOf('class="results-section"'));
});

test("robots and sitemap use the shared, separately gated feature state", () => {
  assert.match(ticketsPage, /robots: TICKET_FEATURE\.robots/);
  assert.match(sitemap, /path === "\/tickets".*TICKET_FEATURE\.includeInSitemap/);
});

test("real schedule generation marks fixture provenance false", () => {
  assert.match(fetchNfl, /fixture: false/);
});

test("ticket sync image requires an operator-supplied base image", () => {
  assert.match(syncDockerfile, /^ARG NODE_BASE_IMAGE\nFROM \$\{NODE_BASE_IMAGE\}/);
  assert.doesNotMatch(syncDockerfile, /ARG NODE_BASE_IMAGE=/);
});

test("ticket results contain no ads or ticket Offer structured data", () => {
  assert.doesNotMatch(ticketsPage, /<AdSlot|<DeferredAdSlot/);
  assert.doesNotMatch(ticketsPage, /["']Offer["']/);
  assert.match(ticketsPage, /monetizationEligible=\{false\}/);
});

test("provider URLs fail closed for malformed, unsafe-scheme, credential, secret, and wrong-host values", () => {
  for (const value of ["not a url", "javascript:alert(1)", "data:text/plain,x", "file:///tmp/x", "https://user:pass@fictional-market-a.example.invalid/x", "https://evil.example.invalid/x", "https://fictional-market-a.example.invalid/x?access_token=secret"]) {
    assert.equal(safeProviderUrl("fictional-market-a", value), null);
  }
  assert.equal(safeProviderUrl("unknown-provider", "https://fictional-market-a.example.invalid/x"), null);
});

test("affiliate provider links carry sponsored, nofollow, and noopener", () => {
  const link = providerOutboundLink("fictional-market-a", "https://fictional-market-a.example.invalid/listing", "https://fictional-market-a.example.invalid/go?campaign=public");
  assert.deepEqual(new Set(link.rel.split(" ")), new Set(["sponsored", "nofollow", "noopener"]));
});

test("stale and unknown-fee explanations are explicit", () => {
  assert.match(ticketsPage, /Provider stale/);
  assert.match(ticketsPage, /unknown-fee values are not ranked as cheapest/);
  assert.match(ticketsPage, /Fee-complete group total not supplied/);
});

test("ticket click analytics are consent gated and limited to approved fields", () => {
  const input = { selectedGame: "game-1", provider: "market", sourceKind: "resale-marketplace", linkPlacement: "result", sortMode: "lowest_total", quantity: 4, seller: "do-not-record", email: "person@example.com" };
  assert.equal(ticketClickEvent({ ready: false, analytics: true }, input), null);
  assert.equal(ticketClickEvent({ ready: true, analytics: false }, input), null);
  const event = ticketClickEvent({ ready: true, analytics: true }, input, new Date("2026-08-29T12:00:00Z"));
  assert.deepEqual(Object.keys(event).sort(), ["click_timestamp", "event", "link_placement", "provider", "quantity_bucket", "selected_game", "sort_mode", "source_kind"].sort());
  assert.equal(event.quantity_bucket, "3-4");
});
