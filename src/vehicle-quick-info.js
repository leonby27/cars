import { engineVolume } from "./engine-spec.js";

const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLocaleLowerCase("ru-RU");
const positiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const formatNumber = (value) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);

// Объём мотора идёт в той же фразе, что топливо: «бензин 2.0 л», «гибрид 1.5 л».
// Только там, где мотор есть и объём указан: у электромобиля объёма нет вообще,
// а у гибрида с генератором источник его часто не пишет — тогда остаётся одно слово.
const powertrainLabel = (car) => {
  const normalized = lower(car?.type);
  if (!normalized || normalized.startsWith("не указан")) return null;
  if (normalized === "электромобиль") return "электро";
  const hasEngine = normalized === "гибрид" || normalized === "двс";
  // «ДВС» — как тип записан в базе; покупателю показываем привычное слово.
  const label = normalized === "двс" ? "бензин" : normalized;
  if (!hasEngine) return label;
  const volume = engineVolume(car);
  return volume === null ? label : `${label} ${volume.toFixed(1)} л`;
};

const driveLabel = (value) => {
  const normalized = lower(value);
  if (!normalized || normalized.startsWith("не указан")) return null;
  if (["awd", "4wd", "4x4"].includes(normalized)) return "полный привод";
  return normalized.includes("привод") ? normalized : `${normalized} привод`;
};

export function buildVehicleQuickInfo(car = {}) {
  const mileage = positiveNumber(car.mileage);
  const electricRange = positiveNumber(car.electricRange ?? car.range);
  const combinedRange = positiveNumber(car.combinedRange);
  const battery = positiveNumber(car.battery);
  const horsepower = positiveNumber(car.horsepower ?? car.powerHp ?? car.enginePowerHp ?? car.hp);
  const acceleration = positiveNumber(car.acceleration);
  return [
    positiveNumber(car.year) ? `${Number(car.year)} г.` : null,
    mileage ? `пробег ${formatNumber(mileage)} км` : null,
    powertrainLabel(car),
    electricRange ? `запас хода ${formatNumber(electricRange)} км` : null,
    combinedRange && combinedRange !== electricRange ? `${formatNumber(combinedRange)} км` : null,
    driveLabel(car.drive),
    battery ? `батарея ${formatNumber(battery)} кВт·ч` : null,
    horsepower ? `${formatNumber(horsepower)} сил` : null,
    acceleration ? `0–100 км/ч за ${acceleration.toLocaleString("ru-RU")} с` : null,
  ].filter(Boolean);
}

const capitalize = (value) => value.replace(/^./u, (letter) => letter.toLocaleUpperCase("ru-RU"));

/**
 * Те же факты парами «название — значение» для списка в две колонки. Набор и
 * порядок совпадают с короткой строкой выше; пустые пары не показываем.
 */
export function buildVehicleQuickFacts(car = {}) {
  const mileage = positiveNumber(car.mileage);
  const electricRange = positiveNumber(car.electricRange ?? car.range);
  const combinedRange = positiveNumber(car.combinedRange);
  const battery = positiveNumber(car.battery);
  const horsepower = positiveNumber(car.horsepower ?? car.powerHp ?? car.enginePowerHp ?? car.hp);
  const acceleration = positiveNumber(car.acceleration);
  const powertrain = powertrainLabel(car);
  const drive = driveLabel(car.drive);
  const range = electricRange
    ? [`${formatNumber(electricRange)} км`, combinedRange && combinedRange !== electricRange ? `${formatNumber(combinedRange)} км` : null].filter(Boolean).join(" / ")
    : null;
  return [
    ["Год выпуска", positiveNumber(car.year) ? String(Number(car.year)) : null],
    ["Пробег", mileage ? `${formatNumber(mileage)} км` : null],
    ["Двигатель", powertrain ? capitalize(powertrain) : null],
    ["Запас хода", range],
    ["Привод", drive ? capitalize(drive.replace(/\s*привод$/u, "")) : null],
    ["Батарея", battery ? `${formatNumber(battery)} кВт·ч` : null],
    ["Мощность", horsepower ? `${formatNumber(horsepower)} л. с.` : null],
    ["Разгон до 100 км/ч", acceleration ? `${acceleration.toLocaleString("ru-RU")} с` : null],
  ].filter(([, value]) => value).map(([label, value]) => ({ label, value }));
}
