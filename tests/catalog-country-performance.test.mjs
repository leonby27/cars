import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pool} from '../server/db.mjs';
import {listCars, clearCatalogCaches} from '../server/repository.mjs';

test('section years share the count scan, skip payload/spec aggregates and respect country filters', async () => {
  const old = pool.query, calls = [];
  pool.query = async (sql, values) => {
    calls.push({sql, values});
    await new Promise(setImmediate);
    return {rows: sql.startsWith('SELECT count(*)') ? [{total:90,year_min: values[0].includes('Encar') ? 2020 : 2021, year_max: 2027}] : []};
  };
  clearCatalogCaches();
  try {
    const korea = () => new URLSearchParams({country: 'korea'});
    const years=params=>listCars(params,{includeYears:true});
    const [a, b] = await Promise.all([years(korea()), years(korea())]);
    assert.equal(a.yearMin,2020);assert.equal(a.yearMax,2027);
    assert.deepEqual(a, b);
    assert.equal(calls.length, 2,'only the card batch and its count');
    const count=calls.find(call=>call.sql.startsWith('SELECT count(*)'));
    assert.deepEqual(count.values, [['Encar']]);
    assert.match(count.sql, /min\(v.model_year\)/);
    assert.match(count.sql, /max\(v.model_year\)/);
    assert.doesNotMatch(count.sql, /source_payload|specifications|battery|torque|acceleration/);
    assert.equal((await years(new URLSearchParams({country: 'china'}))).yearMin,2021);
    assert.equal(calls.length, 4);
    await years(korea());
    assert.equal(calls.length, 4);
    clearCatalogCaches();
    await years(korea());
    assert.equal(calls.length, 6);
  } finally {pool.query = old; clearCatalogCaches();}
});

test('empty sections keep missing years; ordinary API responses keep their existing shape', async () => {
  const old = pool.query;
  pool.query = async sql => ({rows: sql.startsWith('SELECT count(*)') ? [{total:0,year_min:null,year_max:null}] : []});
  clearCatalogCaches();
  try {
    const page=await listCars(new URLSearchParams(),{includeYears:true});
    assert.equal(page.yearMin,null);assert.equal(page.yearMax,null);
    const api=await listCars(new URLSearchParams());
    assert.equal('yearMin' in api,false);assert.equal('yearMax' in api,false);
    assert.equal(api.total,0);
  } finally {pool.query = old; clearCatalogCaches();}
});

test('section renderer reuses listing years and retains both SEO year fields', async () => {
  const source = await readFile(new URL('../server/catalog-page.mjs', import.meta.url), 'utf8');
  assert.match(source, /includeYears:true/);
  assert.doesNotMatch(source, /catalogYearRange|modelSummary/);
  assert.match(source, /yearMin: number === 1 \? list.yearMin/);
  assert.match(source, /yearMax: number === 1 \? list.yearMax/);
});
