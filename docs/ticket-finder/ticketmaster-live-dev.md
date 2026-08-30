# Ticketmaster live development runbook

This runbook is for the development instance only. Ticketmaster Discovery is
an official event-summary source, not listing inventory. Season mode searches
an operator-verified attraction over the canonical schedule's earliest and
latest upcoming game dates with bounded pagination and request counts.

| Setting | Development value |
| --- | --- |
| Credential variable | `TICKETMASTER_API_KEY` |
| Environment file | `/etc/sfz-ticket-finder/dev.env` (root:root, `0600`) |
| Runtime root | `/var/lib/sfz-ticket-finder/dev` |
| Published data | `/var/lib/sfz-ticket-finder/dev/current` |
| Service | `sfz-ticket-sync@dev.service` |
| Timer | `sfz-ticket-sync@dev.timer` |
| Web mount | current snapshot at `/usr/share/nginx/html/data/tickets:ro` (or the repository Nginx alias-equivalent) |
| Build mode | `SFZ_TICKET_DATA_MODE=beta` |

`SFZ_TICKET_DATA_MODE` is the non-secret Astro build-time feature switch. Its
allowed values are `disabled`, `preview`, `beta`, and `live`; an absent or
invalid value safely resolves to `preview`. The development site requires
`beta`. Put that setting in `/etc/sfz-dev-workflow/build.env`, which is the
development site's build environment, not in the ticket synchronizer's secret
environment file. Never put `TICKETMASTER_API_KEY` in the Astro build
environment.

The site owner can add or replace the setting without disturbing other build
variables:

```sh
sudo sh -c 'touch /etc/sfz-dev-workflow/build.env; if grep -q "^SFZ_TICKET_DATA_MODE=" /etc/sfz-dev-workflow/build.env; then sed -i "s/^SFZ_TICKET_DATA_MODE=.*/SFZ_TICKET_DATA_MODE=beta/" /etc/sfz-dev-workflow/build.env; else printf "SFZ_TICKET_DATA_MODE=beta\n" >> /etc/sfz-dev-workflow/build.env; fi'
```

From the checked-out dev release, rebuild the offline Astro site with Node 22:

```sh
set -a; . /etc/sfz-dev-workflow/build.env; set +a; npm run build:offline
```

The normal dev release activation/restart remains an operator workflow step;
this repository task does not run it. Changing the environment file alone does
not alter an already generated static page—the rebuild is required.

The installed env can continue using the event name/date/legacy-ID variables
in `single-event` mode until an operator verifies and installs the attraction
ID. The repository does not contain that ID. For season mode the private env
sets `TICKETS_ENV=development`, `TICKETS_FIXTURE=false`, `TICKETMASTER_API_KEY`,
`TICKETMASTER_DISCOVERY_MODE=season`, `TICKETMASTER_ATTRACTION_ID` to the
operator-verified value, and:

```text
TICKETS_PROVIDERS_JSON={"ticketmaster":{"enabled":true,"mode":"event-summary","minRefreshMs":600000,"retentionMs":3600000,"timeoutMs":8000,"maxRetries":2,"rateLimitMs":250,"pageSize":50,"maxPages":5,"maxRequests":5}}
TICKET_DATA_ROOT=/var/lib/sfz-ticket-finder/dev
TICKET_SYNC_ENV_FILE=/etc/sfz-ticket-finder/dev.env
```

Never display the env file. Enter the key through a non-echoing interactive
editor or `read -rsp` in an authorized root shell. The Consumer Secret is not
used. Only `current/` is public; credentials, `previous/`, `tmp/`, and `logs/`
must not be mounted.

Migration is operator-only: verify the Seahawks attraction ID against the
approved Ticketmaster operator account, add it to the private env, and then
switch the discovery mode. Until that follow-up is complete, omit
`TICKETMASTER_DISCOVERY_MODE` or set it to `single-event`; the legacy event
variables and exact legacy-ID verification remain active. Never copy the
placeholder attraction ID from `example.env` into a running environment.

Commands:

```sh
sudo systemctl start sfz-ticket-sync@dev.service
sudo systemctl status sfz-ticket-sync@dev.service sfz-ticket-sync@dev.timer --no-pager
sudo journalctl -u sfz-ticket-sync@dev.service --since today --no-pager -o cat
```

The journal is designed to contain bounded event names/counts and error codes,
never API keys, bearer credentials, request URLs, raw responses, or secret-like
query parameters. Provider calls are cached for 10 minutes;
the timer may run on its independent schedule with a
random delay and persistent catch-up. Publication is validated, locked, and
atomic; failure preserves the last-good snapshot.

The matcher rejects promotional shells (including `HALF PRICE`), parking,
tailgates, hospitality-only products, hotel/travel packages, season-ticket
notification/interest lists, deposits, and watch parties. Ambiguous duplicate
candidates are suppressed. Unmatched games receive no fabricated URL.

Discovery may omit `priceRanges`; the beta then says “Price range not supplied”
and retains the verified Ticketmaster CTA. Returned ranges display as
“Provider-reported event range: $X–$Y” (or “From $X” for a minimum-only approved
shape), retain distinct range types/currencies, use an unknown fee basis, and
carry the disclosure “Event summary, not an individual offer. Fee basis may
differ. Confirm current price and availability with the provider.” They are not
cheapest-sort eligible. Quantity, section, row, seats, listing IDs, and
fee-complete totals require separately approved listing APIs. The Ticketmaster
Inventory Status API is a distinct, separately gated product; access remains
future work, as do listing-level
marketplaces and their rights/retention reviews.

## Rollback

Replace the timestamp placeholder with the backup created immediately before
installation; do not remove last-good runtime data.

```sh
sudo systemctl disable --now sfz-ticket-sync@dev.timer
sudo systemctl stop sfz-ticket-sync@dev.service
sudo cp -a /path/to/dev/docker-compose.yml.before-ticket-sync.TIMESTAMP /path/to/dev/docker-compose.yml
sudo cp -a /path/to/dev/default.conf.before-ticket-sync.TIMESTAMP /path/to/dev/default.conf
sudo systemctl disable sfz-ticket-sync@dev.service
sudo systemctl daemon-reload
docker compose -f /path/to/dev/docker-compose.yml config
docker compose -f /path/to/dev/docker-compose.yml up -d --no-deps --force-recreate web
SFZ_TICKET_DATA_MODE=preview npm run build:offline
```

Use the dev integrator's release activation command for the final preview
build. Do not run these commands against production or port 4322.
