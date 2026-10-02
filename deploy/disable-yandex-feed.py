"""Authorized standalone feed removal; preserve files/configuration for recovery."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

if os.geteuid() != 0:
    raise SystemExit('Run as root')
source = Path(__file__).resolve().parent
locks = []
for name in ['abcars-deploy', 'abdrive-release', 'car-bot-protection']:
    handle = open('/run/lock/' + name + '.lock', 'a')
    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    locks.append(handle)
backup = Path(tempfile.mkdtemp(prefix='car-feed-disabled.', dir='/var/backups'))
paths = [Path(p) for p in [
    '/etc/nginx/snippets/abcars-site.conf',
    '/etc/nginx/snippets/abcars-feed-disabled.conf',
    '/srv/abcars/scripts/yandex-feed.mjs',
    '/srv/abcars/deploy/abcars-deploy.sh',
    '/usr/local/bin/abcars-deploy.sh',
    '/srv/abcars/.env.local',
    '/etc/nginx/snippets/abcars-feed-auth.conf',
    '/etc/nginx/abcars-feed.htpasswd',
    '/var/lib/car-bot-protection/feed-credentials.json',
]]
for index, p in enumerate(paths):
    if p.exists(): shutil.copy2(p, backup / str(index))
(backup / 'paths.json').write_text(json.dumps(list(map(str, paths))))
enabled = subprocess.run(['systemctl', 'is-enabled', 'abcars-feed.timer'], capture_output=True).returncode == 0
active = subprocess.run(['systemctl', 'is-active', 'abcars-feed.timer'], capture_output=True).returncode == 0
(backup / 'timer.json').write_text(json.dumps({'enabled': enabled, 'active': active}))
moved = []
try:
    shutil.copy2(source / 'nginx-abcars-feed-disabled.conf', paths[1])
    generator = source.parent / 'scripts/yandex-feed.mjs'
    if not generator.exists(): generator = source / 'yandex-feed.mjs'
    shutil.copy2(generator, paths[2])
    for p in paths[3:5]:
        text = p.read_text()
        needle = 'for name in abcars-search-traffic abcars-feed abcars-catalog-dedupe abcars-rates abcars-price-snapshot; do\n  if !'
        replacement = '''for name in abcars-search-traffic abcars-feed abcars-catalog-dedupe abcars-rates abcars-price-snapshot; do
  if [ "$name" = abcars-feed ] && [ "${ABCARS_YANDEX_FEED_ENABLED:-0}" != 1 ]; then
    systemctl disable --now abcars-feed.timer
    continue
  fi
  if !'''
        if 'ABCARS_YANDEX_FEED_ENABLED' not in text:
            if needle not in text: raise RuntimeError('Deployment insertion point changed')
            p.write_text(text.replace(needle, replacement))
        subprocess.run(['bash', '-n', str(p)], check=True)
    p = paths[5]
    text = p.read_text()
    text = re.sub(r'^ABCARS_YANDEX_FEED_ENABLED=.*\n?', '', text, flags=re.M)
    p.write_text(text.rstrip() + '\nABCARS_YANDEX_FEED_ENABLED=0\n')
    p = paths[0]
    text = p.read_text()
    text = re.sub(r'\n# Temporary verification endpoint: authenticated access to the same feed\.\nlocation = /feed-auth-check/yandex-cars\.xml \{\n.*?\n\}\n', '\n', text, flags=re.S)
    text = text.replace('include /etc/nginx/snippets/abcars-feed-auth.conf;', '')
    rule = 'include /etc/nginx/snippets/abcars-feed-disabled.conf;'
    if rule not in text: text += '\n' + rule + '\n'
    p.write_text(text)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    subprocess.run(['systemctl', 'disable', '--now', 'abcars-feed.timer'], check=True)
    subprocess.run(['systemctl', 'stop', 'abcars-feed.service'], check=True)
    archive = backup / 'feed-files'; archive.mkdir()
    for p in Path('/srv/abcars/dist/client/feeds').glob('yandex-cars.xml*'):
        target = archive / p.name
        p.rename(target); moved.append((p, target))
    # Credentials were only generated for the cancelled password setup.
    for p in paths[6:]: p.unlink(missing_ok=True)
except Exception:
    for original, saved in moved: saved.rename(original)
    for index, p in enumerate(paths):
        saved = backup / str(index)
        if saved.exists(): shutil.copy2(saved, p)
        else: p.unlink(missing_ok=True)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    if enabled: subprocess.run(['systemctl', 'enable', 'abcars-feed.timer'], check=True)
    if active: subprocess.run(['systemctl', 'start', 'abcars-feed.timer'], check=True)
    raise
print(json.dumps({'backup': str(backup), 'archived_files': len(moved), 'feed_urls': 410, 'timer': 'disabled'}))
