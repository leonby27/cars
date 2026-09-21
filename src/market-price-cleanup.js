// Очистка цен белорусского рынка перед расчётом статистики.
//
// В выдаче площадки рядом с обычными машинами встречаются аварийные автомобили,
// машины на запчасти и объявления с ценой задатка вместо полной цены. Если брать
// их как нижнюю границу рынка, карточка начинает сравнивать целую машину из Китая
// с повреждённой машиной или задатком в Беларуси.

export const MARKET_LOW_PRICE_GAP_USD = 10_000;

/** Объявления, которые сами явно называют машину аварийной или продаваемой на запчасти. */
export const isDamagedMarketListing = (row) => {
  const condition = String(row?.condition || row?.properties?.condition || "").trim().toLowerCase();
  return condition === "аварийный" || condition === "на запчасти";
};

/**
 * Убирает изолированный дешёвый хвост из уже сопоставимой группы
 * «марка + модель + год + двигатель + пробег».
 *
 * Смотрим только нижнюю половину ряда: дорогая комплектация сверху не должна
 * считаться ошибкой. Если внутри дешёвой половины есть скачок минимум на $10 000,
 * всё ниже последнего такого скачка не участвует в min/mean/median и в количестве
 * машин. Например, [3 308, 26 300, 29 100, ...] начинается с 26 300.
 */
export function withoutLowPriceOutliers(values, gapUsd = MARKET_LOW_PRICE_GAP_USD) {
  const sorted = (values || [])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (sorted.length < 2) return sorted;

  const lowerBoundaries = Math.floor(sorted.length / 2);
  let start = 0;
  for (let index = 0; index < lowerBoundaries; index += 1) {
    if (sorted[index + 1] - sorted[index] >= gapUsd) start = index + 1;
  }
  return sorted.slice(start);
}
