"""Actual nginx access phase, shared cache, recovery and fail-open fixture."""
import http.client
import http.server
import importlib.util
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
nginx=shutil.which('nginx')
assert nginx,'nginx required'

class Backend(http.server.BaseHTTPRequestHandler):
    calls=0
    def do_GET(self):
        Backend.calls+=1
        body=b'<html><head></head><body>catalog fixture</body></html>'
        self.send_response(200);self.send_header('Content-Type','text/html')
        self.send_header('Cache-Control','public, max-age=0, s-maxage=900')
        self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    do_POST=do_GET
    def log_message(self,*args):pass

def port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]

with tempfile.TemporaryDirectory(prefix='catalog-guard-fixture-') as directory:
    path=Path(directory)
    store=guard.Store(path/'state.sqlite3',b'fixture-secret',early_networks=['127.0.0.64/26','127.0.0.1/32'],early_until=time.time()+86400,behavior={})
    service=http.server.ThreadingHTTPServer(('127.0.0.1',0),guard.Handler)
    service.store=store;service.mode='enforce';service.client_script=(root/'deploy/catalog-guard-client.js').read_bytes()
    service_thread=threading.Thread(target=service.serve_forever,daemon=True);service_thread.start()
    backend=http.server.ThreadingHTTPServer(('127.0.0.1',0),Backend)
    threading.Thread(target=backend.serve_forever,daemon=True).start()
    listen=port()
    snippet=(root/'deploy/nginx-catalog-guard-server.conf').read_text().replace('127.0.0.1:8790','127.0.0.1:'+str(service.server_port)).replace('/usr/local/lib/car-catalog-guard/catalog-guard-client.js',str(root/'deploy/catalog-guard-client.js'))
    (path/'server.conf').write_text(snippet)
    (path/'location.conf').write_text((root/'deploy/nginx-catalog-guard-location.conf').read_text())
    (path/'headers.conf').write_text((root/'deploy/nginx-abcars-headers.conf').read_text())
    config=path/'nginx.conf'
    config.write_text(f'''user root;
pid {path}/nginx.pid;
worker_processes 2;
error_log {path}/error.log notice;
events {{ worker_connections 256; }}
http {{
 access_log off;
 proxy_cache_path {path}/cache levels=1:2 keys_zone=fixture:1m;
 geo $car_internal_address {{ default 0; 127.0.0.1 1; }}
 map "$remote_addr:$http_user_agent" $car_verified_search {{ default 0; "127.0.0.10:Googlebot/2.1" 1; "127.0.0.70:Googlebot/2.1" 1; "127.1.2.10:Googlebot/2.1" 1; }}
 server {{
  listen 127.0.0.1:{listen}; server_name a.test b.test;
  include {path}/headers.conf;
  include {path}/server.conf;
  location = /catalog {{
   include {path}/location.conf;
   include {path}/headers.conf;
   proxy_pass http://127.0.0.1:{backend.server_port}/api/pages/catalog;
  }}
  location ^~ /catalog/ {{
   rewrite ^/catalog/(.+)$ /api/pages/catalog?slug=$1 break;
   include {path}/location.conf;
   include {path}/headers.conf;
   proxy_pass http://127.0.0.1:{backend.server_port};
  }}
  location ^~ /cars/ {{
   rewrite ^/cars/(.+)$ /api/pages/car?id=$1 break;
   include {path}/location.conf;
   include {path}/headers.conf;
   proxy_pass http://127.0.0.1:{backend.server_port};
  }}
  location / {{
   include {path}/location.conf;
   include {path}/headers.conf;
   proxy_pass http://127.0.0.1:{backend.server_port};
   proxy_cache fixture;
   proxy_cache_key "$host$request_uri";
   add_header X-Cache $upstream_cache_status;
  }}
 }}
}}''')
    subprocess.run([nginx,'-t','-p',directory,'-c',str(config)],check=True,capture_output=True)
    process=subprocess.Popen([nginx,'-p',directory,'-c',str(config),'-g','daemon off;'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            try:
                with socket.create_connection(('127.0.0.1',listen),timeout=.1):break
            except OSError:time.sleep(.02)
        sessions={}
        def request(uri='/api/cars?limit=100&offset=10000',ip='127.0.0.2',host='a.test',method='GET',headers=None,body=None):
            connection=http.client.HTTPConnection('127.0.0.1',listen,source_address=(ip,0),timeout=3)
            request_headers={'Host':host,'User-Agent':'Mozilla/5.0',**(headers or {})}
            if sessions.get((ip,host)):request_headers['Cookie']=sessions[(ip,host)]+('; '+request_headers['Cookie'] if request_headers.get('Cookie') else '')
            connection.request(method,uri,body=body,headers=request_headers)
            response=connection.getresponse();response_headers=dict(response.headers)
            # nginx adds the visitor-only directive alongside the backend's
            # public-cache header. Cache-Control fields have combined semantics.
            response_headers['Cache-Control']=', '.join(response.headers.get_all('Cache-Control',[]))
            result=response.status,response_headers,response.read()
            token=result[1].get('Set-Cookie','')
            if token.startswith(guard.SESSION_COOKIE+'='):sessions[(ip,host)]=token.split(';')[0]
            connection.close();return result
        # Seed a public cache entry from another visitor. A denied exporter must
        # still be checked before that shared cached response can be served.
        first=request(ip='127.0.0.3');second=request(ip='127.0.0.3')
        assert first[0]==second[0]==200,(first,second,(path/'error.log').read_text())
        assert 'HIT'==second[1].get('X-Cache'),second
        assert b'/_catalog-check/client.js' in first[2]
        assert "frame-ancestors 'none'" in first[1]['Content-Security-Policy']
        assert first[1]['Set-Cookie'].startswith(guard.SESSION_COOKIE+'=')
        assert 'Set-Cookie' not in second[1]
        assert 'private' in first[1]['Cache-Control']
        another=request(ip='127.0.0.4')
        assert another[1]['X-Cache']=='HIT' and another[1]['Set-Cookie']!=first[1]['Set-Cookie']
        assert guard.COOKIE+'=' not in another[1]['Set-Cookie']
        for n in range(600):assert store.check('127.0.0.2','GET','/cars/'+str(n))[0]
        for host in ['a.test','b.test']:
            response=request(host=host,headers={'X-Guard-Exempt':'1','X-Guard-IP':'127.0.0.1','X-Forwarded-For':'127.0.0.1'})
            assert response[0]==429,response
            assert response[1].get('X-Catalog-Verification')=='/_catalog-check'
            assert response[1].get('Cache-Control')=='no-store'
        assert request('/catalog?page=100')[0]==303
        assert request('/cars/0')[0]==200
        assert request('/api/cars',method='POST')[0]==200
        assert request('/api/auth/me')[0]==200
        exempt=request('/api/auth/me',ip='127.2.0.1')
        assert exempt[0]==200 and 'Set-Cookie' not in exempt[1]
        assert request('/assets/a.js')[0]==200
        assert request('/api/%63ars?limit=100&offset=10000')[0]==429
        assert request(ip='127.0.0.10',headers={'User-Agent':'Googlebot/2.1'})[0]==200
        for n in range(600):store.check('127.0.0.10','GET','/cars/'+str(n))
        assert request(ip='127.0.0.10',headers={'User-Agent':'Googlebot/2.1'})[0]==200
        assert request(ip='127.0.0.10')[0]==429
        assert request(ip='127.0.0.1')[0]==200
        assert request('/_catalog_guard_auth')[0]==404
        # Solve a fixture puzzle, then verify normal response resumes, and its
        # clearance cookie is absent from all shared/public cache responses.
        with patch.object(guard.secrets,'choice',lambda seq:seq[0]):challenge=request('/_catalog-check')
        identity=challenge[2].decode().split('name="id" value="')[1].split('"')[0]
        assert '2222' not in challenge[2].decode()
        submitted=urllib.parse.urlencode({'id':identity,'answer':'2222','return':'/catalog'})
        assert request('/_catalog-check',method='POST',body=submitted,headers={'Origin':'https://evil.test','Content-Type':'application/x-www-form-urlencoded'})[0]==403
        solved=request('/_catalog-check',method='POST',body=submitted,headers={'Origin':'https://a.test','Content-Type':'application/x-www-form-urlencoded'})
        assert solved[0]==200 and 'catalog-verified' in solved[2].decode(),solved
        cookie=solved[1]['Set-Cookie'].split(';')[0]
        assert 'Secure' in solved[1]['Set-Cookie'] and 'HttpOnly' in solved[1]['Set-Cookie']
        resumed=request(headers={'Cookie':cookie})
        assert resumed[0]==200 and 'Set-Cookie' not in resumed[1]
        assert request('/api/cars?limit=100&offset=10100',host='b.test',headers={'Cookie':cookie})[0]==200
        assert request('/api/cars?limit=100&offset=10200',headers={'Cookie':cookie+'fake'})[0]==429
        # Targeted networks cannot evade first-read verification by rotating
        # addresses, browser UA, forwarded headers, domain or a cached URL.
        calls=Backend.calls
        for ip in ['127.0.0.66','127.0.0.67']:
            for host in ['a.test','b.test']:
                denied=request(ip=ip,host=host,headers={'User-Agent':'Googlebot/2.1','X-Guard-Exempt':'1','X-Guard-IP':'127.0.0.1','X-Forwarded-For':'127.0.0.1'})
                assert denied[0]==429,denied
                assert denied[1].get('X-Catalog-Verification')=='/_catalog-check'
        assert Backend.calls==calls
        assert request('/cars/new',ip='127.0.0.66')[0]==303
        assert request('/catalog/byd/han?page=2',ip='127.0.0.66')[0]==303
        assert request('/api/model-catalog?brand=byd&model=han&page=2',ip='127.0.0.66')[0]==429
        assert request('/api/model-catalog?brand=byd&model=han&page=2&light=1',ip='127.0.0.66')[0]==200
        for uri in ['/api/auth/me','/api/account/favorites','/api/analytics/events','/api/catalog/meta','/api/image','/assets/a.js']:
            assert request(uri,ip='127.0.0.66')[0]==200
        assert request('/api/cars',method='POST',ip='127.0.0.66')[0]==200
        assert request(ip='127.0.0.70',headers={'User-Agent':'Googlebot/2.1'})[0]==200
        assert request(ip='127.0.0.70')[0]==429
        assert request(ip='127.0.0.1')[0]==200
        with patch.object(guard.secrets,'choice',lambda seq:seq[0]):challenge=request('/_catalog-check',ip='127.0.0.66')
        assert challenge[1]['X-Frame-Options']=='SAMEORIGIN'
        assert 'Content-Security-Policy' not in challenge[1]
        identity=challenge[2].decode().split('name="id" value="')[1].split('"')[0]
        submitted=urllib.parse.urlencode({'id':identity,'answer':'2222','return':'/catalog'})
        solved=request('/_catalog-check',ip='127.0.0.66',method='POST',body=submitted,headers={'Origin':'https://a.test','Content-Type':'application/x-www-form-urlencoded'})
        early_cookie=solved[1]['Set-Cookie'].split(';')[0]
        resumed=request(ip='127.0.0.66',headers={'Cookie':early_cookie})
        assert resumed[0]==200 and 'Set-Cookie' not in resumed[1]
        for uri in ['/cars/42','/catalog','/catalog/byd/han?page=2']:
            assert request(uri,ip='127.0.0.66',headers={'Cookie':early_cookie})[0]==200
        assert request(ip='127.0.0.67',headers={'Cookie':early_cookie})[0]==429
        assert request(ip='127.0.0.66')[0]==429
        # Total allowance is independent of solving another puzzle or using
        # another address; exhausted daily quotas do not open a CAPTCHA loop.
        network=store.key('network:127.0.0.64/26')
        store.db.execute('INSERT OR REPLACE INTO clearance_totals VALUES (?,?,?,0)',('network:'+network,time.time(),10000));store.db.commit()
        exhausted=request('/api/cars/new',ip='127.0.0.68',headers={'X-Guard-Reason':'fake'})
        assert exhausted[0]==429 and 'X-Catalog-Verification' not in exhausted[1],exhausted
        assert json.loads(exhausted[2])['error']=='catalog_daily_budget'
        assert request('/cars/new',ip='127.0.0.68')[0]==429
        assert request(ip='127.0.0.66',headers={'Cookie':early_cookie})[0]==200
        assert request('/api/auth/me',ip='127.0.0.68')[0]==200
        # A previously unknown network is detected collectively, despite each
        # address reading fewer than ten cars with its own signed session.
        for i in range(31):
            for j in range(8):assert request('/api/cars/distributed-'+str(i*8+j),ip='127.1.1.'+str(i+1))[0]==200
        assert request('/api/cars/distributed-248',ip='127.1.1.32')[0]==200
        assert request('/api/cars/distributed-249',ip='127.1.1.32')[0]==429
        assert request('/api/cars/new',ip='127.1.2.1')[0]==429
        assert request('/api/cars/new',ip='127.1.2.10',headers={'User-Agent':'Googlebot/2.1'})[0]==200
        # Stop the guard, including its listener: catalog cache and new queries
        # must keep serving instead of becoming an HTTP 500 outage.
        service.shutdown();service.server_close()
        assert request('/api/cars?limit=100&offset=10300')[0]==200
        assert request('/_catalog-check/client.js')[0]==200
        print(json.dumps({'cached_bulk':'denied before shared cache','both_hosts_and_spoofed_headers':'passed','normal_post_auth_assets_and_repeats':'passed','verified_search_internal_and_encoded_paths':'passed','recovery_ip_bound_no_cookie_cache_leak':'passed','early_network_first_read_rotation_and_recovery':'passed','signed_session_private_first_response_no_cache_cookie_leak':'passed','daily_network_budget_no_recovery_loop':'passed','new_network_collective_detection':'passed','failed_guard':'fail-open'}))
    finally:
        process.terminate();process.wait(timeout=5);backend.shutdown();service.shutdown();service.server_close();store.db.close()
