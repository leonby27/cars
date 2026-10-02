import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { getSiteProfile, resolveSiteProfile, assertSiteProfile, contentForSite, hasSiteService } from '../config/sites/index.mjs';
import { databaseConfig } from '../server/database-config.mjs';
import { createOfferContext, offerContextKey } from '../src/markets/offer-context.js';
import { estimateMarketOffer } from '../src/markets/estimate-offer.js';
import { estimateLandedCost, setPricingQuotaOver, setPricingRefund50 } from '../src/pricing.js';
import { COMPANY } from '../src/company-data.js';
import { TOOL_PAGES } from '../src/tool-pages.js';
import { BLOG_POSTS } from '../src/blog-posts.js';
import { formatLeadMessage } from '../server/lead-message.mjs';
import { leadDeliveryConfig } from '../server/lead-delivery.mjs';

const by = getSiteProfile('abcars');
const ru = getSiteProfile('abdrive');
const root = new URL('../', import.meta.url);

test('one immutable registry selects the market; unknown and conflicting configurations fail', () => {
  assert.equal(resolveSiteProfile(), by);
  assert.equal(resolveSiteProfile({ SITE_ID:'abdrive', VITE_SITE_ID:'abdrive' }), ru);
  assert.equal(resolveSiteProfile({ VITE_SITE_ID:'abdrive' }), ru);
  assert.throws(() => resolveSiteProfile({ SITE_ID:'typo' }), /Unknown/);
  assert.throws(() => resolveSiteProfile({ SITE_ID:'abcars', VITE_SITE_ID:'abdrive' }), /must match/);
  assert.throws(() => resolveSiteProfile({ SITE_URL:'https://abdrive.ru' }), /another site profile/);
  assert.throws(() => resolveSiteProfile({ SITE_ID:'abdrive', SITE_URL:'https://abcars.by' }), /another site profile/);
  assert.throws(() => getSiteProfile('__proto__'), /Unknown/);
  assert.throws(() => { ru.destination.name = 'Минск'; }, TypeError);
  assert.equal(ru.destination.name, 'Москва');
  assert.equal(ru.currency, 'RUB');
  assert.equal(ru.company.phone, undefined);
  assert.equal(ru.leads.assignment, 'owner');
});

test('BY keeps its company, six tools and journal; no RU content fallback or enabled services', () => {
  assert.equal(COMPANY.brand, 'abcars.by');
  assert.equal(COMPANY.phoneHref, '+375256462163');
  assert.deepEqual(TOOL_PAGES.map(t => t.path), ['/ev-quota', '/customs', '/delivery-cost', '/china-brands', '/range', '/price-belarus']);
  assert.equal(BLOG_POSTS.length, 85);
  assert.equal(contentForSite(ru, { by:BLOG_POSTS }), null);
  assert.deepEqual(contentForSite(ru, { by:BLOG_POSTS, ru:[] }), []);
  assert.equal(hasSiteService(ru, 'quota'), false);
  assert.equal(hasSiteService(by, 'quota'), true);
  assert.equal(ru.flags.BLOG_ENABLED.local, false);
});

test('RU profile is admitted without waiting for feature completeness', () => {
  assert.equal(assertSiteProfile(by), by);
  assert.equal(assertSiteProfile(ru), ru);
  assert.throws(() => assertSiteProfile({ ...ru }), /registered profile/);
  const child = spawnSync(process.execPath, ['--input-type=module', '-e',
    'import { SITE } from "./src/site-profile.js"; import { estimateMarketOffer } from "./src/markets/estimate-offer.js"; console.log(JSON.stringify({ site:SITE.id, offer:estimateMarketOffer({}, {siteId:SITE.id}) }));'], {
    cwd:root, env:{ ...process.env, SITE_ID:'abdrive', VITE_SITE_ID:'abdrive', SITE_URL:'https://abdrive.ru' }, timeout:15000, encoding:'utf8',
  });
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout);
  assert.equal(output.site, 'abdrive');
  assert.equal(output.offer.status, 'unavailable');
  assert.equal(output.offer.calculation, null);
});

test('the database boundary retains one BY pool configuration and refuses premature separation', () => {
  const legacy = 'postgres://local/test';
  assert.deepEqual(databaseConfig(by, { DATABASE_URL:legacy }), { catalogUrl:legacy, siteUrl:legacy });
  assert.throws(() => databaseConfig(ru, { DATABASE_URL:legacy }), /refusing the legacy database/);
  assert.throws(() => databaseConfig(by, { DATABASE_URL:legacy, SITE_DATABASE_URL:'postgres://local/other' }), /requires migrating/);
  assert.throws(() => databaseConfig(by, { DATABASE_URL:legacy, CATALOG_DATABASE_URL:'postgres://local/other' }), /requires migrating/);
});

