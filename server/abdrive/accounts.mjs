import {randomUUID,randomBytes,createHash,scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {normalizeRussianPhone} from '../../src/markets/contact.js';
import {normalizeSearchFilters} from '../search-filters.mjs';
import {saveLead} from './leads.mjs';

const scrypt=promisify(derive),ttl=30*24*3600;
const hash=value=>createHash('sha256').update(value).digest('hex');
const result=(status,body,headers={})=>({status,body,headers});
const fail=(status,error)=>{throw Object.assign(new Error(error),{status});};
const safeUser=row=>({id:row.id,name:row.name,phone:row.phone,email:row.email,telegram:row.telegram,city:row.city,preferredContact:row.preferred_contact,createdAt:row.created_at});
const searchRow=row=>({id:Number(row.id),title:row.title,filters:row.filters,createdAt:row.created_at});
const orderRow=row=>({id:Number(row.id),orderNumber:`AD-${new Date(row.created_at).getUTCFullYear()}-${String(row.id).padStart(6,'0')}`,
 listingId:row.listing_id,car:row.snapshot.car,availabilityStatus:row.availability_status,availabilityComment:row.availability_comment,
 availabilityRequestedAt:row.availability_requested_at,contactName:row.contact_name,contactPhone:row.contact_phone,contactMethods:row.contact_methods,
 contactSavedAt:row.contact_saved_at,contactConsentAt:row.contact_consent_at,inspectionStatus:'decision',contractStatus:'locked',paymentStatus:'locked',
 createdAt:row.created_at,updatedAt:row.updated_at});
const tokenOf=request=>String(request.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith('abdrive_session='))?.slice(16)||'';
async function validPassword(password,row){
 const actual=await scrypt(password,row?.password_salt||'abdrive-missing-account',64);
 const expected=row?Buffer.from(row.password_hash,'hex'):Buffer.alloc(64);
 return expected.length===actual.length&&timingSafeEqual(actual,expected)&&Boolean(row);
}

// No BY pool/imports: every private query goes through the injected RU database.
export function createAccountApi({database,catalog,site,consentVersion=null,registrationConsentVersion=consentVersion}){
 const cookie=(token,seconds=ttl)=>`abdrive_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${site.origin.startsWith('https:')?'; Secure':''}`;
 async function session(request){
  const token=tokenOf(request);if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  return (await database.query(`SELECT a.* FROM customer_sessions s JOIN customer_accounts a ON a.id=s.customer_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(token)])).rows[0]||null;
 }
 async function rate(key,limit=10){
  const row=(await database.query(`INSERT INTO account_rate_limits(key,hits,expires_at) VALUES($1,1,now()+interval '15 minutes')
   ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN account_rate_limits.expires_at<=now() THEN 1 ELSE account_rate_limits.hits+1 END,
    expires_at=CASE WHEN account_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE account_rate_limits.expires_at END RETURNING hits`,[hash(key)])).rows[0];
  if(row.hits>limit)fail(429,'too_many_requests');
 }
 async function openSession(account){
  const token=randomBytes(32).toString('base64url');
  await database.query(`INSERT INTO customer_sessions(token_hash,customer_id,expires_at) VALUES($1,$2,now()+($3*interval '1 second'))`,[hash(token),account.id,ttl]);
  return {'set-cookie':cookie(token)};
 }
 async function transaction(fn){
  const client=await database.connect();
  try{await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 return async(request,url,readBody)=>{
  const path=url.pathname,method=request.method;
  const report=path.match(/^\/api\/cars\/([a-zA-Z0-9-]{1,100})\/report$/);
  if(!report&&!/^\/api\/(auth(?:\/|$)|account(?:\/|$))/.test(path))return null;
  try{
   const mutation=!['GET','HEAD'].includes(method);
   if(mutation){
    if(request.headers.origin!==site.origin)fail(403,'origin_not_allowed');
    if(['POST','PATCH','PUT'].includes(method)&&!/^application\/json(?:;|$)/i.test(request.headers['content-type']||'')&&!(method==='PUT'&&path.startsWith('/api/account/favorites/'))&&path!=='/api/auth/logout')fail(415,'json_required');
    await rate(`write:${request.headers['x-real-ip']||request.socket?.remoteAddress||'unknown'}`,120);
   }
   if(method==='POST'&&['/api/auth/register','/api/auth/login'].includes(path)){
    const body=await readBody(request),phone=normalizeRussianPhone(body?.phone),password=typeof body?.password==='string'?body.password:'';
    await rate(`auth-ip:${request.headers['x-real-ip']||request.socket?.remoteAddress||'unknown'}`);
    if(!phone)fail(400,'invalid_phone');
    await rate(`auth-phone:${phone}`);
    if(password.length<8||password.length>128)fail(400,'invalid_password');
    let account;
    if(path.endsWith('/register')){
     if(!registrationConsentVersion)fail(503,'account_not_configured');
     if(body.consent!==true)fail(400,'consent_required');
     const name=String(body.name||'').trim();if(name.length<2||name.length>80)fail(400,'invalid_name');
     const salt=randomBytes(16).toString('hex'),passwordHash=(await scrypt(password,salt,64)).toString('hex');
     account=(await database.query(`INSERT INTO customer_accounts(id,name,phone,password_salt,password_hash,consent_version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(phone) DO NOTHING RETURNING *`,[randomUUID(),name,phone,salt,passwordHash,registrationConsentVersion])).rows[0];
     if(!account)fail(409,'phone_already_registered');
    }else{
     account=(await database.query('SELECT * FROM customer_accounts WHERE phone=$1',[phone])).rows[0];
     if(!await validPassword(password,account))fail(401,'invalid_credentials');
    }
    return result(path.endsWith('/register')?201:200,{user:safeUser(account)},await openSession(account));
   }
   if(method==='GET'&&path==='/api/auth/me'){const account=await session(request);return result(200,{user:account?safeUser(account):null});}
   if(method==='POST'&&path==='/api/auth/logout'){
    await database.query('DELETE FROM customer_sessions WHERE token_hash=$1',[hash(tokenOf(request))]);
    return result(200,{ok:true},{'set-cookie':cookie('',0)});
   }
   const account=await session(request);if(!account)fail(401,'unauthorized');
   if(report&&method==='GET'){const groups=await catalog.report(report[1]);if(!groups)fail(404,'not_found');return result(200,{groups});}
   if(path==='/api/account'&&method==='PATCH'){
    const body=await readBody(request);
    const fields={name:String(body?.name||'').trim(),email:String(body?.email||'').trim().toLowerCase(),telegram:String(body?.telegram||'').trim().replace(/^@+/,''),city:String(body?.city||'').trim(),preferredContact:body?.preferredContact||'phone'};
    if(fields.name.length<2||fields.name.length>80)fail(400,'invalid_name');
    if(fields.email&&(fields.email.length>160||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)))fail(400,'invalid_email');
    if(fields.telegram.length>80||fields.city.length>120||!['phone','email','telegram'].includes(fields.preferredContact))fail(400,'invalid_profile');
    if(fields.preferredContact!=='phone'&&!fields[fields.preferredContact])fail(400,fields.preferredContact+'_required');
    const updated=(await database.query(`UPDATE customer_accounts SET name=$2,email=$3,telegram=$4,city=$5,preferred_contact=$6,updated_at=now() WHERE id=$1 RETURNING *`,[account.id,...Object.values(fields)])).rows[0];
    return result(200,{user:safeUser(updated)});
   }
   if(path==='/api/account'&&method==='DELETE'){
    await rate(`delete:${account.id}`);
    const body=await readBody(request),password=String(body?.password||'');
    if(password.length>128||!await validPassword(password,account))fail(400,'invalid_credentials');
    await database.query('DELETE FROM customer_accounts WHERE id=$1',[account.id]);
    return result(200,{ok:true},{'set-cookie':cookie('',0)});
   }
   if(path==='/api/account/favorites'&&method==='GET')return result(200,{ids:(await database.query('SELECT listing_id FROM customer_favorites WHERE customer_id=$1 ORDER BY created_at DESC',[account.id])).rows.map(row=>row.listing_id)});
   const favorite=path.match(/^\/api\/account\/favorites\/([a-zA-Z0-9-]{1,100})$/);
   if(favorite&&['PUT','DELETE'].includes(method)){
    if(method==='PUT'){
     const listing=await catalog.get(favorite[1]);if(!listing)fail(404,'listing_not_found');
     await database.query('INSERT INTO customer_favorites(customer_id,listing_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[account.id,listing.car.id]);
    }else await database.query('DELETE FROM customer_favorites WHERE customer_id=$1 AND listing_id=$2',[account.id,favorite[1]]);
    return result(200,{ok:true});
   }
   if(path==='/api/account/searches'&&method==='GET')return result(200,{searches:(await database.query('SELECT * FROM customer_searches WHERE customer_id=$1 ORDER BY created_at DESC,id DESC',[account.id])).rows.map(searchRow)});
   if(path==='/api/account/searches'&&method==='POST'){
    const body=await readBody(request),title=String(body?.title||'').trim(),filters=normalizeSearchFilters(body?.filters);
    if(!title||title.length>160)fail(400,'invalid_title');if(!filters)fail(400,'invalid_filters');
    const saved=await transaction(async client=>{
     await client.query('SELECT id FROM customer_accounts WHERE id=$1 FOR UPDATE',[account.id]);
     const existing=(await client.query('SELECT * FROM customer_searches WHERE customer_id=$1 AND filters=$2',[account.id,filters])).rows[0];
     if(existing)return existing;
     const count=(await client.query('SELECT count(*)::int n FROM customer_searches WHERE customer_id=$1',[account.id])).rows[0].n;
     if(count>=30)fail(409,'too_many_searches');
     return (await client.query('INSERT INTO customer_searches(customer_id,title,filters) VALUES($1,$2,$3) RETURNING *',[account.id,title,filters])).rows[0];
    });return result(201,{search:searchRow(saved)});
   }
   const search=path.match(/^\/api\/account\/searches\/(\d{1,15})$/);
   if(search&&method==='PATCH'){
    const body=await readBody(request),title=String(body?.title||'').trim(),filters=normalizeSearchFilters(body?.filters);
    if(!title||title.length>160)fail(400,'invalid_title');if(!filters)fail(400,'invalid_filters');
    try{
     const updated=(await database.query('UPDATE customer_searches SET title=$3,filters=$4 WHERE customer_id=$1 AND id=$2 RETURNING *',[account.id,search[1],title,filters])).rows[0];
     if(!updated)fail(404,'search_not_found');return result(200,{search:searchRow(updated)});
    }catch(error){if(error.code==='23505')fail(409,'search_already_exists');throw error;}
   }
   if(search&&method==='DELETE'){await database.query('DELETE FROM customer_searches WHERE customer_id=$1 AND id=$2',[account.id,search[1]]);return result(200,{ok:true});}
   if(path==='/api/account/orders'&&method==='GET')return result(200,{orders:(await database.query('SELECT * FROM customer_orders WHERE customer_id=$1 ORDER BY updated_at DESC',[account.id])).rows.map(orderRow)});
   if(path==='/api/account/orders'&&method==='POST'){
    const body=await readBody(request),listingId=String(body?.listingId||'');if(!/^[a-zA-Z0-9-]{1,100}$/.test(listingId))fail(400,'invalid_listing_id');
    const listing=await catalog.get(listingId);if(!listing||listing.car.available===false||listing.car.sold||listing.car.status==='sold')fail(404,'listing_not_found');
    const snapshot={siteId:site.id,market:site.market,...listing,assignment:'owner'};
    const row=(await database.query(`INSERT INTO customer_orders(customer_id,listing_id,snapshot,request_key) VALUES($1,$2,$3,$4) ON CONFLICT(customer_id,listing_id) DO UPDATE SET updated_at=now() RETURNING *`,[account.id,listing.car.id,snapshot,randomUUID()])).rows[0];
    return result(201,{order:orderRow(row)});
   }
   const order=path.match(/^\/api\/account\/orders\/(\d{1,15})$/);
   if(order&&method==='DELETE'){
    const deleted=await database.query('DELETE FROM customer_orders WHERE customer_id=$1 AND id=$2 RETURNING id',[account.id,order[1]]);
    if(!deleted.rowCount)fail(404,'order_not_found');return result(200,{ok:true,id:Number(order[1])});
   }
   if(order&&method==='PATCH'){
    const body=await readBody(request);
    const saved=await transaction(async client=>{
     const row=(await client.query('SELECT * FROM customer_orders WHERE customer_id=$1 AND id=$2 FOR UPDATE',[account.id,order[1]])).rows[0];
     if(!row)fail(404,'order_not_found');
     if(body?.action==='request_availability_check'){
      if(row.availability_status!=='decision')return row;
      if(!consentVersion)fail(503,'lead_intake_not_configured');
      if(body.consent!==true)fail(400,'consent_required');
      const comment=String(body.comment||'').trim();if(comment.length>600)fail(400,'invalid_availability_comment');
      await saveLead(client,{requestKey:row.request_key,name:row.contact_name||account.name,phone:row.contact_phone||account.phone,listingId:row.listing_id,comment},
       {snapshot:row.snapshot,consentVersion,destination:site.destination,transaction:false});
      await client.query('UPDATE leads SET customer_id=$2 WHERE request_key=$1',[row.request_key,account.id]);
      return (await client.query(`UPDATE customer_orders SET availability_status='requested',availability_comment=$3,availability_requested_at=now(),updated_at=now() WHERE customer_id=$1 AND id=$2 RETURNING *`,[account.id,row.id,comment])).rows[0];
     }
     if(body?.action==='save_order_contact'){
      const name=String(body.contactName||'').trim(),phone=normalizeRussianPhone(body.contactPhone),methods=body.contactMethods;
      if(name.length<2||name.length>80||!phone)fail(400,'invalid_order_contact');
      if(!Array.isArray(methods)||!methods.length||methods.length>3||methods.some(value=>!['phone','telegram','viber'].includes(value)))fail(400,'invalid_contact_methods');
      if(body.consent!==true)fail(400,'consent_required');
      return (await client.query(`UPDATE customer_orders SET contact_name=$3,contact_phone=$4,contact_methods=$5,contact_saved_at=now(),contact_consent_at=now(),updated_at=now() WHERE customer_id=$1 AND id=$2 RETURNING *`,[account.id,row.id,name,phone,[...new Set(methods)]])).rows[0];
     }
     fail(400,'invalid_order_action');
    });return result(200,{order:orderRow(saved)});
   }
   return result(404,{error:'not_found'});
  }catch(error){if(error.status)return result(error.status,{error:error.message});throw error;}
 };
}
