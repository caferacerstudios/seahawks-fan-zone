const NON_INDEXABLE_STATUS = /\b(cancel(?:led|ed)?|invalid|void|abandon(?:ed)?|postponed)\b/i;
const ERROR_OUTPUT = /\b(generator error|generation failed|unable to generate|error generating)\b/i;

export const INDEX_ROBOTS = "index, follow";
export const NOINDEX_ROBOTS = "noindex, follow";

export const NAMED_PLAYER_CANONICALS = Object.freeze(new Map([
  ["jaxon smith njigba", "jaxon-smith-njigba"],
  ["derick hall", "derick-hall"],
  ["devon witherspoon", "devon-witherspoon"],
  ["leonard williams", "leonard-williams"],
]));

const text = (value) => typeof value === "string" ? value.trim() : "";
const normalizedName = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const teamAbbr = (team) => text(team?.abbreviation ?? team?.abbr).toUpperCase();

export function preferredPlayerId(routeId, playerName) {
  return NAMED_PLAYER_CANONICALS.get(normalizedName(playerName)) ?? String(routeId);
}

export function gameIndexability({ game, id, opponentName, canonicalPath } = {}) {
  const gameId = text(String(id ?? game?.id ?? game?.game_id ?? ""));
  const status = text(game?.status ?? game?.state);
  const home = teamAbbr(game?.home_team);
  const away = teamAbbr(game?.visitor_team);
  const opponent = text(opponentName);
  const date = text(game?.startsAt ?? game?.date);
  const reasons = [];
  if (!gameId || game?.bye === true || game?.state === "bye") reasons.push("invalid game identity");
  if (home !== "SEA" && away !== "SEA") reasons.push("not a Seahawks game");
  if (!opponent || opponent.toUpperCase() === "SEA") reasons.push("unresolved opponent");
  if (!date || !Number.isFinite(Date.parse(date))) reasons.push("unresolved game date");
  if (NON_INDEXABLE_STATUS.test(status)) reasons.push("non-indexable game status");
  if (canonicalPath !== `/games/${encodeURIComponent(gameId)}`) reasons.push("non-canonical route");
  return { indexable: reasons.length === 0, reasons };
}

export function playerIndexability({ routeId, canonicalId, identity, biography, rosterStatus, historicallyLabeled = false, usefulSections = [], generatorError = null } = {}) {
  const bio = text(biography);
  const reasons = [];
  if (!text(identity) || identity === "Unknown" || identity === "Player") reasons.push("unresolved player identity");
  if (!bio || bio.length < 80) reasons.push("missing meaningful biography or career context");
  if (!text(rosterStatus) && !historicallyLabeled) reasons.push("missing current or historical roster status");
  if (!usefulSections.some(Boolean)) reasons.push("missing player-specific data section");
  if (generatorError || ERROR_OUTPUT.test(bio)) reasons.push("generator-error output");
  if (String(routeId) !== String(canonicalId)) reasons.push("alternate player alias");
  return { indexable: reasons.length === 0, reasons };
}

export function pageRobots(decision) {
  return decision?.indexable ? INDEX_ROBOTS : NOINDEX_ROBOTS;
}

export function latestMaterialDate(values) {
  const dates = values.flat().filter(Boolean).map((value) => new Date(value)).filter((date) => Number.isFinite(date.getTime()));
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString() : undefined;
}
