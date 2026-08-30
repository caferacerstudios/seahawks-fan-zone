import { mkdir, readFile, readdir, rename, rm, stat, writeFile, lstat, symlink } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, join } from "node:path";
import { normalizeSchedule } from "../../src/lib/schedule.mjs";
import { evaluateProviderEvent, sfzEventKey, validateMatchOverrides } from "../../src/lib/tickets/match.mjs";
import { configuredProviders } from "./providers.mjs";
import { eventSummaryAdapterPayload, listingAdapterPayload } from "./listing-adapter.mjs";
import { safeEventFilename, snapshotSchemaVersion, validateSnapshotFile } from "./snapshot.mjs";

const safeCode = (error) => /^[A-Z][A-Z0-9_]{1,63}$/.test(error?.code) ? error.code : "PROVIDER_FAILED";
const iso = (ms) => new Date(ms).toISOString();
const log = (sink, level, event, fields = {}) => sink(JSON.stringify({ level, event, ...fields }));
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
// Published snapshots are public HTTP data. Keep them owner-writable but
// readable by the unrelated Nginx container UID; credentials never enter this
// validated contract or output tree.
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });

async function acquireLock(lockDir, started, staleMs) {
  const ownerFile = join(lockDir, "owner.json");
  const owner = { pid: process.pid, hostname: hostname(), startedAt: iso(started) };
  try { await mkdir(lockDir); await writeJson(ownerFile, owner); return; } catch (error) { if (error.code !== "EEXIST") throw error; }
  let existing;
  try { existing = await json(ownerFile); } catch { throw Object.assign(new Error("Ticket sync lock metadata is missing or malformed."), { code: "SYNC_LOCK_UNKNOWN" }); }
  const age = started - Date.parse(existing.startedAt);
  if (!Number.isSafeInteger(existing.pid) || existing.pid < 1 || existing.hostname !== hostname() || !Number.isFinite(age) || age < 0) throw Object.assign(new Error("Ticket sync lock ownership cannot be verified."), { code: "SYNC_LOCK_UNKNOWN" });
  let live = false;
  try { process.kill(existing.pid, 0); live = true; } catch (failure) { if (failure.code === "EPERM") live = true; else if (failure.code !== "ESRCH") throw failure; }
  if (live || age <= staleMs) throw Object.assign(new Error("Another ticket sync is active."), { code: "SYNC_LOCKED" });
  await rm(lockDir, { recursive: true });
  await mkdir(lockDir);
  await writeJson(ownerFile, owner);
}

