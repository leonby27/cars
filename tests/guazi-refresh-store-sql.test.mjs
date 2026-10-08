import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import pg from 'pg';
import { createGuaziRefreshStore } from '../scripts/lib/guazi-refresh-store.mjs';

test('real SQL skips and restores cars, preserves quotes, scopes sales and audits actual data', {skip:!process.env.TEST_DATABASE_URL}, async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
  const db=new pg.Client({connectionString:url.href});await db.connect();
  const id='guazi-bbbbbbbbbb', sourceUrl='https://en.guazi.com/products/tesla-bbbbbbbbbb.html';
  const row={id,externalId:'bbbbbbbbbb',sourceUrl};
  const payload={priceBasis:'FOB',fobPort:'Horgos',fobPriceUsd:28748,usdPrice:28748,refreshRun:'run',priceObservedAt:'2026-09-30',images:['https://global-image-pub.guazistatic-global.com/car.jpg']};
  try{
    await db.query('BEGIN');
    await db.query(`CREATE TEMP TABLE vehicles(id text PRIMARY KEY,brand text,model text,model_year int,powertrain text,specifications jsonb);
      CREATE TEMP TABLE listings(id text PRIMARY KEY,vehicle_id text,source text,external_id text,source_url text,status text,source_payload jsonb,sold_at timestamptz,last_checked_at timestamptz,content_changed_at timestamptz,price_cny int,mileage_km int,estimated_total_usd numeric);
      CREATE TEMP TABLE listing_media(listing_id text,url text);
      CREATE TEMP TABLE catalog_sources(source text,enabled boolean);
      CREATE TEMP TABLE catalog_hidden_duplicates(listing_id text);`);
    await db.query(`INSERT INTO vehicles VALUES($1,'Tesla','Model Y',2024,'Электромобиль','{}');`,[id]);
    await db.query(`INSERT INTO listings VALUES($1,$1,'Guazi','bbbbbbbbbb',$2,'active',$3,NULL,now(),now(),200000,25000,38000)`,[id,sourceUrl,JSON.stringify(payload)]);
    await db.query(`INSERT INTO listing_media VALUES($1,$2)`,[id,payload.images[0]]);
    const migration=await fs.readFile(new URL('../db/migrations/047_catalog_skipped.sql',import.meta.url),'utf8');
    // Create only a temporary view; never replace a real database view.
    await db.query(migration.replace('CREATE OR REPLACE VIEW catalog_listings','CREATE TEMP VIEW catalog_listings'));
    const withTransaction=fn=>fn(db);
    const store=createGuaziRefreshStore({pool:db,withTransaction,databaseUrl:url.href,upsertCar:async car=>{
      await db.query("UPDATE listings SET source_payload=$2,status='active',sold_at=NULL WHERE id=$1",[car.id,JSON.stringify(car)]);
    }});
    assert.equal((await store.snapshot()).length,1);
    assert.deepEqual(await store.audit({run:'run',results:[{id:'bbbbbbbbbb',outcome:'updated'}],expectedRemaining:1}),{active:1,invalid:0,mismatches:0});
    await store.markSkipped(row,{run:'run',reason:'fob_price_range',observedAt:'2026-10-08T06:00:00Z'});
    const skipped=(await db.query('SELECT * FROM listings WHERE id=$1',[id])).rows[0];
    assert.equal(skipped.status,'skipped');assert.equal(skipped.sold_at,null);assert.equal(skipped.source_payload.fobPriceUsd,28748);
    assert.equal(skipped.source_payload.priceObservedAt,'2026-09-30');assert.equal((await db.query('SELECT * FROM catalog_listings')).rowCount,0);
    assert.equal((await store.snapshot())[0].status,'skipped');
    await store.audit({run:'run',results:[{id:'bbbbbbbbbb',outcome:'skipped'}],expectedRemaining:0});
    const fresh={...row,...payload,source:'Guazi',chinaPrice:200000,checkedAt:'2026-10-08T06:01:00Z'};
    assert.equal((await store.upsert(fresh)).action,'reactivated');
    assert.equal((await db.query('SELECT * FROM catalog_listings')).rowCount,1);
    assert.equal((await db.query('SELECT source_payload FROM listings')).rows[0].source_payload.guaziSkip,undefined);
    // A missing photo or a mismatched result must fail rather than report success.
    await db.query('DELETE FROM listing_media');
    await assert.rejects(store.audit({run:'run',results:[{id:'bbbbbbbbbb',outcome:'updated'}],expectedRemaining:1}),{code:'GUAZI_INTEGRITY_FAILED'});
    await db.query('INSERT INTO listing_media VALUES($1,$2)',[id,payload.images[0]]);
    await assert.rejects(store.audit({run:'run',results:[{id:'bbbbbbbbbb',outcome:'unavailable'}],expectedRemaining:1}),{code:'GUAZI_INTEGRITY_FAILED'});
    await store.markSkipped(row,{run:'run',reason:'availability_unverified',observedAt:'2026-10-08T06:02:00Z'});
    await store.markUnavailable(row,{run:'run',observations:[{url:sourceUrl,rawData:{productId:'bbbbbbbbbb',displayStatus:1}}]});
    const sold=(await db.query('SELECT * FROM listings')).rows[0];assert.equal(sold.status,'unavailable');assert.ok(sold.sold_at);
    assert.equal(sold.source_payload.guaziSkip,undefined);
    await store.audit({run:'run',results:[{id:'bbbbbbbbbb',outcome:'unavailable'}],expectedRemaining:0});
    assert.equal((await db.query('SELECT * FROM catalog_listings')).rowCount,1); // sold retention remains supported
    await db.query("UPDATE listings SET source='Che168',status='active'");
    await store.markSkipped(row,{run:'run',reason:'test',observedAt:'2026-10-08T06:03:00Z'});
    assert.equal((await db.query('SELECT status FROM listings')).rows[0].status,'active');
  } finally {await db.query('ROLLBACK');await db.end();}
});
