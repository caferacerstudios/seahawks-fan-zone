# EventSpy market-observation rights record

Status: **APPROVED ONLY FOR ACCOUNTLESS RETRIEVAL OF ONE EXACT PUBLIC URL, AT MOST TWICE DAILY.** The repository implementation is parser-only and disabled by default. It does not schedule or perform retrieval.

## Authorized scope

- Exact authorized URL: `https://www.event-spy.com/event/seattle-seahawks-seattle-sep-09-2026/374440`
- EventSpy event ID: `374440`
- SFZ game ID: `1392216`
- Retrieval limit: no more than twice daily.
- Access method: public, accountless retrieval only. No account, authentication, credential, session, secret, browser automation, undocumented endpoint, or internal API is approved.
- Additional event or performer URLs: **not approved**. Authorization for the exact URL above must not be generalized or fuzzy-matched.

Permission evidence is maintained by the operator outside the public repository. This file records the implementation boundary, not the private evidence itself.

## Allowed normalization and meaning

The allowed normalized fields are `source`, `sourceEventId`, `sourceUrl`, `sfzGameId`, `metric`, `priceCents`, optional `sevenDayLowCents`, optional `winnerMarketplace`, `currency`, `feeBasis`, `observedAt`, `fetchedAt`, and `samplingCadence`. The fixed source is `eventspy`, metric is `aggregate-lowest-observed`, currency is `USD`, and cadence is `twice-daily`. Fee basis is either `estimated-fees-and-taxes-where-available` or `unknown`.

These values are aggregate lowest/get-in-price observations. They are not individual listings, offers, inventory, availability, or provider minimum/maximum ranges. They are not Ticketmaster Discovery `priceRanges`, Ticketmaster API data, or StubHub API data. There is no provider maximum field. If a future approved aggregation calculates a high across successive lowest-price observations, it must be called `rollingHighOfLowestObservedCents`, not `maxCents`, and requires its own retention approval before implementation.

Parsing is limited to explicit textual labels in the authorized page response. Changed labels, duplicate values, missing identity, malformed USD, or an unmatched URL fail closed. SVG coordinates, canvas pixels, visual chart geometry, and undocumented internal endpoints are prohibited.

## Display, attribution, retention, and brand

- Attribution requirement: any future display must identify “EventSpy,” link to the exact authorized source URL, label the value as an aggregate lowest observed price, show the observation time and fee-basis qualification, and avoid inventory or marketplace-connection claims.
- Retention scope: **operator confirmation required before persistence, history, caching, or publication.** Until documented confirmation exists, parser output must not be added to runtime snapshots or production data. Permission to retrieve twice daily is not treated as permission to retain history.
- Logo/trademark status: **not approved/unknown**. Use no EventSpy logo or stylized mark; future approved display is limited to the plain-text attribution above unless separate evidence is recorded.
- Takedown contact: **operator confirmation required**. The operator must keep the applicable contact with the external permission evidence before any public display or scheduled retrieval is enabled.

This narrow permission does not approve or enable StubHub, establish a relationship with any marketplace named by EventSpy, or authorize following marketplace links or collecting marketplace data.
