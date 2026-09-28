import {pool} from './db.mjs';
export async function catalogSources(client=pool){
 const {rows}=await client.query(`SELECT s.source,s.enabled,s.updated_at AS "updatedAt",count(l.id)::int AS total,count(l.id) FILTER (WHERE l.status='active')::int AS active FROM catalog_sources s LEFT JOIN listings l ON l.source=s.source GROUP BY s.source ORDER BY s.source`);
 return {sources:rows};
}
export async function setCatalogSource(source,enabled,client=pool){
 if(source!=='Guazi'||typeof enabled!=='boolean')throw new Error('Invalid catalog source setting');
 await client.query('UPDATE catalog_sources SET enabled=$2,updated_at=now() WHERE source=$1',[source,enabled]);
 return catalogSources(client);
}
export function sameOriginSettingRequest(headers){
 try{return new URL(headers.origin).host===headers.host;}catch{return false;}
}
