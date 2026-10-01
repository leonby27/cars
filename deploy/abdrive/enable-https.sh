#!/usr/bin/env bash
# Run after public DNS points both names to this server. No BY certificate edits.
set -euo pipefail
exec 9>/run/lock/abdrive-release.lock
flock -n 9 || { echo "Another ABDrive release or HTTPS operation is running"; exit 75; }
expected=5.23.48.128
for domain in abdrive.ru www.abdrive.ru; do
  resolved=$(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u || true)
  if [[ $resolved != "$expected" ]]; then
    # The host resolver may retain the old negative delegation response.
    # Require agreement of two independent public resolvers before issuance.
    for resolver in 1.1.1.1 8.8.8.8; do
      public=$(dig "@$resolver" "$domain" A +short +time=3 +tries=1 | sort -u)
      [[ $public == "$expected" ]] || { echo "DNS is not ready for $domain"; exit 3; }
    done
  fi
done
mkdir -p /var/www/abdrive-acme
certbot certonly --webroot -w /var/www/abdrive-acme --cert-name abdrive.ru -d abdrive.ru -d www.abdrive.ru --non-interactive --deploy-hook 'nginx -t && systemctl reload nginx'
config=/etc/nginx/sites-available/abdrive
cp "$config" "$config.before-https"
install -m 644 "$(dirname "$0")/nginx-https.conf" "$config"
if ! nginx -t; then cp "$config.before-https" "$config"; exit 1; fi
systemctl reload nginx
curl --fail --silent --retry 5 --retry-all-errors --retry-delay 1 --resolve abdrive.ru:443:5.23.48.128 https://abdrive.ru/api/health
