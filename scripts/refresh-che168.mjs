// Refresh — price and availability for the Che168 catalog.
//
// The source's list layer carries the current dollar price for every visible
// card, so the bulk of the refresh is a list walk; detail requests are spent
// only where the lists are silent. Two hard-won facts shape the walk:
//
// 1. List pagination is dishonest at depth. Every request reshuffles the
//    order (even with sort=), and beyond ~300 pages the source keeps serving
//    the same shallow window — a flat walk of the ~7.5k-page petrol feed sees
//    barely half the cars. So the petrol feed is walked in slices that are
//    each shallow enough to be honest: per brand (config/che168-brands-1.json),
//    and for brands too big even for that — per model (series), with the live
//    series list asked from Autohome and config/che168-giant-series.json as
//    the fallback. A measured 220-page brand slice yields ~94% of its cars in
//    one pass, so every slice is walked twice: each request reshuffles the
//    order, and the second pass recovers most of what the first one missed.
//    The EV/hybrid feeds (7/5/6) are shallow and honest; they stay unsliced
//    (but still double-passed — a single pass of feed 6 measured only 81%).
//
// 1a. С 26.08.2026 источник узнаёт браузер без экрана: невидимое окно ловится
//    проверкой «не робот» с первого же запроса, окно с экраном проходит её
//    свободно — замерено на трёх режимах и с двух разных адресов. Поэтому
//    браузер поднимается видимым, а на сервере ему рисуют виртуальный экран
//    (`xvfb-run -a npm run refresh`). Никакой блокировки по адресу за этим не
//    стояло: тот же сервер, тот же час — окно с экраном пускают.
//
// 2. The source's quota is per session, not per IP: the night it first
//    blocked us, a freshly-challenged import session on the same machine kept
//    downloading happily. So the browser session is rotated after a fixed
//    number of requests, and when the source goes silent mid-run the script
//    first rotates the session; only if that doesn't help does it stop —
//    gracefully, keeping everything already checked.
//
// A card that vanished from every list slice is either sold or merely
// unlisted; absence alone must never unpublish a card. Its own page is the
// authority: a sold card still answers with a detail payload, just without a
// price. Detail checks are capped per night and drawn oldest-checked-first,
// so the whole catalog rotates through them fairly.
//
// The run starts with a priority pass: cards visitors opened in the last 30
// days (view/availability/favorite events, top 300) get a detail check and a
// database write first. --skip-detail skips this pass too.
//
// 3. Плотность обращений за одну ночь — то, по чему источник и вычисляет
//    робота. Ночь 25→26.08.2026 (24 тысячи обращений в темпе 3–7 в секунду)
//    кончилась блокировкой всего сервера на несколько дней. Поэтому работа
//    разложена на четыре ночные смены (scripts/lib/refresh-shifts.mjs), а темп
//    сбавлен примерно до одного обращения в секунду. Смена определяет не только
//    что листать, но и за какие карточки мы сегодня отвечаем: чужие не уходят в
//    поштучную очередь, а спокойно ждут своей ночи.
//
// Usage:
//   npm run refresh                     # смена по календарю: списки + поштучные проверки + запись
//   npm run refresh -- --shift=ev      # явная смена: ev | petrol-a | petrol-b | petrol-c
//   npm run refresh -- --dry-run       # measure only, no database writes
//   npm run refresh -- --skip-detail   # lists only (prices), leave missing cards alone
//   npm run refresh -- --detail-limit=500
//   npm run refresh -- --pace=1200     # пауза каждого потока между запросами, мс
//   npm run refresh -- --feeds=1 --brand-limit=2   # укороченный прогон для проверки
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { extractChe168ListPayload, extractChe168DetailPayload } from "./lib/che168-parser.mjs";
import { discoveryCandidate } from "./lib/che168-discovery.mjs";
import { SHIFT_ORDER, shiftForDate, feedsForShift, petrolShiftByBrand, shiftOfCar } from "./lib/refresh-shifts.mjs";
import { estimateLandedCost } from "../src/pricing.js";
import { IMPORT_BRANDS, ICE_IMPORT_BRANDS, canonicalImportBrand } from "../config/import-policy.mjs";
import { sendTelegram } from "./lib/telegram.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(ROOT, "runtime", "refresh-report.json");
// Машины источника, которых у нас нет: обход списков всё равно проходит мимо
// каждой, так что находки достаются даром. Отсюда их забирает пополнение вместо
// собственного обхода — см. `scripts/lib/che168-discovery.mjs`.
const DISCOVERIES_PATH = path.join(ROOT, "runtime", "che168-discoveries.json");
const BRAND_MAP_PATH = path.join(ROOT, "config", "che168-brands-1.json");
const GIANT_SERIES_PATH = path.join(ROOT, "config", "che168-giant-series.json");
const FEED_URL = "https://global.che168.com/en/used-cars?vehicle_list=1&fueltype=7";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
// Feeds 7/5/6 (EV, plug-in, hybrid) are walked whole; feed 1 (petrol) is the
// one that needs brand/series slicing — see the header note.
const FUEL_TYPES = [7, 5, 6, 1];
// Глубже этого срез не листаем: дальше пагинация начинает подсовывать одно и
// то же (замерено на марках в несколько сотен страниц). Марка глубже порога
// идёт в разрез по моделям.
const SLICE_MAX_PAGES = 250;
// Порядок обхода и норма одного подхода живут в настройке, а не в программе:
// поменять очередь марок можно правкой config/refresh-order.json.
const ORDER_PATH = "config/refresh-order.json";
const CURSOR_PATH = "runtime/refresh-cursor.json";
const USD_TO_CNY = 7.15;
// Day-to-day the source re-quotes yuan prices in dollars at the current rate,
// which moves almost every card by $10–20. Those wiggles are noise: they would
// rewrite the whole catalog and flood price_history daily. Only a move of at
// least this many dollars counts as a real re-pricing.
const PRICE_STEP_USD = 100;
// Столько безответных запросов подряд значит «источник закрылся»: в здоровом
// прогоне безответных нет вообще, а при блокировке они идут сплошной стеной.
// Каждый безответный запрос дорог (и по времени, и по счётчику источника —
// пустой ответ тоже обращение), поэтому порог низкий: стена распознаётся
// быстро, пока не сожгла запас подхода.
const SILENCE_LIMIT = 30;

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const dryRun = args.get("dry-run") === "true";
const skipDetail = args.get("skip-detail") === "true";
// Потолок поштучных проверок за ночь: очередь берётся «сначала самые
// залежавшиеся», так что весь каталог проходит через них по кругу за несколько
// ночей, а прогон никогда не выжигает сессионную квоту источника подчистую.
const detailLimit = Number(args.get("detail-limit") || 2000);
// Один поток: замер 31.08.2026 с пропуском прошёл 500 страниц подряд именно
// так — одно обращение раз в ~2 секунды. Два потока с той же паузой (втрое
// чаще) в то же утро упёрлись в стену через несколько минут.
const concurrency = Number(args.get("concurrency") || 1);
// Пауза каждого потока между запросами. Спешить некуда: бережный темп важнее
// скорости, лишь бы прогон укладывался в ночное окно.
const pace = Number(args.get("pace") || 1200);
// Квота источника — на сессию: после стольких запросов окно меняется заранее,
// не дожидаясь блокировки.
const sessionMax = Number(args.get("session-max") || 8000);
// Смена ночи: за какую часть каталога отвечаем сегодня. По умолчанию очередь
// идёт по календарю; явное имя нужно для проверочных прогонов и для того,
// чтобы догнать пропущенную ночь.
const shift = args.get("shift") && args.get("shift") !== "auto" ? args.get("shift") : shiftForDate();
if (!SHIFT_ORDER.includes(shift)) throw new Error(`неизвестная смена ${shift}; бывают: ${SHIFT_ORDER.join(", ")}`);
// Для укороченных проверочных прогонов: какие фиды обходить и сколько марок.
const activeFeeds = args.get("feeds")
  ? args.get("feeds").split(",").map(Number)
  // Смены остались только как способ вручную ограничить прогон одним типом
  // топлива (`--shift=ev`). Без явного указания доступны все фиды: что именно
  // берётся этой ночью, решают очередь из настройки и курсор.
  : (args.get("shift") && args.get("shift") !== "auto" ? feedsForShift(shift) : [7, 5, 6, 1]);
