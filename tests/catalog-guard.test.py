import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('guard',root/'deploy/catalog-guard.py')
guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)

class Checks(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.clock=[100000.0]
        self.path=Path(self.directory.name)/'state.sqlite3'
        self.store=guard.Store(self.path,b'fixture-secret',lambda:self.clock[0],mass_export={})
    def tearDown(self):self.store.db.close();self.directory.cleanup()
    def read(self,uri,ip='198.51.100.9',cookie='',method='GET'):return self.store.check(ip,method,uri,cookie)[0]
    def exhaust(self):
        for i in range(600):self.assertTrue(self.read('/cars/'+str(i)))
        self.assertFalse(self.read('/cars/new'))
    def test_normal_filters_repeats_and_non_catalog_routes_are_available(self):
        for i in range(150):self.assertTrue(self.read('/api/cars?limit=48&brand=B'+str(i)))
        for _ in range(1500):self.assertTrue(self.read('/api/cars?limit=48&brand=B1'))
        for i in range(100):self.assertTrue(self.read('/cars/'+str(i)))
        for uri in ['/','/api/auth/me','/api/account/favorites','/api/analytics/events','/api/catalog/meta','/api/image','/assets/a.js','/api/cars/summary']:
            self.assertTrue(self.read(uri))
        for method in ['HEAD','POST']:self.assertTrue(self.read('/api/cars?limit=100',method=method))
    def test_mass_pagination_is_bounded_and_encoded_paths_do_not_bypass_it(self):
        results=[self.read('/api/cars?limit=100&offset='+str(i*100)) for i in range(160)]
        self.assertTrue(all(results[:101]));self.assertFalse(results[101])
        self.assertTrue(self.read('/api/cars?limit=100&offset=0'))
        self.assertFalse(self.read('/api/%63ars?limit=100&offset=15500'))
    def test_equivalent_representations_share_budget(self):
        for uri in ['/cars/42','/api/cars/42','/api/pages/car?id=42','/api/cars/42/report']:self.assertTrue(self.read(uri))
        self.assertEqual(self.store.db.execute('SELECT details FROM budgets').fetchone()[0],1)
        self.assertEqual(guard.reading('GET','/catalog/byd/han?page=2&sort=price_asc'),guard.reading('GET','/api/model-catalog?brand=byd&model=han&page=2&sort=price_asc'))
        self.assertIsNone(guard.reading('GET','/api/model-catalog?light=1&light=0'))
        self.assertIsNotNone(guard.reading('GET','/api/model-catalog?light=0&light=1'))
    def test_signed_session_follows_personal_export_across_ip_changes(self):
        cookie=self.store.ensure_session('')[1].split(';')[0];sid=self.store.session(cookie)
        self.assertTrue(sid);self.assertFalse(self.store.session(cookie+'tampered'))
        self.store.budget(sid);self.store.db.execute('UPDATE budgets SET details=600 WHERE ip=?',(sid,));self.store.db.commit()
        self.assertFalse(self.read('/cars/new',ip='203.0.113.1',cookie=cookie))
        self.assertFalse(self.read('/cars/new',ip='192.0.2.1',cookie=cookie))
        self.assertTrue(self.read('/cars/new',ip='192.0.2.2'))
    def test_personal_clearance_is_bounded_and_cannot_reset_daily_total(self):
        self.store.mass_export['clearance_details']=2;self.exhaust()
        cookie=guard.COOKIE+'='+self.store.clearance('198.51.100.9')
        self.assertTrue(self.read('/cars/one',cookie=cookie));self.assertTrue(self.read('/cars/two',cookie=cookie))
        renewed=guard.COOKIE+'='+self.store.clearance('198.51.100.9')
        allowed,reason=self.store.check('198.51.100.9','GET','/cars/three',renewed)
        self.assertFalse(allowed);self.assertEqual(reason['reason'],'daily_clearance_budget')
        self.assertTrue(self.read('/cars/one'))
        self.assertFalse(self.read('/cars/another',cookie=renewed+'tampered'))
        self.assertTrue(self.read('/cars/ordinary',ip='198.51.100.10'))
    def test_budget_survives_restart_and_expires(self):
        self.exhaust();self.store.db.close()
        self.store=guard.Store(self.path,b'fixture-secret',lambda:self.clock[0],mass_export={})
        self.assertFalse(self.read('/cars/new'));self.clock[0]+=86401;self.assertTrue(self.read('/cars/new'))
    def test_shared_network_activity_cannot_challenge_other_visitors(self):
        for i in range(40):
            for j in range(10):self.assertTrue(self.read('/cars/'+str(i*10+j),ip='198.18.1.'+str(i+1)))
        self.assertTrue(self.read('/catalog',ip='198.18.1.41'))
        tables={r[0] for r in self.store.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertFalse(tables & {'network_windows','network_risk','puzzles','geo_pairs','geo_risk'})
    def test_policy_validation_and_safe_return(self):
        path=Path(self.directory.name)/'policy.json'
        for config in [{'enabled':'yes'},{'enabled':True,'clearance_units':-1},{'enabled':True,'unknown':1},{'enabled':True,'clearance_details':True}]:
            path.write_text(json.dumps({'mass_export':config}))
            with self.assertRaises(ValueError):guard.load_mass_export_policy(path)
        for bad in ['https://evil.test','//evil.test','/\\evil.test','/api/auth/logout','/catalog\nLocation: evil']:self.assertEqual(guard.safe_return(bad),'/catalog')
        self.assertEqual(guard.safe_return('/catalog?brand=BMW'),'/catalog?brand=BMW')

if __name__=='__main__':unittest.main()
