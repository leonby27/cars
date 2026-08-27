// Утренняя проверка ночной работы — и сообщение в телеграм, если ночь не удалась.
//
// Заведена после 27.08.2026: актуализация упала в 4 утра, пополнение следом, и
// о пропавшей ночи стало известно только к обеду, потому что человек случайно
// спросил. Ошибка в ночном скрипте — полбеды; беда в том, что о ней никто не
// узнаёт, а каталог тем временем тихо стареет.
//
// Судит не по журналу служб, а по следам работы: отчёты в runtime/ и состояние
// базы. Так проверка ловит и случай, когда служба была убита целиком и в
// журнале осталась одна строка о таймауте.
//
// Usage:
//   npm run night-watch              # проверить и сообщить, если что-то не так
//   npm run night-watch -- --always  # сообщить в любом случае, даже если всё хорошо
//   npm run night-watch -- --dry-run # ничего не отправлять, только показать текст
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REFRESH_REPORT = path.join(ROOT, "runtime", "refresh-report.json");
const IMPORT_REPORT = path.join(ROOT, "runtime", "import-che168-report.json");
// Отчёт старше этого — значит ночь прошла мимо: скрипт не запускался или умер
// раньше, чем успел что-либо записать.
const FRESH_HOURS = 14;
// Ночь, в которую проверено меньше этого, считается неудачной, даже если скрипт
// отчитался: столько карточек набирается за первые же минуты здоровой работы.
const MIN_CHECKED = 500;

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const dryRun = args.get("dry-run") === "true";
const always = args.get("always") === "true";

const readReport = async (file) => {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return null; }
};
const hoursSince = (iso) => {
  const time = Date.parse(iso || "");
  return Number.isFinite(time) ? (Date.now() - time) / 3_600_000 : Infinity;
};
const plural = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};
const cars = (n) => `${n.toLocaleString("ru-RU")} ${plural(n, "машина", "машины", "машин")}`;

const refresh = await readReport(REFRESH_REPORT);
const importReport = await readReport(IMPORT_REPORT);

const { pool } = await import("../server/db.mjs");
let db = null;
try {
  const { rows } = await pool.query(`SELECT
      count(*) FILTER (WHERE status='active')::int AS active,
      count(*) FILTER (WHERE last_checked_at > now() - interval '20 hours')::int AS checked,
      count(*) FILTER (WHERE first_seen_at > now() - interval '20 hours')::int AS added,
      count(*) FILTER (WHERE status<>'active' AND last_checked_at > now() - interval '20 hours')::int AS gone
    FROM listings WHERE source='Che168'`);
  db = rows[0];
} catch (error) {
  db = { error: String(error.message).slice(0, 120) };
} finally {
  await pool.end().catch(() => {});
}

// ---- Разбор ночи ------------------------------------------------------------
const troubles = [];
const lines = [];

if (!refresh || hoursSince(refresh.finishedAt) > FRESH_HOURS) {
  troubles.push("Актуализация цен ночью не отработала: свежего отчёта нет.");
} else if (refresh.entryDenied) {
  troubles.push("Источник не пустил на сайт — проверка «не робот» не пройдена. Цены и наличие не обновились.");
} else {
  const checked = Number(refresh.detailChecked || 0) + Number(refresh.pricedByLists || 0);
  if (refresh.stoppedEarly) troubles.push("Актуализация свернулась досрочно: источник замолчал посреди работы.");
  if (checked < MIN_CHECKED) troubles.push(`Актуализация проверила подозрительно мало — ${cars(checked)}.`);
  lines.push(`Смена «${refresh.shift || "?"}»: проверено ${cars(checked)}, за ${refresh.minutes} мин.`);
  if (refresh.rePriced) lines.push(`Изменились цены: ${cars(Number(refresh.rePriced))} (подешевело ${refresh.priceDrops}).`);
  if (refresh.sold) lines.push(`Ушло с продажи: ${cars(Number(refresh.sold))}.`);
  if (refresh.noAnswer > checked / 4) troubles.push(`Источник часто молчал: ${refresh.noAnswer} запросов без ответа.`);
  if (refresh.sessionRotations) lines.push(`Смен сессии за ночь: ${refresh.sessionRotations}.`);
}

