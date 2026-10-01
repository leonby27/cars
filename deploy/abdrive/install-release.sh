#!/usr/bin/env bash
# Independent ABDrive release. Does not run any BY deployment/import/migration.
set -euo pipefail
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
old=""
if [[ -L $base/current ]]; then old=$(readlink -e "$base/current" || true); fi
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
curl --fail --silent --retry 5 --retry-all-errors --retry-delay 1 --max-time 15 --resolve abdrive.ru:80:127.0.0.1 http://abdrive.ru/catalog -o /dev/null
[[ $(systemctl show abcars --property=MainPID --value) == "$by_pid" ]]
systemctl enable abdrive
trap - ERR
printf 'ABDrive release %s installed; BY process unchanged\n' "$release"
