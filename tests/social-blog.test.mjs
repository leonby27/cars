import test from "node:test";
import assert from "node:assert/strict";
import { blogPost } from "../scripts/lib/social-blocks.mjs";
import { BLOG_SOCIAL } from "../src/blog-social.js";
import { BLOG_POSTS } from "../src/blog-posts.js";

test("в Instagram ссылки нет: там она не кликается, вместо неё шапка профиля", () => {
  const post = blogPost({ slug: "five-years-vat", network: "instagram" });
  assert.ok(!post.text.includes("abcars.by/blog"), "адреса в тексте быть не должно");
  assert.ok(!post.text.includes("<a href"), "разметки ссылки тоже");
  assert.match(post.text, /ссылка в шапке профиля/);
  assert.match(post.text, /#абкарс #автоизкитая/);
});

test("в телеграме ссылка спрятана под словами, в Threads — открытым адресом", () => {
  const telegram = blogPost({ slug: "five-years-vat", network: "telegram" });
  assert.match(telegram.text, /<a href="https:\/\/abcars\.by\/blog\/five-years-vat">Читать в журнале<\/a>/);
  assert.ok(!telegram.text.includes("#"), "метки только для Instagram");

  const threads = blogPost({ slug: "five-years-vat", network: "threads" });
  assert.match(threads.text, /🔗 abcars\.by\/blog\/five-years-vat/);
  assert.ok(threads.text.length <= 500, "запись в Threads не длиннее 500 знаков");
});

test("во всех сетях есть заголовок и призыв написать", () => {
  for (const network of ["telegram", "threads", "instagram"]) {
    const post = blogPost({ slug: "ev-quota-end", network });
    assert.match(post.text, /^📰 Что будет с ценами/);
    assert.match(post.text, /✍️ Вопросы/);
  }
});

test("материал без выжимки записи не даёт", () => {
  assert.equal(blogPost({ slug: "которого-нет" }), null);
});

test("выжимки написаны к существующим материалам и умещаются в ленту", () => {
  const slugs = new Set(BLOG_POSTS.map((post) => post.slug));
  for (const [slug, social] of Object.entries(BLOG_SOCIAL)) {
    assert.ok(slugs.has(slug), `выжимка «${slug}» не привязана ни к одному материалу`);
    assert.ok(social.title && social.body?.length, `у «${slug}» нет заголовка или текста`);
    const longest = blogPost({ slug, network: "instagram" }).text.length;
    assert.ok(longest <= 1024, `запись «${slug}» длиннее 1024 знаков — не влезет в подпись телеграма`);
  }
});
