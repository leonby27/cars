import test from 'node:test';
import assert from 'node:assert/strict';
import { positiveSourceAmount, sourceQuoteChange } from '../scripts/lib/source-money.mjs';
import { extractChe168DetailPayload, extractChe168ListPayload, buildChe168Car } from '../scripts/lib/che168-parser.mjs';
import { assertVerifiedChe168Car, che168DetailOutcome, che168DetailUrl } from '../scripts/lib/che168-result.mjs';
import { buildVerifiedChe168Car, checkChe168PublicPage, CHE168_ACTIVE_TITLE, CHE168_DETAIL_READY, CHE168_SOLD_HEADING, CHE168_SOLD_MESSAGE } from '../scripts/lib/che168-public-check.mjs';
import { che168IdentityGuard, validateChe168CheckBatch } from '../scripts/lib/che168-integrity.mjs';
import { writeChe168Observations } from '../scripts/lib/che168-write.mjs';
import { upsertCar } from '../server/repository.mjs';
import { readFileSync } from 'node:fs';
import { checkPendingListings } from '../scripts/lib/refresh-cycle.mjs';

const flight = data => `self.__next_f.push([1,${JSON.stringify(`20:${JSON.stringify(data)}`)}])`;
const id = '59011973';
test('a reporting threshold never freezes a real small source-price change', () => {
  assert.deepEqual(sourceQuoteChange(23000, 23010), { changed: true, significant: false });
  assert.deepEqual(sourceQuoteChange(23000, 23000), { changed: false, significant: false });
  assert.deepEqual(sourceQuoteChange(9000, 23000), { changed: true, significant: true });
  assert.deepEqual(sourceQuoteChange(null, 23000), { changed: true, significant: true });
  assert.throws(() => sourceQuoteChange(23000, 'contact us'));
});
test('price labels, ranges, signs, foreign currency and malformed grouping never become prices', () => {
  for (const value of [null, undefined, true, [], {}, '', 'Contact us', 'from 9000', '9,000–10,000', '9,00',
    '9 000', '-9000', '9e3', '¥9000', '₩9000', '9000/month', '0', 'NaN', Infinity, -9000, 0]) {
    assert.equal(positiveSourceAmount(value), null, String(value));
    assert.equal(positiveSourceAmount(value, { dollars: true }), null, String(value));
  }
  assert.equal(positiveSourceAmount('9,000.50'), 9000.5);
  assert.equal(positiveSourceAmount(9000), 9000);
  for (const value of ['$28,748', '$$29,106', 'USD 28,748', '28,748 USD']) {
    assert.ok(positiveSourceAmount(value, { dollars: true }) > 28000);
    assert.equal(positiveSourceAmount(value), null);
  }
});

test('null detail/list/specs never borrow objects or arrays from recommendations', () => {
  const recommendations = [{ infoid: 60541818, price: '9000' }];
  assert.equal(extractChe168DetailPayload([flight({ ssrCarDetail: null, recommendations })]), null);
  assert.equal(extractChe168ListPayload([flight({ ssrCars: null, recommendations })]), null);
  assert.deepEqual(extractChe168DetailPayload([flight({ ssrCarDetail: { infoid: id, price: '23000' },
    ssrSpecParam: null, recommendations })]), { detail: { infoid: id, price: '23000' }, specGroups: [] });
});

test('wrong ID, missing price, malformed price, shell and truncated real response never prove availability or sale', () => {
  assert.deepEqual(che168DetailOutcome({ detail: { infoid: id, price: '23000' } }, id, 200), { verdict: 'alive', price: 23000 });
  for (const price of [null, undefined, '', 'Contact us', '-9000', '9000-10000']) {
    assert.equal(che168DetailOutcome({ detail: { infoid: id, price } }, id, 200).verdict, 'unknown');
  }
  assert.equal(che168DetailOutcome({ detail: { infoid: 60541818, price: '9000' } }, id, 200).reason, 'identity-mismatch');
  const truncated = readFileSync(new URL('./fixtures/che168-detail-gone.txt', import.meta.url), 'utf8');
  for (const text of [truncated, '3:I[4707,[],""]\n' + 'x'.repeat(3000)]) {
    assert.equal(che168DetailOutcome(extractChe168DetailPayload([`[1,${JSON.stringify(text)}])`]), id, 200).verdict, 'unknown');
  }
  for (const status of [0, 404, 429, 500]) {
    assert.equal(che168DetailOutcome({ detail: { infoid: id, price: 9000 } }, id, status).verdict, 'unknown');
  }
  assert.throws(() => buildChe168Car({ detail: { infoid: 60541818 } }, { expectedId: id }), { code: 'CHE168_IDENTITY_MISMATCH' });
});

