import importlib.util
import pathlib
import unittest
spec = importlib.util.spec_from_file_location('crawler_networks', pathlib.Path(__file__).resolve().parents[1] / 'scripts/update-search-networks.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Networks(unittest.TestCase):
    def test_empty_malformed_and_global_feeds_are_rejected(self):
        for obj in [{'prefixes': []}, {'prefixes': [{}]}, {'prefixes': [{'ipv4Prefix': '0.0.0.0/0'}]}, {'prefixes': [{'ipv4Prefix': '127.0.0.0/8'}]}, {'prefixes': [{'ipv4Prefix': '1.2.3.4; return 200'}]}]:
            with self.assertRaises(ValueError): module.prefixes(obj)

    def test_ipv4_ipv6_networks(self):
        self.assertEqual(module.prefixes({'prefixes': [{'ipv4Prefix': '66.249.64.0/27'}, {'ipv6Prefix': '2001:4860:4801:10::/64'}]}), ['2001:4860:4801:10::/64', '66.249.64.0/27'])

    def test_yandex_requires_matching_forward_dns(self):
        valid = lambda database, name: '87.250.224.1 spider.yandex.com\n' if database == 'hosts' else '87.250.224.1 STREAM spider.yandex.com\n'
        self.assertTrue(module.confirm_yandex('87.250.224.1', valid))
        fake = lambda database, name: '87.250.224.1 spider.yandex.com\n' if database == 'hosts' else '1.1.1.1 STREAM spider.yandex.com\n'
        self.assertFalse(module.confirm_yandex('87.250.224.1', fake))
        lookalike = lambda database, name: '87.250.224.1 yandex.com.attacker.example\n'
        self.assertFalse(module.confirm_yandex('87.250.224.1', lookalike))

    def test_last_verified_list_survives_failed_refresh(self):
        old = {'at': 0, 'networks': ['66.249.64.0/27']}
        original = module.urllib.request.urlopen
        module.urllib.request.urlopen = lambda *args, **kwargs: (_ for _ in ()).throw(OSError('offline'))
        try:
            self.assertEqual(module.fetch_provider('google', old, 90000), old)
            with self.assertRaises(RuntimeError): module.fetch_provider('google', None, 90000)
        finally: module.urllib.request.urlopen = original

    def test_render_does_not_exempt_whole_cloud_networks(self):
        text = module.render({'google': {'networks': ['66.249.64.0/27']}, 'yandex': {'87.250.224.1': 123}})
        self.assertIn('87.250.224.1/32 1;', text)
        self.assertIn('geo $car_net_google', text)
        self.assertNotIn('0.0.0.0/0', text)

if __name__ == '__main__': unittest.main()
