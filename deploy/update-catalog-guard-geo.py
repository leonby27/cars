#!/usr/bin/env python3
"""Build a compact country classifier; no customer/application DB access."""
import argparse
import base64
import csv
import contextlib
import datetime
import fcntl
import gzip
import hashlib
import html
import io
import ipaddress
import json
import importlib.util
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.request

SERVICE_FEEDS={
    'gptbot':'https://openai.com/gptbot.json',
    'claude_training':'https://claude.com/crawling/bots.json',
    'commoncrawl':'https://index.commoncrawl.org/ccbot.json',
    'amazonbot':'https://developer.amazon.com/amazonbot/ip-addresses/',
    'amazon_search':'https://developer.amazon.com/amazonbot/searchbot-ip-addresses/',
    'amazon_user':'https://developer.amazon.com/amazonbot/live-ip-addresses/',
    'meta':'https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS32934',
}


def service_networks(content, name=None):
    text=html.unescape(content.decode('utf-8'))
    if name=='meta':
        data=json.loads(text)
        if data.get('status')!='ok' or data['data']['resource']!='32934':raise ValueError('Unexpected Meta network registry response')
        values=[row['prefix'] for row in data['data']['prefixes']]
    else:values=re.findall(r'"(?:ipv4Prefix|ipv6Prefix|ip_prefix)"\s*:\s*"([^"\s]+)"',text)
    networks=sorted({str(ipaddress.ip_network(value,strict=True)) for value in values})
    if not networks or any(not ipaddress.ip_network(n).is_global or ipaddress.ip_network(n).prefixlen==0 for n in networks):
        raise ValueError('Invalid official crawler ranges')
    return networks


def refresh_services(previous):
    result={}
    for name,url in SERVICE_FEEDS.items():
        try:result[name]=service_networks(fetch(url),name)
        except Exception as error:
            if name not in previous:raise RuntimeError('No verified initial ranges for '+name) from error
            result[name]=previous[name]
            print(json.dumps({'service':name,'kept_previous_ranges':True,'error':type(error).__name__}))
    return result

