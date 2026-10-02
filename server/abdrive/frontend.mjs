import {isBrandGuideLanding} from '../../src/brand-guide.js';
import {RU_BLOG_REDIRECTS} from '../../src/markets/ru-editorial.js';
import {MODEL_PAGES,modelPageRedirect} from '../../src/model-pages.js';
import {findBlogPost,blogPosts} from '../../src/blog-posts.js';
import {findToolPage, TOOL_PAGES} from '../../src/tool-pages.js';
import {createRussianHomeSnapshot} from './home-snapshot.mjs';
import {russianLanding} from "./shared-page.mjs";
import {ruPageSeo} from "../../src/markets/interface.js";
import {CATALOG_PAGE_SIZE,CATALOG_LANDINGS} from "../../src/catalog-landings.js";
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {listingNumber} from '../../src/listing-id.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brandFiles=new Set(['/favicon.svg','/favicon-96.png','/favicon.ico','/apple-touch-icon.png']);
const mime={'.mp4':'video/mp4','.ico':'image/x-icon','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.avif':'image/avif'};
export async function createFrontend({buildDirectory,catalog,site,privacyText=null,leadEnabled:configuredIntake=false,homeSnapshotFile,homeSnapshot}){
 const directory=resolve(buildDirectory);
 const [template,entry]=await Promise.all([
  readFile(resolve(directory,'client/index.html'),'utf8'),
  import(pathToFileURL(resolve(directory,'ssr/entry-server.js')).href),
 ]);
 const home=homeSnapshot||await createRussianHomeSnapshot({catalog,file:homeSnapshotFile,onError:error=>console.error('[abdrive] home refresh failed',error.code||error.message)});
 let cachedHome=null;
 const leadEnabled=Boolean(privacyText?.trim()&&configuredIntake);
 return async(request,response,url)=>{
  if(brandFiles.has(url.pathname)||/^\/(assets|abdrive|brands|services|trust-strip|fonts|illustrations|flags|videos|social)\//.test(url.pathname)||(/^\/blog\//.test(url.pathname)&&mime[extname(url.pathname)])){
   const name=url.pathname.slice(1);
   if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').includes('..')||!mime[extname(name)]){response.writeHead(404);return response.end();}
   try{
    const file=resolve(directory,'client',name);const info=await stat(file);if(!info.isFile())throw new Error('not_file');
    const content=await readFile(file);response.writeHead(200,{'content-type':mime[extname(name)],'cache-control':name.startsWith('assets/')?'public,max-age=31536000,immutable':'public,max-age=86400','content-length':content.length});return response.end(content);
   }catch{response.writeHead(404);return response.end();}
  }
  if(url.pathname==='/robots.txt'){
   response.writeHead(200,{'content-type':'text/plain; charset=utf-8'});
   return response.end(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${site.origin}/sitemap.xml\n`);
  }
  if(url.pathname==='/sitemap.xml'){
   response.writeHead(200,{'content-type':'application/xml; charset=utf-8'});
   return response.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+['/','/catalog','/how-it-works','/models','/blog',...blogPosts().map(post=>post.path),...TOOL_PAGES.map(tool=>tool.path),...CATALOG_LANDINGS.map(landing=>landing.path),...MODEL_PAGES.map(page=>page.path)].map(path=>`<url><loc>${site.origin}${path}</loc></url>`).join('')+'</urlset>');
  }
  if(RU_BLOG_REDIRECTS[url.pathname]){response.writeHead(301,{location:RU_BLOG_REDIRECTS[url.pathname]});return response.end();}
  if(url.pathname==='/faq'){response.writeHead(301,{location:'/how-it-works#faq'});return response.end();}
  if(url.pathname==='/calculator'){response.writeHead(301,{location:'/customs'});return response.end();}
  if(url.pathname.startsWith('/models/')){const target=modelPageRedirect(url.pathname.slice(8));if(target){response.writeHead(301,{location:target});return response.end();}}
  let boot={kind:'notFound',leadEnabled,privacyText};let status=200;
  const path=url.pathname.replace(/\/+$/,'')||'/';
  boot.path=path;boot.search=url.search;
  let landing=null;
  let homeValue;
  if(path==='/'){
   homeValue=home.get();
   const day=new Date().toISOString().slice(0,10);
   if(!url.search&&cachedHome?.value===homeValue&&cachedHome.day===day){
    response.writeHead(200,cachedHome.headers);return response.end(cachedHome.markup);
   }
   boot={...boot,...homeValue,kind:'home'};
  }else if(path==='/catalog'||path.startsWith('/catalog/')){
   const resolved=await russianLanding(catalog,path);
   if(!resolved)status=404;
   else {
    landing=resolved.landing;const params=new URLSearchParams(resolved.params);
    for(const key of new Set(url.searchParams.keys())){params.delete(key);for(const value of url.searchParams.getAll(key))params.append(key,value);}
    params.set('limit',String(CATALOG_PAGE_SIZE));
    if(!params.has('sort'))params.set('sort',params.has('page')||resolved.modelCatalog?'newest':'default');
    if(!params.has('seed'))params.set('seed','s0');
    const metaParams=new URLSearchParams();for(const key of ['type','brand','bodyType','country'])for(const value of params.getAll(key))metaParams.append(key,value);
    const [data,meta]=await Promise.allSettled([catalog.list(params),catalog.sharedMeta?catalog.sharedMeta(metaParams):catalog.meta(params.get('brand')||'')]);
    if(meta.status==='fulfilled')meta.value={bodyTypes:[],drives:[],countries:[],availability:{},...meta.value};
    const filterError=data.status==='rejected'&&/^(invalid_|price_filter_unavailable)/.test(data.reason?.message||'');
    boot={...boot,kind:'catalog',filterError:Boolean(filterError),modelCatalog:resolved.modelCatalog,
      metaValue:meta.status==='fulfilled'?meta.value:null,metaQuery:metaParams.toString(),api:meta.status==='fulfilled'?{['/api/catalog/meta'+(metaParams.size?'?'+metaParams:'')]:meta.value}:{},
      catalogPath:path,catalogSearch:url.searchParams.toString(),catalogSeed:params.get('sort')==='default'?params.get('seed'):null};
    if(data.status==='fulfilled') {
     const value={...data.value,items:data.value.items||data.value.cars};
     boot.catalogValue=value;boot.catalogFacts={total:value.total,updatedAt:value.refreshedAt||''};
    } else status=filterError?400:503;
   }
  }else if(path.startsWith('/cars/')){
   const listing=await catalog.get(decodeURIComponent(path.slice(6)));
   if(listing)boot={...boot,kind:'car',car:listing.car,carId:listing.car.id,carValue:listing.car};else status=404;
  }else if(path==='/blog'||findBlogPost(path))boot.kind='blog';
  else if(findToolPage(path))boot.kind='tool';
  else if(path==='/how-it-works')boot.kind='process';
  else if(path==='/models')boot.kind='models';
  else if(path==='/faq')boot.kind='faq';
  else if(['/favorites','/searches','/account','/login','/register'].includes(path))boot.kind='private';
  else if(path==='/privacy'&&privacyText)boot.kind='privacy';
  else status=404;
  if(status===404)boot.path='/not-found';
  if(status===200&&['blog','models','tool'].includes(boot.kind)&&entry.apiRequests){
   const requested=entry.apiRequests(boot);
   boot.api={...(boot.api||{})};
   await Promise.all(requested.map(async address=>{
    const query=new URL(address,site.origin);let data;
    try{
     if(query.pathname==='/api/cars')data=await catalog.list(query.searchParams);
     else if(query.pathname==='/api/cars/summary'&&catalog.summary)data=await catalog.summary(query.searchParams);
     else if(query.pathname==='/api/model-facts'&&catalog.modelFacts)data=await catalog.modelFacts();
     else if(query.pathname==='/api/catalog/meta')data=await catalog.sharedMeta(query.searchParams);
     if(data!==undefined)boot.api[address]=data;
    }catch{}
   }));
   if(boot.api['/api/catalog/meta']){boot.metaValue=boot.api['/api/catalog/meta'];boot.metaQuery='';}
  }
  if(landing&&isBrandGuideLanding(landing)&&catalog.brandGuide){boot.brandGuideValue=await catalog.brandGuide(landing.brand);boot.brandGuideBrand=landing.brand;}
  const seo=ruPageSeo(path,{car:boot.car,landing,search:url.search});
  const title=status===404?'Страница не найдена — ABDrive':seo.title;
  const canonical=site.origin+(boot.car?'/cars/'+encodeURIComponent(listingNumber(boot.car.id)):path);
  const noindex=status!==200||!seo.indexable;
  const description=seo.description;
  const data=JSON.stringify(boot).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const markup=template.replace(/<title>[\s\S]*?<\/title>/,()=>`<title>${escape(title)}</title>`)
   .replace('</head>',()=>`<meta name="description" content="${escape(description)}"/><meta name="robots" content="${noindex?'noindex,follow':'index,follow'}"/><link rel="canonical" href="${escape(canonical)}"/></head>`)
   .replace('<div id="root">',()=>`<div id="root" data-prerender="${escape(path)}">`).replace('<!--abdrive-app-->',()=>entry.render(boot))
   .replace('<script id="abdrive-data" type="application/json">{}</script>',()=>`<script id="abdrive-data" type="application/json">${data}</script>`);
  const headers={'content-type':'text/html; charset=utf-8','cache-control':status===200?(boot.kind==='private'?'no-store':'public,max-age=0,s-maxage=30'):'no-store','x-content-type-options':'nosniff'};
  if(homeValue&&!url.search)cachedHome={value:homeValue,day:new Date().toISOString().slice(0,10),headers,markup};
  response.writeHead(status,headers);
  response.end(markup);
 };
}
