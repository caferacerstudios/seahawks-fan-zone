# Ticket Finder launch-readiness report

**Review date:** 2026-08-29

**Repository baseline:** `7124604` (`Baseline from GitHub dev`)

**Local branch:** `master` (the supplied worktree has no local `dev` branch)
**Decision:** **FAIL — remain in preview.** Do not deploy, promote in primary navigation, or describe the fixture comparison as live or “best across sites.”

## Launch gates

| Gate | Result | Repository evidence |
| --- | --- | --- |
| Two approved listing-level providers covering the same games | **Fail** | No real provider is approved. Ticketmaster and the other matrix entries are `PENDING`; StubHub, TickPick, and TicketNetwork are explicitly disabled pending rights review. All connected fixture providers are fictional. |
| Fee-complete comparable prices | **Fail** | The synthetic fixture has 2 fee-complete admission listings out of 4 (50%). This is test coverage, not authorized live inventory. The home fixture is 2/3 (66.7%); the away fixture is 0/1 (0%). |
| Provider event matches reviewed | **Fail** | `match-review.md` is generated from fictional matcher fixtures and retains one unresolved TBD game. `development.snapshot.json` also contains one unmatched provider event. There is no operator sign-off for live provider event mappings. |
| Stale and outage handling | **Partial** | Source and fixtures model stale/error providers, exclude their listings from the page data, retain last-good sync output, and provide unavailable states. The automated tests could not be executed in this worker because `node` is unavailable. |
| Affiliate and data-display rights documented | **Fail** | Provider-rights files are uncompleted checklists and explicitly state that they are not rights grants. Approved endpoints, fields, price semantics, link formats, attribution, cache/retention, and trademark rights are not recorded. |
| Disclosure, privacy, methodology, provider coverage | **Partial** | Disclosure, privacy, methodology, and on-page coverage content exist. Provider coverage is fictional and provider-specific disclosure/attribution cannot be completed before rights approval. |
| No credentials/confidential provider data in repository or dist | **Partial** | Committed provider data inspected is synthetic and uses `.example.invalid`; source validators prohibit secret-like URL parameters and raw errors. No `dist/` exists to scan, and a build could not be produced. |
| Operator-reviewed deployment assets | **Fail** | Deployment documentation labels operator steps; no dated operator approval evidence is committed. Runtime integration is not complete: `/tickets` still embeds the development fixture at build time. |
| Functional, accessibility, and security tests pass | **Fail** | Test source exists, but no test or build could run because this worker has no `node` or `npm`. No browser/screen-reader/manual results are available. |

The required fail-safe state is preserved: `TICKET_FINDER_STATE` remains `preview`; `/tickets` emits `noindex, nofollow` and is omitted from the sitemap unless the state is `live`; Tickets is absent from primary navigation; schedule, game-detail, and homepage ticket promotion were not added. Existing copy describes a fixture-backed comparison and does not claim “best across sites.”

## Providers and access levels

| Provider | Access/approval level | Launch contribution |
| --- | --- | --- |
| Ticketmaster | Discovery API approved for event-summary fields only; no listing or Inventory Status access | Event summaries only; excluded from listing-price ranking |
| StubHub | `PENDING`; adapter disabled and fail-closed | None |
| TickPick | `PENDING`; adapter disabled and fail-closed | None |
| TicketNetwork | `PENDING`; adapter disabled and fail-closed | None |
| Other providers in `provider-matrix.md` | `PENDING` or otherwise not launch-approved | None |
| `fictional-box-office`, `fictional-verified`, `fictional-market-a`, `fictional-market-b` | Synthetic listing-level fixtures only | QA only |
| `fictional-summary` | Synthetic event-summary fixture | Not ranked; QA only |
| `fictional-links` | Synthetic deep-link-only fixture | No price data; QA only |
| `fictional-stale` / `fictional-outage` | Synthetic stale/error fixtures | Excluded; QA only |

## Coverage by upcoming fixture game

| Stable fixture game ID | Traits represented | Listing provider coverage | Fee-complete admission coverage | Match state |
| --- | --- | --- | --- | --- |
| `fictional-game-home-001` | Home, division, prime-time-capable schedule metadata | 4 synthetic listing providers | 2/3 admission listings (66.7%) | High-confidence synthetic references; no live operator review |
| `fictional-game-away-012` | Away, non-division, rescheduled | 1 synthetic listing provider | 0/1 (0%); the listing is `estimated` | Only one synthetic provider |

Overall synthetic admission fee completeness is **2/4 (50%)**. Parking is intentionally separate and excluded from admission comparison. These figures must not be presented as live marketplace coverage.

## Unmatched events

