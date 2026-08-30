# Ticket Finder Data Contract

## Contract principles

The canonical contract is provider-neutral, versioned, JSON-serializable, and intentionally narrower than any provider response. Monetary amounts are integer minor units plus ISO 4217 currency. Timestamps are ISO 8601 UTC strings. Unknown values are `null`, never invented. Raw provider payloads are not part of the public snapshot.

The existing Seahawks schedule `game.id` (falling back only to upstream `game.game_id`) is `scheduleGameId`. The synthesized schedule fallback may support a temporary display row but is not stable enough for provider linkage. Index-based fallbacks are prohibited. A future ingestion change must preserve aliases if an upstream game ID changes.

All field publication remains conditional on provider approval in `provider-matrix.md`.

## Shared enums and values

```ts
type ProviderId =
  | "ticketmaster" | "seatgeek" | "stubhub" | "tickpick"
  | "ticketnetwork" | "vividseats" | "gametime";

type CurrencyCode = string; // validate as a supported ISO 4217 code
type IsoUtc = string;
type Coverage = "none" | "event" | "listing" | "mixed";
type FeeCompleteness = "all_in" | "partial" | "base_only" | "unknown";
type ProviderHealth = "healthy" | "degraded" | "stale" | "disabled" | "error";
```

`all_in` is not a universal calculation. It means the provider has contractually defined the displayed amount as including all mandatory purchaser fees for the selected quantity at the comparison stage, excluding only explicitly permitted variable amounts such as tax or delivery when the provider's definition says so. The snapshot must retain the provider's approved definition and exclusions. Until verified for that provider, fee completeness is `unknown` and the offer must not participate in “lowest all-in price” claims.

## `TicketEvent`

```ts
interface TicketEvent {
  id: string;                    // canonical internal ID, e.g. "sea:<scheduleGameId>"
  scheduleGameId: string;        // current upstream schedule game.id/game_id
  season: number;
  phase: "preseason" | "regular" | "postseason";
  week: number | null;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  startsAt: IsoUtc | null;
  date: string | null;            // YYYY-MM-DD in America/Los_Angeles
  dateConfirmed: boolean;
  timeConfirmed: boolean;
  venueName: string | null;
  venueCity: string | null;
  venueRegion: string | null;
  status: "upcoming" | "tbd" | "postponed" | "canceled";
  matchStatus: "matched" | "review" | "unmatched";
  references: ProviderEventReference[];
  listings: TicketListing[];
}
```

Only future/ticket-relevant games belong in a ticket snapshot. A bye or completed game cannot have active listings. `review` and `unmatched` events must not publish provider links until resolved.

## `ProviderEventReference`

```ts
interface ProviderEventReference {
  provider: ProviderId;
  providerEventId: string;
  canonicalEventUrl: string | null;
  matchMethod: "provider_crosswalk" | "teams_venue_time" | "manual";
  matchConfidence: "high" | "medium" | "low";
  matchedAt: IsoUtc;
  reviewedBy: string | null;      // operator role/opaque ID, not public personal data
  sourceUpdatedAt: IsoUtc | null;
  eventPrices: ProviderEventPrice[];
}
```

Provider crosswalks are preferred. Automated matching must compare both teams, venue identity, and an allowed kickoff window; it must not use opponent/time alone. Medium/low confidence requires review. Manual mappings need an audit record outside the public snapshot.

## `ProviderEventPrice`

```ts
interface ProviderEventPrice {
  provider: ProviderId;
  marketType: string;             // provider range type; unlike types stay separate
  minCents: number | null;
  maxCents: number | null;
  currency: CurrencyCode;
  priceBasis: "unknown" | "base" | "all-in";
  capturedAt: IsoUtc;
  sourceIdentifier: string;       // non-secret provider event/range identifier
  maxIsCapped: boolean;
}
```

This is event-level summary data, not inventory. Both bounds may be present, either bound may be nullable when the provider's approved contract permits it, and both may be null to represent no supplied range. Values are bounded, nonnegative safe integer cents; currencies are allowlisted; and a present minimum cannot exceed a present maximum. A malformed range is discarded without discarding its otherwise valid event reference or allowlisted CTA. Ticketmaster Discovery uses `priceBasis: "unknown"` unless authoritative account-specific evidence establishes another basis.

Event prices never become `TicketListing` records and carry no listing ID, seat, quantity, fee-complete total, `rankEligible` flag, or cheapest-price eligibility. Range types and currencies are not merged.

## `TicketListing`

