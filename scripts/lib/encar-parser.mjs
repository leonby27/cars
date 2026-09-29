// Разбор ответов Encar (Корея) в запись каталога.
//
// Площадка отдаёт данные простыми запросами к api.encar.com (с нашего сервера в
// Петербурге; из Беларуси адрес закрыт географическим фильтром CloudFront —
// см. research/encar-2026-09-28/README.md). Три ответа на машину:
//   • список  — GET /search/car/list/premium?q=<фильтр>&sr=|ModifiedDate|<с>|<сколько>
//   • карточка — GET /v1/readside/vehicle/<Id>          (404 — машина снята)
//   • страховая история — GET /v1/readside/record/vehicle/<vehicleId>/summary
//   • осмотр — GET /v1/readside/inspection/vehicle/<vehicleId>
// Здесь только чистый разбор: сеть — в encar-client.mjs, запись — в import-encar.mjs.
//
// Договор записи — IMPORTER.md, раздел Encar: цена в вонах в `sourcePrice` +
// `sourceCurrency: "KRW"` + `usdPrice`, адрес `/cars/kr-<id>`, фото через наш кэш.
import { canonicalImportBrand, canonicalImportName } from "../../config/import-policy.mjs";

export const ENCAR_API = "https://api.encar.com";
export const ENCAR_SITE = "https://fem.encar.com/cars/detail/";
export const ENCAR_PHOTO_ORIGIN = "https://ci.encar.com";
export const ENCAR_PAGE_SIZE = 500;
// Глубже этого смещения список отдаёт одну и ту же страницу — срез надо дробить.
export const ENCAR_MAX_OFFSET = 10_000;

// Наши марки → как марка называется у площадки (значение фильтра Manufacturer).
// Только марки из правил ввоза (config/import-policy.mjs) плюс Genesis и KGM для
// Кореи. Chevrolet, Renault и прочие вычеркнутые не перечислены намеренно.
export const ENCAR_MANUFACTURERS = Object.freeze({
  Hyundai: "현대",
  Kia: "기아",
  Genesis: "제네시스",
  KGM: "KG모빌리티(쌍용)",
  BMW: "BMW",
  "Mercedes-Benz": "벤츠",
  Audi: "아우디",
  Volkswagen: "폭스바겐",
  Tesla: "테슬라",
  Toyota: "도요타",
  Lexus: "렉서스",
  Honda: "혼다",
  Nissan: "닛산",
  Volvo: "볼보",
  Porsche: "포르쉐",
  "Land Rover": "랜드로버",
  MINI: "미니",
  Mazda: "마쯔다",
  BYD: "BYD",
  // Geely у площадки — 16 фургонов SE-A2, легковых нет; Zeekr, Buick, MG — нули.
});

// Английское имя производителя из карточки → наша марка (то, чего не знает словарь
// марок import-policy: у площадки KG Mobility записан одним словом с подчёркиваниями).
const MANUFACTURER_ALIASES = new Map([
  ["kg_mobility_ssangyong", "KGM"],
  ["kg mobility ssangyong", "KGM"],
  ["mini", "MINI"],
]);

export function encarBrand(detail) {
  const english = String(detail?.category?.manufacturerEnglishName || "").trim();
  const korean = String(detail?.category?.manufacturerName || "").trim();
  const alias = MANUFACTURER_ALIASES.get(english.toLocaleLowerCase("en-US"));
  return canonicalImportBrand(alias || english || korean);
}

// Топливо площадки → тип машины и топливо в записи. Чего здесь нет — не возим:
// газ (LPG, LPG+электро, бензин+LPG, CNG), водород, «прочее» — решение Сергея
// 29.09.2026. Слова топлива для записи английские: их читает fuelType() в
// src/engine-spec.js («Diesel» → «Дизель»), у гибрида слово «Hybrid» без
// «gasoline», чтобы гибрид не попадал в фильтр «Бензин».
export const ENCAR_FUELS = Object.freeze({
  "가솔린": { type: "ДВС", fuel: "Gasoline" },
  "디젤": { type: "ДВС", fuel: "Diesel" },
  "가솔린+전기": { type: "Гибрид", fuel: "Hybrid" },
  "디젤+전기": { type: "Гибрид", fuel: "Diesel Hybrid" },
  "전기": { type: "Электромобиль", fuel: "Electric" },
});
export const ENCAR_FUEL_FILTER_VALUES = Object.freeze(Object.keys(ENCAR_FUELS));

