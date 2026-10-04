#!/usr/bin/env python3
"""Shared, fail-open public catalog budget. No access to the application database."""
import base64
import datetime
import hashlib
import hmac
import html
import http.cookies
import http.server
import io
import ipaddress
import json
import math
import os
from pathlib import Path
import secrets
import re
import sqlite3
import struct
import threading
import time
import urllib.parse
import zlib
import wave

DAY = 86400
COOKIE = '__Host-catalog_continue'
SESSION_COOKIE = '__Host-catalog_session'
BEHAVIOR_DEFAULTS = {
    'min_ips_hour':32, 'details_hour':250,
    'min_ips_day':128, 'details_day':1000,
    'network_clearance_units':10000, 'network_clearance_details':1000,
    'ordinary_clearance_units':8000, 'ordinary_clearance_details':600,
    'risk_clearance_units':2000, 'risk_clearance_details':100,
}
TRACKING = {'gclid', 'yclid', 'fbclid', 'nocount', 'cache', 'cb', '_', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'}

def load_policy(path):
    path = Path(path)
    if not path.exists():
        return (), 0
    policy = json.loads(path.read_text())
    networks = tuple(ipaddress.ip_network(value, strict=True) for value in policy['early_check_networks'])
    if any(network.prefixlen == 0 for network in networks):
        raise ValueError('A global early-check network is not allowed')
    until = datetime.datetime.fromisoformat(policy['early_check_until_utc'].replace('Z', '+00:00'))
    if until.utcoffset() != datetime.timedelta(0):
        raise ValueError('Early-check expiry must specify UTC')
    return networks, until.timestamp()

def load_behavior_policy(path):
    path = Path(path)
    if not path.exists():return None
    policy = json.loads(path.read_text()).get('behavior', {})
    if not isinstance(policy,dict):raise ValueError('Behavior policy must be an object')
    if not isinstance(policy.get('enabled',False),bool):raise ValueError('Behavior enabled must be boolean')
    if not policy.get('enabled',False):return None
    if set(policy)-{'enabled',*BEHAVIOR_DEFAULTS}:raise ValueError('Unknown behavior setting')
    values = {**BEHAVIOR_DEFAULTS, **{k:v for k,v in policy.items() if k!='enabled'}}
    if any(type(v) is not int or v<=0 for v in values.values()):raise ValueError('Behavior limits must be positive integers')
    return values

def query_number(value):
    # Match the application's Number() handling of decimal and base prefixes.
    raw=value.strip()
    return int(raw,0) if raw.lower().startswith(('0x','0o','0b')) else float(raw or '0')

def reading(method, uri):
    # HEAD does not deliver listing bodies. Forms, auth, analytics, photos and
    # model/count metadata never spend the catalog-copy budget.
    if method != 'GET':
        return None
    parts = urllib.parse.urlsplit(uri)
    path = urllib.parse.unquote(parts.path).rstrip('/')
    pairs = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    # Application URLSearchParams.get() reads the first occurrence. Match it,
    # especially before exempting a light model response with duplicate keys.
    params = {}
    for key,value in pairs:
        params.setdefault(key,value)
    if path == '/api/model-catalog':
        # Only light=1 omits cars. Full model data is the same paginated
        # collection as its HTML catalog page, not exempt count metadata.
        if params.get('light') == '1':
            return None
        path = '/catalog/' + params.get('brand', '') + '/' + params.get('model', '')
        pairs = [(k,v) for k,v in pairs if k not in ('brand','model','light')]
    if path == '/api/pages/catalog':
        path = '/catalog'
    if path == '/api/pages/car':
        path = '/cars/' + params.get('id', '')
        pairs = []
    if path == '/api/cars':
        try:
            value=query_number(params.get('limit','24'))
            if not value or value!=value:value=24
            units=math.ceil(min(100,max(1,value)))
        except (ValueError, OverflowError):
            units=24
        try:paged=query_number(params.get('offset','0'))>0
        except (ValueError,OverflowError):paged=False
        kind = 'collection'
    elif path == '/catalog' or path.startswith('/catalog/'):
        units, kind = 48, 'collection'
        try:
            paged = query_number(params.get('page', '1')) > 1
        except (ValueError,OverflowError):
            paged = False
    elif path.startswith(('/cars/', '/api/cars/')) and path not in ('/api/cars/summary',):
        # Use one identity for the HTML and JSON representation of a vehicle.
        match=re.fullmatch(r'/(?:api/)?cars/([^/]+)(?:/report)?',path)
        if match is None:return None
        path = '/cars/' + match[1]
        pairs = []
        units, paged, kind = 1, False, 'detail'
    else:
        return None
    canonical = path + '?' + urllib.parse.urlencode(sorted((k, v) for k, v in pairs if k not in TRACKING and not k.startswith('utm_')))
    return {'signature': hashlib.sha256(canonical.encode()).hexdigest(), 'units': units, 'paged': int(paged), 'kind': kind}

def suspicious(units, collections, paged, details):
    # Requires a long enumeration, not an initial page/filter burst. Repeated
    # identical reads do not count. Units are requested capacity, not saved cars.
    return (units >= 8000 and paged >= 100) or (units >= 16000 and collections >= 300) or details >= 600

class Store:
    def __init__(self, path, secret, now=time.time, early_networks=(), early_until=0, behavior=None):
        self.secret, self.now, self.lock = secret, now, threading.RLock()
        self.early_networks = tuple(ipaddress.ip_network(value) for value in early_networks)
        self.early_until = early_until
        self.behavior = {**BEHAVIOR_DEFAULTS, **behavior} if behavior is not None else None
        self.db = sqlite3.connect(path, check_same_thread=False, timeout=.3)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=NORMAL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS budgets (ip TEXT PRIMARY KEY, started REAL, units INTEGER, collections INTEGER, paged INTEGER, details INTEGER);
          CREATE TABLE IF NOT EXISTS seen (ip TEXT, sig TEXT, PRIMARY KEY(ip,sig));
          CREATE TABLE IF NOT EXISTS passes (id TEXT PRIMARY KEY, ip TEXT, expires REAL, units INTEGER, details INTEGER);
          CREATE TABLE IF NOT EXISTS puzzles (id TEXT PRIMARY KEY, ip TEXT, answer TEXT, expires REAL, attempts INTEGER);
          CREATE TABLE IF NOT EXISTS attempts (ip TEXT PRIMARY KEY, started REAL, issued INTEGER, submitted INTEGER);
          CREATE TABLE IF NOT EXISTS network_windows (scope TEXT PRIMARY KEY, started REAL, units INTEGER, collections INTEGER, paged INTEGER, details INTEGER, addresses INTEGER);
          CREATE TABLE IF NOT EXISTS network_seen (scope TEXT, sig TEXT, PRIMARY KEY(scope,sig));
          CREATE TABLE IF NOT EXISTS network_addresses (scope TEXT, ip TEXT, PRIMARY KEY(scope,ip));
          CREATE TABLE IF NOT EXISTS network_risk (scope TEXT PRIMARY KEY, expires REAL);
          CREATE TABLE IF NOT EXISTS clearance_totals (scope TEXT PRIMARY KEY, started REAL, units INTEGER, details INTEGER);
        ''')
        self.last_cleanup = 0

    def key(self, ip):
        return hmac.new(self.secret, str(ip).encode(), hashlib.sha256).hexdigest()[:32]

    def sign(self, value):
        return hmac.new(self.secret, value.encode(), hashlib.sha256).hexdigest()

    def session(self, cookie):
        try:
            cookies=http.cookies.SimpleCookie(cookie)
            token=cookies[SESSION_COOKIE].value
            identity,expires,signature=token.split('.')
            if len(identity)==32 and int(expires)>self.now() and hmac.compare_digest(signature,self.sign(identity+'.'+expires)):
                return self.key('session:'+identity)
        except (ValueError,KeyError,http.cookies.CookieError):pass
        return ''

    def ensure_session(self,cookie):
        identity=self.session(cookie)
        if identity or self.behavior is None:return identity,''
        raw=secrets.token_hex(16);value=raw+'.'+str(int(self.now()+DAY))
        token=value+'.'+self.sign(value)
        return self.key('session:'+raw),SESSION_COOKIE+'='+token+'; Path=/; Max-Age=86400; Secure; HttpOnly; SameSite=Lax'

    def network_scopes(self,address):
        return [self.key('network:'+str(ipaddress.ip_network(str(address)+'/'+str(prefix),strict=False))) for prefix in ((24,16) if address.version==4 else (64,48))]

    def observe_networks(self,address,read):
        if self.behavior is None:return []
        now=self.now();ip=self.key(str(address));active=[]
        for network in self.network_scopes(address):
            for seconds,label in [(3600,'hour'),(DAY,'day')]:
                scope=network+':'+label
                row=self.db.execute('SELECT started,units,collections,paged,details,addresses FROM network_windows WHERE scope=?',(scope,)).fetchone()
                if row is None or now-row[0]>=seconds:
                    self.db.execute('DELETE FROM network_seen WHERE scope=?',(scope,))
                    self.db.execute('DELETE FROM network_addresses WHERE scope=?',(scope,))
                    self.db.execute('INSERT OR REPLACE INTO network_windows VALUES (?,?,0,0,0,0,0)',(scope,now))
                new_address=self.db.execute('INSERT OR IGNORE INTO network_addresses VALUES (?,?)',(scope,ip)).rowcount
                new_read=self.db.execute('INSERT OR IGNORE INTO network_seen VALUES (?,?)',(scope,read['signature'])).rowcount
                self.db.execute('UPDATE network_windows SET units=units+?,collections=collections+?,paged=paged+?,details=details+?,addresses=addresses+? WHERE scope=?',
                    (new_read*read['units'],new_read*(read['kind']=='collection'),new_read*read['paged'],new_read*(read['kind']=='detail'),new_address,scope))
                _,units,collections,paged,details,addresses=self.db.execute('SELECT * FROM network_windows WHERE scope=?',(scope,)).fetchone()[1:]
                min_ips=self.behavior['min_ips_'+label];min_details=self.behavior['details_'+label]
                volume=(units>=8000 and paged>=100) or (units>=16000 and collections>=300)
                if addresses>=min_ips and (details>=min_details or volume):
                    self.db.execute('INSERT INTO network_risk VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET expires=max(expires,excluded.expires)',(network,now+DAY))
            if self.db.execute('SELECT 1 FROM network_risk WHERE scope=? AND expires>?',(network,now)).fetchone():active.append(network)
        return active

    def budget(self,key):
        row=self.db.execute('SELECT started,units,collections,paged,details FROM budgets WHERE ip=?',(key,)).fetchone()
        if row is None or self.now()-row[0]>=DAY:
            self.db.execute('DELETE FROM seen WHERE ip=?',(key,))
            self.db.execute('INSERT OR REPLACE INTO budgets VALUES (?,?,0,0,0,0)',(key,self.now()))
            row=(self.now(),0,0,0,0)
        return row

    def spent_clearance(self,scopes,read):
        for scope,max_units,max_details in scopes:
            row=self.db.execute('SELECT started,units,details FROM clearance_totals WHERE scope=?',(scope,)).fetchone()
            if row and self.now()-row[0]<DAY and (row[1]+read['units']>max_units or row[2]+(read['kind']=='detail')>max_details):return True
        return False

    def charge_clearance(self,scopes,read):
        for scope,_,_ in scopes:
            row=self.db.execute('SELECT started FROM clearance_totals WHERE scope=?',(scope,)).fetchone()
            if row is None or self.now()-row[0]>=DAY:self.db.execute('INSERT OR REPLACE INTO clearance_totals VALUES (?,?,0,0)',(scope,self.now()))
            self.db.execute('UPDATE clearance_totals SET units=units+?,details=details+? WHERE scope=?',(read['units'],read['kind']=='detail',scope))

    def record_session(self,session,read,seen):
        if session and not seen:
            self.db.execute('INSERT INTO seen VALUES (?,?)',(session,read['signature']))
            self.db.execute('UPDATE budgets SET units=units+?,collections=collections+?,paged=paged+?,details=details+? WHERE ip=?',(read['units'],read['kind']=='collection',read['paged'],read['kind']=='detail',session))

    def clean(self):
        now = self.now()
        if now - self.last_cleanup < 3600:
            return
        self.db.execute('DELETE FROM seen WHERE ip IN (SELECT ip FROM budgets WHERE started < ?)', (now-DAY,))
        self.db.execute('DELETE FROM budgets WHERE started < ?', (now-DAY,))
        self.db.execute('DELETE FROM passes WHERE expires < ?', (now,))
        self.db.execute('DELETE FROM puzzles WHERE expires < ?', (now,))
        self.db.execute('DELETE FROM attempts WHERE started < ?', (now-600,))
        self.db.execute('DELETE FROM network_seen WHERE scope IN (SELECT scope FROM network_windows WHERE started < ?)',(now-DAY,))
        self.db.execute('DELETE FROM network_addresses WHERE scope IN (SELECT scope FROM network_windows WHERE started < ?)',(now-DAY,))
        self.db.execute('DELETE FROM network_windows WHERE started < ?',(now-DAY,))
        self.db.execute('DELETE FROM network_risk WHERE expires < ?',(now,))
        self.db.execute('DELETE FROM clearance_totals WHERE started < ?',(now-DAY,))
        self.last_cleanup = now

    def check(self, ip, method, uri, cookie='', session=None):
        read = reading(method, uri)
        if read is None:
            return True, None
        address = ipaddress.ip_address(ip)
        targeted = [self.key('network:'+str(network)) for network in self.early_networks if address.version == network.version and address in network and self.now()<self.early_until]
        early = bool(targeted)
        ip = self.key(ip)
        with self.lock, self.db:
            self.clean()
            networks=list(dict.fromkeys(targeted+self.observe_networks(address,read)))
            early=early or bool(networks)
            session=(self.session(cookie) if session is None else session) if self.behavior is not None else ''
            row = self.budget(ip)
            session_row=self.budget(session) if session else None
            _, units, collections, paged, details = row
            grant = None
            try:
                cookies = http.cookies.SimpleCookie(cookie)
                token = cookies[COOKIE].value if COOKIE in cookies else ''
                grant_id, signature = token.split('.',1)
                if hmac.compare_digest(signature,self.sign(grant_id)):
                    grant = self.db.execute('SELECT id,units,details FROM passes WHERE id=? AND ip=? AND expires>?', (grant_id,ip,self.now())).fetchone()
            except (ValueError, http.cookies.CookieError):
                pass
            snapshot = {'ip_hash':ip,'units':units,'collections':collections,'paged':paged,'details':details}
            ip_seen=bool(self.db.execute('SELECT 1 FROM seen WHERE ip=? AND sig=?',(ip,read['signature'])).fetchone())
            session_seen=bool(session and self.db.execute('SELECT 1 FROM seen WHERE ip=? AND sig=?',(session,read['signature'])).fetchone())
            session_blocked=bool(session_row and suspicious(*session_row[1:]) and not session_seen)
            blocked = early or suspicious(units, collections, paged, details) or session_blocked
            scopes=[]
            if blocked and self.behavior is not None:
                kind='risk' if early else 'ordinary'
                personal=(self.behavior[kind+'_clearance_units'],self.behavior[kind+'_clearance_details'])
                if not ip_seen:scopes.append(('ip:'+ip,*personal))
                if session and not session_seen:scopes.append(('session:'+session,*personal))
                if not ip_seen:scopes.extend(('network:'+network,self.behavior['network_clearance_units'],self.behavior['network_clearance_details']) for network in networks)
                if self.spent_clearance(scopes,read):return False,{**snapshot,'reason':'daily_clearance_budget','recoverable':False}
            if early and not grant:
                return False, {**snapshot, 'reason':'network_verification' if networks and not targeted else 'early_network_verification'}
            # Ordinary visitors retain visited views; targeted networks must
            # present a live clearance even for old/shared-cache responses.
            if ip_seen and not session_blocked:
                self.record_session(session,read,session_seen)
                return True, None
            max_units, max_details = (2000, 100) if early else (8000, 600)
            if blocked and grant and grant[1]+read['units'] <= max_units and grant[2]+(read['kind']=='detail') <= max_details:
                self.db.execute('UPDATE passes SET units=units+?, details=details+? WHERE id=?', (read['units'],read['kind']=='detail',grant[0]))
                blocked = False
                self.charge_clearance(scopes,read)
            if blocked:
                return False, {**snapshot, 'reason':'clearance_budget' if early else 'daily_budget'}
            if not ip_seen:
                self.db.execute('INSERT INTO seen VALUES (?,?)', (ip,read['signature']))
                self.db.execute('UPDATE budgets SET units=units+?,collections=collections+?,paged=paged+?,details=details+? WHERE ip=?', (read['units'],read['kind']=='collection',read['paged'],read['kind']=='detail',ip))
            self.record_session(session,read,session_seen)
            return True, None

    def attempt(self, ip, field):
        row = self.db.execute('SELECT started,issued,submitted FROM attempts WHERE ip=?', (ip,)).fetchone()
        if row is None or self.now()-row[0] >= 600:
            self.db.execute('INSERT OR REPLACE INTO attempts VALUES (?,?,0,0)', (ip,self.now()))
            row = (self.now(),0,0)
        column, cap = ('issued',20) if field == 'issued' else ('submitted',40)
        if row[1 if column=='issued' else 2] >= cap:
            return False
        self.db.execute('UPDATE attempts SET '+column+'='+column+'+1 WHERE ip=?', (ip,))
        return True

    def puzzle(self, ip):
        ip = self.key(ip)
        with self.lock, self.db:
            self.clean()
            if not self.attempt(ip,'issued'):
                return None
            identity, answer = secrets.token_urlsafe(24), ''.join(secrets.choice('23456789') for _ in range(4))
            # Answer is never embedded in the token, image URL, HTML or logs.
            self.db.execute('INSERT INTO puzzles VALUES (?,?,?,?,0)', (identity,ip,self.sign(identity+':'+answer),self.now()+600))
            return identity, captcha_png(answer), captcha_audio(answer)

    def verify(self, ip, identity, answer):
        ip = self.key(ip)
        with self.lock, self.db:
            if not self.attempt(ip,'submitted'):
                return None
            row = self.db.execute('SELECT answer,attempts FROM puzzles WHERE id=? AND ip=? AND expires>?', (identity,ip,self.now())).fetchone()
            if not row or row[1]>=5:
                return None
            self.db.execute('UPDATE puzzles SET attempts=attempts+1 WHERE id=?', (identity,))
            if not hmac.compare_digest(row[0],self.sign(identity+':'+answer.strip())):
                return None
            self.db.execute('DELETE FROM puzzles WHERE id=?', (identity,))
            grant = secrets.token_urlsafe(24)
            self.db.execute('INSERT INTO passes VALUES (?,?,?,0,0)', (grant,ip,self.now()+3600))
            return grant+'.'+self.sign(grant)

# Tiny dependency-free raster font; server-side image, not readable SVG text.
FONT = {
 '2':['11110','00001','00001','01110','10000','10000','11111'],
 '3':['11110','00001','00001','01110','00001','00001','11110'],
 '4':['10010','10010','10010','11111','00010','00010','00010'],
 '5':['11111','10000','10000','11110','00001','00001','11110'],
 '6':['01111','10000','10000','11110','10001','10001','01110'],
 '7':['11111','00001','00010','00100','01000','01000','01000'],
 '8':['01110','10001','10001','01110','10001','10001','01110'],
 '9':['01110','10001','10001','01111','00001','00001','11110']}

def captcha_png(answer):
    width,height=220,70
    pixels=bytearray([248,249,250]*(width*height))
    def dot(x,y,color):
        if 0<=x<width and 0<=y<height:
            pos=(y*width+x)*3; pixels[pos:pos+3]=bytes(color)
    for _ in range(500):
        dot(secrets.randbelow(width),secrets.randbelow(height),(170,180,190))
    for at,char in enumerate(answer):
        ox,oy=18+at*49+secrets.randbelow(5),12+secrets.randbelow(6)
        skew=secrets.choice([-1,0,1])
        for y,row in enumerate(FONT[char]):
            for x,bit in enumerate(row):
                if bit=='1':
                    for dy in range(5):
                        for dx in range(5): dot(ox+x*5+dx+skew*y,oy+y*5+dy,(35,45,55))
    raw=b''.join(b'\0'+pixels[y*width*3:(y+1)*width*3] for y in range(height))
    def chunk(name,data): return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')

def captcha_audio(answer):
    directory=Path(__file__).with_name('catalog-guard-audio')
    if not all((directory/(char+'.wav')).exists() for char in answer): return None
    output=io.BytesIO()
    with wave.open(output,'wb') as result:
        result.setnchannels(1);result.setsampwidth(2);result.setframerate(16000)
        for char in answer:
            with wave.open(str(directory/(char+'.wav')),'rb') as part:
                if part.getparams()[:3] != (1,2,16000): raise ValueError('Unsupported challenge audio')
                result.writeframes(part.readframes(part.getnframes()))
            result.writeframes(b'\0'*16000)
    return output.getvalue()

def safe_return(value):
    try:
        parts=urllib.parse.urlsplit(value)
        if not parts.scheme and not parts.netloc and value.startswith('/') and not value.startswith('//') and '\\' not in value and not any(ord(c)<32 for c in value):
            if parts.path.startswith(('/catalog','/cars/','/models/')) or parts.path=='/':
                return value[:2000]
    except ValueError:
        pass
    return '/catalog'

def page(body):
    return ('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Продолжить просмотр</title><style>body{font:16px/1.5 system-ui,sans-serif;color:#27303b;background:#fff;margin:0;padding:24px}main{max-width:440px;margin:20px auto}h1{font-size:24px;line-height:1.2}input,button{font:inherit;border-radius:10px;padding:12px;border:1px solid #bcc3ca;max-width:100%;box-sizing:border-box}button{background:#27303b;color:white;cursor:pointer}input{width:100%;margin:8px 0 16px}a{color:#334f81}img{max-width:100%}</style><main>'+body+'</main></html>').encode()

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args): pass

    def send(self,status,body=b'',kind='text/html; charset=utf-8',headers=None):
        self.send_response(status)
        for k,v in {'Content-Type':kind,'Cache-Control':'no-store','Content-Length':str(len(body)),'X-Content-Type-Options':'nosniff',**(headers or {})}.items(): self.send_header(k,v)
        self.end_headers()
        if self.command!='HEAD': self.wfile.write(body)

    def context(self):
        return self.headers.get('X-Guard-IP','127.0.0.1')

    def do_HEAD(self): self.do_GET()

    def do_GET(self):
        try:
            path=urllib.parse.urlsplit(self.path).path
            if path=='/health': return self.send(204)
            if path=='/check':
                if self.headers.get('X-Guard-Exempt') in ('1','10','01','11'): return self.send(204)
                if reading(self.headers.get('X-Guard-Method','GET'),self.headers.get('X-Guard-URI','/')) is None:return self.send(204)
                session,session_cookie=self.server.store.ensure_session(self.headers.get('Cookie',''))
                allowed,snapshot=self.server.store.check(self.context(),self.headers.get('X-Guard-Method','GET'),self.headers.get('X-Guard-URI','/'),self.headers.get('Cookie',''),session=session)
                if not allowed:
                    print(json.dumps({'event':'catalog_verification_required','at':int(time.time()),'mode':self.server.mode,**snapshot}),flush=True)
                headers={}
                if session_cookie:headers.update({'X-Guard-Session':session_cookie,'X-Guard-Session-Cache':'private, no-store'})
                if not allowed:headers['X-Guard-Reason']=snapshot.get('reason','daily_budget')
                return self.send(204 if allowed or self.server.mode!='enforce' else 403,headers=headers)
            if path=='/_catalog-check/client.js':
                return self.send(200,self.server.client_script,'text/javascript; charset=utf-8')
            if path=='/blocked':
                uri=self.headers.get('X-Guard-URI','/catalog')
                if self.headers.get('X-Guard-Reason')=='daily_clearance_budget':
                    if urllib.parse.unquote(urllib.parse.urlsplit(uri).path).startswith('/api/'):
                        return self.send(429,json.dumps({'error':'catalog_daily_budget','message':'Слишком большой объём просмотра. Попробуйте позже.'}).encode(),'application/json; charset=utf-8',{'Retry-After':'3600'})
                    return self.send(429,page('<h1>Попробуйте позже</h1><p>Достигнут лимит массового просмотра. Уже просмотренные предложения, вход и заявки остаются доступны.</p><a href="/">На главную</a>'),headers={'Retry-After':'3600'})
                if urllib.parse.unquote(urllib.parse.urlsplit(uri).path).startswith('/api/'):
                    body=json.dumps({'error':'catalog_verification_required','verificationUrl':'/_catalog-check'}).encode()
                    return self.send(429,body,'application/json; charset=utf-8',{'X-Catalog-Verification':'/_catalog-check','Retry-After':'60'})
                target=safe_return(uri)
                return self.send(303,headers={'Location':'/_catalog-check?return='+urllib.parse.quote(target,safe='')})
            if path=='/_catalog-check':
                puzzle=self.server.store.puzzle(self.context())
                if puzzle is None:
                    return self.send(429,page('<h1>Подождите немного</h1><p>Попробуйте продолжить просмотр через несколько минут.</p><a href="/catalog">Вернуться в каталог</a>'),headers={'Retry-After':'600'})
                identity,png,audio=puzzle
                target=safe_return(urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('return',['/catalog'])[0])
                body='<h1>Продолжить просмотр</h1><p>Подтвердите, что вы человек. Введите цифры с картинки, чтобы продолжить.</p><form method="post" action="/_catalog-check"><input type="hidden" name="id" value="'+identity+'"><input type="hidden" name="return" value="'+html.escape(target,quote=True)+'"><img width="220" height="70" alt="Четыре цифры для проверки" src="data:image/png;base64,'+base64.b64encode(png).decode()+'"><label for="answer">Цифры с картинки</label><input id="answer" name="answer" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required><button>Продолжить</button></form><p><a href="/_catalog-check?return='+urllib.parse.quote(target,safe='')+'">Другая картинка</a></p><p>Проверка ограничивает массовое копирование каталога. Ваши заявки и аккаунт доступны.</p>'
                if audio:
                    body += '<p>Можно прослушать те же цифры:</p><audio controls aria-label="Прослушать цифры проверки" src="data:audio/wav;base64,'+base64.b64encode(audio).decode()+'"></audio>'
                return self.send(200,page(body))
            return self.send(404)
        except Exception as error:
            print(json.dumps({'event':'catalog_guard_error','type':type(error).__name__}),flush=True)
            return self.send(204 if urllib.parse.urlsplit(self.path).path=='/check' else 503)

    def do_POST(self):
        try:
            if self.path!='/_catalog-check': return self.send(404)
            host=self.headers.get('X-Guard-Host','')
            if self.headers.get('Origin')!='https://'+host: return self.send(403)
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=4096: return self.send(400)
            values=urllib.parse.parse_qs(self.rfile.read(size).decode('utf-8'))
            token=self.server.store.verify(self.context(),values.get('id',[''])[0],values.get('answer',[''])[0])
            target=safe_return(values.get('return',['/catalog'])[0])
            if not token:
                return self.send(200,page('<h1>Попробуйте ещё раз</h1><p>Цифры не совпали или время проверки истекло.</p><a href="/_catalog-check?return='+urllib.parse.quote(target,safe='')+'">Новая проверка</a>'))
            headers={'Set-Cookie':COOKIE+'='+token+'; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax'}
            body='<h1>Можно продолжить просмотр</h1><a href="'+html.escape(target,quote=True)+'">Вернуться в каталог</a><script>if(parent!==window)parent.postMessage({type:"catalog-verified"},location.origin);else location.replace('+json.dumps(target).replace('<','\\u003c')+');</script>'
            return self.send(200,page(body),headers=headers)
        except Exception as error:
            print(json.dumps({'event':'catalog_guard_error','type':type(error).__name__}),flush=True)
            return self.send(503)

def main():
    state=Path(os.environ.get('CATALOG_GUARD_STATE','/var/lib/car-catalog-guard'))
    state.mkdir(parents=True,exist_ok=True)
    keyfile=state/'secret'
    if not keyfile.exists():
        fd=os.open(keyfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as f: f.write(secrets.token_bytes(32))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('CATALOG_GUARD_PORT','8790'))),Handler)
    policy_path=os.environ.get('CATALOG_GUARD_POLICY', Path(__file__).with_name('catalog-guard-policy.json'))
    networks, until = load_policy(policy_path)
    behavior=load_behavior_policy(policy_path)
    server.store=Store(state/'budgets.sqlite3',keyfile.read_bytes(),early_networks=networks,early_until=until,behavior=behavior)
    server.mode=os.environ.get('CATALOG_GUARD_MODE','observe')
    if server.mode not in ('observe','enforce'): raise ValueError('invalid mode')
    server.client_script=Path(__file__).with_name('catalog-guard-client.js').read_bytes()
    print(json.dumps({'event':'catalog_guard_started','mode':server.mode,'early_check_networks':[str(network) for network in networks],'early_check_until':until,'behavior_enabled':behavior is not None}),flush=True)
    server.serve_forever()

if __name__=='__main__': main()
