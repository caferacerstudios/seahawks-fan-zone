import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { providerOutboundLink, safeProviderUrl } from "../src/lib/tickets/outbound-links.mjs";
import { ticketClickEvent } from "../src/lib/tickets/analytics.mjs";

const ticketsPage = await readFile(new URL("../src/pages/tickets.astro", import.meta.url), "utf8");
const runtimeView = await readFile(new URL("../src/lib/tickets/runtime-view.mjs", import.meta.url), "utf8");
const sitemap = await readFile(new URL("../src/pages/sitemap.xml.ts", import.meta.url), "utf8");
const fetchNfl = await readFile(new URL("../scripts/fetch-nfl.mjs", import.meta.url), "utf8");
const syncDockerfile = await readFile(new URL("../deployment/ticket-sync/Dockerfile", import.meta.url), "utf8");

test("ticket page has one complete disclosure and one compact price qualifier", () => {
  assert.equal((ticketsPage.match(/Affiliate and source disclosure:/g) || []).length, 1);
  assert.equal((ticketsPage.match(/Prices are twice-daily observations and can change/g) || []).length, 1);
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

test("ticket click analytics are consent gated and limited to approved fields", () => {
  const input = { selectedGame: "game-1", provider: "market", sourceKind: "resale-marketplace", linkPlacement: "result", sortMode: "lowest_total", quantity: 4, seller: "do-not-record", email: "person@example.com" };
  assert.equal(ticketClickEvent({ ready: false, analytics: true }, input), null);
  assert.equal(ticketClickEvent({ ready: true, analytics: false }, input), null);
  const event = ticketClickEvent({ ready: true, analytics: true }, input, new Date("2026-08-29T12:00:00Z"));
  assert.deepEqual(Object.keys(event).sort(), ["click_timestamp", "event", "link_placement", "provider", "quantity_bucket", "selected_game", "sort_mode", "source_kind"].sort());
  assert.equal(event.quantity_bucket, "3-4");
});

test("runtime page renders one selected game shell and useful provider states", () => {
  assert.equal((ticketsPage.match(/data-selected-game-summary/g) || []).length >= 1, true);
  assert.doesNotMatch(ticketsPage, /data-game-summary=/);
  assert.match(ticketsPage, /Marketplace overview/);
  assert.match(runtimeView, /Ticketmaster did not supply an event range/);
  assert.match(ticketsPage, /No collection has occurred/);
  assert.match(ticketsPage, /Ticket information unavailable/);
  assert.match(ticketsPage, /Data diagnostics/);
  assert.doesNotMatch(ticketsPage, /0 listing-level offers/);
  assert.match(ticketsPage, /Historical observed lowest price/);
  assert.doesNotMatch(ticketsPage, /Official provider event summaries/);
});

test("dashboard terminology avoids unsupported ranking and internal labels", () => {
  assert.match(ticketsPage, /Current observed lowest price/);
  assert.match(ticketsPage, /EventSpy market observation/);
  assert.match(ticketsPage, /Observed range:/);
  assert.doesNotMatch(ticketsPage, /At 7-day low|StubHub connected|Data type|>Coverage</);
});

test("runtime selection is labelled, navigable, and used by outbound analytics", () => {
  assert.match(ticketsPage, /for="runtime-game-select"/);
  assert.match(ticketsPage, /history\.pushState\(null,"",`\$\{location\.pathname\}\?\$\{p\}`\)/);
  assert.match(ticketsPage, /addEventListener\("popstate"/);
  assert.match(ticketsPage, /#runtime-game-controls/);
  assert.match(ticketsPage, /aria-live="polite" aria-busy="true"/);
  assert.match(ticketsPage, /@media print/);
});

test("ticket print styles suppress global chrome, controls, and empty chart shells", () => {
  const printStyles = ticketsPage.match(/@media print\{([\s\S]*?)\}\s*<\/style>/)?.[1];
  assert.ok(printStyles, "ticket page should define print styles");

  const rules = [...printStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, declarations]) => ({
    selectors: selectors.split(",").map((selector) => selector.replace(/\s+/g, "")),
    declarations: declarations.replace(/\s+/g, ""),
  }));
  const ruleContaining = (requiredSelectors) => rules.find(({ selectors }) =>
    requiredSelectors.every((selector) => selectors.includes(selector))
  );

  const hiddenRule = ruleContaining([
    ":global(.skip-link)",
    ":global(.lr-header)",
    ":global(.lr-footer)",
    "form",
    ".ranges",
    ".official",
    "details#runtime-diagnostics",
  ]);
  assert.ok(hiddenRule, "print hidden rule should contain every chrome and control selector");
  assert.match(hiddenRule.declarations, /(?:^|;)display:none!important(?:;|$)/);

  const layoutResetRule = ruleContaining([
    ":global(.lr-middle)",
    ":global(.lr-main)",
    ":global(.lr-paper)",
  ]);
  assert.ok(layoutResetRule, "print layout reset rule should contain every layout selector");
  assert.match(layoutResetRule.declarations, /(?:^|;)overflow:visible!important(?:;|$)/);

  assert.match(printStyles, /\.chart:empty\{display:none\}/);
});

test("runtime outbound analytics omit fixture-only sort and quantity dimensions", () => {
  const event = ticketClickEvent({ ready: true, analytics: true }, { selectedGame: "week-7", provider: "ticketmaster", sourceKind: "official-primary", linkPlacement: "event-summary" }, new Date("2026-08-29T12:00:00Z"));
  assert.equal(event.selected_game, "week-7");
  assert.equal(Object.hasOwn(event, "sort_mode"), false);
  assert.equal(Object.hasOwn(event, "quantity_bucket"), false);
});
