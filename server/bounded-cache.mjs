// Small LRU for prepared public data. Hard expiry bounds stale availability;
// pending requests for the same key share a load. Failures are never cached.
export function createBoundedCache({ttl=60_000,negativeTtl=5_000,maxEntries=500,maxBytes=24*1024*1024,now=Date.now}={}) {
 const entries=new Map();let bytes=0,generation;
 const remove=key=>{const entry=entries.get(key);if(entry){bytes-=entry.bytes;entries.delete(key);}};
 const trim=()=>{while(entries.size>maxEntries||bytes>maxBytes)remove(entries.keys().next().value);};
 return async(key,load,{version,bypass=false}={})=>{
  if(version!==generation){entries.clear();bytes=0;generation=version;}
  const old=entries.get(key);
  if(!bypass&&old&&(old.pending||now()<old.expiresAt)){
   entries.delete(key);entries.set(key,old);
   return old.pending||old.value;
  }
  remove(key);
  const entry={bytes:0};entries.set(key,entry);trim();
  entry.pending=Promise.resolve().then(load).then(value=>{
   if(entries.get(key)===entry){
    entry.bytes=Buffer.byteLength(JSON.stringify(value));bytes+=entry.bytes;
    entry.value=value;entry.expiresAt=now()+(value===null?negativeTtl:ttl);
    entry.pending=null;trim();
   }
   return value;
  }).catch(error=>{if(entries.get(key)===entry)remove(key);throw error;});
  return entry.pending;
 };
}
