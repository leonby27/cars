"""Run against an isolated loopback nginx, never the production listeners.
Usage: python3 tests/nginx-ai-limits.integration.py (requires nginx on PATH).
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
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'public fixture')

    def log_message(self, *args):
        pass

backend = http.server.HTTPServer(('127.0.0.1', 0), Backend)
threading.Thread(target=backend.serve_forever, daemon=True).start()
with socket.socket() as free:
    free.bind(('127.0.0.1', 0))
    port = free.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='car-ai-nginx-') as directory:
    path = pathlib.Path(directory)
    config = path / 'nginx.conf'
    config.write_text(f'''
pid {path}/nginx.pid;
error_log {path}/error.log notice;
events {{ worker_connections 64; }}
http {{
    access_log off;
    include {root}/deploy/nginx-car-ai-limits.conf;
    server {{
        listen 127.0.0.1:{port};
        server_name a.test b.test;
        location /assets/ {{ return 200 "asset"; }}
        location / {{
            include {root}/deploy/nginx-car-ai-limit-location.conf;
            proxy_pass http://127.0.0.1:{backend.server_port};
        }}
    }}
}}
''')
    subprocess.run([nginx, '-t', '-p', directory, '-c', str(config)], check=True, capture_output=True)
    process = subprocess.Popen([nginx, '-p', directory, '-c', str(config), '-g', 'daemon off; master_process off;'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for attempt in range(100):
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.1):
                    break
            except OSError:
                if process.poll() is not None:
                    raise RuntimeError(process.stderr.read().decode())
                time.sleep(.02)

        def request(agent, address='127.0.0.1', host='a.test', url='/cars/fixture'):
            client = http.client.HTTPConnection('127.0.0.1', port, timeout=3, source_address=(address, 0))
            try:
                client.request('GET', url, headers={'Host': host, 'User-Agent': agent})
                reply = client.getresponse()
                result = reply.status, reply.getheader('Retry-After')
                reply.read()
                return result
            finally:
                client.close()

        counts = {}
        for agent in ['GPTBot/1.4', 'meta-externalagent/1.1']:
            # All IPs/hosts consume the same budget; the two bots are separate.
            replies = [request(agent, '127.0.0.1' if n % 2 else '127.0.0.2', 'a.test' if n % 3 else 'b.test') for n in range(10)]
            counts[agent] = dict(collections.Counter(status for status, _ in replies))
            assert counts[agent].get(200) == 3, counts
            assert counts[agent].get(429) == 7, counts
            assert all(retry == '2' for status, retry in replies if status == 429)
            assert all(request(agent, url='/assets/fixture.js')[0] == 200 for _ in range(10))
        for agent in ['Mozilla/5.0', 'Googlebot/2.1', 'YandexBot/3.0', 'OAI-SearchBot/1.0', 'ChatGPT-User/1.0', 'facebookexternalhit/1.1']:
            assert all(request(agent) == (200, None) for _ in range(10)), agent
        print(json.dumps({'grouped_bot_limits': counts, 'ordinary_and_search_requests': 'unrestricted', 'assets': 'unrestricted'}))
    finally:
        process.terminate()
        process.wait(timeout=5)
        backend.shutdown()
