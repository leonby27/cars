import '../config/load-env.mjs';
import {spawnSync} from 'node:child_process';
import {rmSync,cpSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const output=process.env.ABDRIVE_BUILD_DIR||'dist-abdrive';
if(!['dist-abdrive','dist-abdrive.next'].includes(output))throw new Error('Invalid ABDrive output directory');
// Only the RU output can be removed. The BY dist/dist.next directories are untouched.
rmSync(resolve(output),{recursive:true,force:true});
for(const args of [
 ['build','--config','vite.abdrive.config.mjs'],
 ['build','--config','vite.abdrive.config.mjs','--ssr','../src/abdrive/entry-server.jsx','--outDir',resolve(output,'ssr')],
]){
 const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js',...args],{stdio:'inherit',env:{...process.env,SITE_ID:'abdrive',VITE_SITE_ID:'abdrive',SITE_URL:'https://abdrive.ru'}});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error('ABDrive build failed');
}

for(const folder of ['abdrive','brands','services','trust-strip','fonts','illustrations','flags']) {
 if(existsSync(resolve('public',folder)))cpSync(resolve('public',folder),resolve(output,'client',folder),{recursive:true});
}

for(const file of ['favicon.svg','favicon-96.png','favicon.ico','apple-touch-icon.png']) {
 cpSync(resolve('public',file),resolve(output,'client',file));
}
