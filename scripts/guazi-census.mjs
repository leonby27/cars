import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {makeSegments,searchBody} from './lib/guazi-core.mjs';
import {readJson,writeJson} from './lib/guazi-pilot-io.mjs';
import {openGuaziBrowser} from './lib/guazi-pilot-browser.mjs';
export function orderGuaziBrands(segments,counts) {
 const brands=new Map();
 for(const s of segments){const row=brands.get(s.brand)||{brand:s.brand,total:0,segments:[]};row.segments.push(s);for(const partition of [1,0]){const n=counts[`${s.id}:${partition}`];if(!Number.isInteger(n)||n<0)throw Error(`Missing count: ${s.id}:${partition}`);row.total+=n;}brands.set(s.brand,row);}
 return [...brands.values()].sort((a,b)=>a.total-b.total||a.brand.localeCompare(b.brand));
}
export async function census(out,{browserFactory=openGuaziBrowser,log=console.log}={}){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const config=await readJson(path.join(root,'config/guazi-core.json'));const filters=(await readJson(path.join(root,config.sharedFilterFile))).filters;const dictionary=await readJson(path.join(root,'config/guazi-core-brands.json'));const segments=makeSegments(dictionary.brands,filters,config);
 const state=await readJson(path.join(out,'census.json'),{startedAt:new Date().toISOString(),counts:{},errors:[],status:'running'});
 const browser=await browserFactory({publicOnly:true,transport:'session-http',verifyCheckbox:true,requestInterval:750,delay:250});
 try{await browser.publicBootstrap();for(const s of segments){for(const partition of [1,0]){const key=`${s.id}:${partition}`;if(Number.isInteger(state.counts[key]))continue;const p=await browser.publicSearch({...searchBody(s,config,1,partition),clientScene:'count',pageSize:1});state.counts[key]=p.data.totalCount;await writeJson(path.join(out,'census.json'),state);}log(JSON.stringify({event:'count',segment:s.id,total:state.counts[s.id+':1']+state.counts[s.id+':0']}));}state.order=orderGuaziBrands(segments,state.counts);state.status='complete';state.finishedAt=new Date().toISOString();}
 catch(e){state.status='blocked';state.errors.push({at:new Date().toISOString(),error:e.message.split('\n')[0]});throw e;}
 finally{await writeJson(path.join(out,'census.json'),state);await browser.close();}
 return state;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const out=path.resolve(process.argv[2]||'runtime/guazi-import');await fs.mkdir(out,{recursive:true});try{const r=await census(out);console.log(JSON.stringify({event:'ordered',brands:r.order.map(b=>({brand:b.brand,total:b.total}))}));}catch(e){console.error(JSON.stringify({event:'error',error:e.message.split('\n')[0]}));process.exitCode=1;}}
