import { Buffer } from "node:buffer";

const AUTHORIZED_EVENTSPY_URL = "https://www.event-spy.com/event/seattle-seahawks-seattle-sep-09-2026/374440";
const AUTHORIZED_EVENTSPY_EVENTS = Object.freeze({
  [AUTHORIZED_EVENTSPY_URL]: Object.freeze({ sourceEventId: "374440", sfzGameId: "1392216" }),
});

const ALLOWED_FIELDS = new Set([
  "source", "sourceEventId", "sourceUrl", "sfzGameId", "metric", "priceCents",
  "sevenDayLowCents", "winnerMarketplace", "currency", "feeBasis", "observedAt",
  "fetchedAt", "samplingCadence",
]);
const REQUIRED_FIELDS = [
  "source", "sourceEventId", "sourceUrl", "sfzGameId", "metric", "priceCents",
  "currency", "feeBasis", "observedAt", "fetchedAt", "samplingCadence",
];
const FEE_BASES = new Set(["estimated-fees-and-taxes-where-available", "unknown"]);
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const EARLIEST_TIMESTAMP = Date.parse("2020-01-01T00:00:00Z");
const LATEST_TIMESTAMP = Date.parse("2100-01-01T00:00:00Z");
const MAX_PRICE_CENTS = 10_000_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

const fail = (message) => { throw new TypeError(message); };

function timestamp(value, field, now) {
  if (typeof value !== "string" || value.length > 32 || !ISO_UTC.test(value)) fail(`Invalid ${field}.`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed < EARLIEST_TIMESTAMP || parsed > LATEST_TIMESTAMP || parsed > now + 60_000) fail(`Invalid ${field}.`);
  return parsed;
}

function cents(value, field) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PRICE_CENTS) fail(`Invalid ${field}.`);
  return value;
}

export function eventSpyMapping(sourceUrl) {
  if (typeof sourceUrl !== "string" || sourceUrl.length > 512) return null;
  return AUTHORIZED_EVENTSPY_EVENTS[sourceUrl] ?? null;
}

export function validateMarketObservation(value, { now = Date.now() } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Market observation must be an object.");
  const keys = Object.keys(value);
  if (keys.some((key) => !ALLOWED_FIELDS.has(key)) || REQUIRED_FIELDS.some((key) => !Object.hasOwn(value, key))) fail("Market observation contains missing or prohibited fields.");
  if (value.source !== "eventspy") fail("Invalid market observation source.");
  const mapping = eventSpyMapping(value.sourceUrl);
  if (!mapping) fail("Market observation URL is not explicitly authorized.");
  if (value.sourceEventId !== mapping.sourceEventId || !/^\d{1,32}$/.test(value.sourceEventId)) fail("Market observation event identity does not match its URL.");
  if (value.sfzGameId !== mapping.sfzGameId || !/^\d{1,32}$/.test(value.sfzGameId)) fail("Market observation SFZ game identity does not match its URL.");
  if (value.metric !== "aggregate-lowest-observed") fail("Invalid market observation metric.");
  cents(value.priceCents, "priceCents");
  if (Object.hasOwn(value, "sevenDayLowCents")) cents(value.sevenDayLowCents, "sevenDayLowCents");
  if (Object.hasOwn(value, "winnerMarketplace") && (typeof value.winnerMarketplace !== "string" || value.winnerMarketplace.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9 .&'()+/-]*$/.test(value.winnerMarketplace))) fail("Invalid winnerMarketplace.");
  if (value.currency !== "USD") fail("Invalid market observation currency.");
  if (!FEE_BASES.has(value.feeBasis)) fail("Invalid market observation fee basis.");
  const observed = timestamp(value.observedAt, "observedAt", now);
  const fetched = timestamp(value.fetchedAt, "fetchedAt", now);
  if (observed > fetched || fetched - observed > 7 * 24 * 60 * 60 * 1000) fail("Market observation timestamps are inconsistent.");
  if (value.samplingCadence !== "twice-daily") fail("Invalid market observation sampling cadence.");
  return value;
}

function labelledValue(html, label, { optional = false } = {}) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...html.matchAll(new RegExp(`<dt(?:\\s[^>]*)?>\\s*${escaped}\\s*</dt>\\s*<dd(?:\\s[^>]*)?>\\s*([^<]*?)\\s*</dd>`, "g"))];
  if (matches.length === 0 && optional) return undefined;
  if (matches.length !== 1) fail(`Missing or ambiguous EventSpy label: ${label}.`);
  const value = matches[0][1].trim();
  if (!value) fail(`Empty EventSpy value: ${label}.`);
  return value;
}

function parseUsd(value, field) {
  if (!/^\$(?:0|[1-9]\d{0,5}|[1-9]\d{0,2}(?:,\d{3}){1,2})\.\d{2}$/.test(value)) fail(`Malformed USD value for ${field}.`);
  const amount = Number(value.slice(1).replaceAll(",", ""));
  return cents(Math.round(amount * 100), field);
}

export function parseEventSpyHtml(html, { sourceUrl, fetchedAt, now = Date.now() } = {}) {
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") > MAX_RESPONSE_BYTES) fail("EventSpy response is missing or exceeds the size limit.");
  const mapping = eventSpyMapping(sourceUrl);
  if (!mapping) fail("EventSpy URL is not explicitly authorized.");
  const sourceEventId = labelledValue(html, "Event ID");
  if (sourceEventId !== mapping.sourceEventId) fail("EventSpy event identity does not match the authorized URL.");
  const observation = {
    source: "eventspy",
    sourceEventId,
    sourceUrl,
    sfzGameId: mapping.sfzGameId,
    metric: "aggregate-lowest-observed",
    priceCents: parseUsd(labelledValue(html, "Lowest Observed Price"), "priceCents"),
    currency: "USD",
    feeBasis: labelledValue(html, "Fee Basis"),
    observedAt: labelledValue(html, "Observed At"),
    fetchedAt,
    samplingCadence: "twice-daily",
  };
  const sevenDayLow = labelledValue(html, "Seven-Day Low", { optional: true });
  const winner = labelledValue(html, "Winning Marketplace", { optional: true });
  if (sevenDayLow !== undefined) observation.sevenDayLowCents = parseUsd(sevenDayLow, "sevenDayLowCents");
  if (winner !== undefined) observation.winnerMarketplace = winner;
  return validateMarketObservation(observation, { now });
}

export { AUTHORIZED_EVENTSPY_URL, MAX_PRICE_CENTS, MAX_RESPONSE_BYTES };
