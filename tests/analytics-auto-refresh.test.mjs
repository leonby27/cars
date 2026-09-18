import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Страница аналитики брала цифры один раз при заходе. Вкладку с ней держат открытой
// весь день, поэтому новая заявка, просмотр или регистрация появлялись только после
// обновления руками — а красный счётчик раздела так и не загорался.
const page = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");

test("открытая аналитика сама перечитывает цифры раз в минуту", () => {
  assert.match(page, /const ANALYTICS_REFRESH_MS = 60_000;/);
  assert.match(page, /window\.setInterval\(tick, ANALYTICS_REFRESH_MS\)/);
  // Обновляется весь срез, а не только заявки: карточки, таблицы и разделы читают
  // один и тот же ответ, а счётчики разделов пересчитываются от него же.
  assert.match(page, /refresh\.current = \(\) => \{\s*load\(periodRef\.current, \{ silent:true \}\);\s*loadLeads\(\{ silent:true \}\);/);
  // График живёт своим запросом и без этой связки отставал бы от карточек.
  assert.match(page, /\}, \[trendPeriod, data\.generatedAt\]\);/);
});

test("в фоновой вкладке не ходим на сервер, а при возвращении обновляемся сразу", () => {
  assert.match(page, /const tick = \(\) => \{ if \(document\.visibilityState === "visible"\) refresh\.current\(\); \};/);
  assert.match(page, /document\.addEventListener\("visibilitychange", tick\)/);
  assert.match(page, /document\.removeEventListener\("visibilitychange", tick\)/);
  assert.match(page, /window\.clearInterval\(timer\)/);
});

test("самообновление молчит: ни полос загрузки, ни сообщений об ошибке", () => {
  // Круг обновления не должен мигать кнопкой «Обновляем…» и не должен подменять
  // список заявок красной ошибкой, если сеть моргнула.
  assert.match(page, /const loadLeads = async \(\{ silent = false \} = \{\}\) => \{\s*if \(!silent\) \{ setLeadsLoading\(true\); setLeadsError\(""\); \}/);
  assert.match(page, /if \(!silent\) setLeadsError\("Не удалось загрузить заявки/);
  assert.match(page, /\} finally \{ if \(!silent\) setLeadsLoading\(false\); \}/);
  assert.match(page, /const load = async \(requestedPeriod = period, \{ silent = false \} = \{\}\) => \{/);
  assert.match(page, /if \(!silent && request === dashboardRequest\.current\) setError\(/);
  // Кнопка «Обновить» передавала бы в настройки событие мыши — обновление должно
  // остаться громким, с индикатором.
  assert.match(page, /onClick=\{\(\) => reload\(\)\}/);
});
