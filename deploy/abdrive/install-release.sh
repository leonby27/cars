#!/usr/bin/env bash
# Independent ABDrive release. Does not run any BY deployment/import/migration.
set -euo pipefail
exec 9>/run/lock/abdrive-release.lock
flock -n 9 || { echo "Another ABDrive release or HTTPS operation is running"; exit 75; }
archive=${1:?release archive required}
release=${2:?release name required}
[[ $release =~ ^[a-zA-Z0-9-]+$ ]] || exit 2
[[ -f /etc/abdrive/environment && -f $archive ]] || exit 2
base=/srv/abdrive
next=$base/releases/$release
[[ ! -e $next ]] || { echo 'Release already exists'; exit 2; }
mkdir -p "$next"
tar -xzf "$archive" -C "$next" --no-same-owner
cd "$next"
nice -n 10 npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null
set -a
source /etc/abdrive/environment
set +a
runuser -u abdrive --preserve-environment -- node scripts/abdrive-migrate.mjs
install -d -m 700 -o abdrive -g abdrive /var/cache/abdrive
export ABDRIVE_PRICE_INDEX_FILE=/var/cache/abdrive/price-index.json
export ABDRIVE_HOME_SNAPSHOT_FILE=/var/cache/abdrive/home-snapshot.json
export DB_POOL_SIZE=1
# Reuse the price index for code-only releases; update only changed listings.
runuser -u abdrive --preserve-environment -- nice -n 10 node --max-old-space-size=512 scripts/abdrive-warm-prices.mjs
old=""
if [[ -L $base/current ]]; then old=$(readlink -e "$base/current" || true); fi
# Open tabs can request a deferred chunk after the release has changed.
# Carry recent immutable assets forward without replacing this build's files.
# Preserve original timestamps so old generations expire rather than accumulate.
if [[ -n $old && -d $old/dist-abdrive/client/assets ]]; then
  cp -an "$old/dist-abdrive/client/assets/." "$next/dist-abdrive/client/assets/"
  find "$next/dist-abdrive/client/assets" -type f -mtime +7 -delete
fi
by_pid=$(systemctl show abcars --property=MainPID --value)
install -m 644 deploy/abdrive/abdrive.service /etc/systemd/system/abdrive.service
systemctl daemon-reload
ln -s "$next" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
restore() {
  if [[ -n $old && -d $old ]]; then
    ln -s "$old" "$base/current.rollback"
    mv -Tf "$base/current.rollback" "$base/current"
    systemctl restart abdrive
  else
    systemctl stop abdrive || true
  fi
}
trap 'restore' ERR
systemctl restart abdrive
healthy=0
for attempt in {1..20}; do
  if curl --fail --silent --max-time 5 http://127.0.0.1:8788/api/health | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let d;try{d=JSON.parse(s)}catch{process.exit(1)}process.exit(d.ok&&d.site==="abdrive"?0:1)})'; then healthy=1;break;fi
  sleep 1
done
[[ $healthy == 1 ]]
curl --fail --silent --max-time 15 http://127.0.0.1:8788/api/catalog/meta | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let d=JSON.parse(s);console.log("Catalog vehicles:",d.total);process.exit(d.total>0?0:1)})'
curl --fail --silent --max-time 15 http://127.0.0.1:8788/catalog -o /tmp/abdrive-release-check.html
for path in / /china-brands /catalog/byd /catalog/do-2000000-rub /catalog/tesla/model-y /catalog/suv; do
  curl --fail --silent --max-time 45 "http://127.0.0.1:8788$path" -o /dev/null
done
if [[ ${BLOG_ENABLED:-0} =~ ^(1|true|yes|on)$ ]]; then
  curl --fail --silent --max-time 15 http://127.0.0.1:8788/blog -o /dev/null
else
  blog_status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 15 http://127.0.0.1:8788/blog)
  [[ $blog_status == 404 ]]
fi
# Initial HTTP host only; never overwrite later HTTPS configuration.
if [[ ! -e /etc/nginx/sites-available/abdrive ]]; then
  install -m 644 deploy/abdrive/nginx-http.conf /etc/nginx/sites-available/abdrive
  ln -s /etc/nginx/sites-available/abdrive /etc/nginx/sites-enabled/abdrive
  if ! nginx -t; then
    rm /etc/nginx/sites-enabled/abdrive /etc/nginx/sites-available/abdrive
    false
  fi
  systemctl reload nginx
fi
curl --fail --silent --retry 5 --retry-all-errors --retry-delay 1 --max-time 15 --location --max-redirs 3 --resolve abdrive.ru:443:127.0.0.1 --resolve abdrive.ru:80:127.0.0.1 http://abdrive.ru/catalog -o /dev/null
[[ $(systemctl show abcars --property=MainPID --value) == "$by_pid" ]]
systemctl enable abdrive
trap - ERR
printf 'ABDrive release %s installed; BY process unchanged\n' "$release"
