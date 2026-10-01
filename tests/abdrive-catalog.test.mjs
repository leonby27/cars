import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createRussianCatalog} from '../server/abdrive/catalog.mjs';

test('RU catalog SQL: models belong to selected brand; year/mileage filters keep zero and exclude absent data', {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
 const db=new pg.Client({connectionString:url.href});await db.connect();
 const schema='abdrive_catalog_test_'+randomUUID().replaceAll('-','');
 try{
  await db.query('BEGIN');await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET LOCAL search_path TO ${schema}`);
  await db.query(`CREATE TABLE vehicles(id text PRIMARY KEY,brand text,model text,model_year int,powertrain text,drivetrain text,battery_kwh numeric,electric_range_km int,combined_range_km int,specifications jsonb);
   CREATE TABLE catalog_listings(id text PRIMARY KEY,vehicle_id text,source text,external_id text,source_url text,title text,city text,mileage_km int,price_cny numeric,source_payload jsonb,last_checked_at timestamptz,last_seen_at timestamptz,first_seen_at timestamptz,status text);
   CREATE TABLE listing_media(listing_id text,url text,position int);
   INSERT INTO vehicles(id,brand,model,model_year,powertrain) VALUES('1','BYD','Seal',2024,'Электромобиль'),('2','BYD','Han',2022,'Гибрид'),('3','Zeekr','001',2025,'Электромобиль'),('4','BMW','X3',2024,'ДВС'),('5','Buick','GL8',2024,'ДВС');
   INSERT INTO catalog_listings(id,vehicle_id,source,mileage_km,status,first_seen_at) VALUES('guazi-1','1','Guazi Global',0,'active',now()),('che168-2','2','Che168',NULL,'active',now()),('encar-3','3','Encar',20000,'active',now()),('encar-4','4','Encar',10000,'active',now()),('che168-5','5','Che168',10000,'active',now());`);
  await db.query(`ALTER TABLE catalog_listings ADD COLUMN owners int, ADD COLUMN condition_grade text;
   UPDATE vehicles SET drivetrain='Задний', specifications='{"bodyType":"Внедорожник","bodyColor":"Black","engineVolume":2,"enginePower":250,"fuelType":"Бензин","gearbox":"Автомат"}' WHERE brand='BMW';`);
  const catalog=createRussianCatalog(db);
  assert.deepEqual((await catalog.meta('BYD')).models.map(row=>row.model),['Han','Seal']);
  assert.deepEqual((await catalog.meta('Zeekr')).models.map(row=>row.model),['001']);
  assert.deepEqual((await catalog.meta()).models,[]);
  assert.equal((await catalog.meta('missing')).total,5);
  const selected=await catalog.list(new URLSearchParams({brand:'BYD',model:'Seal',yearMin:'2023',yearMax:'2024',mileageMax:'0',country:'china'}));
  assert.equal(selected.total,1);assert.equal(selected.cars[0].id,'guazi-1');assert.equal(selected.cars[0].mileage,0);
  assert.equal((await catalog.list(new URLSearchParams({brand:'BYD',model:'001'}))).total,0);
  assert.equal((await catalog.get('che168-2')).car.mileage,null);
  const multi=new URLSearchParams({brand:'BYD',limit:'1',offset:'1'});multi.append('model','Seal');multi.append('model','Han');
  const page=await catalog.list(multi);assert.equal(page.total,2);assert.equal(page.items.length,1);assert.equal(page.offset,1);assert.equal(page.hasMore,false);
  const advanced=new URLSearchParams({bodyType:'Внедорожник',color:'Black',engineMin:'1.5',powerMin:'200',fuel:'Бензин'});
  assert.deepEqual((await catalog.list(advanced)).items.map(car=>car.id),['encar-4']);
  advanced.append('brandNot','BMW');assert.equal((await catalog.list(advanced)).total,0);
  const sharedMeta=await catalog.sharedMeta(new URLSearchParams({brand:'BMW'}));
  assert.equal(sharedMeta.total,1);assert.deepEqual(sharedMeta.models.map(row=>row.model),['X3']);assert.equal(sharedMeta.availability.engine,1);
  assert.equal((await catalog.get('encar-4')).car.enginePower,250);

  for(const q of ['зикр 001','001 зикр','pbrh 001']){
   const found=await catalog.list(new URLSearchParams({q}));assert.equal(found.total,1,q);assert.equal(found.cars[0].brand,'Zeekr');
  }
  const keyboard=await catalog.list(new URLSearchParams({q:'иьц'}));assert.equal(keyboard.total,1);assert.equal(keyboard.cars[0].brand,'BMW');
  assert.equal((await catalog.list(new URLSearchParams({q:'3 млн'}))).total,0,'name search must not treat Russian money as a Belarus price');
 }finally{await db.query('ROLLBACK');await db.end();}
});
