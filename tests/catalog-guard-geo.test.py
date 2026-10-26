import datetime
import importlib.util
import ipaddress
import json
from pathlib import Path
import tempfile
import unittest

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('guard',root/'deploy/catalog-guard.py')
guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)

def country_fixture(path, policy, now):
    exempt = ['109.126.0.0/16', '109.110.0.0/16', '5.34.0.0/16', '91.0.0.0/16']
    rows, first = [], 0
    for net in sorted((ipaddress.ip_network(n) for n in exempt), key=lambda n: int(n.network_address)):
        start, end = int(net.network_address), int(net.broadcast_address)
        if first < start:rows.append([first, start-1, 'outside'])
        rows.append([start, end, 'exempt']);first=end+1
    rows.append([first, 2**32-1, 'outside'])
    path.write_text(json.dumps(dict(exempt_countries=policy['exempt_countries'],
        expires_utc=datetime.datetime.fromtimestamp(now+86400,datetime.timezone.utc).isoformat(),
        ranges={'4':rows, '6':[[0,2**128-1,'outside']]}, ahrefs_networks=['202.8.40.0/24'])))

class GeoChecks(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.path=Path(self.directory.name);self.clock=[100000.0]
        self.policy=guard.geo_module.load_policy(root/'deploy/catalog-guard-policy.json')
        self.countries=self.path/'countries.json';country_fixture(self.countries,self.policy,self.clock[0])
        self.store=guard.Store(self.path/'state.sqlite3',b'fixture-secret',lambda:self.clock[0],mass_export={},geo_policy=self.policy,country_path=self.countries)
    def tearDown(self):self.store.db.close();self.directory.cleanup()
    def read(self,uri='/cars/fresh',ip='203.0.113.90',cookie='',method='GET',ua=''):
        return self.store.check(ip,method,uri,cookie,user_agent=ua)
    def test_outside_first_lists_details_aliases_and_cache_repeats_need_verification(self):
        for ip in ['203.0.113.90','2001:db8::1']:
            for uri in ['/catalog','/api/cars?limit=48','/api/model-catalog?brand=byd&model=han','/api/pages/catalog','/cars/fresh','/api/pages/car?id=fresh','/api/%63ars?limit=48']:
                allowed,reason=self.read(uri,ip=ip)
                self.assertFalse(allowed);self.assertEqual(reason['reason'],'geo_country_verification')
        self.assertTrue(self.read(ip='109.126.0.1')[0])
        for uri in ['/api/auth/me','/api/analytics/events','/api/cars/summary','/api/image','/api/model-catalog?light=1','/']:
            self.assertTrue(self.read(uri)[0])
        self.assertTrue(self.read(method='HEAD')[0]);self.assertTrue(self.read(method='POST')[0])
    def test_clearance_persists_one_hour_across_mobile_ip_change_without_renewing_it(self):
        cookie=self.store.ensure_session('')[1].split(';')[0];sid=self.store.session(cookie)
        clearance=self.store.clearance('203.0.113.90',sid)
        self.assertTrue(self.read(cookie=cookie+'; '+guard.COOKIE+'='+clearance)[0])
        self.assertTrue(self.read(ip='203.0.113.91',cookie=cookie)[0])
        self.assertFalse(self.read(ip='203.0.113.91')[0])
        self.clock[0]+=3601;self.assertFalse(self.read(cookie=cookie)[0])
    def test_stale_or_invalid_country_database_fails_open_and_verified_service_is_exempt(self):
        self.assertTrue(self.read(ip='202.8.40.1',ua='AhrefsBot/7.0')[0])
        self.assertFalse(self.read(ip='202.8.40.1',ua='Mozilla/5.0')[0])
        self.store.geo.countries.expires=self.clock[0]-1;self.assertTrue(self.read()[0])
        self.countries.write_text('{}');self.store.geo.countries.reload();self.assertTrue(self.read()[0])
    def test_personal_export_budget_still_applies_after_geographic_clearance(self):
        cookie=self.store.ensure_session('')[1].split(';')[0];sid=self.store.session(cookie)
        self.store.clearance('203.0.113.90',sid)
        self.store.budget(sid);self.store.db.execute('UPDATE budgets SET details=600 WHERE ip=?',(sid,));self.store.db.commit()
        self.assertFalse(self.read(ip='203.0.113.91',cookie=cookie)[0])
    def test_old_campaign_tables_are_not_created_or_consulted(self):
        tables={r[0] for r in self.store.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertFalse(tables & {'geo_pairs','geo_pages','geo_risk'})
        self.store.db.execute('CREATE TABLE geo_risk (ua TEXT PRIMARY KEY,expires REAL,pairs INTEGER)')
        self.store.db.execute('INSERT INTO geo_risk VALUES (?,?,?)',('old',self.clock[0]+99999,99999))
        self.assertTrue(self.read(ip='109.126.0.1')[0])
    def test_geography_policy_rejects_stale_configuration_fields(self):
        path=self.path/'policy.json'
        for value in [{'enabled':True,'exempt_countries':[]},{'enabled':True,'exempt_countries':['BY'],'min_pairs':64}]:
            path.write_text(json.dumps({'geography':value}))
            with self.assertRaises(ValueError):guard.geo_module.load_policy(path)

if __name__=='__main__':unittest.main()
