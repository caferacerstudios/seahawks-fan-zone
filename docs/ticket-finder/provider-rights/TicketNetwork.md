# TicketNetwork integration — blocked pending operator review

**Status:** `PENDING`; adapter disabled. This file is a checklist, not a rights grant or a summary of TicketNetwork terms.

The repository contains no operator-reviewed, non-confidential approval source for TicketNetwork. Do not add credentials, make live calls, construct provider URLs, infer price semantics, or enable the adapter until an operator records and dates all decisions below. Public website behavior and undocumented endpoints are not acceptable evidence.

## Required approval record

- [ ] Approval owner, review date, approved account/application, environment, territory, and authoritative non-confidential source are recorded.
- [ ] The exact approved endpoint or feed is named, including whether it supplies individual listings and its permitted pagination method and bound.
- [ ] Every listing field allowed for public display is enumerated, including provider/listing IDs, raw section/row, supported quantities and split rules, restrictions, delivery, accessibility, obstructed/limited view, and source kind.
- [ ] “All-in price” is defined for a selected or supported quantity, including treatment of per-ticket fees, order-level fees, taxes, delivery, currency, and exact decimal-to-minor-unit conversion. The record states when `allInGroupTotalCents` may be calculated and which `feeCompleteness` value applies when fields are missing.
- [ ] Required provider attribution and affiliate disclosure wording and placement are recorded.
- [ ] The approved canonical/affiliate-link format and exact hostname allowlist are recorded, including permitted parameters and encoding rules.
- [ ] Request rate, retry behavior, bounded page/request limit, and minimum refresh interval are recorded.
- [ ] Cache duration, stale/last-good use, raw-response retention, normalized listing retention, and historical retention/deletion limits are recorded.
- [ ] Logo, word-mark, and other trademark permissions are recorded (or text-only attribution is explicitly required).
- [ ] Cancellation, event removal, listing removal, takedown timing, and provider-disable requirements are recorded.
- [ ] Parking and other non-admission classification signals are documented sufficiently to exclude them from ticket results.
- [ ] Credential names and server-side authentication method are approved without committing any credential value.
- [ ] The canonical matcher inputs and acceptable mismatch/cancellation signals are documented.
- [ ] Notes fields permitted for ingestion and the sanitization rules needed to exclude markup, scripts, seller PII, and private data are documented.

## Work intentionally blocked

Until every item above is complete and the TicketNetwork row in `provider-matrix.md` leaves `PENDING`:

- the `ticketnetwork` registry entry has no credential environment variable and no allowed hostname;
- configuration rejects any attempt to enable it, including fixture or production configuration;
- its interface fails closed with `RIGHTS_APPROVAL_REQUIRED` if called directly;
- no TicketNetwork response fixtures, field mappings, event requests, listing pagination, affiliate URLs, fee calculations, refresh/cache/retention values, attribution, or trademarks are represented as approved;
- TicketNetwork cannot contribute listings, provider status success, ranking, or launch-provider coverage;
- Ticket Finder remains in preview mode and does not gain a launch-qualified listing provider from this shell.

After approval, recorded sanitized fixtures and contract tests must cover multiple pages, no inventory, changing price, quantity splits, order-level fees, missing fee fields, stale inventory, removed listings, canceled events, parking contamination, malformed URLs, rate limits, transient outages, authentication failure, and event mismatch. Those cases cannot be accurately modeled as TicketNetwork contract fixtures until the approved response and lifecycle contract is known.
