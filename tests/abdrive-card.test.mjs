import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {russianPriceRows} from '../src/markets/ru-price-details.js';
const directory=resolve(process.env.ABDRIVE_BUILD_DIR||'dist-abdrive','ssr/entry-server.js');
const car={id:'che168-59371787',title:'Geely Test 2025',brand:'Geely',model:'Test',year:2025,type:'Бензин',city:'beijing',origin:'china',source:'Che168',mileage:100,images:[],facts:[],offer:{status:'estimated',ratesDate:'2026-10-01',totalAmount:4370000,currency:'RUB',rows:[{id:'purchase',label:'Автомобиль в Китае',amount:1677645},{id:'payment',amount:33553},{id:'origin',amount:70000},{id:'delivery',amount:210000},{id:'duty',label:'Пошлина',amount:1043691},{id:'customsFee',label:'Таможенный сбор',amount:13541},{id:'utilization',label:'Утилизационный сбор',amount:1142400},{id:'clearance',amount:100000},{id:'service',amount:70000}],assumptions:[]}};

test('RU price groups retain every payment and show documented uncertainty inside the shared rows',()=>{
 const rows=russianPriceRows(car);assert.equal(rows.length,7);assert.equal(rows.find(row=>row.id==='duty').value,'≈ 2 199 632 ₽');
 assert.match(rows.find(row=>row.id==='duty').description,/1 043 691 ₽.*13 541 ₽.*1 142 400 ₽/);
 const korean={...car,source:'Encar',origin:'korea',offer:{...car.offer,rows:[...car.offer.rows,{id:'sea',amount:85000}]}};
 assert.equal(russianPriceRows(korean).find(row=>row.id==='sea').value,'≈ 295 000 ₽');
 assert.equal(russianPriceRows(korean).find(row=>row.id==='origin').label,'Логистика в Корее');
 const fob={...car,offer:{...car.offer,rows:car.offer.rows.filter(row=>row.id!=='origin')}};assert.equal(russianPriceRows(fob).length,6);
 const range={...car,offer:{...car.offer,range:{min:3e6,max:5e6},inputs:{motorPower:{method:'unknown'}},rows:car.offer.rows.map(row=>row.id==='utilization'?{...row,minAmount:3400}:row)}};
 assert.match(russianPriceRows(range).find(row=>row.id==='duty').description,/30-минутной мощности/);
});

test('RU vehicle SSR reuses ABCars price, timing and CTA structure without Belarus copy',{skip:!existsSync(directory)},async()=>{
 const {render}=await import(pathToFileURL(directory).href);
 for(const offer of [car.offer,{status:'unavailable',currency:'RUB',reason:'engine_specs_missing'}]){
  const listing={...car,offer};const html=render({kind:'car',path:'/cars/59371787',car:listing,carId:listing.id,carValue:listing,leadEnabled:true});
  assert.match(html,/class="price-breakdown-card"/);assert.match(html,/class="delivery-card-heading"/);assert.match(html,/Срок доставки до.*Москвы/);
  assert.match(html,/availability-primary-cta/);assert.match(html,/Узнать точную цену и наличие/);assert.match(html,/account-link/);
  assert.doesNotMatch(html,/market-cost-rows|market-price-assumptions|НБРБ|Минск|Беларус|Указ №/);
  assert.match(html,/Частые вопросы/);
 }
});
