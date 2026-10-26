#!/usr/bin/env python3
"""Build a compact country classifier; no customer/application DB access."""
import argparse
import base64
import csv
import datetime
import gzip
import hashlib
import io
import ipaddress
import json
from pathlib import Path
import tempfile
import urllib.request


def build(csv_gzip, exempt, month, ahrefs, now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    ranges = {4: [], 6: []}
    records = 0
    with gzip.open(io.BytesIO(csv_gzip), 'rt') as rows:
        for first, last, country in csv.reader(rows):
            a, b = ipaddress.ip_address(first), ipaddress.ip_address(last)
            if a.version != b.version or int(a) > int(b):
                raise ValueError('Invalid source country range')
            tag = 'unknown' if country == 'ZZ' else 'exempt' if country in exempt else 'outside'
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
        packed[str(version)] = base64.b64encode(b''.join(a.to_bytes(width,'big')+b.to_bytes(width,'big')+bytes([('unknown','exempt','outside').index(tag)]) for a,b,tag in rows)).decode('ascii')
    return dict(schema=2, generated_utc=now.isoformat(), expires_utc=expires.isoformat(),
                exempt_countries=sorted(set(exempt)), ranges=packed,
                compact_range_count=sum(len(v) for v in ranges.values()),
                ahrefs_networks=networks, source_records=records,
                source={'name': 'IP Geolocation by DB-IP', 'url': 'https://db-ip.com/db/download/ip-to-country-lite', 'month': month, 'sha256': hashlib.sha256(csv_gzip).hexdigest()},
                service_source='https://api.ahrefs.com/v3/public/crawler-ip-ranges')


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent':'ABCars-country-protection/1.0', 'Accept':'application/json,*/*'})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(32*1024*1024+1)
    if len(data) > 32*1024*1024:
        raise ValueError('Source download is too large')
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--policy', default=str(Path(__file__).with_name('catalog-guard-policy.json')))
    parser.add_argument('--output', required=True)
    parser.add_argument('--source-file')
    parser.add_argument('--month')
    args = parser.parse_args()
    policy = json.loads(Path(args.policy).read_text())['geography']
    month = args.month or datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m')
    data = Path(args.source_file).read_bytes() if args.source_file else fetch('https://download.db-ip.com/free/dbip-country-lite-'+month+'.csv.gz')
    ahrefs = json.loads(fetch('https://api.ahrefs.com/v3/public/crawler-ip-ranges?output=json'))
    result = build(data, policy['exempt_countries'], month, ahrefs)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', dir=output.parent, delete=False) as stream:
        json.dump(result, stream, separators=(',', ':'))
        stage = Path(stream.name)
    stage.chmod(0o644)
    stage.replace(output)
    print(json.dumps({'output':str(output), 'source_records':result['source_records'], 'compact_ranges':result['compact_range_count'], 'ahrefs_ranges':len(result['ahrefs_networks'])}))


if __name__ == '__main__':
    main()
