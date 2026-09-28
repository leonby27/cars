import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {imageUrl} from '../scripts/lib/guazi-pilot-data.mjs';
import {boundedGet,imageFormat,atomicWrite} from '../scripts/lib/guazi-pilot-io.mjs';
export const imageCacheRoot=()=>path.resolve(process.env.GUAZI_IMAGE_CACHE_DIR||'runtime/guazi-image-cache');
const inFlight=new Map();
export async function cachedGuaziImage(url,options={}){
 const key=imageUrl(url);if(inFlight.has(key))return inFlight.get(key);
 const task=loadGuaziImage(key,options).finally(()=>inFlight.delete(key));inFlight.set(key,task);return task;
}
async function loadGuaziImage(url,{fetchImpl=fetch}={}){
 const valid=imageUrl(url),key=createHash('sha256').update(valid).digest('hex');const file=path.join(imageCacheRoot(),key);
 try{const [bytes,meta]=await Promise.all([fs.readFile(file),fs.readFile(file+'.json','utf8').then(JSON.parse)]);imageFormat(bytes,meta.contentType);return{bytes,contentType:meta.contentType,cached:true};}catch(e){if(e.code!=='ENOENT')throw e;}
 const response=await boundedGet(valid,{validate:imageUrl,fetchImpl,maxBytes:12*1024*1024});imageFormat(response.bytes,response.contentType);
 await atomicWrite(file,response.bytes);await atomicWrite(file+'.json',JSON.stringify({url:valid,contentType:response.contentType,bytes:response.bytes.length}));return{bytes:response.bytes,contentType:response.contentType,cached:false};
}
