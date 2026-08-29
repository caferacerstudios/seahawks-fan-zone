import { readFile } from "node:fs/promises";

export const PROVIDER_MODES = Object.freeze(["listing-level", "event-summary", "deep-link-only", "pending"]);

const shells = Object.freeze({
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
