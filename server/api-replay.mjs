// Ответы API прямо из базы — для страниц, которые сервер рисует приложением.
//
// Блоки с живыми данными (подборки журнала, сводки сравнений, справочник марок) в
// браузере сами ходят в API. Чтобы готовая страница несла те же данные, сервер
// рисует её дважды: первый проход записывает спрошенные адреса (src/boot-api.js),
// здесь на них находятся ответы — те же функции, что стоят за /api в handler.mjs, —
// второй проход рисует страницу уже с ними, а браузер получает их в window.__boot.api.
import { brandCatalogGuide, brandStock, getCatalogMeta, getModelFacts, listCars, modelPriceStats, modelPriceStatsForQuota, modelSummary } from "./repository.mjs";
import { marketComparison } from "./market-compare-data.mjs";

// Адрес → ответ. Только чтение и только то, что нужно заранее собранным страницам.
// Машины списка — облегчённо: карточка показывает не больше пяти кадров
// (HoverImagePreview), история цены в браузере не нужна. Ответ целиком (у машины бывает
// сорок снимков) раздувал страницу подборки до полумегабайта; свежий полный ответ
// браузер всё равно получает своим запросом сразу после оживления.
const lightList = (answer) => (answer?.items ? { ...answer, items: answer.items.map(({ priceHistory: _history, ...car }) => ({ ...car, images: Array.isArray(car.images) ? car.images.slice(0, 5) : car.images })) } : answer);

const RESOLVERS = [
  ["/api/cars", async (params) => lightList(await listCars(params))],
  ["/api/cars/summary", (params) => modelSummary(params)],
  ["/api/catalog/meta", (params) => getCatalogMeta(params.get("type"), params.get("brand"), params.getAll("bodyType"))],
  ["/api/model-facts", () => getModelFacts()],
  ["/api/brand-guide", (params) => brandCatalogGuide(params.get("brand"))],
  // Сравнение с белорусским рынком — так же, как в handler.mjs.
  ["/api/market/compare", (params) => {
    const quotaMode = params.get("quota");
    const stats = quotaMode === "on" ? () => modelPriceStatsForQuota(true) : quotaMode === "off" ? () => modelPriceStatsForQuota(false) : modelPriceStats;
    return marketComparison(stats, brandStock, quotaMode || "full");
  }],
];

/**
 * Ответ по адресу в том виде, в каком его получил бы браузер (прогон через JSON: даты
 * становятся строками), или undefined — адрес не из списка или запрос не удался.
 */
export async function resolveApi(url) {
  let parsed;
  try {
    parsed = new URL(url, "http://local");
  } catch {
    return undefined;
  }
  const resolver = RESOLVERS.find(([path]) => path === parsed.pathname)?.[1];
  if (!resolver) return undefined;
  try {
    const value = await resolver(parsed.searchParams);
    return value === undefined || value === null ? value : JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.error(`готовая страница: ответ ${url} не получен`, error);
    return undefined;
  }
}

/**
 * Рисует страницу, пока ей не перестанут требоваться новые ответы (обычно два прохода,
 * не больше трёх). `render(api)` — отрисовка с данным словарем ответов; адреса, о
 * которых она спрашивает, приходят через window.__bootRecord.
 */
export async function renderWithApi(render, { passes = 3 } = {}) {
  const api = {};
  const scope = globalThis.window || (globalThis.window = {});
  let markup = null;
  for (let pass = 0; pass < passes; pass += 1) {
    const asked = new Set();
    scope.__bootRecord = (url) => asked.add(url);
    try {
      markup = render(api);
    } finally {
      delete scope.__bootRecord;
    }
    const missing = [...asked].filter((url) => !(url in api));
    if (!missing.length) break;
    const answers = await Promise.all(missing.map((url) => resolveApi(url)));
    // Адрес без ответа помечаем, чтобы не спрашивать его снова на следующем проходе:
    // блок тогда просто нарисуется в состоянии «загружаем», как без готовой страницы.
    let added = 0;
    missing.forEach((url, index) => {
      if (answers[index] !== undefined) {
        api[url] = answers[index];
        added += 1;
      }
    });
    if (!added) break;
  }
  return { markup, api };
}
