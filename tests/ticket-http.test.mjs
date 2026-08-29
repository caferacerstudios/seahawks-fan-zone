import test from "node:test";
import assert from "node:assert/strict";
import { createProviderHttp } from "../scripts/tickets/http.mjs";

test("provider HTTP retries bounded transient failures and identifies itself", async () => {
  let calls = 0; const delays = [];
  const request = createProviderHttp({ provider: "fixture", allowedHosts: ["api.example.invalid"], timeoutMs: 100, maxRetries: 1, rateLimitMs: 0 }, {
    fetch: async (_url, init) => { calls += 1; assert.match(init.headers["user-agent"], /TicketSync/); return { ok: calls === 2, status: calls === 1 ? 503 : 200 }; },
    sleep: async (ms) => delays.push(ms), random: () => 0,
  });
  assert.equal((await request("https://api.example.invalid/events")).status, 200);
  assert.equal(calls, 2); assert.deepEqual(delays, [200]);
});

test("provider HTTP rejects non-allowlisted and credential-bearing URLs before fetch", async () => {
  let calls = 0;
  const request = createProviderHttp({ provider: "fixture", allowedHosts: ["api.example.invalid"], timeoutMs: 100, maxRetries: 0, rateLimitMs: 0 }, { fetch: async () => { calls += 1; } });
  await assert.rejects(request("https://wrong.example.invalid/events"), { code: "INVALID_PROVIDER_URL" });
  await assert.rejects(request("https://api.example.invalid/events?api_key=secret"), { code: "SECRET_IN_URL" });
  assert.equal(calls, 0);
});
