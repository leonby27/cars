#!/usr/bin/env bash
# Standalone authorized nginx release; no app rebuild or database changes.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root'; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(dirname "$source_dir")
stage=$(mktemp -d /tmp/car-bot-protection.XXXXXX)
trap 'rm -rf "$stage"' EXIT
[[ ! -f /var/lib/car-bot-protection/search-state.json ]] || cp /var/lib/car-bot-protection/search-state.json "$stage/search-state.json"
python3 "$repo_dir/scripts/update-search-networks.py" --state "$stage/search-state.json" --output "$stage/car-search-networks.conf"
[[ -s "$stage/car-search-networks.conf" ]] || { echo 'Search verification preparation did not complete'; exit 75; }
exec 9>/run/lock/abdrive-release.lock
flock -n 9 || { echo 'Another ABDrive release is running'; exit 75; }
exec 8>/run/lock/car-bot-protection.lock
flock -n 8 || { echo 'Another crawler release/refresh is running'; exit 75; }
backup=$(mktemp -d /var/backups/car-bot-protection.XXXXXX)
files=(/etc/nginx/conf.d/car-ai-limits.conf /etc/nginx/snippets/car-ai-limit.conf /etc/nginx/snippets/car-search-networks.conf /etc/nginx/snippets/abcars-site.conf /etc/nginx/sites-available/abdrive /usr/local/lib/car-bot-protection/update-search-networks.py /etc/systemd/system/car-search-networks.service /etc/systemd/system/car-search-networks.timer /var/lib/car-bot-protection/search-state.json)
for i in "${!files[@]}"; do
    if [[ -e ${files[$i]} ]]; then cp -a "${files[$i]}" "$backup/$i"; fi
done
printf '%s\n' "${files[@]}" > "$backup/paths.txt"
restore() {
    trap - ERR
    for i in "${!files[@]}"; do
        if [[ -e $backup/$i ]]; then cp -a "$backup/$i" "${files[$i]}"; else rm -f "${files[$i]}"; fi
    done
    nginx -t && systemctl reload nginx
    systemctl daemon-reload
    echo "Restored configuration from $backup" >&2
}
trap restore ERR
# Preserve the current site configuration; only insert the shared denial rule.
python3 - <<'PY'
from pathlib import Path
for name in ['/etc/nginx/snippets/abcars-site.conf', '/etc/nginx/sites-available/abdrive']:
    path = Path(name)
    text = path.read_text()
    rule = 'if ($car_blocked_bot) { return 403; }'
    if rule not in text:
        marker = 'if ($abcars_blocked_bot)' if 'abcars-site' in name else '    client_max_body_size'
        if marker not in text:
            raise RuntimeError(f'Expected site insertion point is missing: {name}')
        pos = text.index(marker)
        text = text[:pos] + rule + '\n' + text[pos:]
        path.write_text(text)
    dependency = '/etc/nginx/snippets/car-ai-limit.conf;'
    source = Path('/etc/nginx/snippets/abcars-proxy.conf').read_text() if 'abcars-site' in name else text
    if dependency not in source:
        raise RuntimeError(f'Shared dynamic limiter is not included: {name}')
PY
install -m644 "$source_dir/nginx-car-ai-limits.conf" /etc/nginx/conf.d/car-ai-limits.conf
install -m644 "$source_dir/nginx-car-ai-limit-location.conf" /etc/nginx/snippets/car-ai-limit.conf
install -m644 "$stage/car-search-networks.conf" /etc/nginx/snippets/car-search-networks.conf
install -d /usr/local/lib/car-bot-protection /var/lib/car-bot-protection
install -m644 "$repo_dir/scripts/update-search-networks.py" /usr/local/lib/car-bot-protection/update-search-networks.py
install -m600 "$stage/search-state.json" /var/lib/car-bot-protection/search-state.json
install -m644 "$source_dir/car-search-networks.service" "$source_dir/car-search-networks.timer" /etc/systemd/system/
nginx -t
systemctl reload nginx
systemctl daemon-reload
systemctl enable --now car-search-networks.timer
trap - ERR
printf 'Shared crawler protection installed; backup: %s\n' "$backup"
