import { safeProviderUrl } from "./outbound-links.mjs";

const SCHEMA_VERSION = "1.0.0";
const EVENT_FILE = /^events\/sea_[A-Za-z0-9._-]+\.json$/;
const MAX_SNAPSHOT_AGE_MS = 2 * 60 * 60 * 1000;
const EVENT_BUCKETS = ["admission", "parking", "other"];

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

export const ticketModeUsesFixtures = (mode) => mode === "preview";

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
  for (const bucket of EVENT_BUCKETS) if (!Array.isArray(eventFile.listings[bucket])) throw new TypeError(`Invalid runtime ${bucket} listings.`);
  for (const reference of eventFile.providerReferences) {
    record(reference, "event.providerReferences[]");
    if (reference.mode === "event-summary") {
      if (!safeProviderUrl(reference.provider, reference.canonicalUrl)) throw new TypeError("Runtime provider URL is not allowlisted.");
      record(reference.summary, "event.providerReferences[].summary");
      record(reference.capabilities, "event.providerReferences[].capabilities");
      if (reference.capabilities.supportsSeatListings !== false || reference.capabilities.supportsResaleListings !== false || reference.capabilities.supportsPriceRange !== true || reference.capabilities.accessTier !== "discovery") throw new TypeError("Invalid runtime Discovery capabilities.");
      if (reference.summary.inventoryDetailLevel !== "price_range") throw new TypeError("Invalid runtime inventory detail level.");
      if (!Array.isArray(reference.summary.priceRanges)) throw new TypeError("Invalid runtime event price ranges.");
      if (reference.summary.priceRanges.some((price) => !Number.isFinite(price?.min) || !Number.isFinite(price?.max) || typeof price?.currency !== "string")) throw new TypeError("Invalid runtime event price range.");
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

export function ticketmasterSummaryModel(reference) {
  if (reference?.provider !== "ticketmaster" || reference.mode !== "event-summary") throw new TypeError("Not a Ticketmaster event summary.");
  return { provider: "Ticketmaster", source: "Official Discovery API event summary", status: reference.summary?.eventStatus === "onsale" ? "On sale" : reference.summary?.eventStatus === "offsale" ? "Off sale" : "Status unknown", checkedAt: reference.fetchedAt, stale: reference.state === "stale", href: safeProviderUrl("ticketmaster", reference.canonicalUrl), priceCopy: "Check ticket availability on Ticketmaster", rangeNotice: "Event-summary data is not an individual offer and is not used for price ranking.", disclaimer: "Numeric price ranges are hidden because mandatory-fee completeness is not documented.", priceRanges: [] };
}

export function runtimeProviderCoverage(status, event) {
  return status.providers.filter((provider) => provider.state !== "disabled").map((provider) => ({
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
