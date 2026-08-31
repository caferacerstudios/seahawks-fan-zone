#!/bin/sh
# Unit helper: synchronize exactly once after any completed collector batch while
# preserving the collector's activation-significant exit status.
set -u
[ "$#" -eq 1 ] && [ "$1" = "dev" ] || { echo 'EVENTSPY_CONFIG_INVALID' >&2; exit 1; }
DEV_ROOT=/home/laurawkr/seahawksfanzone-dev
cd "$DEV_ROOT" || exit 1
/usr/bin/docker compose --project-name sfz-eventspy-dev --file docker-compose.yml --file source/deployment/eventspy-collector/dev.compose.yml --profile eventspy-collector run --rm --no-deps eventspy-collector collect
collector_status=$?
case "$collector_status" in
  0|2|3|4)
    /usr/bin/flock --nonblock /run/lock/sfz-ticket-sync-dev.lock /usr/bin/docker compose --project-name sfz-dev --file docker-compose.yml --file source/deployment/ticket-sync/eventspy-dev.compose.yml --profile ticket-sync run --rm --no-deps ticket-sync || exit 1
    ;;
  *) exit "$collector_status" ;;
esac
exit "$collector_status"
