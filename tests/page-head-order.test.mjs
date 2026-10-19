import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSeoRenderer, insertPageHead} from '../server/seo-render.mjs';

const shell = await readFile(new URL('../index.html', import.meta.url), 'utf8');
test('published metadata precedes resources and executable scripts without duplicates', () => {
  const renderer = createSeoRenderer({shell, siteUrl: 'https://abcars.by', allowIndexing: true});
  for (const route of ['/catalog/china','/cars/123','/blog/example','/customs']) {
    const html = renderer.renderHtml({title: 'Название & проверка', description: 'Описание & проверка', canonical: `https://abcars.by${route}`, body: '<h1>Заголовок</h1>', schemas: [{'@type': 'WebPage', name: 'Проверка'}]});
    const charset = html.indexOf('<meta charset='), viewport = html.indexOf('<meta name="viewport"');
    const title = html.indexOf('<title>'), description = html.indexOf('<meta name="description"');
    const firstResource = html.indexOf('<link'), firstScript = html.indexOf('<script');
    assert.ok(charset < viewport && viewport < title && title < description);
    assert.ok(description < firstResource && description < firstScript);
    for (const match of html.matchAll(/<meta (?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"/g)) assert.ok(match.index < firstScript);
    assert.equal((html.match(/<title>/g) || []).length, 1);
    assert.equal((html.match(/<meta name="description"/g) || []).length, 1);
    assert.equal((html.match(/<script type="application\/ld\+json">/g) || []).length, 1);
    assert.match(html, /<title>Название &amp; проверка<\/title>/);
    assert.match(html, /<h1>Заголовок<\/h1>/);
  }
});

test('early insertion also works with minimal and attributed head elements', () => {
  for (const source of ['<head><script>x()</script></head>', '<HEAD data-test="1"><meta charset="utf-8"><script>x()</script></HEAD>', '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><script>x()</script></head>']) {
    const html = insertPageHead(source, '<title>Новый заголовок</title>');
    assert.ok(html.indexOf('<title>') < html.indexOf('<script>'));
    if (html.includes('charset')) assert.ok(html.indexOf('charset') < html.indexOf('<title>'));
    if (html.includes('viewport')) assert.ok(html.indexOf('viewport') < html.indexOf('<title>'));
  }
});
