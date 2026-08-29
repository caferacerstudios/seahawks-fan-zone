import { readFile } from "node:fs/promises";

const TICKETMASTER_API = "https://app.ticketmaster.com/discovery/v2/events.json";
const TICKETMASTER_HOSTS = Object.freeze(["www.ticketmaster.com", "ticketmaster.com"]);
const TICKETMASTER_CAPABILITIES = Object.freeze({
  supportsSeatListings: false,
  supportsResaleListings: false,
  supportsPriceRange: true,
  accessTier: "discovery",
});

const comparableName = (value) => String(value ?? "").normalize("NFKD").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();

export function matchTicketmasterEvent(events, { eventName, eventDate, legacyEventId }) {
  const candidates = events.filter((event) => comparableName(event?.name) === comparableName(eventName) && event?.dates?.start?.localDate === eventDate);
  const matched = candidates.find((event) => {
    try { return new URL(event?.url).pathname.split("/").filter(Boolean).at(-1) === legacyEventId; } catch { return false; }
  });
  if (!matched) throw Object.assign(new Error("Ticketmaster event could not be verified."), { code: "EVENT_NOT_FOUND" });
  return matched;
}

function ticketmasterStatus(event) {
  return { eventStatus: event?.dates?.status?.code ?? null };
}

export function normalizeTicketmasterEvent(event) {
  const venue = event?._embedded?.venues?.[0];
  const prices = Array.isArray(event?.priceRanges) ? event.priceRanges
    .filter(({ currency, min, max }) => typeof currency === "string" && Number.isFinite(min) && Number.isFinite(max))
    .map(({ currency, min, max }) => ({ currency, min, max })) : [];
  return {
    id: String(event.id), name: String(event.name), canonicalUrl: event.url ?? null,
    venue: venue ? { name: venue.name ?? null, city: venue.city?.name ?? null, state: venue.state?.stateCode ?? venue.state?.name ?? null } : null,
    startTimeUtc: event?.dates?.start?.dateTime ?? null, localDate: event?.dates?.start?.localDate ?? null,
    localTime: event?.dates?.start?.localTime ?? null, timeZone: event?.dates?.timezone ?? null,
    ...ticketmasterStatus(event), priceRanges: prices,
    currency: prices[0]?.currency ?? null,
    inventoryDetailLevel: "price_range",
  };
}

async function syncTicketmaster(context) {
  const url = new URL(TICKETMASTER_API);
  url.searchParams.set("apikey", context.apiKey);
  url.searchParams.set("keyword", context.eventName);
  url.searchParams.set("localStartDateTime", `${context.eventDate}T00:00:00,${context.eventDate}T23:59:59`);
  url.searchParams.set("size", "20");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), context.timeoutMs);
  try {
    const response = await (context.fetch ?? globalThis.fetch)(url, { signal: controller.signal, headers: { accept: "application/json", "user-agent": "SeahawksFanZone-TicketSync/1.0" } });
    if (!response.ok) throw Object.assign(new Error("Ticketmaster Discovery request failed."), { code: `HTTP_${response.status}` });
    const body = await response.json();
    const matched = matchTicketmasterEvent(body?._embedded?.events ?? [], context);
    return { events: [normalizeTicketmasterEvent(matched)] };
  } catch (error) {
    if (error.name === "AbortError") throw Object.assign(new Error("Ticketmaster Discovery request timed out."), { code: "REQUEST_TIMEOUT" });
    throw error;
  } finally { clearTimeout(timer); }
}

export const PROVIDER_MODES = Object.freeze(["listing-level", "event-summary", "deep-link-only", "pending"]);

const shells = Object.freeze({
  ticketmaster: Object.freeze({
    id: "ticketmaster", approvalStatus: "approved", credentialEnv: "TICKETMASTER_API_KEY",
    capabilities: TICKETMASTER_CAPABILITIES,
    allowedHosts: TICKETMASTER_HOSTS, async sync(context) { return syncTicketmaster(context); },
  }),
  stubhub: Object.freeze({
    id: "stubhub",
    approvalStatus: "pending",
    credentialEnv: null,
    allowedHosts: [],
    async sync() { throw Object.assign(new Error("StubHub rights approval is incomplete."), { code: "RIGHTS_APPROVAL_REQUIRED" }); },
  }),
  tickpick: Object.freeze({
    id: "tickpick",
    approvalStatus: "pending",
    credentialEnv: null,
    allowedHosts: [],
    async sync() { throw Object.assign(new Error("TickPick rights approval is incomplete."), { code: "RIGHTS_APPROVAL_REQUIRED" }); },
  }),
  ticketnetwork: Object.freeze({
    id: "ticketnetwork",
    approvalStatus: "pending",
    credentialEnv: null,
    allowedHosts: [],
    async sync() { throw Object.assign(new Error("TicketNetwork rights approval is incomplete."), { code: "RIGHTS_APPROVAL_REQUIRED" }); },
  }),
  "provider-shell": Object.freeze({
    id: "provider-shell",
    credentialEnv: "TICKETS_PROVIDER_SHELL_API_KEY",
    allowedHosts: [],
    async sync() { throw Object.assign(new Error("Adapter is not implemented."), { code: "ADAPTER_PENDING" }); },
  }),
  "fixture-market": Object.freeze({
    id: "fixture-market",
    credentialEnv: null,
    allowedHosts: ["fixture-market.example.invalid"],
    async sync(context) {
      if (!context.fixture) throw Object.assign(new Error("Fixture adapter is fixture-only."), { code: "ADAPTER_PENDING" });
      return JSON.parse(await readFile(context.fixtureFile, "utf8"));
    },
  }),
});

export function providerRegistry() { return shells; }

export function configuredProviders(config) {
  return Object.entries(config.providers).map(([id, settings]) => ({ adapter: shells[id], ...settings, id }));
}
