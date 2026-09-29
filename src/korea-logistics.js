// Доставка из Кореи: перегон до порта, море до Владивостока, суша до Минска.
//
// Маршрут для Беларуси один: продавец → порт Пусан (реже Инчхон) → паром или контейнер
// до Владивостока → автовоз или ж/д по России до Минска. Прямого моря в Клайпеду или
// Санкт-Петербург для одной машины не берут: дольше и дороже. Ставки ниже — оценки по
// открытым тарифам перевозчиков Корея → Россия/Беларусь (осень 2026), не данные
// Сергея; уточняются в research/korea-logistics-2026-09-29.md.
//
// Устройство то же, что у src/china-logistics.js: зоны по удалённости от порта,
// ставка [низ, верх] в долларах и дни, чтобы расчёт цены и сроков считал обе страны
// одним кодом.
export const KOREA_TRANSIT_ZONES = {
  busan: { label: "Пусан и юго-восток", usd: [50, 150], days: [1, 2] },
  south: { label: "юг Кореи", usd: [100, 200], days: [1, 2] },
  seoul: { label: "Сеул и столичный регион", usd: [150, 300], days: [1, 3] },
  other: { label: "остальная Корея", usd: [150, 300], days: [1, 3] },
};

// Сроки остальных этапов, дни [низ, верх]: экспортные документы и снятие с учёта
// (в Корее это быстро — реестр электронный), ожидание судна и море до Владивостока,
// выгрузка в порту и путь по России до Минска, склад в Минске.
export const KOREA_STAGE_DAYS = {
  buyout: [6, 10], // выкуп, снятие с учёта, экспортное свидетельство, ожидание рейса
  sea: [3, 7], // переход Пусан → Владивосток с ожиданием у причала
  intl: [27, 41], // выгрузка, оформление транзита, автовоз или ж/д до Минска
  svh: [3, 5], // разгрузка, оформление и выдача на СВХ
};

// Город неизвестен — считаем столичный регион: там продаётся большинство машин, а
// разница между зонами укладывается в $150.
export const DEFAULT_KOREA_ZONE = "seoul";

// Названия регионов и городов так, как их отдаёт площадка (латиницей и по-корейски).
const ZONE_CITIES = {
  busan: ["busan", "부산", "ulsan", "울산", "gimhae", "김해", "changwon", "창원", "yangsan", "양산"],
  south: ["daegu", "대구", "gwangju", "광주", "jeonju", "전주", "pohang", "포항", "gyeongju", "경주", "jinju", "진주", "yeosu", "여수", "suncheon", "순천", "mokpo", "목포", "gyeongnam", "경남", "gyeongbuk", "경북", "jeonnam", "전남", "jeonbuk", "전북"],
  seoul: ["seoul", "서울", "incheon", "인천", "gyeonggi", "경기", "suwon", "수원", "seongnam", "성남", "yongin", "용인", "goyang", "고양", "bucheon", "부천", "anyang", "안양", "hwaseong", "화성", "ansan", "안산", "namyangju", "남양주", "pyeongtaek", "평택", "uijeongbu", "의정부", "gimpo", "김포"],
};

const CITY_ZONE = new Map();
for (const [zone, cities] of Object.entries(ZONE_CITIES)) {
  for (const city of cities) CITY_ZONE.set(city, zone);
}

/** Зона доставки до порта по городу или региону продавца. */
export function koreaTransitZone(city) {
  const text = String(city || "").trim().toLowerCase();
  if (!text) return DEFAULT_KOREA_ZONE;
  for (const [name, zone] of CITY_ZONE) {
    if (text === name || text.startsWith(`${name} `) || text.startsWith(`${name}-`) || text.includes(name)) return zone;
  }
  return DEFAULT_KOREA_ZONE;
}

/** Ставка и срок перегона до порта для города продавца. */
export function koreaTransitFor(city) {
  const zone = koreaTransitZone(city);
  return { zone, ...KOREA_TRANSIT_ZONES[zone] };
}

/** Сроки доставки из Кореи по этапам — тот же вид ответа, что у estimateDeliveryDays для Китая. */
export function estimateKoreaDeliveryDays(city) {
  const transit = koreaTransitFor(city);
  const intl = [KOREA_STAGE_DAYS.sea[0] + KOREA_STAGE_DAYS.intl[0], KOREA_STAGE_DAYS.sea[1] + KOREA_STAGE_DAYS.intl[1]];
  const stages = [KOREA_STAGE_DAYS.buyout, transit.days, intl, KOREA_STAGE_DAYS.svh];
  return {
    buyoutDays: KOREA_STAGE_DAYS.buyout,
    chinaDays: transit.days,
    intlDays: intl,
    svhDays: KOREA_STAGE_DAYS.svh,
    totalDays: [stages.reduce((sum, [low]) => sum + low, 0), stages.reduce((sum, [, high]) => sum + high, 0)],
  };
}
