const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLocaleLowerCase("ru-RU");
const positiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const formatNumber = (value) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);

const powertrainLabel = (value) => {
  const normalized = lower(value);
  if (!normalized || normalized.startsWith("не указан")) return null;
  if (normalized === "электромобиль") return "электро";
  if (normalized === "гибрид") return "гибрид";
  return normalized;
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
  return [
    positiveNumber(car.year) ? `${Number(car.year)} г.` : null,
    mileage ? `пробег ${formatNumber(mileage)} км` : null,
    powertrainLabel(car.type),
    electricRange ? `запас хода ${formatNumber(electricRange)} км` : null,
    combinedRange && combinedRange !== electricRange ? `${formatNumber(combinedRange)} км` : null,
    driveLabel(car.drive),
    battery ? `батарея ${formatNumber(battery)} кВт·ч` : null,
    horsepower ? `${formatNumber(horsepower)} сил` : null,
  ].filter(Boolean);
}
