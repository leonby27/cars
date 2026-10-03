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
    store=guard.Store(path/'state.sqlite3',b'fixture-secret')
    service=http.server.ThreadingHTTPServer(('127.0.0.1',0),guard.Handler)
    service.store=store;service.mode='enforce';service.client_script=(root/'deploy/catalog-guard-client.js').read_bytes()
    service_thread=threading.Thread(target=service.serve_forever,daemon=True);service_thread.start()
    backend=http.server.ThreadingHTTPServer(('127.0.0.1',0),Backend)
    threading.Thread(target=backend.serve_forever,daemon=True).start()
    listen=port()
    snippet=(root/'deploy/nginx-catalog-guard-server.conf').read_text().replace('127.0.0.1:8790','127.0.0.1:'+str(service.server_port)).replace('/usr/local/lib/car-catalog-guard/catalog-guard-client.js',str(root/'deploy/catalog-guard-client.js'))
    (path/'server.conf').write_text(snippet)
    (path/'location.conf').write_text((root/'deploy/nginx-catalog-guard-location.conf').read_text())
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
 map "$remote_addr:$http_user_agent" $car_verified_search {{ default 0; "127.0.0.10:Googlebot/2.1" 1; }}
 server {{
  listen 127.0.0.1:{listen}; server_name a.test b.test;
  include {path}/server.conf;
  location / {{
   include {path}/location.conf;
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
        def request(uri='/api/cars?limit=100&offset=10000',ip='127.0.0.2',host='a.test',method='GET',headers=None,body=None):
            connection=http.client.HTTPConnection('127.0.0.1',listen,source_address=(ip,0),timeout=3)
            connection.request(method,uri,body=body,headers={'Host':host,'User-Agent':'Mozilla/5.0',**(headers or {})})
            response=connection.getresponse();result=response.status,dict(response.headers),response.read();connection.close();return result
        # Seed a public cache entry from another visitor. A denied exporter must
        # still be checked before that shared cached response can be served.
        first=request(ip='127.0.0.3');second=request(ip='127.0.0.3')
        assert first[0]==second[0]==200,(first,second,(path/'error.log').read_text())
        assert 'HIT'==second[1].get('X-Cache'),second
        assert b'/_catalog-check/client.js' in first[2]
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
        # Stop the guard, including its listener: catalog cache and new queries
        # must keep serving instead of becoming an HTTP 500 outage.
        service.shutdown();service.server_close()
        assert request('/api/cars?limit=100&offset=10300')[0]==200
        assert request('/_catalog-check/client.js')[0]==200
        print(json.dumps({'cached_bulk':'denied before shared cache','both_hosts_and_spoofed_headers':'passed','normal_post_auth_assets_and_repeats':'passed','verified_search_internal_and_encoded_paths':'passed','recovery_ip_bound_no_cookie_cache_leak':'passed','failed_guard':'fail-open'}))
    finally:
        process.terminate();process.wait(timeout=5);backend.shutdown();service.shutdown();service.server_close();store.db.close()
