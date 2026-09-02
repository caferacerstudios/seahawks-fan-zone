import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EVENTSPY_COVERAGE } from "../src/lib/tickets/eventspy-coverage.mjs";
import { gameDayPageModel } from "../src/lib/game-details.mjs";
import { currentProviderQuotes } from "../src/lib/tickets/provider-quotes.mjs";

const schedule = JSON.parse(await readFile(new URL("../src/data/nfl/seahawks.json", import.meta.url), "utf8"));
const component = await readFile(new URL("../src/components/GameDayPage.astro", import.meta.url), "utf8");
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
  assert.match(ticketRoute, /GameDayPage/);
});

test("provider quotes remain price sorted with unavailable providers last", () => {
  const quotes = currentProviderQuotes([{ observedAt: "2026-09-01T22:15:00Z", ticketmasterCents: 12000, stubhubCents: null, vividseatsCents: 9500, seatgeekCents: 11000 }]);
  assert.deepEqual(quotes.map(({ provider }) => provider), ["vividseats", "seatgeek", "ticketmaster", "stubhub"]);
  assert.equal(quotes[0].isLowest, true);
});

test("shared page omits diagnostic football placeholders and retains intentional future features", () => {
  for (const text of ["NFC West context unavailable", "Recent form unavailable", "Opponent leaders unavailable", "Official links not posted", "Record unavailable"]) {
    assert.doesNotMatch(component, new RegExp(text));
  }
  assert.match(component, /Where to Watch/);
  assert.match(component, /Game Day Guide/);
  assert.match(component, /Ticket tracking is not available for this game yet/);
  assert.match(component, /Historical ticket-market information for this completed game/);
});
