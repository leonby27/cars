import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('guard',Path(__file__).resolve().parents[1]/'deploy/catalog-guard.py')
guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)

class Checks(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.clock=[100000.0]
        self.path=Path(self.directory.name)/'state.sqlite3'
        self.store=guard.Store(self.path,b'fixture-secret',lambda:self.clock[0])
    def tearDown(self):self.store.db.close();self.directory.cleanup()
    def read(self,uri,ip='198.51.100.9',cookie='',method='GET'):
        return self.store.check(ip,method,uri,cookie)[0]
    def exhaust(self):
        for i in range(600):self.assertTrue(self.read('/cars/'+str(i)))
        self.assertFalse(self.read('/cars/new'))
    def test_normal_visit_filters_repeats_and_post_are_available(self):
        for i in range(150):self.assertTrue(self.read('/api/cars?limit=48&brand=B'+str(i)))
        for _ in range(1500):self.assertTrue(self.read('/api/cars?limit=48&brand=B1'))
        for i in range(100):self.assertTrue(self.read('/cars/'+str(i)))
        for uri in ['/','/api/auth/me','/api/account/favorites','/api/analytics/events','/api/catalog/meta','/api/image','/assets/a.js','/api/cars/summary']:
            self.assertTrue(self.read(uri))
        self.assertTrue(self.read('/api/cars?limit=100',method='POST'))
        self.assertTrue(self.read('/api/cars?limit=100',method='HEAD'))
    def test_paginated_volume_detected_before_full_catalog(self):
        results=[self.read('/api/cars?limit=100&offset='+str(i*100)) for i in range(160)]
        self.assertTrue(all(results[:101]));self.assertFalse(results[101])
        self.assertTrue(self.read('/api/cars?limit=100&offset=0'))
        self.assertFalse(self.read('/api/%63ars?limit=100&offset=15500'))
        self.assertTrue(self.read('/api/auth/me'))
        self.assertTrue(self.read('/api/cars',method='POST'))
        self.assertFalse(self.read('/api/cars?limit=100&offset=15500',cookie='arbitrary=new-session'))
    def test_details_shared_across_domains_and_cache_representations(self):
        self.assertTrue(self.read('/cars/42'))
        self.assertTrue(self.read('/api/cars/42'))
        self.assertTrue(self.read('/api/pages/car?id=42'))
        self.assertEqual(self.store.db.execute('SELECT details FROM budgets').fetchone()[0],1)
        self.exhaust()
    def test_recovery_cookie_valid_scoped_and_bounded(self):
        self.exhaust()
        with patch.object(guard.secrets,'choice',lambda seq:seq[0]):
            identity,png,audio=self.store.puzzle('198.51.100.9')
        self.assertTrue(png.startswith(b'\x89PNG'))
        self.assertIsNone(self.store.verify('198.51.100.10',identity,'2222'))
        self.assertIsNone(self.store.verify('198.51.100.9',identity,'0000'))
        token=self.store.verify('198.51.100.9',identity,'2222')
        self.assertIsNotNone(token)
        self.assertIsNone(self.store.verify('198.51.100.9',identity,'2222'))
        cookie=guard.COOKIE+'='+token
        self.assertTrue(self.read('/cars/new',cookie=cookie))
        self.assertFalse(self.read('/cars/next',cookie=cookie+'tampered'))
        self.store.db.execute('UPDATE passes SET units=8000');self.store.db.commit()
        self.assertFalse(self.read('/cars/next',cookie=cookie))
        self.assertTrue(self.read('/cars/new'))
    def test_ip_day_budget_persists_restart_and_expires(self):
        self.exhaust();self.store.db.close()
        self.store=guard.Store(self.path,b'fixture-secret',lambda:self.clock[0])
        self.assertFalse(self.read('/cars/new'))
        self.assertTrue(self.read('/cars/new',ip='198.51.100.10'))
        self.clock[0]+=86401
        self.assertTrue(self.read('/cars/new'))
    def test_puzzle_attempt_expiration_and_return_url(self):
        with patch.object(guard.secrets,'choice',lambda seq:seq[0]):identity,*_=self.store.puzzle('198.51.100.9')
        for _ in range(5):self.assertIsNone(self.store.verify('198.51.100.9',identity,'0000'))
        self.assertIsNone(self.store.verify('198.51.100.9',identity,'2222'))
        with patch.object(guard.secrets,'choice',lambda seq:seq[0]):identity,*_=self.store.puzzle('198.51.100.9')
        self.clock[0]+=601
        self.assertIsNone(self.store.verify('198.51.100.9',identity,'2222'))
        for bad in ['https://evil.test','//evil.test','/\\evil.test','/api/auth/logout','/catalog\nLocation: evil']:
            self.assertEqual(guard.safe_return(bad),'/catalog')
        self.assertEqual(guard.safe_return('/catalog?brand=BMW'),'/catalog?brand=BMW')

if __name__=='__main__':unittest.main()
