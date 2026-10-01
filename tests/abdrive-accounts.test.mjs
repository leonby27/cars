import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createAbdriveHandler} from '../server/abdrive/handler.mjs';
import {getSiteProfile} from '../config/sites/index.mjs';

// An isolated schema in an explicitly selected local RU database; no production connections.
test('ABDrive account lifecycle, ownership, CSRF and atomic requests in its own database',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.equal(url.pathname,'/abdrive');
 const schema='account_test_'+randomUUID().replaceAll('-','');
 const admin=new pg.Client({connectionString:url.href});await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);
 const db=new pg.Pool({connectionString:url.href,options:`-c search_path=${schema}`,max:4});
 const site=getSiteProfile('abdrive');
 const car={id:'che168-1',title:'Test car',offer:{status:'estimated',currency:'RUB',totalAmount:4370000}};
 const catalog={get:async id=>['1',car.id].includes(id)?{car,sourceVersion:'test-v1'}:id==='sold'?{car:{...car,sold:true}}:null};
 const server=http.createServer(createAbdriveHandler({site,catalog,siteDatabase:db,consentVersion:'test-v1',log:()=>{}}));
 try{
  for(const file of ['001_leads.sql','002_accounts.sql'])await db.query(await readFile(new URL('../db/sites/abdrive/'+file,import.meta.url),'utf8'));
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,method='GET',body=undefined,cookie='',origin=site.origin)=>{
   const response=await fetch(base+path,{method,headers:{origin,cookie,'content-type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
   return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie'),cache:response.headers.get('cache-control')};
  };
  const reg={name:'Тест',phone:'89991234567',password:'test-password-2026',consent:true};
  assert.equal((await call('/api/auth/me')).body.user,null);
  assert.equal((await call('/api/account/orders')).status,401);
  assert.equal((await call('/api/auth/register','POST',reg,'','https://abcars.by')).status,403);
  assert.equal((await call('/api/auth/register','POST',{...reg,consent:false})).status,400);
  assert.equal((await call('/api/auth/register','POST',{...reg,phone:'+375291234567'})).status,400);
  const first=await call('/api/auth/register','POST',reg);assert.equal(first.status,201);assert.equal(first.body.user.phone,'+79991234567');
  assert.match(first.cookie,/^abdrive_session=.+HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);assert.equal(first.cache,'no-store');
  assert.equal(first.body.user.password_hash,undefined);const cookie=first.cookie.split(';')[0];
  assert.equal((await call('/api/auth/me','GET',undefined,cookie.replace('abdrive_session','navostok_session'))).body.user,null);
  assert.equal((await call('/api/auth/register','POST',reg)).status,409);
  const other=await call('/api/auth/register','POST',{...reg,phone:'+79991234568'});assert.equal(other.status,201);const otherCookie=other.cookie.split(';')[0];
  assert.equal((await call('/api/auth/login','POST',{phone:reg.phone,password:'incorrect-password'})).status,401);
  assert.equal((await call('/api/account','PATCH',{name:'Тестовый профиль',email:'test@example.test',telegram:'@test',city:'Москва',preferredContact:'telegram'},cookie)).body.user.city,'Москва');
  assert.equal((await call('/api/account/favorites/che168-1','PUT',undefined,cookie)).status,200);
  assert.deepEqual((await call('/api/account/favorites','GET',undefined,cookie)).body.ids,['che168-1']);
  assert.deepEqual((await call('/api/account/favorites','GET',undefined,otherCookie)).body.ids,[]);
  const keys=['type','brand','model','bodyType','color','yearMin','yearMax','mileage','priceMin','priceMax','drive','owners','battery','condition','excludeBrand','excludeModel','excludeBodyType','excludeColor','excludeType','excludeDrive','sort'];
  const lists=new Set(['model','bodyType','color','excludeBrand','excludeModel','excludeBodyType','excludeColor','excludeType','excludeDrive']);
  const filters=Object.fromEntries(keys.map(key=>[key,lists.has(key)?[]:'Все']));
  const search=await call('/api/account/searches','POST',{title:'Мой поиск',filters},cookie);assert.equal(search.status,201);
  assert.equal((await call('/api/account/searches/'+search.body.search.id,'PATCH',{title:'Другой',filters},otherCookie)).status,404);
  assert.equal((await call('/api/account/searches/'+search.body.search.id,'PATCH',{title:'Обновлённый поиск',filters:{...filters,brand:'BMW'}},cookie)).body.search.title,'Обновлённый поиск');
  await call('/api/account/searches/'+search.body.search.id,'DELETE',undefined,otherCookie);
  assert.equal((await call('/api/account/searches','GET',undefined,cookie)).body.searches.length,1);
  assert.equal((await call('/api/account/orders','POST',{listingId:'sold'},cookie)).status,404);
  const created=await call('/api/account/orders','POST',{listingId:'1',snapshot:{car:{offer:{totalAmount:1}}}},cookie);assert.equal(created.status,201);
  const order=created.body.order;assert.match(order.orderNumber,/^AD-/);assert.equal(order.car.offer.totalAmount,4370000);
  assert.equal((await call('/api/account/orders','POST',{listingId:'1'},cookie)).body.order.id,order.id);
  assert.equal((await call('/api/account/orders','GET',undefined,otherCookie)).body.orders.length,0);
  const patch={action:'request_availability_check',comment:'Тест',consent:true};
  assert.equal((await call('/api/account/orders/'+order.id,'PATCH',patch,otherCookie)).status,404);
  assert.equal((await call('/api/account/orders/'+order.id,'DELETE',undefined,otherCookie)).status,404);
  assert.equal((await call('/api/account/orders/'+order.id,'PATCH',patch,cookie,'https://abcars.by')).status,403);
  assert.equal((await call('/api/account/orders/'+order.id,'PATCH',{...patch,consent:false},cookie)).status,400);
  // Failure to enqueue must roll back both the lead and requested state.
  await db.query('ALTER TABLE lead_notifications RENAME TO paused_notifications');
  assert.equal((await call('/api/account/orders/'+order.id,'PATCH',patch,cookie)).status,503);
  assert.equal((await db.query('SELECT count(*)::int n FROM leads')).rows[0].n,0);
  assert.equal((await call('/api/account/orders','GET',undefined,cookie)).body.orders[0].availabilityStatus,'decision');
  await db.query('ALTER TABLE paused_notifications RENAME TO lead_notifications');
  const sent=await Promise.all([call('/api/account/orders/'+order.id,'PATCH',patch,cookie),call('/api/account/orders/'+order.id,'PATCH',patch,cookie)]);
  for(const response of sent){assert.equal(response.status,200);assert.equal(response.body.order.availabilityStatus,'requested');}
  assert.equal((await db.query('SELECT count(*)::int n FROM leads')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM lead_notifications')).rows[0].n,1);
  const lead=(await db.query('SELECT * FROM leads')).rows[0];assert.equal(lead.destination_id,'moscow');assert.equal(lead.customer_id,first.body.user.id);
  assert.equal((await call('/api/auth/logout','POST',undefined,cookie)).status,200);
  assert.equal((await call('/api/auth/me','GET',undefined,cookie)).body.user,null);
  const login=await call('/api/auth/login','POST',{phone:reg.phone,password:reg.password});assert.equal(login.status,200);const logged=login.cookie.split(';')[0];
  assert.equal((await call('/api/account/orders','GET',undefined,logged)).body.orders.length,1);
  assert.equal((await call('/api/account','DELETE',{password:'bad'},logged)).status,400);
  assert.equal((await call('/api/account','DELETE',{password:reg.password},logged)).status,200);
  assert.equal((await call('/api/auth/me','GET',undefined,logged)).body.user,null);
  for(const table of ['customer_orders','customer_favorites','customer_searches','leads','lead_notifications'])assert.equal((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n,0,table);
  assert.equal((await call('/api/auth/me','GET',undefined,otherCookie)).body.user.id,other.body.user.id);
  let last;for(let i=0;i<12;i++)last=await call('/api/auth/login','POST',{phone:reg.phone,password:'incorrect-password'});assert.equal(last.status,429);
 }finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
 }
});
