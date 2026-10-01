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
import { catalogPool, sitePool } from "./db.mjs";
import { SITE } from "../src/site-profile.js";
import { formatLeadMessage } from "./lead-message.mjs";
import { leadDeliveryConfig } from "./lead-delivery.mjs";
import { sendTelegram } from "../scripts/lib/telegram.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteUrl = String(process.env.SITE_URL || SITE.origin).replace(/\/+$/, "");

export const leadMessage = (lead) => formatLeadMessage(lead, { site: SITE, siteUrl });

// Свои собственные проверки в телеграм не шлём — тем же правилом, по которому они не
// попадают в цифры аналитики: телефон совпадает со служебным аккаунтом.
async function isStaffContact(contact) {
  const digits = String(contact || "").replace(/\D/g, "");
  if (!digits) return false;
  const result = await sitePool.query(
    "SELECT 1 FROM customer_accounts WHERE staff AND regexp_replace(phone, '\\D', '', 'g') = $1 LIMIT 1",
    [digits],
  );
  return result.rowCount > 0;
}

async function carFacts(listingId) {
  if (!listingId) return null;
  const result = await catalogPool.query(
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
  return sendTelegram(leadMessage({ ...lead, car }), { ...leadDeliveryConfig(SITE, process.env, ROOT), log:(message) => console.log(`[lead] ${message}`) });
}

// Не ждём и не бросаем: заявка уже сохранена, а сломанный телеграм не повод отвечать
// посетителю ошибкой.
export function notifyLead(lead) {
  queue = queue
    .then(() => send(lead))
    .catch((error) => console.error(`[lead] не смог отправить уведомление: ${String(error?.message || error).slice(0, 200)}`));
  return queue;
}
