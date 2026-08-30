import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hostname, tmpdir } from "node:os";
import { loadConfig } from "../scripts/tickets/config.mjs";
import { acquireLock, runTicketSync } from "../scripts/tickets/pipeline.mjs";
import { matchTicketmasterEvent, normalizeTicketmasterEvent, providerRegistry } from "../scripts/tickets/providers.mjs";
import { evaluateProviderEvent, normalizeNflTeam, sfzEventKey } from "../src/lib/tickets/match.mjs";
import { games as realSchedule, legitimateEvents, providerEvents, rejectedEvents } from "./fixtures/ticketmaster-discovery.mjs";

test("Ticketmaster is approved only as a credentialed event-summary source", () => {
  const adapter = providerRegistry().ticketmaster;
  assert.equal(adapter.approvalStatus, "approved");
  assert.equal(adapter.credentialEnv, "TICKETMASTER_API_KEY");
  assert.deepEqual(adapter.capabilities, { supportsSeatListings: false, supportsResaleListings: false, supportsPriceRange: true, accessTier: "discovery" });
  assert.throws(() => loadConfig({ TICKETS_PROVIDERS_JSON: JSON.stringify({ ticketmaster: { enabled: true, mode: "event-summary" } }) }, root), /requires TICKETMASTER_API_KEY/);
});

test("Ticketmaster normalization preserves genuine summary capability without listings", () => {
  const event = normalizeTicketmasterEvent({ id: "tm-1", name: "Seattle Seahawks vs. New England Patriots", url: "https://www.ticketmaster.com/event/tm-1", dates: { start: { dateTime: "2026-09-01T00:00:00Z", localDate: "2026-08-31", localTime: "17:00:00" }, timezone: "America/Los_Angeles", status: { code: "onsale" } }, _embedded: { attractions: [{ id: "K8vZ9171oU7", name: "Seattle Seahawks" }], venues: [{ name: "Lumen Field", city: { name: "Seattle" }, state: { stateCode: "WA" } }] }, classifications: [{ segment: { name: "Sports" }, genre: { name: "Football" } }] });
  assert.equal(event.id, "tm-1"); assert.deepEqual(event.priceRanges, []); assert.equal(event.currency, null);
  assert.equal(event.inventoryDetailLevel, "price_range");
  assert.equal(Object.hasOwn(event, "listings"), false);
  assert.equal(Object.hasOwn(event, "attractions"), false);
});

const discoveryEvent = (overrides = {}) => ({
  id: "vvG1HZkABC123", name: "Seattle Seahawks vs. New England Patriots",
  url: "https://www.ticketmaster.com/event/0F006482E67E7496",
  dates: { start: { dateTime: "2026-09-10T00:20:00Z", localDate: "2026-09-09", localTime: "17:20:00" }, timezone: "America/Los_Angeles", status: { code: "onsale" } },
  priceRanges: [{ currency: "USD", min: 85.5, max: 640 }],
  _embedded: { venues: [{ name: "Lumen Field", city: { name: "Seattle" }, state: { stateCode: "WA" } }] },
  ...overrides,
});

test("Ticketmaster matches name and date, verifies the legacy URL ID, and saves the universal ID", async () => {
  const adapter = providerRegistry().ticketmaster;
  let requested;
  const result = await adapter.sync({ apiKey: "test-key", eventName: "Seattle Seahawks vs. New England Patriots", eventDate: "2026-09-09", legacyEventId: "0F006482E67E7496", timeoutMs: 100, fetch: async (url) => { requested = url; return { ok: true, json: async () => ({ _embedded: { events: [discoveryEvent()] } }) }; } });
  assert.equal(requested.pathname, "/discovery/v2/events.json");
  assert.equal(requested.searchParams.get("keyword"), "Seattle Seahawks vs. New England Patriots");
  assert.match(requested.searchParams.get("localStartDateTime"), /^2026-09-09/);
  assert.equal(result.events[0].id, "vvG1HZkABC123");
  assert.equal(result.events[0].canonicalUrl, "https://www.ticketmaster.com/event/0F006482E67E7496");
});