export const encarFuel = (fuelName) => ENCAR_FUELS[String(fuelName || "").trim()] || null;

// Коробка передач словами, которые понимает gearboxType() (src/engine-spec.js).
const TRANSMISSIONS = new Map([
  ["오토", "Automatic"],
  ["수동", "Manual"],
  ["세미오토", "Automated manual"],
  ["CVT", "CVT"],
]);

// Цвета площадки → английские значения базы (src/colors.js). Оттенков у площадки
// тридцать, у нас девять фильтров; коричневый и оранжевый в фильтр не попадают,
// но в карточке показываются.
const COLORS = new Map([
  ["흰색", "White"], ["진주색", "White"], ["흰색투톤", "White"], ["진주투톤", "White"],
  ["검정색", "Black"], ["검정투톤", "Black"],
  ["쥐색", "Dark Gray"],
  ["은색", "Silver"], ["은회색", "Silver"], ["명은색", "Silver"], ["은하색", "Silver"], ["은색투톤", "Silver"],
  ["청색", "Blue"], ["하늘색", "Blue"], ["청옥색", "Blue"],
  ["빨간색", "Red"], ["자주색", "Red"],
  ["녹색", "Green"], ["담녹색", "Green"], ["연두색", "Green"],
  ["노란색", "Yellow"],
  ["연금색", "Champagne"], ["금색", "Champagne"], ["금색투톤", "Champagne"], ["갈대색", "Champagne"],
  ["갈색", "Brown"], ["갈색투톤", "Brown"],
  ["주황색", "Orange"],
  ["보라색", "Purple"],
  ["분홍색", "Pink"],
]);

// «Кузов» у площадки — класс по размеру (경차 … 대형차), а не форма. Форму знаем
// только у SUV, минивэнов, спорткаров и грузовиков; остальное решает модель.
const VEHICLE_CLASSES = new Map([
  ["경차", "City car"], ["소형차", "Subcompact"], ["준중형차", "Compact"], ["중형차", "Mid-size"],
  ["대형차", "Full-size"], ["SUV", "SUV"], ["RV", "MPV"], ["스포츠카", "Sports car"],
  ["승합차", "Van"], ["경승합차", "Van"], ["화물차", "Truck"],
]);
const BODY_BY_CLASS = new Map([
  ["SUV", "SUV / кроссовер"], ["RV", "Минивэн"], ["승합차", "Минивэн"], ["경승합차", "Минивэн"], ["스포츠카", "Купе"],
]);
// Грузовики и фургоны (Porter, Bongo, Solati, ST1) — не наш каталог.
const REJECTED_CLASSES = new Set(["화물차"]);

// Форма кузова по модельной группе площадки (корейское имя), когда класс её не
// говорит. Всё, чего здесь нет и что не SUV, — седан: у корейского рынка это
// подавляющее большинство (Grandeur, Sonata, K5, K8, G80, E-Class…).
const SUVS = new Set(["아이오닉5", "아이오닉9", "EV3", "EV5", "EV6", "EV9", "모델 Y", "모델 X", "코나", "베뉴", "캐스퍼", "티볼리", "넥쏘", "스토닉", "셀토스", "쥬크", "Q4 e-트론", "e-트론", "EX30", "C40", "XC40", "iX", "iX1", "iX2", "iX3", "EQA", "EQB", "EQC", "EQE SUV", "EQS SUV", "씨라이언 7 ", "아토 3"]);
const HATCHBACKS = new Set(["모닝", "레이", "i30", "벨로스터", "골프", "폴로", "쿠퍼", "A1", "A3", "1시리즈", "리프", "엑센트", "프라이드", "쏘울", "돌핀", "큐브", "클릭", "야리스(비츠)"]);
const LIFTBACKS = new Set(["아이오닉", "프리우스", "그란투리스모 (GT)", "A5", "A7", "파나메라", "모델 S", "타이칸", "아테온", "CC", "4시리즈"]);
const WAGONS = new Set(["V60", "V90", "i40"]);
const COUPES = new Set(["쿠페", "911", "718", "카이맨", "86", "수프라", "Z4", "AMG GT", "2시리즈", "8시리즈", "스팅어", "TT", "R8", "M2", "M4"]);
const CABRIOS = new Set(["쿠퍼 컨버터블", "박스터", "로드스터", "SL-클래스", "SLK-클래스", "SLC-클래스", "비틀"]);
const MINIVANS = new Set(["카니발", "스타리아", "스타렉스", "쏠라티", "오딧세이", "시에나", "알파드", "LM", "카렌스", "멀티밴", "스프린터", "V-클래스", "PV5", "봉고III 미니버스", "노아", "에스티마", "엘그란드", "비안테"]);