async function publishSnapshot(outputDir, stage, versionId, inject = async () => {}, retentionMs = 0, nowMs = Date.now()) {
  const parent = dirname(outputDir); const name = basename(outputDir);
  const versions = join(parent, `.${name}.versions`); const version = join(versions, versionId);
  await mkdir(versions, { recursive: true });
  await inject("before-version-rename");
  await rename(stage, version);
  await inject("after-version-rename");
  const pointer = join(parent, `.${name}.pointer-${process.pid}-${versionId}`);
  await symlink(join(`.${name}.versions`, versionId), pointer);
  await inject("after-pointer-create");
  try {
    const info = await lstat(outputDir);
    if (!info.isSymbolicLink()) {
      const legacy = join(versions, `legacy-${versionId}`);
      await rename(outputDir, legacy);
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await rename(pointer, outputDir);
  await inject("after-pointer-switch");
  const entries = (await readdir(versions, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => b.name.localeCompare(a.name));
  for (const [index, entry] of entries.entries()) {
    const path = join(versions, entry.name); const info = await stat(path);
    if (index >= 3 || (retentionMs >= 0 && nowMs - info.mtimeMs > retentionMs)) await rm(path, { recursive: true });
  }
}

function sanitizeNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes.map((note) => String(note).replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted]").replace(/\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/g, "[redacted]").replace(/[\r\n\t]+/g, " ").trim().slice(0, 240)).filter(Boolean).slice(0, 4);
}

function listing(raw, provider, event, now) {
  if (!String(raw.id || "").trim()) throw new TypeError("Listing id is required.");
  if (!Number.isSafeInteger(raw.priceCents) || raw.priceCents < 0) throw new TypeError("Invalid price.");
  if (raw.currency !== "USD") throw new TypeError("Unsupported currency.");
  for (const field of ["canonicalUrl", "affiliateUrl"]) {
    if (raw[field] == null && field === "affiliateUrl") continue;
    const url = new URL(raw[field]);
    if (url.protocol !== "https:" || !provider.adapter.allowedHosts.includes(url.hostname) || url.username || url.password) throw new TypeError("Invalid listing URL.");
    for (const key of url.searchParams.keys()) if (/token|key|secret|signature|auth/i.test(key)) throw new TypeError("Secret-like listing URL.");
  }
  const type = raw.productType === "parking" ? "parking" : raw.productType === "admission" ? "admission" : "other";
  return {
    provider: provider.id, providerListingId: String(raw.id || ""), productType: type,
    section: raw.section == null ? null : String(raw.section).slice(0, 80),
    row: raw.row == null ? null : String(raw.row).slice(0, 40),
    allowedQuantities: Array.isArray(raw.allowedQuantities) ? [...new Set(raw.allowedQuantities.filter((n) => Number.isSafeInteger(n) && n > 0 && n <= 20))].sort((a, b) => a - b) : [],
    currency: raw.currency, priceCents: raw.priceCents, feeStatus: ["all-in", "estimated", "unknown"].includes(raw.feeStatus) ? raw.feeStatus : "unknown",
    sanitizedNotes: sanitizeNotes(raw.notes), canonicalUrl: raw.canonicalUrl, affiliateUrl: raw.affiliateUrl ?? null,
    fetchedAt: now, expiresAt: iso(Date.parse(now) + provider.freshnessMs), stale: false, rankEligible: true,
  };
}

async function previousSnapshot(outputDir) {
  try {
    const status = await json(join(outputDir, "status.json"));
    const events = {};
    for (const name of await readdir(join(outputDir, "events"))) if (name.endsWith(".json")) { const value = await json(join(outputDir, "events", name)); events[value.event.eventKey] = value; }
    return { status, events };
  } catch { return { status: null, events: {} }; }
}

function priorProviderData(previous, providerId, nowMs, retentionMs, stale) {
  const status = previous.status?.providers?.find((item) => item.provider === providerId);
  if (!status?.lastSuccess || nowMs - Date.parse(status.lastSuccess) > retentionMs) return { status, events: [] };
  const events = Object.values(previous.events).map((event) => ({
    eventKey: event.event.eventKey,
    reference: event.providerReferences.find((ref) => ref.provider === providerId),
    listings: Object.values(event.listings).flat().filter((item) => item.provider === providerId).map((item) => ({ ...item, stale, rankEligible: !stale })),
  })).filter((event) => event.reference || event.listings.length);
  return { status, events };
}

export async function runTicketSync(config, options = {}) {
  const started = options.now?.getTime?.() ?? Date.now();
  const now = iso(started); const sink = options.log ?? console.log;
  const parent = dirname(config.outputDir); const name = basename(config.outputDir);
  const lockDir = join(parent, `.${name}.lock`); const stage = join(parent, `.${name}.tmp-${process.pid}-${started}`);
  await mkdir(parent, { recursive: true });
  await acquireLock(lockDir, started, config.lockStaleMs);
  try {
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      const path = join(parent, entry.name);
      if (entry.isDirectory() && entry.name.startsWith(`.${name}.tmp-`) && path !== stage) {
        const info = await stat(path); if (started - info.mtimeMs > config.lockStaleMs) await rm(path, { recursive: true });
      } else if (entry.isSymbolicLink() && entry.name.startsWith(`.${name}.pointer-`)) {
        const info = await lstat(path); if (started - info.mtimeMs > config.lockStaleMs) await rm(path);
      }
    }
    const [rawGames, overrides, previous] = await Promise.all([json(config.gamesFile), json(config.overridesFile).then(validateMatchOverrides), previousSnapshot(config.outputDir)]);
    if (!config.fixture && rawGames.fixture !== false) throw Object.assign(new Error("Non-fixture sync requires a schedule explicitly marked fixture:false."), { code: "SCHEDULE_FIXTURE" });
    const games = normalizeSchedule(rawGames).games.filter((game) => ["upcoming", "tbd", "postponed"].includes(game.state) && !game.bye && game.opponentConfirmed);
    const eventMap = new Map(games.map((game) => [sfzEventKey(game), { game, references: [], listings: [] }]));
    const providerStatuses = []; const allowedHosts = {}; let degraded = false;
    for (const provider of configuredProviders(config)) {
      allowedHosts[provider.id] = provider.adapter.allowedHosts;
      if (!provider.enabled) { const disabled = { provider: provider.id, mode: provider.mode, state: "disabled", errorCode: null, lastSuccess: null, lastAttempt: null, nextEligibleAttempt: null, matchedEventSummaries: 0, counts: { fresh: 0, stale: 0, rejected: 0, unmatched: 0 } }; providerStatuses.push(disabled); log(sink, "info", "provider_complete", { provider: provider.id, state: disabled.state, counts: disabled.counts }); continue; }
      const prior = previous.status?.providers?.find((item) => item.provider === provider.id);
      const eligibleAt = prior?.lastAttempt ? Date.parse(prior.lastAttempt) + provider.minRefreshMs : 0;
      if (eligibleAt > started) {
        const cached = priorProviderData(previous, provider.id, started, provider.retentionMs, false);
        for (const item of cached.events) { const target = eventMap.get(item.eventKey); if (target) { if (item.reference) target.references.push({ ...item.reference, state: "cached" }); target.listings.push(...item.listings); } }
        providerStatuses.push({ ...prior, state: "cached", nextEligibleAttempt: iso(eligibleAt), matchedEventSummaries: prior.matchedEventSummaries ?? cached.events.filter(({ reference }) => reference?.mode === "event-summary").length }); log(sink, "info", "provider_complete", { provider: provider.id, state: "cached", counts: prior.counts }); continue;
      }
      const counts = { fresh: 0, stale: 0, rejected: 0, unmatched: 0 }; const rejectedEvents = []; const unmatchedEvents = [];
      try {
        const rawPayload = await provider.adapter.sync({ fixture: config.fixture, fixtureFile: config.fixtureFile, apiKey: provider.apiKey, eventName: provider.eventName, eventDate: provider.eventDate, legacyEventId: provider.legacyEventId, timeoutMs: provider.timeoutMs, fetch: options.fetch });
        const payload = provider.mode === "listing-level" ? listingAdapterPayload(rawPayload) : eventSummaryAdapterPayload(rawPayload);
        const additions = [];
        for (const rawEvent of payload.events.slice(0, 100)) {
          const evaluated = games.map((game) => ({ game, result: evaluateProviderEvent(game, { ...rawEvent, provider: provider.id }, { provider: provider.id, overrides }) }));
          const candidates = evaluated.filter(({ result }) => result.publishable);
          if (candidates.length !== 1) {
            const reasons = [...new Set(evaluated.flatMap(({ result }) => result.reasons))];
            if (reasons.some((reason) => ["promotional-event-shell", "travel-package", "season-ticket-interest-list", "parking-event", "tailgate-package", "hospitality-only", "watch-party", "deposit-product"].includes(reason))) { counts.rejected += 1; rejectedEvents.push({ providerEventId: String(rawEvent.id ?? ""), name: String(rawEvent.name ?? "").slice(0, 160), reasons }); }
            else { counts.unmatched += 1; unmatchedEvents.push({ providerEventId: String(rawEvent.id ?? ""), name: String(rawEvent.name ?? "").slice(0, 160), reasons }); }
            continue;
          }
          const { game, result } = candidates[0];
          if (rawEvent.canonicalUrl != null) {
            const eventUrl = new URL(rawEvent.canonicalUrl);
            if (eventUrl.protocol !== "https:" || !provider.adapter.allowedHosts.includes(eventUrl.hostname) || eventUrl.username || eventUrl.password) throw Object.assign(new Error("Invalid provider event URL."), { code: "INVALID_RESPONSE" });
            for (const key of eventUrl.searchParams.keys()) if (/token|key|secret|signature|auth/i.test(key)) throw Object.assign(new Error("Secret-like provider event URL."), { code: "INVALID_RESPONSE" });
          }
          const addition = { eventKey: result.eventKey, reference: { provider: provider.id, providerEventId: String(rawEvent.id), mode: provider.mode, matchConfidence: result.confidence, canonicalUrl: rawEvent.canonicalUrl ?? null, state: "fresh", fetchedAt: now, expiresAt: iso(started + provider.freshnessMs), capabilities: provider.adapter.capabilities ?? null, summary: provider.mode === "event-summary" ? { name: rawEvent.name, venue: rawEvent.venue, startTimeUtc: rawEvent.startTimeUtc, localDate: rawEvent.localDate, localTime: rawEvent.localTime, timeZone: rawEvent.timeZone, eventStatus: rawEvent.eventStatus, currency: rawEvent.currency, priceRanges: [], inventoryDetailLevel: rawEvent.inventoryDetailLevel } : null }, listings: [] };
          if (provider.mode === "listing-level") for (const rawListing of (rawEvent.listings || []).slice(0, 2_000)) {
            try { addition.listings.push(listing(rawListing, provider, game, now)); counts.fresh += 1; } catch { counts.rejected += 1; }
          }
          additions.push(addition);
        }
        const ambiguousKeys = new Set(additions.map(({ eventKey }) => eventKey).filter((key, index, all) => all.indexOf(key) !== index));
        for (const addition of additions) {
          if (ambiguousKeys.has(addition.eventKey)) { counts.rejected += 1; rejectedEvents.push({ providerEventId: addition.reference.providerEventId, name: addition.reference.summary?.name ?? "", reasons: ["multiple-high-confidence-candidates"] }); continue; }
          const target = eventMap.get(addition.eventKey); target.references.push(addition.reference); target.listings.push(...addition.listings);
        }
        providerStatuses.push({ provider: provider.id, mode: provider.mode, state: "success", errorCode: null, lastSuccess: now, lastAttempt: now, nextEligibleAttempt: iso(started + provider.minRefreshMs), matchedEventSummaries: additions.filter((addition) => !ambiguousKeys.has(addition.eventKey) && addition.reference.mode === "event-summary").length, counts, rejectedEvents, unmatchedEvents });
        log(sink, "info", "provider_complete", { provider: provider.id, state: "success", counts });
      } catch (error) {
        degraded = true; const retained = priorProviderData(previous, provider.id, started, provider.retentionMs, true);
        for (const item of retained.events) { const target = eventMap.get(item.eventKey); if (target) { if (item.reference) target.references.push({ ...item.reference, state: "stale", expiresAt: iso(Date.parse(retained.status.lastSuccess) + provider.retentionMs) }); target.listings.push(...item.listings); counts.stale += item.listings.length; } }
        const hasRetained = retained.events.length > 0;
        providerStatuses.push({ provider: provider.id, mode: provider.mode, state: hasRetained ? "stale" : "error", errorCode: safeCode(error), lastSuccess: retained.status?.lastSuccess ?? null, lastAttempt: now, nextEligibleAttempt: iso(started + provider.minRefreshMs), matchedEventSummaries: retained.events.filter(({ reference }) => reference?.mode === "event-summary").length, counts });
        log(sink, "warn", "provider_complete", { provider: provider.id, state: hasRetained ? "stale" : "error", errorCode: safeCode(error), counts });
      }
    }
    await mkdir(join(stage, "events"), { recursive: true });
    const indexEvents = [];
    for (const [eventKey, data] of eventMap) {
      const game = data.game; const grouped = { admission: [], parking: [], other: [] };
      for (const item of data.listings) grouped[item.productType].push(item);
      const eventFile = { schemaVersion: snapshotSchemaVersion, generatedAt: now, event: { eventKey, gameId: game.id, season: game.season, phase: game.phase, week: game.week, startsAt: game.startsAt, date: game.date, homeAway: game.isHome ? "home" : "away", opponent: { abbreviation: game.opponent.abbreviation, name: game.opponent.full_name ?? game.opponent.name }, venue: game.venue }, providerReferences: data.references, listings: grouped };
      validateSnapshotFile(eventFile, "event", allowedHosts); const filename = safeEventFilename(eventKey); await writeJson(join(stage, "events", filename), eventFile);
      indexEvents.push({ eventKey, gameId: game.id, startsAt: game.startsAt, date: game.date, opponent: eventFile.event.opponent, homeAway: eventFile.event.homeAway, counts: { admission: grouped.admission.length, parking: grouped.parking.length, other: grouped.other.length }, eventFile: `events/${filename}` });
      log(sink, "info", "event_complete", { eventKey, admission: grouped.admission.length, parking: grouped.parking.length, other: grouped.other.length });
    }
    const durationMs = Math.max(0, (options.finishedAt?.getTime?.() ?? Date.now()) - started);
    const totals = providerStatuses.reduce((all, item) => { for (const key of Object.keys(all)) all[key] += item.counts[key]; return all; }, { fresh: 0, stale: 0, rejected: 0, unmatched: 0 });
    const outcome = degraded ? "degraded" : "success";
    const index = { schemaVersion: snapshotSchemaVersion, generatedAt: now, outcome, events: indexEvents };
    const status = { schemaVersion: snapshotSchemaVersion, generatedAt: now, outcome, environment: config.environment, fixture: config.fixture, scheduleFixture: rawGames.fixture === true, durationMs, totals, providers: providerStatuses };
    validateSnapshotFile(index, "index"); validateSnapshotFile(status, "status"); await writeJson(join(stage, "index.json"), index); await writeJson(join(stage, "status.json"), status);
    validateSnapshotFile(await json(join(stage, "index.json")), "index"); validateSnapshotFile(await json(join(stage, "status.json")), "status");
    for (const filename of await readdir(join(stage, "events"))) validateSnapshotFile(await json(join(stage, "events", filename)), "event", allowedHosts);
    await (options.injectFailure?.("after-validation") ?? Promise.resolve());
    const maximumRetentionMs = Math.max(0, ...Object.values(config.providers).map((provider) => provider.retentionMs));
    await publishSnapshot(config.outputDir, stage, `${started}-${process.pid}`, options.injectFailure, maximumRetentionMs, started);
    log(sink, "info", "sync_complete", { outcome, events: indexEvents.length, durationMs, ...totals });
    return status;
  } finally { await rm(stage, { recursive: true, force: true }); await rm(lockDir, { recursive: true, force: true }); }
}

export { acquireLock, publishSnapshot };