if (!importReport || hoursSince(importReport.finishedAt) > FRESH_HOURS) {
  troubles.push("Пополнение каталога ночью не отработало: свежего отчёта нет.");
} else {
  const imported = Number(importReport.imported || 0);
  lines.push(`Пополнение: добавлено ${cars(imported)} из ${importReport.detailReads || 0} прочитанных карточек.`);
}

if (db?.error) troubles.push(`База не ответила на проверку: ${db.error}`);
else if (db) lines.push(`В каталоге сейчас ${cars(db.active)}; за ночь проверено ${db.checked.toLocaleString("ru-RU")}, добавлено ${db.added.toLocaleString("ru-RU")}, снято с продажи ${db.gone.toLocaleString("ru-RU")}.`);

const ok = troubles.length === 0;
const text = [
  ok ? "✅ Ночь прошла нормально" : "⚠️ Ночью что-то пошло не так",
  "",
  ...troubles.map((trouble) => `• ${trouble}`),
  ...(troubles.length ? [""] : []),
  ...lines,
].join("\n").trim();

// ---- Отправка ---------------------------------------------------------------
// Телеграм не разрешает боту писать первым: адрес чата появляется только после
// того, как человек сам напишет боту. Поэтому адрес не прописан в настройках, а
// подхватывается сам с первого же сообщения и запоминается здесь — не нужно
// ловить момент и править конфиг руками.
const CHAT_PATH = path.join(ROOT, "runtime", "telegram-chat.json");
const token = process.env.TELEGRAM_BOT_TOKEN;

async function resolveChatId() {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  const saved = await readReport(CHAT_PATH);
  if (saved?.chatId) return saved.chatId;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { signal: AbortSignal.timeout(20_000) });
    const payload = await response.json();
    // Берём самое свежее: если боту писали из нескольких чатов, нужен последний.
    const chats = (payload?.result || [])
      .map((update) => (update.message || update.channel_post || {}).chat)
      .filter((chat) => chat?.id);
    const chatId = chats.length ? String(chats[chats.length - 1].id) : null;
    if (!chatId) return null;
    await fs.mkdir(path.dirname(CHAT_PATH), { recursive: true });
    await fs.writeFile(CHAT_PATH, `${JSON.stringify({ chatId, savedAt: new Date().toISOString() }, null, 2)}\n`);
    console.log(`[watch] нашёл чат ${chatId} и запомнил его`);
    return chatId;
  } catch (error) {
    console.warn(`[watch] не удалось спросить телеграм про чат: ${String(error.message).slice(0, 100)}`);
    return null;
  }
}

console.log(text);
if (ok && !always) {
  console.log("[watch] всё в порядке — сообщение не отправляю (--always заставит)");
  process.exit(0);
}
if (dryRun) process.exit(ok ? 0 : 1);
if (!token) {
  console.warn("[watch] TELEGRAM_BOT_TOKEN не задан — сообщение осталось только в журнале");
  process.exit(ok ? 0 : 1);
}
const chatId = await resolveChatId();
if (!chatId) {
  console.warn("[watch] боту ещё никто не писал — некуда отправлять; напишите ему любое сообщение, адрес подхватится сам");
  process.exit(ok ? 0 : 1);
}

// С этого сервера телеграм доступен только по IPv6, и маршрут иногда моргает:
// первая же проверка получила «fetch failed» там, где через минуту всё прошло.
// Одна потерянная попытка — потерянное сообщение о сломанной ночи, поэтому
// пробуем трижды.
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) { console.log("[watch] сообщение отправлено"); break; }
    console.warn(`[watch] телеграм ответил ${response.status}: ${(await response.text()).slice(0, 200)}`);
    // Отказ с ответом — это не сбой связи: повтор ничего не изменит.
    break;
  } catch (error) {
    const cause = String(error.cause?.message || error.message).slice(0, 120);
    console.warn(`[watch] попытка ${attempt} не прошла: ${cause}`);
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
  }
}
process.exit(ok ? 0 : 1);