function pageFixture({ status = 200, redirected = false, heading = false, message = false, payload = null, fail = false, active = Boolean(payload?.ssrCarDetail) && !heading } = {}) {
  let url;
  const textLocator = matches => ({
    filter: options => { assert.deepEqual(options, { visible: true }); return textLocator(matches.filter(Boolean)); },
    first: () => textLocator(matches.slice(0, 1)),
    waitFor: async () => { if (matches.length > 1) throw Error('strict mode violation: three matching elements'); },
    isVisible: async () => { if (matches.length > 1) throw Error('strict mode violation: three matching elements'); return matches[0] === true; },
  });
  return {
    goto: async target => { if (fail) throw Error('timeout'); url = redirected ? 'https://global.che168.com/en' : target; return { status: () => status }; },
    url: () => url,
    getByText: (text, options) => {
      assert.deepEqual(options, { exact: true });
      const visible = text === CHE168_SOLD_HEADING ? heading : text === CHE168_SOLD_MESSAGE && message;
      // Real source DOM, 2026-11-19: hidden SSR + visible desktop + hidden mobile.
      return textLocator([false, visible, false]);
    },
    locator: selector => {
      if (selector === 'script') return { allTextContents: async () => payload ? [flight(payload)] : [] };
      if (selector === CHE168_ACTIVE_TITLE) return textLocator([active]);
      assert.equal(selector, CHE168_DETAIL_READY);
      return textLocator([heading || active]);
    },
  };
}

test('public fallback requires both visible sold messages on the exact successful detail URL', async () => {
  const result = await checkChe168PublicPage(pageFixture({ heading: true, message: true }), id);
  assert.equal(result.verdict, 'sold');
  assert.equal(result.evidence.externalId, id);
  assert.equal(result.evidence.source, 'public-sold-panel');
  for (const config of [{}, { heading: true }, { message: true }, { status: 404, heading: true, message: true },
    { redirected: true, heading: true, message: true }, { fail: true }]) {
    assert.equal((await checkChe168PublicPage(pageFixture(config), id)).verdict, 'unknown');
  }
  const soldRecommendations = { ssrCarDetail: null, recommendations: [{ infoid: 60541818, price: 9000 }] };
  assert.equal((await checkChe168PublicPage(pageFixture({ payload: soldRecommendations }), id)).verdict, 'unknown');
  assert.equal((await checkChe168PublicPage(pageFixture({ payload: { ssrCarDetail: { infoid: id, price: 23520 } } }), id)).price, 23520);
  assert.equal((await checkChe168PublicPage(pageFixture({ payload: { ssrCarDetail: { infoid: 60541818, price: 9000 } } }), id)).verdict, 'unknown');
  assert.equal((await checkChe168PublicPage(pageFixture({ heading: true, message: true,
    payload: { ssrCarDetail: { infoid: 60541818, price: 9000 } } }), id)).verdict, 'unknown');
  const retainedPrice = { ssrCarDetail: { infoid: id, price: 23520 } };
  assert.equal((await checkChe168PublicPage(pageFixture({ heading: true, message: true, payload: retainedPrice }), id)).verdict, 'sold');
  assert.equal((await checkChe168PublicPage(pageFixture({ heading: true, payload: retainedPrice }), id)).verdict, 'unknown');
});

test('the same-ID payload with a retained price is not positive evidence without a visible active card', async () => {
  const payload = { ssrCarDetail: { infoid: id, price: 23520 } };
  const hidden = await checkChe168PublicPage(pageFixture({ payload, active: false }), id);
  assert.equal(hidden.reason, 'public-active-title-missing');
  assert.equal(hidden.sample.priceUsd, 23520);
  assert.match(hidden.sample.digest, /^[a-f0-9]{64}$/);
  const conflict = await checkChe168PublicPage(pageFixture({ payload, active: true, heading: true, message: true }), id);
  assert.equal(conflict.reason, 'public-status-conflict');
});

test('sold Che168 pages with the observed service ID 0 use the normal sale write', async () => {
  const writes = [];
  const db = { query: async (_sql, [json]) => {
    const batch = JSON.parse(json);
    writes.push(...batch);
    return { rowCount: batch.length };
  } };
  for (const [externalId, placeholder] of [['60325335', 0], ['58084416', '0']]) {
    const result = await checkChe168PublicPage(pageFixture({
      heading: true, message: true, payload: { ssrCarDetail: { infoid: placeholder } },
    }), externalId);
    assert.equal(result.verdict, 'sold');
    assert.equal(result.evidence.returnedId, '0');
    await writeChe168Observations(db, [{ id: `che168-${externalId}`, sold: true, evidence: result.evidence }]);
  }
  assert.deepEqual(writes.map(row => row.id), ['che168-60325335', 'che168-58084416']);
});

