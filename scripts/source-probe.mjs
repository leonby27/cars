// Замер доступа к источнику с чужого адреса. Отвечает на два вопроса:
//   1. пускает ли источник с чистого адреса без пропуска (проверки «не робот»);
//   2. сколько страниц он отдаёт, пока не упрётся в стену.
//
// Зачем: с нашего сервера в Петербурге запас за день истощается, и непонятно,
// это общее правило источника или метка на нашем адресе. Тот же замер с адреса
// другого облака (задача GitHub) отвечает на это без переноса сайта.
// Ничего никуда не пишет: только считает и печатает.
import { chromium } from "playwright";

// Меряем на настоящем срезе, а не на общем фиде: Volkswagen с нашими фильтрами —
// ровно та работа, которую делает боевой прогон, так что числа сравнимы напрямую.
const LIST = args_list();
function args_list() {
  const raw = process.argv.slice(2).find((a) => a.startsWith("--list="));
  return raw ? raw.slice("--list=".length) : "brandid=1&min_price=15&max_price=100&min_regdate=2022&sort=2";
}
const FEED = `https://global.che168.com/ru/used-cars?${LIST}&vehicle_list=1`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v = "true"] = a.replace(/^--/, "").split("=");
  return [k, v];
}));
const PACE = Number(args.get("pace") || 1200);
const WALL = Number(args.get("wall") || 15);
const CAP = Number(args.get("cap") || 400);
const say = (o) => console.log(JSON.stringify(o));

// Видимое окно: источник с 27.08.2026 узнаёт браузер без экрана и встречает его
// проверкой. На машине задачи экран виртуальный — запуск через xvfb-run.
const browser = await chromium.launch({ headless: false, args: ["--disable-blink-features=AutomationControlled"] });
const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 900 }, userAgent: UA });
const page = await ctx.newPage();

const began = Date.now();
let entered = false;
let title = "";
try {
  await page.goto(FEED, { waitUntil: "domcontentloaded", timeout: 60_000 });
  title = await page.title();
  await page.waitForFunction(() => document.querySelectorAll("[data-uc-car-card]").length > 0, null, { timeout: 45_000 });
  entered = true;
} catch (error) {
  title = await page.title().catch(() => "");
}
say({ шаг: "вход", срез: LIST, пустил: entered, заголовок: title.slice(0, 60), секунд: Math.round((Date.now() - began) / 1000) });

if (!entered) {
  say({ вывод: "с этого адреса источник не пускает без галочки — как и с нашего сервера" });
  await browser.close();
  process.exit(0);
}

let seq = 0;
let answered = 0;
let silence = 0;
let pageIndex = 2;
const walkBegan = Date.now();
while (answered < CAP) {
  seq += 1;
  const ok = await page
    .evaluate(async (target) => {
      try {
        const res = await fetch(target, { credentials: "include", headers: { RSC: "1" }, signal: AbortSignal.timeout(20_000) });
        const text = await res.text();
        return res.status === 200 && text.includes("infoid");
      } catch {
        return false;
      }
    }, `/ru/used-cars?vehicle_list=1&${LIST}&page=${pageIndex++}&_rsc=g${seq}`)
    .catch(() => false);
  if (ok) {
    answered += 1;
    silence = 0;
    if (answered % 50 === 0) say({ шаг: "листаю", прочитано: answered, минут: Number(((Date.now() - walkBegan) / 60_000).toFixed(1)) });
  } else {
    silence += 1;
    if (silence >= WALL) break;
  }
  await new Promise((r) => setTimeout(r, PACE));
}
say({
  шаг: "итог",
  прочитано: answered,
  минут: Number(((Date.now() - walkBegan) / 60_000).toFixed(1)),
  стена: silence >= WALL,
  подсказка: "для сравнения: наш сервер в Петербурге 31.08 давал 100–170 страниц утром и 0 вечером",
});
await browser.close();
