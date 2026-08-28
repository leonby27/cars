/**
 * Прогрев кэша данных.
 *
 * Готовые ответы каталога nginx держит у себя, и на прогретом кэше все запросы главной
 * укладываются в четверть секунды. Мимо кэша те же запросы занимают около четырёх секунд:
 * справочник фильтров считается по всему каталогу (1,2–1,5 с каждый), а на двух ядрах
 * четыре таких запроса встают в очередь. Замер 28.08.2026 на боевом сервере.
 *
 * Холодный кэш случается в двух случаях: выкладка стирает его целиком (`abcars-deploy.sh`)
 * и запись пропадает после долгого затишья. Молодому сайту с редкими заходами это значит,
 * что холодный ответ достаётся не первому посетителю из тысячи, а заметной их части.
 *
 * Поэтому после каждой выкладки и раз в несколько минут просим у своего же сайта ровно
 * те адреса, которые запрашивает главная и каталог. Список собирается из того же
 * справочника материалов, что читает страница, — промо-блоки поменяются, прогрев
 * пойдёт за ними сам.
 *
 * Прогрев фотографий — отдельная задача, см. scripts/warm-photos.mjs.
 */
import { homeBlogPosts, blogApiParams, blogPostSides, blogHighlightSort } from "../src/blog-posts.js";

const site = process.env.WARM_ORIGIN || "https://abcars.by";
const timeoutMs = 30000;

// Запросы, которые страница отправляет всегда: список витрины, одна карточка для
// каталога и справочник фильтров — общий и по каждому типу топлива, как в index.html.
const fixedPaths = () => [
  "/api/cars?limit=60&sort=variety",
  "/api/cars?limit=1&sort=newest",
  "/api/catalog/meta",
  ...["Электромобиль", "Гибрид", "ДВС"].map((type) => `/api/catalog/meta?${new URLSearchParams({ type })}`),
];

// Промо-блоки главной. У сравнения по три запроса на сторону, у подборки — один на
// обложку и два на края полосы с цифрами; те же самые, что собирает приложение.
const promoPaths = () => {
  const paths = [];
  for (const post of homeBlogPosts()) {
    const sides = blogPostSides(post);
    if (sides.length) {
      for (const side of sides) {
        paths.push(`/api/cars/summary?${blogApiParams(side)}`);
        paths.push(`/api/cars?${blogApiParams(side, { sort: "price_asc", limit: 1 })}`);
        paths.push(`/api/cars?${blogApiParams(side, { sort: "range_desc", limit: 5 })}`);
      }
      continue;
    }
    paths.push(`/api/cars?${blogApiParams(post, { sort: "price_desc", limit: 1 })}`);
    paths.push(`/api/cars?${blogApiParams(post, { sort: "price_asc", limit: 1 })}`);
    const highlightSort = blogHighlightSort(post);
    if (highlightSort) paths.push(`/api/cars?${blogApiParams(post, { sort: highlightSort, limit: 5 })}`);
  }
  return paths;
};

const warm = async (path) => {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${site}${path}`, { signal: controller.signal, headers: { "user-agent": "abcars-warm-api/1.0" } });
    await response.arrayBuffer();
    return { path, ms: Date.now() - started, status: response.status, cache: response.headers.get("x-cache-status") || "-" };
  } catch (error) {
    return { path, ms: Date.now() - started, status: error.name === "AbortError" ? "таймаут" : error.message, cache: "-" };
  } finally {
    clearTimeout(timer);
  }
};

// По три за раз: на двух ядрах холодные запросы иначе встают в очередь друг за другом
// и прогрев занимает дольше, чем сам по себе холодный ответ посетителю.
const run = async () => {
  const paths = [...new Set([...fixedPaths(), ...promoPaths()])];
  const results = [];
  const queue = [...paths];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const path = queue.shift();
      results.push(await warm(path));
    }
  });
  const started = Date.now();
  await Promise.all(workers);
  const cold = results.filter((row) => row.cache === "MISS" || row.cache === "EXPIRED").length;
  const failed = results.filter((row) => row.status !== 200);
  for (const row of failed) console.error(`  не прогрелось: ${row.path} → ${row.status}`);
  console.log(`Прогрев данных: ${results.length} адресов за ${((Date.now() - started) / 1000).toFixed(1)} с, из них холодными были ${cold}, неудач ${failed.length}.`);
  // Неудача прогрева не должна ронять выкладку: сайт работает и без него, просто первый
  // посетитель подождёт. Молчим кодом возврата, шумим текстом.
  process.exit(0);
};

run();
