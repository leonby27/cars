import test from 'node:test';
import assert from 'node:assert/strict';
import {getText} from '../scripts/lib/guazi-pilot-io.mjs';
import {chinaEnricher} from '../scripts/lib/guazi-china-enrichment.mjs';

const url = 'https://www.guazi.com/car-detail/c172894496111121.md';
test('known Chinese captcha is classified without following redirect; unrelated URLs remain forbidden', async () => {
  for (const [location, expected] of [
    ['https://uc.guazi.com/guazi-mall-ucenter/captcha?opaque=private', {code: 'CHINA_ACCESS_CHECK'}],
    ['https://other.example/car-detail/c172894496111121.md', /Unexpected/],
    ['http://127.0.0.1/private', /Unsafe source URL/],
  ]) {
    let requests = 0;
    await assert.rejects(getText(url, 'markdown', {fetchImpl: async () => {
      requests++;
      return new Response(null, {status: 307, headers: {location}});
    }}), expected);
    assert.equal(requests, 1);
  }
});

test('one optional captcha probe pauses concurrent requests, survives restart, then probes once after cooldown', async () => {
  let time = Date.parse('2026-09-26T17:00:00Z'), requests = 0, saved;
  const state = {}, events = [], index = {complete: true, entries: {'172894496': [url]}};
  const deps = {state, index, now: () => time, save: async () => { saved = structuredClone(state); }, event: async e => events.push(e), textLoader: async () => {
    requests++;
    throw Object.assign(Error('Access check'), {code: 'CHINA_ACCESS_CHECK'});
  }};
  const enrich = chinaEnricher(deps);
  const cards = Array.from({length: 8}, () => ({clueId: '172894496'}));
  await Promise.all(cards.map(card => enrich(card)));
  assert.equal(requests, 1);
  assert.equal(events.length, 1);
  assert.ok(cards.every(c => c.china.status === 'temporarily_unavailable'));
  assert.equal(saved.chinaPausedUntil, '2026-09-26T17:30:00.000Z');
  const restarted = chinaEnricher({...deps, state: structuredClone(saved)});
  await restarted({clueId: '172894496'});
  assert.equal(requests, 1);
  time += 30 * 60 * 1000;
  await Promise.all(cards.map(card => restarted(card)));
  assert.equal(requests, 2);
  assert.equal(events.length, 2);
  const existing = {clueId: '172894496', china: {status: 'matched', condition: {summaryRu: 'Сохранённое описание'}}};
  await restarted(existing);
  assert.equal(existing.china.condition.summaryRu, 'Сохранённое описание');
  assert.equal(requests, 2);
});
