# Ticket Finder Architecture

## Audit basis and limitations

This document describes the repository snapshot at HEAD `3b04646f3ade50f38bffeca6b71c4cfc4d6d2329` on 2026-08-29. The controller metadata says the source branch is `dev` (`.source-branch`) at source commit `9a35f025c2f708189c4d4348c984ce3e5419eec1` (`.source-commit`), while the local checkout is a single branch named `master` whose commit message is `Baseline from GitHub dev`. No remote was contacted, so exact equality with the live remote `dev` tip is **not verified**.

The generated and untracked `src/data/nfl/` directory is absent. Conclusions about its shape come from import sites, normalization code, tests, and generation scripts, not from a current generated payload. This is an audit limitation.

## Current architecture

- Astro is declared as `^5.16.6` and locked at `5.16.6`. `astro.config.mjs` does not set `output`, so Astro's default static output applies. The site URL is `https://seahawksfanzone.com`; local Astro binds port 4322.
- Routes are filesystem routes in `src/pages/`. Most Seahawks pages use `src/layouts/SeahawksLayout.astro`, which wraps `BaseLayout.astro`, the shared primary navigation, footer, breadcrumbs, privacy choices, and structured data. The unrelated retro pages, including `/games-for-sale`, use `BaseLayout` directly.
- Global styling is `public/styles/main.css`; components and pages also use scoped `<style>` blocks. Existing schedule UI is split between `src/pages/schedule.astro`, `src/components/ScheduleList.astro`, `src/components/UpNext.astro`, `src/lib/schedule.mjs`, and `src/lib/schedule-display.mjs`.
- `scripts/fetch-nfl.mjs` fetches Ball Don't Lie NFL data using `BALLDONTLIE_API_KEY`, normalizes it, and atomically writes schedule/stat files beneath generated `src/data/nfl/`. Schedule and game-detail routes import `seahawks.json`; game detail also imports generated recaps, players, and optionally standings. The stable game key is the upstream `game.id`, falling back to `game.game_id`. A synthesized `${season}-${phase}-${week}-${state}` key exists only when neither is present; index is a final route fallback in game-page code and should not be used for ticket matching.
- `/schedule` uses `season=<year>`, one `status=all|upcoming|completed`, and repeated `filter=` values. Allowed filters are `home`, `away`, `division`, `prime-time`, `preseason`, `regular`, and `postseason`. Location and phase selections are OR groups; division and prime-time are AND constraints. Client updates use `history.pushState`; season changes navigate.
- Policy/information routes exist at `/disclosure`, `/privacy-policy`, `/methodology`, and `/sources`. Methodology and sources say structured sports data refreshes during builds. Disclosure covers generic affiliate links but not ticket price semantics or provider-specific attribution. Privacy describes conditional AdSense, Cloudflare analytics, CMP behavior, logs, and external links.
- `BaseLayout` emits canonical, robots (default `index, follow`), Open Graph/Twitter metadata, and JSON-LD. `SeahawksLayout` adds `WebSite` on home, `BreadcrumbList`, and page-supplied data; game recaps can emit `NewsArticle`. `src/pages/sitemap.xml.ts` explicitly composes public/dynamic URLs; `public/robots.txt` allows all and advertises the main and news sitemaps. A future `/tickets` page will not enter the sitemap automatically.
- Package scripts are `dev`, `fetch-nfl`, `generate-game-recaps`, `generate-player-profiles`, `prebuild`, `build`, `preview`, `astro`, and `fetch-ebay`. There are tracked `node:test` files but no `test`, `check`, `validate`, or ticket-refresh npm script. Two standalone validation/performance scripts exist but are not wired into `package.json`.
- Deployment files are only `docker-compose.yml` and `nginx/default.conf`. Compose serves `./dist` read-only with `nginx:alpine` on host port 4322. Nginx uses static `try_files`, immutable `/_astro/` caching, and seven-day caching for named static assets. There is no Dockerfile, tracked CI/CD directory, or deployment script.
- `/games-for-sale` is a legacy retro-game/eBay listing page backed by `src/data/ebay.json` and `scripts/fetch-ebay.mjs`. It is unrelated and must not be repurposed. No `/tickets`, `/ticket-finder`, or other ticket-marketplace route exists.
- Generic external-link analytics exists in `src/lib/analytics.ts`, gated by its own consent checks. `BaseLayout` exposes CMP-derived `window.sfzPrivacy` and emits `sfz:privacy-consent`; the analytics module listens for `sfz:consent-change` and legacy `sfzConsent`/local-storage values. This naming mismatch is a current integration risk to resolve before ticket click measurement. No ticket-specific outbound event or affiliate-link utility exists. The Impact verification meta tag is evidence only of site verification, not approval for any planned provider. Environment toggles exist for ads/analytics and homepage freshness, but there is no general feature-flag system.

## Recommended `/tickets/` design

Use a new `src/pages/tickets.astro` page rendered with `SeahawksLayout`; do not reuse `/games-for-sale`. Add `Tickets` to navigation only at launch. Follow the site's canonical convention (`/tickets` canonical path; `/tickets/` is the user-facing route resolved by static hosting).

