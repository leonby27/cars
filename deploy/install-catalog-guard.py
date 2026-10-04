#!/usr/bin/env python3
"""Standalone origin-only release; backups, rollback, no application rebuild."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

if os.geteuid()!=0:
    raise SystemExit('Run as root')
source=Path(__file__).resolve().parent
# Validate the candidate policy before touching live service/config files.
spec=importlib.util.spec_from_file_location('catalog_guard_release',source/'catalog-guard.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.load_policy(source/'catalog-guard-policy.json')
module.load_behavior_policy(source/'catalog-guard-policy.json')
handles=[]
for name in ['abdrive-release','car-bot-protection','car-catalog-guard']:
    f=open('/run/lock/'+name+'.lock','w'); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB); handles.append(f)
backup=Path(tempfile.mkdtemp(prefix='car-catalog-guard.',dir='/var/backups'))
destinations={
 'catalog-guard.py':'/usr/local/lib/car-catalog-guard/catalog-guard.py',
 'catalog-guard-policy.json':'/usr/local/lib/car-catalog-guard/catalog-guard-policy.json',
 'catalog-guard-client.js':'/usr/local/lib/car-catalog-guard/catalog-guard-client.js',
 'car-catalog-guard.service':'/etc/systemd/system/car-catalog-guard.service',
 'nginx-catalog-guard-server.conf':'/etc/nginx/snippets/catalog-guard-server.conf',
 'nginx-catalog-guard-location.conf':'/etc/nginx/snippets/catalog-guard-location.conf',
}
paths=[Path(p) for p in destinations.values()]+[Path('/etc/nginx/snippets/abcars-site.conf'),Path('/etc/nginx/snippets/abcars-proxy.conf'),Path('/etc/nginx/sites-available/abdrive'),Path('/etc/default/car-catalog-guard')]
existed=[]
for n,path in enumerate(paths):
    existed.append(path.exists())
    if path.exists():shutil.copy2(path,backup/str(n))
(backup/'paths.json').write_text(json.dumps([str(p) for p in paths]))
try:
    for name,destination in destinations.items():
        p=Path(destination);p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source/name,p);p.chmod(0o644)
    shutil.copytree(source/'catalog-guard-audio','/usr/local/lib/car-catalog-guard/catalog-guard-audio',dirs_exist_ok=True)
    for p in [Path('/etc/nginx/snippets/abcars-site.conf'),Path('/etc/nginx/sites-available/abdrive')]:
        text=p.read_text(); rule='include /etc/nginx/snippets/catalog-guard-server*.conf;'
        if rule not in text:
            marker='if ($car_blocked_bot) { return 403; }'
            if text.count(marker)!=1:raise RuntimeError('Missing unique site insertion point')
            text=text.replace(marker,marker+'\n'+rule)
        if p.name=='abdrive':
            marker='include /etc/nginx/snippets/car-ai-limit.conf;'
            if text.count(marker)!=1:raise RuntimeError('Missing unique RU dynamic location')
            rule='include /etc/nginx/snippets/catalog-guard-location*.conf;'
            if rule not in text:text=text.replace(marker,marker+'\n        '+rule)
        p.write_text(text)
    p=Path('/etc/nginx/snippets/abcars-proxy.conf');text=p.read_text()
    rule='include /etc/nginx/snippets/catalog-guard-location*.conf;'
    if rule not in text:text += '\n'+rule+'\n'
    # Existing cached gzip HTML predates the recovery script. Use a fresh key
    # without deleting caches or changing application/catalog snapshots.
    text=text.replace('proxy_cache_key "$scheme$host$request_method$request_uri";', 'proxy_cache_key "$scheme$host$request_method$request_uri|catalog-guard-v1";')
    p.write_text(text)
    env=Path('/etc/default/car-catalog-guard')
    if not env.exists():env.write_text('CATALOG_GUARD_MODE=observe\n')
    subprocess.run(['systemctl','daemon-reload'],check=True)
    subprocess.run(['systemctl','enable','--now','car-catalog-guard'],check=True)
    subprocess.run(['systemctl','restart','car-catalog-guard'],check=True)
    subprocess.run(['nginx','-t'],check=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
except Exception:
    for n,p in enumerate(paths):
        if existed[n]:shutil.copy2(backup/str(n),p)
        elif p.exists():p.unlink()
    subprocess.run(['systemctl','daemon-reload'])
    subprocess.run(['systemctl','restart' if existed[-1] else 'stop','car-catalog-guard'])
    if subprocess.run(['nginx','-t']).returncode==0:subprocess.run(['systemctl','reload','nginx'])
    raise
print(json.dumps({'backup':str(backup),'mode':env.read_text().strip(),'disable':'Set CATALOG_GUARD_MODE=observe in /etc/default/car-catalog-guard and restart car-catalog-guard. Stopping the service also makes requests fail open.'}))
