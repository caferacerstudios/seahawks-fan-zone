const EVENT_FILE = /^events\/sea_[A-Za-z0-9._-]+\.json$/;

export function runtimeEventUrl(indexRow) {
  if (!indexRow || !EVENT_FILE.test(indexRow.eventFile || "")) throw new TypeError("Invalid runtime ticket event path.");
  return `/data/tickets/${indexRow.eventFile}`;
}

export function runtimeTicketView(event, now = Date.now()) {
  const references = Array.isArray(event?.providerReferences) ? event.providerReferences : [];
  const summaries = references.filter((reference) =>
    reference?.mode === "event-summary" && reference.state !== "stale" && reference.canonicalUrl &&
    Number.isFinite(Date.parse(reference.expiresAt)) && Date.parse(reference.expiresAt) > now,
  );
  const listings = ["admission", "parking", "other"].flatMap((bucket) =>
    Array.isArray(event?.listings?.[bucket]) ? event.listings[bucket] : [],
  ).filter((listing) =>
    listing?.rankEligible === true && listing?.stale === false &&
    Number.isFinite(Date.parse(listing.expiresAt)) && Date.parse(listing.expiresAt) > now,
  );
  return { listings, summaries };
}
