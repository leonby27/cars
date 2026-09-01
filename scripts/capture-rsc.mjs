// Подсматриваем НАСТОЯЩИЙ запрос приложения за следующей страницей.
//
// Зачем: замеры 31.08.2026 показали, что источник ловит не объём, а форму. Полное
// открытие страниц выдержало ~2900 обращений, а наши голые запросы за данными
// останавливают через 51–170. Значит надо отправлять запрос так же, как его
// отправляет само приложение сайта, — а для этого надо его увидеть.
//
// Загружаем список, нажимаем «2» и записываем всё: адрес, заголовки, признаки.
import { chromium } from "playwright";
import fs from "node:fs";

const LIST = "brandid=1&min_price=15&max_price=100&min_regdate=2022&sort=2";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const OUT = "/srv/abcars/runtime/rsc-capture.json";
const say = (o) => console.log(JSON.stringify(o));

const browser = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled"] });
let storageState;
try { storageState = JSON.parse(fs.readFileSync("/srv/abcars/runtime/source-state.json", "utf8")); } catch {}
const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 900 }, userAgent: UA, ...(storageState ? { storageState } : {}) });

// Ловим все запросы к списку — и служебные, и обычные.
const caught = [];
ctx.on("request", (r) => {
  const url = r.url();
  if (!/che168\.com/.test(url)) return;
  if (!/used-cars/.test(url)) return;
  caught.push({ url, method: r.method(), resourceType: r.resourceType(), headers: r.headers() });
});

const page = await ctx.newPage();
await page.goto(`https://global.che168.com/ru/used-cars?${LIST}&vehicle_list=1`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForFunction(() => document.querySelectorAll("[data-uc-car-card]").length > 0, null, { timeout: 45_000 });
const firstBefore = await page.evaluate(() => document.querySelector("[data-uc-car-card] a")?.getAttribute("href") || "");
say({ шаг: "страница загружена", запросов_к_списку: caught.length, первая_машина: firstBefore.slice(0, 50) });

const mark = caught.length;
// Нажимаем «2» так, как это делает человек: находим ссылку с текстом «2» в
// постраничной навигации и щёлкаем по ней.
const link = page.locator('a:has-text("2"), li:has-text("2") a').last();
await link.scrollIntoViewIfNeeded().catch(() => {});
await link.click({ timeout: 15_000 }).catch((e) => say({ нажатие: "не удалось", ошибка: String(e.message).slice(0, 60) }));
await page.waitForTimeout(6000);
const firstAfter = await page.evaluate(() => document.querySelector("[data-uc-car-card] a")?.getAttribute("href") || "");
say({ шаг: "после нажатия", страница_сменилась: firstAfter !== firstBefore, первая_машина: firstAfter.slice(0, 50) });

const after = caught.slice(mark);
say({ шаг: "запросы после нажатия", сколько: after.length });
for (const r of after) {
  say({ адрес: r.url.replace("https://global.che168.com", "").slice(0, 160), тип: r.resourceType, заголовки: r.headers });
}
fs.writeFileSync(OUT, JSON.stringify({ before: caught.slice(0, mark), after }, null, 2));
say({ шаг: "записано", файл: OUT });
await browser.close();
