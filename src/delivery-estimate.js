import { chinaTransitFor } from "./china-logistics.js";
import { PRICING } from "./pricing.js";

const round50 = (value) => Math.round(value / 50) * 50;
const midpoint = ([low, high]) => (low + high) / 2;

const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

/** Типичные габариты модели по живым объявлениям, без доверия одному выбросу. */
export function deliveryModelSize(cars = []) {
  const lengths = cars.map((car) => Number(String(car?.dimensions || "").match(/^\s*(\d{4})/)?.[1]) || 0);
  const weights = cars.map((car) => Number(car?.curbWeight) || 0);
  return { lengthMm: median(lengths), curbWeight: median(weights) };
}

// На первом кадре до ответа каталога оставляем небольшой страховочный список явно
// крупных машин. Основное решение принимает размер из живых объявлений модели:
// название само по себе не умеет отличить компактный Zeekr X от пятиметрового 8X.
const LARGE_MODEL = /(?:\bL9\b|\bM9\b|\b009\b|\b8X\b|\bD9\b|\bX9\b|\bE9\b|\bV9\b|\bV-Class\b|\bGL8\b|\bMega\b|\bDreamer\b|\bHongqi E-HS9\b|\bTank 700\b|\bYangwang U8\b)/i;

export function isLargeDeliveryModel(model, { lengthMm = 0, curbWeight = 0 } = {}) {
  return Number(lengthMm) >= 4950 || Number(curbWeight) >= 2300 || LARGE_MODEL.test(String(model || ""));
}

/** Название действующей тарифной группы для понятной подписи под моделью. */
export function deliveryBodyClass(model, size = {}) {
  return isLargeDeliveryModel(model, size) ? "Крупный кузов" : "Средний кузов";
}

/** Подсказывает, какого выбора ещё не хватает для более точного расчёта. */
export function deliveryPrecisionPrompt({ modelSelected = false, locationSelected = false } = {}) {
  if (!modelSelected && !locationSelected) {
    return "Для более точного расчёта выберите модель и местоположение машины.";
  }
  if (!modelSelected) return "Для более точного расчёта выберите модель машины.";
  if (!locationSelected) return "Для более точного расчёта выберите местоположение машины.";
  return "";
}

/** Ориентир именно CIP до Минска: перевозка и страхование, без таможни и СВХ. */
export function estimateDeliveryCip({ model = "", city = "", lengthMm = 0, curbWeight = 0 } = {}) {
  const transit = chinaTransitFor(city);
  const large = isLargeDeliveryModel(model, { lengthMm, curbWeight });
  const rows = [
    { label: "Документы и страхование", range: PRICING.exportDocsUsd },
    { label: "Автовоз по Китаю до Хоргоса", range: transit.usd },
    { label: "Хоргос — Минск", range: PRICING.intlDeliveryUsd },
  ];
  if (large) rows.push({ label: "Крупный кузов", range: PRICING.bigCarExtraUsd });

  const low = round50(rows.reduce((sum, row) => sum + row.range[0], 0));
  const high = round50(rows.reduce((sum, row) => sum + row.range[1], 0));
  const total = round50(rows.reduce((sum, row) => sum + midpoint(row.range), 0));

  return {
    total,
    low,
    high,
    rows: rows.map((row) => ({ ...row, amount: round50(midpoint(row.range)) })),
    transitLabel: transit.label,
    large,
  };
}
