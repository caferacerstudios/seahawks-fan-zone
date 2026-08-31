import { mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { validateMarketObservation } from "../../src/lib/tickets/market-observation.mjs";

export const EVENTSPY_HISTORY_RETENTION_MS = 45 * 86400_000;
export function validateEventSpyHistory(value, { now = Date.now() } = {}) {
  if (value?.schemaVersion !== "1.0.0" || value.source !== "eventspy" || value.gameId !== "1392216" || !Array.isArray(value.observations) || value.observations.length > 100) throw new TypeError("Invalid EventSpy history.");
  if (Object.keys(value).sort().join(",") !== "gameId,generatedAt,observations,schemaVersion,source" || !Number.isFinite(Date.parse(value.generatedAt)) || Date.parse(value.generatedAt) > now + 60_000) throw new TypeError("Invalid EventSpy history metadata.");
  let prior = -Infinity; const keys = new Set();
  for (const item of value.observations) {
    validateMarketObservation(item, { now }); const at = Date.parse(item.seriesPoint.observedAt);
    if (at < prior) throw new TypeError("EventSpy history is not sorted."); prior = at;
    const key = `${item.seriesPoint.observedAt}:${JSON.stringify(item.seriesPoint.marketplaces)}`;
    if (keys.has(key)) throw new TypeError("Duplicate EventSpy observation."); keys.add(key);
  }
  return value;
}
export function mergeEventSpyHistory(previous, observation, now = Date.now()) {
  validateMarketObservation(observation, { now });
  const retained = (previous?.observations ?? []).filter((item) => Date.parse(item.seriesPoint.observedAt) >= now - EVENTSPY_HISTORY_RETENTION_MS);
  const byTimestamp = new Map(retained.map((item) => [item.seriesPoint.observedAt, item]));
  const existing = byTimestamp.get(observation.seriesPoint.observedAt);
  if (existing) {
    const merged = structuredClone(observation);
    for (const market of merged.seriesPoint.marketplaces) if (market.lowestPriceCents === null) {
      const old = existing.seriesPoint.marketplaces.find((item) => item.marketplace === market.marketplace);
      if (old?.lowestPriceCents != null) Object.assign(market, old);
    }
    byTimestamp.set(observation.seriesPoint.observedAt, merged);
  } else byTimestamp.set(observation.seriesPoint.observedAt, observation);
  return validateEventSpyHistory({ schemaVersion: "1.0.0", source: "eventspy", gameId: "1392216", generatedAt: new Date(now).toISOString(), observations: [...byTimestamp.values()].sort((a, b) => Date.parse(a.seriesPoint.observedAt) - Date.parse(b.seriesPoint.observedAt)) }, { now });
}
export async function readEventSpyHistory(current, { now = Date.now() } = {}) {
  return validateEventSpyHistory(JSON.parse(await readFile(join(current, "history.json"), "utf8")), { now });
}
export async function publishEventSpyHistory(current, observation, { now = Date.now(), injectFailure = async () => {} } = {}) {
  let previous = null; try { previous = await readEventSpyHistory(current, { now }); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const history = mergeEventSpyHistory(previous, observation, now), parent = dirname(current), name = basename(current), versions = join(parent, `.${name}.versions`), id = `${now}-${process.pid}`, stage = join(parent, `.${name}.stage-${id}`);
  await mkdir(stage, { recursive: true }); await writeFile(join(stage, "history.json"), `${JSON.stringify(history, null, 2)}\n`, { mode: 0o644 });
  validateEventSpyHistory(JSON.parse(await readFile(join(stage, "history.json"), "utf8")), { now }); await injectFailure("validated");
  await mkdir(versions, { recursive: true }); await rename(stage, join(versions, id));
  const pointer = join(parent, `.${name}.pointer-${id}`); await symlink(join(`.${name}.versions`, id), pointer); await injectFailure("before-pointer");
  try { await rename(pointer, current); } catch (error) { if (error.code !== "ENOTEMPTY" && error.code !== "EEXIST") throw error; const old = join(versions, `legacy-${id}`); await rename(current, old); await rename(pointer, current); }
  const entries = (await readdir(versions, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => b.name.localeCompare(a.name));
  for (const entry of entries.slice(3)) await rm(join(versions, entry.name), { recursive: true });
  return history;
}
