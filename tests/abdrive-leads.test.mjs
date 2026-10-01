import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {normalizeRussianPhone} from '../src/markets/contact.js';
import {normalizeLead,saveLead,claimNotification,finishNotification} from '../server/abdrive/leads.mjs';
import {deliverNextLead} from '../server/abdrive/notifications.mjs';
import {databaseConfig} from '../server/database-config.mjs';
import {getSiteProfile} from '../config/sites/index.mjs';

const input=()=>({requestKey:randomUUID(),name:'Тест',phone:'8 (999) 123-45-67',consent:true,listingId:'che168-1'});
const options={snapshot:{listing:{id:'che168-1'},offer:{status:'unavailable'}},consentVersion:'test-only',destination:{id:'moscow',name:'Москва'}};

test('RU phones and consent are validated; customer-supplied quote is ignored',()=>{
 for(const value of ['+7 999 1234567','89991234567','9991234567'])assert.equal(normalizeRussianPhone(value),'+79991234567');
 assert.equal(normalizeRussianPhone('+375291234567'),null);
 assert.equal(normalizeRussianPhone('123'),null);
 assert.throws(()=>normalizeLead({...input(),consent:false}),/consent_required/);
 assert.throws(()=>normalizeLead({...input(),requestKey:'oops'}),/invalid_request_key/);
 assert.equal(normalizeLead({...input(),snapshot:{total:1},price:1}).snapshot,undefined);
 assert.equal(normalizeLead(input()).phone,'+79991234567');
});

test('RU connections are explicit and cannot reuse catalog database for private data',()=>{
 const site=getSiteProfile('abdrive');
 assert.throws(()=>databaseConfig(site,{DATABASE_URL:'postgres://localhost/by'}),/explicit/);
 assert.throws(()=>databaseConfig(site,{CATALOG_DATABASE_URL:'postgres://reader@localhost/catalog',SITE_DATABASE_URL:'postgres://writer@localhost/catalog'}),/different database name/);
 assert.deepEqual(databaseConfig(site,{CATALOG_DATABASE_URL:'postgres://reader@localhost/catalog',SITE_DATABASE_URL:'postgres://writer@localhost/abdrive'}),{catalogUrl:'postgres://reader@localhost/catalog',siteUrl:'postgres://writer@localhost/abdrive'});
});

test('PostgreSQL: lead and outbox are atomic, repeated requests are deduplicated, retries retain delivery', {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
 const db=new pg.Client({connectionString:url.href});await db.connect();
 const schema='abdrive_lead_test_'+randomUUID().replaceAll('-','');
 try{
  await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET search_path TO ${schema}`);
  await db.query(await readFile(new URL('../db/sites/abdrive/001_leads.sql',import.meta.url),'utf8'));
  const lead=normalizeLead(input());
  await saveLead(db,lead,options);await saveLead(db,lead,options);
  assert.equal((await db.query('SELECT count(*)::int n FROM leads')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM lead_notifications')).rows[0].n,1);
  assert.deepEqual((await db.query('SELECT snapshot FROM leads')).rows[0].snapshot,options.snapshot);
  await assert.rejects(saveLead(db,{...lead,name:'Другой'},options),/request_key_conflict/);
  const job=await claimNotification(db);assert.ok(job);assert.equal(await claimNotification(db),null);
  await finishNotification(db,job,{sent:false,error:'timeout'});assert.equal(await claimNotification(db),null);
  await db.query("UPDATE lead_notifications SET available_at=now()-interval '1 second'");
  const retry=await claimNotification(db);assert.equal(retry.attempts,2);
  await finishNotification(db,job,{sent:true});assert.equal((await db.query('SELECT sent_at FROM lead_notifications')).rows[0].sent_at,null);
  await finishNotification(db,retry,{sent:true});assert.equal(await claimNotification(db),null);
  await saveLead(db,normalizeLead(input()),{...options,snapshot:{car:{id:'che168-1',title:'Тестовая машина',mileage:100,offer:{status:'unavailable',currency:'RUB',totalAmount:null}}}});
  let sentMessage;
  const delivery={site:getSiteProfile('abdrive'),token:'local-test-token',chatId:'123',send:async(method,payload)=>{assert.equal(method,'sendMessage');sentMessage=payload.text;return {ok:false};}};
  assert.equal(await deliverNextLead(db,delivery),false);
  await db.query("UPDATE lead_notifications SET available_at=now()-interval '1 second' WHERE sent_at IS NULL");
  assert.equal(await deliverNextLead(db,{...delivery,send:async()=>({ok:true})}),true);
  assert.match(sentMessage,/ABDrive/);assert.match(sentMessage,/Москва/);assert.doesNotMatch(sentMessage,/abcars\.by|Минск|\/analytics/);
  assert.equal((await db.query('SELECT count(*)::int n FROM lead_notifications WHERE sent_at IS NULL')).rows[0].n,0);
  await db.query('ALTER TABLE lead_notifications RENAME TO paused_notifications');
  await assert.rejects(saveLead(db,normalizeLead(input()),options),/does not exist/);
  assert.equal((await db.query('SELECT count(*)::int n FROM leads')).rows[0].n,2,'failed notification insert must roll back the lead');
 }finally{await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await db.end();}
});
