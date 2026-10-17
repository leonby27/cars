"""Behavioral regressions for selective country + cross-network checks."""
import datetime
import importlib.util
import ipaddress
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('guard', root/'deploy/catalog-guard.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/145.0.0.0 Safari/537.36'


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
        self.directory=tempfile.TemporaryDirectory()
        self.clock=[100000.0]
        self.path=Path(self.directory.name)
        self.policy=guard.geo_module.load_policy(root/'deploy/catalog-guard-policy.json')
        self.countries=self.path/'countries.json'
        country_fixture(self.countries,self.policy,self.clock[0])
        self.store=guard.Store(self.path/'state.sqlite3',b'fixture-secret',lambda:self.clock[0],
            early_networks=['47.82.0.0/16'],early_until=self.clock[0]+86400,
            behavior={},geo_policy=self.policy,country_path=self.countries)

    def tearDown(self):
        self.store.db.close();self.directory.cleanup()

    def read(self, uri='/cars/fresh', ip='203.0.113.90', ua=UA, cookie='', method='GET'):
        return self.store.check(ip,method,uri,cookie,user_agent=ua)

    def campaign(self, pairs=64, risky_api=True, ua=UA):
        for i in range(pairs):
            self.clock[0]+=1
            self.read('/cars/pair-'+str(i),ip='198.51.100.'+str(i+1),ua=ua)
            self.read('/api/cars/pair-'+str(i),ip=('47.82.201.' if risky_api else '192.0.2.')+str(i%8+1),ua=ua)

    def test_foreign_country_ua_and_missing_cookie_do_not_challenge_ordinary_browsing(self):
        for i in range(80):
            self.assertTrue(self.read('/cars/ordinary-'+str(i))[0])
        for i in range(100):
            self.assertTrue(self.read('/catalog?page='+str(i+1))[0])
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM geo_risk').fetchone()[0],0)

    def test_only_statistically_correlated_cross_network_campaign_is_challenged(self):
        self.campaign(pairs=63)
        self.assertTrue(self.read()[0])
        self.clock[0]+=1
        self.read('/cars/last',ip='198.51.100.100')
        self.read('/api/cars/last',ip='47.82.201.1')
        for uri in ['/cars/fresh','/api/cars/fresh','/api/pages/car?id=fresh','/catalog','/api/model-catalog?brand=byd&model=han']:
            allowed,reason=self.read(uri)
            self.assertFalse(allowed);self.assertEqual(reason['reason'],'geo_campaign_verification')
        self.assertTrue(self.read(ua=UA+' different-profile')[0])

    def test_cis_and_europe_exempt_only_new_layer_and_legacy_limits_still_apply(self):
        self.campaign()
        for ip in ['109.126.0.1','109.110.0.1','5.34.0.1','91.0.0.1']:
            self.assertTrue(self.read(ip=ip)[0])
        for i in range(600):self.read('/cars/bulk-'+str(i),ip='109.126.0.1')
        allowed,reason=self.read('/cars/bulk-next',ip='109.126.0.1')
        self.assertFalse(allowed);self.assertNotEqual(reason['reason'],'geo_campaign_verification')

    def test_no_campaign_from_unflagged_api_network_or_html_only_or_same_network(self):
        self.campaign(risky_api=False)
        self.assertTrue(self.read()[0])
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM geo_pairs').fetchone()[0],0)
        for i in range(70):
            self.read('/cars/html-only-'+str(i),ip='198.51.101.'+str(i+1))
            self.read('/api/cars/html-only-'+str(i),ip='198.51.102.'+str(i+1))
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM geo_risk').fetchone()[0],0)

    def test_one_api_ip_and_repeated_car_are_insufficient(self):
        for i in range(70):
            self.read('/cars/unique-'+str(i),ip='198.51.100.'+str(i+1))
            self.read('/api/cars/unique-'+str(i),ip='47.82.201.1')
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM geo_risk').fetchone()[0],0)
        for _ in range(100):
            self.read('/cars/repeated',ip='198.51.101.1')
            self.read('/api/cars/repeated',ip='47.82.201.2')
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM geo_risk').fetchone()[0],0)

    def test_verification_preserves_session_on_ip_change_but_does_not_reset_budgets(self):
        self.campaign()
        session,cookie=self.store.ensure_session('');cookie=cookie.split(';')[0]
        with patch.object(guard.secrets,'choice',lambda seq:seq[0]):identity,*_=self.store.puzzle('203.0.113.90')
        token=self.store.verify('203.0.113.90',identity,'2222',session=session)
        self.assertTrue(token)
        self.assertTrue(self.read(cookie=cookie)[0])
        self.assertTrue(self.read('/cars/mobile',ip='203.0.113.91',cookie=cookie)[0])
        self.assertFalse(self.read('/cars/mobile',ip='203.0.113.91',cookie=cookie+'tampered')[0])
        for i in range(600):self.read('/cars/session-'+str(i),ip='203.0.113.92',cookie=cookie)
        self.assertFalse(self.read('/cars/session-next',ip='203.0.113.93',cookie=cookie)[0])

    def test_auth_forms_assets_metadata_and_head_remain_outside_new_guard(self):
        self.campaign()
        for uri in ['/','/api/auth/me','/api/account/favorites','/api/analytics/events','/api/catalog/meta','/api/image','/assets/a.js','/api/cars/summary','/api/model-catalog?brand=byd&model=han&light=1']:
            self.assertTrue(self.read(uri)[0])
        for method in ['HEAD','POST']:
            self.assertTrue(self.read(method=method)[0])

    def test_verified_ahrefs_requires_official_ip_and_ua(self):
        ua='Mozilla/5.0 (compatible; AhrefsSiteAudit/6.1)'
        self.store.db.execute('INSERT INTO geo_risk VALUES (?,?,?)',(self.store.key('geo-ua:'+ua),self.clock[0]+1000,64));self.store.db.commit()
        self.assertTrue(self.read(ip='202.8.40.20',ua=ua)[0])
        self.assertFalse(self.read(ua=ua)[0])
        self.assertFalse(self.store.geo.countries.verified_service(ipaddress.ip_address('202.8.40.20'),UA))

    def test_missing_stale_or_mismatched_countries_fail_open_only_new_layer(self):
        self.campaign()
        for invalid in ['missing','expired','mismatch']:
            if invalid=='missing':self.countries.unlink()
            else:
                country_fixture(self.countries,self.policy,self.clock[0])
                data=json.loads(self.countries.read_text())
                if invalid=='expired':data['expires_utc']='1970-01-01T00:00:00Z'
                else:data['exempt_countries']=['US']
                self.countries.write_text(json.dumps(data))
            self.store.geo.countries.reload()
            self.assertTrue(self.read()[0])
        for i in range(600):self.read('/cars/legacy-'+str(i))
        self.assertFalse(self.read('/cars/legacy-next')[0])

    def test_risk_expires_and_geo_evidence_persists_restart(self):
        self.campaign();self.assertFalse(self.read()[0])
        self.store.db.close()
        self.store=guard.Store(self.path/'state.sqlite3',b'fixture-secret',lambda:self.clock[0],behavior={},geo_policy=self.policy,country_path=self.countries)
        self.assertFalse(self.read()[0])
        self.clock[0]+=3601
        self.assertTrue(self.read()[0])

    def test_policy_rejects_accidental_first_visit_or_empty_exemption_settings(self):
        path=self.path/'policy.json'
        for value in [{'enabled':True,'exempt_countries':[]},{'enabled':True,'exempt_countries':['BY'],'min_pairs':1},{'enabled':True,'exempt_countries':['BY'],'surprise':True}]:
            path.write_text(json.dumps({'geo_campaign':value}))
            with self.assertRaises(ValueError):guard.geo_module.load_policy(path)


if __name__=='__main__':unittest.main()
