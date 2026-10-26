#!/usr/bin/env python3
"""Geographic reCAPTCHA and personal catalog budgets; no application DB access."""
import hashlib
import hmac
import html
import importlib.util
import http.cookies
import http.server
import ipaddress
import json
import math
import os
from pathlib import Path
import secrets
import re
import sqlite3
import threading
import time
import urllib.parse

_geo_spec=importlib.util.spec_from_file_location('catalog_guard_geo',Path(__file__).with_name('catalog-guard-geo.py'))
geo_module=importlib.util.module_from_spec(_geo_spec);_geo_spec.loader.exec_module(geo_module)
_captcha_spec=importlib.util.spec_from_file_location('catalog_guard_recaptcha',Path(__file__).with_name('catalog-guard-recaptcha.py'))
captcha_module=importlib.util.module_from_spec(_captcha_spec);_captcha_spec.loader.exec_module(captcha_module)
DAY=86400
COOKIE='__Host-catalog_continue'
SESSION_COOKIE='__Host-catalog_session'
MASS_EXPORT_DEFAULTS={'clearance_units':8000,'clearance_details':600}
TRACKING={'gclid','yclid','fbclid','nocount','cache','cb','_','utm_source','utm_medium','utm_campaign','utm_content','utm_term'}

def load_mass_export_policy(path):
    config=json.loads(Path(path).read_text()).get('mass_export',{})
    if not isinstance(config,dict) or type(config.get('enabled',True)) is not bool:raise ValueError('Invalid mass export policy')
    if set(config)-{'enabled',*MASS_EXPORT_DEFAULTS}:raise ValueError('Unknown mass export setting')
    if not config.get('enabled',True):return None
    values={**MASS_EXPORT_DEFAULTS,**{k:v for k,v in config.items() if k!='enabled'}}
    if any(type(v) is not int or v<=0 for v in values.values()):raise ValueError('Mass export limits must be positive integers')
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



def geographic_home(method, uri):
    # Home HTML embeds catalog cards before the browser requests any API data.
    # Match the renderer's first path parameter and slash normalization too.
    if method != 'GET':return False
    parts=urllib.parse.urlsplit(uri)
    path=urllib.parse.unquote(parts.path).rstrip('/')
    if path in ('','/index.html'):return True
    if path!='/api/pages/static':return False
    params={}
    for key,value in urllib.parse.parse_qsl(parts.query,keep_blank_values=True):params.setdefault(key,value)
    return not params.get('path','').strip('/')


def suspicious(units, collections, paged, details):
    # Requires a long enumeration, not an initial page/filter burst. Repeated
    # identical reads do not count. Units are requested capacity, not saved cars.
    return (units >= 8000 and paged >= 100) or (units >= 16000 and collections >= 300) or details >= 600


