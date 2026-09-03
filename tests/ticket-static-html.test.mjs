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
const gameId = gameDirectories.includes("1392216") ? "1392216" : gameDirectories[0];
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
  assert.match(visible, /Seattle Seahawks/);
  for (const text of ["Game facts", "Matchup", "Where to Watch", "Viewing information coming soon", "Game Day Guide", "Game Day Guide coming soon"]) assert.match(visible, new RegExp(text));
  assert.ok(/<time\b[^>]*datetime=/i.test(gameHtml) || /<dt>Venue<\/dt>/i.test(gameHtml), "game page should contain a semantic date or venue when supplied");
  assert.equal(h1Count(gameHtml), 1);
  assert.doesNotMatch(gameHtml, /eventspy/i);
  assert.doesNotMatch(gameHtml, /["']@type["']\s*:\s*["']Offer["']/i);
  const overview = gameHtml.indexOf('class="game-overview"');
  const guides = gameHtml.indexOf('class="game-guide-cards"');
  const related = gameHtml.indexOf("Related Seahawks coverage");
  assert.ok(overview >= 0 && overview < guides && guides < related, "game sections should follow facts, guide cards, then related coverage");
  for (const text of ["Current Ticket Observation", "Choose a Seahawks game", "Compare Ticket Providers", "Lowest Ticket Price History", "Supporting ticket information"]) assert.doesNotMatch(visible, new RegExp(text));
  assert.doesNotMatch(gameHtml, /id="ticket-price-explorer"/i);
});

test("the built tickets page retains the complete Ticket Finder", () => {
  const visible = stripNonVisible(ticketsHtml);
  for (const text of ["Seattle Seahawks Ticket Finder", "Supporting ticket information"]) assert.match(visible, new RegExp(text));
  for (const text of ["Choose a Seahawks game", "Compare Ticket Providers", "Lowest Ticket Price History"]) assert.match(ticketsHtml, new RegExp(text));
  assert.match(ticketsHtml, /id="ticket-price-explorer"/i);
});