const brandLimit = Number(args.get("brand-limit") || 0);
// Потолок глубины среза для проверочных прогонов: боевой прогон листает срез
// целиком, а короткая проверка — три страницы, чтобы не тревожить источник.
const maxPages = Number(args.get("max-pages") || 0);
// Норма подхода и пауза: значения по умолчанию перекрываются настройкой
// config/refresh-order.json и ключами командной строки.
let burstLimit = Number(args.get("burst") || 450);
let burstPauseMin = Number(args.get("burst-pause") || 15);
// Сколько подходов за одну сессию работы. Полный круг длиннее одной сессии —
// остаток берёт следующая, курсор помнит место.
let burstsMax = Number(args.get("bursts") || 6);
// Ценовой срез по моделям: у крупной марки каждая модель листается только на
// первые N страниц по возрастанию цены — посетителей интересуют дешёвые
// предложения внутри модели (у дорогого в целом Туарега есть свои дешёвые
// карточки, и они попадут в срез). 0 — выключено, модели листаются целиком.
let modelTopPages = Number(args.get("model-top") || 0);
// Перепись марок бензинового фида: она же задаёт, какая марка в какую ночь
// проверяется — и для обхода списков, и для наших карточек.
const brandMap = JSON.parse(await fs.readFile(BRAND_MAP_PATH, "utf8"));
const petrolShifts = petrolShiftByBrand(brandMap);
// Машина сегодняшней смены. Неизвестный тип (shiftOfCar вернул null) проверяем
// в любую ночь: таких единицы, и потерять их хуже, чем лишний раз проверить.
const inShift = (row) => {
  const own = shiftOfCar({ type: row.type, brand: row.brand }, petrolShifts.byCanonical);
  return own === null || own === shift;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const startedAt = Date.now();
const asFlightScript = (text) => `[1,${JSON.stringify(text)}])`;

// Same in-page fetch as import-v2: the request must run inside the challenged
// page so it carries the anti-bot cookies. 429 and the quieter empty-shell
// throttle answer are both retried against the marker the caller expects.
async function flight(page, url, expectMarker) {
  return page.evaluate(async ([target, marker]) => {
    let last = { status: 0, text: "" };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      // Сорванное соединение — обычное дело на длинном прогоне. Раньше такая
      // ошибка выбрасывалась наружу и роняла весь скрипт вместе с несохранёнными
      // результатами; теперь это просто ещё одна попытка.
      let response;
      try {
        // Свой лимит времени обязателен: придержанный источником запрос иначе
        // висит минутами, и предохранитель не успевает заметить стену молчания.
        response = await fetch(target, { credentials: "include", headers: { RSC: "1" }, signal: AbortSignal.timeout(20_000) });
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      if (!response.ok) {
        if (response.status !== 429) return { status: response.status, text: "" };
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      last = { status: response.status, text: await response.text() };
      if (!marker || last.text.includes(marker)) return last;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
    return last;
  }, [url, expectMarker]);
}

// ---- Сессия к источнику -----------------------------------------------------
// Одно окно с пройденной проверкой «не робот» на всех: у источника квота на
// сессию, поэтому окно живёт ограниченное число запросов и меняется целиком.
let browser = null;
let context = null;
let page = null;
let sessionRequests = 0;
let sessionRotations = 0;
let rotating = null;

// Видимое окно — не прихоть, а единственный режим, который источник пускает
// (см. заметку 1a в шапке). На сервере экран виртуальный: служба запускает
// прогон через `xvfb-run`. `--headless=true` оставлен для отладки.
const headless = args.get("headless") === "true";
async function launchBrowser() {
  if (!headless && process.platform === "linux" && !process.env.DISPLAY) {
    throw new Error("нужен экран: запускайте через `xvfb-run -a npm run refresh` (или --headless=true, но источник такое окно не пустит)");
  }
  return chromium.launch({ headless, args: ["--disable-blink-features=AutomationControlled"] });
}

// Пропуск проверки «не робот», выданный человеком (см. runtime/iptest/hold.mjs).
// Источник с 27.08.2026 держит непрошедших на коротком поводке: стена молчания
// приходила на 75–105 запросе. С пропуском в замере прошло 500 страниц подряд
// без единой заминки. Файла может не быть — тогда работаем как раньше.
const SOURCE_STATE_PATH = path.join(ROOT, "runtime", "source-state.json");
let sourceState;
async function loadSourceState() {
  if (sourceState !== undefined) return sourceState;
  try {
    const raw = JSON.parse(await fs.readFile(SOURCE_STATE_PATH, "utf8"));
    const ticket = (raw.cookies || []).find((c) => /EO-Bot-Captcha/i.test(c.name));
    if (!ticket) { console.log("[pass] в runtime/source-state.json нет пропуска — иду без него"); sourceState = null; }
    else {
      const daysLeft = (ticket.expires * 1000 - Date.now()) / 86400000;
      if (daysLeft <= 0) { console.log("[pass] пропуск просрочен — нужно обновить (npm run source-pass)"); sourceState = null; }
      else { console.log(`[pass] пропуск на месте, годен ещё ${daysLeft.toFixed(1)} суток`); sourceState = raw; }
    }
  } catch { console.log("[pass] пропуска нет — иду без него, источник будет прижимать"); sourceState = null; }
  return sourceState;
}

// Порядок обхода из настройки. Файла может не быть — тогда идём по убыванию
// количества машин, как раньше.
let orderConfig;
async function loadOrder() {
  if (orderConfig !== undefined) return orderConfig;
  try {
    orderConfig = JSON.parse(await fs.readFile(path.join(ROOT, ORDER_PATH), "utf8"));
    console.log(`[order] очередь из настройки: ${orderConfig.stages?.length ?? 0} этапов`);
  } catch {
    orderConfig = null;
    console.log("[order] настройки очереди нет — иду по убыванию количества машин");
  }
  return orderConfig;
}

const BRAND_TABLES = { 7: "config/che168-brands.json", 5: "config/che168-brands-5-6.json", 6: "config/che168-brands-5-6.json" };
const brandTableCache = {};
async function loadBrandTable(fuelType) {
  if (brandTableCache[fuelType]) return brandTableCache[fuelType];
  const file = BRAND_TABLES[fuelType];
  if (!file) return (brandTableCache[fuelType] = {});
  try {
    const raw = JSON.parse(await fs.readFile(path.join(ROOT, file), "utf8"));
    brandTableCache[fuelType] = raw.brands || {};
  } catch {
    console.log(`[order] справочник марок для фида ${fuelType} не прочитался`);
    brandTableCache[fuelType] = {};
  }
  return brandTableCache[fuelType];
}

// Марки фида, которые нам нужны, в порядке из настройки: сначала перечисленные
// поимённо, потом (если стоит "*") все прочие по убыванию количества машин.
function orderedBrands(fuelType, table, doneSet, { restartWhenEmpty = true } = {}) {
  const done = doneSet ?? new Set(cursor?.brandsDone || []);
  const allowed = new Set([...(fuelType === 1 ? ICE_IMPORT_BRANDS : []), ...IMPORT_BRANDS]);
  const rows = Object.entries(table)
    .map(([name, v]) => ({
      name,
      id: v.brandId,
      count: v.electricListings ?? v.listings ?? v.total ?? 0,
    }))
    .filter((r) => r.id && r.count > 0 && allowed.has(canonicalImportBrand(r.name)));
  // Порядок разворота «звёздочки». Мелкие марки первыми — решение Сергея
  // 31.08.2026: источник обрывает работу примерно после сотни обращений, и мелкая
  // марка укладывается в один подход целиком, а крупная (600–800 страниц) выела бы
  // весь дневной запас, и до хвоста очереди дело не дошло бы никогда.
  const smallestFirst = String(orderConfig?.order || "smallest-first") !== "largest-first";
  const bySize = (a, b) => (smallestFirst ? a.count - b.count : b.count - a.count);
  const stages = (orderConfig?.stages || []).filter((st) => (st.feeds || []).includes(fuelType));
  if (!stages.length) return rows.sort(bySize);
  const out = [];
  const taken = new Set();
  for (const stage of stages) {
    const names = stage.brands === "*" ? ["*"] : stage.brands || [];
    for (const wanted of names) {
      if (wanted === "*") {
        for (const r of rows.sort(bySize)) {
          if (!taken.has(r.name)) { taken.add(r.name); out.push(r); }
        }
        continue;
      }
      const hit = rows.find((r) => r.name === wanted || canonicalImportBrand(r.name) === canonicalImportBrand(wanted));
      if (hit && !taken.has(hit.name)) { taken.add(hit.name); out.push(hit); }
    }
  }
  // Что обошли в предыдущие ночи этого круга — сегодня пропускаем.
  const left = out.filter((r) => !done.has(canonicalImportBrand(r.name)));
  if (!left.length && out.length && restartWhenEmpty) {
    console.log(`[order] фид ${fuelType}: круг пройден целиком, начинаю заново`);
    return out;
  }
  return left;
}

// Курсор: докуда дошли в прошлую ночь. Полный круг длиннее одной ночи, и без
// курсора каждая ночь начинала бы с первой марки, а хвост очереди не обновлялся
// бы никогда.
async function loadCursor() {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, CURSOR_PATH), "utf8")); }
  catch { return { brandsDone: [], round: 1 }; }
}
async function saveCursor(cursor) {
  if (dryRun) return;
  await fs.writeFile(path.join(ROOT, CURSOR_PATH), JSON.stringify(cursor, null, 2));
}

