"""Isolated nginx -> geographic guard -> backend and managed recovery checks."""
import datetime
import http.client
import http.server
import importlib.util
import io
import json
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.parse
from unittest.mock import patch

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('guard',root/'deploy/catalog-guard.py')
guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
nginx=shutil.which('nginx');assert nginx,'nginx required'
class Backend(http.server.BaseHTTPRequestHandler):
    calls=0
    def do_GET(self):
        Backend.calls+=1;body=b'<html><head></head><body>catalog fixture</body></html>'
        self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Cache-Control','public, max-age=0, s-maxage=900');self.send_header('Content-Length',str(len(body)));self.end_headers()
        if self.command!='HEAD':self.wfile.write(body)
    do_POST=do_GET
    do_HEAD=do_GET
    def log_message(self,*args):pass

def free_port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]

def number(ip):return int(__import__('ipaddress').ip_address(ip))
with tempfile.TemporaryDirectory(prefix='catalog-guard-fixture-') as directory:
    path=Path(directory);policy=guard.geo_module.load_policy(root/'deploy/catalog-guard-policy.json')
    countries=path/'countries.json'
    countries.write_text(json.dumps({'exempt_countries':policy['exempt_countries'],'expires_utc':'2090-01-01T00:00:00Z','ranges':{'4':[[0,number('127.5.0.0')-1,'outside'],[number('127.5.0.0'),number('127.5.255.255'),'exempt'],[number('127.6.0.0'),2**32-1,'outside']],'6':[[0,2**128-1,'outside']]},'ahrefs_networks':['127.6.0.0/24']}))
    store=guard.Store(path/'state.sqlite3',b'fixture-secret',mass_export={},geo_policy=policy,country_path=countries)
    service=guard.GuardServer(('127.0.0.1',0),guard.Handler);service.store=store;service.mode='enforce';service.client_script=(root/'deploy/catalog-guard-client.js').read_bytes()
    service.verification=guard.captcha_module.Recaptcha('fixture-public','fixture-secret',['a.test','b.test'])
    threading.Thread(target=service.serve_forever,daemon=True).start()
    backend=http.server.ThreadingHTTPServer(('127.0.0.1',0),Backend);threading.Thread(target=backend.serve_forever,daemon=True).start();listen=free_port()
    snippet=(root/'deploy/nginx-catalog-guard-server.conf').read_text().replace('127.0.0.1:8790','127.0.0.1:'+str(service.server_port)).replace('/usr/local/lib/car-catalog-guard/catalog-guard-client.js',str(root/'deploy/catalog-guard-client.js'))
    (path/'server.conf').write_text(snippet);(path/'location.conf').write_text((root/'deploy/nginx-catalog-guard-location.conf').read_text())
    config=path/'nginx.conf';config.write_text(f'''user root;
pid {path}/nginx.pid;
worker_processes 2;
error_log {path}/error.log notice;
events {{ worker_connections 256; }}
http {{
 access_log off;
 proxy_cache_path {path}/cache levels=1:2 keys_zone=fixture:1m;
 geo $car_internal_address {{ default 0;127.0.0.1 1; }}
 map "$remote_addr:$http_user_agent" $car_verified_search {{ default 0;"127.0.0.10:Googlebot/2.1" 1;"127.0.0.11:YandexBot/3.0" 1; }}
 server {{ listen 127.0.0.1:{listen};server_name a.test b.test;
 include {path}/server.conf;
 location / {{
 include {path}/location.conf;
 proxy_pass http://127.0.0.1:{backend.server_port};
 proxy_cache fixture;proxy_cache_key "$host$request_uri";
 add_header X-Cache $upstream_cache_status;
 }}
 }}
}}''')
    subprocess.run([nginx,'-t','-p',directory,'-c',str(config)],check=True,capture_output=True)
    process=subprocess.Popen([nginx,'-p',directory,'-c',str(config),'-g','daemon off;'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    sessions={}
    def request(uri='/catalog',ip='127.5.0.2',host='a.test',method='GET',headers=None,body=None):
        c=http.client.HTTPConnection('127.0.0.1',listen,source_address=(ip,0),timeout=3)
        h={'Host':host,'User-Agent':'Mozilla/5.0',**(headers or {})}
        if sessions.get((ip,host)):h['Cookie']=sessions[(ip,host)]+('; '+h['Cookie'] if h.get('Cookie') else '')
        c.request(method,uri,body=body,headers=h);r=c.getresponse();result=r.status,dict(r.headers),r.read();c.close()
        token=result[1].get('Set-Cookie','')
        if token.startswith(guard.SESSION_COOKIE+'='):sessions[(ip,host)]=token.split(';')[0]
        return result
    try:
        for _ in range(100):
            try:
                with socket.create_connection(('127.0.0.1',listen),timeout=.1):break
            except OSError:time.sleep(.02)
        first=request();second=request();assert first[0]==second[0]==200 and second[1].get('X-Cache')=='HIT',(first,second,(path/'error.log').read_text())
        assert first[1]['Set-Cookie'].startswith(guard.SESSION_COOKIE+'=') and 'Set-Cookie' not in second[1]
        assert b'/_catalog-check/client.js' in first[2]
        calls=Backend.calls
        for host in ['a.test','b.test']:
            assert request(ip='127.9.0.1',host=host)[0]==303
            for uri in ['/api/cars?limit=48','/api/%63ars?limit=48','/api/model-catalog?brand=byd&model=han','/api/pages/car?id=42']:
                denied=request(uri,ip='127.9.0.1',host=host,headers={'X-Guard-Exempt':'1','X-Forwarded-For':'127.5.0.2'})
                assert denied[0]==429 and denied[1].get('X-Catalog-Verification')=='/_catalog-check'
        assert Backend.calls==calls,'Denied requests bypassed cache protection'
        for ip,ua in [('127.0.0.10','Googlebot/2.1'),('127.0.0.11','YandexBot/3.0')]:assert request(ip=ip,headers={'User-Agent':ua})[0]==200
        assert request(ip='127.9.0.1',headers={'User-Agent':'Googlebot/2.1'})[0]==303
        assert request(ip='127.0.0.1')[0]==200
        assert request(ip='127.6.0.1',headers={'User-Agent':'AhrefsBot/7.0'})[0]==200
        for uri in ['/api/auth/me','/api/analytics/events','/api/image','/assets/a.js']:
            assert request(uri,ip='127.9.0.1')[0]==200
        assert request('/api/cars',ip='127.9.0.1',method='POST')[0]==200
        challenge=request('/_catalog-check?return=/catalog',ip='127.9.0.1')
        assert b'g-recaptcha' in challenge[2] and b'fixture-public' in challenge[2]
        assert b'fixture-secret' not in challenge[2] and b'data:image/png' not in challenge[2] and b'<audio' not in challenge[2]
        assert 'https://www.google.com/recaptcha/' in challenge[1]['Content-Security-Policy']
        nonce=challenge[2].decode().split('name="id" value="')[1].split('"')[0]
        args={'id':nonce,'answer':'2222','return':'/catalog'}
        refused=request('/_catalog-check',ip='127.9.0.1',method='POST',body=urllib.parse.urlencode(args),headers={'Origin':'https://a.test'})
        assert refused[0]==200 and 'Set-Cookie' not in refused[1]
        assert request(ip='127.9.0.1')[0]==303
        challenge=request('/_catalog-check?return=/catalog',ip='127.9.0.1');nonce=challenge[2].decode().split('name="id" value="')[1].split('"')[0]
        payload=urllib.parse.urlencode({'id':nonce,'g-recaptcha-response':'fixture-token','return':'/catalog'})
        assert request('/_catalog-check',ip='127.9.0.1',method='POST',body=payload,headers={'Origin':'https://evil.test'})[0]==403
        result={'success':True,'hostname':'a.test','challenge_ts':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        with patch.object(guard.captcha_module.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(result).encode())):
            solved=request('/_catalog-check',ip='127.9.0.1',method='POST',body=payload,headers={'Origin':'https://a.test'})
        assert solved[0]==200 and b'catalog-verified' in solved[2]
        cookie=solved[1]['Set-Cookie'].split(';')[0]
        assert request(ip='127.9.0.1',headers={'Cookie':cookie})[0]==200
        assert request(ip='127.9.0.2',headers={'Cookie':sessions[('127.9.0.1','a.test')]})[0]==200
        assert request(ip='127.9.0.3')[0]==303
        replay=request('/_catalog-check',ip='127.9.0.1',method='POST',body=payload,headers={'Origin':'https://a.test'})
        assert 'Set-Cookie' not in replay[1]
        # Removed collective tables can remain on disk without influencing a visitor.
        with store.lock,store.db:
            store.db.execute('CREATE TABLE network_risk (scope TEXT PRIMARY KEY,expires REAL)')
            store.db.execute('INSERT INTO network_risk VALUES (?,?)',('old-network',time.time()+99999))
        assert request('/cars/ordinary',ip='127.5.0.3')[0]==200
        # Personal export still challenges and daily recovery cannot be reset.
        with store.lock,store.db:
            store.budget(store.key('127.5.0.3'));store.db.execute('UPDATE budgets SET details=600 WHERE ip=?',(store.key('127.5.0.3'),))
        assert request('/api/cars/new',ip='127.5.0.3')[0]==429
        with store.lock,store.db:store.db.execute('INSERT INTO clearance_totals VALUES (?,?,8000,600)',('ip:'+store.key('127.5.0.3'),time.time()))
        denied=request('/api/cars/new',ip='127.5.0.3');assert denied[0]==429 and 'X-Catalog-Verification' not in denied[1]
        # Missing provider cannot activate a homemade fallback.
        service.verification=None
        unavailable=request('/_catalog-check',ip='127.9.0.3');assert unavailable[0]==503 and b'data:image/png' not in unavailable[2]
        service.shutdown();service.server_close()
        assert request('/api/cars/new',ip='127.9.0.3')[0]==200
        assert request('/_catalog-check/client.js')[0]==200
        print(json.dumps({'geographic_first_read_both_hosts_cache_and_encoded_paths':'passed','verified_search_and_service_exemptions':'passed','managed_only_recovery_and_nonce_replay':'passed','ordinary_browsing_and_personal_export_limits':'passed','old_network_state_ignored':'passed','missing_provider_no_local_fallback':'passed','guard_transport_fail_open':'passed'}))
    finally:
        process.terminate();process.wait(timeout=5);backend.shutdown();service.shutdown();service.server_close();store.db.close()
