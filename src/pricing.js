import { chinaTransitFor } from "./china-logistics.js";
import { engineVolume } from "./engine-spec.js";
import { isEvQuotaOver } from "./ev-quota.js";

export const PRICING = {
  usdByn:3.0279, cnyBynPer10:4.5214, eurByn:3.4736, rateDate:"20.09.2026",
  serviceByn:1000,
  // Тариф фиксирован в BYN; долларовый эквивалент следует за курсом НБРБ.
  get serviceUsd() { return Math.round(this.serviceByn / this.usdByn / 10) * 10; },
  // Обязательные сборы при оформлении — в рублях, как их и начисляет таможня.
  // Утилизационный сбор с 23.04.2026 (постановление Совета Министров № 195) по
  // льготной ставке для физлиц: 624,92 руб. машине до трёх лет и 1282,02 руб.
  // старше трёх. Таможенный сбор за оформление — 120 руб., от стоимости машины
  // он не зависит. Подготовка декларации и подача входят в наше сопровождение,
  // отдельной строкой сверху не появляются.
  //
  // Раньше здесь стояли круглые 350 и 500 долларов «сборы и оформление» — сумма
  // с запасом, которую нельзя было сверить с официальными ставками и разложить в
  // калькуляторе построчно. Теперь обе строки настоящие и следуют за курсом.
  utilFeeByn:{ upTo3Years:624.92, over3Years:1282.02 },
  clearanceFeeByn:120,
  /** Сборы за оформление в долларах, по возрасту машины: утильсбор плюс таможенный сбор. */
  get customsFeesUsd() {
    return {
      upTo3Years: (this.utilFeeByn.upTo3Years + this.clearanceFeeByn) / this.usdByn,
      over3Years: (this.utilFeeByn.over3Years + this.clearanceFeeByn) / this.usdByn,
    };
  },
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

// Рублёвая цена остаётся ориентиром: после пересчёта по курсу показываем её с
// точностью до сотни, а не создаём ложное ощущение точности до одного рубля.
export const usdToByn = (usd) => Math.round((usd * PRICING.usdByn) / 100) * 100;

// Объём, по которому считается пошлина, когда в объявлении его нет. Такая карточка
// помечается предупреждением: у мотора побольше платёж будет выше.
const ASSUMED_ENGINE_CC = 1500;

// Пороги ставок считаются на дату оформления на таможне, а машина приезжает
// через полтора-два месяца после покупки. Поэтому возраст считаем не на сегодня,
// а на ожидаемую дату оформления: иначе машина у самого пятилетнего порога
// показывала бы дешёвую ставку, а к оформлению действовала бы дорогая — у
// двухлитрового мотора это около пяти тысяч долларов сюрпризом после договора.
export const CLEARANCE_MONTHS = 2;

// Ожидаемая дата оформления: дата курса плюс срок доставки. Дата курса
// обновляется вместе с курсами (npm run rates), поэтому цены не начинают тихо
// ехать сами по себе между обновлениями.
const [CLEARANCE_MONTH, CLEARANCE_YEAR] = (() => {
  const [, month, year] = PRICING.rateDate.split(".").map(Number);
  const shifted = month + CLEARANCE_MONTHS;
  return shifted > 12 ? [shifted - 12, year + 1] : [shifted, year];
})();

/**
 * Сколько лет будет машине по документам таможни к дате оформления. Возраст
 * считается от даты выпуска, а не от модельного года: в каталоге они расходятся у
 * каждой третьей машины (модель 2022 года, выпуск 2023-го), а на трёх и пяти годах
 * стоят пороги ставок. Если даты выпуска нет, остаётся модельный год — как
 * считалось раньше.
 */
export const carAgeYears = (car) => {
  const parts = String(car?.manufactureDate || "").match(/(\d{4})[.\-/](\d{1,2})/);
  if (parts) {
    const months = (CLEARANCE_YEAR - Number(parts[1])) * 12 + (CLEARANCE_MONTH - Number(parts[2]));
    if (months >= 0 && months <= 480) return months / 12;
  }
  return CLEARANCE_YEAR - (Number(car?.year) || CLEARANCE_YEAR);
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

/** Таблицы ставок в том виде, в каком их показывает страница расчёта. */
export const DUTY_RATE_TABLES = Object.freeze({
  upTo3Years: NEW_CAR_DUTY.map(([limit, percent, minRate]) => ({ limit, percent, minRate })),
  from3to5: DUTY_EUR_PER_CC.from3to5.map(([limit, rate]) => ({ limit, rate })),
  over5: DUTY_EUR_PER_CC.over5.map(([limit, rate]) => ({ limit, rate })),
});

/**
 * Таможенный платёж за одну машину — от страны ввоза он не зависит.
 *
 * Пошлина, НДС и сборы считаются по правилам Беларуси и ЕАЭС для частного лица,
 * которое ввозит машину для личного пользования. Откуда машина едет — из Китая,
 * Кореи или Европы, — на этот платёж не влияет вообще: влияют тип двигателя,
 * возраст на дату оформления, объём мотора и таможенная стоимость. Поэтому
 * функция ничего не знает про Китай и её зовут и карточка каталога, и калькулятор.
 *
 * `kind`: "ev" — чистый электромобиль, "erev" — гибрид с генератором (бензиновый
 * мотор крутит только генератор), "ice" — всё остальное, включая гибрид с розеткой
 * и дизель: им пошлину считают по объёму и возрасту одинаково.
 *
 * `refund50` — возмещение половины пошлины и налогов по указу № 140 от 10.04.2019
 * (инвалиды I и II группы, многодетные родители, родители и опекуны детей-инвалидов,
 * одна легковая машина в год). Это именно возмещение после оформления, а не скидка
 * при уплате, поэтому в расчёте оно стоит отдельной строкой со знаком минус.
 */
export function customsPayment({
  customsValueUsd,
  kind = "ice",
  engineCc = 0,
  ageYears = 0,
  quotaOver,
  refund50 = false,
} = {}) {
  const value = Math.max(0, Number(customsValueUsd) || 0);
  const quotaIsOver = quotaOver === undefined ? quotaOverNow : Boolean(quotaOver);
  const eurUsd = PRICING.eurByn / PRICING.usdByn;
  const age = Number(ageYears) || 0;
  const overFiveYears = age > 5;

  const utilUsd = (age < 3 ? PRICING.utilFeeByn.upTo3Years : PRICING.utilFeeByn.over3Years) / PRICING.usdByn;
  const clearanceUsd = PRICING.clearanceFeeByn / PRICING.usdByn;

  let dutyUsd = 0;
  let vatUsd = 0;
  let basis;
  // Чем считали пошлину: ставка, объём и обе суммы для случая «по большему из двух».
  // Нужно только для объяснения под расчётом, на сами цифры не влияет.
  let detail = {};
  if (kind === "ev") {
    // Пока в квоте есть места, пошлины нет вовсе. Нулевой НДС дают только машинам
    // не старше пяти лет с даты выпуска — этот порог от квоты не зависит.
    dutyUsd = quotaIsOver ? value * PRICING.evDutyPercent : 0;
    vatUsd = overFiveYears ? (value + dutyUsd) * PRICING.vatPercent : 0;
    basis = quotaIsOver ? "ev-duty" : "ev-quota";
  } else if (kind === "erev") {
    // Машину оформляют по коду электромобиля, но льготы у неё нет с 2026 года:
    // пошлина 15% и НДС 20% сверху — вместе около 38% от стоимости.
    dutyUsd = value * PRICING.evDutyPercent;
    vatUsd = (value + dutyUsd) * PRICING.vatPercent;
    basis = "erev";
  } else {
    // Бензин, дизель и гибрид с розеткой: единая ставка для частных лиц уже
    // включает налоги, отдельного НДС сверху нет.
    const cc = Math.max(0, Math.round(Number(engineCc) || 0));
    const valueEur = value / eurUsd;
    let dutyEur;
    if (age < 3) {
      const [, percent, minRate] = NEW_CAR_DUTY.find(([limit]) => valueEur <= limit);
      const byValue = valueEur * percent;
      const byVolume = cc * minRate;
      dutyEur = Math.max(byValue, byVolume);
      basis = "value-or-volume";
      // Какое из двух правил сработало и с какими числами — это объясняет расчёт
      // человеку прямо под суммой, без второго такого же вычисления в разметке.
      detail = { percent, ratePerCc: minRate, engineCc: cc, valueEur, byValue, byVolume, wonByVolume: byVolume >= byValue };
    } else if (age <= 5) {
      const ratePerCc = dutyPerCc(DUTY_EUR_PER_CC.from3to5, cc);
      dutyEur = cc * ratePerCc;
      basis = "volume-3-5";
      detail = { ratePerCc, engineCc: cc };
    } else {
      const ratePerCc = dutyPerCc(DUTY_EUR_PER_CC.over5, cc);
      dutyEur = cc * ratePerCc;
      basis = "volume-over-5";
      detail = { ratePerCc, engineCc: cc };
    }
    detail.dutyEur = dutyEur;
    dutyUsd = dutyEur * eurUsd;
  }

  // Возмещают половину пошлины и налогов; утилизационный и таможенный сборы
  // остаются целиком — они не пошлина и не налог.
  const refundUsd = refund50 ? (dutyUsd + vatUsd) / 2 : 0;
  // Две суммы нарочно. `totalUsd` округлён до полусотни — так показана любая другая
  // сумма на сайте, где доллар сам по себе оценка. `totalExactUsd` не округлён: в
  // рублях эту сумму складывают из строк, и округлённый итог не сошёлся бы с ними.
  const totalExactUsd = dutyUsd + vatUsd + utilUsd + clearanceUsd - refundUsd;
  const totalUsd = round50(totalExactUsd);
  return {
    dutyUsd, vatUsd, utilUsd, clearanceUsd, refundUsd,
    feesUsd: utilUsd + clearanceUsd,
    totalUsd, totalExactUsd,
    basis, detail, overFiveYears, quotaOver: quotaIsOver, ageYears: age,
  };
}

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
  // Таможенная стоимость — цена машины по документам продавца, и только она.
  // Статья 267 Таможенного кодекса ЕАЭС прямо говорит: в стоимость товара для
  // личного пользования расходы на перевозку и страхование не включаются. Раньше
  // сюда прибавлялась доставка до границы, и карточка завышала платёж там, где он
  // считается процентом: у электромобилей после квоты и у машин младше трёх лет.
  // На ставку за кубический сантиметр это не влияло никогда.
  const customsValueUsd = chinaUsd;
  // Нулевой НДС дают только машинам не старше пяти лет с даты выпуска (указ № 92
  // с правками указа № 428). Машина старше — НДС 20% от стоимости вместе с пошлиной,
  // даже когда льготная квота ещё действует.
  const overFiveYears = age > 5;
  // Сам платёж считает общая функция: ею же считает калькулятор на странице
  // растаможки, поэтому карточка и калькулятор не могут разойтись в цифрах.
  // Здесь остаются только подписи под строкой — они про конкретную карточку.
  const evPayment = customsPayment({ customsValueUsd, kind: "ev", ageYears: age, quotaOver });
  const feesUsd = evPayment.feesUsd;
  let customsUsd = evPayment.totalUsd;
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
    customsUsd = customsPayment({ customsValueUsd, kind: "erev", ageYears: age }).totalUsd;
    customsNote = "Гибрид с генератором · пошлина 15% и НДС 20%";
    customsHint = "Бензиновый мотор здесь только крутит генератор, колёс он не касается, поэтому таможня оформляет машину как электромобиль. Но льготу на такие гибриды отменили с 1 января 2026 года: пошлина 15% и НДС 20% сверху — около 38% от цены машины, плюс сборы за оформление.";
    customsAlert = "Гибрид с генератором — льготы нет с 2026 года";
    customsAlertTone = "warn";
  } else if (car.type !== "Электромобиль") {
    // Объём разбирает engineVolume — тот же разбор, по которому работает фильтр
    // объёма в каталоге. Свой разбор здесь читал «1.33T» как трёхлитровый мотор
    // (Mercedes A, CLA, GLA, GLB), а «6.75T» Bentley — как пятилитровый: пошлина
    // расходилась в разы, и фильтр показывал одно, а расчёт считал по другому.
    const parsedEngine = engineVolume(car);
    const engineCc = parsedEngine ? Math.round(parsedEngine * 1000) : ASSUMED_ENGINE_CC;
    engineAssumed = !parsedEngine;
    customsUsd = customsPayment({ customsValueUsd, kind: "ice", engineCc, ageYears: age }).totalUsd;
    customsNote = `Пошлина по объёму · ${(engineCc / 1000).toLocaleString("ru-RU")} л${engineAssumed ? " (оценка)" : ""}`;
    // Подсказку про квоту и НДС здесь оставлять нельзя: она написана про
    // электромобиль, а машине с двигателем ставку считают по объёму и возрасту.
    customsHint = engineAssumed
      ? "В объявлении не указан объём двигателя, а пошлина считается именно по нему. В расчёте взято 1,5 литра — у мотора побольше платёж будет выше. Точную сумму подтверждаем по документам машины до договора."
      : age < 3
        ? "Машине меньше трёх лет: пошлину считают как долю от стоимости, но не меньше ставки за кубический сантиметр объёма. Это самая дорогая из трёх возрастных ступеней."
        : age <= 5
          ? "Пошлину считают по ставке за кубический сантиметр объёма двигателя — стоимость машины на неё уже не влияет. Это самая выгодная возрастная ступень."
          : "Машине больше пяти лет: ставка за кубический сантиметр примерно вдвое выше, чем у машины от трёх до пяти лет. Плюс сборы за оформление.";
    customsAlert = engineAssumed ? "Объём двигателя не указан — платёж посчитан по 1,5 л" : null;
    customsAlertTone = engineAssumed ? "warn" : null;
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
    customsValueUsd, customsFeesUsd:feesUsd,
    serviceUsd:PRICING.serviceUsd,
    totalLow, totalHigh, totalUsd:round50((totalLow + totalHigh) / 2),
  };
}
