"""Sandbox the complete installer, including secret-safe receipt and rollback."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('installer',root/'deploy/install-catalog-guard.py')
installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
real_open=open
real_mkdtemp=tempfile.mkdtemp

class Checks(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.home=Path(self.directory.name);self.stage=self.home/'stage';self.stage.mkdir();self.system=self.home/'system'
        for p in (root/'deploy').iterdir():
            if p.is_file():shutil.copy2(p,self.stage/p.name)
        policy=json.loads((self.stage/'catalog-guard-policy.json').read_text())['geography']
        (self.stage/'catalog-guard-countries.json').write_text(json.dumps({'exempt_countries':sorted(policy['exempt_countries']),'expires_utc':'2090-01-01T00:00:00Z','ranges':{'4':[[0,2**32-1,'outside']],'6':[[0,2**128-1,'outside']]},'ahrefs_networks':['202.8.40.0/24']}))
        self.settings=self.mapped('/etc/default/car-catalog-guard');self.settings.parent.mkdir(parents=True)
        self.settings.write_text('CATALOG_GUARD_MODE=enforce\nCATALOG_RECAPTCHA_SITE_KEY=public-fixture\nCATALOG_RECAPTCHA_SECRET_KEY=never-print-this-fixture-secret\n')
        for name in ['/etc/nginx/snippets/abcars-site.conf','/etc/nginx/sites-available/abdrive']:
            p=self.mapped(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text('if ($car_blocked_bot) { return 403; }\ninclude /etc/nginx/snippets/car-ai-limit.conf;\n')
        self.proxy=self.mapped('/etc/nginx/snippets/abcars-proxy.conf');self.proxy.write_text('proxy_cache_key "$scheme$host$request_method$request_uri";\n')
        self.audio=self.mapped('/usr/local/lib/car-catalog-guard/catalog-guard-audio');self.audio.mkdir(parents=True);(self.audio/'old.wav').write_bytes(b'old-audio-fixture')
        self.calls=[];self.fail_validation=False
    def tearDown(self):self.directory.cleanup()
    def mapped(self,name):
        p=Path(name)
        if any(str(p).startswith(prefix) for prefix in ['/etc/','/usr/local/lib/','/run/lock/','/var/backups']):return self.system/str(p).lstrip('/')
        return p
    def opening(self,name,*args,**kwargs):
        mapped=self.mapped(name)
        if str(name).startswith('/run/lock/'):mapped.parent.mkdir(parents=True,exist_ok=True)
        return real_open(mapped,*args,**kwargs)
    def running(self,args,**kwargs):
        self.calls.append(args)
        if args==['nginx','-t'] and self.fail_validation and kwargs.get('check'):
            self.fail_validation=False;raise subprocess.CalledProcessError(1,args)
        return types.SimpleNamespace(returncode=0)
    def execute(self):
        output=io.StringIO()
        def mkdtemp(*args,**kwargs):
            if 'dir' in kwargs:kwargs['dir']=self.mapped(kwargs['dir']);kwargs['dir'].mkdir(parents=True,exist_ok=True)
            return real_mkdtemp(*args,**kwargs)
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(installer,'__file__',str(self.stage/'install-catalog-guard.py')))
            stack.enter_context(patch.object(installer,'Path',side_effect=self.mapped))
            stack.enter_context(patch.object(installer.os,'geteuid',return_value=0))
            stack.enter_context(patch.object(installer.subprocess,'run',side_effect=self.running))
            stack.enter_context(patch.object(installer.tempfile,'mkdtemp',side_effect=mkdtemp))
            stack.enter_context(patch.object(installer.fcntl,'flock'))
            stack.enter_context(patch('builtins.open',side_effect=self.opening))
            stack.enter_context(contextlib.redirect_stdout(output))
            installer.main()
        return output.getvalue()
    def test_missing_keys_refuse_before_mutating_live_files(self):
        self.settings.write_text('CATALOG_GUARD_MODE=enforce\n')
        before=self.proxy.read_bytes()
        with patch.dict(os.environ,{},clear=True):
            with self.assertRaises(ValueError):self.execute()
        self.assertEqual(self.proxy.read_bytes(),before);self.assertTrue(self.audio.exists());self.assertEqual(self.calls,[])
    def test_install_removes_old_audio_and_receipt_never_contains_keys(self):
        output=self.execute();self.assertNotIn('never-print',output);self.assertNotIn('public-fixture',output)
        receipt=json.loads(output);self.assertEqual(receipt['mode'],'enforce');self.assertFalse(self.audio.exists())
        backups=Path(receipt['backup']);paths=json.loads((backups/'paths.json').read_text());index=paths.index(str(self.audio))
        self.assertEqual((backups/str(index)/'old.wav').read_bytes(),b'old-audio-fixture')
        self.assertTrue(self.mapped('/usr/local/lib/car-catalog-guard/catalog-guard-recaptcha.py').exists())
    def test_failed_nginx_validation_restores_old_config_and_audio(self):
        self.fail_validation=True;before=self.proxy.read_bytes()
        with self.assertRaises(subprocess.CalledProcessError):self.execute()
        self.assertEqual(self.proxy.read_bytes(),before);self.assertEqual((self.audio/'old.wav').read_bytes(),b'old-audio-fixture')
        self.assertFalse(self.mapped('/usr/local/lib/car-catalog-guard/catalog-guard-recaptcha.py').exists())

if __name__=='__main__':unittest.main()