async function openSession() {
  // Браузер мог умереть целиком (сигнал остановки, сбой) — тогда поднимаем новый,
  // а не пытаемся открыть окно в мёртвом.
  if (browser && !browser.isConnected()) browser = null;
  browser = browser || await launchBrowser();
  const state = await loadSourceState();
  const freshContext = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    userAgent: USER_AGENT,
    ...(state ? { storageState: state } : {}),
  });
  const freshPage = await freshContext.newPage();
  await freshPage.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await freshPage.waitForFunction(() => document.querySelectorAll("[data-uc-car-card]").length > 0, null, { timeout: 60_000 });
  const stale = context;
  context = freshContext;
  page = freshPage;
  sessionRequests = 0;
  if (stale) await stale.close().catch(() => {});
}

// Первый вход — единственное место, где источник встречает нас проверкой «не
// робот» на голом месте. Одна неудача здесь раньше роняла весь ночной прогон
// (ночь 26→27.08.2026: скрипт умер через 78 секунд и до утра никто не знал).
// Проверка бывает и капризной, поэтому ждём и пробуем снова — но редко и не
// подряд: стучаться чаще в закрытую дверь только вредит.
const ENTRY_WAITS_MS = args.get("entry-waits")
  ? args.get("entry-waits").split(",").filter(Boolean).map(Number)
  : [60_000, 180_000, 600_000, 1200_000];

async function openSessionWithRetries() {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await openSession();
      if (attempt) console.log(`[browser] challenge passed с ${attempt + 1}-й попытки`);
      else console.log("[browser] challenge passed");
      return true;
    } catch (error) {
      const wait = ENTRY_WAITS_MS[attempt];
      console.log(`[browser] источник не пустил (${String(error.message).slice(0, 80)})`);
      if (wait === undefined) return false;
      console.log(`[browser] жду ${Math.round(wait / 60_000)} мин и пробую снова (попытка ${attempt + 2} из ${ENTRY_WAITS_MS.length + 1})`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      if (stopped) return false;
    }
  }
}

function rotateSession(reason) {
  if (!rotating) {
    sessionRotations += 1;
    console.log(`[session] ${reason} — открываю новую сессию (№${sessionRotations + 1})`);
    rotating = openSession()
      .catch((error) => console.log(`[session] не открылась: ${String(error.message).slice(0, 120)}`))
      .finally(() => { rotating = null; });
  }
  return rotating;
}

// Единственная дверь к источнику: ждёт смену сессии, меняет её по счётчику и
// никогда не бросает исключение — потокам достаётся пустой ответ, не обвал.
// Доклад после подхода: коротко и по делу — всё ли в порядке, сколько машин
// актуализировали и сколько новых нашли. Ошибка отправки прогон не роняет.
// Сообщение после каждого подхода — это до двенадцати сообщений за ночь, шум.
// Пишем в телеграм только когда что-то не так; спокойный подход остаётся в
// журнале. Итог за прогон отправляет отдельное сообщение в конце.
async function reportBurst(reason, { force = false } = {}) {
  const now = {
    priced: seenPrices.size,
    found: discoveries.size,
    sold: soldTotal,
    pages: listPages,
    empty: listPagesEmpty,
    detail: detailChecked,
  };
  const d = {
    priced: now.priced - lastSnapshot.priced,
    found: now.found - lastSnapshot.found,
    sold: now.sold - lastSnapshot.sold,
    pages: now.pages - lastSnapshot.pages,
    empty: now.empty - lastSnapshot.empty,
    detail: now.detail - lastSnapshot.detail,
  };
  lastSnapshot = now;
  // «Не ок» — это когда источник начал отвечать пустыми страницами: пятая часть
  // пустых уже означает, что мы упёрлись в его ограничение.
  const emptyShare = d.pages > 0 ? d.empty / d.pages : 0;
  const bad = (stopped && !budgetSpent) || emptyShare > 0.2 || sessionRotations > 0 || wallPauses > 0;
  const head = bad ? "⚠️ Актуализация: есть проблемы" : "✅ Актуализация идёт нормально";
  // Марки показываем целиком, а не хвостом: важно видеть, что именно обновили.
  // Если их совсем много, длинный список ни к чему — оставляем начало.
  const brandList = [...burstBrands];
  burstBrands.clear();
  const brands = brandList.length > 10
    ? `${brandList.slice(0, 10).join(", ")} и ещё ${brandList.length - 10}`
    : brandList.join(", ");
  const lines = [
    `${head}`,
    `Подход ${burstsDone} из ${burstsMax} за сессию · ${reason}`,
    "",
    `Обновили цену: ${d.priced} машин (за сессию ${now.priced})`,
    `Нашли новых: ${d.found} (за сессию ${now.found})`,
    `Продано и снято: ${d.sold} (за сессию ${now.sold})`,
    `Страниц прочитано: ${d.pages}${d.empty ? ` (пустых ${d.empty})` : ""}`,
  ];
  if (d.detail) lines.push(`Проверено поштучно: ${d.detail}`);
  if (brands) lines.push("", `Обновляли: ${brands}`);
  if (budgetSpent) lines.push("", "Дневная норма выработана полностью — остаток каталога возьмёт следующая сессия.");
  else if (stopped) lines.push("", "Прогон свернулся досрочно — остаток возьмёт следующая сессия.");
  else if (emptyShare > 0.2) lines.push("", "Источник начал отдавать пустые страницы — похоже, упёрлись в его лимит.");
  else if (sessionRotations > 0) lines.push("", `Пришлось заново открывать окно ${sessionRotations} раз.`);
  else lines.push("", `Дальше пауза ${burstPauseMin} мин, потом следующий подход.`);
  if (dryRun) lines.push("", "(пробный прогон, в базу ничего не пишется)");
  if (tgQuiet) { console.log("[tg] тихий режим: " + lines.join(" | ")); return; }
  // Стена и пауза — это будни, а не беда: сообщать о них не нужно, они видны
  // в журнале и попадают в итог. В телеграм уходит только итог прогона.
  if (!force) { console.log(`[burst] ${bad ? "с заминкой" : "спокойно"}: ${reason} · ${lines.filter(Boolean).slice(2).join(" | ")}`); return; }
  await sendTelegram(lines.join("\n"), { root: ROOT, log: console.log }).catch(() => {});
}

