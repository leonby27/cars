import test from 'node:test';
import assert from 'node:assert/strict';
import { freshCatalogOrder, FRESH_CANDIDATE_LIMIT } from '../src/catalog-fresh.js';
import { freshCatalogQuery } from '../server/catalog-fresh.mjs';
import { sortCars } from '../src/car-filters.js';
import { pool } from '../server/db.mjs';
import { listCars, clearCatalogCaches } from '../server/repository.mjs';

const ids = cars => cars.map(car => car.id);
const car = (id, brand, model) => ({id:String(id), brand, model});

test('fresh rounds alternate brands and take each model once before chronological repeats', () => {
  const cars = [car(1,'Audi','Q3'), car(2,'Audi','Q3'), car(3,'Audi','A4'),
    car(4,'BMW','X5'), car(5,'BMW','X3'), car(6,'BMW','X5'),
    car(7,'Geely','Monjaro'), car(8,'Geely','Coolray'), car(9,'Audi','A3')];
  assert.deepEqual(ids(freshCatalogOrder(cars)), ['1','4','7','3','5','8','9','2','6']);
  assert.deepEqual(ids(cars), ['1','2','3','4','5','6','7','8','9']);
  assert.deepEqual(freshCatalogOrder(cars), freshCatalogOrder(cars));
});

test('freshness cap does not promote older brands and leaves the full tail intact', () => {
  const cars = Array.from({length:FRESH_CANDIDATE_LIMIT}, (_,i) => car(i,'Audi',`Q${i%4}`));
  cars.push(car(1000,'Geely','Monjaro'),car(1001,'BMW','X5'));
  const ordered = freshCatalogOrder(cars);
  assert.equal(ordered.length,cars.length);
  assert.equal(new Set(ids(ordered)).size,cars.length);
  assert.deepEqual(ids(ordered.slice(0,4)),['0','1','2','3']);
  assert.deepEqual(ids(ordered.slice(1000)),['1000','1001']);
  const pages = Array.from({length:Math.ceil(cars.length/48)}, (_,i) => ordered.slice(i*48,(i+1)*48));
  assert.deepEqual(ids(pages.flat()),ids(ordered));
});

test('empty, single-model and single-brand selections preserve cars and freshness', () => {
  assert.deepEqual(freshCatalogOrder([]),[]);
  const one = [car(1,'Audi','A4'),car(2,'Audi','A4')];
  assert.deepEqual(freshCatalogOrder(one),one);
  assert.deepEqual(ids(freshCatalogOrder([...one,car(3,'Audi','Q3')])),['1','3','2']);
  const dated = [car(1,'Audi','A4'),car(2,'Audi','Q3'),car(3,'BMW','X5')]
    .map((row,i)=>({...row,firstSeenAt:`2026-10-${10+i}`}));
  assert.deepEqual(ids(sortCars(dated,'fresh')),['3','2','1']);
  assert.deepEqual(ids(sortCars(dated,'newest')),['3','2','1']);
});

test('fresh API page has bounded ranking, one-row lookahead, shared cache and no summary dependency', async () => {
  const old = pool.query, calls = [];
  clearCatalogCaches();
  pool.query = async (sql,values) => {
    calls.push({sql,values});
    assert.ok(!sql.startsWith('SELECT count(*)'));
    return {rows:Array.from({length:values.at(-2)}, (_,i)=>({id:`encar-${i}`,source:'Encar',brand:'Audi',model:'A4',images:[]}))};
  };
  try {
    const params = new URLSearchParams({brand:'Audi',sort:'fresh',limit:'48',summary:'defer'});
    const result = await listCars(params);
    assert.equal(result.items.length,48);
    assert.equal(result.hasMore,true);
    assert.equal(result.summaryPending,true);
    assert.equal(result.total,null);
    assert.match(calls[0].sql,/ORDER BY l\.listed_at DESC NULLS LAST, l\.id LIMIT 1000\s*\)/);
    assert.ok(calls[0].sql.indexOf('LIMIT 1000')<calls[0].sql.indexOf('row_number()'));
    assert.deepEqual(calls[0].values.slice(-2),[49,0]);
    assert.ok(calls[0].values.includes('Audi'));
    await listCars(params);
    assert.equal(calls.length,1);
    params.delete('sort');await listCars(params);
    assert.equal(calls.length,1,'implicit and explicit fresh order share the same page cache');
    params.set('sort','newest');await listCars(params);
    assert.equal(calls.length,2);
    assert.ok(!calls[1].sql.includes('model_heads'));
    params.set('sort','fresh');params.set('offset','1000');await listCars(params);
    assert.ok(!calls[2].sql.includes('model_heads'));
    assert.deepEqual(calls[2].values.slice(-2),[49,1000]);
    params.set('offset','0');params.set('model','A4');await listCars(params);
    assert.ok(!calls[3].sql.includes('model_heads'),'a single model keeps the indexed chronological query');
  } finally {pool.query=old;clearCatalogCaches();}
});

test('fresh query binds filters and correctly scopes the chronological boundary tail', () => {
  const query = freshCatalogQuery({where:'WHERE v.brand=$1',values:['Audi'],limit:49,offset:960,carSelect:'SELECT l.id',poolWhere:'WHERE true'});
  assert.deepEqual(query.values,['Audi',49,960]);
  assert.equal((query.text.match(/WHERE v.brand=\$1/g)||[]).length,2);
  assert.match(query.text,/LIMIT \$3::int\+\$2::int/);
  assert.match(query.text,/OFFSET GREATEST\(\(SELECT count\(\*\) FROM candidates\), \$3::int\)/);
});

test('real SQL agrees with bounded brand/model rounds across filters and page boundaries', {skip:!process.env.TEST_DATABASE_URL}, async () => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
  const {default:pg} = await import('pg');
  const db = new pg.Pool({connectionString:process.env.TEST_DATABASE_URL, options:'-c default_transaction_read_only=on -c statement_timeout=5000'});
  const rows = Array.from({length:1105},(_,i)=>({id:String(i).padStart(5,'0'),vehicle_id:String(i).padStart(5,'0'),
    listed_at:new Date(1700000000000-Math.floor(i/3)*1000).toISOString(),brand:`Brand ${Math.floor(i/80)}`,model:`Model ${i%8}`}));
  const prefix = `WITH fixture AS MATERIALIZED (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id text,vehicle_id text,listed_at timestamptz,brand text,model text)),
    catalog_listings AS (SELECT * FROM fixture), listings AS (SELECT * FROM fixture), vehicles AS (SELECT id,brand,model FROM fixture), `;
  try {
    for (const size of [0,1,79,1000,1105]) for (const brand of [null,'Brand 0','Brand 12']) {
      const all = rows.slice(0,size), matches = row => brand===null || row.brand===brand;
      const expected = [...freshCatalogOrder(all.slice(0,1000).filter(matches)),...all.slice(1000).filter(matches)];
      const values = [JSON.stringify(all),...(brand?[brand]:[])], where=brand?'WHERE v.brand=$2':'WHERE true';
      for (const offset of [0,48,960,999]) {
        const query = freshCatalogQuery({where,values,limit:49,offset,carSelect:'SELECT l.id',poolWhere:'WHERE true'});
        const result = await db.query(prefix+query.text.replace(/^WITH /,''),query.values);
        assert.deepEqual(ids(result.rows),ids(expected.slice(offset,offset+49)),JSON.stringify({size,brand,offset}));
      }
    }
  } finally {await db.end();}
});
