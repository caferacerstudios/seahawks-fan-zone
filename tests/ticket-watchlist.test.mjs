import test from "node:test";
import assert from "node:assert/strict";
import { readWatchlist, resetWatchlist, sanitizeWatchlist, WATCHLIST_KEY, writeWatchlist } from "../src/lib/tickets/watchlist.mjs";

const options = { games: ["game-1"], zones: ["upper"] };
const memoryStorage = (initial = {}) => ({ values: { ...initial }, getItem(key) { return this.values[key] ?? null; }, setItem(key, value) { this.values[key] = value; }, removeItem(key) { delete this.values[key]; } });

test("watchlist accepts only game, quantity, budget, and zone", () => {
  assert.deepEqual(sanitizeWatchlist({ game: "game-1", quantity: 2, budget: 300, zone: "upper", email: "private@example.com" }, options), { game: "game-1", quantity: 2, budget: 300, zone: "upper" });
});

test("invalid and malformed localStorage data is ignored", () => {
  for (const value of ["{", "null", "[]", JSON.stringify({ game: "other", quantity: 0, budget: -1, zone: "bad" })]) assert.equal(readWatchlist(memoryStorage({ [WATCHLIST_KEY]: value }), options), null);
});

test("watchlist writes locally and has a clear reset", () => {
  const storage = memoryStorage();
  assert.equal(writeWatchlist(storage, { game: "game-1", quantity: 2, budget: 300, zone: "upper" }, options), true);
  assert.deepEqual(readWatchlist(storage, options), { game: "game-1", quantity: 2, budget: 300, zone: "upper" });
  assert.equal(resetWatchlist(storage), true); assert.equal(storage.getItem(WATCHLIST_KEY), null);
});
