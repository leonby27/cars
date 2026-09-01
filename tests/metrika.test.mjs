import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Внешние счётчики живут в index.html, а разрешение на их загрузку — в заголовках
// безопасности из vercel.json. Забыть про второе легко, и тогда аналитика молча
// перестаёт считать: браузер блокирует скрипт, а на сайте всё выглядит нормально.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const csp = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"))
  .headers.flatMap((entry) => entry.headers)
  .find((header) => header.key === "Content-Security-Policy").value;

test("счётчик Метрики стоит на странице", () => {
  assert.match(html, /mc\.yandex\.ru\/metrika\/tag\.js\?id=(\d+)/);
  const id = html.match(/mc\.yandex\.ru\/metrika\/tag\.js\?id=(\d+)/)[1];
  // Номер счётчика один и тот же в загрузчике, в init и в картинке для браузеров без JS.
  assert.ok(html.includes(`ym(${id}, 'init'`), "init с другим номером счётчика");
  assert.ok(html.includes(`mc.yandex.ru/watch/${id}`), "картинка-счётчик с другим номером");
  // Заходы с рабочего компьютера в счётчик не идут.
  assert.match(html, /localhost/);
  assert.match(html, /192\\\.168\\\./);
  // И есть выключатель для своего браузера: ?nocount=1 запоминается навсегда.
  assert.match(html, /nocount/);
  assert.ok(html.includes("localStorage.getItem('nocount')"), "выключатель своих заходов пропал");
  // Автоматические браузеры (проверки и роботы) в статистику тоже не идут.
  assert.match(html, /navigator\.webdriver/);
  // Внутренняя CRM не запускает ни счётчик, ни Webvisor даже при прямом входе.
  assert.ok(html.includes("page === '/analytics'"), "нет раннего выключателя для CRM");
});

test("счётчик Google Analytics стоит на странице с теми же исключениями", () => {
  const id = html.match(/const id = '(G-[A-Z0-9]+)'/)?.[1];
  assert.ok(id, "идентификатор GA4 не найден");
  assert.ok(html.includes("googletagmanager.com/gtag/js?id=${id}"), "загрузчик GA4 пропал");
  assert.ok(html.includes("window.gtag('config', id"), "конфигурация GA4 пропала");
  assert.ok(html.includes("send_page_view:false"), "автоматический просмотр GA4 создаст дубль");
  assert.ok(html.includes("window.gtag('event', 'page_view'"), "первый просмотр GA4 не отправляется");
  assert.ok(html.includes("allow_google_signals:false"), "рекламные сигналы Google включились");
  assert.match(html, /page === '\/analytics'/);
  assert.match(html, /navigator\.webdriver/);
  assert.match(html, /localStorage\.getItem\('nocount'\)/);
});

test("правила безопасности пускают Метрику", () => {
  const rule = (name) => csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(name)) || "";
  assert.ok(rule("script-src").includes("https://mc.yandex.ru"), "скрипт счётчика заблокирован");
  assert.ok(rule("connect-src").includes("https://mc.yandex.ru"), "отправка данных заблокирована");
  // Вебвизор (запись действий на странице) держит постоянное соединение по wss.
  assert.ok(rule("connect-src").includes("wss://mc.yandex.com"), "вебвизор заблокирован");
  // Картинка-счётчик и кадр синхронизации Яндекса.
  assert.ok(rule("img-src").includes("https:"), "картинка счётчика заблокирована");
  assert.ok(rule("frame-src").includes("https://*.yandex.ru"), "кадр синхронизации заблокирован");
});

test("правила безопасности пускают Google Analytics", () => {
  const rule = (name) => csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(name)) || "";
  assert.ok(rule("script-src").includes("https://www.googletagmanager.com"), "скрипт GA4 заблокирован");
  assert.ok(rule("connect-src").includes("https://www.google-analytics.com"), "отправка GA4 заблокирована");
  assert.ok(rule("connect-src").includes("https://*.google-analytics.com"), "региональный адрес GA4 заблокирован");
});

test("быстрый просмотр Метрика засчитывает как просмотр страницы машины", async () => {
  const calls = [];
  const googleCalls = [];
  globalThis.window = {
    location:{ href:"https://abcars.by/catalog", pathname:"/catalog" },
    document:{ title:"Каталог | abcars.by" },
    __ym:111868764,
    __ga:"G-964NJY891X",
    ym:(...args) => calls.push(args),
    gtag:(...args) => googleCalls.push(args),
  };
  const { stopMetrika, trackMetrikaGoal, trackMetrikaView } = await import("../src/analytics.js");

  // Модалка не меняет адрес в браузере, поэтому просмотр называем Метрике сами —
  // адресом и заголовком страницы этой машины.
  trackMetrikaView("/cars/12345", { title:"Zeekr 001, 30 000 км — цена до Минска | abcars.by" });
  assert.deepEqual(calls[0], [111868764, "hit", "https://abcars.by/cars/12345", { title:"Zeekr 001, 30 000 км — цена до Минска | abcars.by" }]);
  assert.deepEqual(googleCalls[0], ["event", "page_view", {
    page_location:"https://abcars.by/cars/12345",
    page_title:"Zeekr 001, 30 000 км — цена до Минска | abcars.by",
    send_to:"G-964NJY891X",
  }]);

  // Посмотрел в модалке и следом открыл страницу целиком — это один взгляд, а не два.
  globalThis.window.location.href = "https://abcars.by/cars/12345";
  trackMetrikaView("https://abcars.by/cars/12345");
  assert.equal(calls.length, 1, "тот же адрес ушёл в Метрику дважды");
  assert.equal(googleCalls.length, 1, "тот же адрес ушёл в GA4 дважды");

  // Следующая машина считается как новый просмотр.
  trackMetrikaView("/cars/67890");
  assert.equal(calls.length, 2);
  assert.equal(googleCalls.length, 2);

  trackMetrikaGoal("quick_view");
  assert.deepEqual(calls[2], [111868764, "reachGoal", "quick_view", undefined]);
  assert.deepEqual(googleCalls[2], ["event", "quick_view", { send_to:"G-964NJY891X" }]);

  // Даже уже работающий счётчик полностью останавливается при входе в CRM.
  globalThis.window.location.pathname = "/analytics";
  trackMetrikaView("/analytics");
  trackMetrikaGoal("quick_view");
  assert.equal(calls.length, 3, "CRM отправила просмотр или цель");
  assert.equal(googleCalls.length, 3, "CRM отправила просмотр или цель в GA4");
  stopMetrika();
  assert.deepEqual(calls[3], [111868764, "destruct"]);
  assert.equal(globalThis.window.__ym, undefined);
  assert.equal(globalThis.window.__ga, undefined);
  assert.equal(globalThis.window["ga-disable-G-964NJY891X"], true);

  // Без счётчика (свой заход, робот) не отправляется ничего.
  globalThis.window.location.pathname = "/catalog";
  trackMetrikaView("/cars/13579");
  assert.equal(calls.length, 4);
  assert.equal(googleCalls.length, 3);
  delete globalThis.window;
});

test("модалка быстрого просмотра сообщает Метрике о просмотре", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const open = app.slice(app.indexOf("const openQuickView = (nextCar)"));
  assert.ok(open.slice(0, 700).includes("trackMetrikaView("), "открытие модалки перестало считаться просмотром");
  assert.ok(open.slice(0, 700).includes('trackMetrikaGoal("quick_view")'), "цель быстрого просмотра пропала");
});