test("Ticketmaster parses valid ranges and does not manufacture ticket rows", () => {
  const normalized = normalizeTicketmasterEvent(discoveryEvent());
  assert.deepEqual(normalized.priceRanges, [{ currency: "USD", min: 85.5, max: 640 }]);
  assert.equal(normalized.currency, "USD");
  assert.equal(Object.hasOwn(normalized, "listings"), false);
  assert.equal(Object.hasOwn(normalized, "section"), false);
});

test("Ticketmaster preserves a genuinely missing priceRanges value as no range", () => {
  const normalized = normalizeTicketmasterEvent(discoveryEvent({ priceRanges: undefined }));
  assert.deepEqual(normalized.priceRanges, []);
  assert.equal(normalized.currency, null);
});

test("Ticketmaster reports authentication and rate-limit failures with bounded codes", async () => {
  const adapter = providerRegistry().ticketmaster;
  const context = { apiKey: "test-key", eventName: "Seattle Seahawks vs. New England Patriots", eventDate: "2026-09-09", legacyEventId: "0F006482E67E7496", timeoutMs: 100 };
  await assert.rejects(adapter.sync({ ...context, fetch: async () => ({ ok: false, status: 401 }) }), { code: "HTTP_401" });
  await assert.rejects(adapter.sync({ ...context, fetch: async () => ({ ok: false, status: 429 }) }), { code: "HTTP_429" });
});

test("multiple similar Seahawks events match only the verified legacy URL", () => {
  const similar = [
    discoveryEvent({ id: "wrong-date", dates: { start: { localDate: "2026-09-10" } } }),
    discoveryEvent({ id: "wrong-opponent", name: "Seattle Seahawks vs. New York Patriots" }),
    discoveryEvent({ id: "wrong-url", url: "https://www.ticketmaster.com/event/WRONG" }),
    discoveryEvent(),
  ];
  assert.equal(matchTicketmasterEvent(similar, { eventName: "Seattle Seahawks vs. New England Patriots", eventDate: "2026-09-09", legacyEventId: "0F006482E67E7496" }).id, "vvG1HZkABC123");
});

test("all canonical NFL aliases used by the schedule normalize deterministically", () => {
  const aliases = {
    SEA: "Seattle Seahawks", ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens",
    BUF: "Buffalo Bills", CAR: "Carolina Panthers", CHI: "Chicago Bears", CIN: "Cincinnati Bengals",
    CLE: "Cleveland Browns", DAL: "Dallas Cowboys", DEN: "Denver Broncos", DET: "Detroit Lions",
    GB: "Green Bay Packers", HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars",
    KC: "Kansas City Chiefs", LV: "Las Vegas Raiders", LAC: "Los Angeles Chargers", LAR: "Los Angeles Rams",
    MIA: "Miami Dolphins", MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints",
    NYG: "New York Giants", NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers",
    SF: "San Francisco 49ers", TB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans", WAS: "Washington Commanders",
  };
  for (const [abbreviation, name] of Object.entries(aliases)) {
    assert.equal(normalizeNflTeam(abbreviation), abbreviation);
    assert.equal(normalizeNflTeam({ id: `tm-${abbreviation}`, name }), abbreviation);
  }
});

test("realistic normalized Ticketmaster Discovery events match the canonical schedule", (t) => {
  const matched = []; const rejected = []; const unmatched = [];
  for (const event of providerEvents) {
    const evaluations = realSchedule.map((game) => ({ game, result: evaluateProviderEvent(game, event) }));
    const publishable = evaluations.filter(({ result }) => result.publishable);
    if (publishable.length === 1) matched.push({ event, ...publishable[0] });
    else {
      const reasons = [...new Set(evaluations.flatMap(({ result }) => result.reasons))];
      if (rejectedEvents.includes(event)) rejected.push({ event, reasons });
      else unmatched.push({ event, reasons });
    }
  }

  assert.equal(matched.length, 16);
  assert.equal(rejected.length, 3);
  assert.equal(unmatched.length, 0);
  assert.deepEqual(realSchedule.filter((game) => !matched.some(({ game: found }) => found === game)).map(sfzEventKey), ["sea:2026-regular-17-away-lar"]);
  for (const { event, game, result } of matched) t.diagnostic(`${event.name} -> ${result.eventKey} -> ${game.opponent.abbreviation} -> ${game.isHome ? "home" : "away"} -> ${event.localDate} -> ${game.date} -> ${result.confidence}`);
  for (const { event, reasons } of rejected) t.diagnostic(`${event.name} -> rejected -> ${reasons.filter((reason) => ["promotional-event-shell", "travel-package", "season-ticket-interest-list"].includes(reason)).join(",")}`);
});