// Единственное сообщение за прогон: что обновили, по каким маркам, сколько
// новых нашли — и честная пометка, если что-то не получилось.
async function reportRun(stats, extra) {
  const trouble = [];
  if (extra.stoppedEarly) trouble.push("Источник закрылся раньше, чем мы прошли очередь.");
  if (extra.noAnswer > 0) trouble.push(`${extra.noAnswer} машин не ответили — проверим в следующий раз.`);
  if (extra.listPages > 0 && extra.listPagesEmpty / extra.listPages > 0.2) {
    trouble.push(`Пятая часть страниц пришла пустыми (${extra.listPagesEmpty} из ${extra.listPages}).`);
  }
  const brands = [...allBrandsThisRun];
  const brandLine = brands.length > 12 ? `${brands.slice(0, 12).join(", ")} и ещё ${brands.length - 12}` : brands.join(", ");
  const lines = [
    trouble.length ? "⚠️ Обновление каталога: с оговорками" : "✅ Обновление каталога прошло",
    `Заняло ${extra.minutes} мин · подходов ${extra.burstsDone}, передышек ${extra.wallPauses}`,
    "",
    `Проверено цен: ${extra.pricedByLists} машин`,
    `Изменились цены: ${stats.rePriced} (подешевело ${extra.priceDrops}, подорожало ${extra.priceRises})`,
    `Ушло с продажи: ${stats.sold}`,
    `Найдено новых: ${extra.discovered} — заведёт пополнение`,
    `Прочитано страниц: ${extra.listPages}`,
  ];
  if (brandLine) lines.push("", `Обошли марки: ${brandLine}`);
  lines.push("", extra.circleClosed
    ? `Круг по каталогу замкнулся, следующий прогон начнёт заново.`
    : `В круге обойдено марок: ${extra.brandsCoveredInCircle}, остальные — следующими прогонами.`);
  if (trouble.length) lines.push("", ...trouble.map((t) => `• ${t}`));
  if (dryRun) lines.push("", "(пробный прогон, в базу ничего не пишется)");
  if (tgQuiet) { console.log("[tg] тихий режим: " + lines.join(" | ")); return; }
  await sendTelegram(lines.join("\n"), { root: ROOT, log: console.log }).catch(() => {});
}

async function safeFlight(url, expectMarker) {
  if (rotating) await rotating;
  // Норма подхода: набрали столько обращений — отдыхаем. Иначе источник
  // отвечает пустыми страницами и в конце ставит проверку «не робот».
  if (burstLimit && burstRequests >= burstLimit && !stopped) {
    burstRequests = 0;
    burstsDone += 1;
    if (burstsMax && burstsDone >= burstsMax) {
      stopped = true;
      budgetSpent = true;
      console.log(`[burst] подходов за сессию сделано ${burstsDone} из ${burstsMax} — на сегодня всё, остаток возьмёт следующая сессия`);
      await reportBurst("норма подходов за сессию исчерпана");
      return { status: 0, text: "" };
    }
    await reportBurst("подход завершён");
    console.log(`[burst] подход ${burstsDone} закончен (${burstLimit} обращений) — пауза ${restMinutes} мин`);
    const until = Date.now() + restMinutes * 60_000;
    while (Date.now() < until && !stopped) await sleep(5_000);
    // Окно после паузы не меняем: пропуск и куки в нём живые, а каждая новая
    // сессия — лишняя проверка «не робот», которые источник считает.
  }
  if (sessionRequests >= sessionMax) await rotateSession("плановая смена после " + sessionRequests + " запросов");
  sessionRequests += 1;
  burstRequests += 1;
  try {
    return await flight(page, url, expectMarker);
  } catch {
    return { status: 0, text: "" };
  }
}

// ---- Предохранитель ---------------------------------------------------------
// Стена молчания — сигнал «на сегодня слишком много», а не «окно испортилось».
// Открывать новую сессию бесполезно и вредно: свежая проверка «не робот» 31.08
// дважды подряд повисала, а череду таких проверок источник как раз и считает
// подозрительной. Поэтому при стене отдыхаем в том же окне (пропуск в нём
// остаётся живым) и продолжаем; если стена вернулась и после двух пауз —
// останавливаемся вежливо: всё проверенное уже в базе.
let consecutiveSilence = 0;
let wallPauses = 0;
let answersSinceWallPause = 0;
let lastAnswerAt = Date.now();
let stopped = false;
// Исчерпанная норма подходов — штатный конец работы, а не авария: в отчёте
// такие ночи не должны выглядеть оборванными.
let budgetSpent = false;
// Текущая длина отдыха: подбирается по ходу дела, см. noteAnswer.
let restMinutes = burstPauseMin;

// Сигнал остановки (systemd, Ctrl+C) не должен выбрасывать наработанное:
// потоки сворачиваются, всё проверенное дозаписывается, отчёт сохраняется.
// Playwright по этому же сигналу сам закрывает браузер — оставшиеся запросы
// мгновенно вернутся пустыми, так что ожидание короткое.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (!stopped) console.log(`[stop] получен ${signal} — сворачиваюсь, всё проверенное сохраняю`);
    stopped = true;
  });
}

async function noteAnswer(ok) {
  if (stopped) return;
  if (ok) {
    consecutiveSilence = 0;
    answersSinceWallPause += 1;
    lastAnswerAt = Date.now();
    return;
  }
  consecutiveSilence += 1;
  // Две картины блокировки: стена быстрых пустых ответов (ловится счётчиком)
  // и стена медленных зависаний (счётчик растёт еле-еле — ловим по времени).
  const wall = consecutiveSilence >= SILENCE_LIMIT
    || (consecutiveSilence >= 12 && Date.now() - lastAnswerAt > 180_000);
  if (!wall) return;
  consecutiveSilence = 0;
  lastAnswerAt = Date.now();
  // Пауза, после которой работа шла как следует, считается сработавшей —
  // лимит на подряд идущие безуспешные паузы, а не на все за ночь.
  if (answersSinceWallPause >= 100) wallPauses = 0;
  if (wallPauses >= 4) {
    stopped = true;
    console.log("[stop] источник молчит и после четырёх передышек — заканчиваю, всё проверенное сохранено");
    return;
  }
  // Отдых подбирается сам. Замеры 31.08.2026: запас у источника скользящий и к
  // вечеру скупеет — утром рывок давал 150–170 страниц, днём 100, а десяти
  // минут отдыха уже не хватало (пустил ноль). Поэтому: рывок вышел коротким —
  // отдыхаем дольше, вышел полным — понемногу сокращаем. Новая сессия здесь не
  // помогает: запас общий, чистую сессию сразу после стены не пускают вовсе.
  if (answersSinceWallPause < 40) restMinutes = Math.min(restMinutes + 10, 45);
  else if (answersSinceWallPause >= 100) restMinutes = Math.max(burstPauseMin, restMinutes - 5);
  wallPauses += 1;
  console.log(`[wall] источник замолчал после ${answersSinceWallPause} ответов — отдыхаю ${restMinutes} мин (передышка ${wallPauses} из 4)`);
  answersSinceWallPause = 0;
  const until = Date.now() + restMinutes * 60_000;
  while (Date.now() < until && !stopped) await sleep(5_000);
}

let rscSeq = 0;
async function listFlight(params) {
  rscSeq += 1;
  const { status, text } = await safeFlight(`/en/used-cars?vehicle_list=1&${params}&_rsc=r${rscSeq}`, "infoid");
  return status === 200 && text ? extractChe168ListPayload([asFlightScript(text)]) : null;
}

const { pool } = await import("../server/db.mjs");
// Порядок важен: очередь поштучных проверок берётся из этого же списка, и
// «сначала самые давно не проверенные» превращает ограниченный ночной запас
// проверок в честную карусель по всему каталогу.
const { rows } = await pool.query(`SELECT id, external_id, price_cny, estimated_total_usd,
    (source_payload->>'usdPrice')::numeric AS usd_price,
    (source_payload->>'year')::int AS year,
    source_payload->>'type' AS type,
    source_payload->>'brand' AS brand,
    source_payload->>'rawSeries' AS raw_series,
    source_payload->>'engine' AS engine,
    source_payload->>'sourceFuelType' AS fuel_type,
    source_payload->>'transmission' AS transmission,
    source_payload->>'manufactureDate' AS manufacture_date,
    source_payload->>'city' AS city,
    source_payload->>'dimensions' AS dimensions,
    (source_payload->>'curbWeight')::numeric AS curb_weight,
    title
  FROM listings WHERE source='Che168' AND status='active'
  ORDER BY last_checked_at ASC NULLS FIRST`);
