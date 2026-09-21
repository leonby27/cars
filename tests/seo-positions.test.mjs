import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildSeoPositionRows, normalizeSeoQuery, SEO_POSITION_CORE, SEO_WORDSTAT_UPDATED_AT } from "../src/seo-keywords.js";

test("SEO-ядро содержит все контрольные группы Wordstat для Беларуси", () => {
  assert.equal(SEO_WORDSTAT_UPDATED_AT, "2026-09-21");
  assert.equal(SEO_POSITION_CORE.length, 120);
  assert.deepEqual(SEO_POSITION_CORE[0], { group:"Общие коммерческие запросы", query:"авто из Китая", wordstatMonthly:5598 });
  assert.deepEqual(new Set(SEO_POSITION_CORE.map((row) => row.group)), new Set(["Общие коммерческие запросы", "Растаможка и расчёт", "Электромобили", "Гибриды", "Выбор и владение", "Марки и модели"]));
  assert.ok(SEO_POSITION_CORE.some((row) => row.query === "калькулятор растаможки авто в Беларуси" && row.wordstatMonthly === 2017));
  assert.ok(SEO_POSITION_CORE.some((row) => row.query === "электромобиль купить в Беларуси" && row.wordstatMonthly === 2326));
  assert.ok(SEO_POSITION_CORE.some((row) => row.query === "geely ex2 купить" && row.wordstatMonthly === 1523));
});

test("SEO-позиции точно сопоставляются с запросами поисковиков, а отсутствующие остаются пустыми", () => {
  const rows = buildSeoPositionRows({
    yandex:{ queries:[{ value:"  АВТО  ИЗ КИТАЯ ", position:4.2, previousPosition:8, positionChange:3.8 }] },
    google:{ queries:[{ value:"б/у авто из китая", position:11, previousPosition:9, positionChange:-2 }] },
  });
  assert.equal(normalizeSeoQuery(" Ёлка   ИЗ  КИТАЯ "), "елка из китая");
  assert.equal(rows.find((row) => row.query === "авто из Китая").yandex.position, 4.2);
  assert.equal(rows.find((row) => row.query === "б/у авто из Китая").google.positionChange, -2);
  assert.equal(rows.find((row) => row.query === "пригон авто из Китая").google, null);
});

test("в аналитике есть отдельный пункт и одна таблица SEO-позиций", async () => {
  const page = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/analytics.css", import.meta.url), "utf8");
  assert.match(page, /id:"seo-positions", label:"SEO позиции"/);
  assert.match(page, /label:'Wordstat \/ мес\.'/);
  assert.match(page, /<SeoPositionValue row=\{row\.yandex\}/);
  assert.match(page, /<SeoPositionValue row=\{row\.google\}/);
  assert.match(page, /Только с позициями/);
  assert.match(page, /Делить по категориям/);
  assert.match(page, /\[grouped, setGrouped\] = useState\(false\)/);
  assert.match(page, /\[onlyRanked, setOnlyRanked\] = useState\(true\)/);
  assert.match(page, /row\.yandex\?\.position != null \|\| row\.google\?\.position != null/);
  assert.match(page, /grouped && \(index === 0/);
  assert.match(page, /if \(grouped && left\.group !== right\.group\)/);
  assert.match(page, /seoPositionColumns\.map/);
  assert.match(page, /aria-sort=/);
  assert.match(page, /SEO_POSITION_REPORT_PERIOD = '30'/);
  assert.match(page, /id:"seo-positions", label:"SEO позиции", icon:ChartLineUp, ranged:false/);
  assert.doesNotMatch(page, /<SeoPositionsSection period=\{period\}/);
  assert.match(page, /Math\.round\(row\.position\)/);
  assert.match(page, /Math\.round\(row\.previousPosition\)/);
  assert.match(page, /Math\.round\(change\)/);
  assert.doesNotMatch(page, /changeLabel = roundedChange == null/);
  assert.doesNotMatch(page, /Позиции и динамика — средние за выбранный период/);
  assert.doesNotMatch(page, /<span>позиция · динамика<\/span>/);
  assert.doesNotMatch(page, /id === "seo-positions".*period === "today".*setPeriod\("30"\)/s);
  assert.match(styles, /\.analytics-seo-table/);
  assert.match(styles, /\.analytics-switch/);
  assert.match(styles, /\.analytics-seo-switches/);
  assert.match(styles, /\.analytics-seo-mobile-sort/);
});