export function encarBodyType(modelGroupName, bodyName) {
  const cls = String(bodyName || "").trim();
  if (BODY_BY_CLASS.has(cls)) return BODY_BY_CLASS.get(cls);
  const group = String(modelGroupName || "").trim();
  if (SUVS.has(group)) return "SUV / кроссовер";
  if (MINIVANS.has(group)) return "Минивэн";
  if (CABRIOS.has(group)) return "Кабриолет";
  if (COUPES.has(group)) return "Купе";
  if (WAGONS.has(group)) return "Универсал";
  if (LIFTBACKS.has(group)) return "Лифтбек";
  if (HATCHBACKS.has(group)) return "Хэтчбек";
  return "Седан";
}

// Привод в имени комплектации: «2.2 4WD», «E220d 4MATIC», «Long Range AWD», «520i».
// Полный привод называется прямо; «2WD» у корейских, японских и большинства
// европейских марок — передний, у Genesis, BMW, Mercedes и Porsche — задний.
// Ничего не сказано — «Не указан», как и у Che168.
const REAR_WHEEL_BRANDS = new Set(["Genesis", "BMW", "Mercedes-Benz", "Porsche", "Lexus", "Tesla"]);
const FRONT_WHEEL_BRANDS = new Set(["Hyundai", "Kia", "KGM", "Toyota", "Honda", "Nissan", "Volvo", "Volkswagen", "Audi", "Mazda", "MINI", "BYD"]);
export function encarDrive(brand, ...gradeNames) {
  const text = gradeNames.filter(Boolean).join(" ");
  if (/\b(AWD|4WD|4MATIC|xDrive|quattro|HTRAC|4Motion|e-Four|Dual Motor|4X4)\b|사륜|풀타임/i.test(text)) return "Полный";
  if (/\bRWD\b|후륜/i.test(text)) return "Задний";
  if (/\bFWD\b|전륜/i.test(text)) return "Передний";
  if (/\b2WD\b/i.test(text)) return REAR_WHEEL_BRANDS.has(brand) ? "Задний" : FRONT_WHEEL_BRANDS.has(brand) ? "Передний" : "";
  return "";
}

