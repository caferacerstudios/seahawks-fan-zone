export const AUTHORIZED_EVENTSPY_URL = "https://www.event-spy.com/event/seattle-seahawks-seattle-sep-09-2026/374440";
export const AUTHORIZED_EVENTSPY_GAME_ID = "1392216";
export const EVENTSPY_MARKETPLACES = Object.freeze(["ticketmaster", "stubhub", "vividseats", "seatgeek"]);
export const MARKET_OBSERVATION_SCHEMA_VERSION = "1.0.0";
export const MAX_RESPONSE_BYTES = 256 * 1024;
export const MAX_PRICE_CENTS = 10_000_000;
const MARKETPLACE_SET = new Set(EVENTSPY_MARKETPLACES);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SECRET = /(?:api[_-]?key|access[_-]?token|authorization|cookie|password|secret|signature|bearer)/i;
const PLAIN = /^[^<>\u0000-\u001f\u007f]*$/;
const fail = (message) => { throw new TypeError(message); };

const timestamp = (value, field, now) => {
  if (typeof value !== "string" || value.length > 32 || !ISO.test(value)) fail(`Invalid ${field}.`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms < Date.parse("2020-01-01T00:00:00Z") || ms > now + 60_000) fail(`Invalid ${field}.`);
  return ms;
};
const price = (value, field, nullable = false) => {
  if (value === null && nullable) return;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_PRICE_CENTS) fail(`Invalid ${field}.`);
};
const exactKeys = (value, required, optional, field) => {
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) fail(`${field} contains missing or prohibited fields.`);
};

export function eventSpyMapping(url) { return url === AUTHORIZED_EVENTSPY_URL ? { sourceEventId: "374440", gameId: AUTHORIZED_EVENTSPY_GAME_ID } : null; }

export function validateMarketObservation(value, { now = Date.now() } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Market observation must be an object.");
  exactKeys(value, ["schemaVersion", "source", "sourceUrl", "gameId", "collectedAt", "currency", "summary", "seriesPoint"], [], "Market observation");
  if (value.schemaVersion !== MARKET_OBSERVATION_SCHEMA_VERSION || value.source !== "eventspy" || value.sourceUrl !== AUTHORIZED_EVENTSPY_URL || value.gameId !== AUTHORIZED_EVENTSPY_GAME_ID) fail("Invalid market observation identity.");
  if (value.currency !== "USD") fail("Unsupported currency.");
  const collected = timestamp(value.collectedAt, "collectedAt", now);
  if (!value.summary || typeof value.summary !== "object" || Array.isArray(value.summary)) fail("Invalid summary.");
  exactKeys(value.summary, ["currentLowestPriceCents", "currentLowestSeenAt", "currentLowestMarketplace", "sevenDayLowestPriceCents", "sevenDayLowestSeenAt"], [], "summary");
  price(value.summary.currentLowestPriceCents, "summary.currentLowestPriceCents", true);
  price(value.summary.sevenDayLowestPriceCents, "summary.sevenDayLowestPriceCents", true);
  const currentAt = timestamp(value.summary.currentLowestSeenAt, "summary.currentLowestSeenAt", now);
  timestamp(value.summary.sevenDayLowestSeenAt, "summary.sevenDayLowestSeenAt", now);
  if (value.summary.currentLowestMarketplace !== null && !MARKETPLACE_SET.has(value.summary.currentLowestMarketplace)) fail("Invalid summary marketplace.");
  if ((value.summary.currentLowestPriceCents === null) !== (value.summary.currentLowestMarketplace === null)) fail("Summary lowest price and marketplace must both be present or null.");
  if (!value.seriesPoint || typeof value.seriesPoint !== "object" || Array.isArray(value.seriesPoint)) fail("Invalid seriesPoint.");
  exactKeys(value.seriesPoint, ["observedAt", "marketplaces"], [], "seriesPoint");
  const observed = timestamp(value.seriesPoint.observedAt, "seriesPoint.observedAt", now);
  if (collected < observed || collected - observed > 7 * 86400_000 || collected < currentAt) fail("Observation timestamps are inconsistent.");
  if (!Array.isArray(value.seriesPoint.marketplaces) || value.seriesPoint.marketplaces.length !== 4) fail("All supported marketplaces must be represented once.");
  const seen = new Set();
  for (const item of value.seriesPoint.marketplaces) {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail("Invalid marketplace observation.");
    exactKeys(item, ["marketplace", "lowestPriceCents"], ["sectionLabel"], "marketplace observation");
    if (!MARKETPLACE_SET.has(item.marketplace) || seen.has(item.marketplace)) fail("Duplicate or unsupported marketplace.");
    seen.add(item.marketplace); price(item.lowestPriceCents, `${item.marketplace}.lowestPriceCents`, true);
    if (Object.hasOwn(item, "sectionLabel") && (typeof item.sectionLabel !== "string" || !item.sectionLabel.trim() || item.sectionLabel.length > 80 || !PLAIN.test(item.sectionLabel) || SECRET.test(item.sectionLabel))) fail("Invalid sectionLabel.");
  }
  if (SECRET.test(JSON.stringify(value))) fail("Observation contains secret-bearing data.");
  return value;
}

