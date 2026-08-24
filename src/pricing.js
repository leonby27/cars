import { chinaTransitFor } from "./china-logistics.js";
import { isEvQuotaOver } from "./ev-quota.js";

export const PRICING = {
  usdByn:2.9756, cnyBynPer10:4.44, eurByn:3.4815, rateDate:"24.08.2026",
  serviceUsd:800, evCustomsUsd:350,
  evDutyPercent:0.15, // пошлина на электромобиль после исчерпания квоты
  vatPercent:0.20, // НДС при ввозе: платят последовательные гибриды, у электромобилей ставка нулевая
  // Этапы до СВХ, доллары [низ, верх]. Ориентиры — открытые тарифы перевозчиков
  // Китай→Минск и платёжных агентов (лето 2026): автовоз «под ключ» ≈ $3500,
  // перевод через агента от 0,9%, внутрикитайское плечо 30–80 тыс. ₽ по удалённости.
  buyoutPercent:[0.011, 0.019], // платёжный агент и перевод юаней продавцу, % от цены
  buyoutMinUsd:[150, 250],
  exportDocsUsd:[250, 400], // экспортная декларация, снятие с учёта, страховка в пути
  intlDeliveryUsd:[2350, 2750], // автовоз Хоргос → Минск через Казахстан и Россию
  bigCarExtraUsd:[150, 250], // длина от 4,95 м или масса от 2,3 т занимает больше места на автовозе
  svhUsd:[100, 200], // разгрузка и склад временного хранения в Минске до выдачи
};
const round50 = (value) => Math.round(value / 50) * 50;

// «Сегодня» для расчёта возраста — дата курса: она обновляется вместе с курсами
// (npm run rates), и цены не начинают тихо ехать сами по себе между обновлениями.
const [RATE_MONTH, RATE_YEAR] = (() => {
  const [, month, year] = PRICING.rateDate.split(".").map(Number);
  return [month, year];
})();

/**
 * Сколько лет машине по документам таможни. Возраст считается от даты выпуска, а
 * не от модельного года: в каталоге они расходятся у каждой третьей машины (модель
 * 2022 года, выпуск 2023-го), а на трёх и пяти годах стоят пороги ставок. Если
 * даты выпуска нет, остаётся модельный год — как считалось раньше.
 */
export const carAgeYears = (car) => {
  const parts = String(car?.manufactureDate || "").match(/(\d{4})[.\-/](\d{1,2})/);
  if (parts) {
    const months = (RATE_YEAR - Number(parts[1])) * 12 + (RATE_MONTH - Number(parts[2]));
    if (months >= 0 && months <= 480) return months / 12;
  }
  return RATE_YEAR - (Number(car?.year) || RATE_YEAR);
};

// Ставки для физлиц из решения Совета ЕЭК № 107: за 1 см³ объёма двигателя.
// Раньше в расчёте стояло по одной ставке на возраст (1,7 и 3,2 €), то есть строка
// для мотора 1–1,5 л, — у машин с большим двигателем пошлина выходила заниженной.
const DUTY_EUR_PER_CC = {
  from3to5: [[1000, 1.5], [1500, 1.7], [1800, 2.5], [2300, 2.7], [3000, 3], [Infinity, 3.6]],
  over5: [[1000, 3], [1500, 3.2], [1800, 3.5], [2300, 4.8], [3000, 5], [Infinity, 5.7]],
};
const dutyPerCc = (table, engineCc) => table.find(([limit]) => engineCc <= limit)[1];
// Машина не старше трёх лет: процент от стоимости, но не меньше ставки за см³.
const NEW_CAR_DUTY = [[8500, 0.54, 2.5], [16700, 0.48, 3.5], [42300, 0.48, 5.5], [84500, 0.48, 7.5], [169000, 0.48, 15], [Infinity, 0.48, 20]];

// Режим цен: с льготной квотой или с пошлиной 15%. Считанное при загрузке
// значение держим в переменной, а не в константе, — переключатель «Цены с квотами»
// меняет его на ходу, и следующая же перерисовка пересчитывает все карточки.
let quotaOverNow = isEvQuotaOver();

/** Переключение режима цен из интерфейса. */
export const setPricingQuotaOver = (value) => {
  quotaOverNow = Boolean(value);
};

// Цену в юанях со страницы модели переводим в доллары по тому же курсу, что и
// расчёт стоимости машины: юани человеку ни о чём не говорят. Округляем до сотни —
// это ориентир, не смета. «от»/«до» перед суммой сохраняем.
export const yuanToUsdAbout = (text) => {
  const source = String(text);
  const digits = source.replace(/[\s\u00a0\u202f]/g, "").match(/(\d+)¥/);
  if (!digits) return null;
  const cnyUsd = (PRICING.cnyBynPer10 / 10) / PRICING.usdByn;
  const usd = Math.round((Number(digits[1]) * cnyUsd) / 100) * 100;
  const money = `$${usd.toLocaleString("ru-RU")}`;
  const prefix = source.match(/^(от|до)\s/);
  return prefix ? `${prefix[1]} ${money}` : `≈ ${money}`;
};

