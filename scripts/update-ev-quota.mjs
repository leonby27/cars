// Обновляет остаток квоты на электромобили в src/ev-quota.js по сводкам ГТК.
// Запуск: node scripts/update-ev-quota.mjs (или npm run quota).
//
// Таможня публикует остаток раз в неделю (по пятницам) в своём телеграм-канале
// с тегом #электромобили. Веб-версия канала отдаётся обычным запросом без
// авторизации, поэтому читаем её и вытаскиваем числа из текста постов.
// На сайте customs.gov.by те же цифры выходят новостями со случайными адресами,
// а поиск по сайту отстаёт на месяцы — как источник для автоматики не годится.
//
// Ничего не пишет, если новых сводок нет. Падает с ошибкой, если разметка канала
// или формулировки постов изменились — тогда в файле остаются прежние цифры,
// а не пустой список.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readEvQuotaReport as readReport } from "./ev-quota-report.mjs";

const quotaPath = fileURLToPath(new URL("../src/ev-quota.js", import.meta.url));
const channel = "customs_bel";
// Телеграм отдаёт по запросу не больше двух десятков постов, а часть сводок
// выходит без тега — поэтому спрашиваем канал дважды и склеиваем найденное.
const feedQueries = ["#электромобили", "квота электромобилей"];
const feedUrl = (query) => `https://t.me/s/${channel}?q=${encodeURIComponent(query)}`;

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

const stripTags = (html) => html
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");

const fetchFeed = async (query) => {
  const response = await fetch(feedUrl(query), {
    headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
  });
  if (!response.ok) throw new Error(`Телеграм не отдал канал ГТК: HTTP ${response.status}`);
  const html = await response.text();
  if (!html.includes("tgme_widget_message")) throw new Error("В ответе телеграма нет постов — разметка изменилась, обновите скрипт");
  return html;
};

const parsePosts = (html) => html
  .split('<div class="tgme_widget_message ')
  .slice(1)
  .map((block) => {
    const date = block.match(/datetime="(\d{4}-\d{2}-\d{2})/);
    const body = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!date || !body) return null;
    return { date: date[1], text: stripTags(body[1]).replace(/[ \t]+/g, " ") };
  })
  .filter(Boolean);

const posts = (await Promise.all(feedQueries.map(fetchFeed))).flatMap(parsePosts);
if (!posts.length) throw new Error("Посты в канале ГТК не разобрались — разметка изменилась, обновите скрипт");

const source = await readFile(quotaPath, "utf8");
const startedOn = source.match(/startedOn:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1];
if (!startedOn) throw new Error("В ev-quota.js не нашлась дата startedOn — формат файла изменился, обновите скрипт");

const fetched = new Map();
for (const post of posts) {
  // Квота своя на каждый год: сводки за прошлые годы в историю не берём.
  if (post.date < startedOn) continue;
  const report = readReport(post);
  // В один день бывает и напоминание, и сводка — берём то, где цифры есть.
  if (!report) continue;
  const known = fetched.get(report.date);
  fetched.set(report.date, {
    date: report.date,
    personal: report.personal ?? known?.personal ?? null,
    business: report.business ?? known?.business ?? null,
  });
}

if (!fetched.size) throw new Error("В канале ГТК не нашлось ни одной сводки с цифрами — формулировки изменились, обновите скрипт");

const listMatch = source.match(/reports:\s*\[([\s\S]*?)\n {2}\],/);
if (!listMatch) throw new Error("В ev-quota.js не нашёлся список reports — формат файла изменился, обновите скрипт");

const existing = new Map();
for (const row of listMatch[1].matchAll(/\["(\d{4}-\d{2}-\d{2})",\s*(null|\d+),\s*(null|\d+)\]/g)) {
  existing.set(row[1], {
    date: row[1],
    personal: row[2] === "null" ? null : Number(row[2]),
    business: row[3] === "null" ? null : Number(row[3]),
  });
}
if (!existing.size) throw new Error("Список reports в ev-quota.js пуст или записан иначе — обновите скрипт");

const merged = new Map(existing);
const added = [];
const filled = [];
const label = (key) => (key === "personal" ? "граждане" : "юрлица");

for (const [date, report] of fetched) {
  const known = merged.get(date);
  if (!known) {
    merged.set(date, report);
    added.push(report);
    continue;
  }
  // Уже записанные цифры не переписываем: расхождение с каналом лучше показать
  // в логе, чем молча менять историю. А вот пропуски дозаполняем — в части
  // сводок таможня называет только одну из двух цифр, вторая приходит позже.
  for (const key of ["personal", "business"]) {
    if (known[key] !== null && report[key] !== null && known[key] !== report[key]) {
      console.log(`Сводка от ${date}: в канале «${label(key)}» ${report[key]}, в файле ${known[key]} — оставляем прежнюю цифру.`);
    }
  }
  const next = {
    date,
    personal: known.personal ?? report.personal,
    business: known.business ?? report.business,
  };
  if (next.personal !== known.personal || next.business !== known.business) {
    merged.set(date, next);
    filled.push(next);
  }
}

const human = (date) => {
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
};

if (!added.length && !filled.length) {
  const latest = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  console.log(`Новых сводок нет, последняя — от ${human(latest.date)}: у граждан ${latest.personal} машин.`);
  process.exit(0);
}

const rows = [...merged.values()]
  .sort((a, b) => a.date.localeCompare(b.date))
  .map(({ date, personal, business }) => `    ["${date}", ${personal ?? "null"}, ${business ?? "null"}],`)
  .join("\n");

const updated = source.replace(listMatch[0], `reports: [\n${rows}\n  ],`);
if (updated === source) throw new Error("Список reports не удалось перезаписать — обновите скрипт");
await writeFile(quotaPath, updated);

for (const report of added) {
  console.log(`Добавлена сводка от ${human(report.date)}: у граждан ${report.personal ?? "—"}, у юрлиц ${report.business ?? "—"}.`);
}
for (const report of filled) {
  console.log(`Дозаполнена сводка от ${human(report.date)}: у граждан ${report.personal ?? "—"}, у юрлиц ${report.business ?? "—"}.`);
}
console.log("Файл src/ev-quota.js обновлён. Пересоберите сайт, чтобы цифра в шапке изменилась.");
