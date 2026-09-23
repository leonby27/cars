import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { TOOL_PAGE_TEXTS } from "../src/tool-page-texts.js";
import { findToolPage } from "../src/tool-pages.js";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const quotaIcon = fs.readFileSync(new URL("../public/services/ev-quota-zero-percent-gold.png", import.meta.url));

test("страница квоты показывает выбор аудитории перед раскрывающимися пояснениями", () => {
  const calculator = app.indexOf("{isQuotaPage && <QuotaPageCalculator />}");
  const disclosures = app.indexOf('<ToolDisclosures title="О квоте и расчёте"', calculator);
  const component = app.slice(
    app.indexOf("function QuotaPageCalculator()"),
    app.indexOf("function DeliveryCalculator"),
  );

  assert.ok(calculator >= 0);
  assert.ok(disclosures > calculator);
  assert.match(component, /<QuotaAudienceTabs[\s\S]*?<QuotaMonthPicker[\s\S]*?<QuotaPeriodResult/);
  assert.doesNotMatch(component, /QuotaPricingToggle/);
});

test("меню квоты оставляет переключатель цен и ведёт за подробностями на отдельную страницу", () => {
  const panel = app.slice(
    app.indexOf("function EvQuotaPanel"),
    app.indexOf("const QUOTA_TOOLTIP"),
  );

  assert.match(panel, /<QuotaPricingToggle \/>/);
  assert.match(panel, /<AppLink className="primary quota-panel-details" href="\/ev-quota"[\s\S]*?<Lightning size=\{17\} weight="bold"[\s\S]*?<span>Подробнее<\/span>/);
  assert.doesNotMatch(panel, /QuotaAudienceTabs|QuotaAudienceResult|quota-panel-forecast/);
  assert.match(app, /<EvQuotaPanel navigate=\{navigate\} onDetails=\{\(\) => setOpen\(false\)\} \/>/);
  assert.match(app, /Цены на электромобили без квоты: пошлина 15%/);
  assert.match(styles, /\.quota-panel-details\s*\{[\s\S]*?min-height:\s*40px/);
  assert.match(styles, /\.quota-link-tooltip\s*\{[\s\S]*?gap:\s*3px;[\s\S]*?max-width:\s*min\(280px,[\s\S]*?padding:\s*8px 10px;[\s\S]*?font-size:\s*13px;[\s\S]*?line-height:\s*1\.35/);
  assert.match(styles, /\.quota-link-tooltip b\s*\{[\s\S]*?font-size:\s*14px/);
});

test("календарь и шкала квоты образуют две колонки", () => {
  assert.match(app, /className="quota-page-calendar-column"[\s\S]*?<QuotaAudienceTabs[\s\S]*?<QuotaMonthPicker/);
  assert.match(styles, /\.quota-panel\.quota-page-calc\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.08fr\) minmax\(280px, \.92fr\)/);
  assert.match(styles, /\.quota-page-calc \.quota-panel-figure > b\s*\{[\s\S]*?font-size:\s*23px/);
  assert.match(styles, /\.quota-page-calc \.quota-page-period-result \.quota-panel-figure > b\s*\{[\s\S]*?color:\s*var\(--ink\);[\s\S]*?font-size:\s*50px/);
  assert.match(app, /<AnimatedQuotaValue hasData=\{hasData\} maxDigits=\{String\(quota\.total\)\.length\} value=\{period\?\.left\} \/>/);
  assert.match(styles, /\.quota-page-calc \.quota-panel-bar\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*16px;[\s\S]*?margin-left:\s*0;/);
});

test("при переключении месяца число прокручивается, а шкала меняется плавно", () => {
  assert.match(app, /const QUOTA_DIGITS = Array\.from\(\{ length: 10 \}[\s\S]*?function AnimatedQuotaValue/);
  assert.match(app, /paddedDigits\.map[\s\S]*?quota-page-value-reel[\s\S]*?quota-page-value-track[\s\S]*?QUOTA_DIGITS\.map/);
  assert.match(styles, /\.quota-panel-bar > b\s*\{[\s\S]*?transition:\s*width 560ms cubic-bezier\(\.22, 1, \.36, 1\)/);
  assert.match(styles, /\.quota-page-value-digits\s*\{[\s\S]*?mask-image:\s*linear-gradient\(180deg, transparent 0, #000 20%, #000 80%, transparent 100%\)/);
  assert.match(styles, /\.quota-page-value-reel\s*\{[\s\S]*?width:\s*\.6em/);
  assert.match(styles, /\.quota-page-value-track > span\s*\{[\s\S]*?width:\s*\.6em/);
  assert.match(styles, /\.quota-page-value-track\s*\{[\s\S]*?translateY\(calc\(var\(--quota-digit\) \* -1em\)\)[\s\S]*?transition:\s*transform 1\.8s cubic-bezier\(\.12, \.8, \.2, 1\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.quota-page-value-track/);
});

test("нет данных занимает тот же фрейм, что и числовое значение", () => {
  assert.match(app, /className="quota-page-value-empty">Нет данных<\/span>/);
  assert.match(styles, /\.quota-page-animated-value\s*\{[\s\S]*?height:\s*1em/);
  assert.match(styles, /\.quota-page-calc \.quota-page-period-result \.quota-panel-figure\.unavailable > b\s*\{[\s\S]*?font-size:\s*50px;[\s\S]*?line-height:\s*1/);
  assert.match(styles, /\.quota-page-value-empty\s*\{[\s\S]*?align-items:\s*flex-end;[\s\S]*?height:\s*100%;[\s\S]*?font-size:\s*28px/);
});

test("каждый месяц меняет шкалу, а по умолчанию выбран текущий", () => {
  assert.match(app, /currentQuotaPeriodKey = \(periods, now = new Date\(\)\)/);
  assert.match(app, /useState\(\(\) => currentQuotaPeriodKey\(quota\.periods\)\)/);
  assert.match(app, /aria-pressed=\{selected\}[\s\S]*?onClick=\{\(\) => onSelect\(period\.key\)\}/);
  assert.match(styles, /\.quota-page-months button:hover\s*\{/);
  assert.match(styles, /\.quota-page-months button\.active\s*\{/);
});

test("у страницы короткие заголовок и описание без дублирующей даты", () => {
  const page = findToolPage("/ev-quota");
  assert.equal(page.h1, "Квота на электромобили в Беларуси 2026-2027");
  assert.equal(page.lead, "Официальный остаток для физлиц и юрлиц.");
  assert.match(app, /updatedLabel && !isFormPage && !isQuotaPage/);
});

test("у заголовка квоты есть фирменная иконка в общем блоке страниц расчётов", () => {
  assert.match(app, /quota: \{ src: "\/services\/ev-quota-zero-percent-gold\.png", width: 512, height: 512, fit: "quota", raw: true \}/);
  assert.equal(quotaIcon.readUInt32BE(16), 512);
  assert.equal(quotaIcon.readUInt32BE(20), 512);
  assert.match(styles, /\.tool-page-hero-icon\.tool-page-hero-icon-quota\s*\{[\s\S]*?width:\s*124px;[\s\S]*?height:\s*124px;/);
  assert.match(styles, /\.tool-page-hero-icon\.tool-page-hero-icon-quota img\s*\{[\s\S]*?top:\s*50%;[\s\S]*?left:\s*50%;[\s\S]*?width:\s*85%;[\s\S]*?height:\s*85%;[\s\S]*?transform:\s*translate\(-50%, -50%\);[\s\S]*?object-fit:\s*contain;[\s\S]*?object-position:\s*center;/);
});

test("всё содержимое под расчётом собрано в один список аккордеонов", () => {
  assert.doesNotMatch(app, /<QuotaFigures \/>/);
  assert.match(app, /isQuotaPage \? \([\s\S]*?<ToolDisclosures title="О квоте и расчёте"/);
  assert.match(app, /const quotaDetails = !isQuotaPage \? \[\] : \[/);
  assert.doesNotMatch(app, /История официальных сводок|<QuotaHistory/);
});

test("SEO-текст квоты оставляет только основные ответы без повторного вступления", () => {
  const texts = TOOL_PAGE_TEXTS["/ev-quota"];
  assert.deepEqual(texts.intro, []);
  assert.deepEqual(texts.sections.map((section) => section.title), [
    "Что известно о квоте в 2027 году",
    "Как работает квота на электромобили",
    "Как квота влияет на цену электромобиля",
  ]);
  assert.equal(texts.faq.length, 4);
  assert.equal(texts.disclaimer, "");
  assert.match(texts.sections[0].paragraphs.join(" "), /неподтверждённым отраслевым оценкам/);
  assert.match(texts.sections[0].paragraphs.join(" "), /мнение участников рынка, а не решение ЕЭК/);
  assert.doesNotMatch(texts.sections[0].paragraphs.join(" "), /privat-auto\.by/);
});

test("шкала растёт от нуля, а проценты стоят отдельной колонкой", () => {
  assert.match(app, /const remainingShare = hasData && quota\.total \? period\.left \/ quota\.total : 0/);
  assert.match(app, /className="quota-page-month-share"[\s\S]*?Math\.round[\s\S]*?<strong>\{period\.left == null \? "Нет данных" : number\(period\.left\)\}<\/strong>/);
  assert.match(styles, /\.quota-panel-bar > b::after/);
  assert.match(styles, /\.quota-panel-bar > b\s*\{[\s\S]*?border-radius:\s*999px 0 0 999px;[\s\S]*?linear-gradient/);
  assert.match(styles, /\.quota-panel-bar\s*\{[\s\S]*?background:\s*color-mix\(in srgb, var\(--accent-dark\) 50%, transparent\)/);
  assert.match(styles, /:root\[data-theme="dark"\] \.quota-panel-bar\s*\{[\s\S]*?var\(--accent-dark\) 38%[\s\S]*?var\(--accent-dark\) 20%/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\) 58px minmax\(104px, auto\)/);
  assert.match(app, /Квота исчерпана[\s\S]*?Льготное оформление по ставке 0% больше недоступно[\s\S]*?историческое значение из официальной сводки/);
});
