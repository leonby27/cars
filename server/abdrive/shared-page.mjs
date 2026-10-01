import {findCatalogLanding,parseModelLandingPath,modelFromSlug,brandLandingPath,landingApiParams} from '../../src/catalog-landings.js';
export async function russianModel(catalog,path){
 const parsed=parseModelLandingPath(path);if(!parsed)return null;
 const meta=await catalog.meta(parsed.brand);
 const model=modelFromSlug(meta.models.map(row=>row.model),parsed.modelSlug);
 if(!model)return null;
 return {model:{brand:parsed.brand,model,name:parsed.brand+' '+model,path,inCatalog:true},facts:{total:meta.models.find(row=>row.model===model)?.count||0,powertrains:[]},review:null,links:{brandPath:brandLandingPath(parsed.brand),sections:[],siblings:[],similar:[],journal:[]}};
}
export async function russianLanding(catalog,path){
 if(path==='/catalog')return {landing:null,params:new URLSearchParams()};
 const model=await russianModel(catalog,path);
 if(model)return {modelCatalog:model,landing:{...model.model,kind:'model',h1:model.model.name,name:model.model.name},params:new URLSearchParams({brand:model.model.brand,model:model.model.model})};
 const landing=findCatalogLanding(path);
 if(!landing||landing.kind==='price')return null;
 return {landing,params:landingApiParams(landing)};
}
