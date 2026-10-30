import { readAppSource } from "./read-app-source.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { transformSync } from "esbuild";
import { parse } from "@babel/parser";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TelegramLogo, ThreadsLogo, ShareNetwork, LinkSimple } from "@phosphor-icons/react";

const app = readAppSource();
const analytics = fs.readFileSync(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
const renderer = fs.readFileSync(new URL("../server/seo-render.mjs", import.meta.url), "utf8");

test("внешние ссылки получают nofollow без общего переключателя исключений", () => {
  const helper = app.slice(app.indexOf("const EXTERNAL_LINK_REL"), app.indexOf("// Абзацы обзоров"));
  assert.match(helper, /const EXTERNAL_LINK_REL = "nofollow noopener noreferrer"/);
  assert.match(helper, /rel=\{EXTERNAL_LINK_REL\}/);
  assert.doesNotMatch(helper, /follow\s*[=?]/);
  assert.match(app, /<ExternalLink className="article-inline-link"[\s\S]*?href=\{part\.href\}>/);
  assert.match(renderer, /part\.external[\s\S]*?rel="nofollow noopener noreferrer"/);
});

test("готовая разметка ссылок и меню «Поделиться» всегда содержит nofollow", () => {
  const source = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const ast = parse(source, { sourceType:"module", plugins:["jsx"] });
  const needed = new Set(["EXTERNAL_LINK_REL", "ExternalLink", "BLOG_SHARE_TARGETS", "BlogShareMenu"]);
  const declarations = ast.program.body.filter((node) => needed.has(node.id?.name)
    || node.declarations?.some((item) => needed.has(item.id?.name)));
  assert.equal(declarations.length, needed.size);
  const code = transformSync(`const React = require('react');
    const {useState,useRef,useEffect} = React;
    const {TelegramLogo,ThreadsLogo,ShareNetwork,LinkSimple} = icons;
    const appHref = (href) => href;
    function ActionTooltip() { return null; }
    ${declarations.map((node) => source.slice(node.start, node.end)).join('\n')}
    module.exports = {ExternalLink, BlogShareMenu};`, { loader:"jsx", format:"cjs" }).code;
  const module = { exports:{} };
  runInNewContext(code, { module, require:createRequire(import.meta.url), icons:{TelegramLogo,ThreadsLogo,ShareNetwork,LinkSimple}, window:{ location:{ origin:"https://abcars.by" } } });
  const {ExternalLink, BlogShareMenu} = module.exports;
  const link = renderToStaticMarkup(React.createElement(ExternalLink, { href:"https://example.com/source", rel:"noopener", className:"source" }, "Источник"));
  assert.match(link, /rel="nofollow noopener noreferrer"/);
  assert.match(link, /href="https:\/\/example.com\/source"/);
  assert.match(link, /target="_blank"/);
  const share = renderToStaticMarkup(React.createElement(BlogShareMenu, { post:{ path:"/blog/example", name:"Проверка ссылок" } }));
  const anchors = share.match(/<a\b[^>]*>/g) || [];
  assert.equal(anchors.length, 2);
  assert.ok(anchors.some((tag) => tag.includes('https://t.me/share/url?')));
  assert.ok(anchors.some((tag) => tag.includes('https://www.threads.net/intent/post?')));
  for (const tag of anchors) assert.match(tag, /rel="nofollow noopener noreferrer"/);
});

test("служебные ссылки в новой вкладке тоже не обходят правило", () => {
  for (const tag of analytics.match(/<a\b[^>]*target="_blank"[^>]*>/g) || []) {
    assert.match(tag, /rel="nofollow noopener noreferrer"/, tag);
  }
});
