import { estimateLandedCost } from "./pricing.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// Курс, по которому цена источника хранится в юанях. Тот же, что в импорте и в
// актуализации: цену в долларах источник отдаёт сам, юани — производная от неё.
const USD_TO_CNY = 7.15;
// Сколько дней стрелка держится на карточке. Дальше изменение уже не новость.
export const PRICE_CHANGE_DAYS = 30;
// Мелкие колебания курса дня источника — не переоценка (см. refresh-che168.mjs).
const MIN_STEP_USD = 100;

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export function formatChangeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

// Цена «под ключ» до переоценки: тот же расчёт, что и для текущей цены, только с
// прошлой ценой машины в Китае. Поэтому переключатели валюты и квоты работают и
// для старой цены — она пересчитывается, а не берётся замороженным числом.
export function getPriceChange(car, now = Date.now()) {
  const previousUsd = Number(car?.previousPriceUsd) || 0;
  const currentUsd = Number(car?.usdPrice) || 0;
  const changedAt = car?.priceChangedAt ? new Date(car.priceChangedAt).getTime() : NaN;
  if (!previousUsd || !currentUsd || Number.isNaN(changedAt)) return null;
  if (now - changedAt > PRICE_CHANGE_DAYS * DAY_MS) return null;
  if (Math.abs(currentUsd - previousUsd) < MIN_STEP_USD) return null;
  const previous = estimateLandedCost({ ...car, usdPrice: previousUsd, chinaPrice: Math.round((previousUsd * USD_TO_CNY) / 100) * 100 });
  if (!Number.isFinite(previous?.totalUsd)) return null;
  return {
    direction: currentUsd > previousUsd ? "up" : "down",
    previousTotalUsd: previous.totalUsd,
    changedAt,
  };
}
