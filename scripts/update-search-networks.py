"""Official search IP feeds + forward-confirmed Yandex DNS; no request-path DNS.
Keep the last successful list on feed/DNS failure. This is not a general cloud
provider allowlist. GoogleOther/GPTBot/ClaudeBot cannot use search exemptions.
"""
import argparse
import concurrent.futures
import ipaddress
import json
import os
import pathlib
import re
import subprocess
import time
import urllib.request

FEEDS = {
    'google': [
        'https://developers.google.com/static/crawling/ipranges/common-crawlers.json',
        'https://developers.google.com/static/crawling/ipranges/special-crawlers.json',
        'https://developers.google.com/static/crawling/ipranges/user-triggered-fetchers-google.json',
    ],
    'bing': ['https://www.bing.com/toolbox/bingbot.json'],
    'apple': ['https://search.developer.apple.com/applebot.json'],
    'duck': ['https://duckduckgo.com/duckduckbot.json'],
    'openai': ['https://openai.com/searchbot.json', 'https://openai.com/chatgpt-user.json', 'https://openai.com/adsbot.json'],
    'perplexity': ['https://www.perplexity.ai/perplexitybot.json', 'https://www.perplexity.ai/perplexity-user.json'],
    'claude': ['https://claude.com/crawling/bots.json'],
}
FAMILIES = ('google', 'bing', 'yandex', 'apple', 'duck', 'openai', 'perplexity', 'claude')

def prefixes(obj):
    values = obj.get('prefixes', [])
    result = set()
    for row in values:
        value = row.get('ipv4Prefix') or row.get('ipv6Prefix')
        if not value:
            raise ValueError('Missing CIDR in feed')
        net = ipaddress.ip_network(value, strict=True)
        if net.prefixlen == 0 or net.is_private or net.is_loopback:
            raise ValueError('Unsafe network in feed')
        result.add(str(net))
    if not result:
        raise ValueError('Empty crawler feed')
    return sorted(result)

def fetch_provider(family, old, now):
    if old and now - old.get('at', 0) < 86400:
        return old
    try:
        values = set()
        for url in FEEDS[family]:
            request = urllib.request.Request(url, headers={'User-Agent': 'car-search-networks/1.0'})
            with urllib.request.urlopen(request, timeout=15) as response:
                values.update(prefixes(json.load(response)))
        if old and len(values) < len(old['networks']) * .6:
            raise ValueError('Unexpected loss of provider networks')
        return {'at': now, 'networks': sorted(values)}
    except Exception as error:
        if not old:
            raise RuntimeError(f'No verified initial list for {family}: {error}') from error
        print(f'{family}: refresh failed; kept previous verified networks ({type(error).__name__})')
        return old

def yandex_candidates(paths):
    candidates = set()
    for path in paths:
        try:
            # Bounded tail, not a rescan of the full daily access log every 15m.
            with open(path, 'rb') as stream:
                stream.seek(0, os.SEEK_END)
                end = stream.tell()
                stream.seek(max(0, end - 8_000_000))
                data = stream.read()
            for line in data.decode('utf8', errors='replace').splitlines():
                quoted = line.split('"')
                agent = quoted[5] if len(quoted) > 5 else ''
                if re.search('yandex|yadirectfetcher', agent, re.I):
                    value = line.split(' ', 1)[0]
                    address = ipaddress.ip_address(value)
                    if address.is_global:
                        candidates.add(str(address))
        except (OSError, ValueError):
            continue
    return candidates

def confirm_yandex(address, lookup=None):
    def getent(database, value):
        result = subprocess.run(['getent', database, value], capture_output=True, text=True, timeout=3)
        if result.returncode:
            raise ValueError('DNS lookup failed')
        return result.stdout
    lookup = lookup or getent
    try:
        reverse = lookup('hosts', address).split()
        names = [name.rstrip('.').lower() for name in reverse[1:]]
        trusted = [name for name in names if any(name.endswith('.' + suffix) for suffix in ('yandex.ru', 'yandex.net', 'yandex.com'))]
        for name in trusted:
            # Require the original address in forward DNS as well as a valid suffix.
            forward = {str(ipaddress.ip_address(line.split()[0])) for line in lookup('ahosts', name).splitlines() if line.strip()}
            if address in forward:
                return True
    except (OSError, ValueError, subprocess.TimeoutExpired):
        pass
    return False

def render(state):
    lines = ['# Generated from official crawler feeds and confirmed Yandex DNS.']
    for family in FAMILIES:
        lines += [f'geo $car_net_{family} {{', '    default 0;']
        values = state.get(family, {}).get('networks', [])
        if family == 'yandex':
            values = [str(ipaddress.ip_network(address)) for address in state.get('yandex', {})]
        for value in sorted(values):
            net = ipaddress.ip_network(value, strict=True)
            if net.prefixlen == 0:
                raise ValueError('Unsafe global network')
            lines.append(f'    {net} 1;')
        lines.append('}')
    return '\n'.join(lines) + '\n'

def atomic_write(path, data):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(data)
    os.chmod(tmp, 0o644)
    tmp.replace(path)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', default='/var/lib/car-bot-protection/search-state.json')
    parser.add_argument('--output', default='/etc/nginx/snippets/car-search-networks.conf')
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    # Never reload over an application/config release or another refresh.
    import fcntl
    locks = []
    for name in ('abdrive-release', 'car-bot-protection'):
        lock = open(f'/run/lock/{name}.lock', 'w')
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Release/refresh in progress; retry on next timer run')
            return
        locks.append(lock)
    state_path = pathlib.Path(args.state)
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    now = int(time.time())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as workers:
        futures = {family: workers.submit(fetch_provider, family, state.get(family), now) for family in FEEDS}
        for family, future in futures.items():
            state[family] = future.result()
    known = state.get('yandex', {})
    candidates = yandex_candidates(['/var/log/nginx/access.log', '/var/log/nginx/abdrive.access.log'])
    candidates.update(address for address, at in known.items() if now-at >= 86400)
    rejected = {address: at for address, at in state.get('yandex_rejected', {}).items() if now-at < 86400}
    check = sorted(address for address in candidates if address not in rejected and (address not in known or now-known[address] >= 86400))[:64]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as workers:
        for address, valid in zip(check, workers.map(confirm_yandex, check)):
            if valid:
                known[address] = now
            else:
                rejected[address] = now
    state['yandex_rejected'] = dict(sorted(rejected.items(), key=lambda item: item[1], reverse=True)[:512])
    state['yandex'] = {address: at for address, at in known.items() if now-at < 7*86400}
    content = render(state)
    output = pathlib.Path(args.output)
    previous = output.read_text() if output.exists() else None
    if previous != content:
        atomic_write(output, content)
        if args.install:
            try:
                subprocess.run(['nginx', '-t'], check=True, capture_output=True)
                subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
            except Exception:
                if previous is None:
                    output.unlink()
                else:
                    atomic_write(output, previous)
                raise
    atomic_write(state_path, json.dumps(state, sort_keys=True))
    print(json.dumps({'networks': {family: len(state[family]['networks']) for family in FEEDS}, 'yandex_verified_addresses': len(state['yandex']), 'configuration_changed': previous != content}))

if __name__ == '__main__':
    main()
