// Сообщение в телеграм о новой заявке. До 18.09.2026 заявка молча ложилась в базу и
// видна была только в разделе «Заявки» аналитики: если туда в этот день не зайти,
// человек ждал ответа впустую. Теперь о каждой заявке приходит сообщение тем же ботом,
// что присылает утреннюю сводку об импорте.
//
// Отправка идёт в стороне от ответа сайту: посетитель не должен ждать телеграм, а с
// этого сервера доставка нередко занимает десятки секунд (связь только по IPv6,
// маршрут моргает — см. scripts/lib/telegram.mjs). Заявка к этому мгновению уже
// сохранена, поэтому неудачная отправка ничего не теряет: непрошедшее сообщение
// библиотека складывает в очередь и дошлёт со следующим.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.mjs";
import { listingNumber } from "./seo-render.mjs";
import { sendTelegram } from "../scripts/lib/telegram.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteUrl = String(process.env.SITE_URL || "https://abcars.by").replace(/\/+$/, "");

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
export function leadMessage(lead) {
  const lines = [`🔔 Новая заявка: ${kindTitles[lead.kind] || "заявка"}`];
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
      lead.car.price ? `$${number(lead.car.price)}` : "",
    ].filter(Boolean).join(" · ");
    lines.push("");
    lines.push(`Машина: ${lead.car.title}${facts ? ` (${facts})` : ""}`);
    lines.push(`${siteUrl}/cars/${listingNumber(lead.car.id)}`);
    if (lead.car.sourceUrl) lines.push(`Che168: ${lead.car.sourceUrl}`);
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

// Свои собственные проверки в телеграм не шлём — тем же правилом, по которому они не
// попадают в цифры аналитики: телефон совпадает со служебным аккаунтом.
async function isStaffContact(contact) {
  const digits = String(contact || "").replace(/\D/g, "");
  if (!digits) return false;
  const result = await pool.query(
    "SELECT 1 FROM customer_accounts WHERE staff AND regexp_replace(phone, '\\D', '', 'g') = $1 LIMIT 1",
    [digits],
  );
  return result.rowCount > 0;
}

async function carFacts(listingId) {
  if (!listingId) return null;
  const result = await pool.query(
    `SELECT l.id, l.title, l.mileage_km, l.estimated_total_usd, l.source_url
      FROM listings l WHERE l.id = $1`,
    [listingId],
  );
  const row = result.rows[0];
  const sourceUrl = /^https?:\/\//.test(String(row?.source_url || "")) ? String(row.source_url).replace(/\.md$/, ".html") : "";
  return row ? { id:row.id, title:row.title, mileage:Number(row.mileage_km) || 0, price:Number(row.estimated_total_usd) || 0, sourceUrl } : null;
}

// Сообщения уходят по очереди: библиотека отправки держит недоставленное в файле, и
// две заявки в одну секунду затёрли бы очередь друг друга.
let queue = Promise.resolve();

async function send(lead) {
  if (lead.staff === true || await isStaffContact(lead.contact)) return false;
  const car = lead.listingId ? await carFacts(lead.listingId) : null;
  return sendTelegram(leadMessage({ ...lead, car }), { root:ROOT, log:(message) => console.log(`[lead] ${message}`) });
}

// Не ждём и не бросаем: заявка уже сохранена, а сломанный телеграм не повод отвечать
// посетителю ошибкой.
export function notifyLead(lead) {
  queue = queue
    .then(() => send(lead))
    .catch((error) => console.error(`[lead] не смог отправить уведомление: ${String(error?.message || error).slice(0, 200)}`));
  return queue;
}
