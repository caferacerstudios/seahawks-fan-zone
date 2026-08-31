#!/bin/sh
set -eu
umask 077
[ "${1:-}" = "--browser-image" ] && [ -n "${2:-}" ] || { echo "usage: $0 --browser-image <reviewed-image@sha256:digest>" >&2; exit 64; }
case "$2" in *@sha256:[0-9a-f][0-9a-f]*) ;; *) echo "immutable browser image digest required" >&2; exit 64;; esac
DEV_ROOT=/home/laurawkr/seahawksfanzone-dev
[ -f "$DEV_ROOT/docker-compose.yml" ] || { echo "operator-owned dev Compose file not found" >&2; exit 1; }
grep -q '4324:80' "$DEV_ROOT/docker-compose.yml" || { echo "refusing: operator-owned 4324:80 mapping was not found" >&2; exit 1; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
echo "Review only; the following commands preserve the base Compose file and keep the timer disabled:"
echo "sudo install -d -m 0750 /etc/sfz-eventspy /var/lib/sfz-eventspy/dev"
echo "sudo cp -a /etc/sfz-eventspy/dev.env /etc/sfz-eventspy/dev.env.backup-$STAMP  # if present"
echo "sudo install -m 0600 deployment/eventspy-collector/example.env /etc/sfz-eventspy/dev.env"
echo "sudo sh -c 'printf %s\\n BROWSER_BASE_IMAGE=$2 >> /etc/sfz-eventspy/dev.env'"
echo "sudo cp -a deployment/systemd/sfz-eventspy-collector@.service /etc/systemd/system/"
echo "sudo cp -a deployment/systemd/sfz-eventspy-collector@.timer /etc/systemd/system/"
echo "sudo systemctl disable sfz-eventspy-collector@dev.timer"
echo "Create and review a Compose overlay; do not replace $DEV_ROOT/docker-compose.yml or its 4324:80 mapping."
echo "Then run validate, disposable fixture rehearsal, image smoke with network disabled, and one live precheck before any timer enablement."
