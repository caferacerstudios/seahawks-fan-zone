import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compactHistory } from "../../src/lib/tickets/price-history.mjs";

const readJson = async (path, fallback = undefined) => {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (fallback !== undefined && error.code === "ENOENT") return fallback; throw error; }
};

export async function compactHistoryFile({ observationFile, historyFile, termsFile, requestedRetentionDays, removedProviders = [], now = new Date() }) {
  const [observation, history, providerTerms] = await Promise.all([readJson(observationFile), readJson(historyFile, null), readJson(termsFile)]);
  const compacted = compactHistory(history, observation, { now: now.toISOString(), requestedRetentionDays, providerTerms, removedProviders });
  await mkdir(dirname(historyFile), { recursive: true });
  const temporary = `${historyFile}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(compacted, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, historyFile);
  return compacted;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const [observationFile, historyFile, termsFile, days] = process.argv.slice(2);
  if (!observationFile || !historyFile || !termsFile || !/^\d+$/.test(days || "")) {
    console.error("Usage: node scripts/tickets/compact-history.mjs <observation.json> <history.json> <provider-terms.json> <retention-days>");
    process.exitCode = 2;
  } else {
    compactHistoryFile({ observationFile: resolve(observationFile), historyFile: resolve(historyFile), termsFile: resolve(termsFile), requestedRetentionDays: Number(days) })
      .then((history) => console.log(JSON.stringify({ eventId: history.eventId, compactedAt: history.compactedAt, retentionDays: history.retentionDays, points: history.points.length })))
      .catch((error) => { console.error(error.code || "HISTORY_COMPACTION_FAILED"); process.exitCode = 1; });
  }
}
