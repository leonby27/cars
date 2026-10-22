import assert from 'node:assert/strict';
import test from 'node:test';
import {CATALOG_LANDINGS,findCatalogLanding,landingFilterParams,parseModelLandingPath} from '../src/catalog-landings.js';
import {catalogHref,catalogLocationKey,catalogRedirect,catalogSort,catalogUrlParams} from '../src/catalog-url.js';

function selection(href, modelName) {
  const url=new URL(href,'https://abcars.by');
  const parsed=parseModelLandingPath(url.pathname);
  return catalogUrlParams(parsed?{brand:parsed.brand,model:modelName}:findCatalogLanding(url.pathname),url.search);
}
const entries=params=>[...params].sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));

test('every group and country combination has one URL and retains its whole selection',()=>{
  for(const group of CATALOG_LANDINGS.filter(x=>!x.brand&&['powertrain','bodyType','combo'].includes(x.kind))) {
    for(const country of ['china','korea']) {
      const p=landingFilterParams(group);p.set('country',country);
      const forward=catalogHref(p),reverse=catalogHref(new URLSearchParams([...p].reverse()));
      assert.equal(forward,reverse,group.path);
      assert.deepEqual(entries(selection(forward)),entries(p),forward);
      assert.equal(catalogHref(selection(forward)),forward);
    }
  }
  assert.equal(catalogHref('country=china&type=Электромобили'),'/catalog/electric?country=china');
});

test('models remain model pages with country, engine, years, ranges and text',()=>{
  const p=new URLSearchParams({brand:'Zeekr',model:'7X',country:'china',type:'Электромобили',yearFrom:'2023',priceTo:'40000',mileage:'До 50 000 км',text:'long range',drive:'Полный'});
  const href=catalogHref(p);
  assert.ok(href.startsWith('/catalog/zeekr/7x?'));
  assert.deepEqual(entries(selection(href,'7X')),entries(p));
  assert.equal(catalogHref(selection(href,'7X')),href);
});

test('all remaining filters, multiselections and exclusions survive route changes',()=>{
  const p=new URLSearchParams('brand=BYD&model=Seal&model=Han&body=Седан&body=Хэтчбек&color=Красный&color=Белый&country=KR&yearFrom=2021&yearTo=2025&priceFrom=15000&priceTo=45000&mileage=До 50 000 км&drive=Полный&owners=1 владелец&battery=От 60 кВт·ч&condition=Отличное&accel=До 5 с&tire=От 19&range=От 500 км&engine=1.5 л&power=От 200 л.с.&gearbox=Автомат&fuel=Бензин&text=long range&brandNot=Audi&modelNot=Song&bodyTypeNot=Купе&typeNot=Гибрид&driveNot=Передний&colorNot=Чёрный');
  const href=catalogHref(p),restored=selection(href);p.set('country','korea');
  assert.deepEqual(entries(restored),entries(p));
  assert.equal(catalogHref(restored),href);
  assert.ok(href.startsWith('/catalog/byd?'));
});

test('pagination preserves filters and selected sort even when the route default changes',()=>{
  for(const sort of ['default','price_asc','price_desc','newest','year_desc']) {
    const p=new URLSearchParams({brand:'Zeekr',model:'7X',country:'china',sort});
    for(const page of [1,2,5]) {
      const href=catalogHref(p,{page}),restored=selection(href,'7X');
      assert.equal(restored.get('country'),'china');
      assert.equal(catalogSort(restored,true),sort,href);
      assert.equal(Number(restored.get('page')||1),page);
    }
  }
  assert.equal(catalogHref('country=china&sort=default',{page:2}),'/catalog/china?page=2&sort=default');
});

test('query overrides path defaults, placeholders and tracking are not selection filters',()=>{
  const p=catalogUrlParams(findCatalogLanding('/catalog/byd'), 'brand=Audi&country=KR');
  assert.equal(p.get('brand'),'Audi');
  assert.equal(catalogHref(p),'/catalog/audi?country=korea');
  assert.equal(catalogHref('brand=Все марки&country=Все страны&type=Все&model=Все модели'),'/catalog');
  assert.equal(catalogHref('brand=Audi&utm_source=mail&nocount=1'),'/catalog/audi');
  assert.equal(catalogHref('brand=Audi&utm_source=mail',{tracking:true}),'/catalog/audi?utm_source=mail');
  assert.equal(catalogLocationKey('/catalog/audi','?country=china&yearFrom=2023&utm_source=mail'),catalogLocationKey('/catalog/audi','?yearFrom=2023&country=china'));
  assert.notEqual(catalogLocationKey('/catalog/audi','?country=china'),catalogLocationKey('/catalog/audi','?country=korea'));
});

test('server entry redirects preserve every filter, tracking and pagination without loops',()=>{
  for(const [landing,query,path] of [
    [null,'brand=Zeekr&model=7X&country=china&yearFrom=2023&page=2&utm_source=mail','/catalog'],
    [findCatalogLanding('/catalog/china'),'type=Электромобили','/catalog/china'],
    [{path:'/catalog/zeekr/7x',brand:'Zeekr',model:'7X'},'page=1&country=china&yearFrom=2023','/catalog/zeekr/7x'],
  ]) {
    const target=catalogRedirect(landing,query,path);assert.ok(target);
    const restored=selection(target,'7X');
    const original=catalogUrlParams(landing,query);original.delete('page');restored.delete('page');
    assert.deepEqual(entries(restored),entries(original));
    const url=new URL(target,'https://abcars.by');
    const parsed=parseModelLandingPath(url.pathname);
    assert.equal(catalogRedirect(parsed?{path:url.pathname,brand:parsed.brand,model:'7X'}:findCatalogLanding(url.pathname),url.search,url.pathname),null);
  }
});

test('the catalog HTTP entry uses the same destination without reading the database', async()=>{
  const {renderCatalogIndex}=await import('../server/catalog-page.mjs');
  const response=await renderCatalogIndex(new URLSearchParams('brand=Zeekr&model=7X&country=china&yearFrom=2023&utm_source=mail'));
  assert.equal(response.status,301);
  assert.equal(response.location,'/catalog/zeekr/7x?country=china&utm_source=mail&yearFrom=2023');
});

test('server model sorting agrees with the shared URL defaults and explicit sort', async()=>{
  const {modelListQuery}=await import('../server/model-page.mjs');
  for(const sort of ['default','price_desc','newest','year_desc']) {
    assert.equal(modelListQuery(new URLSearchParams({sort})).sort,sort);
  }
  assert.equal(modelListQuery(new URLSearchParams()).sort,'price_asc');
});
