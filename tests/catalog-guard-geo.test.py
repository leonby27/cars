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
    # One Singapore fixture in each IP family.
    blocked=ipaddress.ip_network('203.0.113.128/25')
    result=[]
    for a,b,tag in rows:
        start,end=int(blocked.network_address),int(blocked.broadcast_address)
        if b<start or a>end:result.append([a,b,tag]);continue
        if a<start:result.append([a,start-1,tag])
        result.append([max(a,start),min(b,end),'blocked'])
        if b>end:result.append([end+1,b,tag])
    path.write_text(json.dumps(dict(exempt_countries=policy['exempt_countries'],blocked_countries=policy['blocked_countries'],
        expires_utc=datetime.datetime.fromtimestamp(now+86400,datetime.timezone.utc).isoformat(),
        ranges={'4':result, '6':[[0,int(ipaddress.ip_address('2001:db8::ffff')),'outside'],[int(ipaddress.ip_address('2001:db8::1:0')),int(ipaddress.ip_address('2001:db8::1:ffff')),'blocked'],[int(ipaddress.ip_address('2001:db8::2:0')),2**128-1,'outside']]}, ahrefs_networks=['202.8.40.0/24'],service_networks={'gptbot':['8.8.4.0/24']})))

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
            for uri in ['/catalog','/api/cars?limit=48','/api/model-catalog?brand=byd&model=han','/api/pages/catalog','/cars/fresh','/api/pages/car?id=fresh','/api/%63ars?limit=48','/','/?q=Zeekr','/index.html','/api/pages/static','/api/pages/static?path=','/api/pages/static?path=%2F','/api/pages/static?path=%2F%2F&path=/contacts']:
                allowed,reason=self.read(uri,ip=ip)
                self.assertFalse(allowed);self.assertEqual(reason['reason'],'geo_country_verification')
        self.assertTrue(self.read(ip='109.126.0.1')[0])
        for uri in ['/api/auth/me','/api/analytics/events','/api/cars/summary','/api/image','/api/model-catalog?light=1','/contacts','/login','/blog/article','/assets/a.js','/photos/car.jpg','/documents/privacy-policy.pdf','/robots.txt','/sitemap-7c4f19b2.xml','/api/pages/static?path=/contacts&path=/']:
            self.assertFalse(self.read(uri)[0]);self.assertTrue(self.read(uri,ip='109.126.0.1')[0])
        self.assertFalse(self.read(method='HEAD')[0]);self.assertFalse(self.read(method='POST')[0])
    def test_blocked_country_cannot_use_clearance_or_verified_service(self):
        cookie=self.store.ensure_session('')[1].split(';')[0];sid=self.store.session(cookie)
        clearance=self.store.clearance('203.0.113.130',sid)
        self.store.geo.countries.ahrefs+=(ipaddress.ip_network('203.0.113.128/25'),)
        for ip in ['203.0.113.130','2001:db8::1:1']:
            for uri in ['/','/contacts','/api/cars','/assets/a.js','/_catalog-check']:
                for method in ['GET','HEAD','POST']:
                    allowed,reason=self.read(uri,ip=ip,cookie=cookie+'; '+guard.COOKIE+'='+clearance,method=method,ua='AhrefsBot/7.0')
                    self.assertFalse(allowed);self.assertEqual(reason['reason'],'geo_country_blocked')
    def test_training_crawler_requires_matching_official_ip_and_agent(self):
        for uri in ['/contacts','/catalog','/assets/a.js']:
            self.assertTrue(self.read(uri,ip='8.8.4.1',ua='GPTBot/1.4')[0])
            self.assertFalse(self.read(uri,ip='203.0.113.90',ua='GPTBot/1.4')[0])
            self.assertFalse(self.read(uri,ip='8.8.4.1',ua='Mozilla/5.0')[0])
    def test_non_catalog_clearance_preserves_return_path_and_export_budgets(self):
        cookie=self.store.ensure_session('')[1].split(';')[0];sid=self.store.session(cookie)
        self.store.clearance('203.0.113.90',sid)
        for uri in ['/contacts?from=home#phone','/login','/documents/privacy-policy.pdf','/blog/article']:
            self.assertEqual(guard.safe_return(uri),uri)
            self.assertTrue(self.read(uri,cookie=cookie)[0])
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM budgets').fetchone()[0],0)
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM seen').fetchone()[0],0)
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
    def test_verified_ahrefs_bypasses_exhausted_personal_budgets_but_forgery_does_not(self):
        cookie=self.store.ensure_session('')[1].split(';')[0];sid=self.store.session(cookie)
        ip='202.8.40.1'
        for key in [self.store.key(ip),sid]:
            self.store.budget(key)
            self.store.db.execute('UPDATE budgets SET details=600 WHERE ip=?',(key,))
        self.store.db.commit()
        for ua in ['AhrefsBot/7.0','Mozilla/5.0 AhrefsSiteAudit/6.1']:
            self.assertTrue(self.read(ip=ip,cookie=cookie,ua=ua)[0])
            self.assertFalse(self.read(ip='203.0.113.90',cookie=cookie,ua=ua)[0])
        self.assertFalse(self.read(ip=ip,cookie=cookie,ua='Mozilla/5.0')[0])
        self.store.geo.countries.expires=self.clock[0]-1
        self.assertFalse(self.read(ip=ip,cookie=cookie,ua='AhrefsBot/7.0')[0])

    def test_personal_export_budget_still_applies_after_geographic_clearance(self):
        cookie=self.store.ensure_session('')[1].split(';')[0];sid=self.store.session(cookie)
        self.store.clearance('203.0.113.90',sid)
        self.store.budget(sid);self.store.db.execute('UPDATE budgets SET details=600 WHERE ip=?',(sid,));self.store.db.commit()
        self.assertFalse(self.read(ip='203.0.113.91',cookie=cookie)[0])
    def test_home_is_geographic_only_and_does_not_spend_personal_export_budget(self):
        self.assertTrue(self.read('/',ip='109.126.0.1')[0])
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM seen').fetchone()[0],0)
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM budgets').fetchone()[0],0)
        cookie=self.store.ensure_session('')[1].split(';')[0];sid=self.store.session(cookie)
        self.store.clearance('203.0.113.90',sid)
        self.assertTrue(self.read('/',cookie=cookie)[0])
        self.clock[0]+=3601;self.assertFalse(self.read('/',cookie=cookie)[0])
        self.store.geo.countries.expires=self.clock[0]-1;self.assertTrue(self.read('/')[0])
    def test_old_campaign_tables_are_not_created_or_consulted(self):
        tables={r[0] for r in self.store.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertFalse(tables & {'geo_pairs','geo_pages','geo_risk'})
        self.store.db.execute('CREATE TABLE geo_risk (ua TEXT PRIMARY KEY,expires REAL,pairs INTEGER)')
        self.store.db.execute('INSERT INTO geo_risk VALUES (?,?,?)',('old',self.clock[0]+99999,99999))
        self.assertTrue(self.read(ip='109.126.0.1')[0])
    def test_geography_policy_rejects_stale_configuration_fields(self):
        path=self.path/'policy.json'
        for value in [{'enabled':True,'exempt_countries':[]},{'enabled':True,'exempt_countries':['BY'],'min_pairs':64},{'enabled':True,'exempt_countries':['BY'],'blocked_countries':['BY']},{'enabled':True,'exempt_countries':['BY'],'blocked_countries':['bad']}]:
            path.write_text(json.dumps({'geography':value}))
            with self.assertRaises(ValueError):guard.geo_module.load_policy(path)

if __name__=='__main__':unittest.main()
