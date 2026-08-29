import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeTicketState, ticketStateParams } from "../src/lib/tickets/ui-state.mjs";

const options = {
  games: ["game-1", "game-2"], defaultGame: "game-1", opponents: ["SF", "MIA"],
  zones: ["upper-bowl"], providers: ["market-a"], deliveries: ["mobile"],
};

test("ticket query state sanitizes invalid and repeated values", () => {
  const state = sanitizeTicketState("game=bad&quantity=9&quantity=2&maxTotal=-4&homeAway=somewhere&allInOnly=maybe&sort=commission", options);
  assert.deepEqual(state, {
    game: "game-1", quantity: 2, maxTotal: null, homeAway: "all", opponent: "all",
    zone: "all", source: "both", allInOnly: true, provider: "all", sort: "lowest_total",
    accessible: false, delivery: "all", mode: "admission",
  });
});

test("ticket query state accepts every shareable filter and round trips canonical values", () => {
  const query = "game=game-2&quantity=4&maxTotal=500&homeAway=away&opponent=MIA&zone=upper-bowl&source=resale&allInOnly=false&provider=market-a&sort=most_recent&accessible=true&delivery=mobile&mode=parking";
  const state = sanitizeTicketState(query, options);
  assert.equal(ticketStateParams(state).toString(), query);
});
