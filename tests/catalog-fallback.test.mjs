import assert from 'node:assert/strict';
import test from 'node:test';
import { captureCatalogFallback, readCatalogFallback, catalogFallbackKey } from '../src/catalog-fallback.js';

const fakeDocument = (canonical, html = '<h1>BYD</h1><a href="/cars/12">BYD Han</a>') => ({
  querySelector: (selector) => selector.startsWith('link') ? { href: canonical } : { innerHTML: html },
});

test('server catalog survives for its own route and page, ignoring tracking only', () => {
  captureCatalogFallback(fakeDocument('https://abcars.by/catalog/byd?page=2'), { href: 'https://abcars.by/catalog/byd?page=2&nocount=1' });
  assert.match(readCatalogFallback('https://abcars.by/catalog/byd?utm_source=google&page=2'), /\/cars\/12/);
  for (const href of ['/catalog/byd', '/catalog/byd?page=3', '/catalog', '/catalog/tesla?page=2', '/catalog/byd?page=2&model=Han', '/catalog/byd?page=2&sort=newest', '/account']) {
    assert.equal(readCatalogFallback(href), null, href);
  }
});

test('mismatched server pages and filtered requests cannot become fallback content', () => {
  for (const href of ['/catalog?page=2', '/catalog?model=Han', '/catalog?q=tesla', '/catalog?page=0', '/catalog?page=oops']) {
    captureCatalogFallback(fakeDocument('https://abcars.by/catalog'), { href });
    assert.equal(readCatalogFallback(href), null);
  }
  captureCatalogFallback({ querySelector: () => null }, { href: '/catalog' });
  assert.equal(readCatalogFallback('/catalog'), null);
  assert.equal(catalogFallbackKey('/catalog/?page=1'), catalogFallbackKey('/catalog'));
});
