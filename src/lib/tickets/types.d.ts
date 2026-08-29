export type SourceKind = "official-primary" | "verified-resale" | "resale-marketplace" | "event-summary" | "deep-link" | "other-approved";
export type ProviderStatusValue = "connected-listings" | "event-summary" | "deep-link-only" | "pending" | "disabled" | "stale" | "error";
export type FeeCompleteness = "all_in" | "provider_reported_all_in" | "estimated" | "unknown";
export type ProductType = "admission" | "parking" | "hospitality" | "tailgate";

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

export type TicketRankingSort = "lowest_total" | "lowest_per_ticket" | "best_zone_within_budget" | "official_first" | "most_recent";
export type TicketProductMode = "admission" | "parking";

export interface TicketRankingOptions {
  quantity: number;
  now?: string;
  sort?: TicketRankingSort;
  productMode?: TicketProductMode;
  budgetCents?: number | null;
  zoneOrder?: string[];
  staleAfterMs?: number | null;
  staleProviders?: string[];
  currency?: string | null;
  priceToleranceCents?: number;
  priceToleranceRatio?: number;
}

export interface NormalizedTicketPrice {
  groupTotalCents: number;
  perTicketCents: number;
  currency: string;
}

export interface RankedTicketOffer {
  listing: TicketListing;
  comparison: NormalizedTicketPrice;
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