/**
 * Последовательный гибрид: бензиновый мотор не связан с колёсами, он только крутит
 * генератор. Таможня оформляет такую машину по коду электромобиля (8703 80 000 5,
 * выделен решениями ЕЭК № 81 и № 110 с 22.01.2026), но льгота на неё не действует:
 * указ № 428 от 11.12.2025 исключил из льготы «транспортные средства с гибридными
 * силовыми установками всех типов», а беспошлинная квота 2026 года выписана только
 * на чистые электромобили. Значит, пошлина 15% и НДС 20% сверху вместо ставки по
 * объёму двигателя.
 *
 * Признак — тип топлива источника (Range Extender). Если пометки нет, выдаёт
 * односкоростная коробка: в каталоге она стоит у всех 5 369 машин с генератором и
 * ни у одной из 5 849 с розеткой, где бензиновый мотор крутит колёса сам.
 */
export const isSeriesHybrid = (car) => {
  if (!car || car.type === "Электромобиль") return false;
  if (/range\s*extender|extended\s*range/i.test(String(car.sourceFuelType || ""))) return true;
  return /single[-\s]?speed/i.test(String(car.transmission || ""));
};

export function estimateLandedCost(car, { quotaOver = quotaOverNow } = {}) {
  const cnyUsd = (PRICING.cnyBynPer10 / 10) / PRICING.usdByn;
  const eurUsd = PRICING.eurByn / PRICING.usdByn;
  // Che168 quotes its export price in dollars; storing it as yuan at 7.15 and
  // converting back at the display cross-rate (~6.68 ¥/$) marked every card up
  // by ~7%. The source's own dollar figure is shown when the card carries one.
  // Guazi's usdPrice is a FOB quote with delivery baked in, so it stays out.
  const chinaUsd = (car.source === "Che168" && Number(car.usdPrice)) || round50(car.chinaPrice * cnyUsd);

  const buyoutLow = Math.max(PRICING.buyoutMinUsd[0], round50(chinaUsd * PRICING.buyoutPercent[0]));
  const buyoutHigh = Math.max(PRICING.buyoutMinUsd[1], round50(chinaUsd * PRICING.buyoutPercent[1]));

  const transit = chinaTransitFor(car.city);
  const chinaLegLow = PRICING.exportDocsUsd[0] + transit.usd[0];
  const chinaLegHigh = PRICING.exportDocsUsd[1] + transit.usd[1];
  const chinaLegNote = `Документы и автовоз до Хоргоса · ${transit.label}`;

  const lengthMm = Number(String(car.dimensions || "").match(/^\d{4}/)?.[0]) || 0;
  const bigCar = lengthMm >= 4950 || Number(car.curbWeight) >= 2300;
  const intlLow = PRICING.intlDeliveryUsd[0] + (bigCar ? PRICING.bigCarExtraUsd[0] : 0);
  const intlHigh = PRICING.intlDeliveryUsd[1] + (bigCar ? PRICING.bigCarExtraUsd[1] : 0);
  const intlNote = bigCar ? "Хоргос → Минск · крупный кузов, дороже место" : "Хоргос → Минск, через Казахстан и Россию";

  const age = carAgeYears(car);
  // Нулевой НДС дают только машинам не старше пяти лет с даты выпуска (указ № 92
  // с правками указа № 428). Машина старше — НДС 20% от цены вместе с пошлиной,
  // даже когда льготная квота ещё действует.
  const overFiveYears = age > 5;
  // Пока действует квота, электромобиль ввозится без пошлины и в этой строке
  // остаются только оформление и сборы. Когда квота выбрана — сверху ложится
  // пошлина 15% от стоимости машины.
  const evDutyUsd = quotaOver ? chinaUsd * PRICING.evDutyPercent : 0;
  const evVatUsd = overFiveYears ? (chinaUsd + evDutyUsd) * PRICING.vatPercent : 0;
  let customsUsd = round50(evDutyUsd + evVatUsd + PRICING.evCustomsUsd);
  let customsNote = quotaOver
    ? (overFiveYears ? "Пошлина 15% и НДС 20% · старше 5 лет" : "Пошлина 15% · оформление и сборы")
    : (overFiveYears ? "НДС 20% · машина старше 5 лет" : "Льгота 0% · оформление и сборы");
  let customsAlert = quotaOver
    ? "Без квоты на льготный ввоз"
    : overFiveYears ? "Старше 5 лет — НДС 20% сверху" : null;
  // Тон подписи под строкой: красная — про квоту на электромобили, оранжевая — всё
  // остальное. Разный цвет нужен, чтобы эти случаи не читались как один.
  let customsAlertTone = quotaOver ? "quota" : overFiveYears ? "warn" : null;
  // Подробное объяснение для подсказки. Пусто — в подсказке остаётся короткая строка.
  let customsHint = overFiveYears
    ? (quotaOver
      ? "Нулевой НДС дают только машинам не старше пяти лет с даты выпуска, а этой уже больше. Поэтому пошлина 15% от цены машины и НДС 20% сверху, плюс сборы за оформление."
      : "Пошлины на эту машину нет — льготная квота ещё действует. Но нулевой НДС дают только машинам не старше пяти лет с даты выпуска, а этой больше, поэтому добавляется НДС 20% и сборы за оформление.")
    : null;
  let engineAssumed = false;
  const seriesHybrid = isSeriesHybrid(car);
  if (seriesHybrid) {
    const dutyUsd = chinaUsd * PRICING.evDutyPercent;
    const vatUsd = (chinaUsd + dutyUsd) * PRICING.vatPercent;
    customsUsd = round50(dutyUsd + vatUsd + PRICING.evCustomsUsd);
    customsNote = "Гибрид с генератором · пошлина 15% и НДС 20%";
    customsHint = "Бензиновый мотор здесь только крутит генератор, колёс он не касается, поэтому таможня оформляет машину как электромобиль. Но льготу на такие гибриды отменили с 1 января 2026 года: пошлина 15% и НДС 20% сверху — около 38% от цены машины, плюс сборы за оформление.";
    customsAlert = "Гибрид с генератором — льготы нет с 2026 года";
    customsAlertTone = "warn";
  } else if (car.type !== "Электромобиль") {
    // Объём берём только из строки вида «1.5T», «2.0L», «4.4T»: у машин с генератором
    // в том же поле стоит мощность («Range Extender 160 Horsepower»), и прежний разбор
    // «первое число в строке» превратил бы её в мотор на 160 литров.
    const parsedEngine = Number(String(car.engine || "").match(/(\d(?:\.\d)?)\s*[LT]/i)?.[1]);
    const engineCc = parsedEngine >= 0.5 && parsedEngine <= 8 ? Math.round(parsedEngine * 1000) : 1500;
    const engineAssumedNow = !(parsedEngine >= 0.5 && parsedEngine <= 8);
    engineAssumed = engineAssumedNow;
    const chinaEur = chinaUsd / eurUsd;
    let dutyEur;
    if (age < 3) {
      const [, percent, minRate] = NEW_CAR_DUTY.find(([limit]) => chinaEur <= limit);
      dutyEur = Math.max(chinaEur * percent, engineCc * minRate);
    } else if (age <= 5) dutyEur = engineCc * dutyPerCc(DUTY_EUR_PER_CC.from3to5, engineCc);
    else dutyEur = engineCc * dutyPerCc(DUTY_EUR_PER_CC.over5, engineCc);
    customsUsd = round50(dutyEur * eurUsd + 300);
    customsNote = `Физлицо · ДВС ${(engineCc / 1000).toLocaleString("ru-RU")} л${engineAssumed ? " (оценка)" : ""}`;
    customsAlert = null;
    customsAlertTone = null;
  }
  // У гибрида с генератором пошлина считается от известной цены машины, а не от
  // предполагаемого объёма двигателя, — разброс здесь такой же узкий, как у
  // электромобиля с пошлиной, а не как у расчёта по объёму.
  const customsSpread = seriesHybrid || car.type === "Электромобиль"
    ? (seriesHybrid || quotaOver || overFiveYears ? Math.max(200, round50(customsUsd * .05)) : 150)
    : Math.max(300, round50(customsUsd * .08));
  const customsLow = Math.max(0, customsUsd - customsSpread);
  const customsHigh = customsUsd + customsSpread;

  const totalLow = round50(chinaUsd + buyoutLow + chinaLegLow + intlLow + PRICING.svhUsd[0] + customsLow + PRICING.serviceUsd);
  const totalHigh = round50(chinaUsd + buyoutHigh + chinaLegHigh + intlHigh + PRICING.svhUsd[1] + customsHigh + PRICING.serviceUsd);
  return {
    chinaUsd,
    buyoutLow, buyoutHigh,
    chinaLegLow, chinaLegHigh, chinaLegNote,
    intlLow, intlHigh, intlNote,
    svhLow:PRICING.svhUsd[0], svhHigh:PRICING.svhUsd[1],
    customsUsd, customsLow, customsHigh, customsNote, customsHint, customsAlert, customsAlertTone, seriesHybrid, ageYears:age,
    serviceUsd:PRICING.serviceUsd,
    totalLow, totalHigh, totalUsd:round50((totalLow + totalHigh) / 2),
  };
}