- `development.snapshot.json` contains `fictional-market-b:FAKE-UNMATCHED-999` with `EVENT_UNMATCHED`; it is not published.
- `match-review.md` retains `sea:fixture-game-tbd` as `review-required`.
- Bad-shell, parking, wrong-team/date/venue, ambiguous, and non-NFL candidates are represented in matcher test source, but were not executed during this review.

## Stale-data and outage behavior

- Page assembly excludes listings from providers whose status is `stale`, `error`, or `disabled`.
- Ranking source excludes expired offers and providers passed in the stale set; unknown/estimated fees are not eligible for cheapest ranking.
- The sync pipeline test source asserts failed refreshes retain the prior last-good snapshot.
- Nginx returns a JSON 404 with `no-store` when runtime ticket data is unavailable and does not configure `stale-if-error`.
- A ticket-data failure is isolated from existing static routes because the web service does not depend on the sync service. However, the current Ticket Finder page consumes a committed fixture rather than the runtime JSON, so live slow/failed-request behavior is not integrated end to end.

## Correctness review

Static source and fixture inspection confirms the intended rules: quantities are explicitly constrained to integers 1–8; supplied group totals take precedence; ambiguous group totals are not multiplied; official and resale source labels are distinct; stale/expired offers and unknown/estimated fees are excluded from price ranking; affiliate commission fields are prohibited and not ranking inputs; outbound URLs require HTTPS and an exact provider host allowlist; provider timestamps are displayed; and similar inventory is labeled without claiming or summing unique tickets.

This is not a completed launch correctness review. The representative data is fictional, the test runner was unavailable, and no authorized outbound event/destination could be exercised.

## QA matrix

| Area | Fixture/source coverage | Result this review |
| --- | --- | --- |
| Home/away, division/non-division, rescheduled | Development and matching fixtures | Source-inspected only |
| Prime-time and TBD kickoff | Schedule/matching test source | Source-inspected only |
| Quantities 1–8 and invalid query parameters | Ranking and UI-state test source | Source-inspected only |
| No fee-complete results, unknown fees, parking-only, empty event | Ranking/page state source | Source-inspected only |
| One/all providers down and stale provider | Provider status fixtures and sync tests | Source-inspected only |
| Bad event match | Matcher fixtures and review report | Source-inspected only |
| Mobile, tablet, desktop | Responsive CSS exists | **Not run; human review required** |
| Keyboard and screen-reader landmarks/labels | Semantic labels, live regions, nav keyboard handlers exist | **Not run; assistive-technology review required** |
| Reduced motion | CSS/source must be checked in a browser | **Not run** |
| JavaScript disabled | A `<noscript>` fallback and server-rendered fixture cards exist | Source-inspected only; browser test not run |
| Slow/failed ticket JSON | Runtime 404 behavior is documented/configured | **Not integrated or browser-tested** |

## Accessibility results

No accessibility gate can be marked passing. Static review found labeled primary/footer navigation, associated ticket form labels, a results live region, descriptive outbound-link labels, a `<noscript>` fallback, and keyboard handlers for navigation. There is no executed automated accessibility report, keyboard walkthrough, screen-reader run, reduced-motion run, or viewport matrix. All are manual blockers before launch.

## Performance results

- Measured source sizes with `wc -c`: `src/pages/tickets.astro` 32,877 bytes; development snapshot 11,591 bytes; ticket library modules/types 51,648 bytes total.
- No ticket-page production asset or JSON transfer size is available because `dist/` does not exist and the build toolchain is unavailable.
- The page imports and embeds the committed development snapshot at build time. It does not fetch only the selected event's full runtime listing snapshot. This fails the selected-event loading gate for a live integration.
- No dependency change was made. Astro is the only declared runtime dependency.
- Static/non-ticket route regression is unverified because neither build nor tests could run.

## Security results

Static review found exact HTTPS host allowlisting, rejection of credentials and secret-like query parameters, sponsored/nofollow/noopener affiliate links, plain-text/provider-note validation, prohibited seller/commission/raw-error fields, and no redirect endpoint. Ticket links are selected only after URL validation, so no application open redirect was identified in source.

The gate remains failed:

- No `dist/` was available for a secret-pattern scan.
- Security tests could not execute without Node.
- The Nginx runtime prefix serves only `/srv/ticket-data/current/`, disables indexing, fixes JSON content type, and returns a controlled 404. However, there is no executed Nginx test proving environment files and temporary snapshots cannot be exposed, and the general static root has no explicit dotfile deny rule. Operator validation is required against the actual packaged image and mount layout.
- Real provider hosts, approved redirects, sanitization rules, and retention constraints cannot be finalized before rights approval.

## SEO and AdSense

