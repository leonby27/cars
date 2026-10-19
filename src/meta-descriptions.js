import { fromPhrase, originForSource, siteFromPhrase } from "./origin.js";

const number = (value) => new Intl.NumberFormat("ru-RU").format(Math.round(Number(value)));
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

export function homeDescription({ total, brandCount } = {}) {
  const stock = positive(total) ? `Каталог из ${number(total)} авто` : "Каталог авто";
  const threshold = Math.floor((Number(brandCount) - 1) / 10) * 10;
  const brands = threshold >= 10 ? ` ✓ Более ${number(threshold)} марок.` : "";
  return `${stock} ${siteFromPhrase()}. ⚡️ С доставкой в Беларусь под ключ. ✓ С расчётом стоимости до Минска.${brands}`;
}

export function catalogDescription({ subject = "Каталог авто", origin, total, priceFrom, brand = false, model = false } = {}) {
  const from = origin ? fromPhrase(origin) : siteFromPhrase();
  const heading = `${subject} ${from}.`;
  const stock = positive(total)
    ? `⚡️ В наличии ${number(total)} авто ${brand || model ? "с пробегом" : "б/у"}`
    : total === 0 ? "Сейчас нет авто в наличии" : "Авто с пробегом";
  if (brand || model) return `${heading} ${stock}. ➔ С доставкой и подробным расчетом до Минска под ключ${brand ? ". ✓ Удобный каталог" : ""}`;
  const price = positive(priceFrom) ? `, с ценами от ${number(priceFrom)}$` : "";
  return `${heading} ${stock}${price}. ✓ С подробным расчётом доставки до Минска под ключ.`;
}

export function vehicleDescription(car, totalUsd) {
  const title = [car.brand, car.model, car.year].filter(Boolean).join(" ") || car.title;
  if (car.available === false) return `${title} продан. Объявление временно сохранено для избранного и прямых ссылок; актуальные похожие автомобили есть в каталоге abcars.by.`;
  const origin = car.origin || originForSource(car.source);
  const facts = [
    car.mileage != null && Number.isFinite(Number(car.mileage)) ? `Пробег ${number(car.mileage)} км` : null,
    car.type ? String(car.type).toLowerCase() : null,
    positive(totalUsd) ? `цена до Минска под ключ — ${number(totalUsd)} $` : null,
  ].filter(Boolean).join(", ");
  return `${title} ${fromPhrase(origin)}. ⚡️ В наличии!${facts ? ` ${facts}.` : ""}`;
}
