// Прогревает свой кэш фотографий: заранее просит у сайта те снимки, которые
// посетитель увидит на первом экране, чтобы наш сервер успел забрать их у
// китайского хранилища до его прихода.
//
// Зачем: хранилище Che168 отвечает на первый запрос нового кадра 0,8–1,1 с, а с
// нашего диска тот же кадр уходит за 0,08 с (кэш настроен в
// snippets/abcars-photo-location.conf на сервере). Первый посетитель раньше ждал
// китайцев; теперь за него это делает ночная задача.
//
// Запуск: node scripts/warm-photos.mjs [--limit=1500] [--site=https://abcars.by]
//         [--concurrency=8] [--widths=600,240]
// Ничего не пишет в базу и не меняет файлы: только запрашивает картинки.
const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const site = String(arg("site", "https://abcars.by")).replace(/\/$/, "");
const limit = Math.max(1, Number(arg("limit", 1500)) || 1500);
const concurrency = Math.max(1, Number(arg("concurrency", 8)) || 8);
// Ширины, в которых сайт показывает фото в списках: карточка каталога и лента
// миниатюр. Держим их в согласии с IMAGE_WIDTH_* в src/App.jsx.
const widths = String(arg("widths", "600"))
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

// Списки в том же порядке, в каком их видит посетитель: витрина главной,
// первые страницы каталога и раздел «новинки». Дальше первых экранов не идём —
// прогревать весь каталог значит зря дёргать чужое хранилище.
const listUrls = [`${site}/api/cars?limit=60&sort=variety`];
const pageSize = 100;
for (let offset = 0; offset < limit; offset += pageSize) {
  listUrls.push(`${site}/api/cars?limit=${pageSize}&offset=${offset}`);
  if (offset < pageSize * 3) listUrls.push(`${site}/api/cars?limit=${pageSize}&offset=${offset}&sort=newest`);
}

const headers = { accept: "application/json", "user-agent": "abcars-warm/1.0" };

const listCars = async (url) => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} — HTTP ${response.status}`);
  const data = await response.json();
  return data.items || data.cars || [];
};

// Из карточки берём только первый снимок: именно он стоит в списке.
const photoPaths = (car) => {
  const source = car.image || car.images?.[0];
  if (!source) return [];
  let path;
  try {
    const url = new URL(source);
    if (!/(^|\.)autoimg\.cn$/.test(url.hostname)) return [];
    path = url.pathname;
  } catch {
    return [];
  }
  return widths.map((width) => `${site}/photo${path.replace(/\/\d+x\d+_(?=[^/]*$)/, `/${width}x0_`)}`);
};

const wanted = new Set();
for (const url of listUrls) {
  try {
    for (const car of await listCars(url)) for (const photo of photoPaths(car)) wanted.add(photo);
  } catch (error) {
    console.warn(`[warm] список пропущен: ${error.message}`);
  }
}

const queue = [...wanted];
console.log(`[warm] снимков к проверке: ${queue.length}`);

let hit = 0;
let miss = 0;
let failed = 0;
let bytes = 0;

const worker = async () => {
  for (;;) {
    const url = queue.shift();
    if (!url) return;
    try {
      // Полностью вычитываем ответ: пока тело не дочитано, nginx не положит
      // кадр в кэш. HEAD тут не годится по той же причине.
      const response = await fetch(url, { headers: { "user-agent": headers["user-agent"] } });
      if (!response.ok) {
        failed += 1;
        await response.body?.cancel();
        continue;
      }
      const body = await response.arrayBuffer();
      bytes += body.byteLength;
      if (response.headers.get("x-photo-cache") === "HIT") hit += 1;
      else miss += 1;
    } catch {
      failed += 1;
    }
  }
};

const started = Date.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const seconds = Math.round((Date.now() - started) / 1000);
console.log(
  `[warm] готово за ${seconds} с: было в кэше ${hit}, добавлено ${miss}, не отдалось ${failed}, скачано ${(bytes / 1024 / 1024).toFixed(1)} МБ`,
);
