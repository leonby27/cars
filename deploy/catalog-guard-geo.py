"""Selective country gating for observed cross-network catalog campaigns."""
import base64
import datetime
import ipaddress
import json
from pathlib import Path
import re
import urllib.parse

DEFAULTS = dict(window_seconds=1800, pair_seconds=120, min_pairs=64,
                min_html_ips=32, min_api_ips=8, risk_seconds=3600)


def load_policy(path):
    if not Path(path).exists():
        return None
    value = json.loads(Path(path).read_text()).get('geo_campaign', {})
    if not isinstance(value, dict) or type(value.get('enabled', False)) is not bool:
        raise ValueError('Invalid geo campaign policy')
    if not value.get('enabled', False):
        return None
    if set(value) - {'enabled', 'exempt_countries', *DEFAULTS}:
        raise ValueError('Unknown geo campaign setting')
    countries = value.get('exempt_countries')
    if not isinstance(countries, list) or not countries or any(not isinstance(c, str) or not re.fullmatch('[A-Z]{2}', c) for c in countries):
        raise ValueError('Explicit country exemptions required')
    values = {**DEFAULTS, **{k: v for k, v in value.items() if k in DEFAULTS}}
    if any(type(v) is not int or v <= 0 for v in values.values()):
        raise ValueError('Invalid geo campaign thresholds')
    # Prevent an accidentally broad first-visit challenge policy.
    if values['min_pairs'] < 32 or values['min_html_ips'] < 16 or values['min_api_ips'] < 4:
        raise ValueError('Geo campaign evidence thresholds are too low')
    return {**values, 'exempt_countries': sorted(set(countries))}


class Countries:
    """Small merged ranges, periodically reloaded; unknown/stale fails open."""
    def __init__(self, path, policy, now):
        self.path, self.policy, self.now = Path(path), policy, now
        self.next_reload = 0
        self.mtime = None
        self.valid = False
        self.ranges, self.starts, self.ahrefs = {}, {}, ()
        self.reload()

    def reload(self):
        self.next_reload = self.now() + 60
        try:
            mtime = self.path.stat().st_mtime_ns
            if self.valid and mtime == self.mtime and self.now() < self.expires:
                return
            data = json.loads(self.path.read_text())
            if data['exempt_countries'] != self.policy['exempt_countries']:
                raise ValueError('Country database does not match policy')
            expires = datetime.datetime.fromisoformat(data['expires_utc'].replace('Z', '+00:00')).timestamp()
            if expires <= self.now():
                raise ValueError('Country database expired')
            ranges = {}
            for version in (4, 6):
                width = 4 if version == 4 else 16
                stride = width*2+1
                source = data['ranges'][str(version)]
                if isinstance(source, str):
                    packed = base64.b64decode(source, validate=True)
                else:
                    packed = b''.join(int(a).to_bytes(width, 'big')+int(b).to_bytes(width, 'big')+bytes([('unknown','exempt','outside').index(tag)]) for a,b,tag in source)
                if not packed or len(packed)%stride:
                    raise ValueError('Invalid country ranges')
                previous = -1
                for at in range(0, len(packed), stride):
                    first = int.from_bytes(packed[at:at+width], 'big')
                    last = int.from_bytes(packed[at+width:at+width*2], 'big')
                    if first <= previous or first > last or packed[at+width*2] > 2:
                        raise ValueError('Invalid country range ordering')
                    previous = last
                ranges[version] = (packed, width, stride)
            services = tuple(ipaddress.ip_network(n) for n in data['ahrefs_networks'])
            if not services or any(n.prefixlen == 0 for n in services):
                raise ValueError('Invalid verified service ranges')
            self.ranges, self.ahrefs = ranges, services
            self.mtime = mtime
            self.expires, self.valid = expires, True
        except (OSError, ValueError, KeyError, TypeError):
            self.valid = False

    def classification(self, address):
        if self.now() >= self.next_reload:
            self.reload()
        if not self.valid or self.now() >= self.expires:
            return 'unknown'
        value = int(address)
        packed, width, stride = self.ranges[address.version]
        low, high = 0, len(packed)//stride
        while low < high:
            middle = (low+high)//2
            first = int.from_bytes(packed[middle*stride:middle*stride+width], 'big')
            if first <= value:low = middle+1
            else:high = middle
        if low == 0:
            return 'unknown'
        at = (low-1)*stride
        last = int.from_bytes(packed[at+width:at+width*2], 'big')
        return ('unknown','exempt','outside')[packed[at+width*2]] if value <= last else 'unknown'

    def verified_service(self, address, ua):
        return bool(self.valid and re.search(r'ahrefs(?:bot|siteaudit)', ua, re.I)
                    and any(address.version == n.version and address in n for n in self.ahrefs))


