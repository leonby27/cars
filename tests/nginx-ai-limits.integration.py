"""Isolated nginx + fixture backend; no production listeners or database.
Usage: python3 tests/nginx-ai-limits.integration.py (nginx must be on PATH).
"""
import collections
import http.client
import http.server
import json
import pathlib
import shutil
import socket
import subprocess
import tempfile
import threading
import time

root = pathlib.Path(__file__).resolve().parents[1]
nginx = shutil.which('nginx')
if not nginx:
    raise SystemExit('nginx is required for this integration check')

class Backend(http.server.BaseHTTPRequestHandler):
    calls = 0
    def do_GET(self):
        type(self).calls += 1
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'public fixture')
    do_HEAD = do_GET
    do_POST = do_GET
    def log_message(self, *args): pass

backend = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Backend)
threading.Thread(target=backend.serve_forever, daemon=True).start()
with socket.socket() as free:
    free.bind(('127.0.0.1', 0)); port = free.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='car-bot-nginx-') as directory:
    path = pathlib.Path(directory)
    networks = path / 'networks.conf'
    families = ['google', 'bing', 'yandex', 'apple', 'duck', 'openai', 'perplexity', 'claude']
    networks.write_text('\n'.join(f'geo $car_net_{family} {{ default 0; 127.0.0.{10+index}/32 1; }}' for index, family in enumerate(families)))
    limits = path / 'limits.conf'
    limits.write_text((root/'deploy/nginx-car-ai-limits.conf').read_text().replace('/etc/nginx/snippets/car-search-networks.conf', str(networks)).replace('127.0.0.0/8 1;', '127.0.0.1/32 1;'))
    config = path / 'nginx.conf'
    config.write_text(f'''
pid {path}/nginx.pid;
worker_processes 2;
error_log {path}/error.log notice;
events {{ worker_connections 128; }}
http {{
    access_log off;
    include {limits};
    server {{
        listen 127.0.0.1:{port};
        server_name a.test b.test;
        if ($car_blocked_bot) {{ return 403; }}
        limit_req zone=car_training_v2 burst=1 nodelay;
        limit_req_status 429;
        add_header Retry-After $car_ai_retry_after always;
        location /photo/ {{ proxy_pass http://127.0.0.1:{backend.server_port}; }}
        location /assets/ {{ return 200 "asset"; }}
        # BY sends car HTML through a named location with a rewrite.
        location /cars/ {{ try_files /nonexistent-car-fixture @car; }}
        location @car {{
            rewrite ^/cars/(.+)$ /api/pages/car?id=$1 break;
            include {root}/deploy/nginx-car-ai-limit-location.conf;
            proxy_pass http://127.0.0.1:{backend.server_port};
        }}
        # Exercise the sustained budget independently of the short burst gate.
        location = /api/cars/summary {{
            limit_req zone=car_catalog_sustained burst=60 nodelay;
            limit_req_status 429;
            add_header Retry-After $car_ai_retry_after always;
            proxy_pass http://127.0.0.1:{backend.server_port};
        }}
        location / {{
            include {root}/deploy/nginx-car-ai-limit-location.conf;
            proxy_pass http://127.0.0.1:{backend.server_port};
        }}
    }}
}}
''')
    subprocess.run([nginx, '-t', '-p', directory, '-c', str(config)], check=True, capture_output=True)
    process = subprocess.Popen([nginx, '-p', directory, '-c', str(config), '-g', 'daemon off;'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for attempt in range(100):
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.1): break
            except OSError:
                if process.poll() is not None: raise RuntimeError(process.stderr.read().decode())
                time.sleep(.02)
        def request(agent='Mozilla/5.0', address='127.0.0.2', host='a.test', url='/cars/fixture', method='GET', headers=None):
            client = http.client.HTTPConnection('127.0.0.1', port, timeout=3, source_address=(address, 0))
            try:
                client.request(method, url, headers={'Host': host, 'User-Agent': agent, **(headers or {})})
                reply = client.getresponse(); result = reply.status, reply.getheader('Retry-After'); reply.read()
                return result
            finally: client.close()

        counts = {}
        for agent in ['AhrefsBot/7.0', 'GPTBot/1.4', 'meta-externalagent/1.1', 'ClaudeBot/1.0', 'CCBot/2.0', 'GoogleOther/1.0', 'Amazonbot/1.0']:
            before = Backend.calls
            replies = [request(agent, '127.0.0.2' if n%2 else '127.0.0.3', 'a.test' if n%3 else 'b.test') for n in range(10)]
            counts[agent] = dict(collections.Counter(status for status, _ in replies))
            assert counts[agent] == {200: 2, 429: 8}, counts
            assert Backend.calls-before == 2, 'Rejected training requests reached the backend'
            assert all(retry == '10' for status, retry in replies if status == 429)
            assert all(request(agent, url='/assets/fixture.js')[0] == 200 for _ in range(3))
            assert request(agent, url='/photo/fixture.jpg') == (429, '10'), 'Photo location bypassed the shared crawl budget'
            assert request(agent, url='/robots.txt')[0] == 200
        for agent in ['AhrefsSiteAudit/6.1', 'SemrushBot/1.0', 'Bytespider/1.0', 'python-requests/2.0']:
            before = Backend.calls
            assert all(request(agent, host=host, url=url)[0] == 403 for host in ['a.test','b.test'] for url in ['/cars/fixture','/api/cars?limit=100','/assets/fixture.js'])
            assert Backend.calls == before

        # Browser-looking exporter changes URL, domain, UA and spoofed headers.
        before = Backend.calls
        replies = [request('Mozilla/' + str(n), address='127.0.0.4', host='a.test' if n%2 else 'b.test', url='/api/cars?limit=100&offset='+str(n), headers={'X-Forwarded-For': '66.249.64.1','X-Real-IP':'66.249.64.1'}) for n in range(70)]
        assert sum(status == 200 for status,_ in replies) in (31,32), collections.Counter(replies)
        assert all(status == 429 for status,_ in replies[-20:])
        assert Backend.calls-before == sum(status==200 for status,_ in replies)
        assert request(address='127.0.0.4', url='/api/%63ars?limit=1')[0] == 429
        assert request(address='127.0.0.5', url='/api/cars?limit=1')[0] == 200
        assert request(address='127.0.0.4', url='/api/cars', method='POST')[0] == 200
        assert request(address='127.0.0.4', url='/api/auth/me')[0] == 200
        assert request(address='127.0.0.4', url='/assets/fixture.js')[0] == 200

        sustained = [request(address='127.0.0.9',url='/api/cars/summary?offset='+str(n))[0] for n in range(90)]
        assert sum(code==200 for code in sustained) == 61, collections.Counter(sustained)
        assert all(code==429 for code in sustained[-20:])

        # Genuine provider IP + matching UA bypass; forged name does not.
        search_agents = ['Googlebot/2.1','bingbot/2.0','YandexRenderResourcesBot/1.0','Applebot/0.1','DuckDuckBot/1.0','OAI-SearchBot/1.0','PerplexityBot/1.0','Claude-SearchBot/1.0']
        for index,agent in enumerate(search_agents):
            assert all(request(agent, address=f'127.0.0.{10+index}', url='/api/cars?limit=100')[0] == 200 for n in range(70)), agent
        fake = [request('Googlebot/2.1', address='127.0.0.6', url='/api/cars?offset='+str(n))[0] for n in range(50)]
        assert fake[-1] == 429, fake
        mismatch = [request('YandexBot/3.0', address='127.0.0.10', url='/api/cars?offset='+str(n))[0] for n in range(50)]
        assert mismatch[-1] == 429, mismatch
        # A real search network is not a blanket exemption for normal exporters.
        assert request('Mozilla/5.0',address='127.0.0.10',url='/api/cars?limit=100')[0] == 429

        # Normal first visit + filters, local warmers and named car rewrite.
        assert all(request(address='127.0.0.7',url='/api/cars?filter='+str(n))[0] == 200 for n in range(20))
        assert all(request('abcars-warm-api/1.0',address='127.0.0.1',url='/api/cars?offset='+str(n))[0] == 200 for n in range(100))
        car_pages = [request(address='127.0.0.8',url='/cars/'+str(n))[0] for n in range(70)]
        assert all(code == 429 for code in car_pages[-20:]), car_pages
        assert all(request('ChatGPT-User/1.0',address='127.0.0.15',url='/cars/'+str(n))[0] == 200 for n in range(70))
        print(json.dumps({'training_global_budgets':counts, 'commercial_bots':'blocked on both hosts before backend', 'browser_export_and_forged_search':'throttled before backend', 'verified_search_and_warmers':'unrestricted', 'normal_burst_and_post_auth_assets':'passed', 'named_rewrites_and_encoded_api':'protected'}))
    finally:
        process.terminate(); process.wait(timeout=5); backend.shutdown()
