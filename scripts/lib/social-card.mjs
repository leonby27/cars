// Текст записи о машине для Threads и Instagram и подбор кадров к ней.
//
// Шаблон утверждён Сергеем 17.09.2026 и выглядит так:
//
//   ⚡ Zeekr 001, 2026 · 35 100$ (106 100 BYN) под ключ
//   🛣 Пробег 9 500 км
//   🔋 Батарея 95 кВт·ч · запас хода 710 км
//   📦 В цену входит доставка, растаможка и все сборы
//   🔎 В каталоге под номером 59876786 — ссылка в шапке профиля
//
// Третья строка зависит от того, чем машина едет, и пропадает совсем, если в
// каталоге нет ни батареи, ни мотора: пустых «данных нет» в ленте быть не должно.
// Последняя строка разная у сетей: в Threads ссылка кликается, в Instagram — нет,
// поэтому там вместо адреса номер машины и отсылка к шапке профиля. В Telegram
// ссылка прячется под словами, а если под записью есть кнопка — строки нет совсем,
// кнопка ведёт туда же.
import { carTitle } from "../../src/car-title.js";
import { socialPhotoHref } from "../../src/photo-source.js";

const formatNumber = (value) => new Intl.NumberFormat("ru-RU").format(Math.round(Number(value) || 0));

// Дробное число без лишнего нуля: 36.8 → «36,8», 95 → «95».
const formatDecimal = (value) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(Number(value) || 0);

const typeIcon = (car) => (car?.type === "Электромобиль" ? "⚡" : car?.type === "Гибрид" ? "🔌" : "🚗");

// «1.4T 150HP L4» → «1.4 турбо», «2.0L 171HP L4» → «2.0 л». Буква после объёма —
// единственный признак наддува, который источник даёт на всех бензиновых машинах.
const engineVolume = (engine) => {
  const match = String(engine || "").match(/(\d\.\d)\s*([TL])\b/i);
  if (!match) return "";
  return `${match[1]} ${match[2].toUpperCase() === "T" ? "турбо" : "л"}`;
};

// «SUV / кроссовер» → «кроссовер», «Хэтчбек» → «хэтчбек».
const bodyLabel = (bodyType) => String(bodyType || "").split("/").pop().trim().toLocaleLowerCase("ru-RU");

function specLine(car) {
  const battery = Number(car?.battery) > 0 ? `Батарея ${formatDecimal(car.battery)} кВт·ч` : "";
  const range = Number(car?.range) > 0 ? formatNumber(car.range) : "";
  if (car?.type === "Электромобиль") {
    if (!battery) return "";
    return `🔋 ${battery}${range ? ` · запас хода ${range} км` : ""}`;
  }
  if (car?.type === "Гибрид") {
    if (!battery) return "";
    return `🔋 ${battery}${range ? ` · ${range} км на электротяге, дальше бензин` : " · дальше бензин"}`;
  }
  const parts = [engineVolume(car?.engine), Number(car?.horsepower) > 0 ? `${formatNumber(car.horsepower)} л.с.` : "", bodyLabel(car?.bodyType)];
  const filled = parts.filter(Boolean);
  return filled.length ? `⚙️ ${filled.join(" · ")}` : "";
}

// Метка марки для Instagram: «Li Auto» → «liauto», «Zeekr» → «zeekr».
const brandTag = (brand) => String(brand || "").toLocaleLowerCase("en-US").replace(/[^a-zа-я0-9]/gi, "");

function hashtags(car) {
  const kind = car?.type === "Электромобиль" ? "электромобиль" : car?.type === "Гибрид" ? "гибрид" : "автоизкитая";
  const tags = ["абкарс", "автоизкитая", kind, brandTag(car?.brand), "авторынокбеларуси"];
  return [...new Set(tags.filter(Boolean))].map((tag) => `#${tag}`).join(" ");
}

// Номер машины у источника: по нему её находят и в каталоге, и в адресе карточки.
export const carNumber = (car) => String(car?.externalId || String(car?.id || "").replace(/^che168-/, "") || "").trim();

const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const CATALOG_FOOTER = "Каталог авто с пробегом из Китая — abcars.by";

// В Threads и Telegram запись без адреса сайта должна всё равно вести человека
// к каталогу. Если ссылка или адрес уже есть, второй раз подпись не добавляем.
export function withCatalogFooter(text, network) {
  const value = String(text || "").trimEnd();
  if (!["threads", "telegram"].includes(network) || /(?:https?:\/\/)?(?:www\.)?abcars\.by\b/i.test(value)) return value;
  return `${value}\n\n${CATALOG_FOOTER}`;
}

export function carPageUrl(car, site = "abcars.by") {
  return `https://${site}/cars/${carNumber(car)}`;
}

export function buildPostText(car, { totalUsd, totalByn, network = "instagram", site = "abcars.by", withLink = true } = {}) {
  const title = carTitle(car?.brand, car?.model, null);
  const price = Number(totalUsd) > 0
    ? ` · ${formatNumber(totalUsd)}$${Number(totalByn) > 0 ? ` (${formatNumber(totalByn)} BYN)` : ""} под ключ`
    : "";
  const lines = [
    `${typeIcon(car)} ${title}, ${car?.year}${price}`,
    Number(car?.mileage) > 0 ? `🛣 Пробег ${formatNumber(car.mileage)} км` : "",
    specLine(car),
    "📦 В цену входит доставка, растаможка и все сборы",
    network === "threads" ? `🔎 №${carNumber(car)} · ${site}/cars/${carNumber(car)}`
      : network === "telegram" ? (withLink ? `🔎 №${carNumber(car)} · <a href="${carPageUrl(car, site)}">Смотреть в каталоге</a>` : `🔎 №${carNumber(car)}`)
      : `🔎 В каталоге под номером ${carNumber(car)} — ссылка в шапке профиля`,
  ].filter(Boolean);
  // В Telegram запись уходит размеченной, поэтому угловые скобки и амперсанды из
  // названия машины экранируются — иначе они оборвали бы разметку.
  const text = network === "telegram"
    ? lines.map((line, index) => (index === lines.length - 1 && withLink ? line : escapeHtml(line))).join("\n")
    : lines.join("\n");
  // Метки собирают показы там, где подписчиков ещё нет. В Threads они не работают
  // так же и выглядят навязчиво, поэтому остаются только у Instagram.
  return network === "instagram" ? `${text}\n\n${hashtags(car)}` : text;
}

// Кадры к записи. Источник отдаёт снимки разного качества и пропорций; сети берут
// только JPEG, поэтому адреса собираются отдельной функцией. Берём с запасом:
// часть кадров Instagram отклонит из-за пропорций, и публикация отбросит их сама.
export function pickPhotos(car, { limit = 10 } = {}) {
  const sources = [car?.image, ...(Array.isArray(car?.images) ? car.images : [])].filter(Boolean);
  const hrefs = sources.map((source) => socialPhotoHref(source)).filter(Boolean);
  return [...new Set(hrefs)].slice(0, limit);
}
