// Сравнение цен с белорусским рынком для приложения.
//
// Половинки сравнения живут в разных местах, и это не случайность:
//   • чужие объявления — файл `data/market-belarus-detailed.json`, его собирают руками
//     с домашней сети (площадка блокирует адреса дата-центров), меняется раз в квартал;
//   • наши цены — база, она меняется каждую ночь вместе с курсом и составом каталога.
//
// Поэтому свод читаем с диска один раз, а цены каталога спрашиваем у базы и держим
// в памяти десять минут: страницу открывают редко, но подряд (человек, потом робот
// поисковика), и гонять тяжёлый запрос на каждый заход незачем.
//
// Правила отбора и подписи — в src/market-compare.js, общие с версией для поисковика:
// иначе страница для человека и страница в выдаче показывали бы разные числа.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareDetailedRows, groupDetailedRows } from "../src/market-compare.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketPath = path.join(root, "data", "market-belarus-detailed.json");

const TTL_MS = 10 * 60 * 1000;
const cache = new Map();
let marketFile;

/** Свод площадки с диска. Нет файла — сравнения просто нет, это не ошибка. */
async function readMarket() {
  if (marketFile !== undefined) return marketFile;
  try {
    marketFile = JSON.parse(await readFile(marketPath, "utf8"));
  } catch {
    marketFile = null;
  }
  return marketFile;
}

/**
 * @param {Function} stats — `modelPriceStats` из репозитория; передаётся снаружи,
 *   чтобы этот модуль не тянул за собой соединение с базой в тестах.
 * @param {Function} stock — `brandStock`: сколько машин каждой марки в каталоге. Нужен,
 *   чтобы показать и те марки, по которым сравнивать не с чем: человек ищет свою
 *   машину, и её отсутствие в списке он прочитает как «не возят».
 */
export async function marketComparison(stats, _stock, cacheKey = "full") {
  const now = Date.now();
  const known = cache.get(cacheKey);
  if (known?.value && now - known.at < TTL_MS) return known.value;
  const market = await readMarket();
  if (!market) {
    const value = { cards: [], collectedAt: null, mileageLimits: [] };
    cache.set(cacheKey, { at:now, value });
    return value;
  }
  const cards = groupDetailedRows(compareDetailedRows({ ours: await stats(), market }));
  const value = { cards, collectedAt: market.collectedAt || null, mileageLimits:market.mileageLimits || [] };
  cache.set(cacheKey, { at:now, value });
  return value;
}