The built page should contain useful editorial guidance, disclosures, update time, coverage/fee warnings, and a no-data state. At build time it should import one validated, publishable snapshot from a non-secret path. The browser may filter/sort the embedded snapshot, but it must not call providers, contain credentials, or calculate undisclosed approximations.

Recommended separation:

1. An independently scheduled synchronization job uses server-side provider adapters and secrets.
2. Each adapter maps only contract-approved fields into the canonical contract, records provider health, and writes a candidate snapshot.
3. Validation checks schema, event identity, currency, timestamps, price/fee semantics, URLs, duplicates, expiry, and provider authorization.
4. Publication atomically promotes the candidate to the last-known-good snapshot only if launch gates pass.
5. Astro reads the promoted snapshot and emits static HTML. Filters and sorting operate on that bounded data in the browser.

### Why synchronization must not be in `npm prebuild`

The current `prebuild` is already coupled to network data and credentials. Ticket synchronization has stricter, provider-specific quotas, contracts, cache/retention rules, partial-failure behavior, and potentially long pagination. Coupling it to every site build would make editorial deploys consume provider quota, allow one provider outage to block all publishing, risk replacing good inventory with partial data, make rollbacks nondeterministic, and broaden production-secret exposure to the build environment. A separately scheduled job permits rate-aware refreshes, last-known-good retention, independent alerting, and reproducible Astro builds.

**Operator decision required:** whether to also decouple the existing NFL refresh from `prebuild`; that is outside ticket-finder scope.

## Data and secret boundaries

### Development

- Default to a committed, synthetic fixture with clearly fake listing IDs/URLs and no real inventory. Proposed path: `src/data/tickets/fixtures/development.snapshot.json`.
- Allow an explicit local override to a validated real snapshot only for authorized developers. It must be ignored by Git and never be copied into logs or review artifacts.
- Provider adapters should accept injected clients and use recorded/synthetic responses in tests. No tests should contact providers.

### Production

- Provider credentials and affiliate identifiers live only in the synchronization job's secret store. They must never use `PUBLIC_` names, enter Astro imports, client bundles, snapshot files, build logs, or Docker/Nginx configuration.
- The publishable snapshot contains approved display fields and outbound URLs only. Treat provider-supplied URLs as data requiring scheme/host allowlisting.
- Affiliate parameters may appear in approved outbound URLs if contracts permit publication; raw secret signing keys must not. Prefer generating expiring/signed links in the private sync job when required.

**Operator decisions required:** job platform, secret store, object/storage location, ownership of credential rotation, approved production provider set, and whether affiliate click measurement requires consent in each served jurisdiction.

## Recommended runtime paths

- Source page: `src/pages/tickets.astro`
- Ticket components: `src/components/tickets/`
- Canonical types/schema/validation: `src/lib/tickets/`
- Synthetic fixture: `src/data/tickets/fixtures/development.snapshot.json`
- Build-consumed promoted snapshot: `src/data/tickets/published.snapshot.json`
- Private synchronization entry point: `scripts/tickets/sync.mjs`
- Provider adapters: `scripts/tickets/providers/`
- Candidate and last-known-good working data: an operator-selected storage path outside `dist/` and outside Git
- Static URL: `/tickets/`

The exact snapshot delivery mechanism is an **operator decision**. If the independent job cannot securely update the build workspace, publish versioned JSON to approved object storage and have a controlled promotion step copy a validated version into the build input. Do not have the public browser fetch a secret-bearing API.

## Failure and rollback design

- Never overwrite the promoted snapshot in place. Write a versioned candidate, validate it, then atomically change the promoted reference/copy.
- Preserve at least one prior publishable version, subject to every provider's retention limit. Because all limits are currently unverified, production retention is **PENDING** and must not begin until approved.
- Mark each provider `healthy`, `degraded`, `stale`, `disabled`, or `error`; omit expired listings rather than implying availability. Page-level `generatedAt`, `publishedAt`, `expiresAt`, and provider `lastSuccessAt` must be visible/usable.
- A provider failure must not erase other valid providers. A full refresh failure leaves the last-known-good snapshot in place until its expiry; after expiry render an honest unavailable state, not stale prices.
- Roll back by promoting the prior validated version and rebuilding/redeploying the static site. The rollback must not rerun synchronization.
- Reject candidates with unknown fee semantics, malformed currency, duplicate canonical IDs, unmatched games, schedule conflicts, disallowed provider fields, or timestamps beyond contractual cache limits.
- Flexed/rescheduled games trigger rematching and operator review when venue, teams, or kickoff materially diverge. Never match solely on time.

**Operator decisions required:** freshness thresholds, page-level expiry, minimum provider coverage, alert destinations, rollback retention count, and who can approve manual event matches.

## Route cleanup recommendation

Keep `/games-for-sale` unchanged during implementation. Separately decide whether the off-brand legacy route should remain, be removed, or redirect to a retro-property destination. It must not redirect to `/tickets/`, because its meaning and audience are unrelated. No redirect or cleanup is performed by this task.

## Explicit non-goals

The Ticket Finder will not scrape or reverse-engineer any marketplace. It will not perform checkout, accept payments, operate seller accounts, list inventory for sellers, transfer tickets, or provide white-label ticket sales. It will only compare and link to authorized provider inventory under verified contracts.