console.log(`[db] ${rows.length} active Che168 listings`);

// Все наши идентификаторы, вместе с проданными: машина, снятая с витрины, иногда
// ещё мелькает в списках, и без этого списка находки предлагали бы качать её
// каждую ночь заново.
const { rows: knownRows } = await pool.query(`SELECT id FROM listings WHERE source='Che168'`);
const knownIds = new Set(knownRows.map((row) => row.id));

// Cards visitors actually opened in the last month jump the queue: each gets a
// detail-page check and a database write before the list sweep even starts, so
// the cars people look at are fresh within the first minutes of a run.
const { rows: popular } = await pool.query(`SELECT listing_id, count(*)::int AS views
  FROM analytics_events
  WHERE listing_id IS NOT NULL
    AND created_at >= now() - interval '30 days'
    AND event_name IN ('vehicle_view','availability_click','favorite_added')
  GROUP BY listing_id ORDER BY views DESC LIMIT 300`);
const activeById = new Map(rows.map((row) => [row.id, row]));
const popularRows = popular.map((p) => activeById.get(p.listing_id)).filter(Boolean);

const seenPrices = new Map(); // externalId -> current USD price on the source
const discoveries = new Map(); // externalId -> кандидат на скачивание, см. lib/che168-discovery.mjs
let discoveriesSkipped = 0; // машины источника, которых у нас нет и которые не проходят правила
let listPages = 0;
let listPagesEmpty = 0;
let seriesWalked = 0;
let brandsWalked = 0;
// Марки, чьи списки этой ночью действительно обойдены ДО КОНЦА: только за них
// мы вправе считать «в списке не нашлось — значит продана». Отметка ставится
// после последней страницы марки, а не после первой — иначе обрыв посреди
// марки отправлял бы десятки тысяч её невиданных машин на поштучную проверку
// (так 31.08 в очереди оказалось 74 тысячи карточек).
const coveredBrands = new Set();
// Простые марки, пролистанные целиком: их машины без цены в списках — пропавшие.
const answeredBrands = new Set();
// Крупные марки, пройденные по моделям до конца (пусть и с ценовым срезом).
const giantAnswered = new Set();
// Модели, пролистанные целиком (без среза): их машины отвечают как у простых марок.
const answeredSeries = new Set();
// Модели с ценовым срезом: имя модели -> самая дорогая увиденная цена (USD).
// Машина этой модели дешевле потолка обязана была попасться в срезе; дороже —
// «за срезом», её не трогаем.
const seriesCeiling = new Map();
// Машины за ценовым срезом: не пропавшие, просто вне зоны ответственности ночи.
let beyondSlice = 0;
const seriesKeyOf = (value) => String(value || "").trim().toLowerCase();
// Подходами: столько запросов подряд, потом пауза. Источник считает обращения,
// а не скорость, и после паузы запас восстанавливается (замер 31.08.2026).
let burstRequests = 0;
let burstsDone = 0;
// Показатели на конец прошлого подхода: доклад считает разницу, чтобы в
// сообщении были цифры именно этого подхода, а не всей ночи.
let lastSnapshot = { priced: 0, found: 0, sold: 0, pages: 0, empty: 0, detail: 0 };
// Проданные считаются внутри обхода, а доклад читает показатели снаружи —
// поэтому итог дублируется сюда.
let soldTotal = 0;
// Марки, обновлённые именно в текущем подходе: после доклада набор очищается,
// чтобы в следующем сообщении были уже другие.
const burstBrands = new Set();
// Все марки за прогон — для итогового сообщения: burstBrands по ходу чистится.
const allBrandsThisRun = new Set();
const tgQuiet = args.get("quiet") === "true";
// Курсор читается до обхода, пишется после: ночь продолжает с места остановки.
let cursor = { brandsDone: [], round: 1 };

// Страница списка учтена: цены — в общую копилку, незнакомые машины — в находки.
function absorbList(payload, fuelType) {
  if (!payload?.items?.length) return false;
  for (const item of payload.items) {
    const id = String(item.infoid || "");
    const price = Number(String(item.price).replace(/[^\d.]/g, "")) || null;
    if (id && price && !seenPrices.has(id)) seenPrices.set(id, price);
    // Незнакомая машина попадается здесь бесплатно — страница всё равно
    // прочитана ради цен. Отбор идёт по списку, окончательное решение
    // остаётся за карточкой при скачивании.
    if (id && !knownIds.has(`che168-${id}`) && !discoveries.has(id)) {
      const candidate = discoveryCandidate(item, { fuelType, knownIds });
      if (candidate) discoveries.set(id, candidate);
      else discoveriesSkipped += 1;
    }
  }
  return true;
}

// Живой список моделей гигантской марки: нумерация моделей у Autohome общая с
// Che168, а запасной список из репозитория страхует от недоступности Autohome
// и сам по себе стареет медленно.
async function autohomeSeriesIds(brandId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://car.autohome.com.cn/price/brand-${brandId}.html`, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const text = await response.text();
        const ids = [...new Set([...text.matchAll(/series-(\d+)/g)].map((m) => Number(m[1])))];
        if (ids.length) return ids;
      }
    } catch {}
    await sleep(1000 * (attempt + 1));
  }
  return [];
}

// Самая дорогая цена на странице: для ценового среза по модели важно знать,
// до какой цены мы долистали — это и есть потолок ответственности.
function pageMaxUsd(payload) {
  let max = 0;
  for (const item of payload?.items || []) {
    const price = Number(String(item.price).replace(/[^\d.]/g, "")) || 0;
    if (price > max) max = price;
  }
  return max;
}

// Листает срез со второй страницы (первую уже прочитала разведка) до глубины
// depth. Возвращает, дошли ли до конца без обрыва и пустот, и самую дорогую
// увиденную цену. Раньше каждый срез проходился дважды (перемешивание выдачи),
// но источник с 27.08.2026 считает обращения — теперь один проход, остальное
// добирает карусель поштучных проверок.
async function walkSlice(baseParams, pageCount, fuelType, depthCap) {
  let depth = Math.min(pageCount, depthCap);
  if (maxPages) depth = Math.min(depth, maxPages);
  let empties = 0;
  let walked = 0;
  let maxUsd = 0;
  for (let pageIndex = 2; pageIndex <= depth && !stopped; pageIndex += 1) {
    const payload = await listFlight(`${baseParams}&page=${pageIndex}`);
    const ok = absorbList(payload, fuelType);
    await noteAnswer(ok);
    if (!ok) { listPagesEmpty += 1; empties += 1; }
    else maxUsd = Math.max(maxUsd, pageMaxUsd(payload));
    listPages += 1;
    walked += 1;
    if (listPages % 200 === 0) console.log(`[lists] ${listPages} pages, ${seenPrices.size} cars, ${discoveries.size} new`);
    await sleep(pace);
  }
  // Обрыв посреди среза — «не дошли»: марка не получит отметку «обойдена», и её
  // невиданные машины не поедут на поштучную проверку зря. Редкая пустая
  // страница (до 5%) — не обрыв: пропавшие всё равно перепроверяются поштучно,
  // прежде чем машина будет помечена проданной.
  const complete = !stopped && empties <= Math.max(1, Math.round(walked * 0.05));
  return { complete: walked > 0 ? complete : !stopped, maxUsd };
}

