import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {siteFromPhrase,fromPhrase} from '../../src/origin.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mime={'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
export async function createFrontend({buildDirectory,catalog,site,privacyText=null,leadEnabled:configuredIntake=false}){
 const directory=resolve(buildDirectory);
 const [template,entry]=await Promise.all([
  readFile(resolve(directory,'client/index.html'),'utf8'),
  import(pathToFileURL(resolve(directory,'ssr/entry-server.js')).href),
 ]);
 const leadEnabled=Boolean(privacyText?.trim()&&configuredIntake);
 return async(request,response,url)=>{
  if(url.pathname.startsWith('/assets/')){
   const name=url.pathname.slice(8);
   if(!/^[a-zA-Z0-9_.-]+$/.test(name)||!mime[extname(name)]){response.writeHead(404);return response.end();}
   try{
    const file=resolve(directory,'client/assets',name);const info=await stat(file);if(!info.isFile())throw new Error('not_file');
    const content=await readFile(file);response.writeHead(200,{'content-type':mime[extname(name)],'cache-control':'public,max-age=31536000,immutable','content-length':content.length});return response.end(content);
   }catch{response.writeHead(404);return response.end();}
  }
  if(url.pathname==='/robots.txt'){
   response.writeHead(200,{'content-type':'text/plain; charset=utf-8'});
   return response.end(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${site.origin}/sitemap.xml\n`);
  }
  if(url.pathname==='/sitemap.xml'){
   response.writeHead(200,{'content-type':'application/xml; charset=utf-8'});
   return response.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+['/','/catalog','/how-it-works','/faq'].map(path=>`<url><loc>${site.origin}${path}</loc></url>`).join('')+'</urlset>');
  }
  let boot={kind:'notFound',leadEnabled};let status=200;
  const path=url.pathname.replace(/\/+$/,'')||'/';
  if(path==='/'||path==='/catalog'){
   const [data,meta]=await Promise.allSettled([catalog.list(url.searchParams),catalog.meta(url.searchParams.get('brand')||'')]);
   const filterError=data.status==='rejected'&&/^(invalid_|price_filter_unavailable)/.test(data.reason?.message||'');
   boot={...boot,filterError:Boolean(filterError),kind:path==='/'?'home':'catalog',data:data.status==='fulfilled'?data.value:null,brands:meta.status==='fulfilled'?meta.value.brands:[],models:meta.status==='fulfilled'?meta.value.models||[]:[],params:Object.fromEntries(url.searchParams)};
   if(data.status==='rejected')status=filterError?400:503;
  }else if(path.startsWith('/cars/')){
   const listing=await catalog.get(decodeURIComponent(path.slice(6)));
   if(listing)boot={...boot,kind:'car',car:listing.car};else status=404;
  }else if(path==='/how-it-works')boot={...boot,kind:'process'};
  else if(path==='/faq')boot={...boot,kind:'faq'};
  else if(path==='/privacy'&&privacyText)boot={...boot,kind:'privacy',privacyText};
  else status=404;
  const title=boot.kind==='car'?`${boot.car.title} ${fromPhrase(boot.car.origin)} — ABDrive`:
   boot.kind==='faq'?'Вопросы о покупке и доставке в Россию — ABDrive':boot.kind==='process'?'Как заказать автомобиль — ABDrive':boot.kind==='privacy'?'Обработка персональных данных — ABDrive':
   status===404?'Страница не найдена — ABDrive':`Автомобили ${siteFromPhrase()} в Россию — ABDrive`;
  const canonical=site.origin+(boot.kind==='car'?'/cars/'+encodeURIComponent(boot.car.id):path);
  // Unpriced individual advertisements are useful to visitors, but not submitted as priced offers.
  const noindex=status!==200||boot.kind==='car'&&boot.car.offer.status!=='estimated'||url.searchParams.size>0;
  const description=`Каталог автомобилей ${siteFromPhrase()} для покупателей в России. Характеристики, фотографии и запрос условий доставки до Москвы.`;
  const data=JSON.stringify(boot).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const markup=template.replace(/<title>[\s\S]*?<\/title>/,()=>`<title>${escape(title)}</title>`)
   .replace('</head>',()=>`<meta name="description" content="${escape(description)}"/><meta name="robots" content="${noindex?'noindex,follow':'index,follow'}"/><link rel="canonical" href="${escape(canonical)}"/></head>`)
   .replace('<!--abdrive-app-->',()=>entry.render(boot))
   .replace('<script id="abdrive-data" type="application/json">{}</script>',()=>`<script id="abdrive-data" type="application/json">${data}</script>`);
  response.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':status===200?'public,max-age=0,s-maxage=30':'no-store','x-content-type-options':'nosniff'});
  response.end(markup);
 };
}
