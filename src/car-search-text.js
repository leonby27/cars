// Свободный поиск по карточке целиком: комплектация, характеристики, город.
//
// На сервере эта же строка собирается в базе (db/migrations/035_listing_search_text.sql)
// и лежит рядом с объявлением — иначе каждый запрос перечитывал бы весь каталог.
// Здесь — тот же набор полей для запасного режима, когда сервер недоступен и каталог
// отбирается прямо в браузере. Совпадение наборов проверяется тестами; при добавлении
// поля в характеристики машины дописывать надо оба места.
export const SPEC_FIELDS = [
  "bodyType",
  "bodyStructure",
  "vehicleClass",
  "batteryType",
  "batteryBrand",
  "batteryHealth",
  "engine",
  "transmission",
  "gearbox",
  "fuelType",
  "bodyColor",
  "tireSizeFront",
  "driverAssistance",
  "infotainmentChip",
  "assistanceLevel",
  "warranty",
  "inspectionGrade",
  "powertrainInspection",
  "bodyInspection",
  "interiorInspection",
  "structureInspection",
  "engineBayInspection",
  "batteryProtection",
];

// Поля характеристик, где лежит только число: мощность, момент, разгон, диаметр
// диска и счётчики камер. Их отбирают свои фильтры, а в строку поиска они не идут —
// «500» внутри «1500» давало бы случайные совпадения. Перечислены, чтобы тест мог
// сверить список выше с полным набором характеристик машины.
export const NUMBER_ONLY_SPEC_FIELDS = [
  "engineVolume",
  "enginePower",
  "acceleration",
  "torqueNm",
  "tireRim",
  "radarCount",
  "cameraCount",
  "ultrasonicCount",
];

// Голое число в строку не идёт: для мощности, момента, разгона и диска есть свои
// фильтры, а «500» внутри «1500» давало бы случайные совпадения. Числа внутри слов
// («401KM», «1.3T», «215/65 R16») остаются.
const isBareNumber = (value) => /^[0-9]+([.,][0-9]+)?$/.test(value);

export const carSearchText = (car) => {
  const parts = [car?.brand, car?.model, car?.title, car?.description, car?.city];
  for (const field of SPEC_FIELDS) parts.push(car?.[field]);
  return parts
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter((value) => value && !isBareNumber(value))
    .join(" ")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е");
};

/** Разбор строки запроса на слова — те же правила, что у сервера. */
export const searchTextWords = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .split(/[\s,;]+/)
    .map((word) => word.replace(/^[^0-9a-zа-я]+|[^0-9a-zа-я]+$/g, ""))
    .filter((word) => word.length >= 2)
    .slice(0, 6);

/**
 * Основа длинного слова: у источника одна и та же комплектация пишется по-разному —
 * «Surpass Edition» в объявлении и «Surpassing» в чужом каталоге, откуда запрос
 * копируют. Точное совпадение ищется первым; основа нужна только вторым заходом,
 * когда по слову целиком не нашлось ничего. Отрезаем не больше трети хвоста и
 * никогда не короче шести знаков — иначе «electric» совпадало бы с «elect».
 */
export const searchWordStem = (word) =>
  word.length >= 7 ? word.slice(0, Math.max(6, Math.ceil(word.length * 0.7))) : word;

/** Машина подходит, только если нашлось каждое слово запроса. */
export const matchesSearchText = (car, words) => {
  if (!words.length) return true;
  const text = carSearchText(car);
  return words.every((word) => text.includes(word));
};
