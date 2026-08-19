// Обновляет курсы НБРБ в src/pricing.js из открытого API Нацбанка.
// Запуск: node scripts/update-rates.mjs (или npm run rates).
// Ничего не пишет, если курс не изменился; падает с ошибкой, если API
// отдал что-то подозрительное — тогда в файле остаются прежние значения.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const pricingPath = fileURLToPath(new URL("../src/pricing.js", import.meta.url));

const fetchRate = async (code) => {
  const response = await fetch(`https://api.nbrb.by/exrates/rates/${code}?parammode=2`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`НБРБ не ответил по ${code}: HTTP ${response.status}`);
  const data = await response.json();
  const perOne = Number(data.Cur_OfficialRate) / Number(data.Cur_Scale || 1);
  if (!Number.isFinite(perOne) || perOne <= 0) throw new Error(`НБРБ отдал пустой курс по ${code}`);
  return { perOne, date: String(data.Date || "").slice(0, 10) };
};

const [usd, cny, eur] = await Promise.all(["USD", "CNY", "EUR"].map(fetchRate));

// Диапазоны здравого смысла: если Нацбанк вдруг отдаст мусор (смена формата,
// ошибка на их стороне), лучше остаться на вчерашнем курсе, чем переписать
// цены всего каталога в разы.
const sane = (value, min, max, name) => {
  if (value < min || value > max) throw new Error(`Курс ${name} = ${value} вне ожидаемого диапазона ${min}–${max}, файл не трогаем`);
};
sane(usd.perOne, 2, 6, "USD");
sane(cny.perOne, 0.2, 1, "CNY");
sane(eur.perOne, 2, 7, "EUR");

const [year, month, day] = usd.date.split("-");
const rateDate = `${day}.${month}.${year}`;

const next = {
  usdByn: Number(usd.perOne.toFixed(4)),
  cnyBynPer10: Number((cny.perOne * 10).toFixed(4)),
  eurByn: Number(eur.perOne.toFixed(4)),
};

const source = await readFile(pricingPath, "utf8");
let updated = source
  .replace(/usdByn:\s*[\d.]+/, `usdByn:${next.usdByn}`)
  .replace(/cnyBynPer10:\s*[\d.]+/, `cnyBynPer10:${next.cnyBynPer10}`)
  .replace(/eurByn:\s*[\d.]+/, `eurByn:${next.eurByn}`)
  .replace(/rateDate:\s*"[^"]*"/, `rateDate:"${rateDate}"`);

for (const key of ["usdByn", "cnyBynPer10", "eurByn", "rateDate"]) {
  if (!updated.includes(`${key}:`)) throw new Error(`В pricing.js не нашлось поле ${key} — формат файла изменился, обновите скрипт`);
}

if (updated === source) {
  console.log(`Курс НБРБ на ${rateDate} уже актуален, файл не менялся.`);
} else {
  await writeFile(pricingPath, updated);
  console.log(`Курс НБРБ обновлён на ${rateDate}: USD ${next.usdByn}, CNY(за 10) ${next.cnyBynPer10}, EUR ${next.eurByn}.`);
}
