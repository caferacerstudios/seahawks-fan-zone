# Ticket snapshot synchronization

Ticket synchronization is a server-side, one-shot process. It is not called by Astro rendering, `prebuild`, `build`, the NFL refresh, or OpenAI generation. No browser route invokes provider adapters.

## Configuration

All adapters are disabled unless explicitly enabled. Configuration is validated before provider work starts.

- `TICKETS_ENV`: `development` (default) or `production`.
- `TICKETS_OUTPUT_DIR`: snapshot publication directory. Defaults to `runtime/tickets/current` in development. Production must set this or `TICKETS_OUTPUT_DIR_PRODUCTION` explicitly. `TICKETS_OUTPUT_DIR_DEVELOPMENT` and `TICKETS_OUTPUT_DIR_PRODUCTION` support separate destinations.
- `TICKETS_GAMES_FILE`: canonical schedule input; defaults to `src/data/nfl/seahawks.json`.
- `TICKETS_OVERRIDES_FILE`: provider match overrides; defaults to `src/data/tickets/match-overrides.json`.
- `TICKETS_PROVIDERS_JSON`: JSON object keyed by adapter id. Each entry has `enabled`, `mode` (`listing-level`, `event-summary`, `deep-link-only`, or `pending`), and optional `minRefreshMs`, `retentionMs`, `timeoutMs`, `maxRetries`, and `rateLimitMs`.
- `TICKETS_FIXTURE`: exactly `true` enables local fixture mode.
- `TICKETS_FIXTURE_FILE`: optional local provider fixture path.
- `TICKETS_LOCK_STALE_MS`: age after which abandoned staging directories can be removed; minimum 60 seconds.
- `TICKETS_PROVIDER_SHELL_API_KEY`: credential expected by the disabled real-provider shell if it is ever configured. The shell remains pending and cannot currently be enabled.
- `TICKETMASTER_API_KEY`: server-side Ticketmaster Discovery API consumer key. The Ticketmaster adapter also accepts `TICKETMASTER_EVENT_NAME`, `TICKETMASTER_EVENT_DATE`, and `TICKETMASTER_LEGACY_EVENT_ID`; their defaults identify the September 9, 2026 Patriots game at Lumen Field.

Credential values belong only in the server process environment. Provider configuration names the credential environment variable, never its value. Do not place credentials in JSON, fixture files, command-line URLs, logs, or public environment variables. The sync emits only bounded safe error codes.

## Usage

Run a no-network complete synchronization with:

```sh
TICKETS_FIXTURE=true TICKETS_OUTPUT_DIR=/var/tmp/sfz-tickets npm run tickets:sync
```

Normal one-shot invocation is `npm run tickets:sync`. Ticketmaster uses only the documented Discovery API v2 event search and is an event-summary provider; `provider-shell` is disabled and pending by default. Fixture mode activates only `fixture-market` using `scripts/tickets/fixtures/provider.json` and needs no credentials or network.

The `stubhub` registry entry is also unconditionally pending and disabled. It has no credential variable or hostname allowlist, and configuration rejects attempts to enable it until the operator-reviewed checklist in `docs/ticket-finder/provider-rights/StubHub.md` is complete and the approval matrix is updated.

## Snapshot contract and lifecycle

The configured directory contains:

- `index.json`: schema version, generation time, overall outcome, and lightweight event summaries and relative event-file paths. It never contains listing arrays.
- `status.json`: schema version, generation time, duration, environment, fixture flag, aggregate counts, and each provider's mode, state, safe error code, last success, last attempt, next eligible attempt, and counts.
- `events/<event-key>.json`: schema version, generation time, canonical game metadata, matched provider references, and separate `admission`, `parking`, and `other` listing arrays.

Every generated file is validated in a sibling temporary directory. Published JSON is mode `0644` because it is public HTTP data read by an unrelated Nginx container UID; credentials and raw provider responses are prohibited from this tree. Publication occurs only after all files pass. A sibling lock prevents concurrent publishers. The prior snapshot is moved aside immediately before the staged directory is renamed into place; it is restored if that rename fails. Failed preparation leaves the prior snapshot untouched. Old abandoned staging directories are removed only when their names match this output and they exceed the configured stale age.

Provider failures degrade only that provider. Within its configured retention period, its last-good listings remain marked `stale: true` and `rankEligible: false`; after retention they are dropped. Refresh eligibility honors each provider's minimum interval. HTTP adapters use allowlisted HTTPS hosts, explicit timeouts, bounded retries, exponential backoff with jitter, request spacing, bounded pagination expectations, and an identifying User-Agent. Browser automation and undocumented endpoints are prohibited.

Input normalization rejects low-confidence event matches. Output validation rejects negative or non-integer prices, non-USD currencies, credentials in URLs, non-allowlisted hosts, seller PII fields, and unsafe notes. Raw provider responses and errors are never published.
