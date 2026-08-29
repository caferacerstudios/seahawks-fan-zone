export const WATCHLIST_KEY = "sfz.ticket-watchlist.v1";

const cleanToken = (value, maximum = 100) => typeof value === "string" && value.trim() && value.length <= maximum ? value.trim() : null;

export function sanitizeWatchlist(value, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const game = cleanToken(value.game); const zone = cleanToken(value.zone);
  const quantity = Number(value.quantity); const budget = Number(value.budget);
  if (!game || !zone || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 8 || !Number.isSafeInteger(budget) || budget < 1 || budget > 1_000_000) return null;
  if (options.games && !options.games.includes(game)) return null;
  if (options.zones && zone !== "all" && !options.zones.includes(zone)) return null;
  return { game, quantity, budget, zone };
}

export function readWatchlist(storage, options) {
  try { return sanitizeWatchlist(JSON.parse(storage.getItem(WATCHLIST_KEY)), options); } catch { return null; }
}

export function writeWatchlist(storage, value, options) {
  const clean = sanitizeWatchlist(value, options);
  if (!clean) return false;
  try { storage.setItem(WATCHLIST_KEY, JSON.stringify(clean)); return true; } catch { return false; }
}

export function resetWatchlist(storage) {
  try { storage.removeItem(WATCHLIST_KEY); return true; } catch { return false; }
}
