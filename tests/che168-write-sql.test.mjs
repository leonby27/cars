import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { verifyChe168Observation } from '../scripts/lib/che168-public-check.mjs';
import { che168DetailUrl, che168PriceCny } from '../scripts/lib/che168-result.mjs';
import { writeChe168ListSnapshot, writeChe168Observations } from '../scripts/lib/che168-write.mjs';
import { quarantineListing } from '../scripts/lib/catalog-quarantine.mjs';

test('Che168 SQL preserves hidden data, commits verified price and sale, and rejects a stale replay', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query(`BEGIN;
      CREATE TEMP TABLE listings (
        id text PRIMARY KEY, source text, external_id text, status text,
        source_payload jsonb, price_cny integer, estimated_total_usd numeric,
        previous_price_usd numeric, sold_at timestamptz, last_checked_at timestamptz,
        last_seen_at timestamptz, content_changed_at timestamptz, price_changed_at timestamptz
      );
      CREATE TEMP TABLE price_history (listing_id text, observed_at timestamptz, price_cny integer,
        PRIMARY KEY (listing_id, observed_at));
      CREATE TEMP TABLE listing_media (listing_id text, url text);
      INSERT INTO listings (id, source, external_id, status, source_payload, price_cny, last_checked_at)
      SELECT 'che168-' || id, 'Che168', id, 'active', '{"usdPrice": 9000, "facts": "keep"}', 64400, '2026-11-18'
      FROM unnest(ARRAY['101', '102']) id;
      INSERT INTO listing_media VALUES ('che168-101', 'photo'), ('che168-102', 'photo');`);
    await quarantineListing(db, { source: 'Che168', externalId: '101', reason: 'detail-missing' });
    const { rows: [hidden] } = await db.query("SELECT * FROM listings WHERE external_id='101'");
    assert.equal(hidden.status, 'skipped');
    assert.equal(hidden.price_cny, 64400);
    assert.equal(hidden.sold_at, null);
    assert.equal(hidden.source_payload.facts, 'keep');
    assert.equal(hidden.last_checked_at.toISOString(), '2026-11-18T00:00:00.000Z');

    const amount = 23520;
    const scripts = [`[1,${JSON.stringify(JSON.stringify({ ssrCarDetail: { infoid: 101, price: amount } }))}])`];
    const alive = verifyChe168Observation('101', { url: che168DetailUrl('101'), status: 200, scripts, active: true });
    const sold = verifyChe168Observation('102', {
      url: che168DetailUrl('102'), status: 200, active: false, soldHeading: true, soldMessage: true,
      scripts: [`[1,${JSON.stringify(JSON.stringify({ ssrCarDetail: { infoid: 0 } }))}])`],
    });
    const checkedAt = new Date(Date.now() + 1000).toISOString();
    const activeUpdate = { id: 'che168-101', usd: amount, cny: che168PriceCny(amount), est: 31000,
      changed: true, significant: true, old_usd: 9000, evidence: { ...alive.evidence, observedAt: checkedAt } };
    await writeChe168Observations(db, [activeUpdate, { id: 'che168-102', sold: true, evidence: sold.evidence }]);
    const { rows: [saved, removed] } = await db.query('SELECT * FROM listings ORDER BY id');
    assert.equal(saved.status, 'active');
    assert.equal(saved.price_cny, che168PriceCny(amount));
    assert.equal(saved.source_payload.sourceAvailability.amount, amount);
    assert.equal(saved.source_payload.catalogQuarantine, undefined);
    assert.equal(saved.previous_price_usd, '9000');
    assert.equal(removed.status, 'unavailable');
    assert.equal(removed.source_payload.sourceAvailability.returnedId, '0');
    assert.equal(removed.price_cny, 64400);
    assert.ok(removed.sold_at);
    assert.equal((await db.query('SELECT * FROM price_history')).rowCount, 1);
    assert.equal((await db.query('SELECT * FROM listing_media')).rowCount, 2);

    await db.query('SAVEPOINT stale_update');
    await assert.rejects(writeChe168Observations(db, [
      { ...activeUpdate, evidence: { ...activeUpdate.evidence, observedAt: '2026-11-18T01:00:00.000Z' } },
    ]), { code: 'CHE168_INTEGRITY_FAILED' });
    await db.query('ROLLBACK TO SAVEPOINT stale_update');
    assert.equal((await db.query('SELECT * FROM price_history')).rowCount, 1);

    const at = new Date(Date.now() + 2000).toISOString();
    await db.query(`INSERT INTO listings (id, source, external_id, status, source_payload, price_cny, last_seen_at, last_checked_at)
      SELECT 'che168-' || id, 'Che168', id, 'active', '{"usdPrice": 18000, "facts": "preserve"}', 128700, '2026-11-18', '2026-11-18'
      FROM unnest(ARRAY['103','104','105']) id;`);
    const updates = [
      { id: 'che168-103', externalId: '103', previous: '18000', outcome: 'price', usd: 19000, cny: 135900, est: 24500, significant: true },
      { id: 'che168-104', externalId: '104', previous: '18000', outcome: 'hidden', reason: 'absent-from-list' },
      { id: 'che168-105', externalId: '105', previous: '18000', outcome: 'seen', reason: 'conflicting-list-prices' },
    ];
    await writeChe168ListSnapshot(db, updates, at);
    await writeChe168ListSnapshot(db, updates, at);
    const { rows: [repriced, absent, conflict] } = await db.query("SELECT * FROM listings WHERE external_id IN ('103','104','105') ORDER BY id");
    assert.equal(repriced.source_payload.usdPrice, 19000);
    assert.equal(repriced.source_payload.facts, 'preserve');
    assert.equal(repriced.estimated_total_usd, '24500');
    assert.equal(repriced.previous_price_usd, '18000');
    assert.equal(repriced.last_checked_at.toISOString(), '2026-11-18T00:00:00.000Z');
    assert.equal(repriced.last_seen_at.toISOString(), at);
    assert.equal(absent.status, 'skipped');
    assert.equal(absent.sold_at, null);
    assert.equal(absent.source_payload.usdPrice, 18000);
    assert.equal(absent.last_seen_at.toISOString(), '2026-11-18T00:00:00.000Z');
    assert.equal(conflict.status, 'active');
    assert.equal(conflict.source_payload.usdPrice, 18000);
    assert.equal((await db.query("SELECT * FROM price_history WHERE listing_id='che168-103'")).rowCount, 1);
    assert.equal((await db.query("SELECT * FROM price_history WHERE listing_id IN ('che168-104','che168-105')")).rowCount, 0);

    await db.query('SAVEPOINT stale_snapshot');
    await assert.rejects(writeChe168ListSnapshot(db, [{
      ...updates[0], previous: '19000',
    }], '2026-11-18T01:00:00.000Z'), { code: 'CHE168_SNAPSHOT_WRITE_CONFLICT' });
    await db.query('ROLLBACK TO SAVEPOINT stale_snapshot');

    const failedReturn = id => quarantineListing(db, {
      source: 'Che168', externalId: id, reason: 'required-fields-missing', checkedFrom: at, unavailableOnly: true,
    });
    assert.equal((await failedReturn('103')).rowCount, 0, 'a current active record is unchanged');
    assert.equal((await failedReturn('102')).rowCount, 1);
    const { rows: [returning] } = await db.query("SELECT status,sold_at,price_cny,last_checked_at FROM listings WHERE external_id='102'");
    assert.equal(returning.status, 'skipped');
    assert.equal(returning.sold_at, null);
    assert.equal(returning.price_cny, removed.price_cny);
    assert.deepEqual(returning.last_checked_at, removed.last_checked_at);
    assert.equal((await db.query("SELECT * FROM listing_media WHERE listing_id='che168-102'")).rowCount, 1);
  } finally {
    await db.query('ROLLBACK').finally(() => db.end());
  }
});
