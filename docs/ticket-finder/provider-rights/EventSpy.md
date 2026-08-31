# EventSpy market-observation rights record

Status: **APPROVED ONLY FOR ACCOUNTLESS RETRIEVAL OF ONE EXACT PUBLIC URL, AT MOST TWICE DAILY, WITH NORMALIZED 45-DAY RETENTION.** The repository collector and deployment templates remain disabled by default.

## Authorized scope

- Exact authorized URL: `https://www.event-spy.com/event/seattle-seahawks-seattle-sep-09-2026/374440`
- EventSpy event ID: `374440`
- SFZ game ID: `1392216`
- Retrieval limit: no more than two complete collector executions/top-level navigations per America/Los_Angeles calendar day. Failed attempts count.
- Access method: public and accountless. A bounded headless browser may load the exact page once and parse the visible latest Recharts tooltip when no stable same-origin structured response is available. No login, credential, retry, access-control bypass, or unrelated endpoint is permitted.
- Additional event or performer URLs: **not approved**. Authorization for the exact URL above must not be generalized or fuzzy-matched.

Permission evidence is maintained by the operator outside the public repository. This file records the implementation boundary, not the private evidence itself.

## Allowed normalization and meaning

The normalized `1.0.0` contract stores the exact source URL, game ID, collection time, USD currency, a summary object with its own source timestamps, and a series point containing nullable Ticketmaster, StubHub, VividSeats, and SeatGeek displayed-low observations plus optional bounded section labels.

These values are aggregate lowest/get-in-price observations. They are not individual listings, offers, inventory, availability, or provider minimum/maximum ranges. They are not Ticketmaster Discovery `priceRanges`, Ticketmaster API data, or StubHub API data. There is no provider maximum field. If a future approved aggregation calculates a high across successive lowest-price observations, it must be called `rollingHighOfLowestObservedCents`, not `maxCents`, and requires its own retention approval before implementation.

Parsing is limited to explicit textual labels in the authorized page response. Changed labels, duplicate values, missing identity, malformed USD, or an unmatched URL fail closed. SVG coordinates, canvas pixels, visual chart geometry, and undocumented internal endpoints are prohibited.

## Display, attribution, retention, and brand

- Attribution requirement: any future display must identify “EventSpy,” link to the exact authorized source URL, label the value as an aggregate lowest observed price, show the observation time and fee-basis qualification, and avoid inventory or marketplace-connection claims.
- Retention scope: normalized observations only, for 45 days. No raw HTML, response body, screenshots, browser data, cookies, scripts, or historical backfill may be retained.
- Logo/trademark status: **not approved/unknown**. Use no EventSpy logo or stylized mark; future approved display is limited to the plain-text attribution above unless separate evidence is recorded.
- Takedown contact: **operator confirmation required**. The operator must keep the applicable contact with the external permission evidence before any public display or scheduled retrieval is enabled.

This narrow permission does not approve or enable StubHub, establish a relationship with any marketplace named by EventSpy, or authorize following marketplace links or collecting marketplace data.