```ts
interface TicketListing {
  id: string;                     // provider-scoped opaque ID or deterministic approved hash
  provider: ProviderId;
  providerEventId: string;
  providerListingId: string | null;
  granularity: "listing";
  quantity: number | null;
  quantityMin: number | null;
  quantityMax: number | null;
  section: string | null;
  row: string | null;
  seatLabels: string[] | null;
  price: {
    amountMinor: number;
    currency: CurrencyCode;
    unit: "per_ticket" | "order_total";
    quantityBasis: number | null;
    feeCompleteness: FeeCompleteness;
    providerDefinition: string | null;
    knownExclusions: string[];
  };
  fulfillment: string | null;
  restrictions: string[];
  outboundUrl: string;
  affiliate: boolean | null;
  observedAt: IsoUtc;
  expiresAt: IsoUtc;
}
```

Event-level ranges belong only in `ProviderEventPrice`; they must not be adapted into this interface. `id` must be stable only for the permitted cache window. URLs require HTTPS and a provider host allowlist. Do not expose seller identity, barcodes, raw ticket images, or seat maps unless separately approved.

## `ProviderStatus`

```ts
interface ProviderStatus {
  provider: ProviderId;
  health: ProviderHealth;
  coverage: Coverage;
  feeCompleteness: FeeCompleteness;
  enabled: boolean;
  lastAttemptAt: IsoUtc | null;
  lastSuccessAt: IsoUtc | null;
  sourceUpdatedAt: IsoUtc | null;
  dataExpiresAt: IsoUtc | null;
  eventCount: number;
  listingCount: number;
  messageCode: string | null;     // bounded, public-safe code; no raw errors
}
```

Coverage describes the highest granularity actually present in the snapshot, not contractual potential. Provider-level fee completeness is the least-complete value among its published prices; listing-level values remain authoritative.

## Coverage and fee summary

```ts
interface CoverageSummary {
  requestedProviders: ProviderId[];
  contributingProviders: ProviderId[];
  eventCoverage: number;          // count, not an inferred percentage
  listingCoverage: number;
  unmatchedProviderEvents: number;
}

interface FeeSummary {
  allInListings: number;
  partialListings: number;
  baseOnlyListings: number;
  unknownListings: number;
  comparableCurrencies: CurrencyCode[];
}
```

No aggregate “best price” should cross currencies, units, quantity bases, granularity, or fee-completeness categories. A UI may compare only like-for-like rows and must label the comparison basis.

## Snapshot

```ts
interface TicketSnapshot {
  schemaVersion: "1.0.0";
  snapshotId: string;             // immutable, non-secret publication ID
  environment: "development" | "production";
  generatedAt: IsoUtc;
  validatedAt: IsoUtc;
  publishedAt: IsoUtc;
  expiresAt: IsoUtc;
  schedule: {
    source: "balldontlie";
    sourceSeason: number;
    sourceUpdatedAt: IsoUtc;
  };
  providerStatuses: ProviderStatus[];
  coverage: CoverageSummary;
  fees: FeeSummary;
  events: TicketEvent[];
}
```

## Validation invariants

- IDs are unique within their scopes; every listing provider/event pair has a matching reference.
- `generatedAt <= validatedAt <= publishedAt < expiresAt`; listing/provider expiry cannot exceed snapshot expiry or approved cache limits.
- Events match the current schedule ID and teams; canceled/completed/byes contain no listings.
- Amounts are non-negative safe integers and currencies/units agree within any comparison group.
- `all_in` requires a non-null approved definition; `unknown` cannot be promoted to an all-in claim.
- Production snapshots contain no synthetic data; development fixtures set `environment: "development"` and use unmistakably fake URLs/IDs.
- Disabled, expired, unmatched, or low-confidence provider data is not displayed.
- Unknown fields, unapproved fields, raw errors, credentials, access tokens, and secret URL-signing material cause validation failure.

## Assumptions and operator decisions

Assumptions: providers can ultimately supply a stable event identifier and an approved outbound URL; the schedule source continues to expose `id`/`game_id`; one currency will normally be USD. None is provider approval.

Operator decisions: JSON Schema versus a TypeScript validator, canonical ID alias storage, accepted currencies, match tolerances, price comparison quantity, tax/delivery treatment, public status-message vocabulary, snapshot retention, and whether section/row/seat fields are permitted per provider.

## Price-history retention gate

No connected production provider currently has an operator-approved historical-retention limit in `provider-matrix.md`. Production history therefore has an effective retention of zero and collection must remain disabled. A provider may contribute only after its dated approval record supplies a positive historical-retention limit. The configured period is capped at the strictest limit among contributors; pending or absent terms fail closed.

Permitted history contains event-level daily summaries only: Pacific observation date, quantity, normalized seat zone, currency, exact minimum/median/nearest-rank P25/P75 all-in group prices, fee-complete sample size, and requested/contributing/missing/stale providers. It contains no listing IDs, raw sections or rows, URLs, seller data, or raw payloads. Missing periods are explicit empty points and are never interpolated. Removing a provider conservatively deletes summaries to which it contributed. The separate UI flag also requires at least seven permitted daily points; history makes no prediction.