test("provider team arrays accept names and normalized attraction objects without weakening order", () => {
  const event = legitimateEvents[0]; const game = realSchedule[0];
  assert.equal(evaluateProviderEvent(game, { ...event, teams: event.teams.map(({ name }) => name), attractions: [] }).publishable, true);
  assert.equal(evaluateProviderEvent(game, event).evidence.homeAway, true);
  assert.equal(evaluateProviderEvent({ ...game, homeTeam: game.awayTeam, awayTeam: game.homeTeam }, event).publishable, false);
});

test("non-admission product shells remain rejected even with exact game metadata", () => {
  const event = legitimateEvents[0]; const game = realSchedule[0];
  for (const [suffix, reason] of [
    ["Parking Only", "parking-event"], ["Official Tailgate", "tailgate-package"],
    ["Travel Package", "travel-package"], ["Hospitality Only", "hospitality-only"],
    ["Deposit", "deposit-product"], ["Watch Party", "watch-party"],
  ]) assert.ok(evaluateProviderEvent(game, { ...event, id: `shell-${reason}`, name: `${event.name} | ${suffix}` }).reasons.includes(reason));
});

test("Ticketmaster UTC rollovers use the provider local game date", () => {
  const ids = ["vvG1HZ_F5JLE3p", "tm-den-away", "tm-kc-home", "tm-chi-home", "tm-dal-home", "tm-lar-home"];
  for (const id of ids) {
    const event = legitimateEvents.find((item) => item.id === id);
    const game = realSchedule.find((item) => item.date === event.localDate && [item.homeTeam, item.awayTeam].some((team) => normalizeNflTeam(team) === normalizeNflTeam(event.teams.find((team) => normalizeNflTeam(team) !== "SEA"))));
    const result = evaluateProviderEvent(game, event);
    assert.notEqual(event.startTimeUtc.slice(0, 10), event.localDate);
    assert.equal(result.evidence.date, true);
    assert.equal(result.publishable, true);
  }
});

const root = new URL("..", import.meta.url).pathname;
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("StubHub remains fail-closed while its rights summary is pending", async () => {
  const adapter = providerRegistry().stubhub;
  assert.equal(adapter.approvalStatus, "pending");
  assert.equal(adapter.credentialEnv, null);
  assert.deepEqual(adapter.allowedHosts, []);
  assert.throws(
    () => loadConfig({ TICKETS_PROVIDERS_JSON: JSON.stringify({ stubhub: { enabled: true, mode: "listing-level" } }) }, root),
    /cannot be enabled until its operator-reviewed rights summary is complete/,
  );
  await assert.rejects(adapter.sync({}), { code: "RIGHTS_APPROVAL_REQUIRED" });
});

