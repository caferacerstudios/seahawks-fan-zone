import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
const stripNonVisible = (html) => html
  .replace(/<!--[^]*?-->/g, " ")
  .replace(/<(script|style|template|noscript)\b[^>]*>[^]*?<\/\1>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&(?:nbsp|#160);/gi, " ")
  .replace(/&(?:amp|#38);/gi, "&")
  .replace(/\s+/g, " ")
  .trim();
const publisherText = (html) => {
  const regions = html.match(/<div class="ticket-publisher-content"[^>]*data-ticket-publisher-content/gi) ?? [];
  assert.ok(regions.length >= 2, "built page should contain intro and supporting publisher regions");
  return stripNonVisible(html);
};
const h1Count = (html) => (html.match(/<h1\b/gi) || []).length;

const ticketsHtml = await readFile(new URL("tickets/index.html", dist), "utf8");
const gameDirectories = (await readdir(new URL("games/", dist), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
assert.ok(gameDirectories.length, "offline build should generate at least one game page");
const gameId = gameDirectories[0];
const gameHtml = await readFile(new URL(`games/${gameId}/index.html`, dist), "utf8");

test("generic Tickets HTML is substantial and useful without scripts", () => {
  const visible = stripNonVisible(ticketsHtml);
  const publisher = publisherText(ticketsHtml);
  for (const heading of ["Seattle Seahawks Ticket Finder", "Upcoming games in the Ticket Finder", "Sources and marketplaces covered", "How prices are compared", "Are fees included?", "Data freshness and limitations", "Before buying Seahawks tickets", "Provider links and disclosure"]) assert.match(visible, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(publisher.replace(/\s/g, "").length >= 1200, `publisher copy should exceed 1,200 non-whitespace characters, received ${publisher.replace(/\s/g, "").length}`);
  assert.match(ticketsHtml, /href="\/games\/[^"/]+\/"/);
  assert.notEqual(visible.trim(), "Loading game day…");
  assert.equal(h1Count(ticketsHtml), 1);
  assert.doesNotMatch(ticketsHtml, /eventspy/i);
  assert.doesNotMatch(ticketsHtml, /["']@type["']\s*:\s*["'](?:SportsEvent|Offer)["']/i);
  assert.doesNotMatch(visible, /Frequently Asked Questions/i);
});

test("a generated game page exposes factual game HTML and the permanent guide", () => {
  const visible = stripNonVisible(gameHtml);
  const publisher = publisherText(gameHtml);
  assert.match(visible, /Seattle Seahawks (?:vs\.|at) /);
  assert.match(visible, /Game facts/);
  assert.match(visible, /Matchup/);
  assert.ok(/<time\b[^>]*datetime=/i.test(gameHtml) || /<dt>Venue<\/dt>/i.test(gameHtml), "game page should contain a semantic date or venue when supplied");
  for (const heading of ["Are fees included?", "Data freshness and limitations", "Before buying Seahawks tickets", "Provider links and disclosure"]) assert.match(visible, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(publisher.replace(/\s/g, "").length >= 1200);
  assert.equal(h1Count(gameHtml), 1);
  assert.doesNotMatch(gameHtml, /eventspy/i);
  assert.doesNotMatch(gameHtml, /["']@type["']\s*:\s*["']Offer["']/i);
  assert.doesNotMatch(visible, /Frequently Asked Questions/i);
  const overview = gameHtml.indexOf('class="game-overview"');
  const explorer = gameHtml.indexOf('id="ticket-price-explorer"');
  const supporting = gameHtml.indexOf('id="ticket-information-heading"');
  const related = gameHtml.indexOf("Related Seahawks coverage");
  assert.ok(overview >= 0 && overview < explorer && explorer < supporting && supporting < related, "game sections should follow facts, ticket experience, guide, then related coverage");
  assert.match(gameHtml, /<details>\s*<summary><h3>Provider links and disclosure<\/h3><\/summary>/i);
  assert.doesNotMatch(gameHtml, /<details\s+open/i);
  assert.doesNotMatch(visible, /coming soon/i);
});
