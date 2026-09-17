// Публикация записей в Threads и Instagram от имени @abcars.by.
//
// Обе сети работают одинаково в два шага: сначала создаётся «заготовка» записи
// (контейнер), потом отдельным запросом она публикуется. Картинку сеть скачивает
// сама по адресу, который мы ей даём, — и вот тут у нас особенность: загрузчик
// Meta не открывает соединения с нашим сервером (он в российской сети), поэтому
// снимки даются прямыми адресами китайского хранилища. Подробности — в
// src/photo-source.js.
//
// Ключи доступа живут 60 дней и продлеваются запросом refresh: держать это в
// голове не нужно, продление вызывается само перед каждой публикацией, но не
// чаще раза в сутки. Продлённый ключ ложится в runtime/social-tokens.json —
// файл вне git, как и telegram-chat.json, поэтому выкладка его не затирает.
import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tokensPath = path.join(root, "runtime", "social-tokens.json");

const THREADS_API = "https://graph.threads.net/v1.0";
const INSTAGRAM_API = "https://graph.instagram.com/v23.0";

// Сеть до Meta с нашего сервера иногда моргает, а сама Meta отвечает «попробуйте
// позже» на пустом месте. Три попытки с растущей паузой закрывают и то, и другое.
const ATTEMPT_WAITS_MS = [3_000, 10_000, 30_000];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callApi(url, { method = "GET", form = null, attempt = 0 } = {}) {
  let response;
  let payload;
  try {
    response = await fetch(url, {
      method,
      ...(form ? { body: new URLSearchParams(form) } : {}),
    });
    payload = await response.json();
  } catch (error) {
    if (attempt < ATTEMPT_WAITS_MS.length) {
      await wait(ATTEMPT_WAITS_MS[attempt]);
      return callApi(url, { method, form, attempt: attempt + 1 });
    }
    throw new Error(`сеть недоступна: ${error.message}`);
  }
  const error = payload?.error;
  if (error) {
    const transient = error.is_transient || response.status >= 500 || error.code === 4 || error.code === 17;
    if (transient && attempt < ATTEMPT_WAITS_MS.length) {
      await wait(ATTEMPT_WAITS_MS[attempt]);
      return callApi(url, { method, form, attempt: attempt + 1 });
    }
    const reason = error.error_user_title || error.message || "неизвестная ошибка";
    const failure = new Error(reason);
    failure.meta = error;
    throw failure;
  }
  return payload;
}

const query = (params) => new URLSearchParams(params).toString();

// ── Ключи доступа ────────────────────────────────────────────────────────────

async function readSavedTokens() {
  try { return JSON.parse(await fs.readFile(tokensPath, "utf8")); } catch { return {}; }
}

async function saveTokens(tokens) {
  await fs.mkdir(path.dirname(tokensPath), { recursive: true });
  await fs.writeFile(tokensPath, `${JSON.stringify(tokens, null, 2)}\n`);
}