async function sweepLists() {
  // Марка обрабатывается целиком — разведка и все её страницы — и только потом
  // очередь идёт дальше. Так отметка «обойдена» честная, а курсор двигается
  // марка за маркой даже через обрывы и паузы.

  // Раньше фиды 7/5/6 листались целиком, вместе с сотней марок, которых мы не
  // берём: их страницы читались и выбрасывались (31% и 26% обращений впустую).
  // Теперь, как у бензина, идём по своим маркам и в порядке из настройки.
  for (const fuelType of activeFeeds.filter((f) => f !== 1)) {
    const table = await loadBrandTable(fuelType);
    const wanted = orderedBrands(fuelType, table);
    console.log(`[feed] fueltype=${fuelType}: беру ${wanted.length} своих марок из ${Object.keys(table).length}`);
    for (const brand of wanted) {
      if (stopped) break;
      const payload = await listFlight(`fueltype=${fuelType}&brandid=${brand.id}&sort=2`);
      await noteAnswer(Boolean(payload));
      await sleep(pace);
      if (!payload?.pageCount || !payload.totalCount) continue;
      absorbList(payload, fuelType);
      brandsWalked += 1;
      burstBrands.add(brand.name);
      allBrandsThisRun.add(brand.name);
      const { complete } = await walkSlice(`fueltype=${fuelType}&brandid=${brand.id}&sort=2`, payload.pageCount, fuelType, SLICE_MAX_PAGES);
      if (complete && payload.pageCount <= SLICE_MAX_PAGES) {
        answeredBrands.add(canonicalImportBrand(brand.name));
        coveredBrands.add(canonicalImportBrand(brand.name));
      } else if (complete) {
        // Марка глубже потолка среза: пролистана её дешёвая часть, за остальное
        // не отвечаем, но в курсоре она пройдена — очередь должна двигаться.
        coveredBrands.add(canonicalImportBrand(brand.name));
      }
    }
  }

  // Бензиновый фид глубокой пагинации не переживает — режем по маркам, а самые
  // крупные марки по моделям. sort=2 (по цене) даёт устойчивую мелкую пагинацию.
  if (activeFeeds.includes(1)) {
    const giantSeries = JSON.parse(await fs.readFile(GIANT_SERIES_PATH, "utf8"));
    let brands = Object.entries(brandMap.brands)
      .map(([name, value]) => ({ name, id: value.brandId, censusListings: value.listings || 0 }))
      .sort((a, b) => b.censusListings - a.censusListings);
    // Раньше бензин делился между тремя календарными ночами. Теперь очередь
    // задаётся настройкой, а докуда дошли — помнит курсор: смена больше не нужна.
    brands = orderedBrands(1, Object.fromEntries(brands.map((b) => [b.name, { brandId: b.id, listings: b.censusListings }])));
    if (brandLimit) brands = brands.slice(0, brandLimit);
    console.log(`[feed] fueltype=1: беру ${brands.length} своих марок в порядке настройки`);

    for (const brand of brands) {
      if (stopped) break;
      const payload = await listFlight(`fueltype=1&brandid=${brand.id}&sort=2`);
      // Марка, у которой сегодня ноль машин, — это ответ, а не молчание.
      await noteAnswer(Boolean(payload));
      await sleep(pace);
      if (!payload?.pageCount || !payload.totalCount) continue;
      absorbList(payload, 1);
      brandsWalked += 1;
      burstBrands.add(brand.name);
      allBrandsThisRun.add(brand.name);

      if (payload.pageCount <= SLICE_MAX_PAGES) {
        const { complete } = await walkSlice(`fueltype=1&brandid=${brand.id}&sort=2`, payload.pageCount, 1, SLICE_MAX_PAGES);
        if (complete) {
          answeredBrands.add(canonicalImportBrand(brand.name));
          coveredBrands.add(canonicalImportBrand(brand.name));
        }
        continue;
      }

      // Крупная марка — по моделям, с ценовым срезом: каждая модель листается
      // до конца, если она мельче среза, и только на первые страницы по цене,
      // если крупнее (посетителей интересуют дешёвые предложения модели).
      const giant = { ...brand, totalCount: payload.totalCount };
      const fallback = (giantSeries.seriesByBrand[String(giant.id)]?.series || []).map((s) => s.id);
      const live = await autohomeSeriesIds(giant.id);
      const seriesIds = [...new Set([...live, ...fallback])];
      if (!seriesIds.length) {
        // Некуда резать — берём хотя бы дешёвый край марки, без отметки
        // «обойдена»: за невиданные машины этой марки не отвечаем.
        console.log(`[feed] ${giant.name}: списка моделей нет, листаю дешёвый край марки`);
        await walkSlice(`fueltype=1&brandid=${giant.id}&sort=2`, payload.pageCount, 1, 100);
        continue;
      }
      let covered = 0;
      let allSeriesDone = true;
      for (const seriesId of seriesIds) {
        if (stopped) { allSeriesDone = false; break; }
        const seriesPayload = await listFlight(`fueltype=1&seriesid=${seriesId}&sort=2`);
        await noteAnswer(Boolean(seriesPayload));
        await sleep(pace);
        if (!seriesPayload?.pageCount || !seriesPayload.totalCount) continue;
        absorbList(seriesPayload, 1);
        // Страница марки на Autohome ссылается и на «рекомендованные» чужие
        // модели — такой номер источнику знаком, но это не наша марка.
        // Первую страницу мы уже забрали (цены лишними не бывают), а вглубь
        // не идём: чужая модель обойдётся в срезе своей марки.
        if (seriesPayload.items?.[0]?.brandname && seriesPayload.items[0].brandname !== giant.name) continue;
        seriesWalked += 1;
        covered += seriesPayload.totalCount;
        const seriesName = seriesKeyOf(seriesPayload.items?.[0]?.seriesname);
        const sliced = modelTopPages > 0 && seriesPayload.pageCount > modelTopPages;
        const depthCap = sliced ? modelTopPages : SLICE_MAX_PAGES;
        const { complete, maxUsd } = await walkSlice(`fueltype=1&seriesid=${seriesId}&sort=2`, seriesPayload.pageCount, 1, depthCap);
        if (!complete) { allSeriesDone = false; continue; }
        if (!seriesName) continue;
        if (sliced) {
          const firstPageMax = pageMaxUsd(seriesPayload);
          seriesCeiling.set(seriesName, Math.max(maxUsd, firstPageMax));
        } else if (seriesPayload.pageCount <= SLICE_MAX_PAGES) {
          answeredSeries.add(seriesName);
        }
      }
      const share = Math.round((covered / giant.totalCount) * 100);
      console.log(`[feed] ${giant.name}: ${seriesIds.length} моделей (${live.length ? "живой список" : "запасной список"}), покрывают ${covered} из ${giant.totalCount} (${share}%)`);
      if (share < 80) console.log(`[feed] ${giant.name}: покрытие моделей просело — пора обновить перепись (runtime/census-series.mjs)`);
      if (allSeriesDone) {
        giantAnswered.add(canonicalImportBrand(giant.name));
        coveredBrands.add(canonicalImportBrand(giant.name));
      }
    }
  }

  console.log(`[lists] done: ${listPages} pages (${listPagesEmpty} empty), ${seenPrices.size} cars priced`);
  console.log(`[new] ${discoveries.size} машин источника нам подходят и ещё не заведены (${discoveriesSkipped} мимо правил)`);
}

