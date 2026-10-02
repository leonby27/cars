import '../config/load-env.mjs';
import {spawnSync} from 'node:child_process';
import {rmSync,cpSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const output=process.env.ABDRIVE_BUILD_DIR||'dist-abdrive';
if(!['dist-abdrive','dist-abdrive.next'].includes(output))throw new Error('Invalid ABDrive output directory');
// Only the RU output can be removed. The BY dist/dist.next directories are untouched.
rmSync(resolve(output),{recursive:true,force:true});
for(const args of [
 ['build','--config','vite.abdrive.config.mjs'],
 ['build','--config','vite.abdrive.config.mjs','--ssr','../src/abdrive/entry-server.jsx','--target','node22','--outDir',resolve(output,'ssr')],
]){
 const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js',...args],{stdio:'inherit',env:{...process.env,SITE_ID:'abdrive',VITE_SITE_ID:'abdrive',SITE_URL:'https://abdrive.ru'}});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error('ABDrive build failed');
}

for(const folder of ['abdrive','brands','services','trust-strip','fonts','illustrations','flags','blog']) {
 if(existsSync(resolve('public',folder)))cpSync(resolve('public',folder),resolve(output,'client',folder),{recursive:true});
}

for(const file of ['favicon.svg','favicon-96.png','favicon.ico','apple-touch-icon.png']) {
 cpSync(resolve('public',file),resolve(output,'client',file));
}

// Only media used by the shared service page; exclude legacy film exports and social drafts.
for(const file of [
 'videos/how-it-works-mobile-v2.mp4','videos/how-it-works-desktop-v2.mp4',
 'videos/how-it-works-mobile-poster.webp','videos/how-it-works-desktop-poster.webp',
 'social/contact-viber.png','social/contact-telegram.png','social/contact-mail.png',
]) {
 const target=resolve(output,'client',file);
 mkdirSync(dirname(target),{recursive:true});
 cpSync(resolve('public',file),target);
}

// Use the shared critical styles before compressing the modified HTML and CSS.
const css=spawnSync(process.execPath,['scripts/split-css.mjs',`--dir=${output}/client`],{stdio:'inherit'});
if(css.error)throw css.error;
if(css.status!==0)throw new Error('ABDrive critical CSS preparation failed');

// Serve precompressed public assets without spending application CPU on each request.
const compression=spawnSync(process.execPath,['scripts/precompress-dist.mjs',`--dir=${output}/client`],{stdio:'inherit'});
if(compression.error)throw compression.error;
if(compression.status!==0)throw new Error('ABDrive asset compression failed');
