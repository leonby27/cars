import {createHmac, timingSafeEqual} from 'node:crypto';

const COOKIE='abdrive_analytics';
const TTL=30*86400;
const BOT=/bot|crawl|spider|headless|playwright|puppeteer|selenium|lighthouse|preview|monitor|claude\//i;
const privatePath=value=>/^\/analytics(?:\/|$)/.test(value);
const same=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(value);
const result=(status,body,headers={})=>({status,body,headers});
export function createAnalyticsApi({database,site,env=process.env,now=()=>Date.now()}){
 const password=()=>String(env.ANALYTICS_PASSWORD||'');
 const signature=value=>createHmac('sha256',env.ANALYTICS_SECRET||password()).update(value).digest('hex');
 const cookie=(token,age=TTL)=>`${COOKIE}=${token}; Path=/api/analytics; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
 const authenticated=request=>{
  if(!password())return false;
  const token=String(request.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
  const [expires,sign]=token.split('.');
  return /^\d+$/.test(expires||'')&&Number(expires)>now()&&Number(expires)<=now()+TTL*1000&&same(signature(expires),sign||'');
 };
 const requests=new Map();
 const allow=(request,type,limit,window)=>{
  const time=now();for(const [key,value]of requests)if(value.until<=time)requests.delete(key);
  const key=type+':'+(request.headers['x-real-ip']||request.socket?.remoteAddress||'unknown');
  if(requests.size>=20000&&!requests.has(key))return false;
  const entry=requests.get(key)||{n:0,until:time+window};entry.n++;requests.set(key,entry);return entry.n<=limit;
 };
 return async(request,url,readBody)=>{
  if(!url.pathname.startsWith('/api/analytics/'))return null;
  const endpoint=url.pathname.slice(15);
  if(request.method==='POST'){
   if(request.headers.origin!==site.origin)return result(403,{error:'origin_not_allowed'});
   if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']||'')&&endpoint!=='logout')return result(415,{error:'json_required'});
   if(endpoint==='login'){
    if(!allow(request,'login',10,15*60000))return result(429,{error:'too_many_requests'});
    if(!password())return result(503,{error:'analytics_not_configured'});
    const body=await readBody(request);
    if(!same(password(),body?.password||''))return result(401,{error:'unauthorized'});
    const expires=String(now()+TTL*1000);return result(200,{ok:true},{'set-cookie':cookie(expires+'.'+signature(expires))});
   }
   if(endpoint==='logout')return result(200,{ok:true},{'set-cookie':cookie('',0)});
   if(endpoint==='events'||endpoint==='human'){
    if(!allow(request,'events',180,60000))return result(429,{error:'too_many_requests'});
    const ref=request.headers.referer||'';
    if(BOT.test(request.headers['user-agent']||'')||privatePath(new URL(ref||'/',site.origin).pathname)||new URL(ref||'/',site.origin).searchParams.get('nocount')==='1')return result(202,{ok:true,confirmed:0,retry:false});
    const body=await readBody(request);
    if(!id(body?.visitorId)||!id(body?.sessionId))return result(400,{error:'invalid_event'});
    if(endpoint==='human'){
     const confirmed=await database.query('UPDATE analytics_events SET human_action=true WHERE visitor_id=$1 AND session_id=$2 AND created_at>now()-interval \'24 hours\' AND $3::boolean',[body.visitorId,body.sessionId,body.action===true]);
     return result(200,{confirmed:confirmed.rowCount});
    }
    if(body.eventName!=='page_view')return result(202,{ok:true});
    if(!id(body.eventId)||typeof body.path!=='string'||!body.path.startsWith('/')||body.path.length>2048)return result(400,{error:'invalid_event'});
    const path=new URL(body.path,site.origin);
    if(path.origin!==site.origin||privatePath(path.pathname)||path.searchParams.get('nocount')==='1')return result(202,{ok:true});
    const source=String(body.properties?.entrySource||'direct').toLowerCase().slice(0,160);
    const device=request.headers['sec-ch-ua-mobile']==='?1'||/mobile|android|iphone|ipad/i.test(request.headers['user-agent']||'')?'mobile':'desktop';
    await database.query('INSERT INTO analytics_events(event_id,visitor_id,session_id,entry_source,device,human_action) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id) DO NOTHING',[body.eventId,body.visitorId,body.sessionId,source,device,body.humanAction===true]);
    return result(202,{ok:true});
   }
  }
  if(request.method==='GET'&&endpoint==='trend'){
   if(!authenticated(request))return result(401,{error:'unauthorized'});
   const period=url.searchParams.get('period')||'30';
   if(!['7','30','90'].includes(period))return result(400,{error:'invalid_period'});
   // Tabs opened within 30 minutes form one visit. Human activity confirms the
   // whole visit; the first page supplies its source and start date.
   const rows=await database.query(`WITH ordered AS (
    SELECT *,lag(created_at) OVER(PARTITION BY visitor_id ORDER BY created_at,event_id) AS previous
    FROM analytics_events WHERE created_at >= (now() AT TIME ZONE 'Europe/Moscow')::date AT TIME ZONE 'Europe/Moscow' - ($1::int * interval '1 day')
   ), numbered AS (
    SELECT *,sum(CASE WHEN previous IS NULL OR created_at-previous>interval '30 minutes' THEN 1 ELSE 0 END) OVER(PARTITION BY visitor_id ORDER BY created_at,event_id) AS visit FROM ordered
   ), visits AS (
    SELECT visitor_id,visit,min(created_at) AS started,(array_agg(entry_source ORDER BY created_at,event_id))[1] AS source,bool_or(human_action) AS human FROM numbered GROUP BY visitor_id,visit
   ), days AS (
    SELECT generate_series((now() AT TIME ZONE 'Europe/Moscow')::date-($1::int-1),(now() AT TIME ZONE 'Europe/Moscow')::date,interval '1 day')::date AS day
   ) SELECT to_char(days.day,'YYYY-MM-DD') AS day,count(v.started)::int AS visits,
    count(v.started) FILTER(WHERE v.source~'(^|\\.)yandex\\.|^ya\\.ru$')::int AS yandex,
    count(v.started) FILTER(WHERE v.source~'(^|\\.)google\\.')::int AS google,
    count(v.started) FILTER(WHERE v.source IN('chatgpt','chatgpt.com','chat.openai.com'))::int AS chatgpt
   FROM days LEFT JOIN visits v ON (v.started AT TIME ZONE 'Europe/Moscow')::date=days.day AND v.human GROUP BY days.day ORDER BY days.day`,[Number(period)]);
   return result(200,{period,generatedAt:new Date(now()).toISOString(),daily:rows.rows});
  }
  return result(404,{error:'not_found'});
 };
}
