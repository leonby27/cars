"""Google reCAPTCHA v2 verification. Secrets never enter pages or logs."""
import datetime
import json
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request


class Unavailable(Exception):
    pass


class Recaptcha:
    def __init__(self, site_key, secret_key, hosts):
        if not site_key or not secret_key or not hosts:
            raise ValueError('Google reCAPTCHA site/secret keys and allowed hosts are required')
        if any(not re.fullmatch(r'[a-z0-9]+(?:[.-][a-z0-9]+)*', host) for host in hosts):
            raise ValueError('Invalid reCAPTCHA hostname')
        self.site_key, self.secret_key, self.hosts = site_key, secret_key, tuple(hosts)

    def verify(self, token, ip, host):
        if not token or len(token)>4096 or host not in self.hosts:
            return False
        request=urllib.request.Request('https://www.google.com/recaptcha/api/siteverify',
            data=urllib.parse.urlencode({'secret':self.secret_key,'response':token,'remoteip':ip}).encode(),
            headers={'Content-Type':'application/x-www-form-urlencoded'},method='POST')
        try:
            with urllib.request.urlopen(request,timeout=5) as response:
                result=json.loads(response.read(32769))
        except Exception:
            raise Unavailable('Google verification is temporarily unavailable') from None
        if not isinstance(result,dict) or result.get('success') is not True or result.get('hostname')!=host:
            return False
        try:
            stamp=datetime.datetime.fromisoformat(result['challenge_ts'].replace('Z','+00:00'))
            age=(datetime.datetime.now(datetime.timezone.utc)-stamp).total_seconds()
            # Google enforces token expiry. challenge_ts is the widget load
            # time, so slow human challenges must not be rejected at 150s.
            return -120<=age<=86400
        except (KeyError,TypeError,ValueError):
            return False


def configured(path, env=None):
    env=os.environ if env is None else env
    config=json.loads(Path(path).read_text()).get('verification',{})
    if not config:raise ValueError('Google reCAPTCHA configuration is required')
    if config.get('provider')!='recaptcha_v2' or set(config)-{'provider','allowed_hosts'}:
        raise ValueError('Unsupported verification configuration')
    hosts=config.get('allowed_hosts')
    if not isinstance(hosts,list) or any(not isinstance(host,str) for host in hosts):
        raise ValueError('Explicit reCAPTCHA allowed hosts required')
    return Recaptcha(env.get('CATALOG_RECAPTCHA_SITE_KEY',''),env.get('CATALOG_RECAPTCHA_SECRET_KEY',''),hosts)
