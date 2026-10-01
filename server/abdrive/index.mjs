import '../../config/load-env.mjs';
import http from 'node:http';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {SITE} from '../../src/site-profile.js';
import {catalogPool,sitePool,closePools} from '../db.mjs';
import {createRussianCatalog} from './catalog.mjs';
import {createAbdriveHandler} from './handler.mjs';
import {createFrontend} from './frontend.mjs';
import {deliverNextLead} from './notifications.mjs';

if(SITE.id!=='abdrive')throw new Error('ABDrive server requires SITE_ID=abdrive');
const identity=await sitePool.query('SELECT site_id FROM site_identity WHERE singleton');
if(identity.rows[0]?.site_id!=='abdrive')throw new Error('Wrong private site database');
const catalog=createRussianCatalog(catalogPool);
const privacyText=process.env.ABDRIVE_PRIVACY_FILE?await readFile(process.env.ABDRIVE_PRIVACY_FILE,'utf8'):null;
const consentVersion=privacyText?process.env.ABDRIVE_CONSENT_VERSION:null;
if(privacyText&&!consentVersion)throw new Error('Consent version is required with a published privacy policy');
const frontend=await createFrontend({buildDirectory:resolve(process.env.ABDRIVE_BUILD_DIR||'dist-abdrive'),catalog,site:SITE,privacyText});
const server=http.createServer(createAbdriveHandler({catalog,siteDatabase:sitePool,site:SITE,consentVersion,frontend}));
let notifying=false;
const timer=setInterval(async()=>{
 if(notifying)return;notifying=true;
 try{await deliverNextLead(sitePool,{site:SITE,token:process.env.ABDRIVE_TELEGRAM_BOT_TOKEN,chatId:process.env.ABDRIVE_TELEGRAM_CHAT_ID});}
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
