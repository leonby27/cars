import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createAnalyticsApi} from '../server/abdrive/analytics.mjs';
const site={origin:'https://abdrive.ru'};
const headers={origin:site.origin,'content-type':'application/json','user-agent':'Mozilla/5.0','referer':site.origin+'/catalog'};
const request=(method='POST',extra={})=>({method,headers:{...headers,...extra},socket:{remoteAddress:'127.0.0.1'}});
const url=path=>new URL('/api/analytics/'+path,site.origin);
const event=extra=>({eventId:randomUUID(),visitorId:'visitor-12345678',sessionId:'session-12345678',eventName:'page_view',path:'/catalog',properties:{entrySource:'yandex.ru'},...extra});
test('RU analytics requires independent auth, rejects foreign origin and forged/expired cookies, limits login attempts',async()=>{
 let time=Date.now();const api=createAnalyticsApi({database:{query(){throw new Error('unexpected query');}},site,env:{ANALYTICS_PASSWORD:'private-ru-password'},now:()=>time});
 assert.equal((await api(request('GET'),url('trend'),()=>{})).status,401);
 assert.equal((await api(request('POST',{origin:'https://abcars.by'}),url('login'),async()=>({password:'private-ru-password'}))).status,403);
 assert.equal((await api(request(),url('login'),async()=>({password:'wrong'}))).status,401);
 const login=await api(request(),url('login'),async()=>({password:'private-ru-password'}));assert.equal(login.status,200);assert.match(login.headers['set-cookie'],/abdrive_analytics=.*HttpOnly; Secure; SameSite=Strict/);
 const cookie=login.headers['set-cookie'].split(';')[0];
 assert.equal((await api(request('GET',{cookie:cookie+'x'}),url('trend'),()=>{})).status,401);
 assert.equal((await api(request('GET',{cookie:cookie.replace('abdrive_analytics','abcars_analytics')}),url('trend'),()=>{})).status,401);
 time+=31*86400000;assert.equal((await api(request('GET',{cookie}),url('trend'),()=>{})).status,401);
 for(let i=0;i<10;i++)await api(request(),url('login'),async()=>({password:'wrong'}));
 assert.equal((await api(request(),url('login'),async()=>({password:'private-ru-password'}))).status,429);
});
test('RU tracking excludes owner, robots, internal analytics and non-page events; validates identifiers before storage',async()=>{
 const queries=[];const api=createAnalyticsApi({database:{query:async(...args)=>{queries.push(args);return {rowCount:1};}},site,env:{}});
 for(const [extra,body]of [[{'user-agent':'Googlebot'},event()],[{referer:site.origin+'/analytics'},event()],[{referer:site.origin+'/?nocount=1'},event()],[{},event({path:'/analytics'})],[{},event({path:'//foreign.example/'})],[{},event({eventName:'vehicle_view'})]]){
  assert.equal((await api(request('POST',extra),url('events'),async()=>body)).status,202);
 }
 assert.equal(queries.length,0);
 assert.equal((await api(request(),url('events'),async()=>event({visitorId:'bad'}))).status,400);
 assert.equal((await api(request(),url('events'),async()=>event({humanAction:true}))).status,202);assert.equal(queries.length,1);
 assert.equal(queries[0][1][3],'yandex.ru');assert.equal(queries[0][1][5],true);
});
test('RU visit SQL merges tabs, separates a later visit, confirms whole visits and fills empty days',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const connection=new URL(process.env.TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(connection.hostname));assert.equal(connection.pathname,'/abdrive');
 const client=new pg.Client({connectionString:connection.href});await client.connect();
 try{
  await client.query('BEGIN');await client.query((await readFile(new URL('../db/sites/abdrive/003_analytics.sql',import.meta.url),'utf8')).replace('CREATE TABLE IF NOT EXISTS analytics_events','CREATE TEMP TABLE analytics_events'));
  const api=createAnalyticsApi({database:client,site,env:{ANALYTICS_PASSWORD:'test'}});
  const login=await api(request(),url('login'),async()=>({password:'test'}));const cookie=login.headers['set-cookie'].split(';')[0];
  // Well inside yesterday in Moscow, regardless of the clock when tests run.
  await client.query(`INSERT INTO analytics_events(event_id,visitor_id,session_id,entry_source,device,human_action,created_at) VALUES
   ('test-event-1','visitor-a','tab-a','yandex.ru','desktop',false,((now() AT TIME ZONE 'Europe/Moscow')::date-1+time '12:00') AT TIME ZONE 'Europe/Moscow'),
   ('test-event-2','visitor-a','tab-b','internal','desktop',true,((now() AT TIME ZONE 'Europe/Moscow')::date-1+time '12:05') AT TIME ZONE 'Europe/Moscow'),
   ('test-event-3','visitor-a','tab-a','google.com','desktop',true,((now() AT TIME ZONE 'Europe/Moscow')::date-1+time '13:00') AT TIME ZONE 'Europe/Moscow'),
   ('test-event-4','visitor-b','tab-c','direct','desktop',false,((now() AT TIME ZONE 'Europe/Moscow')::date-1+time '12:00') AT TIME ZONE 'Europe/Moscow')`);
  const trend=await api(request('GET',{cookie}),url('trend?period=7'),()=>{});assert.equal(trend.status,200);assert.equal(trend.body.daily.length,7);
  const yesterday=trend.body.daily.at(-2);assert.equal(yesterday.visits,2);assert.equal(yesterday.yandex,1);assert.equal(yesterday.google,1);assert.equal(trend.body.daily.at(-1).visits,0);
  const body=event({visitorId:'visitor-abcdefgh',sessionId:'session-abcdefgh'});
  await api(request(),url('events'),async()=>body);await api(request(),url('events'),async()=>body);
  const human=await api(request(),url('human'),async()=>({...body,action:true}));assert.equal(human.body.confirmed,1);
  assert.equal((await api(request('GET',{cookie}),url('trend?period=7'),()=>{})).body.daily.at(-1).visits,1);
  assert.equal((await api(request('GET',{cookie}),url('trend?period=999'),()=>{})).status,400);
 }finally{await client.query('ROLLBACK');await client.end();}
});
