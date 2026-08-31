import { safeProviderUrl } from "./outbound-links.mjs";
import { PROVIDER_EVENT_PRICE_DISCLOSURE, providerEventPriceCopy, validateProviderEventPrice } from "./provider-event-price.mjs";

const SCHEMA_VERSION = "1.0.0";
const EVENT_FILE = /^events\/sea_[A-Za-z0-9._-]+\.json$/;
const MAX_SNAPSHOT_AGE_MS = 2 * 60 * 60 * 1000;
const EVENT_BUCKETS = ["admission", "parking", "other"];
const EVENTSPY_SOURCE = "https://www.event-spy.com/event/seattle-seahawks-seattle-sep-09-2026/374440";
const OBSERVATION_FIELDS = new Set(["source", "sourceEventId", "sourceUrl", "sfzGameId", "metric", "priceCents", "sevenDayLowCents", "winnerMarketplace", "currency", "feeBasis", "observedAt", "fetchedAt", "samplingCadence"]);

const record = (value, name) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object.`);
  return value;
};
const timestamp = (value, name, now, allowFuture = false) => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed) || (!allowFuture && parsed > now + 60_000)) throw new TypeError(`${name} must be a valid timestamp.`);
  return parsed;
};
const version = (value, name) => {
  if (value !== SCHEMA_VERSION) throw new TypeError(`${name} uses an incompatible schema version.`);
};

export function runtimeEventUrl(indexRow) {
  if (!indexRow || !EVENT_FILE.test(indexRow.eventFile || "")) throw new TypeError("Invalid runtime ticket event path.");
  return `/data/tickets/${indexRow.eventFile}`;
}

export function validateRuntimeStatus(value, now = Date.now()) {
  const status = record(value, "status");
  version(status.schemaVersion, "status");
  const generated = timestamp(status.generatedAt, "status.generatedAt", now);
  if (now - generated > MAX_SNAPSHOT_AGE_MS) throw new TypeError("Runtime ticket status is stale.");
  if (status.fixture !== false) throw new TypeError("Fixture runtime ticket data is prohibited in beta and live.");
  if (status.scheduleFixture !== false) throw new TypeError("Fixture or unproven schedule data is prohibited in beta and live.");
  if (!["success", "degraded"].includes(status.outcome) || !Array.isArray(status.providers)) throw new TypeError("Invalid runtime ticket status.");
  for (const provider of status.providers) {
    record(provider, "status.providers[]");
    if (typeof provider.provider !== "string" || typeof provider.mode !== "string" || typeof provider.state !== "string") throw new TypeError("Invalid runtime provider status.");
    record(provider.counts, "status.providers[].counts");
    for (const key of ["fresh", "stale", "rejected", "unmatched"]) if (!Number.isSafeInteger(provider.counts[key]) || provider.counts[key] < 0) throw new TypeError("Invalid runtime provider count.");
    if (provider.matchedEventSummaries !== undefined && (!Number.isSafeInteger(provider.matchedEventSummaries) || provider.matchedEventSummaries < 0)) throw new TypeError("Invalid matched event-summary count.");
    if (provider.lastSuccess !== null) timestamp(provider.lastSuccess, "status.providers[].lastSuccess", now);
  }
  return status;
}

export function validateRuntimeIndex(value, now = Date.now()) {
  const index = record(value, "index");
  version(index.schemaVersion, "index");
  const generated = timestamp(index.generatedAt, "index.generatedAt", now);
  if (now - generated > MAX_SNAPSHOT_AGE_MS) throw new TypeError("Runtime ticket index is stale.");
  if (!Array.isArray(index.events)) throw new TypeError("Invalid runtime ticket index.");
  for (const row of index.events) {
    record(row, "index.events[]");
    if (typeof row.gameId !== "string" || typeof row.eventKey !== "string") throw new TypeError("Invalid runtime ticket index event.");
    runtimeEventUrl(row);
  }
  return index;
}

export function selectRuntimeEvent(index, requestedGameId, allowedGameIds) {
  const allowed = new Set(allowedGameIds.map(String));
  const gameId = allowed.has(String(requestedGameId)) ? String(requestedGameId) : String(allowedGameIds[0] ?? "");
  return { gameId, row: index.events.find((event) => String(event.gameId) === gameId) ?? null };
}

export function validateRuntimeEvent(value, indexRow, now = Date.now()) {
  const eventFile = record(value, "event file");
  version(eventFile.schemaVersion, "event file");
  const generated = timestamp(eventFile.generatedAt, "event.generatedAt", now);
  if (now - generated > MAX_SNAPSHOT_AGE_MS) throw new TypeError("Runtime ticket event is stale.");
  record(eventFile.event, "event.event");
  if (String(eventFile.event.gameId) !== String(indexRow.gameId) || eventFile.event.eventKey !== indexRow.eventKey) throw new TypeError("Runtime event does not match its index row.");
  if (!Array.isArray(eventFile.providerReferences)) throw new TypeError("Invalid runtime provider references.");
  record(eventFile.listings, "event.listings");
  if (eventFile.marketObservations !== undefined && !Array.isArray(eventFile.marketObservations)) throw new TypeError("Invalid runtime market observations.");
  for (const observation of eventFile.marketObservations ?? []) {
    record(observation, "event.marketObservations[]");
    if (Object.keys(observation).some((key) => !OBSERVATION_FIELDS.has(key))) throw new TypeError("Runtime market observation contains a prohibited field.");
    if (observation.source !== "eventspy" || observation.sourceUrl !== EVENTSPY_SOURCE || observation.sourceEventId !== "374440" || String(observation.sfzGameId) !== String(eventFile.event.gameId) || observation.metric !== "aggregate-lowest-observed" || observation.currency !== "USD" || observation.samplingCadence !== "twice-daily") throw new TypeError("Invalid runtime market observation identity.");
    if (!Number.isSafeInteger(observation.priceCents) || observation.priceCents < 1 || observation.priceCents > 10_000_000) throw new TypeError("Invalid runtime market observation price.");
    if (observation.sevenDayLowCents !== undefined && (!Number.isSafeInteger(observation.sevenDayLowCents) || observation.sevenDayLowCents < 1 || observation.sevenDayLowCents > 10_000_000)) throw new TypeError("Invalid runtime seven-day low.");
    if (observation.winnerMarketplace !== undefined && (typeof observation.winnerMarketplace !== "string" || observation.winnerMarketplace.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9 .&'()+/-]*$/.test(observation.winnerMarketplace))) throw new TypeError("Invalid runtime winning marketplace.");
    if (!["estimated-fees-and-taxes-where-available", "unknown"].includes(observation.feeBasis)) throw new TypeError("Invalid runtime observation fee basis.");
    const observed = timestamp(observation.observedAt, "event.marketObservations[].observedAt", now);
    const fetched = timestamp(observation.fetchedAt, "event.marketObservations[].fetchedAt", now);
    if (observed > fetched || fetched - observed > 7 * 24 * 60 * 60 * 1000) throw new TypeError("Runtime market observation timestamps are inconsistent.");
  }
  for (const bucket of EVENT_BUCKETS) if (!Array.isArray(eventFile.listings[bucket])) throw new TypeError(`Invalid runtime ${bucket} listings.`);
  for (const reference of eventFile.providerReferences) {
    record(reference, "event.providerReferences[]");
    if (reference.mode === "event-summary") {
      if (!safeProviderUrl(reference.provider, reference.canonicalUrl)) throw new TypeError("Runtime provider URL is not allowlisted.");
      record(reference.summary, "event.providerReferences[].summary");
      record(reference.capabilities, "event.providerReferences[].capabilities");
      if (reference.capabilities.supportsSeatListings !== false || reference.capabilities.supportsResaleListings !== false || reference.capabilities.supportsPriceRange !== true || reference.capabilities.accessTier !== "discovery") throw new TypeError("Invalid runtime Discovery capabilities.");
      if (reference.summary.inventoryDetailLevel !== "price_range") throw new TypeError("Invalid runtime inventory detail level.");
      if (!Array.isArray(reference.eventPrices)) throw new TypeError("Invalid runtime event prices.");
      for (const price of reference.eventPrices) {
        validateProviderEventPrice(price);
        if (price.provider !== reference.provider || price.sourceIdentifier !== reference.providerEventId) throw new TypeError("Runtime event price source does not match its provider reference.");
      }
      timestamp(reference.fetchedAt, "event.providerReferences[].fetchedAt", now);
      const expires = timestamp(reference.expiresAt, "event.providerReferences[].expiresAt", now, true);
      if (expires <= now) throw new TypeError("Runtime provider event summary is beyond its freshness limit.");
    }
  }
  for (const listing of EVENT_BUCKETS.flatMap((bucket) => eventFile.listings[bucket])) {
    record(listing, "event.listings[]");
    if (!safeProviderUrl(listing.provider, listing.affiliateUrl ?? listing.canonicalUrl)) throw new TypeError("Runtime listing URL is not allowlisted.");
    if (!Number.isSafeInteger(listing.priceCents) || listing.priceCents < 0 || typeof listing.currency !== "string") throw new TypeError("Invalid runtime listing price.");
    timestamp(listing.fetchedAt, "event.listings[].fetchedAt", now);
    timestamp(listing.expiresAt, "event.listings[].expiresAt", now, true);
  }
  return eventFile;
}

export function runtimeTicketView(event, now = Date.now()) {
  const references = Array.isArray(event?.providerReferences) ? event.providerReferences : [];
  const summaries = references.filter((reference) =>
    reference?.mode === "event-summary" && safeProviderUrl(reference.provider, reference.canonicalUrl) &&
    Number.isFinite(Date.parse(reference.expiresAt)) && Date.parse(reference.expiresAt) > now,
  );
  const listings = EVENT_BUCKETS.flatMap((bucket) => Array.isArray(event?.listings?.[bucket]) ? event.listings[bucket] : []).filter((listing) =>
    listing?.rankEligible === true && listing?.stale === false && safeProviderUrl(listing.provider, listing.affiliateUrl ?? listing.canonicalUrl) &&
    Number.isFinite(Date.parse(listing.expiresAt)) && Date.parse(listing.expiresAt) > now,
  );
  return { listings, summaries };
}

export function providerEventSummaryModel(reference) {
  if (!reference || reference.mode !== "event-summary") throw new TypeError("Not a provider event summary.");
  const href = safeProviderUrl(reference.provider, reference.canonicalUrl);
  const prices = Array.isArray(reference.eventPrices) ? reference.eventPrices.map((price) => ({ ...price, copy: providerEventPriceCopy(price) })) : [];
  const provider = reference.provider === "ticketmaster" ? "Ticketmaster" : reference.provider;
  return {
    provider,
    source: reference.provider === "ticketmaster" ? "Official Discovery API event summary" : "Provider event summary",
    status: reference.summary?.eventStatus === "onsale" ? "On sale" : reference.summary?.eventStatus === "offsale" ? "Off sale" : "Status unknown",
    checkedAt: reference.fetchedAt,
    stale: reference.state === "stale",
    href,
    priceCopy: prices[0]?.copy ?? "Ticketmaster did not supply an event range",
    prices,
    disclosure: PROVIDER_EVENT_PRICE_DISCLOSURE,
  };
}

export function eventSpyObservationModel(event, now = Date.now()) {
  const observations = (event?.marketObservations ?? []).filter((item) => item?.source === "eventspy")
    .slice().sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const latest = observations.at(-1) ?? null;
  if (!latest) return { observations: [], latest: null, sevenDayLowCents: null, ageMs: null, stale: false };
  const sevenDayStart = Date.parse(latest.observedAt) - 7 * 24 * 60 * 60 * 1000;
  const observedSevenDayLow = observations.filter((item) => Date.parse(item.observedAt) >= sevenDayStart).reduce((low, item) => Math.min(low, item.priceCents), Infinity);
  return {
    observations,
    latest,
    sevenDayLowCents: Math.min(...[observedSevenDayLow, latest.sevenDayLowCents].filter(Number.isFinite)),
    ageMs: Math.max(0, now - Date.parse(latest.observedAt)),
    stale: now - Date.parse(latest.observedAt) > 24 * 60 * 60 * 1000,
  };
}

export function ticketmasterSummaryModel(reference) {
  if (reference?.provider !== "ticketmaster") throw new TypeError("Not a Ticketmaster event summary.");
  return providerEventSummaryModel(reference);
}

export function runtimeProviderCoverage(status, event) {
  return status.providers.filter((provider) => !["disabled", "pending"].includes(provider.state)).map((provider) => ({
    provider: provider.provider === "ticketmaster" ? "Ticketmaster" : provider.provider,
    mode: provider.mode === "event-summary" ? "Event summary" : provider.mode,
    state: provider.state,
    matchedEventSummaries: provider.matchedEventSummaries ?? event.providerReferences.filter((reference) => reference.provider === provider.provider && reference.mode === "event-summary" && reference.state !== "stale").length,
    freshListings: provider.counts.fresh,
    rejectedEvents: provider.counts.rejected,
    unmatchedEvents: provider.counts.unmatched,
    lastSuccess: provider.lastSuccess,
  }));
}

export async function loadRuntimeTicketData(fetchJson, requestedGameId, allowedGameIds, now = Date.now()) {
  const [status, index] = await Promise.all([
    fetchJson("/data/tickets/status.json").then((value) => validateRuntimeStatus(value, now)),
    fetchJson("/data/tickets/index.json").then((value) => validateRuntimeIndex(value, now)),
  ]);
  if (status.generatedAt !== index.generatedAt) throw new TypeError("Runtime ticket snapshot files are incompatible.");
  const selected = selectRuntimeEvent(index, requestedGameId, allowedGameIds);
  const event = selected.row ? validateRuntimeEvent(await fetchJson(runtimeEventUrl(selected.row)), selected.row, now) : null;
  if (event && event.generatedAt !== status.generatedAt) throw new TypeError("Runtime ticket event is incompatible with its snapshot.");
  return { status, index, selected, event };
}

export { MAX_SNAPSHOT_AGE_MS, SCHEMA_VERSION };