test('explicit BY offers preserve the existing calculation across sources and pricing scenarios', () => {
  const cars = [
    { source:'Che168', chinaPrice:100000, year:2024, type:'Электромобиль' },
    { source:'Che168', usdPrice:20000, year:2019, type:'ДВС', engine:'2.0L' },
    { source:'Che168', usdPrice:24000, year:2024, type:'Гибрид', sourceFuelType:'Range Extender' },
    { source:'Encar', sourceCurrency:'KRW', sourcePrice:25000000, year:2023, type:'ДВС', engineCc:1998 },
    { source:'Guazi', chinaPrice:181000, priceBasis:'FOB', fobPriceUsd:28748, fobPort:'Horgos', year:2023, type:'Электромобиль' },
  ];
  for (const car of cars) for (const quotaOver of [true,false]) for (const refund50 of [true,false]) {
    const offer = estimateMarketOffer(car, { siteId:'abcars', quotaOver, refund50 });
    assert.equal(offer.context.market, 'BY');
    assert.equal(offer.context.destinationId, 'minsk');
    assert.deepEqual(offer.calculation, estimateLandedCost(car, { quotaOver, refund50 }));
  }
});

test('server offer defaults do not depend on visitor pricing preferences', () => {
  const car = { source:'Che168', usdPrice:20000, year:2024, type:'Электромобиль' };
  const expected = estimateMarketOffer(car, { siteId:'abcars' });
  try {
    setPricingQuotaOver(false); setPricingRefund50(true);
    assert.deepEqual(estimateMarketOffer(car, { siteId:'abcars' }), expected);
  } finally { setPricingQuotaOver(true); setPricingRefund50(false); }
});

test('RU returns unavailable, never a Belarusian price; unsupported cities and BY options fail', () => {
  const result = estimateMarketOffer({ usdPrice:20000 }, { siteId:'abdrive' });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.calculation, null);
  assert.equal(result.context.destinationId, 'moscow');
  assert.equal(result.context.displayCurrency, 'RUB');
  assert.throws(() => createOfferContext({ siteId:'abdrive', destinationId:'minsk' }), /Unsupported destination/);
  assert.throws(() => createOfferContext({ siteId:'abdrive', destinationId:'kazan' }), /Unsupported destination/);
  assert.throws(() => createOfferContext({ siteId:'abdrive', refund50:false }), /Belarusian pricing options/);
  assert.throws(() => createOfferContext({ siteId:'abcars', quotaOver:'false' }), /boolean/);
  assert.throws(() => createOfferContext(), /Unknown SITE_ID/);
  const keys = [
    createOfferContext({ siteId:'abcars' }),
    createOfferContext({ siteId:'abcars', refund50:true }),
    createOfferContext({ siteId:'abcars', quotaOver:false }),
    createOfferContext({ siteId:'abdrive' }),
  ].map(offerContextKey);
  assert.equal(new Set(keys).size, 4);
});

test('RU owner notification names its site, destination and RUB quote without BY links', () => {
  const lead = { kind:'availability', contact:'+79991234567', car:{ id:'che168-12345', title:'Test car', price:3000000, priceCurrency:'RUB' } };
  const message = formatLeadMessage(lead, { site:ru });
  assert.match(message, /ABDrive/);
  assert.match(message, /Доставка: Москва/);
  assert.match(message, /вручную владельцем/);
  assert.match(message, /https:\/\/abdrive\.ru\/cars\/che168-12345/);
  assert.match(message, /₽/);
  assert.doesNotMatch(message, /abcars\.by|Минск|\$/);
  const untyped = formatLeadMessage({ ...lead, car:{ ...lead.car, priceCurrency:undefined } }, { site:ru });
  assert.doesNotMatch(untyped, /₽|\$/);
});

test('RU delivery requires an explicit owner chat and isolates its queue from BY', () => {
  assert.deepEqual(leadDeliveryConfig(by, {}, '/project'), { root:'/project' });
  assert.throws(() => leadDeliveryConfig(ru, { TELEGRAM_BOT_TOKEN:'legacy', TELEGRAM_CHAT_ID:'123' }, '/project'), /configured explicitly/);
  const config = leadDeliveryConfig(ru, { ABDRIVE_TELEGRAM_BOT_TOKEN:'test-token', ABDRIVE_TELEGRAM_CHAT_ID:'-123' }, '/project');
  assert.deepEqual(config, { root:'/project/runtime/sites/abdrive', token:'test-token', chatId:'-123' });
});
