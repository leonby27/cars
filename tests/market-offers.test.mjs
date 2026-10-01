import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createOfferRepository, dataVersion, sourceVersion, offerIdentity } from '../server/catalog/offer-repository.mjs';

const identity = (siteId='abcars', source='source-1') => ({
  listingId:'che168-1', context:{ siteId },
  versions:{ source, rules:'rules-1', rates:'rates-1', tariffs:'tariffs-1', valuationDate:'2026-10-01' },
});

test('source versions ignore BY totals, change with FOB/spec changes and ignore object key order', () => {
  const row={id:'x',source:'Guazi',price_cny:100000,source_payload:{fobPriceUsd:20000},specifications:{enginePower:150}};
  assert.equal(dataVersion({a:1,b:2}), dataVersion({b:2,a:1}));
  assert.equal(sourceVersion(row), sourceVersion({...row,estimated_total_usd:999999}));
  assert.notEqual(sourceVersion(row), sourceVersion({...row,source_payload:{fobPriceUsd:21000}}));
  assert.notEqual(sourceVersion(row), sourceVersion({...row,specifications:{enginePower:200}}));
  assert.throws(() => offerIdentity({...identity(), versions:{}}), /valuationDate/);
  assert.throws(() => offerIdentity({...identity(), versions:{...identity().versions,valuationDate:'2026-02-31'}}), /Invalid valuationDate/);
});

test('invalid quotes are rejected before a database call', async () => {
  const repository=createOfferRepository({query(){throw new Error('should not query');}});
  await assert.rejects(repository.save({...identity(),status:'estimated',totalAmount:0,calculation:{}}), /Invalid estimated/);
  await assert.rejects(repository.save({...identity('abdrive'),status:'unavailable',totalAmount:20000,reason:'pending'}), /must not contain a price/);
});

test('PostgreSQL: independent markets, exact versions, idempotency and no legacy price changes', {skip:!process.env.TEST_DATABASE_URL}, async () => {
  const url=new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Only an explicit loopback test database is allowed');
  const db=new pg.Client({connectionString:url.href});await db.connect();
  try {
    await db.query('BEGIN');
    await db.query('CREATE SCHEMA abdrive_offer_test');
    await db.query('SET LOCAL search_path TO abdrive_offer_test');
    await db.query('CREATE TABLE listings(id text PRIMARY KEY, estimated_total_usd int)');
    await db.query("INSERT INTO listings VALUES ('che168-1', 23000)");
    await db.query(await readFile(new URL('../db/market/001_offers.sql',import.meta.url),'utf8'));
    const repository=createOfferRepository(db);
    const by=await repository.save({...identity(),status:'estimated',totalAmount:70000,calculation:{totalUsd:23000}});
    const ru=await repository.save({...identity('abdrive'),status:'unavailable',reason:'tariffs_pending'});
    assert.equal(ru.currency,'RUB');assert.equal(ru.total_amount,null);
    const repeat=await repository.save({...identity(),status:'estimated',totalAmount:999999,calculation:{totalUsd:999999}});
    assert.equal(Number(repeat.total_amount),70000);assert.deepEqual(repeat.calculated_at,by.calculated_at);
    const changed={...identity(),versions:{...identity().versions,rates:'rates-2'}};
    assert.equal(await repository.find(changed),null);
    await repository.save({...changed,status:'estimated',totalAmount:71000,calculation:{totalUsd:23100}});
    assert.equal(Number((await repository.find(identity())).total_amount),70000);
    assert.equal(await repository.find(identity('abcars','source-2')),null);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM market_offers')).rows[0].n,3);
    assert.equal((await db.query('SELECT estimated_total_usd FROM listings')).rows[0].estimated_total_usd,23000);
  } finally {await db.query('ROLLBACK');await db.end();}
});