export async function socialConfig() {
  const saved = await readSavedTokens();
  return {
    threads: {
      userId: process.env.THREADS_USER_ID || "",
      token: saved.threads?.token || process.env.THREADS_ACCESS_TOKEN || "",
      refreshedAt: saved.threads?.refreshedAt || null,
    },
    instagram: {
      userId: process.env.INSTAGRAM_USER_ID || "",
      token: saved.instagram?.token || process.env.INSTAGRAM_ACCESS_TOKEN || "",
      refreshedAt: saved.instagram?.refreshedAt || null,
    },
    // У телеграма ключ не истекает, продлевать нечего.
    telegram: {
      token: process.env.TELEGRAM_BOT_TOKEN || "",
      channel: process.env.TELEGRAM_CHANNEL || "@abcars_by",
    },
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Ключ можно продлевать не чаще раза в сутки — Meta отказывает на свежем ключе.
// Продлеваем раз в неделю: этого хватает с запасом, а срок каждый раз обнуляется
// до 60 дней. Ошибка продления не должна мешать публикации: старый ключ ещё жив.
export async function refreshSocialTokens({ log = console.log, force = false } = {}) {
  const config = await socialConfig();
  const saved = await readSavedTokens();
  const now = Date.now();
  let changed = false;

  for (const [network, url] of [
    ["threads", `https://graph.threads.net/refresh_access_token?${query({ grant_type: "th_refresh_token", access_token: config.threads.token })}`],
    ["instagram", `https://graph.instagram.com/refresh_access_token?${query({ grant_type: "ig_refresh_token", access_token: config.instagram.token })}`],
  ]) {
    const current = config[network];
    if (!current.token) continue;
    const age = current.refreshedAt ? now - Date.parse(current.refreshedAt) : Infinity;
    if (!force && age < 7 * DAY_MS) continue;
    try {
      const payload = await callApi(url);
      if (!payload?.access_token) continue;
      saved[network] = {
        token: payload.access_token,
        refreshedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + Number(payload.expires_in || 0) * 1000).toISOString(),
      };
      changed = true;
      log(`${network}: ключ продлён ещё на ${Math.round(Number(payload.expires_in || 0) / 86400)} дней`);
    } catch (error) {
      log(`${network}: продлить ключ не вышло (${error.message}), работаем прежним`);
    }
  }
  if (changed) await saveTokens(saved);
  return changed ? await socialConfig() : config;
}

// ── Threads ──────────────────────────────────────────────────────────────────

async function threadsContainer({ userId, token, form }) {
  const payload = await callApi(`${THREADS_API}/${userId}/threads`, { method: "POST", form: { ...form, access_token: token } });
  return payload.id;
}

// Threads просит подождать, пока заготовка «дойдёт», и только потом публиковать.
// Обычно готово за пару секунд, но у карусели с десятью кадрами бывает дольше.
async function waitForThreads(id, token, { tries = 12 } = {}) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    await wait(attempt === 0 ? 3_000 : 5_000);
    try {
      const payload = await callApi(`${THREADS_API}/${id}?${query({ fields: "status,error_message", access_token: token })}`);
      if (payload.status === "FINISHED") return true;
      if (payload.status === "ERROR" || payload.status === "EXPIRED") {
        throw new Error(payload.error_message || `заготовка записи в состоянии ${payload.status}`);
      }
    } catch (error) {
      if (error.meta) throw error;
    }
  }
  return true;
}

export async function publishToThreads({ text, photos = [], config, log = console.log }) {
  const { userId, token } = config.threads;
  if (!userId || !token) throw new Error("нет ключа доступа к Threads");
  const usable = photos.slice(0, 20);
  let creationId;

  if (!usable.length) {
    creationId = await threadsContainer({ userId, token, form: { media_type: "TEXT", text } });
  } else if (usable.length === 1) {
    creationId = await threadsContainer({ userId, token, form: { media_type: "IMAGE", image_url: usable[0], text } });
  } else {
    const children = [];
    for (const image of usable) {
      try {
        children.push(await threadsContainer({ userId, token, form: { media_type: "IMAGE", is_carousel_item: "true", image_url: image } }));
      } catch (error) {
        log(`Threads: кадр не принят (${error.message}), пропускаю`);
      }
    }
    if (!children.length) throw new Error("Threads не принял ни одного кадра");
    creationId = children.length === 1
      ? await threadsContainer({ userId, token, form: { media_type: "IMAGE", image_url: usable[0], text } })
      : await threadsContainer({ userId, token, form: { media_type: "CAROUSEL", children: children.join(","), text } });
  }

  await waitForThreads(creationId, token);
  const published = await callApi(`${THREADS_API}/${userId}/threads_publish`, { method: "POST", form: { creation_id: creationId, access_token: token } });
  const info = await callApi(`${THREADS_API}/${published.id}?${query({ fields: "permalink", access_token: token })}`).catch(() => ({}));
  return { id: published.id, url: info.permalink || "" };
}

// ── Instagram ────────────────────────────────────────────────────────────────

async function instagramContainer({ userId, token, form }) {
  const payload = await callApi(`${INSTAGRAM_API}/${userId}/media`, { method: "POST", form: { ...form, access_token: token } });
  return payload.id;
}

async function waitForInstagram(id, token, { tries = 15 } = {}) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    await wait(attempt === 0 ? 3_000 : 5_000);
    const payload = await callApi(`${INSTAGRAM_API}/${id}?${query({ fields: "status_code", access_token: token })}`);
    if (payload.status_code === "FINISHED") return;
    if (payload.status_code === "ERROR" || payload.status_code === "EXPIRED") {
      throw new Error(`заготовка записи в состоянии ${payload.status_code}`);
    }
  }
  throw new Error("Instagram слишком долго готовит запись");
}

