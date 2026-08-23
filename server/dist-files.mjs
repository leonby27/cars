// Файлы из сборки, которые нужны серверу, чтобы собрать страницу: в них лежат ссылки
// на стили и скрипты этой выкладки — хеши в их именах меняются каждый раз, поэтому
// подставлять их руками нельзя.
//   app-shell.html — пустая заготовка, в неё вставляется содержимое страницы;
//   car.html       — готовая общая страница машины, ответ на случай, когда база недоступна.
// На своей машине файлы читаются с диска, на хостинге их в функции нет (`dist` туда не
// загружается) — там они берутся по сети с той же выкладки и остаются в памяти.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const siteUrl = String(process.env.SITE_URL || "https://evcars.by").replace(/\/+$/, "");
const distFile = (name) => fileURLToPath(new URL(`../dist/client/${name}`, import.meta.url));
const files = new Map();

// Откуда берём файл по сети. Хост запроса здесь сознательно не используется: он приходит
// из заголовка, то есть его можно подделать — и тогда мы забрали бы «заготовку страницы»
// с чужого сервера и отдали её как свою. Берём только адреса, которые задаёт сам хостинг
// или наши настройки. Боевой домен идёт первым: у него нет защиты доступа, которая на
// адресах отдельных выкладок может отвечать «требуется вход».
const shellHosts = () => [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL, new URL(siteUrl).host].filter(Boolean);

function loadFile(name) {
  if (!files.has(name)) {
    files.set(name, readDistFile(name).catch((error) => {
      // Неудачу не запоминаем: следующий запрос попробует снова, иначе одна сетевая
      // осечка выключила бы серверные страницы до перезапуска функции.
      files.delete(name);
      throw error;
    }));
  }
  return files.get(name);
}

async function readDistFile(name) {
  const local = distFile(name);
  if (existsSync(local)) return readFileSync(local, "utf8");
  const failures = [];
  for (const host of shellHosts()) {
    try {
      // Хостинг настроен на адреса без «.html» и сам перебрасывает с расширения на
      // короткий адрес, поэтому переброс здесь проходим (`fetch` делает это сам).
      const response = await fetch(`https://${host}/${name}`, { redirect: "follow", headers: { "user-agent": "evcars.by-seo-render/1.0" } });
      if (response.ok) return response.text();
      failures.push(`${host}: ${response.status}`);
    } catch (error) {
      failures.push(`${host}: ${error.code || error.message}`);
    }
  }
  throw new Error(`missing_${name} (${failures.join("; ") || "нет известных адресов"})`);
}

/** Пустая заготовка приложения — в неё вставляется содержимое собранной страницы. */
export const appShell = () => loadFile("app-shell.html");

/** Готовая общая страница машины — ответ на случай, когда собрать свою не удалось. */
export const carShell = () => loadFile("car.html");