test("StubHub is reported disabled by default and makes no adapter call", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "sfz-ticket-stubhub-disabled-"));
  try {
    const config = loadConfig({ TICKETS_FIXTURE: "true", TICKETS_OUTPUT_DIR: join(temporary, "snapshot") }, root);
    const status = await runTicketSync(config, { now: new Date("2026-08-29T12:00:00Z"), log: () => {} });
    const stubhub = status.providers.find(({ provider }) => provider === "stubhub");
    assert.equal(stubhub.state, "disabled");
    assert.equal(stubhub.lastAttempt, null);
    assert.deepEqual(stubhub.counts, { fresh: 0, stale: 0, rejected: 0, unmatched: 0 });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("TickPick remains fail-closed while its rights summary is pending", async () => {
  const adapter = providerRegistry().tickpick;
  assert.equal(adapter.approvalStatus, "pending");
  assert.equal(adapter.credentialEnv, null);
  assert.deepEqual(adapter.allowedHosts, []);
  assert.throws(
    () => loadConfig({ TICKETS_PROVIDERS_JSON: JSON.stringify({ tickpick: { enabled: true, mode: "listing-level" } }) }, root),
    /cannot be enabled until its operator-reviewed rights summary is complete/,
  );
  await assert.rejects(adapter.sync({}), { code: "RIGHTS_APPROVAL_REQUIRED" });
});

test("TickPick is reported disabled by default and makes no adapter call", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "sfz-ticket-tickpick-disabled-"));
  try {
    const config = loadConfig({ TICKETS_FIXTURE: "true", TICKETS_OUTPUT_DIR: join(temporary, "snapshot") }, root);
    const status = await runTicketSync(config, { now: new Date("2026-08-29T12:00:00Z"), log: () => {} });
    const tickpick = status.providers.find(({ provider }) => provider === "tickpick");
    assert.equal(tickpick.state, "disabled");
    assert.equal(tickpick.lastAttempt, null);
    assert.deepEqual(tickpick.counts, { fresh: 0, stale: 0, rejected: 0, unmatched: 0 });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("TicketNetwork remains fail-closed while its rights summary is pending", async () => {
  const adapter = providerRegistry().ticketnetwork;
  assert.equal(adapter.approvalStatus, "pending");
  assert.equal(adapter.credentialEnv, null);
  assert.deepEqual(adapter.allowedHosts, []);
  assert.throws(
    () => loadConfig({ TICKETS_PROVIDERS_JSON: JSON.stringify({ ticketnetwork: { enabled: true, mode: "listing-level" } }) }, root),
    /cannot be enabled until its operator-reviewed rights summary is complete/,
  );
  await assert.rejects(adapter.sync({}), { code: "RIGHTS_APPROVAL_REQUIRED" });
});

test("TicketNetwork is reported disabled by default and makes no adapter call", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "sfz-ticket-ticketnetwork-disabled-"));
  try {
    const config = loadConfig({ TICKETS_FIXTURE: "true", TICKETS_OUTPUT_DIR: join(temporary, "snapshot") }, root);
    const status = await runTicketSync(config, { now: new Date("2026-08-29T12:00:00Z"), log: () => {} });
    const ticketnetwork = status.providers.find(({ provider }) => provider === "ticketnetwork");
    assert.equal(ticketnetwork.state, "disabled");
    assert.equal(ticketnetwork.lastAttempt, null);
    assert.deepEqual(ticketnetwork.counts, { fresh: 0, stale: 0, rejected: 0, unmatched: 0 });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("fixture mode publishes a complete lightweight snapshot without network", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "sfz-ticket-sync-"));
  try {
    const outputDir = join(temporary, "snapshot");
    const config = loadConfig({ TICKETS_FIXTURE: "true", TICKETS_OUTPUT_DIR: outputDir }, root);
    const logs = []; const status = await runTicketSync(config, { now: new Date("2026-08-29T12:00:00Z"), finishedAt: new Date("2026-08-29T12:00:01Z"), log: (line) => logs.push(JSON.parse(line)) });
    assert.equal(status.outcome, "success"); assert.equal(status.totals.fresh, 2); assert.equal(status.totals.unmatched, 1);
    const index = await readJson(join(outputDir, "index.json")); const event = await readJson(join(outputDir, index.events[0].eventFile));
    assert.equal(Object.hasOwn(index.events[0], "listings"), false);
    assert.equal(event.listings.admission.length, 1); assert.equal(event.listings.parking.length, 1);
    assert.equal(logs.at(-1).event, "sync_complete");
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("a failed run retains the prior last-good snapshot", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "sfz-ticket-recovery-"));
  try {
    const outputDir = join(temporary, "snapshot"); const config = loadConfig({ TICKETS_FIXTURE: "true", TICKETS_OUTPUT_DIR: outputDir }, root);
    await runTicketSync(config, { now: new Date("2026-08-29T12:00:00Z"), log: () => {} });
    const original = await readFile(join(outputDir, "index.json"), "utf8");
    const invalidOverrides = join(temporary, "invalid-overrides.json"); await writeFile(invalidOverrides, "{not-json", "utf8");
    await assert.rejects(runTicketSync({ ...config, overridesFile: invalidOverrides }, { now: new Date("2026-08-29T12:10:00Z"), log: () => {} }));
    assert.equal(await readFile(join(outputDir, "index.json"), "utf8"), original);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("freshness is separate from throttling and bounded by retention", () => {
  const provider = { ticketmaster: { enabled: false, mode: "event-summary", minRefreshMs: 600000, freshnessMs: 1800000, retentionMs: 3600000 } };
  const config = loadConfig({ TICKETS_PROVIDERS_JSON: JSON.stringify(provider) }, root);
  assert.deepEqual([config.providers.ticketmaster.minRefreshMs, config.providers.ticketmaster.freshnessMs, config.providers.ticketmaster.retentionMs], [600000, 1800000, 3600000]);
  assert.ok(15 * 60_000 + 2 * 60_000 < config.providers.ticketmaster.freshnessMs);
  assert.throws(() => loadConfig({ TICKETS_PROVIDERS_JSON: JSON.stringify({ ticketmaster: { ...provider.ticketmaster, freshnessMs: 500000 } }) }, root), /minRefreshMs <= freshnessMs <= retentionMs/);
});

test("non-fixture sync rejects missing or fictional schedule provenance", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "sfz-ticket-provenance-"));
  try {
    const config = loadConfig({ TICKETS_OUTPUT_DIR: join(temporary, "current") }, root);
    await assert.rejects(runTicketSync(config, { now: new Date("2026-08-29T12:00:00Z"), log: () => {} }), { code: "SCHEDULE_FIXTURE" });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("lock recovery refuses live and unknown locks but recovers verified stale dead ownership", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "sfz-ticket-lock-")); const lock = join(temporary, ".current.lock");
  try {
    await mkdir(lock); await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: process.pid, hostname: hostname(), startedAt: "2026-08-29T11:00:00.000Z" }));
    await assert.rejects(acquireLock(lock, Date.parse("2026-08-29T12:00:00Z"), 60_000), { code: "SYNC_LOCKED" });
    await rm(lock, { recursive: true }); await mkdir(lock); await writeFile(join(lock, "owner.json"), "not-json");
    await assert.rejects(acquireLock(lock, Date.parse("2026-08-29T12:00:00Z"), 60_000), { code: "SYNC_LOCK_UNKNOWN" });
    await rm(lock, { recursive: true }); await mkdir(lock); await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: 2147483647, hostname: hostname(), startedAt: "2026-08-29T11:00:00.000Z" }));
    await acquireLock(lock, Date.parse("2026-08-29T12:00:00Z"), 60_000);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("publication failures before atomic switch preserve current", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "sfz-ticket-publish-"));
  try {
    const outputDir = join(temporary, "current"); const config = loadConfig({ TICKETS_FIXTURE: "true", TICKETS_OUTPUT_DIR: outputDir }, root);
    await runTicketSync(config, { now: new Date("2026-08-29T12:00:00Z"), log: () => {} });
    const original = await readFile(join(outputDir, "index.json"), "utf8");
    for (const boundary of ["after-validation", "before-version-rename", "after-version-rename", "after-pointer-create"]) {
      await assert.rejects(runTicketSync(config, { now: new Date(`2026-08-29T12:${boundary.length}:00Z`), log: () => {}, injectFailure: async (point) => { if (point === boundary) throw new Error(`injected-${point}`); } }), new RegExp(`injected-${boundary}`));
      assert.equal(await readFile(join(outputDir, "index.json"), "utf8"), original);
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
