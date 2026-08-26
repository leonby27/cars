// Обновляет список адресов облачных хостингов в таблице datacenter_ranges.
// Запуск: node scripts/update-datacenter-ranges.mjs (или npm run ranges).
//
// Зачем: роботы, которые подделывают подпись браузера и изображают поведение живого
// человека, сидят на арендованных серверах. Отличить их по подписи или поведению уже
// нельзя, а по адресу — можно: диапазоны своих сетей крупные провайдеры публикуют
// сами. Настоящий посетитель с адреса дата-центра приходит крайне редко.
//
// Кого сюда НЕ добавлять: домашних и мобильных операторов (за одним их адресом сидят
// тысячи живых людей) и сети Cloudflare — через них ходит их же VPN, то есть обычные
// посетители.
//
// Часть провайдеров отдаёт готовый файл со своими сетями, остальных спрашиваем через
// RIPE: у каждого хостинга есть номер сети (AS), а RIPE знает, какие диапазоны с него
// объявлены. Новый хостинг добавляется одной строчкой в список ниже.
import { pool } from "../server/db.mjs";

const PUBLISHED = [
  {
    provider: "Amazon",
    url: "https://ip-ranges.amazonaws.com/ip-ranges.json",
    parse: (data) => [
      ...(data.prefixes || []).map((item) => item.ip_prefix),
      ...(data.ipv6_prefixes || []).map((item) => item.ipv6_prefix),
    ],
  },
  {
    // goog.json — все сети Google, включая ту, с которой ходят его собственные
    // проверялки; cloud.json — арендуемые мощности Google Cloud.
    provider: "Google",
    url: "https://www.gstatic.com/ipranges/goog.json",
    parse: (data) => googlePrefixes(data),
  },
  {
    provider: "Google Cloud",
    url: "https://www.gstatic.com/ipranges/cloud.json",
    parse: (data) => googlePrefixes(data),
  },
  {
    provider: "Oracle Cloud",
    url: "https://docs.oracle.com/en-us/iaas/tools/public_ip_ranges.json",
    parse: (data) => (data.regions || []).flatMap((region) => (region.cidrs || []).map((item) => item.cidr)),
  },
];

const googlePrefixes = (data) => (data.prefixes || [])
  .map((item) => item.ipv4Prefix || item.ipv6Prefix)
  .filter(Boolean);

// Номера сетей хостингов, у которых готового файла нет. Порядок — по тому, как часто
// они попадались в логах сайта.
const HOSTING_ASNS = [
  [45102, "Alibaba Cloud"],
  [37963, "Alibaba Cloud"],
  [14061, "DigitalOcean"],
  [12876, "Scaleway"],
  [16276, "OVH"],
  [24940, "Hetzner"],
  [20473, "Vultr"],
  [63949, "Akamai Linode"],
  [51167, "Contabo"],
  [8075, "Microsoft Azure"],
  [132203, "Tencent Cloud"],
  [45090, "Tencent Cloud"],
  [55990, "Huawei Cloud"],
  [136907, "Huawei Cloud"],
  [9009, "M247"],
  [36352, "ColoCrossing"],
  [53667, "FranTech"],
  [197540, "netcup"],
  [47583, "Hostinger"],
  [49505, "Selectel"],
  [200000, "Hostinger"],
  [39486, "HostRoyale"],
  [133499, "HostRoyale"],
  [26496, "GoDaddy"],
  [35916, "Multacom"],
  [62904, "Eonix"],
  [64286, "LogicWeb"],
  [18779, "EGIHosting"],
];

// Ниже этого числа диапазонов считаем, что источники не ответили как надо, и таблицу
// не трогаем: пустой список молча выключил бы защиту, и это заметили бы не сразу.
// Вторая страховка — сравнение с тем, что уже лежит в базе: если новый список вдруг
// сильно короче прежнего, значит часть источников промолчала, и подменять не надо.
const MINIMUM_RANGES = 5000;
const MINIMUM_SHARE_OF_PREVIOUS = 0.6;
const REQUEST_TIMEOUT_MS = 60_000;

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "abcars-ranges/1.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const fromPublished = async (source) => {
  const prefixes = source.parse(await fetchJson(source.url));
  if (!prefixes.length) throw new Error("список пуст — разметка источника изменилась");
  return prefixes.map((network) => [network, source.provider]);
};

const fromAsn = async (asn, provider) => {
  const data = await fetchJson(`https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS${asn}`);
  const prefixes = (data.data?.prefixes || []).map((item) => item.prefix).filter(Boolean);
  if (!prefixes.length) throw new Error("RIPE не знает диапазонов этой сети");
  return prefixes.map((network) => [network, provider]);
};

const collected = new Map();
const failures = [];

const collect = async (label, load) => {
  try {
    const rows = await load();
    for (const [network, provider] of rows) if (!collected.has(network)) collected.set(network, provider);
    console.log(`${label}: ${rows.length}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.error(`${label}: не получилось — ${error.message}`);
  }
};

for (const source of PUBLISHED) await collect(source.provider, () => fromPublished(source));
for (const [asn, provider] of HOSTING_ASNS) await collect(`${provider} (AS${asn})`, () => fromAsn(asn, provider));

const rows = [...collected];
console.log(`Всего диапазонов: ${rows.length}, источников не ответило: ${failures.length}`);

const previous = (await pool.query("SELECT count(*)::int AS n FROM datacenter_ranges")).rows[0].n;
if (rows.length < MINIMUM_RANGES || (previous && rows.length < previous * MINIMUM_SHARE_OF_PREVIOUS)) {
  console.error(`Диапазонов слишком мало (${rows.length}, в базе было ${previous}) — таблица оставлена прежней.`);
  await pool.end();
  process.exit(1);
}

// Таблицу переписываем целиком и одной транзакцией: провайдеры сети и добавляют,
// и отдают обратно, а на время подмены защита не должна проваливаться.
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("CREATE TEMP TABLE fresh_ranges (network CIDR, provider TEXT) ON COMMIT DROP");
  const CHUNK = 500;
  for (let index = 0; index < rows.length; index += CHUNK) {
    const chunk = rows.slice(index, index + CHUNK);
    const values = chunk.map((_, position) => `($${position * 2 + 1}::cidr,$${position * 2 + 2})`).join(",");
    await client.query(`INSERT INTO fresh_ranges (network, provider) VALUES ${values}`, chunk.flat());
  }
  await client.query("DELETE FROM datacenter_ranges");
  await client.query(`INSERT INTO datacenter_ranges (network, provider)
    SELECT DISTINCT ON (network) network, provider FROM fresh_ranges ORDER BY network, provider`);
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
}

const total = await pool.query("SELECT count(*)::int AS n FROM datacenter_ranges");
console.log(`В базе диапазонов: ${total.rows[0].n}`);
await pool.end();
