import { engineVolume, gearboxType } from "./engine-spec.js";
import { normalizeBodyType } from "./body-types.js";
import { translateColor } from "./colors.js";

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

const isEnergyConsumption = (item) => {
  const name = String(item?.name ?? "");
  const text = `${name} ${item?.value ?? ""}`;
  return /(?:consum|расход|энергопотреб)/iu.test(name)
    && /(?:kwh|кВт[·⋅\s]*ч|расход.*энерги|энергопотреб|(?:power|energy|electricity).*consumption)/iu.test(text)
    && !/(?:топлив|fuel|\bL\s*\/|л\s*\/)/iu.test(text);
};

const specConsumption = (car, matches, unit) => {
  const groups = car?.technicalSpecs?.groups;
  if (!Array.isArray(groups)) return null;
  const items = groups.flatMap((group) => Array.isArray(group?.items) ? group.items : []);
  for (const item of items.filter(matches)) {
    // Read only the leading value/range, never the 100 from the unit.
    const match = String(item.value ?? "").match(/^\s*(\d+(?:[.,]\d+)?)(?:\s*[-–—~～]\s*(\d+(?:[.,]\d+)?))?/u);
    if (!match) continue;
    const numbers = match.slice(1).filter(Boolean).map((value) => Number(value.replace(",", ".")));
    if (numbers.some((value) => value <= 0)) continue;
    return `${formatNumber(Math.min(...numbers))} ${unit}`;
  }
  return null;
};

const mixedFuelConsumption = (car) => specConsumption(car, (item) => !isEnergyConsumption(item)
  && /(?:расход.*смешан|смешан.*расход|combined.*consum|consum.*combined)/iu.test(String(item?.name ?? "")), "л");
const energyConsumption = (car) => specConsumption(car, isEnergyConsumption, "кВт·ч");

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

/** Не больше восьми известных фактов для двух колонок карточки автомобиля. */
export function buildVehicleQuickFacts(car = {}) {
  const mileage = positiveNumber(car.mileage);
  const electricRange = positiveNumber(car.electricRange ?? car.range);
  const combinedRange = positiveNumber(car.combinedRange);
  const battery = positiveNumber(car.battery);
  const horsepower = positiveNumber(car.horsepower ?? car.powerHp ?? car.enginePowerHp ?? car.hp);
  const acceleration = positiveNumber(car.acceleration);
  const fuelConsumption = mixedFuelConsumption(car);
  const electricityConsumption = energyConsumption(car);
  const powertrain = powertrainLabel(car);
  const drive = driveLabel(car.drive);
  const range = electricRange
    ? [`${formatNumber(electricRange)} км`, combinedRange && combinedRange !== electricRange ? `${formatNumber(combinedRange)} км` : null].filter(Boolean).join(" / ")
    : null;
  const primary = [
    ["Год выпуска", positiveNumber(car.year) ? String(Number(car.year)) : null],
    ["Пробег", mileage ? `${formatNumber(mileage)} км` : null],
    ["Двигатель", powertrain ? capitalize(powertrain) : null],
    ["Запас хода", range],
    ["Привод", drive ? capitalize(drive.replace(/\s*привод$/u, "")) : null],
    ["Батарея", battery ? `${formatNumber(battery)} кВт·ч` : null],
    ["Мощность", horsepower ? `${formatNumber(horsepower)} л. с.` : null],
  ].filter(([, value]) => value);
  const body = normalizeBodyType(car);
  const extra = [
    ["Кузов", body !== "Не определён" ? body : null],
    ["Цвет", translateColor(car.bodyColor)],
    ["Коробка", gearboxType(car) || null],
  ].filter(([, value]) => value);
  const seats = positiveNumber(car.seats);
  const last = acceleration
    ? ["Разгон до 100 км/ч", `${acceleration.toLocaleString("ru-RU")} с`]
    : fuelConsumption ? ["Расход топлива", fuelConsumption]
    : electricityConsumption ? ["Расход энергии", electricityConsumption]
    : seats ? ["Мест", String(seats)] : null;
  const availableExtras = extra.slice(0, Math.max(0, 8 - primary.length - Number(Boolean(last))));
  return [...primary, ...availableExtras, ...(last ? [last] : [])]
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));
}
