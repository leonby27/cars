// Разведка перед тем, как тратить обращения: как на сайте устроен переход между
// страницами списка и куда уходят запросы при одной загрузке. Один заход,
// ничего не листаем.
import { chromium } from "playwright";
import fs from "node:fs";

const LIST = "brandid=1&min_price=15&max_price=100&min_regdate=2022&sort=2";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const say = (o) => console.log(JSON.stringify(o, null, 1));

const browser = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled"] });
const state = JSON.parse(fs.readFileSync("/srv/abcars/runtime/source-state.json", "utf8"));
const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 900 }, userAgent: UA, storageState: state });

const byHost = new Map();
const byType = new Map();
ctx.on("request", (r) => {
  const host = new URL(r.url()).hostname;
  byHost.set(host, (byHost.get(host) || 0) + 1);
  byType.set(r.resourceType(), (byType.get(r.resourceType()) || 0) + 1);
});

const page = await ctx.newPage();
await page.goto(`https://global.che168.com/ru/used-cars?${LIST}&vehicle_list=1`, { waitUntil: "load", timeout: 60_000 });
await page.waitForFunction(() => document.querySelectorAll("[data-uc-car-card]").length > 0, null, { timeout: 45_000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 4000));

say({ адрес: page.url().slice(0, 120) });
say({ куда_ушли_запросы: [...byHost].sort((a, b) => b[1] - a[1]) });
say({ чего_просили: [...byType].sort((a, b) => b[1] - a[1]) });

// Как выглядит переключатель страниц: собираем всё, что похоже на постраничную навигацию.
const pager = await page.evaluate(() => {
  const out = { ссылки: [], кнопки: [], разметка: "" };
  for (const a of document.querySelectorAll("a")) {
    const href = a.getAttribute("href") || "";
    const text = (a.textContent || "").trim().slice(0, 12);
    if (/page|pager|стран/i.test(href) || /^[2-9]$|^1[0-9]$|›|»|След/i.test(text)) out.ссылки.push({ text, href: href.slice(0, 90) });
  }
  for (const b of document.querySelectorAll("button")) {
    const text = (b.textContent || "").trim().slice(0, 14);
    if (/^[2-9]$|^1[0-9]$|›|»|След|next/i.test(text)) out.кнопки.push({ text, класс: (b.className || "").slice(0, 40) });
  }
  const block = document.querySelector('[class*="pag" i], [class*="pager" i], nav');
  out.разметка = block ? block.outerHTML.replace(/\s+/g, " ").slice(0, 600) : "не нашёл блок постраничной навигации";
  return out;
});
say({ переключатель_страниц: pager });
await browser.close();
