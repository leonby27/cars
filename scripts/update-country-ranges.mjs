// Обновляет таблицу country_ranges: какие адреса выданы сетям Беларуси и России.
// Запуск: node scripts/update-country-ranges.mjs (или npm run countries).
//
// Зачем: в разделе «Заходы» у каждого захода стоит флаг страны. Страну определяем по
// адресу посетителя в момент записи события, а сам адрес не храним.
//
// Источник — сводный файл RIPE (регистратор адресов Европы и СНГ): в нём каждая выданная
// сеть с кодом страны организации, которой её выдали. Для домашних и мобильных
// операторов это и есть страна посетителя. Кто сидит через VPN, окажется в «Другой».
// Нужны только две страны, поэтому остальной мир в таблицу не кладём: не нашли адрес
// среди этих двух — значит, другая страна.
import { pool } from "../server/db.mjs";

const SOURCE_URL = "https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-extended-latest";
const COUNTRIES = new Set(["BY", "RU"]);
// Страховка от сломанного или урезанного файла: пустой список молча превратил бы всех
// посетителей в «других», и заметили бы это не сразу. Сейчас у России ~13 тыс. сетей,
// у Беларуси ~140.
const MINIMUM_RANGES = { BY: 50, RU: 5000 };
const MINIMUM_SHARE_OF_PREVIOUS = 0.6;
const REQUEST_TIMEOUT_MS = 120_000;

// В файле сеть IPv4 записана началом и числом адресов, и число не всегда степень
// двойки. Базе нужны блоки вида 1.2.3.0/24, поэтому режем диапазон на такие блоки.
const ipv4ToNumber = (address) => address.split(".").reduce((total, part) => total * 256 + Number(part), 0);
const numberToIpv4 = (value) => [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");

export function ipv4RangeToCidrs(start, count) {
  const blocks = [];
  let from = ipv4ToNumber(start);
  let left = Number(count);
  while (left > 0) {
    // Самый большой блок, который начинается с этого адреса и не вылезает за диапазон.
    let size = 1;
    while (from % (size * 2) === 0 && size * 2 <= left) size *= 2;
    blocks.push(`${numberToIpv4(from)}/${32 - Math.log2(size)}`);
    from += size;
    left -= size;
  }
  return blocks;
}

export function parseDelegatedStats(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const [registry, country, type, start, value, , status] = line.split("|");
    if (registry !== "ripencc" || !COUNTRIES.has(country)) continue;
    if (status !== "allocated" && status !== "assigned") continue;
    if (type === "ipv4") for (const network of ipv4RangeToCidrs(start, value)) rows.push([network, country]);
    else if (type === "ipv6") rows.push([`${start}/${value}`, country]);
  }
  return rows;
}

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: { "user-agent": "abcars-countries/1.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`RIPE ответил HTTP ${response.status}`);
  const rows = [...new Map(parseDelegatedStats(await response.text())).entries()];
  const byCountry = Object.fromEntries([...COUNTRIES].map((code) => [code, rows.filter(([, country]) => country === code).length]));
  console.log(`Сетей: Беларусь ${byCountry.BY}, Россия ${byCountry.RU}`);

  const previous = (await pool.query("SELECT count(*)::int AS n FROM country_ranges")).rows[0].n;
  const tooFew = Object.entries(MINIMUM_RANGES).some(([code, minimum]) => byCountry[code] < minimum);
  if (tooFew || (previous && rows.length < previous * MINIMUM_SHARE_OF_PREVIOUS)) {
    console.error(`Сетей слишком мало (${rows.length}, в базе было ${previous}) — таблица оставлена прежней.`);
    process.exitCode = 1;
    return;
  }

  // Переписываем целиком и одной транзакцией, чтобы на время подмены страна не пропадала.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE fresh_countries (network CIDR, country TEXT) ON COMMIT DROP");
    const CHUNK = 500;
    for (let index = 0; index < rows.length; index += CHUNK) {
      const chunk = rows.slice(index, index + CHUNK);
      const values = chunk.map((_, position) => `($${position * 2 + 1}::cidr,$${position * 2 + 2})`).join(",");
      await client.query(`INSERT INTO fresh_countries (network, country) VALUES ${values}`, chunk.flat());
    }
    await client.query("DELETE FROM country_ranges");
    await client.query(`INSERT INTO country_ranges (network, country)
      SELECT DISTINCT ON (network) network, country FROM fresh_countries ORDER BY network, country`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const total = await pool.query("SELECT count(*)::int AS n FROM country_ranges");
  console.log(`В базе сетей: ${total.rows[0].n}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } finally {
    await pool.end();
  }
}
