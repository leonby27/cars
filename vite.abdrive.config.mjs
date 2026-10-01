import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
const output=process.env.ABDRIVE_BUILD_DIR||'dist-abdrive';
if(!['dist-abdrive','dist-abdrive.next'].includes(output))throw new Error('Invalid ABDrive output directory');
export default defineConfig({
 root:resolve(root,'abdrive'),publicDir:false,base:'/',plugins:[react()],
 resolve:{alias:[].concat([{find:/^.*[/]blog-text-load\.js$/,replacement:resolve(root,'src/markets/ru-blog-text-load.js')},{find:/^.*[/]tool-page-text-load\.js$/,replacement:resolve(root,'src/markets/ru-tool-text-load.js')}])},
 define:{__SITE_ID__:JSON.stringify('abdrive')},
 build:{outDir:resolve(root,output,'client'),emptyOutDir:true,sourcemap:true},
});
