#!/usr/bin/env node
import { resolve } from "node:path";
import { AUTHORIZED_EVENTSPY_URL, parseEventSpyTooltipPayload } from "../../src/lib/tickets/market-observation.mjs";
import { reserveEventSpyAttempt } from "./eventspy-ledger.mjs";
import { publishEventSpyHistory } from "./eventspy-history.mjs";

const emit = (outcome, fields = {}, stream = process.stdout) => stream.write(`${JSON.stringify({ outcome, ...fields })}\n`);
export async function runEventSpyCollector(config, options = {}) {
  if (!config.enabled) return { outcome: "EVENTSPY_COLLECTION_DISABLED" };
  if (config.sourceUrl !== AUTHORIZED_EVENTSPY_URL || config.gameId !== "1392216") throw Object.assign(new Error("Unauthorized EventSpy mapping."), { code: "EVENTSPY_CONFIG_INVALID" });
  const now = options.now ?? Date.now(), reservation = await reserveEventSpyAttempt(config.root, now);
  if (!reservation.allowed) return reservation;
  let payload;
  try { payload = await options.extract(config, now); } catch { throw Object.assign(new Error("EventSpy extraction failed."), { code: "EVENTSPY_PARSE_FAILED" }); }
  let observation;
  try { observation = parseEventSpyTooltipPayload(payload, { sourceUrl: config.sourceUrl, collectedAt: new Date(now).toISOString(), now }); } catch { throw Object.assign(new Error("EventSpy validation failed."), { code: "EVENTSPY_VALIDATION_FAILED" }); }
  try { await publishEventSpyHistory(config.historyCurrent, observation, { now }); } catch { throw Object.assign(new Error("EventSpy history publication failed."), { code: "EVENTSPY_PUBLISH_FAILED" }); }
  return { outcome: "EVENTSPY_COLLECTION_SUCCESS", observedAt: observation.seriesPoint.observedAt, collectedAt: observation.collectedAt };
}

export async function browserExtract(config) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ userAgent: config.userAgent, storageState: undefined }); const page = await context.newPage();
    await page.goto(config.sourceUrl, { waitUntil: "domcontentloaded", timeout: config.navigationTimeoutMs });
    await page.locator(".recharts-wrapper").first().waitFor({ state: "visible", timeout: config.renderTimeoutMs });
    const point = page.locator(".recharts-active-dot, .recharts-dot").last(); await point.focus().catch(() => {}); await point.hover({ timeout: config.parseTimeoutMs });
    const text = await page.locator("[role=tooltip], .recharts-tooltip-wrapper").filter({ visible: true }).first().innerText({ timeout: config.parseTimeoutMs });
    return JSON.parse(text); // reviewed deployment selector adapter must emit normalized JSON text
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const env = process.env, root = resolve(env.EVENTSPY_RUNTIME_ROOT || "runtime/eventspy");
  const config = { enabled: env.EVENTSPY_ENABLED === "true", sourceUrl: env.EVENTSPY_SOURCE_URL, gameId: env.EVENTSPY_GAME_ID, root, historyCurrent: resolve(root, "current"), userAgent: env.EVENTSPY_USER_AGENT || "SeahawksFanZone-EventSpyCollector/1.0 (+https://seahawksfanzone.com/about)", navigationTimeoutMs: Number(env.EVENTSPY_NAVIGATION_TIMEOUT_MS || 20000), renderTimeoutMs: Number(env.EVENTSPY_RENDER_TIMEOUT_MS || 15000), parseTimeoutMs: Number(env.EVENTSPY_PARSE_TIMEOUT_MS || 5000) };
  try { const result = await runEventSpyCollector(config, { extract: browserExtract }); emit(result.outcome, result); if (result.outcome === "EVENTSPY_DAILY_LIMIT") process.exitCode = 2; }
  catch (error) { emit(error.code || "EVENTSPY_COLLECTION_FAILED", {}, process.stderr); process.exitCode = 1; }
}
