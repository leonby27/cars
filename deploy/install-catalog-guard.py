#!/usr/bin/env python3
"""Standalone origin-only release; backups, rollback, no application rebuild."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import tempfile
import time

def main():
    if os.geteuid()!=0:
        raise SystemExit('Run as root')
    source=Path(__file__).resolve().parent
    # Validate the candidate policy before touching live service/config files.
    spec=importlib.util.spec_from_file_location('catalog_guard_release',source/'catalog-guard.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    env=dict(os.environ)
    settings=Path('/etc/default/car-catalog-guard')
    if settings.exists():
        for line in settings.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key,value=line.split('=',1);parts=shlex.split(value)
                if len(parts)==1:env[key.strip()]=parts[0]
    module.captcha_module.configured(source/'catalog-guard-policy.json',env)
    module.load_mass_export_policy(source/'catalog-guard-policy.json')
    geo_policy=module.geo_module.load_policy(source/'catalog-guard-policy.json')
    if geo_policy:
        countries=module.geo_module.Countries(source/'catalog-guard-countries.json',geo_policy,time.time)
        if not countries.valid:raise RuntimeError('Fresh countries matching policy are required')
    handles=[]
    for name in ['abdrive-release','car-bot-protection','car-catalog-guard']:
        f=open('/run/lock/'+name+'.lock','w'); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB); handles.append(f)
    backup=Path(tempfile.mkdtemp(prefix='car-catalog-guard.',dir='/var/backups'))
    destinations={
     'catalog-guard-recaptcha.py':'/usr/local/lib/car-catalog-guard/catalog-guard-recaptcha.py',
     'catalog-guard.py':'/usr/local/lib/car-catalog-guard/catalog-guard.py',
     'catalog-guard-geo.py':'/usr/local/lib/car-catalog-guard/catalog-guard-geo.py',
     'update-catalog-guard-geo.py':'/usr/local/lib/car-catalog-guard/update-catalog-guard-geo.py',
     'catalog-guard-policy.json':'/usr/local/lib/car-catalog-guard/catalog-guard-policy.json',
     'catalog-guard-client.js':'/usr/local/lib/car-catalog-guard/catalog-guard-client.js',
     'car-catalog-guard.service':'/etc/systemd/system/car-catalog-guard.service',
     'nginx-catalog-guard-server.conf':'/etc/nginx/snippets/catalog-guard-server.conf',
     'nginx-catalog-guard-location.conf':'/etc/nginx/snippets/catalog-guard-location.conf',
     'car-catalog-geo-update.service':'/etc/systemd/system/car-catalog-geo-update.service',
     'car-catalog-geo-update.timer':'/etc/systemd/system/car-catalog-geo-update.timer',
    }
    if geo_policy:destinations['catalog-guard-countries.json']='/usr/local/lib/car-catalog-guard/catalog-guard-countries.json'
    retired_audio=Path('/usr/local/lib/car-catalog-guard/catalog-guard-audio')
    paths=[Path(p) for p in destinations.values()]+[retired_audio]+[Path('/etc/nginx/snippets/abcars-site.conf'),Path('/etc/nginx/snippets/abcars-proxy.conf'),Path('/etc/nginx/sites-available/abdrive'),Path('/etc/default/car-catalog-guard')]
    existed=[]
    geo_timer_enabled=subprocess.run(['systemctl','is-enabled','--quiet','car-catalog-geo-update.timer']).returncode==0
    for n,path in enumerate(paths):
        existed.append(path.exists())
        if path.is_dir():shutil.copytree(path,backup/str(n))
        elif path.exists():shutil.copy2(path,backup/str(n))
    (backup/'paths.json').write_text(json.dumps([str(p) for p in paths]))
    try:
        if retired_audio.exists():shutil.rmtree(retired_audio)
        for name,destination in destinations.items():
            p=Path(destination);p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source/name,p);p.chmod(0o644)
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
        if geo_policy:subprocess.run(['systemctl','enable','--now','car-catalog-geo-update.timer'],check=True)
    except Exception:
        if not geo_timer_enabled:subprocess.run(['systemctl','disable','--now','car-catalog-geo-update.timer'])
        for n,p in enumerate(paths):
            if existed[n]:
                if (backup/str(n)).is_dir():
                    if p.exists():shutil.rmtree(p)
                    shutil.copytree(backup/str(n),p)
                else:shutil.copy2(backup/str(n),p)
            elif p.exists():p.unlink()
        subprocess.run(['systemctl','daemon-reload'])
        subprocess.run(['systemctl','restart' if existed[-1] else 'stop','car-catalog-guard'])
        if subprocess.run(['nginx','-t']).returncode==0:subprocess.run(['systemctl','reload','nginx'])
        raise
    print(json.dumps({'backup':str(backup),'mode':next((line.split('=',1)[1] for line in env.read_text().splitlines() if line.startswith('CATALOG_GUARD_MODE=')),'observe'),'disable':'Set CATALOG_GUARD_MODE=observe in /etc/default/car-catalog-guard and restart car-catalog-guard. Stopping the service also makes requests fail open.'}))

if __name__=='__main__':main()
