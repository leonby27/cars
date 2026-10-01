import test from 'node:test';
import assert from 'node:assert/strict';
import {vehiclePublicFacts} from '../src/vehicle-public-facts.js';
import {publicCar} from '../server/abdrive/catalog.mjs';
const facts=row=>Object.fromEntries(vehiclePublicFacts(row).map(item=>[item.label,item.value]));

test('public vehicle facts preserve diesel, zero mileage and listing-specific color without exposing payload',()=>{
 const row={model_year:2024,powertrain:'ДВС',mileage_km:0,drivetrain:'AWD',specifications:{engine:'2.0T 190HP L4',transmission:'Automatic',bodyColor:'White',bodyType:'Sedan'},source_payload:{bodyColor:'Black',sourceFuelType:'Diesel',contact:'private',priceByn:12345}};
 const result=facts(row);
 assert.equal(result['Пробег'],'0 км');assert.equal(result['Топливо'],'Дизель');assert.equal(result['Объём двигателя'],'2 л');assert.equal(result['Мощность'],'190 л. с.');assert.equal(result['Цвет кузова'],'Чёрный');assert.equal(result['Привод'],'Полный');assert.equal(result['Коробка передач'],'Автомат');
 const car=publicCar(row,{detail:true});assert.ok(car.facts.length);assert.doesNotMatch(JSON.stringify(car),/private|12345|priceByn/);
 assert.equal(publicCar(row).facts,undefined,'catalog summaries stay compact');
});
test('electric vehicle does not inherit stale combustion fields and absent data is not invented',()=>{
 const result=facts({powertrain:'Электромобиль',battery_kwh:'82',electric_range_km:600,combined_range_km:600,specifications:{engine:'2.0T 190HP',enginePower:190,gearbox:'Автомат',fuelType:'Бензин'},source_payload:{horsepower:true}});
 assert.equal(result['Объём двигателя'],undefined);assert.equal(result['Топливо'],undefined);assert.equal(result['Мощность'],undefined);assert.equal(result['Коробка передач'],undefined);assert.equal(result['Пробег'],undefined);assert.equal(result['Привод'],undefined);
 assert.equal(result['Батарея'],'82 кВт·ч');assert.equal(result['Запас хода на электричестве'],'600 км');assert.equal(result['Общий запас хода'],undefined);
 assert.deepEqual(vehiclePublicFacts({}),[]);
});
