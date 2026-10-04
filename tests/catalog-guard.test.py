import importlib.util
import json
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
    def early_policy(self):
        self.store.early_networks, self.store.early_until = guard.load_policy(Path(__file__).resolve().parents[1]/'deploy/catalog-guard-policy.json')
        self.store.early_until = self.clock[0]+86400
    def solve(self,ip):
        with patch.object(guard.secrets,'choice',lambda seq:seq[0]):
            identity,*_=self.store.puzzle(ip)
        return guard.COOKIE+'='+self.store.verify(ip,identity,'2222')
    def test_risk_networks_need_clearance_from_first_read_and_ip_rotation(self):
        self.early_policy()
        for ip in ['47.82.0.1','47.82.255.254','47.79.12.3']:
            for uri in ['/cars/42','/api/cars/42','/api/pages/car?id=42','/catalog','/api/cars?limit=100','/api/%63ars?limit=100','/api/model-catalog?brand=byd&model=han&page=2']:
                self.assertFalse(self.read(uri,ip=ip,cookie='arbitrary=fake'))
            for uri in ['/','/api/auth/me','/api/account/favorites','/api/analytics/events','/api/catalog/meta','/api/image','/assets/a.js','/api/cars/summary','/api/model-catalog?brand=byd&model=han&light=1']:
                self.assertTrue(self.read(uri,ip=ip))
            self.assertTrue(self.read('/api/cars',ip=ip,method='POST'))
            self.assertTrue(self.read('/cars/42',ip=ip,method='HEAD'))
        for ip in ['47.81.255.255','47.83.0.1','47.78.255.255','47.80.0.1','198.51.100.9','2001:db8::1']:
            self.assertTrue(self.read('/cars/42',ip=ip))
        self.assertEqual(self.store.db.execute('SELECT details FROM budgets WHERE ip=?',(self.store.key('47.82.0.1'),)).fetchone()[0],0)
        cookie=self.solve('47.82.0.1')
        self.assertTrue(self.read('/cars/42',ip='47.82.0.1',cookie=cookie))
        self.assertFalse(self.read('/cars/42',ip='47.82.0.2',cookie=cookie))
        self.assertFalse(self.read('/cars/42',ip='47.82.0.1',cookie=cookie+'tampered'))
        self.assertFalse(self.read('/cars/42',ip='47.82.0.1'))
        self.clock[0]+=3601
        self.assertFalse(self.read('/cars/42',ip='47.82.0.1',cookie=cookie))
    def test_model_json_and_html_share_collection_budget(self):
        html=guard.reading('GET','/catalog/byd/han?page=2&sort=price_asc')
        api=guard.reading('GET','/api/model-catalog?brand=byd&model=han&page=2&sort=price_asc')
        self.assertEqual(html,api)
        self.assertIsNotNone(guard.reading('GET','/api/model-catalog?brand=byd&model=han&light=0&light=1'))
        self.assertIsNone(guard.reading('GET','/api/model-catalog?brand=byd&model=han&light=1&light=0'))
        self.assertTrue(self.read('/catalog/byd/han?page=2&sort=price_asc'))
        self.assertTrue(self.read('/api/model-catalog?brand=byd&model=han&page=2&sort=price_asc'))
        self.assertEqual(self.store.db.execute('SELECT units,collections,paged FROM budgets').fetchone(),(48,1,1))
        self.exhaust()
        self.assertFalse(self.read('/api/model-catalog?brand=byd&model=han&page=3'))
        self.assertTrue(self.read('/api/model-catalog?brand=byd&model=han&page=3&light=1'))
    def test_early_clearance_has_bounded_new_reads_and_policy_autoexpires(self):
        self.early_policy();ip='47.79.0.1';cookie=self.solve(ip)
        for i in range(100):self.assertTrue(self.read('/cars/'+str(i),ip=ip,cookie=cookie))
        self.assertFalse(self.read('/cars/new',ip=ip,cookie=cookie))
        self.assertTrue(self.read('/api/cars/0',ip=ip,cookie=cookie))
        cookie=self.solve(ip)
        for i in range(20):self.assertTrue(self.read('/api/cars?limit=100&offset='+str(i*100),ip=ip,cookie=cookie))
        self.assertFalse(self.read('/api/cars?limit=100&offset=2000',ip=ip,cookie=cookie))
        self.clock[0]+=86401
        self.assertTrue(self.read('/cars/new',ip=ip))
    def test_policy_requires_explicit_utc_expiry_and_rejects_global_network(self):
        policy=Path(self.directory.name)/'policy.json'
        self.assertEqual(guard.load_policy(policy),((),0))
        for networks,expiry in [(['0.0.0.0/0'],'2026-10-11T00:00:00Z'),(['47.82.0.0/16'],'2026-10-11T00:00:00'),(['47.82.0.1/16'],'2026-10-11T00:00:00Z')]:
            policy.write_text(json.dumps({'early_check_networks':networks,'early_check_until_utc':expiry}))
            with self.assertRaises(ValueError):guard.load_policy(policy)
    def enable_behavior(self,**settings):
        self.store.behavior={**guard.BEHAVIOR_DEFAULTS,**settings}
    def session_cookie(self):
        return self.store.ensure_session('')[1].split(';')[0]
    def test_distributed_new_network_detected_across_ip_and_persistent_windows(self):
        self.enable_behavior()
        for i in range(31):
            for j in range(8):self.assertTrue(self.read('/cars/'+str(i*8+j),ip='198.18.1.'+str(i+1)))
        self.assertTrue(self.read('/cars/248',ip='198.18.1.32'))
        allowed,snapshot=self.store.check('198.18.1.32','GET','/cars/249')
        self.assertFalse(allowed);self.assertEqual(snapshot['reason'],'network_verification')
        self.assertFalse(self.read('/cars/new',ip='198.18.2.1'))
        self.clock[0]+=3601
        self.assertFalse(self.read('/cars/new',ip='198.18.3.1'))
        self.store.db.close();self.store=guard.Store(self.path,b'fixture-secret',lambda:self.clock[0],behavior={})
        self.assertFalse(self.read('/cars/new',ip='198.18.4.1'))
        self.assertTrue(self.read('/api/auth/me',ip='198.18.4.1'))
        cookie=self.solve('198.18.4.1')
        self.assertTrue(self.read('/cars/new',ip='198.18.4.1',cookie=cookie))
    def test_slow_distributed_network_detected_by_day_window(self):
        self.enable_behavior()
        for i in range(127):
            for j in range(8):self.assertTrue(self.read('/cars/'+str(i*8+j),ip='198.19.1.'+str(i+1)))
            self.clock[0]+=300
        self.assertFalse(self.read('/cars/new',ip='198.19.1.128'))
    def test_shared_network_normal_repeats_and_one_intensive_visitor_not_flagged(self):
        self.enable_behavior()
        for i in range(40):
            for j in range(3):self.assertTrue(self.read('/cars/'+str(j),ip='198.18.1.'+str(i+1)))
        for j in range(240):self.assertTrue(self.read('/cars/'+str(j),ip='203.0.113.1'))
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM network_risk').fetchone()[0],0)
    def test_sessions_signed_and_limit_follows_ip_without_accepting_forgery(self):
        self.enable_behavior(ordinary_clearance_details=2)
        cookie=self.session_cookie();sid=self.store.session(cookie)
        self.assertTrue(sid);self.assertEqual(self.store.ensure_session(cookie),(sid,''))
        self.assertFalse(self.store.session(cookie+'tampered'))
        self.store.budget(sid);self.store.db.execute('UPDATE budgets SET details=600 WHERE ip=?',(sid,));self.store.db.commit()
        for ip,path in [('198.51.100.1','/cars/one'),('203.0.113.1','/cars/two')]:
            self.assertFalse(self.read(path,ip=ip,cookie=cookie))
            grant=self.solve(ip)
            self.assertTrue(self.read(path,ip=ip,cookie=cookie+'; '+grant))
        allowed,snapshot=self.store.check('192.0.2.1','GET','/cars/three',cookie)
        self.assertFalse(allowed);self.assertFalse(snapshot['recoverable'])
    def test_session_counts_old_ip_views_and_can_recover_without_duplicate_insert(self):
        self.enable_behavior()
        self.assertTrue(self.read('/cars/42'))
        cookie=self.session_cookie();sid=self.store.session(cookie)
        self.assertTrue(self.read('/cars/42',cookie=cookie))
        self.assertEqual(self.store.budget(sid)[-1],1)
        self.store.db.execute('UPDATE budgets SET details=600 WHERE ip=?',(sid,));self.store.db.execute('DELETE FROM seen WHERE ip=?',(sid,));self.store.db.commit()
        self.assertFalse(self.read('/cars/42',cookie=cookie))
        grant=self.solve('198.51.100.9')
        self.assertTrue(self.read('/cars/42',cookie=cookie+'; '+grant))
    def test_clearance_daily_ip_limit_survives_new_puzzles_and_cookie_clearing(self):
        self.enable_behavior(risk_clearance_details=2);self.early_policy();ip='47.82.0.1'
        grant=self.solve(ip)
        self.assertTrue(self.read('/cars/1',ip=ip,cookie=grant))
        self.assertTrue(self.read('/cars/2',ip=ip,cookie=grant))
        another=self.solve(ip)
        allowed,snapshot=self.store.check(ip,'GET','/cars/3',self.session_cookie()+'; '+another)
        self.assertFalse(allowed);self.assertEqual(snapshot['reason'],'daily_clearance_budget')
        self.assertFalse(snapshot['recoverable']);self.assertTrue(self.read('/cars/1',ip=ip,cookie=another))
    def test_network_total_not_reset_by_many_ips_or_challenge_renewals(self):
        self.enable_behavior(network_clearance_details=2);self.early_policy()
        for ip,path in [('47.82.0.1','/cars/1'),('47.82.1.1','/cars/2')]:
            self.assertTrue(self.read(path,ip=ip,cookie=self.solve(ip)))
        ip='47.82.2.1';cookie=self.solve(ip)
        allowed,snapshot=self.store.check(ip,'GET','/cars/3',cookie)
        self.assertFalse(allowed);self.assertFalse(snapshot['recoverable'])
        self.assertTrue(self.read('/cars/3',ip='47.79.2.1',cookie=self.solve('47.79.2.1')))
    def test_semantic_vehicle_read_aliases_and_number_capacity_match_application(self):
        self.assertEqual(guard.reading('GET','/api/cars/42/report'),guard.reading('GET','/cars/42'))
        for query,units in [('limit=0',24),('limit=',24),('limit=Infinity',100),('limit=0x64',100),('limit=1.5',2),('limit=100&limit=1',100)]:
            self.assertEqual(guard.reading('GET','/api/cars?'+query)['units'],units)
        self.assertTrue(guard.reading('GET','/api/cars?offset=0x64')['paged'])
        self.assertTrue(guard.reading('GET','/catalog?page=0x2')['paged'])
    def test_ipv6_network_risk_and_daily_clearance_expiration(self):
        self.enable_behavior(min_ips_hour=2,details_hour=2,network_clearance_details=1)
        self.assertTrue(self.read('/cars/1',ip='2001:db8:1234:1::1'))
        self.assertFalse(self.read('/cars/2',ip='2001:db8:1234:2::1'))
        ip='2001:db8:1234:3::1';cookie=self.solve(ip)
        self.assertTrue(self.read('/cars/2',ip=ip,cookie=cookie))
        self.assertFalse(self.read('/cars/3',ip=ip,cookie=self.solve(ip)))
        self.clock[0]+=86401
        self.assertTrue(self.read('/cars/3',ip=ip))
    def test_parallel_reads_cannot_overspend_daily_network_cap(self):
        from concurrent.futures import ThreadPoolExecutor
        self.enable_behavior(network_clearance_details=1);self.early_policy()
        jobs=[('47.82.0.1','/cars/1'),('47.82.1.1','/cars/2')]
        jobs=[(ip,path,self.solve(ip)) for ip,path in jobs]
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda job:self.read(job[1],ip=job[0],cookie=job[2]),jobs))
        self.assertEqual(sorted(results),[False,True])
    def test_behavior_policy_validation(self):
        policy=Path(self.directory.name)/'policy.json'
        for behavior in [{'enabled':'yes'},{'enabled':True,'details_hour':-1},{'enabled':True,'unknown':1},{'enabled':True,'details_hour':True}]:
            policy.write_text(json.dumps({'behavior':behavior}))
            with self.assertRaises(ValueError):guard.load_behavior_policy(policy)
        policy.write_text(json.dumps({'behavior':{'enabled':False}}));self.assertIsNone(guard.load_behavior_policy(policy))

if __name__=='__main__':unittest.main()
