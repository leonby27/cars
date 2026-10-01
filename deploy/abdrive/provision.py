#!/usr/bin/env python3
"""One-time, additive ABDrive provisioning on its existing Timeweb host.
Creates only new roles/database/service user. Refuses existing targets.
No BY migrations, business records, service restart or environment copy.
"""
import json, os, pathlib, secrets, subprocess

def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs).stdout.strip()
def sql(query, database='postgres'):
    return run(['runuser','-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-At','-d',database],input=query)

if os.geteuid()!=0:
    raise SystemExit('Run as root on the target server')
env=pathlib.Path('/etc/abdrive/environment')
if env.exists() or sql("SELECT datname FROM pg_database WHERE datname='abdrive'") or sql("SELECT rolname FROM pg_roles WHERE rolname IN ('abdrive_app','abdrive_catalog')"):
    raise SystemExit('ABDrive resources already exist; inspect them instead of overwriting credentials')
if sql("SELECT datname FROM pg_database WHERE datname='abcars'")!='abcars':
    raise SystemExit('Expected shared catalog database not found')
# Verify tables before creating any resources.
if sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('catalog_listings','vehicles','listing_media')",'abcars')!='3':
    raise SystemExit('Catalog schema does not match')
reader=secrets.token_hex(32); writer=secrets.token_hex(32)
# Roles are unrelated to the BY owner and receive only these three read grants.
sql(f"CREATE ROLE abdrive_catalog LOGIN NOINHERIT CONNECTION LIMIT 3 PASSWORD '{reader}'; CREATE ROLE abdrive_app LOGIN NOINHERIT CONNECTION LIMIT 6 PASSWORD '{writer}';")
sql("ALTER ROLE abdrive_catalog SET default_transaction_read_only=on; ALTER ROLE abdrive_catalog SET statement_timeout='5s'; GRANT CONNECT ON DATABASE abcars TO abdrive_catalog;")
sql("GRANT USAGE ON SCHEMA public TO abdrive_catalog; GRANT SELECT ON catalog_listings,vehicles,listing_media TO abdrive_catalog;",'abcars')
sql('CREATE DATABASE abdrive OWNER abdrive_app;')
sql('REVOKE ALL ON DATABASE abdrive FROM PUBLIC; GRANT CONNECT ON DATABASE abdrive TO abdrive_app;')
sql('REVOKE CREATE ON SCHEMA public FROM PUBLIC;','abdrive')
if subprocess.run(['id','abdrive'],capture_output=True).returncode:
    run(['useradd','--system','--home-dir','/nonexistent','--shell','/usr/sbin/nologin','abdrive'])
env.parent.mkdir(mode=0o750,parents=True,exist_ok=True)
run(['chown','root:abdrive',str(env.parent)])
content='\n'.join(['SITE_ID=abdrive','VITE_SITE_ID=abdrive','SITE_URL=https://abdrive.ru','API_PORT=8788',f'CATALOG_DATABASE_URL=postgres://abdrive_catalog:{reader}@127.0.0.1:5432/abcars',f'SITE_DATABASE_URL=postgres://abdrive_app:{writer}@127.0.0.1:5432/abdrive',''])
fd=os.open(env,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o640)
with os.fdopen(fd,'w') as f:f.write(content)
run(['chown','root:abdrive',str(env)])
print(json.dumps({'database':'abdrive','catalog_role':'read only, 3 connections','credentials':'/etc/abdrive/environment','by_business_records_changed':False}))
