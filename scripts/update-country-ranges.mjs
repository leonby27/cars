// Обновляет таблицу country_ranges по статистике всех пяти регистраторов адресов.
// Запуск: node scripts/update-country-ranges.mjs (или npm run countries).
//
// Зачем: в разделе «Заходы» у каждого захода стоит флаг страны. Страну определяем по
// адресу посетителя в момент записи события, а сам адрес не храним.
//
// Это страна регистрации сети, а не гарантированное местоположение человека.
// Для VPN/прокси будет показана страна выходной сети. Незнакомые адреса остаются other.
import { pool } from "../server/db.mjs";
import { isIP } from "node:net";
import { VISIT_COUNTRY_CODES } from "../src/analytics-countries.js";

export const COUNTRY_SOURCES = [
  { registry:"ripencc", url:"https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-extended-latest", minimum:10000 },
  { registry:"arin", url:"https://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest", minimum:10000 },
  { registry:"apnic", url:"https://ftp.apnic.net/stats/apnic/delegated-apnic-extended-latest", minimum:10000 },
  { registry:"afrinic", url:"https://ftp.afrinic.net/pub/stats/afrinic/delegated-afrinic-extended-latest", minimum:1000 },
  { registry:"lacnic", url:"https://ftp.lacnic.net/pub/stats/lacnic/delegated-lacnic-extended-latest", minimum:1000 },
];
const REGISTRIES = new Set(COUNTRY_SOURCES.map(({ registry }) => registry));
// Страховка от сломанного или урезанного файла: пустой список молча превратил бы всех
// посетителей в «других», и заметили бы это не сразу. Сейчас у России ~13 тыс. сетей,
// у Беларуси ~140.
const MINIMUM_RANGES = { BY:50, RU:5000, US:5000, CA:500, DE:1000, PL:500 };
const MINIMUM_SHARE_OF_PREVIOUS = 0.6;
const REQUEST_TIMEOUT_MS = 120_000;

// В файле сеть IPv4 записана началом и числом адресов, и число не всегда степень
// двойки. Базе нужны блоки вида 1.2.3.0/24, поэтому режем диапазон на такие блоки.
const ipv4ToNumber = (address) => address.split(".").reduce((total, part) => total * 256 + Number(part), 0);
const numberToIpv4 = (value) => [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");

export function ipv4RangeToCidrs(start, count) {
  if (isIP(start) !== 4 || !Number.isSafeInteger(Number(count)) || Number(count) <= 0
      || ipv4ToNumber(start) + Number(count) > 2 ** 32) throw new Error("Invalid IPv4 allocation");
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

export function parseDelegatedStats(text, expectedRegistry = null) {
  const rows = [];
  for (const line of text.split("\n")) {
    const [registry, country, type, start, value, , status] = line.split("|");
    if (!REGISTRIES.has(registry) || (expectedRegistry && registry !== expectedRegistry) || !VISIT_COUNTRY_CODES.has(country)) continue;
    if (status !== "allocated" && status !== "assigned") continue;
    if (type === "ipv4") for (const network of ipv4RangeToCidrs(start, value)) rows.push([network, country]);
    else if (type === "ipv6") {
      if (isIP(start) !== 6 || !/^\d+$/.test(value) || Number(value) > 128) throw new Error("Invalid IPv6 allocation");
      rows.push([`${start}/${Number(value)}`, country]);
    }
  }
  return rows;
}

export async function loadCountryRanges({ fetchImpl = fetch, sources = COUNTRY_SOURCES } = {}) {
  const results = await Promise.allSettled(sources.map(async ({ registry, url, minimum }) => {
    const response = await fetchImpl(url, {
      headers: { "user-agent": "abcars-countries/2.0" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${registry}: HTTP ${response.status}`);
    const rows = parseDelegatedStats(await response.text(), registry);
    if (rows.length < minimum) throw new Error(`${registry}: неполный список сетей (${rows.length})`);
    return rows;
  }));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map(({ reason }) => reason), "Не все источники стран готовы — таблица оставлена прежней");
  return [...new Map(results.flatMap(({ value }) => value)).entries()];
}

export function validateCountryRanges(rows, previous = 0) {
  const byCountry = {};
  for (const [, country] of rows) byCountry[country] = (byCountry[country] || 0) + 1;
  const tooFew = Object.entries(MINIMUM_RANGES).some(([code, minimum]) => (byCountry[code] || 0) < minimum);
  if (tooFew || (previous && rows.length < previous * MINIMUM_SHARE_OF_PREVIOUS)) {
    throw new Error(`Сетей слишком мало (${rows.length}, в базе было ${previous}) — таблица оставлена прежней.`);
  }
  return byCountry;
}

async function main() {
  const rows = await loadCountryRanges();
  const previous = (await pool.query("SELECT count(*)::int AS n FROM country_ranges")).rows[0].n;
  const byCountry = validateCountryRanges(rows, previous);
  console.log(`Сетей: ${rows.length}; стран: ${Object.keys(byCountry).length}`);

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
