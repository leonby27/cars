#!/bin/bash
# Устанавливает только очистку; фотографии не архивируются и не копируются.
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
service_dir=/opt/abcars-photo-store
if [[ $(systemctl show abcars-photo-cleanup.service -p ActiveState --value) =~ ^(active|activating|deactivating)$ ]]; then
  echo 'Photo cleanup is already running; let it finish before installation.' >&2
  exit 1
fi
node --check "$repo_dir/scripts/cleanup-catalog-photos.mjs"
node --check "$repo_dir/scripts/lib/photo-cleanup.mjs"
node --check "$repo_dir/scripts/lib/sold-photo-query.mjs"
systemctl stop abcars-photo-cleanup.timer
install -d "$service_dir/scripts/lib" /srv/abcars/runtime/photo-store
install -m644 "$repo_dir/scripts/cleanup-catalog-photos.mjs" "$service_dir/scripts/"
install -m644 "$repo_dir/scripts/lib/photo-cleanup.mjs" "$repo_dir/scripts/lib/sold-photo-query.mjs" "$service_dir/scripts/lib/"
install -m644 "$repo_dir/deploy/abcars-photo-cleanup.service" "$repo_dir/deploy/abcars-photo-cleanup.timer" /etc/systemd/system/
install -d /etc/systemd/system/abcars-circle@.service.d
install -m644 "$repo_dir/deploy/abcars-circle-photo-cleanup.conf" /etc/systemd/system/abcars-circle@.service.d/photo-cleanup.conf
systemctl daemon-reload
systemctl enable --now abcars-photo-cleanup.timer