class Store:
    def __init__(self,path,secret,now=time.time,mass_export=None,geo_policy=None,country_path=None):
        self.secret,self.now,self.lock=secret,now,threading.RLock()
        self.mass_export={**MASS_EXPORT_DEFAULTS,**mass_export} if mass_export is not None else None
        self.db=sqlite3.connect(path,check_same_thread=False,timeout=.3)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=NORMAL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS budgets (ip TEXT PRIMARY KEY,started REAL,units INTEGER,collections INTEGER,paged INTEGER,details INTEGER);
          CREATE TABLE IF NOT EXISTS seen (ip TEXT,sig TEXT,PRIMARY KEY(ip,sig));
          CREATE TABLE IF NOT EXISTS passes (id TEXT PRIMARY KEY,ip TEXT,expires REAL,units INTEGER,details INTEGER);
          CREATE TABLE IF NOT EXISTS verification_nonces (id TEXT PRIMARY KEY,ip TEXT,binding TEXT,expires REAL);
          CREATE TABLE IF NOT EXISTS attempts (ip TEXT PRIMARY KEY,started REAL,issued INTEGER,submitted INTEGER);
          CREATE TABLE IF NOT EXISTS clearance_totals (scope TEXT PRIMARY KEY,started REAL,units INTEGER,details INTEGER);
        ''')
        self.last_cleanup=0
        self.geo=geo_module.Geography(self.db,self.now,geo_policy,geo_module.Countries(country_path,geo_policy,self.now)) if geo_policy and country_path else None

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
        if identity:return identity,''
        raw=secrets.token_hex(16);value=raw+'.'+str(int(self.now()+DAY))
        token=value+'.'+self.sign(value)
        return self.key('session:'+raw),SESSION_COOKIE+'='+token+'; Path=/; Max-Age=86400; Secure; HttpOnly; SameSite=Lax'

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
        now=self.now()
        if now-self.last_cleanup<3600:return
        self.db.execute('DELETE FROM seen WHERE ip IN (SELECT ip FROM budgets WHERE started<?)',(now-DAY,))
        self.db.execute('DELETE FROM budgets WHERE started<?',(now-DAY,))
        self.db.execute('DELETE FROM passes WHERE expires<?',(now,))
        self.db.execute('DELETE FROM verification_nonces WHERE expires<?',(now,))
        self.db.execute('DELETE FROM attempts WHERE started<?',(now-600,))
        self.db.execute('DELETE FROM clearance_totals WHERE started<?',(now-DAY,))
        if self.geo:self.geo.clean()
        self.last_cleanup=now

    def check(self,ip,method,uri,cookie='',session=None,user_agent=''):
        read=reading(method,uri)
        if read is None and not geographic_home(method,uri):return True,None
        address=ipaddress.ip_address(ip)
        # Verified Ahrefs uses nginx's shared crawl budget, not visitor CAPTCHA.
        if self.geo and self.geo.countries.verified_service(address,user_agent):return True,None
        ip=self.key(ip)
        with self.lock,self.db:
            self.clean()
            session=self.session(cookie) if session is None else session
            row=self.budget(ip) if read else (self.now(),0,0,0,0)
            session_row=self.budget(session) if read and session else None
            _,units,collections,paged,details=row
            grant=None
            try:
                cookies=http.cookies.SimpleCookie(cookie)
                grant_id,signature=cookies[COOKIE].value.split('.',1)
                if hmac.compare_digest(signature,self.sign(grant_id)):
                    grant=self.db.execute('SELECT id,units,details FROM passes WHERE id=? AND ip=? AND expires>?',(grant_id,ip,self.now())).fetchone()
            except (ValueError,KeyError,http.cookies.CookieError):pass
            snapshot={'ip_hash':ip,'units':units,'collections':collections,'paged':paged,'details':details}
            if self.geo:
                try:
                    gate=self.geo.country_gate(address,user_agent)
                    if gate and not grant and not self.geo.session_verified(session):return False,{**snapshot,**gate}
                except Exception as error:
                    print(json.dumps({'event':'catalog_geo_error','type':type(error).__name__}),flush=True)
            if read is None:return True,None
            ip_seen=bool(self.db.execute('SELECT 1 FROM seen WHERE ip=? AND sig=?',(ip,read['signature'])).fetchone())
            session_seen=bool(session and self.db.execute('SELECT 1 FROM seen WHERE ip=? AND sig=?',(session,read['signature'])).fetchone())
            session_blocked=bool(self.mass_export is not None and session_row and suspicious(*session_row[1:]) and not session_seen)
            blocked=self.mass_export is not None and (suspicious(units,collections,paged,details) or session_blocked)
            scopes=[]
            if blocked:
                limits=(self.mass_export['clearance_units'],self.mass_export['clearance_details'])
                if not ip_seen:scopes.append(('ip:'+ip,*limits))
                if session and not session_seen:scopes.append(('session:'+session,*limits))
                if self.spent_clearance(scopes,read):return False,{**snapshot,'reason':'daily_clearance_budget','recoverable':False}
            if ip_seen and not session_blocked:
                self.record_session(session,read,session_seen)
                return True,None
            if blocked and grant and grant[1]+read['units']<=self.mass_export['clearance_units'] and grant[2]+(read['kind']=='detail')<=self.mass_export['clearance_details']:
                self.db.execute('UPDATE passes SET units=units+?,details=details+? WHERE id=?',(read['units'],read['kind']=='detail',grant[0]))
                blocked=False;self.charge_clearance(scopes,read)
            if blocked:return False,{**snapshot,'reason':'daily_budget'}
            if not ip_seen:
                self.db.execute('INSERT INTO seen VALUES (?,?)',(ip,read['signature']))
                self.db.execute('UPDATE budgets SET units=units+?,collections=collections+?,paged=paged+?,details=details+? WHERE ip=?',(read['units'],read['kind']=='collection',read['paged'],read['kind']=='detail',ip))
            self.record_session(session,read,session_seen)
            return True,None

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

    def recaptcha_nonce(self,ip,session):
        ip=self.key(ip)
        with self.lock,self.db:
            self.clean()
            if not session or not self.attempt(ip,'issued'):return None
            identity=secrets.token_urlsafe(24)
            self.db.execute('INSERT INTO verification_nonces VALUES (?,?,?,?)',(identity,ip,self.sign('recaptcha:'+session+':'+identity),self.now()+600))
            return identity

    def consume_recaptcha_nonce(self,ip,session,identity):
        ip=self.key(ip)
        with self.lock,self.db:
            if not session or not self.attempt(ip,'submitted'):return False
            row=self.db.execute('SELECT binding FROM verification_nonces WHERE id=? AND ip=? AND expires>?',(identity,ip,self.now())).fetchone()
            if not row or not hmac.compare_digest(row[0],self.sign('recaptcha:'+session+':'+identity)):return False
            self.db.execute('DELETE FROM verification_nonces WHERE id=?',(identity,))
            return True

    def clearance(self,ip,session=''):
        with self.lock,self.db:
            grant=secrets.token_urlsafe(24)
            self.db.execute('INSERT INTO passes VALUES (?,?,?,0,0)',(grant,self.key(ip),self.now()+3600))
            if self.geo:self.geo.verified(session)
            return grant+'.'+self.sign(grant)


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


class GuardServer(http.server.ThreadingHTTPServer):
    # A single page can open many parallel API reads. The stdlib's default
    # backlog of five can make normal bursts miss nginx's 100 ms connect bound.
    request_queue_size = 128
    daemon_threads = True


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
                method=self.headers.get('X-Guard-Method','GET');uri=self.headers.get('X-Guard-URI','/')
                if reading(method,uri) is None and not geographic_home(method,uri):return self.send(204)
                session,session_cookie=self.server.store.ensure_session(self.headers.get('Cookie',''))
                allowed,snapshot=self.server.store.check(self.context(),self.headers.get('X-Guard-Method','GET'),self.headers.get('X-Guard-URI','/'),self.headers.get('Cookie',''),session=session,user_agent=self.headers.get('User-Agent',''))
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
                verifier=getattr(self.server,'verification',None)
                if verifier:
                    host=self.headers.get('X-Guard-Host','')
                    if host not in verifier.hosts:return self.send(400)
                    session,session_cookie=self.server.store.ensure_session(self.headers.get('Cookie',''))
                    identity=self.server.store.recaptcha_nonce(self.context(),session)
                    if not identity:return self.send(429,page('<h1>Подождите немного</h1><p>Повторите проверку через несколько минут.</p>'),headers={'Retry-After':'600'})
                    target=safe_return(urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('return',['/catalog'])[0])
                    body=('<h1>Подтвердите, что вы человек</h1>'
                          '<form id="catalog-verification" method="post" action="/_catalog-check">'
                          '<input type="hidden" name="id" value="'+identity+'">'
                          '<input type="hidden" name="return" value="'+html.escape(target,quote=True)+'">'
                          '<div class="g-recaptcha" data-sitekey="'+html.escape(verifier.site_key,quote=True)+'" data-callback="catalogGuardVerified"></div>'
                          '</form><script>window.catalogGuardVerified=function(token){'
                          'if(!token||window.catalogGuardSubmitting)return;window.catalogGuardSubmitting=true;'
                          'document.getElementById("catalog-verification").submit();};</script>'
                          '<script src="https://www.google.com/recaptcha/api.js?hl=ru" async defer></script>')
                    if self.server.store.geo:body+='<p style="margin-top:32px;font-size:12px"><a href="https://db-ip.com" rel="nofollow" style="color:#777" aria-label="Источник данных DB-IP">DB-IP</a></p>'
                    return self.send(200,page(body),headers={'Set-Cookie':session_cookie} if session_cookie else None)
                return self.send(503,page('<h1>Проверка временно недоступна</h1><p>Попробуйте позже.</p>'),headers={'Retry-After':'60'})
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
            target=safe_return(values.get('return',['/catalog'])[0])
            session=self.server.store.session(self.headers.get('Cookie',''))
            verifier=getattr(self.server,'verification',None)
            if verifier:
                identity=values.get('id',[''])[0]
                token=None
                if self.server.store.consume_recaptcha_nonce(self.context(),session,identity):
                    try:
                        if verifier.verify(values.get('g-recaptcha-response',[''])[0],self.context(),host):
                            token=self.server.store.clearance(self.context(),session)
                    except captcha_module.Unavailable:
                        return self.send(503,page('<h1>Проверка временно недоступна</h1><p>Попробуйте ещё раз через минуту.</p><a href="/_catalog-check?return='+urllib.parse.quote(target,safe='')+'">Повторить проверку</a>'),headers={'Retry-After':'60'})
            else:
                return self.send(503,page('<h1>Проверка временно недоступна</h1><p>Попробуйте позже.</p>'),headers={'Retry-After':'60'})
            target=safe_return(values.get('return',['/catalog'])[0])
            if not token:
                return self.send(200,page('<h1>Попробуйте ещё раз</h1><p>Проверка не пройдена или срок её действия истёк.</p><a href="/_catalog-check?return='+urllib.parse.quote(target,safe='')+'">Новая проверка</a>'))
            headers={'Set-Cookie':COOKIE+'='+token+'; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax'}
            body='<h1>Можно продолжить просмотр</h1><a href="'+html.escape(target,quote=True)+'">Вернуться в каталог</a><script>location.replace('+json.dumps(target).replace('<','\\u003c')+');</script>'
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
    server=GuardServer(('127.0.0.1',int(os.environ.get('CATALOG_GUARD_PORT','8790'))),Handler)
    policy_path=os.environ.get('CATALOG_GUARD_POLICY', Path(__file__).with_name('catalog-guard-policy.json'))
    server.verification=captcha_module.configured(policy_path)
    mass_export=load_mass_export_policy(policy_path)
    geo_policy=geo_module.load_policy(policy_path)
    country_path=Path(os.environ.get('CATALOG_GUARD_COUNTRIES',Path(__file__).with_name('catalog-guard-countries.json')))
    server.store=Store(state/'budgets.sqlite3',keyfile.read_bytes(),mass_export=mass_export,geo_policy=geo_policy,country_path=country_path)
    server.mode=os.environ.get('CATALOG_GUARD_MODE','observe')
    if server.mode not in ('observe','enforce'): raise ValueError('invalid mode')
    server.client_script=Path(__file__).with_name('catalog-guard-client.js').read_bytes()
    print(json.dumps({'event':'catalog_guard_started','mode':server.mode,'verification':'recaptcha_v2','mass_export_enabled':mass_export is not None,'geography_enabled':server.store.geo is not None,'geo_countries_ready':bool(server.store.geo and server.store.geo.countries.valid)}),flush=True)
    server.serve_forever()


if __name__=='__main__':main()
