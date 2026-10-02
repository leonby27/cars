import '../config/load-env.mjs';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {resolveSiteProfile} from '../config/sites/index.mjs';
import {databaseConfig} from '../server/database-config.mjs';
const site=resolveSiteProfile(process.env);
if(site.id!=='abdrive')throw new Error('Only SITE_ID=abdrive is accepted');
const config=databaseConfig(site,process.env);
const target=new URL(config.siteUrl);
if(decodeURIComponent(target.pathname)!=='/abdrive')throw new Error('Migration is restricted to the dedicated abdrive database');
const client=new pg.Client({connectionString:config.siteUrl});
await client.connect();
try{
 await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock(hashtext('abdrive-schema'))");
 const tables=await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
 const allowed=new Set(['site_identity','leads','lead_notifications','market_offers','customer_accounts','customer_sessions','customer_favorites','customer_searches','customer_orders','account_rate_limits','analytics_events']);
 if(tables.rows.some(row=>!allowed.has(row.tablename)))throw new Error('Unexpected tables: refusing to migrate an unrelated database');
 if(tables.rows.some(row=>row.tablename==='site_identity')){
  const identity=await client.query('SELECT site_id FROM site_identity WHERE singleton');
  if(identity.rows[0]?.site_id!=='abdrive')throw new Error('Unexpected site identity');
 }
 await client.query(await readFile(new URL('../db/sites/abdrive/001_leads.sql',import.meta.url),'utf8'));
 await client.query(await readFile(new URL('../db/market/001_offers.sql',import.meta.url),'utf8'));
 await client.query(await readFile(new URL('../db/sites/abdrive/002_accounts.sql',import.meta.url),'utf8'));
 await client.query(await readFile(new URL('../db/sites/abdrive/003_analytics.sql',import.meta.url),'utf8'));
 await client.query('COMMIT');
 console.log('ABDrive schema ready; shared catalog unchanged');
}catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
