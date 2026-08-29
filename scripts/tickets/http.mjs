const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createProviderHttp({ provider, allowedHosts, timeoutMs, maxRetries, rateLimitMs, userAgent = "SeahawksFanZone-TicketSync/1.0" }, dependencies = {}) {
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const sleep = dependencies.sleep ?? wait;
  const random = dependencies.random ?? Math.random;
  let lastRequestAt = 0;
  return async function request(url, init = {}) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname) || parsed.username || parsed.password) throw Object.assign(new Error("Provider URL rejected."), { code: "INVALID_PROVIDER_URL" });
    for (const key of parsed.searchParams.keys()) if (/token|key|secret|signature|auth/i.test(key)) throw Object.assign(new Error("Credentials must be sent in headers, not URLs."), { code: "SECRET_IN_URL" });
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const delay = Math.max(0, rateLimitMs - (Date.now() - lastRequestAt));
      if (delay) await sleep(delay);
      lastRequestAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(parsed, { ...init, signal: controller.signal, headers: { accept: "application/json", "user-agent": userAgent, ...init.headers } });
        if (response.ok) return response;
        if (attempt === maxRetries || ![408, 425, 429, 500, 502, 503, 504].includes(response.status)) throw Object.assign(new Error("Provider request failed."), { code: `HTTP_${response.status}`, retryable: false });
      } catch (error) {
        if (attempt === maxRetries || error.retryable === false || (error.code && !String(error.code).startsWith("HTTP_"))) throw Object.assign(new Error("Provider request failed."), { code: error.name === "AbortError" ? "REQUEST_TIMEOUT" : (error.code || "NETWORK_ERROR") });
      } finally { clearTimeout(timer); }
      await sleep(Math.min(5_000, 200 * 2 ** attempt) + Math.floor(random() * 100));
    }
    throw Object.assign(new Error("Provider request failed."), { code: "NETWORK_ERROR" });
  };
}