// Города-метрополии площадка пишет первым словом адреса («부산 사하구»), остальные —
// вторым после провинции («경기 수원시 권선구»). Берём город без суффикса 시/군:
// именно такие ключи знает src/city-names.js, а зону доставки до Пусана по нему
// считает src/korea-logistics.js.
const METRO_CITIES = new Set(["서울", "부산", "인천", "대구", "광주", "대전", "울산", "세종"]);
export function encarCity(address) {
  const parts = String(address || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (METRO_CITIES.has(parts[0])) return parts[0];
  const city = (parts[1] || parts[0]).replace(/(시|군)$/, "");
  return city || parts[0];
}

// Дата площадки без пояса — это корейское время (UTC+9).
const kstIso = (value) => {
  if (!value) return null;
  const date = new Date(/[Z+]/.test(String(value).slice(10)) ? value : `${value}+09:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const numeric = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// Снимки: кузов снаружи первыми (их же держит на диске хранилище — первые пять кадров),
// затем салон, затем опции; внутри группы — по номеру кадра площадки.
const PHOTO_ORDER = { OUTER: 0, INNER: 1, OPTION: 2 };
export function encarPhotos(detail) {
  const photos = Array.isArray(detail?.photos) ? detail.photos : [];
  return [...photos]
    .filter((photo) => typeof photo?.path === "string" && /^\/[A-Za-z0-9/_.-]+\.jpe?g$/i.test(photo.path))
    .sort((a, b) => (PHOTO_ORDER[a.type] ?? 3) - (PHOTO_ORDER[b.type] ?? 3) || String(a.code).localeCompare(String(b.code)))
    .map((photo) => `${ENCAR_PHOTO_ORIGIN}${photo.path}`);
}

// Число кадров кузова снаружи (нужно соцсетям — см. exteriorPhotos у Che168).
const exteriorCount = (detail) => (Array.isArray(detail?.photos) ? detail.photos.filter((photo) => photo?.type === "OUTER").length : 0);

/**
 * Страховая история (record summary) и осмотр — в короткие поля записи.
 * Оба ответа необязательны: без них машина заводится с пустыми полями.
 */
export function encarHistory(record, inspection) {
  const my = numeric(record?.myAccidentCnt);
  const other = numeric(record?.otherAccidentCnt);
  const accidents = numeric(record?.accidentCnt) ?? (my === null && other === null ? null : (my || 0) + (other || 0));
  const ownerChanges = numeric(record?.ownerChangeCnt);
  const totalLoss = (numeric(record?.totalLossCnt) || 0) + (numeric(record?.floodTotalLossCnt) || 0);
  const master = inspection?.master || null;
  // В API поле называется «accdient» — опечатка площадки, а не наша.
  const inspected = master ? { accident: Boolean(master.accdient ?? master.accident), simpleRepair: Boolean(master.simpleRepair), waterlog: Boolean(master.detail?.waterlog), tuning: Boolean(master.detail?.tuning), state: master.detail?.carStateType?.title || null } : null;
  const claims = accidents === null ? null
    : accidents === 0 ? "Без страховых случаев"
      : `Страховых случаев: ${accidents}${my !== null || other !== null ? ` (по своей вине ${my || 0}, по чужой ${other || 0})` : ""}`;
  const notes = [];
  if (inspected) notes.push(inspected.accident ? "осмотр: было ДТП" : inspected.simpleRepair ? "осмотр: без ДТП, мелкий ремонт" : "осмотр: без ДТП");
  if (inspected?.waterlog) notes.push("затопление");
  if (totalLoss) notes.push("списание по страховке");
  if (ownerChanges !== null) notes.push(`владельцев ${ownerChanges + 1}`);
  return {
    claims,
    claimsCount: accidents,
    owners: ownerChanges === null ? null : ownerChanges + 1,
    transfers: ownerChanges,
    totalLoss: totalLoss > 0,
    inspection: inspected,
    incident: notes.length ? `Encar: ${notes.join(", ")}` : "Отчёт источника может быть неполным",
  };
}

/**
 * Запись каталога из карточки Encar. null — если машину не заводим: снята с продажи,
 * газ/водород/грузовик, нет цены, пробега, года или хотя бы двух снимков.
 *
 * `usdPerKrw` — курс НБРБ (sourceUsdRate("KRW") из src/pricing.js): без него нет
 * `usdPrice`, а от него зависят стрелка цены и «прошлая цена».
 */
export function buildEncarCar(detail, { id = null, record = null, inspection = null, importedAt = new Date().toISOString(), usdPerKrw } = {}) {
  const category = detail?.category;
  const spec = detail?.spec;
  const advertisement = detail?.advertisement;
  if (!category || !spec || !advertisement) return null;
  if (advertisement.status && advertisement.status !== "ADVERTISE") return null;
  // Лизинг и аренда отсеиваются ещё в списке (SellType.일반); в карточке это видно по
  // условиям лизинга — на всякий случай проверяем и здесь.
  if (advertisement.leaseRentInfo) return null;
  if (!Number.isFinite(Number(usdPerKrw)) || Number(usdPerKrw) <= 0) throw new Error("buildEncarCar: usdPerKrw (курс воны) обязателен");
  const fuel = encarFuel(spec.fuelName);
  if (!fuel) return null;
  if (REJECTED_CLASSES.has(String(spec.bodyName || "").trim())) return null;
  const brand = encarBrand(detail);
  const rawModel = String(category.modelGroupEnglishName || category.modelGroupName || "").trim();
  const model = canonicalImportName(brand, rawModel, fuel.type, { source: "Encar", rawSeries: category.modelName, rawModel: category.gradeEnglishName }).model;
  const year = numeric(category.formYear);
  const priceMan = numeric(advertisement.price);
  const mileage = numeric(spec.mileage);
  const images = encarPhotos(detail);
  // Номера объявления в карточке нет — его знает тот, кто карточку запросил. У
  // перевыставленной машины номер объявления лежит в manage.dummyVehicleId, у обычной
  // совпадает с vehicleId; это запасной путь, когда номер не передали.
  const externalId = String(id || (detail.manage?.dummy ? detail.manage?.dummyVehicleId : detail.vehicleId) || "").trim();
  if (!brand || !model || !year || !priceMan || mileage === null || images.length < 2 || !externalId) return null;

  const won = Math.round(priceMan * 10_000);
  const usdPrice = Math.round(won * Number(usdPerKrw));
  const cc = fuel.type === "Электромобиль" ? null : numeric(spec.displacement);
  const engineCc = cc && cc >= 500 && cc <= 8000 ? cc : null;
  const engine = engineCc ? `${(engineCc / 1000).toFixed(1)}L` : null;
  const yearMonth = String(category.yearMonth || "").match(/^(\d{4})(\d{2})$/);
  const registration = yearMonth ? `${yearMonth[1]}-${yearMonth[2]}` : null;
  const history = encarHistory(record, inspection);
  const gradeName = [category.gradeEnglishName || category.gradeName, category.gradeDetailEnglishName || category.gradeDetailName].filter(Boolean).join(" ").trim();
  const city = encarCity(detail.contact?.address);

  return {
    id: `encar-${externalId}`,
    externalId,
    source: "Encar",
    origin: "korea",
    sourceUrl: `${ENCAR_SITE}${externalId}`,
    sourceMarket: "Encar",
    sourceVehicleId: numeric(detail.vehicleId),
    priceBasis: "Vehicle Price",
    sourcePrice: won,
    sourceCurrency: "KRW",
    chinaPrice: won,
    usdPrice,
    originPriceKrw: numeric(category.originPrice) ? Math.round(numeric(category.originPrice) * 10_000) : null,
    brand,
    model,
    rawBrand: String(category.manufacturerName || "").trim(),
    rawSeries: String(category.modelName || "").trim(),
    rawModelGroup: String(category.modelGroupName || "").trim(),
    rawModel: gradeName,
    year,
    firstRegistration: registration,
    // Даты выпуска площадка не даёт; месяц первой регистрации — ближайшее к нему
    // (корейский модельный год бежит вперёд: машина, поставленная на учёт в декабре
    // 2020-го, продаётся как 2021 года), а возраст для растаможки считается по нему.
    manufactureDate: registration,
    mileage,
    city,
    owners: history.owners,
    transfers: history.transfers,
    conditionGrade: null,
    claims: history.claims,
    claimsCount: history.claimsCount,
    totalLoss: history.totalLoss,
    inspection: history.inspection,
    incident: history.incident,
    description: gradeName,
    title: `${brand} ${model} ${year}`,
    type: fuel.type,
    sourceFuelType: fuel.fuel,
    drive: encarDrive(brand, category.gradeEnglishName, category.gradeName) || "Не указан",
    battery: null,
    batteryType: null,
    electricRange: null,
    combinedRange: null,
    range: null,
    horsepower: null,
    engine,
    engineCc,
    transmission: TRANSMISSIONS.get(String(spec.transmissionName || "").trim()) || null,
    bodyColor: COLORS.get(String(spec.colorName || "").trim()) || null,
    vehicleClass: VEHICLE_CLASSES.get(String(spec.bodyName || "").trim()) || null,
    bodyType: encarBodyType(category.modelGroupName, spec.bodyName),
    seats: numeric(spec.seatCount),
    doors: null,
    dimensions: null,
    curbWeight: null,
    vin: detail.vin || null,
    warrantyMonths: numeric(category.warranty?.bodyMonth),
    image: images[0],
    images,
    exteriorPhotos: exteriorCount(detail),
    sourceListedAt: kstIso(detail.manage?.firstAdvertisedDateTime) || kstIso(detail.manage?.registDateTime),
    sourceModifiedAt: kstIso(detail.manage?.modifyDateTime),
    importedAt,
    checkedAt: importedAt,
    originalLanguage: "ko",
  };
}

// ---------- Списки ----------

// Фильтр списка на языке площадки. Год — по месяцу регистрации (YYYYMM), цена в
// 만원 (10 000 вон). `FormYear` фильтром не работает (404), поэтому модельный год
// проверяется по карточке.
export function encarListQuery({ manufacturer, modelGroup, yearFrom, yearTo, priceMin, priceMax, fuel, sellType = "일반" } = {}) {
  const parts = ["Hidden.N"];
  if (manufacturer) parts.push(`Manufacturer.${manufacturer}`);
  if (modelGroup) parts.push(`ModelGroup.${modelGroup}`);
  // Границы диапазона — обе: с одной открытой стороной площадка отвечает пусто.
  if (yearFrom || yearTo) parts.push(`Year.range(${yearFrom || 1990}00..${yearTo || new Date().getFullYear() + 1}12)`);
  if (priceMin || priceMax) parts.push(`Price.range(${priceMin || 0}..${priceMax || 999_999})`);
  if (fuel) parts.push(`FuelType.${fuel}`);
  if (sellType) parts.push(`SellType.${sellType}`);
  return `(And.${parts.join("._.")}.)`;
}

export const encarListUrl = (query, offset = 0, count = ENCAR_PAGE_SIZE, { facets = false } = {}) =>
  `${ENCAR_API}/search/car/list/premium?count=true&q=${encodeURIComponent(query)}${facets ? `&inav=${encodeURIComponent("|Metadata|Sort")}` : ""}&sr=${encodeURIComponent(`|ModifiedDate|${offset}|${count}`)}`;

export const encarDetailUrl = (id) => `${ENCAR_API}/v1/readside/vehicle/${id}`;
export const encarRecordUrl = (vehicleId) => `${ENCAR_API}/v1/readside/record/vehicle/${vehicleId}/summary`;
export const encarInspectionUrl = (vehicleId) => `${ENCAR_API}/v1/readside/inspection/vehicle/${vehicleId}`;

/** Модельные группы производителя из ответа с фасетами (`&inav=|Metadata|Sort`). */
export function encarModelGroups(listJson) {
  const groups = new Map();
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (node?.DisplayName === "모델그룹") {
        for (const facet of node.Facets || []) {
          const count = Number(facet.Count) || 0;
          if (facet.Value && count > 0) groups.set(String(facet.Value), Math.max(groups.get(String(facet.Value)) || 0, count));
        }
      }
      for (const facet of node?.Facets || []) walk(facet?.Refinements?.Nodes);
      walk(node?.Nodes);
    }
  };
  walk(listJson?.iNav?.Nodes);
  return [...groups].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/**
 * Кандидат из строки списка: номер, год, топливо, цена. null — если по строке уже
 * видно, что машина не наша (газ, лизинг, старше границы).
 */
export function encarCandidate(item, { minYear = 2020 } = {}) {
  const externalId = String(item?.Id || "").trim();
  if (!externalId) return null;
  const fuel = encarFuel(item.FuelType);
  if (!fuel) return { externalId, skip: "fuel" };
  if (item.SellType && item.SellType !== "일반") return { externalId, skip: "sellType" };
  const year = numeric(item.FormYear) || Math.floor((numeric(item.Year) || 0) / 100) || null;
  if (year && year < minYear) return { externalId, skip: "year" };
  return {
    externalId,
    year,
    type: fuel.type,
    priceMan: numeric(item.Price),
    manufacturer: String(item.Manufacturer || ""),
    modelGroup: String(item.Model || ""),
    modifiedAt: item.ModifiedDate || null,
  };
}
