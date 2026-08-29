const DAY_MS = 86_400_000;
const PERCENTILES = Object.freeze([25, 75]);

function finiteInteger(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${name} must be an integer of at least ${minimum}.`);
  return value;
}

function iso(value, name) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new TypeError(`${name} must be an ISO timestamp.`);
  return new Date(time).toISOString();
}

export function pacificDay(value) {
  const date = new Date(iso(value, "timestamp"));
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function percentile(sorted, percentage) {
  if (!sorted.length) return null;
  const index = Math.max(0, Math.ceil((percentage / 100) * sorted.length) - 1);
  return sorted[index];
}

function median(sorted) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function effectiveRetentionDays(requestedDays, providerTerms, contributingProviders) {
  finiteInteger(requestedDays, "requested retention", 1);
  if (!Array.isArray(contributingProviders) || contributingProviders.length === 0) return 0;
  const limits = contributingProviders.map((provider) => {
    const term = providerTerms?.[provider];
    if (!term || term.approved !== true || !Number.isSafeInteger(term.historicalRetentionDays) || term.historicalRetentionDays < 1) return 0;
    return term.historicalRetentionDays;
  });
  return Math.min(requestedDays, ...limits);
}

export function summarizeObservation(observation) {
  const observedAt = iso(observation.observedAt, "observedAt");
  const requestedProviders = [...new Set(observation.requestedProviders || [])].sort();
  const providerStates = observation.providerStates || {};
  const contributing = new Set();
  const buckets = new Map();
  for (const listing of observation.listings || []) {
    if (listing.productType !== "admission" || !["all_in", "provider_reported_all_in"].includes(listing.feeCompleteness)) continue;
    if (providerStates[listing.provider] !== "healthy") continue;
    if (!listing.sectionNormalized || !listing.currency || !Number.isSafeInteger(listing.allInPerTicketCents) || listing.allInPerTicketCents < 0) continue;
    for (const quantity of listing.allowedQuantities || []) {
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) continue;
      const key = `${quantity}\0${listing.sectionNormalized}\0${listing.currency}`;
      const bucket = buckets.get(key) || { quantity, zone: listing.sectionNormalized, currency: listing.currency, prices: [], providers: new Set() };
      bucket.prices.push(listing.allInPerTicketCents * quantity); bucket.providers.add(listing.provider); contributing.add(listing.provider); buckets.set(key, bucket);
    }
  }
  const contributingProviders = [...contributing].sort();
  const missingProviders = requestedProviders.filter((provider) => !contributing.has(provider));
  const staleProviders = requestedProviders.filter((provider) => providerStates[provider] === "stale");
  const groups = [...buckets.values()].map((bucket) => {
    bucket.prices.sort((a, b) => a - b);
    return { quantity: bucket.quantity, zone: bucket.zone, currency: bucket.currency, minimumCents: bucket.prices[0], medianCents: median(bucket.prices), percentile25Cents: percentile(bucket.prices, PERCENTILES[0]), percentile75Cents: percentile(bucket.prices, PERCENTILES[1]), feeCompleteSampleSize: bucket.prices.length, contributingProviders: [...bucket.providers].sort() };
  }).sort((a, b) => a.quantity - b.quantity || a.zone.localeCompare(b.zone));
  return { observedAt, localDate: pacificDay(observedAt), requestedProviders, contributingProviders, missingProviders, staleProviders, coverage: contributingProviders.length ? (missingProviders.length ? "partial" : "complete") : "missing", groups };
}

export function compactHistory(history, observation, options) {
  const now = Date.parse(iso(options.now, "now"));
  const point = summarizeObservation(observation);
  const relevantProviders = [...new Set([...point.requestedProviders, ...point.contributingProviders, ...(history?.points || []).flatMap((candidate) => (candidate.groups || []).flatMap((group) => group.contributingProviders || []))])].filter((provider) => !(options.removedProviders || []).includes(provider));
  const retentionDays = effectiveRetentionDays(options.requestedRetentionDays, options.providerTerms, relevantProviders);
  if (retentionDays === 0) throw Object.assign(new Error("Historical retention is not approved for every requested provider."), { code: "HISTORY_RETENTION_NOT_APPROVED" });
  const removed = new Set(options.removedProviders || []);
  const cutoff = now - retentionDays * DAY_MS;
  const points = [...(history?.points || []), point]
    .filter((candidate) => Date.parse(candidate.observedAt) >= cutoff)
    .filter((candidate) => !(candidate.groups || []).some((group) => group.contributingProviders.some((provider) => removed.has(provider))));
  const byDay = new Map();
  for (const candidate of points.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))) byDay.set(candidate.localDate, candidate);
  return { schemaVersion: "1.0.0", eventId: observation.eventId, compactedAt: new Date(now).toISOString(), timeZone: "America/Los_Angeles", retentionDays, points: [...byDay.values()] };
}