test('ID 0 alone hides a card and does not trip the repeated foreign listing guard', async () => {
  const ids = ['60325335', '58084416', '57964510'];
  const rows = ids.map(external_id => ({ id: `che168-${external_id}`, external_id }));
  const hidden = [];
  const guard = che168IdentityGuard();
  const result = await checkPendingListings(rows, {
    check: externalId => checkChe168PublicPage(pageFixture({
      active: true, payload: { ssrCarDetail: { infoid: 0, price: 9000 } },
    }), externalId),
    persist: () => assert.fail('an unverified card must not be published or recorded as sold'),
    quarantine: async (row, outcome) => {
      assert.equal(outcome.reason, 'placeholder-id');
      assert.equal(outcome.returnedId, '0');
      guard(outcome, row.external_id);
      hidden.push(row.external_id);
    },
  });
  assert.equal(result.sold, 0);
  assert.equal(result.unknown, 3);
  assert.deepEqual([...hidden].sort(), [...ids].sort());
  assert.equal(che168DetailUrl('0'), null);
  // Contradictory signs on the same page still require another check.
  const conflict = await checkChe168PublicPage(pageFixture({
    active: true, heading: true, message: true, payload: { ssrCarDetail: { infoid: 0 } },
  }), ids[0]);
  assert.equal(conflict.reason, 'public-status-conflict');
});

test('the incident pattern stops a package before writing multiple bad quotes', async () => {
  const observed = JSON.parse(readFileSync(new URL('./fixtures/che168-volvo-xc60-2026-11-19.json', import.meta.url)));
  const listings = observed.listings.slice(0, 12);
  const rows = listings.map(item => ({
    id: `che168-${item.externalId}`, external_id: item.externalId, usd_price: item.previousSourcePriceUsd,
  }));
  let writes = 0;
  await assert.rejects(checkPendingListings(rows, {
    batchSize: 24,
    check: externalId => checkChe168PublicPage(pageFixture({ payload: { ssrCarDetail: { infoid: externalId, price: 9000 } } }), externalId),
    persistBatch: async checks => {
      validateChe168CheckBatch(checks);
      writes += 1;
    },
  }), { code: 'CHE168_INTEGRITY_FAILED' });
  assert.equal(writes, 0);
});

test('three different requested IDs with the same foreign object are a source integrity failure', async () => {
  const guard = che168IdentityGuard();
  for (const id of ['56810049', '59203765', '59137378']) {
    const outcome = await checkChe168PublicPage(pageFixture({ payload: { ssrCarDetail: { infoid: 60541818, price: 21390 } } }), id);
    assert.equal(outcome.returnedId, '60541818');
    if (id === '59137378') assert.throws(() => guard(outcome, id), { code: 'CHE168_INTEGRITY_FAILED' });
    else guard(outcome, id);
  }
});

test('catalog writers reject direct insert and sale when the evidence does not match the record', async () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/che168-english-specs.json', import.meta.url)));
  const payload = fixtures.payloads[0];
  const id = String(payload.detail.infoid);
  const result = await checkChe168PublicPage(pageFixture({ payload: { ssrCarDetail: payload.detail, ssrSpecParam: payload.specGroups } }), id);
  const car = buildVerifiedChe168Car(result);
  assertVerifiedChe168Car(car);
  assert.equal(car.sourceAvailability.url, che168DetailUrl(id));
  const db = { query: async () => assert.fail('invalid observation reached SQL') };
  await assert.rejects(upsertCar({ ...car, sourceAvailability: undefined }, db), { code: 'CHE168_INTEGRITY_FAILED' });
  await assert.rejects(upsertCar({ ...car, usdPrice: 9000 }, db), { code: 'CHE168_INTEGRITY_FAILED' });
  await assert.rejects(writeChe168Observations(db, [{ id: car.id, sold: true, evidence: car.sourceAvailability }]), { code: 'CHE168_INTEGRITY_FAILED' });
});

test('a new forced detail round removes the 21 observed sold XC60 without accepting recommendation prices', async () => {
  const observed = JSON.parse(readFileSync(new URL('./fixtures/che168-volvo-xc60-2026-11-19.json', import.meta.url)));
  assert.equal(observed.listings.length, 21);
  const rows = observed.listings.map(item => ({ id: `che168-${item.externalId}`, external_id: item.externalId,
    status: 'active', usd_price: item.incidentSourcePriceUsd }));
  const removed = [];
  const result = await checkPendingListings(rows, {
    check: async externalId => {
      const recommendations = { ssrCarDetail: null, recommendations: [{ infoid: 60541818, price: '9000' }] };
      return checkChe168PublicPage(pageFixture({ heading: true, message: true, payload: recommendations }), externalId);
    },
    persist: async (row, outcome) => { assert.equal(outcome.verdict, 'sold'); assert.equal(outcome.price, undefined); removed.push(row.id); },
    quarantine: async () => assert.fail('all 21 have positive sale evidence'),
  });
  assert.equal(result.sold, 21);
  assert.equal(result.unknown, 0);
  assert.equal(result.verified.size, 21);
  assert.equal(new Set(removed).size, 21);
});
