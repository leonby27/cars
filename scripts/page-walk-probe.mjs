// Третий способ листания, предложенный Сергеем 31.08.2026: не подделывать запрос
// за данными и не нажимать ссылки (в них нет номера страницы), а честно открывать
// адрес с `&page=N` — как человек, который правит номер в адресной строке или
// открывает страницу заново. Браузер при этом делает всё сам: заголовки, ссылку
// «откуда пришёл», скрипты, аналитику.
//
// Данные снимаем со страницы, как их видит посетитель, — чтобы проверить, что
// способ вообще годится для сбора, а не только для обхода стены.
import { chromium } from "playwright";
import fs from "node:fs";

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v = "true"] = a.replace(/^--/, "").split("=");
  return [k, v];
}));
const LIST = args.get("list") || "brandid=1&min_price=15&max_price=100&min_regdate=2022&sort=2";
const CAP = Number(args.get("cap") || 30);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const say = (o) => console.log(JSON.stringify(o));

const browser = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled"] });
let storageState;
try { storageState = JSON.parse(fs.readFileSync("/srv/abcars/runtime/source-state.json", "utf8")); } catch {}
const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 900 }, userAgent: UA, ...(storageState ? { storageState } : {}) });

let own = 0;
let all = 0;
ctx.on("request", (r) => {
  all += 1;
  if (/che168\.com/.test(new URL(r.url()).hostname)) own += 1;
});

const page = await ctx.newPage();
const began = Date.now();
let read = 0;
let cars = 0;
let failed = 0;
let wall = false;
const seen = new Set();

for (let n = 1; n <= CAP; n += 1) {
  const url = `https://global.che168.com/ru/used-cars?${LIST}&vehicle_list=1${n > 1 ? `&page=${n}` : ""}`;
  const ownBefore = own;
  let ok = false;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-uc-car-card]").length > 0, null, { timeout: 25_000 });
    ok = true;
  } catch {}
  if (!ok) {
    failed += 1;
    say({ страница: n, ответ: "пусто", заголовок: (await page.title().catch(() => "")).slice(0, 40) });
    if (failed >= 3) { wall = true; break; }
    await new Promise((r) => setTimeout(r, 5000));
    continue;
  }
  failed = 0;
  // Снимаем данные так, как их видит посетитель.
  const items = await page.evaluate(() =>
    [...document.querySelectorAll("[data-uc-car-card]")].map((card) => ({
      href: card.querySelector("a")?.getAttribute("href") || "",
      title: (card.querySelector("h3, [class*=title i]")?.textContent || "").trim().slice(0, 40),
      price: (card.textContent.match(/\$[\d,\s]+/) || [""])[0].trim(),
    })),
  ).catch(() => []);
  for (const it of items) if (it.href) seen.add(it.href);
  cars += items.length;
  read += 1;
  if (n <= 3 || n % 10 === 0) {
    say({ страница: n, машин: items.length, обращений_на_страницу: own - ownBefore, пример: items[0]?.title || "", цена: items[0]?.price || "" });
  }
  await new Promise((r) => setTimeout(r, 1800 + Math.round(Math.random() * 2600)));
}

say({
  шаг: "итог",
  способ: "настоящий переход на адрес с &page=N",
  прочитано_страниц: read,
  машин_собрано: cars,
  разных_машин: seen.size,
  обращений_к_источнику: own,
  всего_обращений: all,
  на_страницу_к_источнику: Number((own / Math.max(read, 1)).toFixed(1)),
  минут: Number(((Date.now() - began) / 60_000).toFixed(1)),
  стена: wall,
});
await browser.close();
