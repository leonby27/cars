import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Счётчик Метрики живёт в index.html, а разрешение на его загрузку — в заголовках
// безопасности из vercel.json. Забыть про второе легко, и тогда счётчик молча
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