export async function publishToInstagram({ caption, photos = [], config, log = console.log }) {
  const { userId, token } = config.instagram;
  if (!userId || !token) throw new Error("нет ключа доступа к Instagram");
  if (!photos.length) throw new Error("Instagram не публикует записи без фотографий");

  // Instagram берёт кадр не уже 4:5 и не шире 1.91:1, а у источника попадаются и
  // другие. Проверить заранее нельзя — отвечает он только на попытку, поэтому
  // кадры добавляются по одному, а непринятые просто пропускаются.
  const children = [];
  for (const image of photos.slice(0, 10)) {
    try {
      children.push(await instagramContainer({ userId, token, form: { is_carousel_item: "true", image_url: image } }));
    } catch (error) {
      log(`Instagram: кадр не принят (${error.message}), пропускаю`);
    }
  }
  if (!children.length) throw new Error("Instagram не принял ни одного кадра");

  const creationId = children.length === 1
    ? await instagramContainer({ userId, token, form: { image_url: photos[0], caption } })
    : await instagramContainer({ userId, token, form: { media_type: "CAROUSEL", children: children.join(","), caption } });

  await waitForInstagram(creationId, token);
  const published = await callApi(`${INSTAGRAM_API}/${userId}/media_publish`, { method: "POST", form: { creation_id: creationId, access_token: token } });
  const info = await callApi(`${INSTAGRAM_API}/${published.id}?${query({ fields: "permalink", access_token: token })}`).catch(() => ({}));
  return { id: published.id, url: info.permalink || "", frames: children.length };
}

// ── Telegram ─────────────────────────────────────────────────────────────────
//
// Канал @abcars_by, публикует бот @importabcarsbot (он же шлёт ночные сводки).
// С нашего сервера телеграм отвечает только по IPv6, и маршрут иногда моргает —
// поэтому запрос сначала идёт шестой версией протокола, а при сетевом сбое
// повторяется без неё: так команда работает и с ноутбука, где IPv6 может не быть.
//
// Важное ограничение самого телеграма: кнопку можно прицепить только к одиночному
// снимку или к тексту. Под альбомом из нескольких фото кнопок не бывает вовсе,
// поэтому в альбоме ссылка прячется в подписи словами «Смотреть в каталоге».
function telegramRequest(token, method, payload, family) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request({
      host: "api.telegram.org",
      path: `/bot${token}/${method}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      ...(family ? { family } : {}),
      timeout: 30_000,
    }, (response) => {
      let text = "";
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        try { resolve(JSON.parse(text)); } catch { reject(new Error(`телеграм ответил не по делу: ${text.slice(0, 200)}`)); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("таймаут соединения")));
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function telegramApi(token, method, payload) {
  let lastError;
  for (const family of [6, undefined]) {
    for (let attempt = 0; attempt <= ATTEMPT_WAITS_MS.length; attempt += 1) {
      try {
        const result = await telegramRequest(token, method, payload, family);
        if (result.ok) return result.result;
        // Слишком частые запросы: телеграм сам говорит, сколько ждать.
        if (result.error_code === 429 && result.parameters?.retry_after) {
          await wait((result.parameters.retry_after + 1) * 1000);
          continue;
        }
        throw new Error(result.description || `ошибка ${result.error_code}`);
      } catch (error) {
        lastError = error;
        const networkProblem = /таймаут|ENETUNREACH|ECONNRESET|EHOSTUNREACH|ETIMEDOUT|socket/i.test(String(error.message));
        if (!networkProblem) throw error;
        if (attempt < ATTEMPT_WAITS_MS.length) await wait(ATTEMPT_WAITS_MS[attempt]);
      }
    }
  }
  throw lastError || new Error("телеграм недоступен");
}

// Отправка картинки файлом. Нужна там, где по ссылке не выходит: до нашего сервера
// телеграм не дотягивается так же, как и загрузчик Meta, а обложки журнала лежат
// именно у нас. Файл мы передаём сами, и качать ему ничего не нужно.
//
// Тело складываем руками, а не готовым FormData: телеграм с нашего сервера отвечает
// только по шестой версии протокола, выбрать её можно лишь у обычного https-запроса,
// а библиотечная отправка форм через него не проходит — виснет на ожидании ответа.
function multipartBody(fields, file) {
  const boundary = `----abcars${Math.random().toString(36).slice(2)}`;
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${file.name}"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`,
  ));
  parts.push(file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), boundary };
}

