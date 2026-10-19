import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pool} from '../server/db.mjs';
import {catalogYearRange, clearCatalogCaches} from '../server/repository.mjs';

test('section year range skips payload/spec aggregates and shares work by actual filters', async () => {
  const old = pool.query, calls = [];
  pool.query = async (sql, values) => {
    calls.push({sql, values});
    await new Promise(setImmediate);
    return {rows: [{year_min: values[0].includes('Encar') ? 2020 : 2021, year_max: 2027}]};
  };
  clearCatalogCaches();
  try {
    const korea = () => new URLSearchParams({country: 'korea'});
    const [a, b] = await Promise.all([catalogYearRange(korea()), catalogYearRange(korea())]);
    assert.deepEqual(a, {yearMin: 2020, yearMax: 2027});
    assert.deepEqual(a, b);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].values, [['Encar']]);
    assert.match(calls[0].sql, /min\(v.model_year\)/);
    assert.match(calls[0].sql, /max\(v.model_year\)/);
    assert.doesNotMatch(calls[0].sql, /source_payload|specifications|battery|torque|acceleration|count\(\*\)/);
    assert.deepEqual(await catalogYearRange(new URLSearchParams({country: 'china'})), {yearMin: 2021, yearMax: 2027});
    assert.equal(calls.length, 2);
    await catalogYearRange(korea());
    assert.equal(calls.length, 2);
    clearCatalogCaches();
    await catalogYearRange(korea());
    assert.equal(calls.length, 3);
  } finally {pool.query = old; clearCatalogCaches();}
});

test('empty sections keep missing years instead of reporting year zero', async () => {
  const old = pool.query;
  pool.query = async () => ({rows: [{year_min: null, year_max: null}]});
  clearCatalogCaches();
  try {assert.deepEqual(await catalogYearRange(new URLSearchParams()), {yearMin: null, yearMax: null});}
  finally {pool.query = old; clearCatalogCaches();}
});

test('section renderer requests only the year range and retains both SEO year fields', async () => {
  const source = await readFile(new URL('../server/catalog-page.mjs', import.meta.url), 'utf8');
  assert.match(source, /number === 1 \? catalogYearRange\(params\) : null/);
  assert.doesNotMatch(source, /modelSummary/);
  assert.match(source, /yearMin: summary\?\.yearMin/);
  assert.match(source, /yearMax: summary\?\.yearMax/);
});
