import '../../config/load-env.mjs';
import http from 'node:http';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {SITE} from '../../src/site-profile.js';
import {catalogPool,sitePool,closePools} from '../db.mjs';
import {createRussianCatalog} from './catalog.mjs';
import {createAbdriveHandler} from './handler.mjs';
import {createFrontend} from './frontend.mjs';
import {intakeConfig} from './intake-config.mjs';
import {deliverNextLead} from './notifications.mjs';

if(SITE.id!=='abdrive')throw new Error('ABDrive server requires SITE_ID=abdrive');
const identity=await sitePool.query('SELECT site_id FROM site_identity WHERE singleton');
if(identity.rows[0]?.site_id!=='abdrive')throw new Error('Wrong private site database');
const catalog=createRussianCatalog(catalogPool);
catalog.warmPrices().catch(error=>console.error('[abdrive] price index warmup failed',error.code||error.message));
let privacyText=null;
if(process.env.ABDRIVE_PRIVACY_FILE){
 try{privacyText=await readFile(process.env.ABDRIVE_PRIVACY_FILE,'utf8');}
 catch{console.error('[abdrive] privacy document unavailable; lead intake disabled');}
}
const intake=intakeConfig(process.env,privacyText);
const consentVersion=intake.consentVersion;
const frontend=await createFrontend({buildDirectory:resolve(process.env.ABDRIVE_BUILD_DIR||'dist-abdrive'),catalog,site:SITE,privacyText,leadEnabled:intake.enabled});
const server=http.createServer(createAbdriveHandler({catalog,siteDatabase:sitePool,site:SITE,consentVersion,registrationConsentVersion:privacyText?.trim()?process.env.ABDRIVE_CONSENT_VERSION:null,frontend}));
let notifying=false;
const timer=setInterval(async()=>{
 if(notifying)return;notifying=true;
 try{await deliverNextLead(sitePool,{site:SITE,token:intake.notificationReady?intake.token:null,chatId:intake.notificationReady?intake.chatId:null});}
 catch(error){console.error('[abdrive] notification retry failed',error.code||'unknown');}
 finally{notifying=false;}
},15000);timer.unref();
const port=Number(process.env.API_PORT||8788);
server.listen(port,'127.0.0.1',()=>console.log(`abdrive.ru: http://127.0.0.1:${port}`));
server.on('error',error=>{console.error(error.code||'listen_failed');process.exit(1);});
let stopping=false;
async function shutdown(){
 if(stopping)return;stopping=true;clearInterval(timer);server.close();server.closeAllConnections();
 const force=setTimeout(()=>process.exit(1),5000);force.unref();
 await closePools();clearTimeout(force);
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
