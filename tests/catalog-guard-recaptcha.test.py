import datetime
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('guard',root/'deploy/catalog-guard.py')
guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)

class Checks(unittest.TestCase):
    def setUp(self):
        self.verifier=guard.captcha_module.Recaptcha('public','secret',['abcars.by','abdrive.ru'])
    def reply(self,**values):
        return io.BytesIO(json.dumps({'success':True,'hostname':'abcars.by','challenge_ts':datetime.datetime.now(datetime.timezone.utc).isoformat(),**values}).encode())
    def test_server_validation_requires_matching_host_and_success(self):
        for values,expected in [({},True),({'challenge_ts':(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(minutes=10)).isoformat()},True),({'success':False},False),({'success':'true'},False),({'hostname':'evil.test'},False),({'challenge_ts':'bad'},False),({'challenge_ts':'2000-01-01T00:00:00Z'},False)]:
            with patch.object(guard.captcha_module.urllib.request,'urlopen',return_value=self.reply(**values)) as call:
                self.assertEqual(self.verifier.verify('token','198.51.100.1','abcars.by'),expected)
                request=call.call_args.args[0]
                self.assertIn(b'secret=secret',request.data)
                self.assertNotIn('secret',request.full_url)
        with patch.object(guard.captcha_module.urllib.request,'urlopen') as call:
            self.assertFalse(self.verifier.verify('token','198.51.100.1','evil.test'));call.assert_not_called()
            self.assertFalse(self.verifier.verify('','198.51.100.1','abcars.by'));call.assert_not_called()
    def test_provider_outage_cannot_grant_clearance(self):
        with patch.object(guard.captcha_module.urllib.request,'urlopen',side_effect=TimeoutError):
            with self.assertRaises(guard.captcha_module.Unavailable):self.verifier.verify('token','198.51.100.1','abcars.by')
    def test_no_startup_with_missing_production_keys(self):
        with self.assertRaises(ValueError):guard.captcha_module.configured(root/'deploy/catalog-guard-policy.json',{})
        verifier=guard.captcha_module.configured(root/'deploy/catalog-guard-policy.json',{'CATALOG_RECAPTCHA_SITE_KEY':'public','CATALOG_RECAPTCHA_SECRET_KEY':'secret'})
        self.assertEqual(verifier.hosts,('abcars.by','www.abcars.by','abdrive.ru','www.abdrive.ru'))
    def test_nonce_is_single_use_ip_and_session_bound_and_expires(self):
        with tempfile.TemporaryDirectory() as directory:
            clock=[100000.0];store=guard.Store(Path(directory)/'state.sqlite3',b'secret',lambda:clock[0],mass_export={})
            try:
                sid=store.ensure_session('')[0];other=store.ensure_session('')[0]
                nonce=store.recaptcha_nonce('198.51.100.1',sid)
                self.assertFalse(store.consume_recaptcha_nonce('198.51.100.2',sid,nonce))
                self.assertFalse(store.consume_recaptcha_nonce('198.51.100.1',other,nonce))
                self.assertTrue(store.consume_recaptcha_nonce('198.51.100.1',sid,nonce))
                self.assertFalse(store.consume_recaptcha_nonce('198.51.100.1',sid,nonce))
                nonce=store.recaptcha_nonce('198.51.100.1',sid);clock[0]+=601
                self.assertFalse(store.consume_recaptcha_nonce('198.51.100.1',sid,nonce))
            finally:store.db.close()

if __name__=='__main__':unittest.main()
