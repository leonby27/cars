"""Local country classifier and geographic verification clearance."""
import base64
import datetime
import ipaddress
import json
from pathlib import Path
import re


def load_policy(path):
    policy=json.loads(Path(path).read_text())
    if 'geography' not in policy:raise ValueError('Explicit geography policy required')
    value=policy['geography']
    if not isinstance(value,dict) or type(value.get('enabled',False)) is not bool:raise ValueError('Invalid geography policy')
    if set(value)-{'enabled','exempt_countries'}:raise ValueError('Unknown geography setting')
    if not value.get('enabled',False):return None
    countries=value.get('exempt_countries')
    if not isinstance(countries,list) or not countries or any(not isinstance(c,str) or not re.fullmatch('[A-Z]{2}',c) for c in countries):raise ValueError('Explicit country exemptions required')
    return {'exempt_countries':sorted(set(countries))}


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


class Geography:
    def __init__(self,db,now,policy,countries):
        self.db,self.now,self.policy,self.countries=db,now,policy,countries
        self.db.execute('CREATE TABLE IF NOT EXISTS geo_verified (session TEXT PRIMARY KEY,expires REAL)')

    def clean(self):
        self.db.execute('DELETE FROM geo_verified WHERE expires<=?',(self.now(),))

    def country_gate(self,address,ua):
        if self.countries.verified_service(address,ua):return None
        if self.countries.classification(address)=='outside':return {'reason':'geo_country_verification'}
        return None

    def session_verified(self,session):
        return bool(session and self.db.execute('SELECT 1 FROM geo_verified WHERE session=? AND expires>?',(session,self.now())).fetchone())

    def verified(self,session):
        if session:self.db.execute('INSERT INTO geo_verified VALUES (?,?) ON CONFLICT(session) DO UPDATE SET expires=excluded.expires',(session,self.now()+3600))
