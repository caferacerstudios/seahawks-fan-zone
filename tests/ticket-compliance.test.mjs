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
  const disclosure = "Price snapshots can change at any time and may not include taxes or fees. Confirm availability and the final checkout total with the ticket provider. Seahawks Fan Zone may earn a commission from qualifying purchases.";
  assert.equal((ticketsPage.match(new RegExp(disclosure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1);
  assert.equal((ticketsPage.match(/class="disclosure"/g) || []).length, 1);
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

test("runtime page renders the neutral ticket price explorer", () => {
  assert.match(ticketsPage, /id="ticket-price-explorer"/);
  assert.match(ticketsPage, /ticketPageReady:"true"/);
  assert.doesNotMatch(ticketsPage, /id="eventspy-mirror"|eventspyMirrorReady/);
  assert.match(ticketsPage, /Lowest Ticket Price History/);
  assert.match(runtimeView, /Ticketmaster did not supply an event range/);
  assert.doesNotMatch(ticketsPage, /Marketplace overview|No collection has occurred|0 listing-level offers/);
});

test("public presentation is source-neutral", () => {
  const publicPresentation = ticketsPage
    .replace(/import \{EVENTSPY_COVERAGE,eventSpyCoverageForGame\}[^\n]+/g, "")
    .replace(/import \{validateEventSpyMirror,MIRROR_MARKETS\}[^\n]+/g, "")
    .replace(/EVENTSPY_COVERAGE|eventSpyCoverageForGame|validateEventSpyMirror|eventspy-mirror/g, "");
  assert.doesNotMatch(publicPresentation, /eventspy/i);
  assert.doesNotMatch(ticketsPage, /Track prices on EventSpy|authorized EventSpy page|EventSpy ticket tracking|EventSpy snapshot/i);
  assert.doesNotMatch(ticketsPage, /StubHub connected|Data type|>Coverage</);
});

test("FAQ and its questions are absent", () => {
  assert.doesNotMatch(ticketsPage, /Frequently Asked Questions|What is the current starting price\?|What is the recent low\?|Which marketplace is currently cheapest\?|class="faq"/i);
});

test("last checked is semantic, exact, and snapshot-driven", () => {
  assert.match(ticketsPage, /<time data-last-checked datetime="\$\{esc\(s\)\}">/);
  assert.match(ticketsPage, /checkedTime\(v\.collectedAt\)/);
  assert.match(ticketsPage, /America\/Los_Angeles/);
  assert.match(ticketsPage, /timeZoneName:"short"/);
  assert.match(ticketsPage, /Prices have not been refreshed recently\. Last checked \$\{checkedTime\(v\.collectedAt\)\}/);
});

test("mirror controls are labelled and accessible", () => {
  assert.match(ticketsPage, /data-market-selector/);
  assert.doesNotMatch(ticketsPage, /Show Filters|data-show-filters|market-filters|data-filter/);
  assert.match(ticketsPage, /aria-label="Marketplace line colors"/);
  assert.match(ticketsPage, /aria-live="polite"/);
  assert.match(ticketsPage, /aria-live="polite" aria-busy="true"/);
  assert.match(ticketsPage, /@media print/);
});

test.skip("legacy dashboard print contract no longer applies to the mirror", () => {
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
