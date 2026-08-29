# Ticket Provider Approval Matrix

Repository evidence contains no provider contracts, credentials, API clients, approved field lists, or provider-specific affiliate utilities. A public website is not evidence of API, feed, affiliate, caching, trademark, or display permission. Consequently every capability below defaults to **PENDING**.

`PENDING` means “not verified and must not be implemented or represented as approved.” It does not mean denied or unavailable.

| Provider | Access status | Data granularity | Affiliate status | Approved fields | All-in fee definition | Rate limit | Refresh limit | Cache limit | Historical-retention limit | Logo/trademark rights | Required attribution | Approval/document source | Implementation status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ticketmaster | PENDING | PENDING (event-level or listing-level) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| SeatGeek | PENDING | PENDING (event-level or listing-level) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| StubHub | PENDING | PENDING (event-level or listing-level) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | Blocked checklist: `provider-rights/StubHub.md` (not approval evidence) | DISABLED — rights summary incomplete |
| TickPick | PENDING | PENDING (event-level or listing-level) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | Blocked checklist: `provider-rights/TickPick.md` (not approval evidence) | DISABLED — rights summary incomplete |
| TicketNetwork | PENDING | PENDING (event-level or listing-level) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Vivid Seats | PENDING | PENDING (event-level or listing-level) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Gametime | PENDING | PENDING (event-level or listing-level) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |

## Evidence required to leave `PENDING`

For each provider, the operator must retain a dated, authoritative approval or contract source that identifies the approved account/application and environment. It must explicitly settle:

- authorized API/feed and whether it supplies event aggregates, individual listings, or both;
- affiliate participation, allowed link construction, permitted channels, and disclosure text;
- each displayable field, price/fee meaning, currency, seat/location data, images, and deep-link rules;
- request rate, permitted refresh cadence, cache lifetime, and raw/normalized/historical retention;
- logo, word-mark, ticket image, and seat-map rights;
- attribution, freshness, sorting, parity, and takedown requirements;
- sandbox versus production access and any territory restrictions.

The approval/document source should be an operator-controlled contract record, provider portal grant, or direct written approval—not a public marketing or documentation page alone. Legal/operator review is a launch gate. The repository's Impact verification meta tag does not prove any provider relationship.

## Operator decisions

- Name the owner who verifies and dates each row.
- Choose the minimum approved provider coverage required for launch.
- Decide whether providers with only event-level “starting at” data may appear; if so, they must not be mixed with comparable listing rows without a clear presentation boundary.
- Establish a contract-change review cadence and an immediate disable mechanism per provider.
