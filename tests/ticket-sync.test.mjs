import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../scripts/tickets/config.mjs";
import { runTicketSync } from "../scripts/tickets/pipeline.mjs";

const root = new URL("..", import.meta.url).pathname;
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

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
