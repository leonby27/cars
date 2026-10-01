import {russianModel} from "./shared-page.mjs";
import {normalizeLead,saveLead} from './leads.mjs';

const reply=(response,status,data)=>{
 response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
 response.end(JSON.stringify(data));
};
async function readBody(request){
 let size=0;const chunks=[];
 for await(const chunk of request){size+=chunk.length;if(size>16384)throw new Error('body_too_large');chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('invalid_json');}
}
function rateLimiter(){
 const recent=new Map();
 return address=>{
  const now=Date.now();
  if(recent.size>10000)for(const [key,entry]of recent)if(entry.until<now)recent.delete(key);
  if(recent.size>20000)return false;
  const old=recent.get(address);const value=old&&old.until>now?old:{n:0,until:now+3600000};
  value.n++;recent.set(address,value);return value.n<=10;
 };
}

export function createAbdriveHandler({catalog,siteDatabase,site,consentVersion=null,frontend=null,log=console.error}){
 const allow=rateLimiter();
 return async(request,response)=>{
  try{
   const url=new URL(request.url,site.origin);
   if(request.method==='GET'&&url.pathname==='/api/model-facts')return reply(response,200,await catalog.modelFacts());
   if(request.method==='GET'&&url.pathname==='/api/model-catalog') {
    const model=await russianModel(catalog,`/catalog/${encodeURIComponent(url.searchParams.get('brand')||'')}/${encodeURIComponent(url.searchParams.get('model')||'')}`);
    return reply(response,model?200:404,model||{error:'not_found'});
   }
   if(request.method==='GET'&&url.pathname==='/api/health')return reply(response,200,{ok:true,site:site.id});
   if(request.method==='GET'&&['/api/catalog','/api/cars'].includes(url.pathname))return reply(response,200,await catalog.list(url.searchParams));
   if(request.method==='GET'&&url.pathname==='/api/catalog/meta')return reply(response,200,catalog.sharedMeta?await catalog.sharedMeta(url.searchParams):await catalog.meta(url.searchParams.get('brand')||''));
   if(request.method==='GET'&&url.pathname.startsWith('/api/cars/')){
    const found=await catalog.get(decodeURIComponent(url.pathname.slice(10)));
    return reply(response,found?200:404,found?found.car:{error:'not_found'});
   }
   if(request.method==='POST'&&url.pathname==='/api/leads'){
    if(request.headers.origin!==site.origin)return reply(response,403,{error:'origin_not_allowed'});
    if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']||''))return reply(response,415,{error:'json_required'});
    const address=request.headers['x-real-ip']||request.socket?.remoteAddress||'unknown';
    if(!allow(address))return reply(response,429,{error:'too_many_requests'});
    if(!consentVersion)return reply(response,503,{error:'lead_intake_not_configured'});
    const body=await readBody(request);const lead=normalizeLead(body);
    if(body.destinationId&&body.destinationId!==site.destination.id)throw new Error('unsupported_destination');
    const listing=lead.listingId?await catalog.get(lead.listingId):null;
    if(lead.listingId&&!listing)return reply(response,409,{error:'listing_unavailable'});
    const client=await siteDatabase.connect();
    try{
     const result=await saveLead(client,lead,{consentVersion,destination:site.destination,
      snapshot:{siteId:site.id,market:site.market,car:listing?.car||null,sourceVersion:listing?.sourceVersion||null,sourceUrl:listing?.sourceUrl||null,assignment:'owner'}});
     return reply(response,202,result);
    }finally{client.release();}
   }
   if(['GET','HEAD'].includes(request.method)&&frontend&&!url.pathname.startsWith('/api/'))return await frontend(request,response,url);
   return reply(response,404,{error:'not_found'});
  }catch(error){
   const known=['invalid_lead','invalid_request_key','invalid_phone','consent_required','invalid_listing','unsupported_destination','body_too_large','invalid_json','invalid_filter','invalid_country','invalid_sort','invalid_page','price_filter_unavailable'];
   if(error instanceof URIError)return reply(response,400,{error:'invalid_path'});
   if(known.includes(error.message))return reply(response,error.message==='body_too_large'?413:400,{error:error.message});
   if(error.message==='request_key_conflict')return reply(response,409,{error:error.message});
   log('[abdrive] request failed',error.code||error.message);
   return reply(response,503,{error:'temporarily_unavailable'});
  }
 };
}
