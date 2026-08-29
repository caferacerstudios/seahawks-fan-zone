import { readFile } from "node:fs/promises";

const TICKETMASTER_API = "https://app.ticketmaster.com/discovery/v2/events.json";
const TICKETMASTER_HOSTS = Object.freeze(["www.ticketmaster.com", "ticketmaster.com"]);

function ticketmasterStatus(event) {
  return {
    eventStatus: event?.dates?.status?.code ?? null,
    salesStatus: event?.sales?.public?.startDateTime && event?.sales?.public?.endDateTime ? {
      startsAt: event.sales.public.startDateTime,
      endsAt: event.sales.public.endDateTime,
    } : null,
  };
}

export function normalizeTicketmasterEvent(event) {
  const venue = event?._embedded?.venues?.[0];
  const attractions = (event?._embedded?.attractions ?? []).map(({ id, name }) => ({ id: String(id), name: String(name) }));
  const classifications = (event?.classifications ?? []).map((item) => ({
    segment: item?.segment?.name ?? null, genre: item?.genre?.name ?? null,
    subGenre: item?.subGenre?.name ?? null, type: item?.type?.name ?? null,
    subType: item?.subType?.name ?? null,
  }));
  const prices = Array.isArray(event?.priceRanges) ? event.priceRanges.map(({ type, currency, min, max }) => ({ type: type ?? null, currency, min, max })) : [];
  return {
    id: String(event.id), name: String(event.name), canonicalUrl: event.url ?? null,
    attractions, teams: attractions, venue: venue ? { name: venue.name ?? null, city: venue.city?.name ?? null, state: venue.state?.stateCode ?? venue.state?.name ?? null } : null,
    startTimeUtc: event?.dates?.start?.dateTime ?? null, localDate: event?.dates?.start?.localDate ?? null,
    localTime: event?.dates?.start?.localTime ?? null, timeZone: event?.dates?.timezone ?? null,
    classifications, classification: classifications.map((item) => [item.segment, item.genre, item.subGenre].filter(Boolean).join(" ")).join(" "),
    eventType: classifications.some((item) => item.genre === "Football") ? "NFL football" : classifications[0]?.genre ?? null,
    ...ticketmasterStatus(event), priceRanges: prices,
    allInclusivePricing: event?.ticketing?.allInclusivePricing?.enabled === true ? true : event?.ticketing?.allInclusivePricing?.enabled === false ? false : null,
  };
}

async function syncTicketmaster(context) {
  const url = new URL(TICKETMASTER_API);
  url.searchParams.set("apikey", context.apiKey);
  url.searchParams.set("attractionId", context.attractionId);
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("size", "200");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), context.timeoutMs);
  try {
    const response = await (context.fetch ?? globalThis.fetch)(url, { signal: controller.signal, headers: { accept: "application/json", "user-agent": "SeahawksFanZone-TicketSync/1.0" } });
    if (!response.ok) throw Object.assign(new Error("Ticketmaster Discovery request failed."), { code: `HTTP_${response.status}` });
    const body = await response.json();
    return { events: (body?._embedded?.events ?? []).map(normalizeTicketmasterEvent) };
  } catch (error) {
    if (error.name === "AbortError") throw Object.assign(new Error("Ticketmaster Discovery request timed out."), { code: "REQUEST_TIMEOUT" });
    throw error;
  } finally { clearTimeout(timer); }
}

export const PROVIDER_MODES = Object.freeze(["listing-level", "event-summary", "deep-link-only", "pending"]);

const shells = Object.freeze({
  ticketmaster: Object.freeze({
    id: "ticketmaster", approvalStatus: "approved", credentialEnv: "TICKETMASTER_API_KEY",
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
