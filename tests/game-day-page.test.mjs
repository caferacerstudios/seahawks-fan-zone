import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EVENTSPY_COVERAGE } from "../src/lib/tickets/eventspy-coverage.mjs";
import { gameDayPageModel } from "../src/lib/game-details.mjs";
import { currentProviderQuotes } from "../src/lib/tickets/provider-quotes.mjs";

const schedule = JSON.parse(await readFile(new URL("../src/data/nfl/seahawks.json", import.meta.url), "utf8"));
const component = await readFile(new URL("../src/components/GameDayPage.astro", import.meta.url), "utf8");
const guideComponent = await readFile(new URL("../src/components/game/GameDayGuide.astro", import.meta.url), "utf8");
const sourceLinkComponent = await readFile(new URL("../src/components/game/GuideSourceLink.astro", import.meta.url), "utf8");
const gameDayGuides = JSON.parse(await readFile(new URL("../src/data/nfl/game-day-guides.json", import.meta.url), "utf8"));
const gameRoute = await readFile(new URL("../src/pages/games/[gameId].astro", import.meta.url), "utf8");
const ticketRoute = await readFile(new URL("../src/pages/tickets.astro", import.meta.url), "utf8");

test("both URLs resolve game 1392216 through the same shared page model", () => {
  const fromGameUrl = gameDayPageModel(schedule, "1392216", EVENTSPY_COVERAGE);
  const fromTicketUrl = gameDayPageModel(schedule, new URL("https://example.test/tickets/?game=1392216").searchParams.get("game"), EVENTSPY_COVERAGE);
  for (const model of [fromGameUrl, fromTicketUrl]) {
    assert.equal(model.id, "1392216");
    assert.equal(model.opponentName, "New England Patriots");
    assert.equal(model.venue, "Lumen Field");
    assert.equal(model.game.date, fromGameUrl.game.date);
    assert.equal(model.ticketSnapshot, EVENTSPY_COVERAGE[0]);
    assert.match(model.seahawksLogo, /SEA\.png/);
    assert.match(model.opponentLogo, /NE\.png/);
  }
  assert.match(gameRoute, /GameDayPage/);
  assert.match(gameRoute, /routeStyle="games"/);
  assert.match(ticketRoute, /GameDayPage/);
});

test("ticket UI prefers canonical schedule dates and uses the shared Pacific formatter", () => {
  assert.match(component, /canonical\?\.startsAt\?\?canonical\?\.date\?\?row\.localDate/);
  assert.match(component, /g\.game\?\.startsAt\?\?g\.game\?\.date\?\?event\?\.localDate/);
  assert.match(component, /formatPacificCalendarDate/);
});

test("provider quotes remain price sorted with unavailable providers last", () => {
  const quotes = currentProviderQuotes([{ observedAt: "2026-09-01T22:15:00Z", ticketmasterCents: 12000, stubhubCents: null, vividseatsCents: 9500, seatgeekCents: 11000 }]);
  assert.deepEqual(quotes.map(({ provider }) => provider), ["vividseats", "seatgeek", "ticketmaster", "stubhub"]);
  assert.equal(quotes[0].isLowest, true);
});

test("shared page omits diagnostic placeholders and restores stable upcoming-game guides", () => {
  for (const text of ["NFC West context unavailable", "Recent form unavailable", "Opponent leaders unavailable", "Official links not posted", "Record unavailable"]) {
    assert.doesNotMatch(component, new RegExp(text));
  }
  assert.match(component, /Where to Watch/);
  assert.match(component, /Viewing information coming soon\./);
  assert.match(component, /Game Day Guide/);
  assert.match(component, /Game Day Guide coming soon\./);
  assert.match(component, /Ticket tracking is not available for this game yet/);
  assert.match(component, /Historical ticket-market information for this completed game/);
});

test("structured Game Day Guides are selected by the requested game ID", () => {
  assert.match(component, /game-day-guides\.json/);
  assert.match(component, /gameDayGuides\?\.games\?\.\[requestedGameId\] \?\? null/);
  assert.match(component, /<GameDayGuide guide=\{gameDayGuide\}/);
  assert.equal(gameDayGuides.schemaVersion, 1);
  assert.equal(gameDayGuides.games["1392216"].gameId, "1392216");
  assert.equal(gameDayGuides.games["1392244"], undefined);
  assert.doesNotMatch(guideComponent, /1392216|New England Patriots/);
  assert.match(guideComponent, /Game Day Guide coming soon\./);
});

test("Game Day Guide safely renders contextual external links and optional content", () => {
  assert.match(sourceLinkComponent, /parsed\.protocol === "http:" \|\| parsed\.protocol === "https:"/);
  assert.match(sourceLinkComponent, /target="_blank" rel="noopener noreferrer"/);
  assert.match(guideComponent, /specials\.length > 0/);
  assert.match(guideComponent, /weather &&/);
  assert.match(guideComponent, /typeof item\.price === "number"/);
  assert.match(guideComponent, /item\.official === true/);
  assert.doesNotMatch(guideComponent, /guide\?\.sources/);
});

test("ticket history defaults to a real seven-day data window", () => {
  assert.match(component, /function renderChart\(v,days=7,/);
  assert.match(component, /Date\.parse\(p\.observedAt\)>=end-days\*864e5/);
  assert.match(component, /\[7,14,30\]\.includes\(requestedRange\)\?requestedRange:7/);
  assert.match(component, /renderChart\(v,days,selected\)/);
});

test("game and tickets routes share the complete ticket explorer", () => {
  const intro = component.indexOf('section="intro"');
  const guides = component.indexOf('class="game-guide-cards"');
  const explorer = component.indexOf('id="ticket-price-explorer"');
  const supporting = component.indexOf('section="supporting"');
  const gameSupport = component.indexOf('class="server-game-support"');
  assert.ok(intro >= 0 && intro < guides && guides < explorer && explorer < supporting && supporting < gameSupport);
  assert.match(component, /<section id="ticket-price-explorer"/);
  assert.match(component, /<TicketPublisherContent[^>]+section="supporting"/);
  assert.match(component, /<script type="application\/json" id="ticket-game-models"/);
  for (const text of ["Choose a Seahawks game", "Days Until Kickoff", "Current Lowest", "Compare Ticket Providers", "Lowest Ticket Price History"]) {
    assert.match(component, new RegExp(text));
  }
  assert.doesNotMatch(component, /ServerTicketSummary/);
  assert.doesNotMatch(component, /serverTicketObservation/);
  for (const text of ["Current Ticket Observation", "Lowest observed price", "Ticket-data timestamp", "Provider coverage"]) {
    assert.doesNotMatch(component, new RegExp(text));
  }
});
