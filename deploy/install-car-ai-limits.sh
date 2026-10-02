#!/usr/bin/env bash
# Install shared crawler budgets and the matching independent site configs.
# Run only for an authorized nginx release; validate and restore on failure.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root'; exit 1; }
exec 9>/run/lock/abdrive-release.lock
flock -n 9 || { echo 'Another ABDrive release is running'; exit 75; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
backup=$(mktemp -d /var/backups/car-ai-limits.XXXXXX)
files=(/etc/nginx/conf.d/car-ai-limits.conf /etc/nginx/snippets/car-ai-limit.conf /etc/nginx/snippets/abcars-proxy.conf /etc/nginx/sites-available/abdrive)
sources=("$source_dir/nginx-car-ai-limits.conf" "$source_dir/nginx-car-ai-limit-location.conf" "$source_dir/nginx-abcars-proxy.conf" "$source_dir/abdrive/nginx-https.conf")
for i in "${!files[@]}"; do
  [[ -f ${sources[$i]} ]]
  if [[ -e ${files[$i]} ]]; then cp -a "${files[$i]}" "$backup/$i"; fi
done
restore() {
  for i in "${!files[@]}"; do
    if [[ -e $backup/$i ]]; then cp -a "$backup/$i" "${files[$i]}"; else rm -f "${files[$i]}"; fi
  done
  nginx -t && systemctl reload nginx
}
trap 'restore' ERR
for i in "${!files[@]}"; do install -m644 "${sources[$i]}" "${files[$i]}"; done
nginx -t
systemctl reload nginx
trap - ERR
printf 'Crawler limits installed; previous configuration: %s\n' "$backup"
