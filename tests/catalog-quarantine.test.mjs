import test from 'node:test';
import assert from 'node:assert/strict';
import { quarantineListing } from '../scripts/lib/catalog-quarantine.mjs';
import { createOrderDraft } from '../server/repository.mjs';
import { pool } from '../server/db.mjs';
import { expireUnseenListings } from '../server/crawler-maintenance.mjs';

test('quarantine hides only the specified source/card without modifying a quote, check date or media', async () => {
  const calls = [];
  await quarantineListing({ query: async (...args) => { calls.push(args); return { rowCount: 1 }; } },
    { source: 'Che168', externalId: '59011973', reason: 'identity-mismatch' });
  const [sql, values] = calls[0];
  assert.match(sql, /status='skipped'/);
  assert.match(sql, /WHERE source=\$1 AND external_id=\$2 AND status IN \('active','skipped'\)/);
  assert.doesNotMatch(sql, /last_checked_at=|price_cny=|DELETE|sold_at=now/);
  assert.deepEqual(values.slice(0, 2), ['Che168', '59011973']);
  assert.equal(JSON.parse(values[2]).reason, 'identity-mismatch');
  await assert.rejects(quarantineListing({ query: async () => { throw new Error('database offline'); } },
    { source: 'Encar', externalId: '123', reason: 'unverified' }), { stage: 'write' });
});

test('a stale open tab cannot submit a draft for a hidden/sold/disabled-source listing', async () => {
  const query = pool.query;
  const calls = [];
  pool.query = async (...args) => { calls.push(args); return { rows: [], rowCount: 0 }; };
  try {
    await assert.rejects(createOrderDraft({ listingId: 'che168-59011973', contact: 'test' }), { code: 'LISTING_UNAVAILABLE' });
    assert.equal(calls.length, 1, 'no crawl job or notification should follow a rejected insertion');
    assert.match(calls[0][0], /SELECT 1 FROM catalog_listings WHERE id=\$1 AND status='active'/);
  } finally { pool.query = query; }
});

test('an old observation only hides a listing; it never fabricates a sale or authorizes photo removal', async () => {
  const query = pool.query;
  let statement;
  pool.query = async sql => { statement = sql; return { rows: [], rowCount: 2 }; };
  try {
    assert.equal(await expireUnseenListings(30), 2);
    assert.match(statement, /status='skipped'/);
    assert.doesNotMatch(statement, /status='unavailable'|last_checked_at=|DELETE/);
  } finally { pool.query = query; }
});
