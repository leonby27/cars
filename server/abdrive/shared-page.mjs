import {blogPostsForModel} from '../../src/blog-posts.js';
import {MODEL_PAGES} from '../../src/model-pages.js';
import {findCatalogLanding,parseModelLandingPath,modelFromSlug,brandLandingPath,landingApiParams,landingsForCar,modelLandingPath} from '../../src/catalog-landings.js';
export async function russianModel(catalog,path){
 const parsed=parseModelLandingPath(path);if(!parsed)return null;
 const meta=await catalog.meta(parsed.brand);
 const review=MODEL_PAGES.find(page=>page.path===path);
 const model=modelFromSlug(meta.models.map(row=>row.model),parsed.modelSlug)||review?.model;
 if(!model)return null;
 const facts=catalog.summary?await catalog.summary(new URLSearchParams({brand:parsed.brand,model})):null;
 const type=facts?.powertrains?.[0]?.type,bodyType=facts?.bodyTypes?.[0]?.name;
 const allModels=catalog.modelFacts&&(type&&bodyType)?(await catalog.modelFacts()).models:[];
 const similar=allModels.filter(row=>row.brand!==parsed.brand&&row.powertrains?.includes(type)&&row.bodyTypes?.includes(bodyType)).sort((a,b)=>b.count-a.count).map(row=>({path:modelLandingPath(row.brand,row.model),name:row.brand+' '+row.model})).filter(row=>row.path).slice(0,8);
 return {model:{brand:parsed.brand,model,name:parsed.brand+' '+model,path,inCatalog:true},facts:facts||{total:meta.models.find(row=>row.model===model)?.count||0,powertrains:[]},review:review||null,links:{brandPath:brandLandingPath(parsed.brand),sections:landingsForCar({brand:parsed.brand,type,bodyType}).filter(item=>!item.brand).slice(0,6),siblings:MODEL_PAGES.filter(page=>page.brand===parsed.brand&&page.path!==path).slice(0,12),similar,journal:blogPostsForModel(path)}};
}
export async function russianLanding(catalog,path){
 if(path==='/catalog')return {landing:null,params:new URLSearchParams()};
 const model=await russianModel(catalog,path);
 if(model)return {modelCatalog:model,landing:{...model.model,kind:'model',h1:model.model.name,name:model.model.name},params:new URLSearchParams({brand:model.model.brand,model:model.model.model})};
 const landing=findCatalogLanding(path);
 if(!landing)return null;
 return {landing,params:landingApiParams(landing)};
}
