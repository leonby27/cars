import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../server/auth.mjs';
import { assignPartnerLead, authenticatePartner, createPartnerRegistrationRequest, createPartnerSession, markPartnerRegistrationsSeen, partnerCookie, partnerDashboard, partnerDirectory, partnerLeadSnapshot, sessionPartner, updatePartnerRequest } from '../server/partners.mjs';
import { isPartnerPath, partnerCounts, partnerPhoneLabel, partnerRegistrationValues, partnerRequestUpdate, partnerSourceUrl } from '../src/partner-model.js';
import { isSkippedVisit } from '../src/analytics.js';
import { isInternalAnalyticsPath } from '../server/analytics.mjs';

test('partner work statuses reject arbitrary fields and keep note bounds', () => {
 assert.deepEqual(partnerRequestUpdate({status:'in_progress',note:'  Called customer  ',partnerId:'other'}),{status:'in_progress',note:'Called customer'});
 assert.equal(partnerRequestUpdate({status:'admin',note:''}),null);
 assert.equal(partnerRequestUpdate({status:'new',note:'x'.repeat(2001)}),null);
 assert.equal(partnerRequestUpdate({status:'new'}),null);
 assert.deepEqual(partnerCounts([{status:'new'},{status:'waiting'},{status:'in_progress'},{status:'completed'},{status:'declined'}]),{new:1,active:2,completed:1});
});
test('partner contact masks preserve unsupported numbers and source links require HTTP(S)', () => {
 assert.equal(partnerPhoneLabel('+375291234567'), '+375 (29) 123-45-67');
 assert.equal(partnerPhoneLabel('+79991234567'), '+7 (999) 123-45-67');
 assert.equal(partnerPhoneLabel('+491234567890'), '+491234567890');
 assert.equal(partnerPhoneLabel('441234567890'), '441234567890');
 assert.equal(partnerPhoneLabel('+375291234567890'), '+375291234567890');
 assert.equal(partnerSourceUrl('https://global.che168.com/en/detail/123'), 'https://global.che168.com/en/detail/123');
 for(const url of ['javascript:alert(1)', 'file:///private/data', 'supplier-private', 'https://user:secret@che168.com/123']) assert.equal(partnerSourceUrl(url), '');
});
test('partner registration validates complete contact data and never issues access', async () => {
 assert.deepEqual(partnerRegistrationValues({name:'  New   Partner ',phone:'+375291234567',password:'ignored'}),{name:'New Partner',phone:'+375291234567'});
 for(const values of [null,{}, {name:' ',phone:'+375291234567'}, {name:'x'.repeat(101),phone:'+375291234567'}, {name:'Partner',phone:'+37529123'}, {name:'Partner',phone:375291234567}]) {
  assert.equal(partnerRegistrationValues(values),null);
  assert.deepEqual(await createPartnerRegistrationRequest(values,{db:{query:()=>assert.fail('invalid registration must not write')}}),{error:'invalid_registration'});
 }
 let calls=0;
 const db={query:async (sql,params)=>{calls++;assert.match(sql,/INSERT INTO partner_registration_requests/);assert.match(sql,/ON CONFLICT\(phone\) DO UPDATE/);assert.doesNotMatch(sql,/partner_accounts|partner_sessions|customer_orders|order_drafts/);assert.deepEqual(params.slice(1),['New Partner','+375291234567']);return {rows:[]};}};
 assert.deepEqual(await createPartnerRegistrationRequest({name:'New Partner',phone:'+375291234567'},{db}),{ok:true});
 assert.equal(calls,1);
});
test('owner partner directory includes registration requests separately from assigned customer leads', async () => {
 const request={id:'application',name:'Applicant',phone:'+375291234567',createdAt:'2026-10-08T10:00:00Z'};
 const directory=await partnerDirectory({db:{query:async(sql)=>({rows:sql.includes('partner_registration_requests')?[request]:[]})}});
 assert.deepEqual(directory,{partners:[],assignments:[],registrationRequests:[request]});
});
test('partner passwords validate server-side without returning password material', async () => {
 const credentials=await hashPassword('PartnerTest123');
 const row={id:'partner-one',login:'admin',name:'Partner',password_salt:credentials.salt,password_hash:credentials.hash};
 const db={query:async (sql,params)=>{assert.match(sql,/AND active/);assert.deepEqual(params,['admin']);return {rows:[row]};}};
 assert.deepEqual(await authenticatePartner({login:' ADMIN ',password:'PartnerTest123'},{db}),{id:'partner-one',login:'admin',name:'Partner'});
 assert.equal(await authenticatePartner({login:'admin',password:'wrong'},{db}),null);
 assert.equal(await authenticatePartner({login:'missing',password:'PartnerTest123'},{db:{query:async()=>({rows:[]})}}),null);
});
test('partner sessions store token hashes, enforce expiry and active access, and use separate secure cookies',async()=>{
 let hash;
 const token=await createPartnerSession('partner-one',{db:{query:async(sql,params)=>{assert.match(sql,/expires_at/);hash=params[0];assert.equal(params[1],'partner-one');}}});
 assert.equal(hash.length,64);assert.notEqual(hash,token);
 const request={headers:{cookie:`abcars_partner=${token}`,'x-forwarded-proto':'https'}};
 const partner=await sessionPartner(request,{db:{query:async(sql,params)=>{assert.match(sql,/s.expires_at>now\(\) AND a.active/);assert.equal(params[0],hash);return {rows:[{id:'partner-one',name:'Partner',login:'admin'}]};}}});
 assert.equal(partner.id,'partner-one');
 assert.match(partnerCookie(token,request),/HttpOnly; SameSite=Strict;.*Secure/);
 assert.match(partnerCookie('',request),/Max-Age=0/);
 assert.equal(await sessionPartner({headers:{cookie:'navostok_session=test; abcars_analytics=test'}},{db:{query:()=>assert.fail('must not accept customer or analytics session')}}),null);
 assert.equal(await sessionPartner({headers:{cookie:'abcars_partner=%zz'}},{db:{query:()=>assert.fail('malformed token')}}),null);
});
test('partners cannot load another partner requests or change ownership',async()=>{
 let calls=0;
 const db={query:async(sql,params)=>{calls++; if(calls===1)return {rows:[{id:'owner-one',login:'p1',name:'First'}]};assert.match(sql,/WHERE partner_id=\$1/);assert.deepEqual(params,['owner-one']);return {rows:[]};}};
 assert.deepEqual((await partnerDashboard({headers:{cookie:'abcars_partner=token'}},{db})).requests,[]);
 calls=0;
 const updateDb={query:async(sql,params)=>{calls++;if(calls===1)return {rows:[{id:'owner-one',login:'p1',name:'First'}]};assert.match(sql,/WHERE id=\$1 AND partner_id=\$2/);assert.deepEqual(params,['task-two','owner-one','completed','done']);return {rows:[]};}};
 assert.deepEqual(await updatePartnerRequest({headers:{cookie:'abcars_partner=token'}},'task-two',{status:'completed',note:'done',partnerId:'owner-two'},{db:updateDb}),{error:'request_not_found'});
 assert.deepEqual(await partnerDashboard({headers:{}},{db:{query:()=>assert.fail('anonymous query')}}),{error:'unauthorized'});
});
test('manual handoff copies only selected lead facts and resets previous partner progress on reassignment',async()=>{
 const lead={id:'draft-1',kind:'availability',customer:{name:'Client',phone:'+375291234567',passportNumber:'secret',password_hash:'secret'},car:{id:'kr-123',title:'Kia',image:'photo',sourceUrl:'supplier-private'},comment:'Check condition',createdAt:'2026-10-08T10:00:00Z',filters:null};
 const snapshot=partnerLeadSnapshot(lead);
 assert.doesNotMatch(JSON.stringify(snapshot),/passport|password|supplier-private/);
 assert.equal(partnerLeadSnapshot({...lead,car:{...lead.car,sourceUrl:'https://global.che168.com/en/detail/123'}}).car.sourceUrl,'https://global.che168.com/en/detail/123');
 let calls=0;
 const result=await assignPartnerLead(lead,'partner-two',' Verify ' ,{db:{query:async(sql,params)=>{calls++;if(calls===1)return {rowCount:1};assert.match(sql,/partner_id=EXCLUDED.partner_id RETURNING/);assert.match(sql,/ELSE 'new'/);assert.match(sql,/ELSE '' END/);assert.equal(params[1],'draft-1');assert.equal(params[2],'partner-two');assert.deepEqual(params[3],snapshot);assert.equal(params[4],'Verify');return {rows:[{lead_key:'draft-1',partner_id:'partner-two',status:'new'}]};}}});
 assert.equal(result.assignment.partner_id,'partner-two');
});
test('partner pages do not count as visitors and include only intended namespace',()=>{
 for(const path of ['/partner','/partner/','/partner?tab=requests','https://abcars.by/partner/private']){assert.equal(isPartnerPath(path),true);assert.equal(isSkippedVisit({hostname:'abcars.by',path}),true);assert.equal(isInternalAnalyticsPath(path),true);}
 assert.equal(isPartnerPath('/partnership'),false);
});

