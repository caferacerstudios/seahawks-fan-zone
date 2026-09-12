# Seattle roster, injuries and transactions from Airflow

The `sfz_roster_refresh` DAG in `caferacerstudios/homelab-airflow` reads the
existing `fan_zone_active_sites` variable and publishes separate collections for
enabled teams. Seattle uses `/var/lib/sfz-roster/current`. This website imports
that collection at build time. Player performance statistics stay in
`sfz_nfl_refresh`; daily articles and game recaps keep their existing pipelines.

## First cutover

1. Install the Airflow roster deployment and run `refresh_roster_seahawks` once.
   Inspect its receipt and the dated roster, injury and transaction files before
   relying on the new collection. An unavailable injury report is explicitly
   labeled; it does not mean the roster has no injuries.
2. Make the complete `/var/lib/sfz-roster` parent readable inside the existing
   Node build container. Mounting the parent allows the `current` symlink to
   resolve into its immutable snapshot. Keep the existing NFL, recap, news and
   other build mounts.

   Add these arguments to the existing Docker build command:

   ```sh
   --mount type=bind,src=/var/lib/sfz-roster,dst=/var/lib/sfz-roster,readonly \
   -e ROSTER_SNAPSHOT_DIR=/var/lib/sfz-roster/current
   ```

   Direct builds on `wkr` already see the host path and need no Docker mount.
   `docker-compose.yml` has no Node build service, so it needs no roster mount.
   The nginx container only serves the built HTML; roster source files do not
   need a public web mount.
3. In the checkout, or inside that existing builder, validate without writing:

   ```sh
   cd /home/laurawkr/seahawksfanzone
   node scripts/import-roster-snapshot.mjs --check-only
   ```

4. Use the existing production build and publication procedure. Review
   `/players`, `/team/injuries`, `/team/transactions` and a player profile before
   treating the cutover as complete. This code change itself does not restart
   containers, trigger a collector, or publish the production site.

## Build behavior

The normal `npm run build` lifecycle now imports the NFL snapshot first, imports
the roster collection second, then retains the existing recap/news import and
player-profile generation steps. The old `refresh-team-roster.mjs` web scraper
is no longer invoked by `prebuild`. The explicit `npm run refresh-team-roster`
command remains available for manual maintenance, but it is not the routine
source after cutover.

`npm run build:offline` imports the available roster collection through its
`prebuild:offline` hook before Astro renders. This also covers the existing
`build:production-offline` command, which delegates to `build:offline`. The
roster import makes no web requests and does not generate profile prose or
change how the separate NFL, recap and news snapshots are refreshed.

The importer checks the collection's team, schemas, provenance, timestamps,
source availability, verified identity fields and SHA-256 manifest before
replacing `src/data/team/roster.json`, `injuries.json` and `transactions.json`.
It also projects current roster membership into existing Seattle NFL JSON so
all readers agree. NFL statistics, their source season and their refresh time
are preserved. Unverified roster identities do not inherit historical stats
merely because their names match.

Both build hooks use `--if-available` for the initial migration. If there has
never been a roster collection, the existing Seattle files and their dates are
retained. Seed the first snapshot before deploying this change so that fallback
does not conceal an unfinished cutover. A broken symlink, wrong-team collection
or invalid manifest fails the build instead of silently reverting to old data.

Snapshots older than 72 hours produce a warning and retain their actual source
dates. Set `ROSTER_SNAPSHOT_MAX_AGE_HOURS` to a positive number only if you want
a strict build failure after that age. An unavailable injury report retains
dated history without presenting an old game-week designation as current.

## Verification

```sh
node --test tests/roster-snapshot.test.mjs
```

The focused tests exercise the standalone Seattle importer, preservation of
existing statistics, first-snapshot fallback, broken/corrupted collections,
and the ordering of build imports. They use local fixtures and make no provider
requests.
