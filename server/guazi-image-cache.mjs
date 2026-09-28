import fs from 'node:fs/promises';
import {imageUrl} from '../scripts/lib/guazi-pilot-data.mjs';
import {boundedGet,imageFormat,atomicWrite} from '../scripts/lib/guazi-pilot-io.mjs';
import {imageCacheRoot,guaziImageCacheFile} from './guazi-image-key.mjs';
export {imageCacheRoot};
export const imageCacheMinFreeBytes=()=>Math.max(0,Number(process.env.GUAZI_IMAGE_CACHE_MIN_FREE_BYTES)||2*1024*1024*1024);
const inFlight=new Map();
export async function cachedGuaziImage(url,options={}){
 const key=imageUrl(url);if(inFlight.has(key))return inFlight.get(key);
 const task=loadGuaziImage(key,options).finally(()=>inFlight.delete(key));inFlight.set(key,task);return task;
}
async function loadGuaziImage(url,{fetchImpl=fetch,statfsImpl=fs.statfs,minFreeBytes=imageCacheMinFreeBytes()}={}){
 const valid=imageUrl(url);const file=guaziImageCacheFile(valid);
 try{const [bytes,meta]=await Promise.all([fs.readFile(file),fs.readFile(file+'.json','utf8').then(JSON.parse)]);imageFormat(bytes,meta.contentType);return{bytes,contentType:meta.contentType,cached:true};}catch(e){if(e.code!=='ENOENT')throw e;}
 const response=await boundedGet(valid,{validate:imageUrl,fetchImpl,maxBytes:12*1024*1024});imageFormat(response.bytes,response.contentType);
 const root=imageCacheRoot();await fs.mkdir(root,{recursive:true,mode:0o700});
 const disk=await statfsImpl(root);const freeBytes=Number(disk.bavail)*Number(disk.bsize);
 if(freeBytes-response.bytes.length>=minFreeBytes){await atomicWrite(file,response.bytes);await atomicWrite(file+'.json',JSON.stringify({url:valid,contentType:response.contentType,bytes:response.bytes.length}));}
 return{bytes:response.bytes,contentType:response.contentType,cached:false};
}
