// Бот-приёмщик: слушает телеграм и запускает обход по команде Сергея.
//
// Зачем: расписание пока выключено, а запускать прогон удобнее сообщением с
// телефона, чем через терминал. Команды простые, по-русски; отвечает бот в тот же
// чат, а сами отбивки по маркам шлёт уже прогон.
//
// Безопасность: слушаем только свой чат (TELEGRAM_CHAT_ID), команды — из
// закрытого списка, ничего произвольного не выполняем. Марки сверяются с нашим
// же справочником, так что подставить чужое имя в командную строку нельзя.
import fs from "node:fs/promises";
import path from "node:path";
import https from "node:https";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sendTelegram } from "./lib/telegram.mjs";
import { parseCommand } from "./lib/telegram-command-parse.mjs";
import { handleGuaziCommand } from "./lib/telegram-guazi.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OFFSET_PATH = path.join(ROOT, "runtime", "telegram-offset.json");
const LOG_PATH = "/tmp/circle.log";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = String(process.env.TELEGRAM_CHAT_ID || "");
if (!TOKEN || !CHAT) throw new Error("нужны TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID");

const say = (text) => sendTelegram(text, { root: ROOT, log: console.log }).catch(() => {});

// Долгое ожидание вместо частых опросов: телеграм сам держит соединение до 50 с.
function poll(offset) {
  return new Promise((resolve) => {
    const request = https.request(
      { host: "api.telegram.org", path: `/bot${TOKEN}/getUpdates?timeout=50&offset=${offset}`, method: "GET", family: 6, timeout: 60_000 },
      (response) => {
        let body = "";
        response.on("data", (c) => { body += c; });
        response.on("end", () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("таймаут")));
    request.on("error", () => resolve(null));
    request.end();
  });
}

const running = () =>
  new Promise((resolve) => {
    execFile("/bin/bash", ["-c", "pgrep -f '[r]efresh-che168.mjs' | head -1"], (error, out) => resolve(String(out || "").trim()));
  });

async function startRun(brands, { newCircle = false } = {}) {
  // Актуализация существующего каталога должна доходить до каждой машины.
  // Ограничиваем только пополнение новыми карточками, а не поштучные проверки.
  const args = ["scripts/refresh-che168.mjs", "--new-per-brand=100"];
  if (brands?.length) args.push(`--brands=${brands.join(",")}`);
  // «Круг» — всегда все марки с первой. Без этого прогон продолжал незакрытый
  // прошлый круг: доделывал хвост одной марки и на этом заканчивался.
  if (newCircle) args.push("--new-circle");
  const child = spawn("xvfb-run", ["-a", "node", ...args], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", (await fs.open(LOG_PATH, "a")).fd, (await fs.open(LOG_PATH, "a")).fd],
    env: process.env,
  });
  child.unref();
  return child.pid;
}

const HELP = [
  "Что я умею:",
  "",
  "• «круг 1» (или просто «круг») — обойти все марки Che168 заново, от мелких к крупным",
  "• «круг 2» — обновить Guazi и найти новые машины",
  "• «статус 2», «стоп 2», «продолжить 2» — управление Guazi",
  "• «продолжить» — доделать только то, что не успел прошлый круг Che168",
  "• «марка BMW» или «марки BMW, Audi» — только названные",
  "• «статус» — идёт ли Che168 и сколько машин в каталоге",
  "• «стоп» — остановить Che168 (всё проверенное сохранится)",
].join("\n");

async function handle(text) {
  const cmd = parseCommand(text);
  if (!cmd) return;
  if (cmd.kind === 'guazi' || cmd.kind.startsWith('guazi-')) return handleGuaziCommand(cmd, { root: ROOT, say });
  const busy = await running();

  if (cmd.kind === "help") return say(HELP);

  if (cmd.kind === "status") {
    const tail = await fs
      .readFile(LOG_PATH, "utf8")
      .then((s) => (s.match(/^\[brand\].*$/gm) || []).slice(-1)[0] || "марок ещё нет")
      .catch(() => "журнала нет");
    const count = await new Promise((resolve) =>
      execFile("/bin/bash", ["-c", `sudo -u postgres psql -d abcars -t -A -c "SELECT count(*) FROM listings WHERE status='active'"`], (e, out) =>
        resolve(String(out || "").trim() || "?"),
      ),
    );
    return say([busy ? "🟢 Прогон идёт" : "⚪️ Прогон не запущен", "", `Последняя марка: ${tail.replace("[brand] ", "")}`, `В каталоге: ${count} машин`].join("\n"));
  }

  if (cmd.kind === "stop") {
    if (!busy) return say("Прогон и так не запущен.");
    await new Promise((resolve) => execFile("/bin/bash", ["-c", `kill ${busy}`], () => resolve()));
    return say("Останавливаю. Всё проверенное сохранится. Доделать остаток — «продолжить», начать заново — «круг».");
  }

  if (busy) return say("Прогон уже идёт — сначала «стоп» или дождитесь конца.");

  if (cmd.kind === "circle") {
    await startRun(null, { newCircle: true });
    return say("Запускаю полный круг: все марки, от мелких к крупным. Итог пришлю после завершения круга.");
  }

  if (cmd.kind === "resume") {
    const cursor = await fs
      .readFile(path.join(ROOT, "runtime", "refresh-cursor.json"), "utf8")
      .then((raw) => JSON.parse(raw))
      .catch(() => null);
    if (!cursor?.startedAt) return say("Прошлый круг закрыт, доделывать нечего. Напишите «круг», чтобы начать новый.");
    await startRun(null);
    const done = cursor.brandsDone?.length || 0;
    return say(`Продолжаю круг №${cursor.round}: доделаны ${done} марок, беру остальные и непроверенные машины.`);
  }

  if (cmd.kind === "brands") {
    if (!cmd.found.length) return say(`Таких марок у нас нет: ${cmd.missing.join(", ")}.\n\nНапишите «помощь», чтобы увидеть команды.`);
    await startRun(cmd.found);
    const tail = cmd.missing.length ? `\n\nНе нашёл и пропускаю: ${cmd.missing.join(", ")}.` : "";
    return say(`Запускаю: ${cmd.found.join(", ")}.${tail}`);
  }
}

let offset = await fs
  .readFile(OFFSET_PATH, "utf8")
  .then((s) => Number(JSON.parse(s).offset) || 0)
  .catch(() => 0);
console.log(`[bot] слушаю команды, чат ${CHAT}, начиная с обновления ${offset}`);

for (;;) {
  const answer = await poll(offset);
  for (const update of answer?.result || []) {
    offset = Math.max(offset, Number(update.update_id) + 1);
    const message = update.message || update.edited_message;
    if (!message || String(message.chat?.id) !== CHAT) continue;
    console.log(`[bot] команда: ${String(message.text || "").slice(0, 60)}`);
    try {
      await handle(message.text);
    } catch (error) {
      console.log(`[bot] не смог: ${String(error.message).slice(0, 100)}`);
      await say(`Не смог выполнить: ${String(error.message).slice(0, 120)}`);
    }
  }
  await fs.writeFile(OFFSET_PATH, JSON.stringify({ offset }, null, 2)).catch(() => {});
  if (!answer) await new Promise((r) => setTimeout(r, 5000));
}