def build(csv_gzip, exempt, month, ahrefs, now=None, blocked=(), services=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    ranges = {4: [], 6: []}
    records = 0
    with gzip.open(io.BytesIO(csv_gzip), 'rt') as rows:
        for first, last, country in csv.reader(rows):
            a, b = ipaddress.ip_address(first), ipaddress.ip_address(last)
            if a.version != b.version or int(a) > int(b):
                raise ValueError('Invalid source country range')
            tag = 'blocked' if country in blocked else 'unknown' if country == 'ZZ' else 'exempt' if country in exempt else 'outside'
            group = ranges[a.version]
            if group and group[-1][1]+1 == int(a) and group[-1][2] == tag:
                group[-1][1] = int(b)
            else:
                group.append([int(a), int(b), tag])
            records += 1
    if records < 100000 or not all(ranges.values()):
        raise ValueError('Country source is unexpectedly incomplete')
    for rows in ranges.values():
        if any(rows[i-1][1] >= rows[i][0] for i in range(1, len(rows))):
            raise ValueError('Country source is not ordered')
    networks = sorted({str(ipaddress.ip_network(row['ipv4Prefix'], strict=True)) for row in ahrefs['prefixes']})
    if not networks or any(ipaddress.ip_network(n).prefixlen == 0 for n in networks):
        raise ValueError('Invalid Ahrefs source')
    release = datetime.datetime.strptime(month, '%Y-%m').replace(tzinfo=datetime.timezone.utc)
    expires = release + datetime.timedelta(days=62)
    packed = {}
    for version, rows in ranges.items():
        width = 4 if version == 4 else 16
        packed[str(version)] = base64.b64encode(b''.join(a.to_bytes(width,'big')+b.to_bytes(width,'big')+bytes([('unknown','exempt','outside','blocked').index(tag)]) for a,b,tag in rows)).decode('ascii')
    return dict(schema=3, generated_utc=now.isoformat(), expires_utc=expires.isoformat(),
                exempt_countries=sorted(set(exempt)), blocked_countries=sorted(set(blocked)), ranges=packed,
                compact_range_count=sum(len(v) for v in ranges.values()),
                ahrefs_networks=networks, service_networks=services or {}, source_records=records,
                source={'name': 'IP Geolocation by DB-IP', 'url': 'https://db-ip.com/db/download/ip-to-country-lite', 'month': month, 'sha256': hashlib.sha256(csv_gzip).hexdigest()},
                service_source='https://api.ahrefs.com/v3/public/crawler-ip-ranges')


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent':'ABCars-country-protection/1.0', 'Accept':'application/json,*/*'})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(32*1024*1024+1)
    if len(data) > 32*1024*1024:
        raise ValueError('Source download is too large')
    return data


def blocked_config(countries):
    networks=countries.blocked_networks()
    if countries.policy.get('blocked_countries') and not networks:
        raise ValueError('Blocked country ranges are missing')
    return 'geo $car_country_blocked {\n    default 0;\n'+''.join('    '+n+' 1;\n' for n in networks)+'}\n'


def atomic_write(path, content):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,delete=False) as stream:
        stage=Path(stream.name)
        try:stream.write(content)
        except BaseException:stage.unlink();raise
    stage.chmod(0o644);stage.replace(path)


def publish(result, output, policy_path, nginx_output=None, reload_nginx=False):
    output=Path(output)
    spec=importlib.util.spec_from_file_location('country_release_geo',Path(__file__).with_name('catalog-guard-geo.py'))
    geo=importlib.util.module_from_spec(spec);spec.loader.exec_module(geo)
    policy=geo.load_policy(policy_path)
    with tempfile.TemporaryDirectory() as directory:
        candidate=Path(directory)/'countries.json';candidate.write_text(json.dumps(result,separators=(',',':')))
        countries=geo.Countries(candidate,policy,time.time)
        if not countries.valid:raise ValueError('Generated countries failed validation')
        content=blocked_config(countries) if nginx_output else None
        # Serialize refresh with the standalone protection installer.
        with contextlib.ExitStack() as stack:
            if reload_nginx:
                lock=stack.enter_context(open('/run/lock/car-catalog-guard.lock','w'))
                fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            nginx_output=Path(nginx_output) if nginx_output else None
            old=nginx_output.read_text() if nginx_output and nginx_output.exists() else None
            changed=nginx_output and old!=content
            old_data=output.read_text() if output.exists() else None
            try:
                if changed:atomic_write(nginx_output,content)
                atomic_write(output,candidate.read_text())
                if changed and reload_nginx:
                    subprocess.run(['nginx','-t'],check=True)
                    subprocess.run(['systemctl','reload','nginx'],check=True)
            except BaseException:
                if old_data is None:
                    if output.exists():output.unlink()
                else:atomic_write(output,old_data)
                if changed:
                    if old is None:nginx_output.unlink()
                    else:atomic_write(nginx_output,old)
                raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--policy', default=str(Path(__file__).with_name('catalog-guard-policy.json')))
    parser.add_argument('--output', required=True)
    parser.add_argument('--source-file')
    parser.add_argument('--month')
    parser.add_argument('--nginx-output')
    parser.add_argument('--reload-nginx',action='store_true')
    args = parser.parse_args()
    policy = json.loads(Path(args.policy).read_text())['geography']
    month = args.month or datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m')
    data = Path(args.source_file).read_bytes() if args.source_file else fetch('https://download.db-ip.com/free/dbip-country-lite-'+month+'.csv.gz')
    ahrefs = json.loads(fetch('https://api.ahrefs.com/v3/public/crawler-ip-ranges?output=json'))
    if args.reload_nginx and not args.nginx_output:parser.error('--reload-nginx requires --nginx-output')
    previous=json.loads(Path(args.output).read_text()).get('service_networks',{}) if Path(args.output).exists() else {}
    services=refresh_services(previous)
    result = build(data, policy['exempt_countries'], month, ahrefs, blocked=policy.get('blocked_countries',[]),services=services)
    output = Path(args.output)
    publish(result,output,args.policy,args.nginx_output,args.reload_nginx)
    print(json.dumps({'output':str(output), 'source_records':result['source_records'], 'compact_ranges':result['compact_range_count'], 'ahrefs_ranges':len(result['ahrefs_networks'])}))


if __name__ == '__main__':
    main()