// Находки переживают прогон в файле: пополнение запускается отдельной службой
// позже ночью. Пустой список тоже записываем — иначе пополнение возьмёт
// вчерашний файл и полезет за машинами, которые уже завело.
async function writeDiscoveries() {
  const payload = {
    generatedAt: new Date().toISOString(),
    feeds: activeFeeds,
    catalogKnown: knownIds.size,
    skippedByPolicy: discoveriesSkipped,
    items: [...discoveries.values()],
  };
  await fs.mkdir(path.dirname(DISCOVERIES_PATH), { recursive: true });
  await fs.writeFile(DISCOVERIES_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[new] записано в ${path.relative(ROOT, DISCOVERIES_PATH)}: ${payload.items.length}`);
}

// A card the lists no longer show gets one detail request. The sold page still
// returns a full ssrCarDetail block — only without a price — so "detail without
// a price" is the positive signal for sold. Anything else (404, no payload
// after retries) stays untouched and is only counted: guessing here would
// either hide a live car or keep advertising a sold one.
async function checkDetail(externalId) {
  const { status, text } = await safeFlight(`/en/detail/${externalId}?_rsc=rfd${externalId}`, "ssrCarDetail");
  const payload = status === 200 && text ? extractChe168DetailPayload([asFlightScript(text)]) : null;
  if (!payload?.detail) return { verdict: "unknown", status };
  const price = Number(String(payload.detail.price ?? "").replace(/[^\d.]/g, "")) || null;
  return price ? { verdict: "alive", price } : { verdict: "sold" };
}

const landedTotal = (row, usd) => estimateLandedCost({
  source: "Che168",
  usdPrice: usd,
  chinaPrice: Math.round((usd * USD_TO_CNY) / 100) * 100,
  year: row.year,
  type: row.type,
  engine: row.engine,
  // Без этих полей расчёт не узнает гибрид с генератором и не увидит настоящий
  // возраст машины — и переписал бы цену по старым правилам.
  sourceFuelType: row.fuel_type,
  transmission: row.transmission,
  manufactureDate: row.manufacture_date,
  city: row.city,
  dimensions: row.dimensions,
  curbWeight: row.curb_weight,
}).totalUsd;

let detailChecked = 0;
let detailSkipped = 0;
// Закрытая дверь — не поломка: прогон сворачивается тихо, без стека в журнале.
let entryDenied = false;

try {
  console.log(`[feeds] фиды этой ночи: ${activeFeeds.join(", ")}${args.get("shift") ? ` (ограничено ключом --shift=${args.get("shift")})` : ""}`);
  if (!await openSessionWithRetries()) {
    // Не пустили совсем — это не поломка кода, а закрытая дверь. Уходим с
    // понятным следом в журнале: утренняя проверка (scripts/night-watch.mjs)
    // увидит его и сообщит в телеграм.
    console.log("[stop] источник не пустил ни разу — прогон отменён, каталог остался как был");
    process.exitCode = 1;
    entryDenied = true;
    throw new Error("entry-denied");
  }

  const priceUpdates = []; // real re-pricings: new price + landed estimate + history point
  const estimateUpdates = []; // price unchanged, but the stored landed estimate drifted
  const touchIds = []; // seen and unchanged: just record the sighting
  const soldIds = [];
  const missing = [];
  let unknown = 0;

  const classify = (row, liveUsd) => {
    const oldUsd = Number(row.usd_price) || 0;
    if (liveUsd && oldUsd && Math.abs(liveUsd - oldUsd) >= PRICE_STEP_USD) {
      const est = landedTotal(row, liveUsd);
      priceUpdates.push({
        id: row.id,
        usd: liveUsd,
        cny: Math.round((liveUsd * USD_TO_CNY) / 100) * 100,
        est: Number.isFinite(est) ? est : Number(row.estimated_total_usd) || null,
        oldUsd,
        title: row.title,
      });
      return;
    }
    const usd = oldUsd || liveUsd;
    const est = usd ? landedTotal(row, usd) : null;
    if (Number.isFinite(est) && Math.abs(est - Number(row.estimated_total_usd || 0)) >= 1) estimateUpdates.push({ id: row.id, est });
    else touchIds.push(row.id);
  };

  const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

  // Totals survive across flushes; the working arrays are drained by each one.
  const stats = { rePriced: 0, priceUpdates: [], drops: [], estimateOnly: 0, unchanged: 0, sold: 0 };
  const flushWrites = async () => {
    // Снимок делаем синхронно: пока идёт запись, воркеры продолжают складывать
    // сюда новые машины, и без снимка очистка в конце потеряла бы их.
    const prices = priceUpdates.splice(0);
    const estimates = estimateUpdates.splice(0);
    const touches = touchIds.splice(0);
    const sold = soldIds.splice(0);
    if (!dryRun) {
      for (const batch of chunk(prices, 1000)) {
        // `content_changed_at` — дата настоящего изменения объявления, её берёт карта
        // сайта. Двигаем её только здесь: цена у продавца действительно изменилась.
        // Ниже, где меняется лишь наш расчёт (курс сдвинулся), дату не трогаем — иначе
        // она станет одинаковой у всего каталога и снова перестанет что-то значить.
        // `previous_price_usd` и `price_changed_at` — для стрелки изменения цены на
        // карточке: карточка показывает прошлую цену и дату в подсказке. Прошлую
        // цену пишем в долларах, как её отдал источник, без пересчёта через юани.
        await pool.query(`UPDATE listings l SET price_cny=v.cny, estimated_total_usd=v.est,
            source_payload = l.source_payload || jsonb_build_object('usdPrice', v.usd, 'sourcePriceUsd', v.usd, 'chinaPrice', v.cny),
            previous_price_usd=v.old_usd, price_changed_at=now(),
            last_seen_at=now(), last_checked_at=now(), content_changed_at=now()
          FROM jsonb_to_recordset($1::jsonb) AS v(id text, cny integer, usd numeric, est numeric, old_usd numeric)
          WHERE l.id = v.id`, [JSON.stringify(batch.map(({ id, cny, usd, est, oldUsd }) => ({ id, cny, usd, est, old_usd: oldUsd })))]);
        await pool.query(`INSERT INTO price_history (listing_id, observed_at, price_cny)
          SELECT v.id, now(), v.cny FROM jsonb_to_recordset($1::jsonb) AS v(id text, cny integer)
          ON CONFLICT DO NOTHING`, [JSON.stringify(batch.map(({ id, cny }) => ({ id, cny })))]);
      }
      for (const batch of chunk(estimates, 2000)) {
        await pool.query(`UPDATE listings l SET estimated_total_usd=v.est, last_seen_at=now(), last_checked_at=now()
          FROM jsonb_to_recordset($1::jsonb) AS v(id text, est numeric) WHERE l.id = v.id`, [JSON.stringify(batch)]);
      }
      for (const batch of chunk(touches, 5000)) {
        await pool.query(`UPDATE listings SET last_seen_at=now(), last_checked_at=now() WHERE id = ANY($1::text[])`, [batch]);
      }
      for (const batch of chunk(sold, 5000)) {
        await pool.query(`UPDATE listings SET status='unavailable', last_checked_at=now() WHERE id = ANY($1::text[])`, [batch]);
      }
    }
    stats.rePriced += prices.length;
    stats.priceUpdates.push(...prices);
    stats.drops.push(...prices.filter((u) => u.usd < u.oldUsd));
    stats.estimateOnly += estimates.length;
    stats.unchanged += touches.length;
    stats.sold += sold.length;
    soldTotal = stats.sold;
  };

  // Priority pass: the cars visitors opened get their authoritative detail
  // check and a write immediately, before the long list walk begins.
  const prioritized = new Set();
  if (!skipDetail && popularRows.length) {
    console.log(`[priority] ${popularRows.length} visitor-viewed cars go first`);
    const queue = [...popularRows];
    const worker = async () => {
      while (queue.length && !stopped) {
        const row = queue.shift();
        const result = await checkDetail(row.external_id);
        await noteAnswer(result.verdict !== "unknown");
        if (result.verdict === "sold") soldIds.push(row.id);
        else if (result.verdict === "alive") classify(row, result.price);
        else unknown += 1;
        prioritized.add(row.id);
        await sleep(pace);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log(`[priority] done: ${prioritized.size} checked · ${soldIds.length} sold · ${priceUpdates.length} re-priced`);
    await flushWrites();
  }

  cursor = await loadCursor();
  await loadOrder();
  if (orderConfig?.burst) {
    if (!args.get("burst")) burstLimit = Number(orderConfig.burst.requests || burstLimit);
    if (!args.get("burst-pause")) burstPauseMin = Number(orderConfig.burst.pauseMinutes || burstPauseMin);
    if (!args.get("bursts")) burstsMax = Number(orderConfig.burst.burstsPerSession || orderConfig.burst.burstsPerNight || burstsMax);
  }
  if (!args.get("model-top") && orderConfig?.modelPriceSlice?.pages != null) {
    modelTopPages = Number(orderConfig.modelPriceSlice.pages) || 0;
  }
  console.log(`[burst] норма подхода ${burstLimit} обращений, пауза ${burstPauseMin} мин, подходов за сессию до ${burstsMax}`);
  if (modelTopPages > 0) console.log(`[order] ценовой срез моделей: первые ${modelTopPages} страниц по возрастанию цены (~${modelTopPages * 24} самых дешёвых машин модели)`);
  console.log(`[order] круг №${cursor.round}, в нём уже обойдено марок: ${cursor.brandsDone.length}`);
  await sweepLists();
  // Записываем сразу после обхода, до долгой проверки пропавших карточек: если
  // прогон оборвётся на ней, находки уже лежат на диске и пополнение их получит.
  if (!dryRun) await writeDiscoveries();

  let outOfShift = 0;
  const beyondRows = [];
  for (const row of rows) {
    if (prioritized.has(row.id)) continue;
    const liveUsd = seenPrices.get(String(row.external_id));
    if (liveUsd) { classify(row, liveUsd); continue; }
    // Машину, чьи списки сегодня не листались, нельзя считать пропавшей —
    // иначе каждая ночь отправляла бы в поштучную очередь весь остальной
    // каталог, вдесятеро больше обращений, чем экономит сам пропуск.
    const canon = canonicalImportBrand(row.brand);
    if (answeredBrands.has(canon)) { missing.push(row); continue; }
    if (giantAnswered.has(canon)) {
      // Крупная марка пройдена по моделям. Модель, пролистанная целиком, —
      // как простая марка. Модель с ценовым срезом отвечает только за машины
      // дешевле потолка (с запасом на дневное дрожание цен у источника);
      // дорогая часть — «за срезом», её проверяет карусель поштучных проверок.
      const key = seriesKeyOf(row.raw_series);
      const ceiling = seriesCeiling.get(key);
      if (answeredSeries.has(key)) missing.push(row);
      else if (ceiling && Number(row.usd_price) > 0 && Number(row.usd_price) <= ceiling * 0.95) missing.push(row);
      else { beyondSlice += 1; beyondRows.push(row); }
      continue;
    }
    outOfShift += 1;
  }
  console.log(`[match] ${rows.length - prioritized.size - missing.length - outOfShift - beyondSlice} in lists · ${priceUpdates.length} re-priced · ${missing.length} need a detail check · ${beyondSlice} за ценовым срезом · ${outOfShift} ждут своей очереди`);
  // Всё, что списки подтвердили, записываем сразу — до долгой детальной фазы.
  await flushWrites();

  if (!skipDetail && !stopped) {
    const queue = missing.slice(0, detailLimit);
    detailSkipped = missing.length - queue.length;
    if (detailSkipped > 0) console.log(`[detail] потолок за сессию: ${detailSkipped} из ${missing.length} карточек дождутся следующего прогона`);
    // Свободный остаток лимита отдаём машинам «за ценовым срезом»: списки их
    // не видят, и без этой карусели (сначала самые давно не проверенные) их
    // цены и проданность не обновлялись бы никогда.
    if (queue.length < detailLimit && beyondRows.length) {
      const topUp = beyondRows.slice(0, detailLimit - queue.length);
      queue.push(...topUp);
      console.log(`[detail] свободный остаток лимита: ${topUp.length} машин за срезом идут на поштучную проверку`);
    }
    const worker = async () => {
      while (queue.length && !stopped) {
        const row = queue.shift();
        const result = await checkDetail(row.external_id);
        await noteAnswer(result.verdict !== "unknown");
        if (result.verdict === "sold") soldIds.push(row.id);
        else if (result.verdict === "alive") classify(row, result.price);
        else unknown += 1;
        detailChecked += 1;
        if (detailChecked % 200 === 0) console.log(`[detail] ${detailChecked} checked · ${stats.sold + soldIds.length} sold · ${unknown} no answer · ${Math.round((Date.now() - startedAt) / 60000)}min`);
        // Пишем по ходу дела: прогон длинный, и прерванный на середине он должен
        // оставить в базе всё, что успел проверить, а не выбросить результат.
        if (detailChecked % 1000 === 0) await flushWrites();
        await sleep(pace);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log(`[detail] done: ${detailChecked} checked, ${soldIds.length} sold, ${unknown} without a clear answer`);
  }

  await flushWrites();

  // Проданная машина уходит и из избранного: каталог её больше не показывает, и в
  // личном кабинете она висела бы карточкой, которую уже нельзя открыть. Чистим не
  // только помеченные этим прогоном, а всё избранное с неживыми объявлениями —
  // состояние снимает и `db:expire`, а до этого места чистка не доходила.
  // Заказы не трогаем: по ним человек уже общается с нами, там машина должна остаться.
  const favoritesCleared = dryRun ? 0 : (await pool.query(`DELETE FROM customer_favorites f
    USING listings l WHERE l.id = f.listing_id AND l.status <> 'active'`)).rowCount;
  if (favoritesCleared) console.log(`[favorites] ${favoritesCleared} saved cards removed: their listings are gone`);

  // Курсор: дописываем обойденные этой ночью марки. Круг замкнулся, только
  // когда в очереди не осталось НИ ОДНОЙ марки ни в одном фиде — раньше здесь
  // была ошибка: остаток считался по уже отфильтрованному списку, и круг
  // «замыкался» после первой же ночи, а хвост очереди не доходил никогда.
  const doneNow = new Set([...(cursor.brandsDone || []), ...coveredBrands]);
  let remainingBrands = 0;
  for (const feed of activeFeeds) {
    const table = feed === 1
      ? Object.fromEntries(Object.entries(brandMap.brands).map(([name, v]) => [name, { brandId: v.brandId, listings: v.listings || 0 }]))
      : await loadBrandTable(feed);
    remainingBrands += orderedBrands(feed, table, doneNow, { restartWhenEmpty: false }).length;
  }
  const circleClosed = doneNow.size > 0 && remainingBrands === 0;
  const nextCursor = circleClosed
    ? { brandsDone: [], round: (cursor.round || 1) + 1 }
    : { brandsDone: [...doneNow], round: cursor.round || 1 };
  await saveCursor(nextCursor);
  console.log(
    circleClosed
      ? `[order] круг №${cursor.round} замкнулся — следующая сессия начнёт круг №${nextCursor.round}`
      : `[order] в круге №${nextCursor.round} обойдено марок: ${nextCursor.brandsDone.length} (за эту сессию ${coveredBrands.size})`
  );

  const drops = stats.drops;
  const report = {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    minutes: Math.round((Date.now() - startedAt) / 6000) / 10,
    dryRun,
    shift,
    outOfShift,
    stoppedEarly: stopped && !budgetSpent,
    budgetSpent,
    sessionRotations,
    wallPauses,
    pace,
    concurrency,
    burstLimit,
    burstPauseMin,
    burstsDone,
    modelTopPages,
    beyondSlice,
    circleRound: cursor.round || 1,
    brandsCoveredThisRun: coveredBrands.size,
    brandsCoveredInCircle: nextCursor.brandsDone.length,
    circleClosed,
    activeBefore: rows.length,
    listPages,
    listPagesEmpty,
    brandsWalked,
    seriesWalked,
    pricedByLists: seenPrices.size,
    discovered: discoveries.size,
    discoveriesSkipped,
    prioritized: prioritized.size,
    rePriced: stats.rePriced,
    priceDrops: drops.length,
    priceRises: stats.rePriced - drops.length,
    estimateOnly: stats.estimateOnly,
    unchanged: stats.unchanged,
    detailChecked: prioritized.size + detailChecked,
    detailSkipped,
    sold: stats.sold,
    noAnswer: unknown,
    favoritesCleared,
    biggestDrops: [...drops].sort((a, b) => (a.usd - a.oldUsd) - (b.usd - b.oldUsd)).slice(0, 10)
      .map(({ id, title, oldUsd, usd }) => ({ id, title, oldUsd, usd })),
  };
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify({ ...report, priceUpdates: stats.priceUpdates.map(({ id, title, oldUsd, usd }) => ({ id, title, oldUsd, usd })) }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await reportRun(stats, report);
} catch (error) {
  if (!entryDenied) throw error;
  // Отчёт нужен и здесь: утренняя проверка судит по нему, а не по журналу.
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify({
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    minutes: Math.round((Date.now() - startedAt) / 6000) / 10,
    shift,
    entryDenied: true,
    note: "источник не пустил: проверка «не робот» не пройдена",
  }, null, 2)}\n`);
} finally {
  if (browser) await browser.close().catch(() => {});
  await pool.end();
}
