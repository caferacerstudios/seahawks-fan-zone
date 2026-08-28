import type { APIRoute } from "astro";
import { absoluteUrl, PUBLIC_PAGES } from "../lib/seo";

const escapeXml = (value: unknown) => String(value).replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]!);
const validDate = (value: unknown) => value && Number.isFinite(new Date(String(value)).getTime()) ? new Date(String(value)).toISOString() : undefined;

export const GET: APIRoute = async () => {
  let nfl: any = null;
  let recaps: any = null;
  let profiles: any = null;
  let players: any = null;
  let standings: any = null;
  try { nfl = (await import("../data/nfl/seahawks.json")).default; } catch {}
  try { recaps = (await import("../data/nfl/gameRecaps.json")).default; } catch {}
  try { profiles = (await import("../data/nfl/playerProfiles.json")).default; } catch {}
  try { players = (await import("../data/nfl/players.json")).default; } catch {}
  try { standings = (await import("../data/nfl/standings.json")).default; } catch {}

  const gameId = (game: any) => game?.id ?? game?.game_id;
  const games = [...(nfl?.gamesPreseason ?? []), ...(nfl?.gamesRegular ?? []), ...(nfl?.gamesPostseason ?? []), ...(nfl?.games ?? [])]
    .filter((game, index, all) => gameId(game) != null && all.findIndex((other) => String(gameId(other)) === String(gameId(game))) === index)
    .filter((game) => !/scheduled|tbd|postponed|cancelled/i.test(String(game?.status ?? "")) || recaps?.recaps?.[String(gameId(game))]);
  const roster = Array.isArray(players?.data) ? players.data : Array.isArray(players?.players) ? players.players : Array.isArray(players) ? players : [];
  const hasRecaps = Object.values(recaps?.recaps ?? {}).some((recap: any) => String(recap?.summary ?? recap?.excerpt ?? recap?.text ?? "").trim());
  const hasStandings = Boolean((Array.isArray(standings?.data) && standings.data.length) || (Array.isArray(standings?.teams) && standings.teams.length));
  const includeStatic = (path: string) => {
    if (path === "/weekly-recap") return hasRecaps;
    if (path === "/schedule") return games.length > 0;
    if (path === "/players") return roster.length > 0 || (nfl?.playerSeasonStats?.length ?? 0) > 0;
    if (path === "/team") return Boolean(nfl?.teamSeasonStats);
    if (path === "/standings") return hasStandings;
    return true;
  };
  const playerIds = new Set([
    ...roster.map((player) => player?.id ?? player?.player_id ?? player?.player?.id),
    ...(nfl?.playerSeasonStats ?? []).map((player: any) => player?.player?.id ?? player?.player_id),
  ].filter((id) => id != null).map(String));
  const pages = [
    ...PUBLIC_PAGES.filter((page) => includeStatic(page.canonicalPath)).map((page) => ({ loc: page.canonicalPath, lastmod: validDate(page.lastModified ?? (["/", "/schedule", "/weekly-recap", "/standings", "/team", "/players"].includes(page.canonicalPath) ? nfl?.updatedAt : undefined)) })),
    ...games.map((game) => ({ loc: `/games/${encodeURIComponent(String(gameId(game)))}`, lastmod: validDate(recaps?.recaps?.[String(gameId(game))]?.updatedAt ?? recaps?.updatedAt ?? nfl?.updatedAt) })),
    ...[...playerIds].map((id) => ({ loc: `/players/${encodeURIComponent(id)}`, lastmod: validDate(profiles?.updatedAt ?? nfl?.updatedAt) })),
  ];
  const urls = pages.map(({ loc, lastmod }) => `<url><loc>${escapeXml(absoluteUrl(loc))}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ""}</url>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
