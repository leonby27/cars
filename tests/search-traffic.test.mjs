import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateSearchDays, readSearchTraffic, syncSearchTraffic, fetchGoogleSearchDays, fetchYandexSearchDays, searchTrafficRange, handleAnalyticsRequest } from '../worker/analytics.js';
const now = Date.parse('2026-09-07T21:30:00Z');
const env = { GOOGLE_SEARCH_CONSOLE_SITE:'sc-domain:abcars.by', GOOGLE_SEARCH_CLIENT_ID:'id', GOOGLE_SEARCH_CLIENT_SECRET:'private-secret', GOOGLE_SEARCH_REFRESH_TOKEN:'private-refresh', YANDEX_WEBMASTER_TOKEN:'private-yandex', YANDEX_WEBMASTER_HOST_ID:'https:abcars.by:443' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const sample = (day, count) => ({ day, total:count, queries:[{ value:'авто', count }], pages:[{ value:'https://abcars.by/catalog', count }] });
function memoryStore() {
  const data = new Map(); const states = new Map();
  return {
    async read(source, property, range) { const key = source + property; return { days:[...(data.get(key)?.values() || [])].filter((day) => day.day >= range.startDate && day.day <= range.endDate), state:states.get(key) }; },
    async save(source, property, days, state) { const key = source + property; if (!data.has(key)) data.set(key, new Map()); for (const day of days) data.get(key).set(day.day, day); states.set(key, state); },
    async fail(source, property, error) { const key = source + property; states.set(key, { ...states.get(key), error }); },
  };
}
test('calendar periods start on Minsk date and include exactly selected number of days', () => {
  assert.equal(searchTrafficRange('today', now).startDate, '2026-09-08');
  assert.equal(searchTrafficRange('yesterday', now).endDate, '2026-09-07');
  for (const days of [7, 30, 90]) {
    const range = searchTrafficRange(String(days), now);
    assert.equal((Date.parse(range.endDate) - Date.parse(range.startDate)) / 86400000 + 1, days);
  }
});
test('period aggregation sums stored days and reports gaps rather than false zeroes', () => {
  const result = aggregateSearchDays([sample('2026-09-01', 5), sample('2026-09-05', 7)], searchTrafficRange('7', now));
  assert.equal(result.total, 7); assert.equal(result.queries[0].count, 7);
  assert.equal(result.availableDays, 1); assert.equal(result.partial, true);
  assert.equal(aggregateSearchDays([], searchTrafficRange('today', now)).total, null);
});
test('archive replaces daily snapshots, retains old days, isolates properties and reset is unrelated', async () => {
  const store = memoryStore();
  await store.save('google', env.GOOGLE_SEARCH_CONSOLE_SITE, [sample('2026-07-01', 9), sample('2026-09-07', 3)], {});
  await store.save('google', env.GOOGLE_SEARCH_CONSOLE_SITE, [sample('2026-09-07', 5)], {});
  await store.save('google', 'other-site', [sample('2026-09-07', 100)], {});
  const report = await readSearchTraffic('90', env, store, { now });
  assert.equal(report.google.total, 14);
  assert.equal(report.yandex.total, null);
});
test('missing configuration triggers no external requests', async () => {
  const result = await syncSearchTraffic({}, memoryStore(), { fetcher:() => assert.fail('external request') });
  assert.equal(result.google.status, 'not_connected'); assert.equal(result.yandex.status, 'not_connected');
});
test('Google refreshes privately, gets separate totals/queries/pages, excludes CRM and fills published gaps', async () => {
  const result = await fetchGoogleSearchDays(env, { now, days:7, fetcher:async (url, options) => {
    if (String(url).includes('oauth2')) { assert.equal(options.body.get('refresh_token'), 'private-refresh'); return json({ access_token:'temporary' }); }
    const body = JSON.parse(options.body);
    assert.equal(body.startDate, '2026-09-02');
    assert.equal(body.dimensionFilterGroups[0].filters[0].operator, 'excludingRegex');
    const kind = body.dimensions[1];
    return json({ rows:[{ keys:kind ? ['2026-09-06', kind === 'query' ? 'авто' : 'https://abcars.by/catalog'] : ['2026-09-06'], clicks:kind === 'query' ? 2 : 5 }] });
  } });
  assert.equal(result.length, 5);
  assert.equal(result[0].total, 0);
  assert.equal(result.at(-1).total, 5); assert.equal(result.at(-1).queries[0].count, 2);
  assert.ok(!result.some((day) => day.day === '2026-09-08'));
});
test('Yandex reads both dimensions and excludes CRM from all aggregates', async () => {
  const result = await fetchYandexSearchDays(env, { fetcher:async (url, options) => {
    if (String(url).endsWith('/user')) return json({ user_id:123 });
    const body = JSON.parse(options.body);
    assert.equal(body.filters.text_filters[0].operation, 'TEXT_DOES_NOT_CONTAIN');
    return json({ count:1, text_indicator_to_statistics:[{ text_indicator:{ value:body.text_indicator === 'URL' ? 'https://abcars.by/catalog' : 'купить авто' }, statistics:[{ date:'2026-09-07', field:'CLICKS', value:4 }, { date:'2026-09-07', field:'IMPRESSIONS', value:50 }] }] });
  } });
  assert.equal(result[0].total, 4); assert.equal(result[0].pages.length, 1); assert.equal(result[0].queries.length, 1);
});
test('failed refresh retains history and does not leak upstream messages', async () => {
  const store = memoryStore();
  await store.save('google', env.GOOGLE_SEARCH_CONSOLE_SITE, [sample('2026-09-07', 8)], { lastSuccessAt:'2026-09-07T10:00:00Z' });
  const sync = await syncSearchTraffic(env, store, { now, fetcher:async () => json({ message:'private-secret' }, 403) });
  assert.equal(sync.google.status, 'error');
  const report = await readSearchTraffic('7', env, store, { now });
  assert.equal(report.google.total, 8); assert.equal(report.google.syncError, 'access_denied');
  assert.equal(report.google.lastSyncAt, '2026-09-07T10:00:00Z');
  assert.ok(!JSON.stringify(report).includes('private-secret'));
});
test('Sites report requires login even without storage', async () => {
  const url = new URL('https://abcars.by/api/analytics/search-traffic?period=7');
  const response = await handleAnalyticsRequest(new Request(url), { ANALYTICS_PASSWORD:'secret' }, url);
  assert.equal(response.status, 401);
});

test('service account requests only read access and signs the token assertion', async () => {
  const keys = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const encoded = Buffer.from(await crypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64');
  const account = {client_email:'reader@example.test',private_key:'-----BEGIN PRIVATE KEY-----\n'+encoded+'\n-----END PRIVATE KEY-----'};
  let verified=false;
  await fetchGoogleSearchDays({GOOGLE_SEARCH_CONSOLE_SITE:'sc-domain:abcars.by',GOOGLE_SEARCH_SERVICE_ACCOUNT_JSON:JSON.stringify(account)}, {now,fetcher:async(url,options)=>{
    if(String(url).includes('oauth2')){
      const assertion=options.body.get('assertion');const [head,body,signature]=assertion.split('.');
      const claim=JSON.parse(Buffer.from(body,'base64url'));
      assert.equal(claim.scope,'https://www.googleapis.com/auth/webmasters.readonly');
      assert.equal(claim.iss,account.client_email);
      verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',keys.publicKey,Buffer.from(signature,'base64url'),new TextEncoder().encode(head+'.'+body));
      return json({access_token:'temporary'});
    }
    return json({rows:[]});
  }});
  assert.equal(verified,true);
});

test('positions use impression weights, retain zero-click queries and reject missing metrics', () => {
  const day = (date, impressions, position) => ({ day:date, total:0, metricsVersion:2, queries:[{ value:'авто', count:0, impressions, position }] });
  const range = { startDate:'2026-09-01', endDate:'2026-09-02', days:2 };
  const result = aggregateSearchDays([day('2026-09-01', 1, 2), day('2026-09-02', 9, 12)], range);
  assert.equal(result.queries[0].position, 11);
  assert.equal(result.queries[0].impressions, 10);
  assert.equal(result.queries[0].count, 0);
  assert.equal(aggregateSearchDays([day('2026-09-01', 0, 0)], range).queries[0].position, null);
  assert.equal(aggregateSearchDays([day('2026-09-01', 1, 2), day('2026-09-02', 9, null)], range).queries[0].position, null);
  const legacy = aggregateSearchDays([day('2026-09-01', 1, 2), sample('2026-09-02', 2)], range);
  assert.equal(legacy.queries[0].position, null);
  assert.equal(legacy.queries[0].impressions, null);
});

test('position comparison requires complete adjacent periods and never treats missing query as rank zero', async () => {
  const store = memoryStore();
  const day = (date, position) => ({ day:date, total:1, metricsVersion:2, queries:[{value:'авто', count:1, impressions:10, position}] });
  await store.save('google', env.GOOGLE_SEARCH_CONSOLE_SITE, [day('2026-09-06', 12), day('2026-09-07', 5)], {});
  const report = await readSearchTraffic('yesterday', env, store, { now });
  assert.equal(report.google.queries[0].positionChange, 7);
  assert.equal(report.google.queries[0].previousPosition, 12);
  assert.equal(report.google.previousRange.endDate, '2026-09-06');
  const partial = await readSearchTraffic('7', env, store, {now});
  assert.equal(partial.google.queries[0].positionChange, null);
  const today = await readSearchTraffic('today', env, store, {now});
  assert.equal(today.google.status, 'pending');
  await store.save('google', env.GOOGLE_SEARCH_CONSOLE_SITE, [{...day('2026-09-06', 12), queries:[]}], {});
  assert.equal((await readSearchTraffic('yesterday', env, store, {now})).google.queries[0].positionChange, null);
});

test('Google backfills metrics for existing click-only archives once', async () => {
  const store = memoryStore();
  const config = {...env, YANDEX_WEBMASTER_HOST_ID:''};
  await store.save('google', env.GOOGLE_SEARCH_CONSOLE_SITE, [sample('2026-09-07', 1)], {lastSuccessAt:new Date(now).toISOString()});
  const starts = [];
  const fetcher = async (url, options) => {
    if (String(url).includes('oauth2')) return json({access_token:'temporary'});
    const body = JSON.parse(options.body); starts.push(body.startDate);
    return json({rows:[{keys:body.dimensions.length === 1 ? ['2026-09-07'] : ['2026-09-07','авто'], clicks:1, impressions:20, position:3.5}]});
  };
  await syncSearchTraffic(config, store, {now, fetcher});
  assert.equal(starts[0], '2026-03-13');
  const report = await readSearchTraffic('yesterday', config, store, {now});
  assert.equal(report.google.queries[0].position, 3.5);
  assert.equal(report.google.queries[0].impressions, 20);
  starts.length = 0;
  await syncSearchTraffic(config, store, {now, fetcher});
  assert.equal(starts[0], '2026-08-26');
});

test('Yandex joins daily fields regardless of order and preserves impressions without clicks', async () => {
  const days = await fetchYandexSearchDays(env, {fetcher:async (url) => String(url).endsWith('/user') ? json({user_id:123}) : json({count:1, text_indicator_to_statistics:[{text_indicator:{value:'авто'}, statistics:[
    {date:'2026-09-07',field:'POSITION',value:4.2},
    {date:'2026-09-06',field:'IMPRESSIONS',value:0},
    {date:'2026-09-07',field:'IMPRESSIONS',value:12},
    {date:'2026-09-06',field:'POSITION',value:0},
  ]}]})});
  const row = days.find(day => day.day === '2026-09-07').queries[0];
  assert.deepEqual(row, {value:'авто',count:0,impressions:12,position:4.2});
  assert.equal(days.find(day => day.day === '2026-09-06').queries[0].position, null);
});

test('delayed tail compares equal published prefixes without borrowing extra previous days', async () => {
  const store = memoryStore();
  const days = Array.from({length:13}, (_,i) => ({day:new Date(Date.UTC(2026,7,26+i)).toISOString().slice(0,10), total:1, metricsVersion:2,
    queries:[{value:'авто',count:1,impressions:10,position:i < 7 ? (i === 6 ? 100 : 10) : 5}]}));
  await store.save('google', env.GOOGLE_SEARCH_CONSOLE_SITE, days, {});
  const report = await readSearchTraffic('7', env, store, {now});
  assert.equal(report.google.comparisonDays, 6);
  assert.equal(report.google.previousRange.endDate, '2026-08-31');
  assert.equal(report.google.queries[0].positionChange, 5);
});
