export const PRICING = { usdByn:3.0313, cnyBynPer10:4.5021, eurByn:3.5093, deliveryUsd:3500, serviceUsd:800, evCustomsUsd:350, rateDate:"19.08.2026", chinaHandling:[450,800], delivery:[3200,3900], reserve:[300,700] };
const round50 = (value) => Math.round(value / 50) * 50;

export function estimateLandedCost(car) {
  const cnyUsd = (PRICING.cnyBynPer10 / 10) / PRICING.usdByn;
  const eurUsd = PRICING.eurByn / PRICING.usdByn;
  // Che168 quotes its export price in dollars; storing it as yuan at 7.15 and
  // converting back at the display cross-rate (~6.68 ¥/$) marked every card up
  // by ~7%. The source's own dollar figure is shown when the card carries one.
  // Guazi's usdPrice is a FOB quote with delivery baked in, so it stays out.
  const chinaUsd = (car.source === "Che168" && Number(car.usdPrice)) || round50(car.chinaPrice * cnyUsd);
  const age = 2026 - car.year;
  let customsUsd = PRICING.evCustomsUsd;
  let customsNote = "Льгота 0% · оформление и сборы";
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
  }
  const customsSpread = car.type === "Электромобиль" ? 150 : Math.max(300, round50(customsUsd * .08));
  const customsLow = Math.max(0, customsUsd - customsSpread);
  const customsHigh = customsUsd + customsSpread;
  const totalLow = round50(chinaUsd + PRICING.chinaHandling[0] + PRICING.delivery[0] + customsLow + PRICING.serviceUsd + PRICING.reserve[0]);
  const totalHigh = round50(chinaUsd + PRICING.chinaHandling[1] + PRICING.delivery[1] + customsHigh + PRICING.serviceUsd + PRICING.reserve[1]);
  return { chinaUsd, deliveryUsd:PRICING.deliveryUsd, deliveryLow:PRICING.delivery[0], deliveryHigh:PRICING.delivery[1], chinaHandlingLow:PRICING.chinaHandling[0], chinaHandlingHigh:PRICING.chinaHandling[1], customsUsd, customsLow, customsHigh, customsNote, serviceUsd:PRICING.serviceUsd, reserveLow:PRICING.reserve[0], reserveHigh:PRICING.reserve[1], totalLow, totalHigh, totalUsd:round50((totalLow + totalHigh) / 2) };
}