class Campaign:
    def __init__(self, db, key, now, policy, countries):
        self.db, self.key, self.now = db, key, now
        self.policy, self.countries = policy, countries
        self.last_clean = 0
        db.executescript('''
          CREATE TABLE IF NOT EXISTS geo_pages (
            ua TEXT, car TEXT, ip TEXT, network TEXT, at REAL,
            PRIMARY KEY(ua,car));
          CREATE INDEX IF NOT EXISTS geo_pages_at ON geo_pages(at);
          CREATE TABLE IF NOT EXISTS geo_pairs (
            ua TEXT, car TEXT, html_ip TEXT, api_ip TEXT, at REAL,
            PRIMARY KEY(ua,car));
          CREATE INDEX IF NOT EXISTS geo_pairs_at ON geo_pairs(at);
          CREATE INDEX IF NOT EXISTS geo_pairs_ua_at ON geo_pairs(ua,at);
          CREATE TABLE IF NOT EXISTS geo_risk (ua TEXT PRIMARY KEY, expires REAL, pairs INTEGER);
          CREATE TABLE IF NOT EXISTS geo_verified (session TEXT PRIMARY KEY, expires REAL);
        ''')

    def clean(self):
        now = self.now()
        if now - self.last_clean < 300:
            return
        self.db.execute('DELETE FROM geo_pages WHERE at<?', (now-self.policy['pair_seconds'],))
        self.db.execute('DELETE FROM geo_pairs WHERE at<?', (now-self.policy['window_seconds'],))
        self.db.execute('DELETE FROM geo_risk WHERE expires<=?', (now,))
        self.db.execute('DELETE FROM geo_verified WHERE expires<=?', (now,))
        self.last_clean = now

    def observe(self, address, read, uri, ua, risky_network=False):
        """Risk needs repeated same-car HTML -> API, different IP AND /16(/48),
        with the API arriving from an independently flagged export network.
        Neither country, UA, missing cookies nor ordinary browsing can seed it.
        """
        self.clean()
        if not ua or len(ua) > 1024 or self.countries.verified_service(address, ua):
            return None
        cohort = self.key('geo-ua:' + ' '.join(ua.split()))
        ip = self.key(str(address))
        network = self.key('geo-net:' + str(ipaddress.ip_network(str(address) + ('/16' if address.version == 4 else '/48'), strict=False)))
        path = uri.split('?', 1)[0]
        # reading() already canonicalizes encoded URLs and car representations.
        path = urllib.parse.unquote(path)
        if read['kind'] == 'detail':
            if path.startswith('/cars/'):
                self.db.execute('INSERT INTO geo_pages VALUES (?,?,?,?,?) ON CONFLICT(ua,car) DO UPDATE SET ip=excluded.ip,network=excluded.network,at=excluded.at',
                                (cohort, read['signature'], ip, network, self.now()))
            elif risky_network and path.startswith(('/api/cars/', '/api/pages/car')):
                previous = self.db.execute('SELECT ip,network,at FROM geo_pages WHERE ua=? AND car=?', (cohort, read['signature'])).fetchone()
                if previous and previous[0] != ip and previous[1] != network and 0 <= self.now()-previous[2] <= self.policy['pair_seconds']:
                    inserted = self.db.execute('INSERT INTO geo_pairs VALUES (?,?,?,?,?) ON CONFLICT(ua,car) DO UPDATE SET html_ip=excluded.html_ip,api_ip=excluded.api_ip,at=excluded.at WHERE geo_pairs.at<?',
                                               (cohort, read['signature'], previous[0], ip, self.now(), self.now()-self.policy['window_seconds'])).rowcount
                    if inserted:
                        pairs, html_ips, api_ips = self.db.execute('SELECT count(*),count(DISTINCT html_ip),count(DISTINCT api_ip) FROM geo_pairs WHERE ua=? AND at>=?', (cohort, self.now()-self.policy['window_seconds'])).fetchone()
                        if pairs >= self.policy['min_pairs'] and html_ips >= self.policy['min_html_ips'] and api_ips >= self.policy['min_api_ips']:
                            self.db.execute('INSERT INTO geo_risk VALUES (?,?,?) ON CONFLICT(ua) DO UPDATE SET expires=excluded.expires,pairs=excluded.pairs',
                                            (cohort, self.now()+self.policy['risk_seconds'], pairs))
        row = self.db.execute('SELECT pairs FROM geo_risk WHERE ua=? AND expires>?', (cohort, self.now())).fetchone()
        if row and self.countries.classification(address) == 'outside':
            return {'reason': 'geo_campaign_verification', 'cohort_hash': cohort, 'campaign_pairs': row[0]}
        return None

    def session_verified(self, session):
        return bool(session and self.db.execute('SELECT 1 FROM geo_verified WHERE session=? AND expires>?', (session, self.now())).fetchone())

    def verified(self, session):
        if session:
            self.db.execute('INSERT INTO geo_verified VALUES (?,?) ON CONFLICT(session) DO UPDATE SET expires=excluded.expires', (session, self.now()+3600))