function uploadOnce(token, fields, file, family) {
  const { body, boundary } = multipartBody(fields, file);
  return new Promise((resolve, reject) => {
    const request = https.request({
      host: "api.telegram.org",
      path: `/bot${token}/sendPhoto`,
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
      ...(family ? { family } : {}),
      timeout: 60_000,
    }, (response) => {
      let text = "";
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        try { resolve(JSON.parse(text)); } catch { reject(new Error(`телеграм ответил не по делу: ${text.slice(0, 160)}`)); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("таймаут отправки файла")));
    request.on("error", reject);
    request.end(body);
  });
}

async function telegramUploadPhoto(token, { chatId, filePath, caption, markup }) {
  const data = await fs.readFile(filePath);
  const file = { name: path.basename(filePath), data };
  const fields = {
    chat_id: chatId,
    ...(caption ? { caption, parse_mode: "HTML" } : {}),
    ...(markup ? { reply_markup: JSON.stringify(markup) } : {}),
  };
  let lastError;
  for (const family of [6, undefined]) {
    try {
      const payload = await uploadOnce(token, fields, file, family);
      if (payload.ok) return payload.result;
      throw new Error(payload.description || `ошибка ${payload.error_code}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("телеграм не принял файл");
}

const channelLink = (message) => {
  const name = message?.chat?.username;
  return name ? `https://t.me/${name}/${message.message_id}` : "";
};

export async function publishToTelegram({ text, photos = [], files = [], buttonUrl = "", config, log = console.log }) {
  const { token, channel } = config.telegram;
  if (!token || !channel) throw new Error("нет бота или канала для телеграма");

  // Картинка с нашего сервера уходит файлом: по ссылке телеграм её не возьмёт.
  if (files.length) {
    const message = await telegramUploadPhoto(token, {
      chatId: channel, filePath: files[0], caption: text,
      markup: buttonUrl ? { inline_keyboard: [[{ text: "Смотреть в каталоге", url: buttonUrl }]] } : undefined,
    });
    log("Телеграм: картинка отправлена файлом");
    return { id: message.message_id, url: channelLink(message), frames: 1 };
  }

  const usable = photos.slice(0, 10);

  // Кнопка и альбом несовместимы: если кнопка нужна, уходит один снимок.
  if (buttonUrl || usable.length <= 1) {
    const markup = buttonUrl ? { inline_keyboard: [[{ text: "Смотреть в каталоге", url: buttonUrl }]] } : undefined;
    const message = usable.length
      ? await telegramApi(token, "sendPhoto", { chat_id: channel, photo: usable[0], caption: text, parse_mode: "HTML", reply_markup: markup })
      : await telegramApi(token, "sendMessage", { chat_id: channel, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: markup });
    return { id: message.message_id, url: channelLink(message), frames: usable.length };
  }

  const media = usable.map((photo, index) => ({
    type: "photo",
    media: photo,
    ...(index === 0 ? { caption: text, parse_mode: "HTML" } : {}),
  }));
  const messages = await telegramApi(token, "sendMediaGroup", { chat_id: channel, media });
  const first = Array.isArray(messages) ? messages[0] : messages;
  log(`Телеграм: альбом из ${usable.length} кадров`);
  return { id: first.message_id, url: channelLink(first), frames: usable.length };
}

// Запись в телеграме можно убрать — этим пользуется проверка, чтобы не оставлять
// в канале пробные публикации. У Instagram и Threads такой возможности нет.
export async function deleteTelegramPost(messageId, { config }) {
  const { token, channel } = config.telegram;
  return telegramApi(token, "deleteMessage", { chat_id: channel, message_id: messageId });
}

// Сколько записей сеть ещё разрешит сегодня: у Threads 250 в сутки, у Instagram 100.
export async function remainingQuota(config) {
  const result = {};
  try {
    const payload = await callApi(`${THREADS_API}/${config.threads.userId}/threads_publishing_limit?${query({ fields: "quota_usage,config", access_token: config.threads.token })}`);
    const row = payload?.data?.[0];
    result.threads = Math.max(0, Number(row?.config?.quota_total || 0) - Number(row?.quota_usage || 0));
  } catch { result.threads = null; }
  try {
    const payload = await callApi(`${INSTAGRAM_API}/${config.instagram.userId}/content_publishing_limit?${query({ fields: "quota_usage,config", access_token: config.instagram.token })}`);
    const row = payload?.data?.[0];
    result.instagram = Math.max(0, Number(row?.config?.quota_total || 0) - Number(row?.quota_usage || 0));
  } catch { result.instagram = null; }
  return result;
}