Preview behavior is correct in source: `/tickets` is `noindex, nofollow`, canonicalized to `/tickets`, excluded from the sitemap until `live`, and absent from navigation. Original comparison methodology, buying guidance, disclosure, and provider coverage surround the results. Ticket results disable monetization and contain no ad components or `Offer` structured data, reducing the risk of ads being mistaken for listings. Fixture notes are synthetic, not copied marketplace content. Browser/rendered-output verification remains outstanding.

## Remaining risks and blocking items

1. Obtain and record at least two approved listing-level provider agreements that cover the same Seahawks games, including display, affiliate, all-in fee, attribution, cache/retention, trademark, and link rights.
2. Complete operator review of live provider event matches and clear every unresolved/unmatched event before publication.
3. Replace the build-time development fixture path with a validated runtime flow that requests only the selected event and degrades safely.
4. Achieve fee-complete live coverage sufficient for meaningful same-game comparison; unknown/estimated fees must remain unranked.
5. Run the complete Node test suite, offline production build, fixture validator, performance budget, accessibility automation, and security checks in an environment with the repository toolchain.
6. Complete keyboard, screen-reader, reduced-motion, JavaScript-disabled, slow/failure, and responsive visual review.
7. Scan the generated `dist/` and changed repository files for credential/confidential-data patterns without reading protected secret stores.
8. Have an operator review deployment assets and prove Nginx cannot expose dotfiles, environment files, staging files, or temporary snapshots.
9. Validate authorized outbound destinations/events and provider timestamps against approved test accounts without committing confidential data.

## Manual review checklist

- [ ] Approvals for two same-game listing providers are dated and linked from the provider matrix.
- [ ] Fee semantics and displayed group totals are reconciled to authorized test checkout for quantities 1–8.
- [ ] Official/resale, parking, fee-unknown, stale, outage, empty, unmatched, and rescheduled states are visually correct.
- [ ] Mobile (320/375/390/430 px), tablet (768/1024 px), and desktop layouts have no clipping, crowding, or misleading hierarchy.
- [ ] Complete keyboard traversal, visible focus, menu behavior, filter operation, result announcements, and outbound-link context are verified.
- [ ] Screen-reader landmarks, headings, form labels, status announcements, price context, provider/source labels, and disclosures are verified.
- [ ] Reduced-motion and JavaScript-disabled behavior remains usable.
- [ ] Slow, 404, malformed, stale, and all-provider-failed runtime responses preserve official links and do not break game/non-ticket pages.
- [ ] Canonical, robots, sitemap exclusion, absence from primary nav, and ad separation are verified in rendered output.
- [ ] Repository and generated distribution scans are clean; deployed Nginx blocks sensitive/transient files.
- [ ] Operator signs off exact deployment artifacts and rollback rehearsal.

## Exact pages requiring human visual review

- `/tickets/`
- `/tickets/?game=fictional-game-home-001&quantity=1` through `quantity=8`
- `/tickets/?game=fictional-game-away-012&quantity=2`
- `/tickets/?game=invalid&quantity=9&sort=commission`
- `/schedule/`
- `/games/fictional-game-home-001/`
- `/`
- `/disclosure/`
- `/privacy-policy/`
- `/methodology/#ticket-comparisons`

The schedule, game-detail, and homepage URLs are included to confirm that preview Ticket Finder promotion remains absent and their existing content/hierarchy is unchanged. Before a future live integration, repeat review on every upcoming game-detail URL that receives a ticket summary.

## Rollback

1. Set `TICKET_FINDER_STATE` to `disabled` to retain the route with a safe unavailable message, or remove the route from the deployed static artifact after operator review. No provider-data rebuild is required.
2. For a future promoted release, remove the Tickets entry from `navPages` and any schedule, game-detail, and homepage ticket callouts; none exist in this preview baseline.
3. Disable the ticket sync timer/service in the operator environment and remove only the reviewed `/data/tickets/` Nginx location/mount. Do not delete provider data as part of the immediate rollback.
4. Restore the previously reviewed web artifact/configuration and verify `/`, `/schedule/`, representative `/games/<id>/`, static assets, and 404 behavior.
5. The prior static site remains independent of the ticket runtime directory: the web service has no dependency on ticket sync, and missing runtime JSON returns an isolated 404. This architectural property still requires deployment rehearsal before launch.

## Commands and evidence used

Executed read-only commands included `git status --short --branch`, `git branch --list`, `git log -1 --oneline --decorate`, targeted `rg`, `sed`, `jq`, `find`, and `wc -c` inspections over the files cited above. `node --test tests/*.test.mjs` was attempted and failed immediately with `/bin/bash: node: command not found`; `command -v node` and `command -v npm` returned no path. No build, server, network request, external service, deployment, commit, push, or merge was performed.