function labelledValue(html, label, optional = false) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...html.matchAll(new RegExp(`<dt(?:\\s[^>]*)?>\\s*${escaped}\\s*</dt>\\s*<dd(?:\\s[^>]*)?>\\s*([^<]*?)\\s*</dd>`, "gi"))];
  if (!matches.length && optional) return null;
  if (matches.length !== 1) fail(`Missing or ambiguous EventSpy label: ${label}.`);
  return matches[0][1].trim();
}
function parseUsd(value, field, nullable = false) {
  if (nullable && /^(?:unavailable|n\/a|—|-)$/i.test(value)) return null;
  if (!/^\$(?:0|[1-9]\d{0,5}|[1-9]\d{0,2}(?:,\d{3}){1,2})\.\d{2}$/.test(value)) fail(`Malformed USD value for ${field}.`);
  const result = Math.round(Number(value.slice(1).replaceAll(",", "")) * 100); price(result, field); return result;
}
const labels = { ticketmaster: "Ticketmaster", stubhub: "StubHub", vividseats: "VividSeats", seatgeek: "SeatGeek" };

export function parseEventSpyHtml(html, { sourceUrl, collectedAt, fetchedAt, now = Date.now() } = {}) {
  if (typeof html !== "string" || new TextEncoder().encode(html).byteLength > MAX_RESPONSE_BYTES) fail("EventSpy response is missing or exceeds the size limit.");
  if (!eventSpyMapping(sourceUrl)) fail("EventSpy URL is not explicitly authorized.");
  if (labelledValue(html, "Event ID") !== "374440") fail("EventSpy event identity does not match the authorized URL.");
  const marketplaces = EVENTSPY_MARKETPLACES.map((marketplace) => {
    const label = labels[marketplace];
    const item = { marketplace, lowestPriceCents: parseUsd(labelledValue(html, `${label} Price`), `${marketplace}.lowestPriceCents`, true) };
    const section = labelledValue(html, `${label} Section`, true);
    if (section && !/^(?:unavailable|n\/a|—|-)$/i.test(section)) item.sectionLabel = section;
    return item;
  });
  const rawWinner = labelledValue(html, "Current Lowest Marketplace");
  const currentLowestMarketplace = Object.entries(labels).find(([, label]) => label.toLowerCase() === rawWinner.toLowerCase())?.[0] ?? null;
  if (!currentLowestMarketplace && !/^(?:unavailable|n\/a|—|-)$/i.test(rawWinner)) fail("Unsupported current-low marketplace.");
  return validateMarketObservation({
    schemaVersion: MARKET_OBSERVATION_SCHEMA_VERSION, source: "eventspy", sourceUrl, gameId: AUTHORIZED_EVENTSPY_GAME_ID, collectedAt: collectedAt ?? fetchedAt, currency: "USD",
    summary: { currentLowestPriceCents: parseUsd(labelledValue(html, "Current Lowest Price"), "summary.currentLowestPriceCents", true), currentLowestSeenAt: labelledValue(html, "Current Lowest Seen At"), currentLowestMarketplace, sevenDayLowestPriceCents: parseUsd(labelledValue(html, "Seven-Day Lowest Price"), "summary.sevenDayLowestPriceCents", true), sevenDayLowestSeenAt: labelledValue(html, "Seven-Day Lowest Seen At") },
    seriesPoint: { observedAt: labelledValue(html, "Series Observed At"), marketplaces },
  }, { now });
}

export function parseEventSpyTooltipPayload(payload, options = {}) {
  if (typeof payload === "string") return parseEventSpyHtml(payload, options);
  return validateMarketObservation(payload, { now: options.now });
}
