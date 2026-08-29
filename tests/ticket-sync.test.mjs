import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../scripts/tickets/config.mjs";
import { runTicketSync } from "../scripts/tickets/pipeline.mjs";
import { providerRegistry } from "../scripts/tickets/providers.mjs";

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
    const config = loadConfig({ TICKETS_OUTPUT_DIR: join(temporary, "snapshot") }, root);
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
    const config = loadConfig({ TICKETS_OUTPUT_DIR: join(temporary, "snapshot") }, root);
    const status = await runTicketSync(config, { now: new Date("2026-08-29T12:00:00Z"), log: () => {} });
    const tickpick = status.providers.find(({ provider }) => provider === "tickpick");
    assert.equal(tickpick.state, "disabled");
    assert.equal(tickpick.lastAttempt, null);
    assert.deepEqual(tickpick.counts, { fresh: 0, stale: 0, rejected: 0, unmatched: 0 });
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
