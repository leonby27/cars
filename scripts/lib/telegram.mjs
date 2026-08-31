// Отправка сообщений боту @importabcarsbot. Вынесено из night-watch.mjs, чтобы
// тем же кодом пользовалась и актуализация: она докладывает после каждого подхода.
//
// Особенности этого сервера, из-за которых код такой, какой он есть:
//  - телеграм доступен только по IPv6, и маршрут регулярно моргает: 31.08.2026
//    одно сообщение ушло сразу, а следующее через десять минут не смогло
//    соединиться ни с третьей попытки. Поэтому попыток пять, с растущими
//    паузами, а что так и не ушло — складывается в очередь и досылается со
//    следующим сообщением. Иначе доклад о сломанной сессии просто пропадал бы;
//  - адрес чата бот узнаёт только после того, как человек сам ему напишет,
//    поэтому найденный адрес запоминается в runtime/telegram-chat.json.
import fs from "node:fs/promises";
import path from "node:path";
import https from "node:https";

const ATTEMPT_WAITS_MS = [5_000, 15_000, 30_000, 60_000];

// getUpdates нужен только чтобы узнать адрес чата, но ходить он обязан тем же
// путём — по IPv6, иначе повиснет ровно так же, как повисала отправка.
function getUpdates(token) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      { host: "api.telegram.org", path: `/bot${token}/getUpdates`, method: "GET", family: 6, timeout: 20_000 },
      (response) => {
        let body = "";
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => {
          try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("таймаут соединения")));
    request.on("error", reject);
    request.end();
  });
}

export async function resolveChatId({ root, token, log = console.log }) {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  const chatPath = path.join(root, "runtime", "telegram-chat.json");
  try {
    const saved = JSON.parse(await fs.readFile(chatPath, "utf8"));
    if (saved?.chatId) return saved.chatId;
  } catch {}
  if (!token) return null;
  try {
    const payload = await getUpdates(token);
    const chats = (payload?.result || [])
      .map((update) => (update.message || update.channel_post || {}).chat)
      .filter((chat) => chat?.id);
    const chatId = chats.length ? String(chats[chats.length - 1].id) : null;
    if (!chatId) return null;
    await fs.mkdir(path.dirname(chatPath), { recursive: true });
    await fs.writeFile(chatPath, `${JSON.stringify({ chatId, savedAt: new Date().toISOString() }, null, 2)}\n`);
    log(`[tg] нашёл чат ${chatId} и запомнил его`);
    return chatId;
  } catch (error) {
    log(`[tg] не удалось спросить телеграм про чат: ${String(error.message).slice(0, 100)}`);
    return null;
  }
}

const outboxPath = (root) => path.join(root, "runtime", "telegram-outbox.json");

async function readOutbox(root) {
  try { return JSON.parse(await fs.readFile(outboxPath(root), "utf8")); }
  catch { return []; }
}
async function writeOutbox(root, items) {
  await fs.mkdir(path.dirname(outboxPath(root)), { recursive: true });
  // Очередь не должна расти бесконечно: старше суток и сверх двадцати штук — лишнее.
  const fresh = items.filter((x) => Date.now() - new Date(x.queuedAt).getTime() < 24 * 3600_000).slice(-20);
  await fs.writeFile(outboxPath(root), JSON.stringify(fresh, null, 2));
}

// Отправляем строго по IPv6. Причина: 31.08.2026 выяснилось, что IPv4 до
// телеграма с этого сервера не работает совсем (соединение висит до таймаута),
// а обычный fetch выбирает между IPv6 и IPv4 сам — и когда выбирал IPv4,
// сообщение терялось. Поэтому берём node:https с family: 6, где адрес семейства
// задаётся явно.
function postOnce({ token, chatId, text }) {
  const payload = JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true });
  const options = {
    host: "api.telegram.org",
    path: `/bot${token}/sendMessage`,
    method: "POST",
    family: 6,
    headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
    timeout: 25_000,
  };
  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      let body = "";
      response.on("data", (chunk) => { if (body.length < 500) body += chunk; });
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve({ ok: true });
        // Отказ с ответом — не сбой связи: повтор ничего не изменит.
        else resolve({ ok: false, fatal: true, status: response.statusCode, body: body.slice(0, 200) });
      });
    });
    request.on("timeout", () => request.destroy(new Error("таймаут соединения")));
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

async function deliver({ token, chatId, text, log }) {
  for (let attempt = 1; attempt <= ATTEMPT_WAITS_MS.length + 1; attempt += 1) {
    try {
      const result = await postOnce({ token, chatId, text });
      if (result.ok) return true;
      log(`[tg] телеграм ответил ${result.status}: ${result.body}`);
      return false;
    } catch (error) {
      const cause = String(error.cause?.message || error.message).slice(0, 120);
      const wait = ATTEMPT_WAITS_MS[attempt - 1];
      log(`[tg] попытка ${attempt} не прошла: ${cause}`);
      if (wait === undefined) return false;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  return false;
}

// Никогда не бросает исключений: недоставленное сообщение не должно ронять
// прогон, ради которого оно отправлялось.
export async function sendTelegram(text, { root, log = console.log } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { log("[tg] TELEGRAM_BOT_TOKEN не задан — сообщение осталось в журнале"); return false; }
  const chatId = await resolveChatId({ root, token, log });
  if (!chatId) { log("[tg] боту ещё никто не писал — некуда отправлять"); return false; }

  // Сначала досылаем то, что не ушло раньше: порядок сообщений сохраняется.
  const queued = await readOutbox(root);
  const stillQueued = [];
  for (const item of queued) {
    const sent = await deliver({ token, chatId, text: item.text, log });
    if (sent) log("[tg] досланo отложенное сообщение");
    else stillQueued.push(item);
  }

  const sent = await deliver({ token, chatId, text, log });
  if (!sent) {
    stillQueued.push({ text, queuedAt: new Date().toISOString() });
    log("[tg] не доставлено — положил в очередь, дошлю со следующим сообщением");
  }
  await writeOutbox(root, stillQueued).catch(() => {});
  return sent;
}
