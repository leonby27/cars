import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {pool} from '../server/db.mjs';
import {getCatalogMeta,clearCatalogCaches} from '../server/repository.mjs';

test('real SQL preserves brand, body, fuel and country counts when sharing the wide scan',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
 const db=new pg.Client({connectionString:url.href});await db.connect();const old=pool.query;let reads=0;
 try{
  await db.query('BEGIN');
  await db.query(`CREATE TEMP TABLE vehicles(id text,brand text,model text,powertrain text,drivetrain text,battery_kwh numeric,electric_range_km int,combined_range_km int,specifications jsonb);
   CREATE TEMP TABLE catalog_listings(id text,vehicle_id text,status text,source text,owners int,condition_grade text);
   INSERT INTO vehicles VALUES
    ('1','BMW','X1','ДВС','Передний',NULL,NULL,NULL,'{"bodyType":"Кроссовер","fuelType":"Бензин"}'),
    ('2','BMW','X3','ДВС','Полный',NULL,NULL,NULL,'{"bodyType":"Кроссовер","fuelType":"Дизель"}'),
    ('3','BYD','Han','Электромобиль','Передний',80,600,NULL,'{"bodyType":"Седан","fuelType":"Электричество"}'),
    ('4','BMW','i3','Электромобиль','Задний',40,350,NULL,'{"bodyType":"Седан","fuelType":"Электричество"}');
   INSERT INTO catalog_listings VALUES ('l1','1','active','Che168',1,NULL),('l2','2','active','Encar',1,NULL),('l3','3','active','Guazi',1,NULL),('l4','4','unavailable','Che168',1,NULL);`);
  pool.query=(...args)=>{reads++;return db.query(...args);};clearCatalogCaches();
  const all=await getCatalogMeta(null,null);
  assert.equal(all.total,3);assert.deepEqual(all.brands,[{brand:'BMW',count:2},{brand:'BYD',count:1}]);
  assert.deepEqual(all.countries,[{origin:'china',count:2},{origin:'korea',count:1}]);
  const bmw=await getCatalogMeta(null,'BMW');assert.equal(reads,3);assert.equal(bmw.total,2);
  assert.deepEqual(bmw.countries,[{origin:'china',count:1},{origin:'korea',count:1}]);
  const byd=await getCatalogMeta(null,'BYD');assert.equal(reads,4);assert.equal(byd.total,1);
  assert.deepEqual(byd.countries,[{origin:'china',count:1},{origin:'korea',count:0}]);
  const korea=await getCatalogMeta(null,'BMW',null,'korea');assert.equal(korea.total,1);assert.equal(korea.models[0].model,'X3');
  const ev=await getCatalogMeta('Электромобиль',null);assert.equal(ev.total,1);assert.deepEqual(ev.brands,[{brand:'BYD',count:1}]);
  const sedan=await getCatalogMeta(null,null,['Седан']);assert.equal(sedan.total,1);assert.deepEqual(sedan.countries,[{origin:'china',count:1},{origin:'korea',count:0}]);
 }finally{pool.query=old;clearCatalogCaches();await db.query('ROLLBACK');await db.end();}
});
