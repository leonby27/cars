"""Country updates must preserve denials, crawler identity checks and rollback."""
import datetime
import gzip
import importlib.util
import ipaddress
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
real_open=open

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('update',root/'deploy/update-catalog-guard-geo.py')
update=importlib.util.module_from_spec(spec);spec.loader.exec_module(update)
spec=importlib.util.spec_from_file_location('geo',root/'deploy/catalog-guard-geo.py')
geo=importlib.util.module_from_spec(spec);spec.loader.exec_module(geo)


class Checks(unittest.TestCase):
    def test_source_build_preserves_singapore_ipv4_and_ipv6_denials(self):
        rows=['{0},{0},{1}'.format(ipaddress.IPv4Address(i),'SG' if i==100 else 'BY') for i in range(100000)]
        rows+=['2001:db8::,2001:db8::ffff,SG','2001:db8::1:0,2001:db8::1:ffff,US']
        result=update.build(gzip.compress(('\n'.join(rows)+'\n').encode()),['BY'],'2026-10',{'prefixes':[{'ipv4Prefix':'202.8.40.0/24'}]},blocked=['SG'])
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'countries.json';p.write_text(json.dumps(result))
            db=geo.Countries(p,{'exempt_countries':['BY'],'blocked_countries':['SG']},lambda:datetime.datetime(2026,10,28,tzinfo=datetime.timezone.utc).timestamp())
            self.assertTrue(db.valid)
            for ip in ['0.0.0.100','2001:db8::1']:self.assertEqual(db.classification(ipaddress.ip_address(ip)),'blocked')
            self.assertEqual(db.classification(ipaddress.ip_address('0.0.0.101')),'exempt')
            self.assertEqual(db.classification(ipaddress.ip_address('2001:db8::1:1')),'outside')
            text=update.blocked_config(db)
            self.assertIn('0.0.0.100/32 1;',text);self.assertIn('2001:db8::/112 1;',text)
            self.assertNotIn('0.0.0.101',text)

    def test_official_feeds_accept_ipv6_and_html_json_but_reject_cloud_wide_allowlists(self):
        for raw in [b'{"prefixes":[{"ipv4Prefix":"8.8.4.1"},{"ipv6Prefix":"2001:4860::/32"}]}',b'<code>{&quot;prefixes&quot;:[{&quot;ip_prefix&quot;:&quot;8.8.4.1/32&quot;}]}</code>']:
            self.assertIn('8.8.4.1/32',update.service_networks(raw))
        for raw in [b'{}',b'{"prefixes":[{"ipv4Prefix":"0.0.0.0/0"}]}',b'{"prefixes":[{"ipv4Prefix":"127.0.0.0/8"}]}']:
            with self.assertRaises(ValueError):update.service_networks(raw)
        wrong=json.dumps({'status':'ok','data':{'resource':'16509','prefixes':[{'prefix':'8.8.4.0/24'}]}}).encode()
        with self.assertRaises(ValueError):update.service_networks(wrong,'meta')

    def test_failed_refresh_retains_verified_previous_service_ranges(self):
        previous={name:['8.8.4.1/32'] for name in update.SERVICE_FEEDS}
        with patch.object(update,'fetch',side_effect=OSError('offline')):
            self.assertEqual(update.refresh_services(previous),previous)
            with self.assertRaises(RuntimeError):update.refresh_services({})

    def test_invalid_nginx_candidate_restores_country_data_and_denials(self):
        policy=geo.load_policy(root/'deploy/catalog-guard-policy.json')
        result={'exempt_countries':policy['exempt_countries'],'blocked_countries':['SG'],'expires_utc':'2090-01-01T00:00:00Z','ranges':{'4':[[0,2**32-2,'outside'],[2**32-1,2**32-1,'blocked']],'6':[[0,2**128-1,'outside']]},'ahrefs_networks':['202.8.40.0/24']}
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/'countries.json';output.write_text('old-countries')
            nginx=Path(directory)/'blocked.conf';nginx.write_text('old-denials')
            with patch('builtins.open',wraps=real_open) as opening,patch.object(update.fcntl,'flock'),patch.object(update.subprocess,'run',side_effect=subprocess.CalledProcessError(1,['nginx','-t'])):
                # The fixture lock lives in the temporary directory.
                opening.side_effect=lambda path,*args,**kwargs:real_open(Path(directory)/'lock' if str(path).startswith('/run/lock/') else path,*args,**kwargs)
                with self.assertRaises(subprocess.CalledProcessError):update.publish(result,output,root/'deploy/catalog-guard-policy.json',nginx,True)
            self.assertEqual(output.read_text(),'old-countries');self.assertEqual(nginx.read_text(),'old-denials')


if __name__=='__main__':unittest.main()
