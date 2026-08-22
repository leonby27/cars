import { chinaTransitFor } from "./china-logistics.js";
import { isEvQuotaOver } from "./ev-quota.js";

export const PRICING = {
  usdByn:2.9829, cnyBynPer10:4.4496, eurByn:3.4918, rateDate:"21.08.2026",
  serviceUsd:800, evCustomsUsd:350,
  evDutyPercent:0.15, // пошлина на электромобиль после исчерпания квоты
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

// Считаем один раз при загрузке: карточек в каталоге тысячи, а состояние квоты
// за время просмотра страницы не меняется.
const QUOTA_OVER = isEvQuotaOver();

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

export function estimateLandedCost(car, { quotaOver = QUOTA_OVER } = {}) {
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

  const age = 2026 - car.year;
  // Пока действует квота, электромобиль ввозится без пошлины и в этой строке
  // остаются только оформление и сборы. Когда квота выбрана — сверху ложится
  // пошлина 15% от стоимости машины.
  let customsUsd = quotaOver
    ? round50(chinaUsd * PRICING.evDutyPercent + PRICING.evCustomsUsd)
    : PRICING.evCustomsUsd;
  let customsNote = quotaOver ? "Пошлина 15% · оформление и сборы" : "Льгота 0% · оформление и сборы";
  let customsAlert = quotaOver ? "Квоты закончились" : null;
  let engineAssumed = false;
  if (car.type !== "Электромобиль") {
    const parsedEngine = Number(String(car.engine || "").match(/\d+(?:\.\d+)?/)?.[0]);
    const engineCc = parsedEngine ? Math.round(parsedEngine * 1000) : 1500;
    engineAssumed = !parsedEngine;
    const chinaEur = chinaUsd / eurUsd;
    let dutyEur;
    if (age < 3) {
      const percent = chinaEur <= 8500 ? 0.54 : 0.48;
      const minRate = chinaEur <= 8500 ? 2.5 : chinaEur <= 16700 ? 3.5 : chinaEur <= 42300 ? 5.5 : 7.5;
      dutyEur = Math.max(chinaEur * percent, engineCc * minRate);
    } else if (age <= 5) dutyEur = engineCc * 1.7;
    else dutyEur = engineCc * 3.2;
    customsUsd = round50(dutyEur * eurUsd + 300);
    customsNote = `Физлицо · ДВС ${(engineCc / 1000).toLocaleString("ru-RU")} л${engineAssumed ? " (оценка)" : ""}`;
    customsAlert = null;
  }
  const customsSpread = car.type !== "Электромобиль"
    ? Math.max(300, round50(customsUsd * .08))
    : quotaOver ? Math.max(200, round50(customsUsd * .05)) : 150;
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
    customsUsd, customsLow, customsHigh, customsNote, customsAlert,
    serviceUsd:PRICING.serviceUsd,
    totalLow, totalHigh, totalUsd:round50((totalLow + totalHigh) / 2),
  };
}
