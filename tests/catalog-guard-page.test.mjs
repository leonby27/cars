import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';

test('rendered Google callback submits once after success without extra controls', () => {
  const rendered = spawnSync('python3', ['-B', '-c', `
import importlib.util, types
from pathlib import Path
path=Path('deploy/catalog-guard.py')
spec=importlib.util.spec_from_file_location('guard',path)
guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
handler=object.__new__(guard.Handler)
handler.path='/_catalog-check?return=/catalog'
handler.headers={'X-Guard-Host':'fixture.test'}
handler.context=lambda:'198.51.100.1'
handler.server=types.SimpleNamespace(
 verification=types.SimpleNamespace(hosts=['fixture.test'],site_key='fixture-public'),
 store=types.SimpleNamespace(geo=True,ensure_session=lambda cookie:('session',''),recaptcha_nonce=lambda *args:'nonce'))
handler.send=lambda status,body=b'',**kwargs:print(body.decode())
handler.do_GET()
`], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(rendered.status, 0, rendered.stderr);
  const html = rendered.stdout;
  assert.match(html, /data-callback="catalogGuardVerified"/);
  assert.match(html, /href="https:\/\/db-ip\.com" rel="nofollow"/);
  assert.doesNotMatch(html, /<button|Обновить проверку|Доступ сохраняется|Геоданные/);
  const script = html.match(/<script>(window\.catalogGuardVerified=[\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  let submissions = 0;
  const window = {};
  vm.runInNewContext(script, {
    window,
    document: { getElementById(id) {
      assert.equal(id, 'catalog-verification');
      return { submit() { submissions++; } };
    } },
  });
  window.catalogGuardVerified('');
  assert.equal(submissions, 0);
  window.catalogGuardVerified('valid-provider-token');
  window.catalogGuardVerified('duplicate-provider-callback');
  assert.equal(submissions, 1);
});
