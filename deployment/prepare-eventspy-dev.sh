#!/bin/sh
# Read-only guarded plan generator: validates inputs and prints a reviewable plan.
set -eu
umask 077
usage() { echo "usage: $0 --browser-image mcr.microsoft.com/playwright:v1.62.0-noble@sha256:<64 lowercase hex>" >&2; exit 64; }
[ "$#" -eq 2 ] && [ "$1" = "--browser-image" ] || usage
BROWSER_IMAGE=$2
printf '%s\n' "$BROWSER_IMAGE" | grep -Eq '^mcr\.microsoft\.com/playwright:v1\.62\.0-noble@sha256:[0-9a-f]{64}$' || { echo "refusing: exact Playwright 1.62.0 noble digest required" >&2; exit 64; }
: "${EVENTSPY_COLLECTOR_IMAGE:?set immutable EVENTSPY_COLLECTOR_IMAGE built from the reviewed source SHA}"
: "${TICKET_SYNC_IMAGE:?set immutable TICKET_SYNC_IMAGE built from the same source SHA}"
for promoted in "$EVENTSPY_COLLECTOR_IMAGE" "$TICKET_SYNC_IMAGE"; do
  printf '%s\n' "$promoted" | grep -Eq '^[^[:space:]@]+@sha256:[0-9a-f]{64}$' || { echo "refusing: promoted service images must be immutable digests" >&2; exit 64; }
done
DEV_ROOT=${SFZ_DEV_ROOT:-/home/laurawkr/seahawksfanzone-dev}
SOURCE_ROOT=${SFZ_SOURCE_ROOT:-$DEV_ROOT/source}
BASE_COMPOSE=$DEV_ROOT/docker-compose.yml
COLLECTOR_OVERLAY=$SOURCE_ROOT/deployment/eventspy-collector/dev.compose.yml
SYNC_OVERLAY=$SOURCE_ROOT/deployment/ticket-sync/eventspy-dev.compose.yml
[ -f "$BASE_COMPOSE" ] || { echo "operator-owned dev Compose file not found" >&2; exit 1; }
for required in scripts/tickets/eventspy-collector.mjs scripts/tickets/eventspy-image-smoke.mjs scripts/tickets/fixtures/eventspy-tooltip.txt deployment/run-eventspy-collector-dev.sh deployment/systemd/sfz-eventspy-collector@.service deployment/systemd/sfz-eventspy-collector@.timer deployment/eventspy-collector/dev.compose.yml deployment/ticket-sync/eventspy-dev.compose.yml; do
  [ -f "$SOURCE_ROOT/$required" ] || { echo "required landed file missing: $required" >&2; exit 1; }
done
head=$(git -C "$SOURCE_ROOT" rev-parse HEAD)
dev=$(git -C "$SOURCE_ROOT" rev-parse origin/dev)
[ "$head" = "$dev" ] || { echo "refusing: local source does not equal origin/dev" >&2; exit 1; }
if ! git -C "$SOURCE_ROOT" diff --quiet -- . ':(exclude)src/data/nfl/**' || ! git -C "$SOURCE_ROOT" diff --cached --quiet -- . ':(exclude)src/data/nfl/**'; then
  echo "refusing: non-generated tracked source changes are present" >&2; exit 1
fi
compose_config=$(BROWSER_BASE_IMAGE=$BROWSER_IMAGE docker compose --file "$BASE_COMPOSE" --file "$COLLECTOR_OVERLAY" --file "$SYNC_OVERLAY" config)
printf '%s\n' "$compose_config" | awk '/^  web:$/ { inweb=1; next } inweb && /^  [A-Za-z0-9_.-]+:$/ { inweb=0 } inweb && /published: "?4324"?/ { published=1 } inweb && /target: 80/ { target=1 } END { exit !(published && target) }' || { echo "refusing: effective web mapping is not 4324:80" >&2; exit 1; }
printf '%s\n' "$compose_config" | grep -Fq "$BROWSER_IMAGE" || { echo "refusing: effective Compose does not contain the reviewed browser image" >&2; exit 1; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
cat <<EOF
GUARDED OPERATOR PLAN ONLY — review each command; this script changed nothing.
NOT READY — the EventSpy timer must remain disabled until Stages A-C pass.
Verified source SHA: $head (equals origin/dev)
Verified browser base: $BROWSER_IMAGE
Verified effective web mapping: 4324:80

Stage A — offline validation and rehearsal
1. Confirm sfz-eventspy-collector@dev.timer is disabled and inactive. Do not make a live request.
2. Back up each existing env, unit, overlay, and drop-in with cp -a before replacement; skip absent files. Backup suffix: .before-eventspy-$STAMP
3. Install /etc/sfz-eventspy mode 0755 and /var/lib/sfz-eventspy/dev owned 1000:1000 mode 0755; verify the promoted collector runs as 1000:1000.
4. If dev.env is absent, install the example once at mode 0600 and edit interactively. Never replace a populated env or print its values.
5. Install both narrow overlays and templates while preserving $BASE_COMPOSE. Keep Documentation=$SOURCE_ROOT/docs/ticket-sync-deployment.md and WorkingDirectory=$DEV_ROOT.
6. Run systemd-analyze verify; parsed Compose validation; immutable image/source-SHA identity checks; then promoted-image smoke, validate, status --json, and disposable-root rehearse with network disabled.
Stage B — one-game operator precheck (timer still disabled)
7. Explicitly run exactly: node scripts/tickets/eventspy-collector.mjs diagnose --game 1392216
8. Require EVENTSPY_COLLECTION_SUCCESS for game 1392216, then start sfz-ticket-sync@dev.service exactly once. Require one validated observation in both /var/lib/sfz-eventspy/dev/games/1392216/current/history.json and the matching /var/lib/sfz-ticket-finder/dev event JSON.
9. Fetch the browser runtime endpoint and dev page on port 4324. Require the same sanitized sample identity and require the selected game to leave the not-collected state. Any mismatch is NOT READY.

Stage C — first full batch (only after Stage B succeeds)
10. Start sfz-eventspy-collector@dev.service once. Its unit performs ticket sync exactly once after completed exit 0, 2, 3, or 4. Exit 3 (EVENTSPY_BATCH_ZERO_SUCCESS) and exit 4 (no navigation) are NOT READY. Exit 2 must show exact succeeded/failed counts and remains NOT READY unless separately accepted.
11. Never reset or delete a ledger. Recheck stored, published, served, and page-read observation identity after the batch.

Stage D — separately approved timer enablement
12. Enable the 08:00/20:00 America/Los_Angeles timer only after Stages A-C and all live acceptance checks succeed. Until then report NOT READY and emit no completion marker.
13. Rollback keeps the timer disabled, restores cp -a backups, revalidates Compose and 4324:80, and retains every ledger and history.
EOF
