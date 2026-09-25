// Подтверждение номера телефона в заявке с карточки — через телеграм-бота.
//
// Зачем: заявка без входа принимает любой номер, а партнёрам (и нам) нужен
// проверенный — у IM4CAR это код по SMS или Telegram. SMS требует договора с
// рассыльщиком и денег за каждое сообщение; телеграм проверяет номер сам: человек
// нажимает в боте «Поделиться номером», и телеграм отдаёт нам номер, привязанный к
// его аккаунту, — подделать его нельзя.
//
// Как устроено:
//  1. Сайт сохраняет заявку (как и раньше — сразу, без ожидания) и выдаёт ссылку на
//     бота с одноразовым ключом: https://t.me/<бот>?start=v_<ключ>.
//  2. Человек открывает бота; тот по ключу находит заявку, запоминает чат и просит
//     поделиться номером (кнопка request_contact).
//  3. Присланный контакт сверяется с номером из заявки; совпал — заявка помечена
//     «номер подтверждён», Сергею уходит сообщение, сайт видит отметку опросом.
//
// Ключ живёт двое суток; заявка без подтверждения остаётся обычной заявкой — как до
// этой доработки.
import { randomBytes } from "node:crypto";
import https from "node:https";
import { pool } from "./db.mjs";

const TOKEN_TTL_HOURS = 48;

/** Только цифры номера: так сравниваются «+375 29 …», «375291234567» и контакт телеграма. */
export const phoneDigits = (value) => String(value || "").replace(/\D/g, "");

/** Номера совпадают, когда совпадают их цифры (телеграм отдаёт номер без «+»). */
export const phonesMatch = (left, right) => {
  const a = phoneDigits(left);
  const b = phoneDigits(right);
  return Boolean(a) && a === b;
};

/** Ключ для ссылки на бота: 16 байт случайности в url-безопасной записи. */
export const newVerifyToken = () => randomBytes(16).toString("base64url");

/** Параметр `start` из ссылки на бота → ключ, или null, если это не наша ссылка. */
export const tokenFromStart = (text) => {
  const match = String(text || "").trim().match(/^\/start(?:@\w+)?\s+v_([A-Za-z0-9_-]{16,64})$/);
  return match ? match[1] : null;
};

/** Ссылка на бота с ключом — её открывает кнопка на сайте. */
export const verifyDeepLink = (botUsername, token) =>
  botUsername && token ? `https://t.me/${String(botUsername).replace(/^@/, "")}?start=v_${token}` : null;

// Имя бота берём из окружения, а если его нет — один раз спрашиваем у телеграма
// (getMe). Ответ запоминаем; при неудаче через минуту спросим снова, а до тех пор
// сайт кнопку подтверждения не показывает — заявка от этого не страдает.
let botUsernameCache = { value: null, checkedAt: 0 };
function getMe(token) {
  return new Promise((resolve) => {
    const request = https.request(
      { host: "api.telegram.org", path: `/bot${token}/getMe`, method: "GET", family: 6, timeout: 8_000 },
      (response) => {
        let body = "";
        response.on("data", (chunk) => { if (body.length < 4000) body += chunk; });
        response.on("end", () => {
          try { resolve(JSON.parse(body)?.result?.username || null); } catch { resolve(null); }
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("таймаут")));
    request.on("error", () => resolve(null));
    request.end();
  });
}
export async function botUsername() {
  if (process.env.TELEGRAM_BOT_USERNAME) return String(process.env.TELEGRAM_BOT_USERNAME).replace(/^@/, "");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (botUsernameCache.value) return botUsernameCache.value;
  if (Date.now() - botUsernameCache.checkedAt < 60_000) return null;
  botUsernameCache.checkedAt = Date.now();
  const name = await getMe(token);
  if (name) botUsernameCache.value = name;
  return name;
}

/**
 * Выдать заявке ключ подтверждения и собрать ссылку на бота. `null`, когда бот не
 * настроен, — тогда сайт показывает прежний экран «заявка принята».
 */
export async function issueVerification(draftId) {
  const name = await botUsername();
  if (!name) return null;
  const token = newVerifyToken();
  await pool.query("UPDATE order_drafts SET verify_token=$2, updated_at=now() WHERE id=$1", [draftId, token]);
  return { token, url: verifyDeepLink(name, token) };
}

/** Что сайт спрашивает опросом: подтверждён ли номер по этому ключу. */
export async function verificationStatus(token) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(token || ""))) return { verified: false, known: false };
  const result = await pool.query("SELECT phone_verified_at, phone_verified_via FROM order_drafts WHERE verify_token=$1", [token]);
  const row = result.rows[0];
  if (!row) return { verified: false, known: false };
  return { verified: Boolean(row.phone_verified_at), known: true, via: row.phone_verified_via || null };
}

