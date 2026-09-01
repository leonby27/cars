// Замер: дело в количестве обращений или в их форме?
//
// Наблюдение Сергея 31.08.2026: он пролистал браузером 60 страниц (это около
// 1500 обращений к источнику вместе с фотографиями) — и ни одной стены. Наш
// скрипт с того же адреса сделал 51 обращение за данными и был остановлен.
// Значит считают не объём, а похожесть на живого посетителя.
//
// Здесь мы листаем НАСТОЯЩИМИ переходами: нажимаем «следующая страница», как
// человек, — тогда запрос уходит от самого приложения сайта со всеми служебными
// признаками, а не подделывается нами. Фотографии не грузим: они дают ×50 к
// нагрузке, а проверяем мы форму запроса, не картинки.
//
// Ничего никуда не пишет: считает страницы и печатает.
import { chromium } from "playwright";
import fs from "node:fs";

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v = "true"] = a.replace(/^--/, "").split("=");
  return [k, v];
}));
const LIST = args.get("list") || "brandid=1&min_price=15&max_price=100&min_regdate=2022&sort=2";
const CAP = Number(args.get("cap") || 150);
const STATE = args.get("state") || "/srv/abcars/runtime/source-state.json";
const PHOTOS = args.get("photos") === "true";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const say = (o) => console.log(JSON.stringify(o));

const browser = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled"] });
let storageState;
try { storageState = JSON.parse(fs.readFileSync(STATE, "utf8")); say({ пропуск: "есть" }); }
catch { say({ пропуск: "нет — иду без него" }); }
const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 900 }, userAgent: UA, ...(storageState ? { storageState } : {}) });

// Фотографии не грузим: проверяем форму запроса, а не способность тянуть картинки.
let blocked = 0;
if (!PHOTOS) {
  await ctx.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "media" || type === "font") { blocked += 1; return route.abort(); }
    return route.continue();
  });
}

// Считаем ВСЕ обращения к источнику — чтобы честно сравнить цену страницы.
let requests = 0;
ctx.on("request", (r) => { if (/che168\.com|autoimg\.cn/.test(r.url())) requests += 1; });

const page = await ctx.newPage();
const began = Date.now();
let entered = false;
try {
  await page.goto(`https://global.che168.com/ru/used-cars?${LIST}&vehicle_list=1`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => document.querySelectorAll("[data-uc-car-card]").length > 0, null, { timeout: 45_000 });
  entered = true;
} catch {}
say({ шаг: "вход", пустил: entered, заголовок: (await page.title().catch(() => "")).slice(0, 50), секунд: Math.round((Date.now() - began) / 1000) });
if (!entered) { await browser.close(); process.exit(0); }

// Переход на следующую страницу — так, как это делает человек: нажатием.
// Ссылку ищем по номеру следующей страницы; если её нет в разметке, пробуем
// кнопку «вперёд». Считаем страницу прочитанной, когда на ней появились карточки.
const walkBegan = Date.now();
let read = 1;
let failed = 0;
const jitter = () => 900 + Math.round(Math.random() * 2600);
for (let next = 2; read < CAP; next += 1) {
  // Признак «страница сменилась» — не число карточек (их всегда 24), а адрес
  // страницы и ссылка первой карточки. На этом первая версия замера и обманулась.
  const before = await page
    .evaluate(() => ({
      url: location.search,
      first: document.querySelector("[data-uc-car-card] a")?.getAttribute("href") || "",
    }))
    .catch(() => ({ url: "", first: "" }));
  let clicked = false;
  for (const selector of [`a[href*="page=${next}"]`, `li:has-text("${next}") a`, 'a[aria-label*="next" i]', 'a:has-text("›")', 'a:has-text("Следующая")']) {
    const link = page.locator(selector).first();
    if (await link.count().catch(() => 0)) {
      await link.scrollIntoViewIfNeeded().catch(() => {});
      await link.click({ timeout: 15_000 }).catch(() => {});
      clicked = true;
      break;
    }
  }
  if (!clicked) { say({ шаг: "конец", причина: `на странице нет ссылки на ${next}`, прочитано: read }); break; }
  const ok = await page
    .waitForFunction(
      (was) => {
        const cards = document.querySelectorAll("[data-uc-car-card]");
        if (!cards.length) return false;
        const first = cards[0].querySelector("a")?.getAttribute("href") || "";
        return location.search !== was.url || (first && first !== was.first);
      },
      before,
      { timeout: 25_000 },
    )
    .then(() => true)
    .catch(() => false);
  if (ok) { read += 1; failed = 0; }
  else {
    failed += 1;
    if (failed >= 5) { say({ шаг: "стена", прочитано: read, страница: next }); break; }
  }
  if (read % 25 === 0) say({ шаг: "листаю", прочитано: read, обращений: requests, минут: Number(((Date.now() - walkBegan) / 60_000).toFixed(1)) });
  await new Promise((r) => setTimeout(r, jitter()));
}
say({
  шаг: "итог",
  способ: PHOTOS ? "настоящие переходы со всем содержимым" : "настоящие переходы без фотографий",
  прочитано_страниц: read,
  обращений_к_источнику: requests,
  на_страницу: Number((requests / Math.max(read, 1)).toFixed(1)),
  отброшено_картинок: blocked,
  минут: Number(((Date.now() - walkBegan) / 60_000).toFixed(1)),
  стена: failed >= 5,
});
await browser.close();
