#!/usr/bin/env bash
# Run after public DNS points both names to this server. No BY certificate edits.
set -euo pipefail
expected=5.23.48.128
for domain in abdrive.ru www.abdrive.ru; do
  resolved=$(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u || true)
  [[ $resolved == "$expected" ]] || { echo "DNS is not ready for $domain"; exit 3; }
done
mkdir -p /var/www/abdrive-acme
certbot certonly --webroot -w /var/www/abdrive-acme --cert-name abdrive.ru -d abdrive.ru -d www.abdrive.ru --non-interactive
config=/etc/nginx/sites-available/abdrive
cp "$config" "$config.before-https"
install -m 644 "$(dirname "$0")/nginx-https.conf" "$config"
if ! nginx -t; then cp "$config.before-https" "$config"; exit 1; fi
systemctl reload nginx
curl --fail --silent --retry 5 --retry-all-errors --retry-delay 1 https://abdrive.ru/api/health
