#!/bin/bash
# Выполняется на сервере после обновления репозитория. Бизнес-данные не меняет.
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
service_dir=/opt/abcars-photo-store
systemctl stop abcars-photo-store.service 2>/dev/null || true
systemctl stop abcars-gallery-store.service 2>/dev/null || true
install -d "$service_dir/scripts/lib" "$service_dir/src" "$service_dir/server" /srv/abcars-media /srv/abcars/runtime/photo-store
install -m644 "$repo_dir/scripts/cleanup-catalog-photos.mjs" "$service_dir/scripts/"
install -m644 "$repo_dir/scripts/lib/photo-cleanup.mjs" "$service_dir/scripts/lib/"
install -m644 "$repo_dir/scripts/store-catalog-photos.mjs" "$service_dir/scripts/"
install -m644 "$repo_dir/scripts/lib/catalog-photo-store.mjs" "$service_dir/scripts/lib/"
install -m644 "$repo_dir/scripts/store-viewed-galleries.mjs" "$service_dir/scripts/"
install -m644 "$repo_dir/scripts/lib/gallery-photo-store.mjs" "$service_dir/scripts/lib/"
install -m644 "$repo_dir/src/photo-source.js" "$service_dir/src/"
install -m644 "$repo_dir/server/db.mjs" "$service_dir/server/"
install -m644 "$repo_dir/package.json" "$service_dir/"
ln -sfn /srv/abcars/node_modules "$service_dir/node_modules"
cp -a /etc/nginx/snippets/abcars-photo-location.conf /etc/nginx/snippets/abcars-photo-location.conf.photo-store-backup
cp -a /etc/nginx/conf.d/abcars-photos.conf /etc/nginx/conf.d/abcars-photos.conf.photo-store-backup
install -m644 "$repo_dir/deploy/nginx-abcars-photo-location.conf" /etc/nginx/snippets/abcars-photo-location.conf
install -m644 "$repo_dir/deploy/nginx-abcars-photos-cache.conf" /etc/nginx/conf.d/abcars-photos.conf
if ! nginx -t; then
  cp -a /etc/nginx/snippets/abcars-photo-location.conf.photo-store-backup /etc/nginx/snippets/abcars-photo-location.conf
  cp -a /etc/nginx/conf.d/abcars-photos.conf.photo-store-backup /etc/nginx/conf.d/abcars-photos.conf
  systemctl start abcars-photo-store.service 2>/dev/null || true
  systemctl start abcars-gallery-store.service 2>/dev/null || true
  exit 1
fi
systemctl reload nginx
install -m644 "$repo_dir/deploy/abcars-photo-store.service" /etc/systemd/system/
install -m644 "$repo_dir/deploy/abcars-gallery-store.service" /etc/systemd/system/
install -m644 "$repo_dir/deploy/abcars-photo-cleanup.service" "$repo_dir/deploy/abcars-photo-cleanup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl disable --now abcars-warm.timer abcars-warm-recent.timer
systemctl stop abcars-warm.service abcars-warm-recent.service
systemctl enable --now abcars-photo-store.service
systemctl enable --now abcars-gallery-store.service

systemctl enable --now abcars-photo-cleanup.timer
