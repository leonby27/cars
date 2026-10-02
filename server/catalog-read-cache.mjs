import {createBoundedCache} from './bounded-cache.mjs';

// Cache public SQL rows, shared by SSR and API, bounded per database connection
// pool. Imports become visible within one minute; source switches clear at once.
let pools=new WeakMap();
export function cachedCatalogValue(db,key,load) {
 let read=pools.get(db);
 if(!read){read=createBoundedCache({ttl:60_000,maxEntries:300,maxBytes:24*1024*1024});pools.set(db,read);}
 return read(JSON.stringify(key),load);
}
export const cachedCatalogRead=(db,sql,values=[])=>cachedCatalogValue(db,["sql",sql,values],async()=>({rows:(await db.query(sql,values)).rows}));
export const clearCatalogReadCache=()=>{pools=new WeakMap();};
