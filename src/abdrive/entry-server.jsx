import {primeModelText} from '../model-text-load.js';
import {russianModelText} from '../markets/ru-content.js';
const reviews=import.meta.glob('../model-texts/*.js',{eager:true,import:'default'});
for(const [path,text] of Object.entries(reviews))primeModelText(path.split('/').pop().replace(/\.js$/,''),russianModelText(text));
import {primeBlogText} from '../markets/ru-blog-text-load.js';
const articles=import.meta.glob('../markets/ru-blog/*.js',{eager:true,import:'default'});
for(const [path,text] of Object.entries(articles))primeBlogText(path.split('/').pop().replace(/\.js$/,''),text);
import {renderCatalogApp} from '../entry-server.jsx';
export const render=boot=>renderCatalogApp(boot.path||'/',boot.search||'',boot);
export function apiRequests(boot) {
 const requests=new Set();globalThis.window.__bootRecord=url=>requests.add(url);
 try{render(boot);return [...requests];}finally{delete globalThis.window.__bootRecord;}
}