test('partner cards show demo label, contacts and explicit work details without loading customer app', async()=>{
 const {createTestServer}=await import('./vite-test-server.mjs');
 const react=(await import('@vitejs/plugin-react')).default;
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const vite=await createTestServer({configFile:false,plugins:[react()],server:{middlewareMode:true},appType:'custom'});
 try {
  const {PartnerRequestCard}=await vite.ssrLoadModule('/src/partner-page.jsx');
  const html=renderToStaticMarkup(createElement(PartnerRequestCard,{item:{id:'task-one',status:'new',demo:true,assignedAt:'2026-10-08T10:00:00Z',kind:'custom_search',customer:{name:'Demo',phone:''},car:{title:'Test car'},ownerNote:'Verify quote',note:''}}));
  assert.match(html,/Демонстрационная заявка/);assert.match(html,/Verify quote/);assert.match(html,/Подробнее/);assert.doesNotMatch(html,/href="tel:/);
  const assignedHtml=renderToStaticMarkup(createElement(PartnerRequestCard,{item:{id:'task-two',status:'new',demo:false,assignedAt:'2026-10-08T10:00:00Z',kind:'availability',customer:{name:'Client',phone:'+375291234567'},car:{id:'encar-123',title:'Assigned car',image:'https://ci.encar.com/carpicture/sample.jpg',sourceUrl:'https://www.encar.com/dc/dc_cardetailview.do?carid=123'},note:''}}));
  assert.match(assignedHtml,/src="\/photo\/encar\/v2\/w600\/carpicture\/sample\.jpg/);
  assert.match(assignedHtml,/alt="Assigned car"/);
  assert.doesNotMatch(assignedHtml,/href="tel:|375291234567|123-45-67/);
  assert.match(assignedHtml,/href="\/cars\/kr-123\?nocount=1"/);
  assert.match(assignedHtml,/href="https:\/\/www.encar.com\/dc\/dc_cardetailview.do\?carid=123" target="_blank" rel="nofollow noopener noreferrer"/);
  assert.doesNotMatch(assignedHtml,/Client/);
  assert.doesNotMatch(assignedHtml,/Демонстрационная заявка/);
  assert.doesNotMatch(assignedHtml,/Проверка автомобиля|Свяжитесь с клиентом и уточните задачу/);
 }finally{await vite.close();}
});

test('partner schema migration leaves catalog preparation and pricing independent',async()=>{
 const {deploymentPlan}=await import('../scripts/lib/deploy-plan.mjs');
 const plan=deploymentPlan(['server/partners.mjs','src/partner-model.js','db/migrations/049_partner_portal.sql','db/migrations/050_partner_registration_requests.sql','db/migrations/051_partner_registration_seen.sql','scripts/provision-partner.mjs']);
 assert.equal(plan.migrate,true);assert.equal(plan.mode,'presentation');assert.equal(plan.recalculatePrices,false);assert.equal(plan.checkDuplicates,false);
});

test('partner application read receipts validate versions and only acknowledge loaded applications', async () => {
 const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const updatedAt='2026-10-08 12:00:00.123456+00';
 for (const value of [null, {}, {requests:[]}, {requests:[{id:'bad',updatedAt}]}, {requests:[{id,updatedAt:'bad'}]}, {requests:Array(101).fill({id,updatedAt})}]) {
  assert.deepEqual(await markPartnerRegistrationsSeen(value,{db:{query:()=>assert.fail('invalid read receipt must not write')}}),{error:'invalid_requests'});
 }
 const result=await markPartnerRegistrationsSeen({requests:[{id,updatedAt}]},{db:{query:async (sql,params)=>{
  assert.match(sql,/request.id=viewed.id AND request.updated_at=viewed.updated_at AND request.seen_at IS NULL/);
  assert.deepEqual(params,[[id],[updatedAt]]);
  return {rowCount:1};
 }}});
 assert.deepEqual(result,{ok:true,viewed:1});
});
