import { listingNumber } from "../src/listing-id.js";
import { getSiteProfile } from "../config/sites/index.mjs";

const kindTitles = {
  availability:"Запрос актуальности",
  custom_search:"Индивидуальный подбор",
  listing_draft:"Заявка с карточки",
};
const sourceTitles = { site:"форма на сайте", account:"личный кабинет" };
const methodTitles = { phone:"Телефон", viber:"Viber", telegram:"Telegram" };
const filterTitles = {
  type:"Тип", brand:"Марка", model:"Модель", bodyType:"Кузов", color:"Цвет",
  yearMin:"Год от", yearMax:"Год до", mileage:"Пробег", priceMin:"Цена от", priceMax:"Цена до",
  drive:"Привод", owners:"Владельцы", battery:"Батарея", condition:"Состояние",
  accel:"Разгон", tire:"Шины", torque:"Момент", sort:"Сортировка",
};

const number = (value) => new Intl.NumberFormat("ru-RU").format(Math.round(Number(value)));
const phoneText = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `+${digits}` : String(value || "").trim();
};

// Строки заявки собираются отдельно от отправки: так формат можно проверить тестом,
// не трогая ни базу, ни телеграм.
export function formatLeadMessage(lead, { site = getSiteProfile("abcars"), siteUrl = site.origin } = {}) {
  siteUrl = String(siteUrl).replace(/\/+$/, "");
  const lines = [`🔔 Новая заявка: ${kindTitles[lead.kind] || "заявка"}`];
  if (site.id !== "abcars") {
    lines.push(`Сайт: ${site.company.brand} (${site.origin})`);
    lines.push(`Доставка: ${lead.destinationName || site.destination.name}`);
    lines.push("Передача партнёру: вручную владельцем");
  }
  if (lead.orderNumber) lines.push(`Заказ ${lead.orderNumber}`);
  lines.push("");
  lines.push(`Клиент: ${String(lead.name || "").trim() || "имя не указано"}`);
  lines.push(`Телефон: ${phoneText(lead.contact)}`);
  const methods = (Array.isArray(lead.methods) ? lead.methods : []).map((item) => methodTitles[item] || item);
  if (methods.length) lines.push(`Связь: ${methods.join(", ")}`);
  if (lead.telegram) lines.push(`Telegram: @${String(lead.telegram).replace(/^@+/, "")}`);
  if (lead.email) lines.push(`Почта: ${lead.email}`);
  if (lead.car) {
    const facts = [
      lead.car.mileage ? `${number(lead.car.mileage)} км` : "",
      lead.car.price && (site.market === "BY" || lead.car.priceCurrency === "RUB")
        ? (lead.car.priceCurrency === "RUB" ? `${number(lead.car.price)} ₽` : `$${number(lead.car.price)}`) : "",
    ].filter(Boolean).join(" · ");
    lines.push("");
    lines.push(`Машина: ${lead.car.title}${facts ? ` (${facts})` : ""}`);
    lines.push(`${siteUrl}/cars/${listingNumber(lead.car.id)}`);
    // Ссылка на объявление у источника. Имя площадки не пишем: с Кореей источников
    // несколько, а менеджеру важен сам адрес.
    if (lead.car.sourceUrl) lines.push(`Объявление: ${lead.car.sourceUrl}`);
  } else if (lead.listingId) {
    // Объявление успели снять с продажи — заявка всё равно должна назвать машину.
    lines.push("");
    lines.push(`Машина: ${listingNumber(lead.listingId)} (объявления уже нет в каталоге)`);
  }
  const comment = String(lead.comment || "").trim();
  if (comment) {
    lines.push("");
    lines.push(`Что ищет: ${comment}`);
  }
  const filters = lead.filters && typeof lead.filters === "object" ? Object.entries(lead.filters) : [];
  const chosen = filters
    .filter(([, value]) => (Array.isArray(value) ? value.length : value && value !== "any" && value !== "all"))
    .map(([key, value]) => `${filterTitles[key] || key}: ${Array.isArray(value) ? value.join(", ") : value}`);
  if (chosen.length) lines.push(`Фильтры: ${chosen.join("; ")}`);
  lines.push("");
  lines.push(`Источник: ${sourceTitles[lead.source] || lead.source || "сайт"}`);
  lines.push(`Все заявки: ${siteUrl}/analytics`);
  return lines.join("\n");
}

