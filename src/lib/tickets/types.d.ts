export type SourceKind = "official-primary" | "verified-resale" | "resale-marketplace" | "event-summary" | "deep-link" | "other-approved";
export type ProviderStatusValue = "connected-listings" | "event-summary" | "deep-link-only" | "pending" | "disabled" | "stale" | "error";
export type FeeCompleteness = "all_in" | "provider_reported_all_in" | "estimated" | "unknown";
export type ProductType = "admission" | "parking" | "hospitality" | "tailgate";

export interface MarketObservation {
  source: "eventspy";
  sourceEventId: string;
  sourceUrl: string;
  sfzGameId: string;
  metric: "aggregate-lowest-observed";
  priceCents: number;
  sevenDayLowCents?: number;
  winnerMarketplace?: string;
  currency: "USD";
  feeBasis: "estimated-fees-and-taxes-where-available" | "unknown";
  observedAt: string;
  fetchedAt: string;
  samplingCadence: "twice-daily";
}

export interface ProviderEventReference {
  provider: string;
  providerEventId: string;
  canonicalUrl: string | null;
  affiliateUrl: string | null;
  sourceKind: SourceKind;
  matchMethod: "provider-crosswalk" | "teams-venue-time" | "manual" | "unmatched";
  matchConfidence: "high" | "medium" | "low" | "none";
  lastFetchedAt: string;
  expiresAt: string;
  status: ProviderStatusValue;
  errorCode: string | null;
}

export interface TicketListing {
  provider: string;
  providerListingId: string;
  sfzGameId: string;
  sourceKind: "official-primary" | "verified-resale" | "resale-marketplace" | "other-approved";
  sectionRaw: string | null;
  sectionNormalized: string | null;
  rowRaw: string | null;
  seatRange: { from: string; to: string } | null;
  allowedQuantities: number[];
  currency: string;
  basePriceCents: number;
  mandatoryFeesCents: number | null;
  allInPerTicketCents: number | null;
  allInGroupTotalCents: number | null;
  feeCompleteness: FeeCompleteness;
  deliveryType: "mobile" | "electronic" | "will-call" | "physical" | "unknown";
  accessibleStatus: "accessible" | "not-accessible" | "unknown";
  obstructedView: boolean | null;
  limitedView: boolean | null;
  productType: ProductType;
  sanitizedNotes: string[];
  canonicalUrl: string;
  affiliateUrl: string | null;
  fetchedAt: string;
  expiresAt: string;
}

export interface TicketEvent {
  eventKey: string;
  sfzGameId: string;
  season: number;
  phase: "preseason" | "regular" | "postseason";
  week: number | null;
  homeAway: "home" | "away";
  opponent: { abbreviation: string; name: string };
  startTimeUtc: string;
  venueLocalStart: { value: string; timeZone: string };
  pacificTimeDisplay: string;
  venue: { name: string; city: string; region: string; country: string };
  providerEventReferences: ProviderEventReference[];
  providerCoverage: string[];
  listings: TicketListing[];
  rescheduledFromUtc: string | null;
  updatedAt: string;
}

export interface ProviderStatus {
  provider: string;
  status: ProviderStatusValue;
  lastFetchedAt: string | null;
  expiresAt: string | null;
  errorCode: string | null;
}

export interface TicketFixture {
  schemaVersion: "1.0.0";
  fixture: true;
  generatedAt: string;
  providerStatuses: ProviderStatus[];
  events: TicketEvent[];
  unmatchedProviderEvents: ProviderEventReference[];
}

export type EventMatchConfidence = "high" | "medium" | "low" | "none";
export type EventMatchOutcome = "matched" | "review" | "rejected";
export type EventMatchMethod = "provider-crosswalk" | "teams-venue-time" | "manual" | "unmatched";

export interface TicketMatchOverride {
  action: "map" | "block";
  sfzEventKey: string;
  provider: string;
  providerEventId: string;
  note: string;
  addedAt: string;
  reason: string;
}
