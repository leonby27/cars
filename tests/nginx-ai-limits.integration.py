"""Isolated nginx + fixture backend; no production listeners or database.
Usage: python3 tests/nginx-ai-limits.integration.py (nginx must be on PATH).
"""
import collections
import http.client
import http.server
import json
import pathlib
import re
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
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        body = b'User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /partner\nDisallow: /api\n\nUser-agent: Bytespider\nUser-agent: AhrefsBot\nUser-agent: SemrushBot\nDisallow: /\n' if self.path == '/robots.txt' else b'public fixture'
        self.wfile.write(body)
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
    networks.write_text('\n'.join(f'geo $car_net_{family} {{ default 0; 127.0.0.{10+index}/{30 if family == "perplexity" else 32} 1; }}' for index, family in enumerate(families)))
    limits = path / 'limits.conf'
    limits.write_text((root/'deploy/nginx-car-ai-limits.conf').read_text().replace('/etc/nginx/snippets/car-search-networks.conf', str(networks)).replace('127.0.0.0/8 1;', '127.0.0.1/32 1;').replace('$time_iso8601:$remote_addr', '$http_x_fixture_clock:$remote_addr').replace(r'37\.214\.32\.151', r'127\.0\.0\.30'))
    config = path / 'nginx.conf'
    robots_location = re.search(r'location = /robots\.txt \{.*?\n\}', (root/'deploy/nginx-abcars-site.conf').read_text(), re.S).group(0)
    robots_location = re.sub(r'^\s*brotli[^;]*;\n', '\n', robots_location, flags=re.M)
    robots_location = robots_location.replace('  include /etc/nginx/snippets/abcars-headers.conf;', '')
    robots_location = robots_location.replace('try_files $uri =404;', f'proxy_pass http://127.0.0.1:{backend.server_port};')
    config.write_text(f'''
pid {path}/nginx.pid;
worker_processes 2;
error_log {path}/error.log error;
events {{ worker_connections 128; }}
http {{
    access_log off;
    include {limits};
    include {root}/deploy/nginx-abcars-bots.conf;
    server {{
        listen 127.0.0.1:{port};
        server_name a.test b.test;
        if ($car_blocked_bot) {{ return 403; }}
        if ($abcars_blocked_bot) {{ return 403; }}
        if ($car_export_denied) {{ return 403; }}
        limit_req zone=car_training_v2 burst=1 nodelay;
        limit_req zone=car_audit_v1 burst=30 nodelay;
        limit_req zone=car_ahrefs_v1 burst=30 nodelay;
        limit_req_status 429;
        add_header Retry-After $car_ai_retry_after always;
        location /photo/ {{ proxy_pass http://127.0.0.1:{backend.server_port}; }}
        location /assets/ {{ return 200 "asset"; }}
        {robots_location}
        # BY sends car HTML through a named location with a rewrite.
        location /cars/ {{ try_files /nonexistent-car-fixture @car; }}
        location @car {{
            rewrite ^/cars/(.+)$ /api/pages/car?id=$1 break;
            include {root}/deploy/nginx-car-ai-limit-location.conf;
            proxy_pass http://127.0.0.1:{backend.server_port};
        }}
        # Exercise the sustained budget independently of the short burst gate.
        location = /api/cars/summary {{
            limit_req zone=car_catalog_sustained_v2 burst=30 nodelay;
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
        def request(agent='Mozilla/5.0', address='127.0.0.2', host='a.test', url='/cars/fixture', method='GET', headers=None, include_body=False):
            client = http.client.HTTPConnection('127.0.0.1', port, timeout=3, source_address=(address, 0))
            try:
                client.request(method, url, headers={'Host': host, 'User-Agent': agent, **(headers or {})})
                reply = client.getresponse(); result = reply.status, reply.getheader('Retry-After'); body = reply.read()
                if include_body: return result + (body.decode(), reply.getheader('Vary'))
                return result
            finally: client.close()

        counts = {}
        for agent in ['GPTBot/1.4', 'meta-externalagent/1.1', 'ClaudeBot/1.0', 'CCBot/2.0', 'Amazonbot/1.0']:
            before = Backend.calls
            replies = [request(agent, '127.0.0.2' if n%2 else '127.0.0.3', 'a.test' if n%3 else 'b.test') for n in range(10)]
            counts[agent] = dict(collections.Counter(status for status, _ in replies))
            assert counts[agent] == {200: 2, 429: 8}, counts
            assert Backend.calls-before == 2, 'Rejected training requests reached the backend'
            assert all(retry == '10' for status, retry in replies if status == 429)
            assert all(request(agent, url='/assets/fixture.js')[0] == 200 for _ in range(3))
            assert request(agent, url='/photo/fixture.jpg') == (429, '10'), 'Photo location bypassed the shared crawl budget'
            assert request(agent, url='/robots.txt')[0] == 200
        # At 20/minute a training family recovers one request in three seconds.
        # Exercise another IP and host to retain the shared-family guarantee.
        time.sleep(3.15)
        assert request('Amazonbot/1.0', address='127.0.0.4', host='b.test')[0] == 200
        assert request('Amazonbot/1.0', address='127.0.0.5', host='a.test') == (429, '10')
        # Each Ahrefs family has its own burst, shared across UAs, IPs, hosts
        # and workers. Exhausting one family must not consume the other's quota.
        for family in ['AhrefsBot/7.0', 'AhrefsSiteAudit/6.1']:
            before = Backend.calls
            replies = [request(
                family if n % 2 else 'Mozilla/5.0 ' + family,
                address=f'127.0.0.{40+n%8}', host='a.test' if n%3 else 'b.test',
                url='/photo/fixture.jpg' if n%4 == 0 else f'/cars/crawl-{n}',
            ) for n in range(40)]
            counts[family] = dict(collections.Counter(status for status, _ in replies))
            assert counts[family] == {200:31, 429:9}, counts
            assert Backend.calls-before == 31, 'Rejected Ahrefs requests reached the backend'
            assert all(retry == '10' for status, retry in replies if status == 429)
            assert request('Mozilla/5.0 ' + family, address='127.0.0.4', host='b.test') == (429, '10')
        # One token recovers after a second, not the old ten-second interval.
        time.sleep(1.1)
        for family in ['AhrefsBot/7.0', 'AhrefsSiteAudit/6.1']:
            assert request(family, address='127.0.0.49', host='b.test')[0] == 200
            assert request(family, url='/assets/fixture.js')[0] == 200
        for agent in ['AhrefsBot/7.0', 'AhrefsSiteAudit/6.1', 'Googlebot/2.1', 'Mozilla/5.0']:
            status, _, body, vary = request(agent, url='/robots.txt', include_body=True)
            assert status == 200 and vary == 'User-Agent'
            assert ('Crawl-delay: 1\n' in body) == agent.startswith('Ahrefs')
            assert 'User-agent: AhrefsBot' not in body, 'Legacy robots denial survived'
            assert all(rule in body for rule in ['Disallow: /account', 'Disallow: /partner', 'Disallow: /api'])
            assert 'User-agent: SemrushBot\nDisallow: /' in body
        for agent in ['SERankingBacklinksBot/1.0', 'SemrushBot/1.0', 'Bytespider/1.0', 'python-requests/2.0']:
            before = Backend.calls
            assert all(request(agent, host=host, url=url)[0] == 403 for host in ['a.test','b.test'] for url in ['/cars/fixture','/api/cars?limit=100','/assets/fixture.js'])
            assert Backend.calls == before

        # Temporary confirmed-exporter denial is shared and closes encoded URLs;
        # auth, submissions/assets and expiration remain outside that denial.
        before = Backend.calls
        for host in ['a.test','b.test']:
            for url in ['/api/cars?limit=1','/api/%63ars?limit=100','/cars/fixture','/feeds/yandex-cars.xml']:
                assert request('Googlebot/2.1', address='127.0.0.30', host=host, url=url, headers={'X-Fixture-Clock':'2026-10-02T12:00:00Z','X-Forwarded-For':'66.249.64.1'})[0] == 403
        assert Backend.calls == before
        assert request(address='127.0.0.30',url='/api/auth/me',headers={'X-Fixture-Clock':'2026-10-03T12:00:00Z'})[0] == 200
        assert request(address='127.0.0.30',url='/api/cars',method='POST',headers={'X-Fixture-Clock':'2026-10-03T12:00:00Z'})[0] == 200
        assert request(address='127.0.0.30',url='/api/cars?limit=1',headers={'X-Fixture-Clock':'2026-10-04T00:00:00Z'})[0] == 200

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
        assert sum(code==200 for code in sustained) == 31, collections.Counter(sustained)
        assert all(code==429 for code in sustained[-20:])
        # The relaxed visitor allowance recovers one request in five seconds,
        # shared between domains; the old 6/minute policy would still refuse it.
        time.sleep(5.15)
        assert request(address='127.0.0.9', host='b.test', url='/api/cars/summary?offset=recovered')[0] == 200
        assert request(address='127.0.0.9', host='a.test', url='/api/cars/summary?offset=still-bounded')[0] == 429

        # A forged Perplexity name keeps ordinary visitor limits and cannot
        # spend the real crawler's shared origin allowance.
        assert all(request('PerplexityBot/1.0', address='127.0.0.61', url='/api/cars?fake='+str(n))[0] == 200 for n in range(5))
        before = Backend.calls
        crawl_paths = ['/cars/perplexity', '/catalog/petrol', '/models/audi', '/api/%63ars?offset=1', '/api/pages/catalog?slug=petrol', '/api/model-catalog?brand=Audi']
        perplexity_replies = [request(
            'Mozilla/5.0 PerplexityBot/1.0', address=f'127.0.0.{16+n%4}',
            host='a.test' if n%2 else 'b.test', url=crawl_paths[n%len(crawl_paths)],
        ) for n in range(12)]
        assert collections.Counter(status for status, _ in perplexity_replies) == {200:3, 429:9}, perplexity_replies
        assert Backend.calls-before == 3, 'Rejected Perplexity reads reached the backend'
        assert all(retry == '10' for status, retry in perplexity_replies if status == 429)
        assert 'by zone "car_perplexity_v1"' in (path/'error.log').read_text(), 'Rejecting zone missing at production log threshold'
        for url in ['/photo/perplexity.jpg', '/assets/fixture.js', '/robots.txt', '/api/auth/me']:
            assert request('PerplexityBot/1.0', address='127.0.0.16', url=url)[0] == 200, url
        assert request('PerplexityBot/1.0', address='127.0.0.16', url='/api/cars', method='POST')[0] == 200
        # 20/minute recovers one admission every three seconds, still shared
        # when both the source address and destination domain change.
        time.sleep(3.15)
        assert request('PerplexityBot/1.0', address='127.0.0.19', host='b.test', url='/catalog/petrol')[0] == 200
        assert request('PerplexityBot/1.0', address='127.0.0.18', host='a.test', url='/api/cars') == (429, '10')

        # Other verified search providers and user-directed Perplexity fetches
        # remain outside the crawler budget; forged names do not gain bypass.
        search_agents = ['Googlebot/2.1','bingbot/2.0','YandexRenderResourcesBot/1.0','Applebot/0.1','DuckDuckBot/1.0','OAI-SearchBot/1.0','Perplexity-User/1.0','Claude-SearchBot/1.0']
        for index,agent in enumerate(search_agents):
            assert all(request(agent, address=f'127.0.0.{10+index}', url='/api/cars?limit=100')[0] == 200 for n in range(70)), agent
        # Google research and user-directed fetchers share Google's verified
        # exemption, including photos, without granting forged names a bypass.
        for agent in ['GoogleOther/1.0', 'GoogleOther-Image/1.0', 'GoogleOther-Video/1.0', 'Google-CloudVertexBot/1.0', 'Gemini-Deep-Research/1.0']:
            assert all(request(agent, address='127.0.0.10', host='a.test' if n%2 else 'b.test', url='/api/cars?limit=100&offset='+str(n))[0] == 200 for n in range(80)), agent
            assert all(request(agent, address='127.0.0.10', url='/photo/google.jpg')[0] == 200 for n in range(5)), agent
        forged_other = [request('GoogleOther/1.0', address='127.0.0.60', url='/api/cars?offset='+str(n))[0] for n in range(50)]
        assert forged_other[-1] == 429, forged_other
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
        assert 'by zone "car_catalog_' in (path/'error.log').read_text(), 'Visitor rejection zone missing from error log'
        print(json.dumps({'training_and_audit_global_budgets':counts, 'perplexity_expensive_reads':dict(collections.Counter(status for status, _ in perplexity_replies)), 'perplexity_users_photos_assets_and_forgery':'passed', 'audit_robots_delay_and_private_rules':'passed with legacy robots fixture', 'commercial_bots':'blocked on both hosts before backend', 'browser_export_and_forged_search':'throttled before backend', 'other_verified_search_and_warmers':'unrestricted', 'normal_burst_and_post_auth_assets':'passed', 'named_rewrites_and_encoded_api':'protected'}))
    finally:
        process.terminate(); process.wait(timeout=5); backend.shutdown()
