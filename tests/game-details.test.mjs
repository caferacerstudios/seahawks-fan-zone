import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EVENTSPY_COVERAGE } from "../src/lib/tickets/eventspy-coverage.mjs";
import { gameDetails, ticketGameModels } from "../src/lib/game-details.mjs";

const schedule = JSON.parse(await readFile(new URL("../src/data/nfl/seahawks.json", import.meta.url), "utf8"));

test("ticket game 1392216 resolves through the authoritative game ID", () => {
  const details = gameDetails(schedule, "1392216", { coverage: EVENTSPY_COVERAGE });
  assert.equal(details.id, "1392216");
  assert.equal(details.opponentName, "New England Patriots");
  assert.equal(details.opponentAbbr, "NE");
  assert.equal(details.home, true);
});

test("ticket models preserve the shared game ID and ticket navigation", () => {
  const models = ticketGameModels(schedule, EVENTSPY_COVERAGE);
  assert.equal(models["1392216"].id, "1392216");
  assert.equal(models["1392216"].previousId, null);
  assert.equal(models["1392216"].nextId, "1392244");
  assert.equal(models["1392244"].previousId, "1392216");
});

test("missing optional football data stays nullable and invalid IDs fail cleanly", () => {
  const details = gameDetails(schedule, "1392216", { coverage: EVENTSPY_COVERAGE });
  assert.equal(details.seaScore, null);
  assert.equal(details.opponentScore, null);
  assert.equal(gameDetails(schedule, "not-a-game", { coverage: EVENTSPY_COVERAGE }), null);
});
