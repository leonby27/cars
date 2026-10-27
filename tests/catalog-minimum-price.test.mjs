import test from 'node:test';
import assert from 'node:assert/strict';
import {pool} from '../server/db.mjs';
import {minimumPricedCar} from '../server/repository.mjs';
import {clearCatalogReadCache} from '../server/catalog-read-cache.mjs';
import {estimateLandedCost} from '../src/pricing.js';
import {modelAutoText, modelFaq, modelStockLine, modelCatalogSeo, priceFromText} from '../src/model-landing.js';

const row = {
  id:'che168-100', external_id:'100', source:'Che168', status:'active',
  brand:'BYD', model:'Han', model_year:2023, powertrain:'Электромобиль',
  price_cny:90000, city:'Гуанчжоу', images:['https://img.example/car.jpg'],
  source_payload:{technicalSpecs:{groups:[{title:'Полные данные'}]}},
};

test('minimum keeps one ascending lookup, live pricing and shared reads without fetching a maximum', async () => {
  const previous=pool.query, calls=[];
  clearCatalogReadCache();
  pool.query=async(sql,values)=>{calls.push({sql,values});await new Promise(setImmediate);return {rows:[row]};};
  try {
    const [a,b]=await Promise.all([minimumPricedCar(new URLSearchParams()),minimumPricedCar(new URLSearchParams())]);
    assert.deepEqual(a,b);
    assert.equal(a.id,row.id);
    assert.equal(a.chinaPrice,90000);
    assert.equal(a._summary,true);
    assert.equal('technicalSpecs' in a,false);
    assert.ok(estimateLandedCost(a).totalUsd>0);
    assert.equal(calls.length,1);
    assert.match(calls[0].sql,/FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id/);
    assert.match(calls[0].sql,/l.status='active'/);
    assert.match(calls[0].sql,/ORDER BY l.estimated_total_usd ASC NULLS LAST, l.id LIMIT 1$/);
    assert.doesNotMatch(calls[0].sql,/\bDESC\b|UNION ALL/);
    await minimumPricedCar(new URLSearchParams());
    assert.equal(calls.length,1);
  } finally {pool.query=previous;clearCatalogReadCache();}
});

test('minimum retains brand, model and country selection and handles an empty section', async () => {
  const previous=pool.query, calls=[];
  clearCatalogReadCache();
  pool.query=async(sql,values)=>{calls.push({sql,values});return {rows:[]};};
  try {
    const params=new URLSearchParams({brand:'BMW',model:'X5',country:'korea'});
    assert.equal(await minimumPricedCar(params),null);
    assert.equal(calls.length,1);
    assert.match(calls[0].sql,/v.brand=\$/);
    assert.match(calls[0].sql,/v.model=ANY\(\$/);
    assert.match(calls[0].sql,/l.source/);
    assert.ok(calls[0].values.flat().includes('BMW'));
    assert.ok(calls[0].values.flat().includes('X5'));
    assert.ok(calls[0].values.flat().includes('Encar'));
    await minimumPricedCar(new URLSearchParams({brand:'BMW',model:'X5',country:'china'}));
    assert.equal(calls.length,2);
    assert.ok(!calls[1].values.flat().includes('Encar'));
  } finally {pool.query=previous;clearCatalogReadCache();}
});

const facts={total:10,priceFrom:20000,priceTo:987654,priceP25:25000,priceP75:35000,powertrains:[],bodyTypes:[]};

test('model copy and FAQ use a live starting price without advertising a maximum',()=>{
  const input={name:'BYD Han',facts};
  const text=[modelStockLine(facts),...modelAutoText(input),...modelFaq(input).map(item=>item.a)].join('\n');
  assert.match(text,/от 20[\s  ]000 \$/);
  assert.doesNotMatch(text,/987[\s  ]654|от 20[\s  ]000 до/);
  assert.match(text,/Половина предложений укладывается в 25[\s  ]000–35[\s  ]000 \$/);
  assert.match(modelCatalogSeo({...input,brand:'BYD'}).title,/от 20[\s  ]000 \$/);
});

test('missing minimum never substitutes a stored maximum as a starting price',()=>{
  assert.equal(priceFromText(null),null);
  assert.equal(priceFromText(0),null);
  assert.equal(priceFromText(NaN),null);
  const missing={...facts,priceFrom:null,priceP25:null,priceP75:null};
  const input={name:'BYD Han',facts:missing};
  assert.doesNotMatch([modelStockLine(missing),...modelAutoText(input),...modelFaq(input).map(item=>item.a)].join('\n'),/987[\s  ]654/);
});