// ── Сторона бота ──────────────────────────────────────────────────────────────

const draftSelect = `SELECT d.id, d.contact, d.customer_name, d.listing_id, d.phone_verified_at, l.title
  FROM order_drafts d LEFT JOIN listings l ON l.id = d.listing_id`;

/**
 * Человек пришёл в бота по ссылке с ключом: находим заявку, запоминаем его чат.
 * Возвращает заявку или `null` (ключ неизвестен, просрочен или номер уже подтверждён).
 */
export async function startVerification(token, chatId) {
  if (!token || !chatId) return null;
  const result = await pool.query(
    `${draftSelect} WHERE d.verify_token=$1 AND d.phone_verified_at IS NULL AND d.created_at > now() - ($3 || ' hours')::interval
     LIMIT 1`,
    [token, String(chatId), String(TOKEN_TTL_HOURS)],
  ).then(async (found) => {
    if (!found.rows[0]) return found;
    await pool.query("UPDATE order_drafts SET verify_chat_id=$2, updated_at=now() WHERE id=$1", [found.rows[0].id, String(chatId)]);
    return found;
  });
  return result.rows[0] || null;
}

/**
 * Пришёл контакт из чата, который раньше открыл ссылку. Сверяем: контакт принадлежит
 * тому, кто его прислал (иначе можно переслать чужой), и номер совпадает с заявкой.
 * Ответ: `{ ok: true, draft }` или `{ ok: false, reason, draft? }`.
 */
export async function confirmContact({ chatId, phone, contactUserId, fromId }) {
  if (!chatId) return { ok: false, reason: "no_chat" };
  const result = await pool.query(
    `${draftSelect} WHERE d.verify_chat_id=$1 AND d.phone_verified_at IS NULL ORDER BY d.created_at DESC LIMIT 1`,
    [String(chatId)],
  );
  const draft = result.rows[0];
  if (!draft) return { ok: false, reason: "no_pending" };
  if (contactUserId && fromId && String(contactUserId) !== String(fromId)) return { ok: false, reason: "foreign_contact", draft };
  if (!phonesMatch(phone, draft.contact)) return { ok: false, reason: "phone_mismatch", draft };
  await pool.query(
    "UPDATE order_drafts SET phone_verified_at=now(), phone_verified_via='telegram', updated_at=now() WHERE id=$1 AND phone_verified_at IS NULL",
    [draft.id],
  );
  return { ok: true, draft };
}

/** Сообщение Сергею о подтверждённом номере — тем же ботом, что шлёт заявки. */
export function phoneVerifiedMessage(draft, { siteUrl = "https://abcars.by" } = {}) {
  const digits = phoneDigits(draft.contact);
  const lines = [
    "✅ Номер подтверждён через Telegram",
    "",
    `Клиент: ${String(draft.customer_name || draft.name || "").trim() || "имя не указано"}`,
    `Телефон: ${digits ? `+${digits}` : String(draft.contact || "").trim()}`,
  ];
  if (draft.title) lines.push(`Машина: ${draft.title}`);
  if (draft.listing_id) lines.push(`${siteUrl}/cars/${String(draft.listing_id).replace(/^(che168|guazi|ch|gz)[-_]/i, "")}`);
  lines.push(`${siteUrl}/analytics`);
  return lines.join("\n");
}
