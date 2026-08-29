const SORTS = new Set(["lowest_total", "lowest_per_ticket", "best_zone_within_budget", "official_first", "most_recent"]);
const LOCATIONS = new Set(["all", "home", "away"]);
const SOURCES = new Set(["both", "official", "resale"]);
const MODES = new Set(["admission", "parking"]);

const one = (params, name) => params.getAll(name).at(-1) ?? null;
const member = (value, allowed, fallback) => allowed.has(String(value ?? "").toLowerCase()) ? String(value).toLowerCase() : fallback;
const token = (value, allowed, fallback = "all") => allowed.has(String(value ?? "")) ? String(value) : fallback;
const integer = (value, minimum, maximum, fallback) => {
  if (!/^\d+$/.test(String(value ?? ""))) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
};
const boolean = (value, fallback) => value === "true" ? true : value === "false" ? false : fallback;

export function sanitizeTicketState(input, options = {}) {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(input);
  const games = new Set(options.games ?? []);
  const opponents = new Set(options.opponents ?? []);
  const zones = new Set(options.zones ?? []);
  const providers = new Set(options.providers ?? []);
  const deliveries = new Set(options.deliveries ?? []);
  const defaultGame = options.defaultGame ?? [...games][0] ?? "";
  const maximum = one(params, "maxTotal");
  return {
    game: token(one(params, "game"), games, defaultGame),
    quantity: integer(one(params, "quantity"), 1, 8, 2),
    maxTotal: maximum === null || maximum === "" ? null : integer(maximum, 1, 1000000, null),
    homeAway: member(one(params, "homeAway"), LOCATIONS, "all"),
    opponent: token(one(params, "opponent"), opponents),
    zone: token(one(params, "zone"), zones),
    source: member(one(params, "source"), SOURCES, "both"),
    allInOnly: boolean(one(params, "allInOnly"), true),
    provider: token(one(params, "provider"), providers),
    sort: member(one(params, "sort"), SORTS, "lowest_total"),
    accessible: boolean(one(params, "accessible"), false),
    delivery: token(one(params, "delivery"), deliveries),
    mode: member(one(params, "mode"), MODES, "admission"),
  };
}

export function ticketStateParams(state) {
  const params = new URLSearchParams();
  if (state.game) params.set("game", state.game);
  if (state.quantity !== 2) params.set("quantity", String(state.quantity));
  if (state.maxTotal !== null) params.set("maxTotal", String(state.maxTotal));
  if (state.homeAway !== "all") params.set("homeAway", state.homeAway);
  if (state.opponent !== "all") params.set("opponent", state.opponent);
  if (state.zone !== "all") params.set("zone", state.zone);
  if (state.source !== "both") params.set("source", state.source);
  if (!state.allInOnly) params.set("allInOnly", "false");
  if (state.provider !== "all") params.set("provider", state.provider);
  if (state.sort !== "lowest_total") params.set("sort", state.sort);
  if (state.accessible) params.set("accessible", "true");
  if (state.delivery !== "all") params.set("delivery", state.delivery);
  if (state.mode !== "admission") params.set("mode", state.mode);
  return params;
}
