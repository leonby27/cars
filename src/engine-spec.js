// Мотор, коробка и топливо бензиновой машины приходят из источника словами:
// «1.4T 150HP L4», «7-speed wet dual-clutch», «Gasoline». Каталог отбирает машины
// по объёму, мощности, типу коробки и топливу, поэтому разбор этих строк собран
// здесь и повторён один в один в SQL (server/repository.mjs): база обязана отбирать
// теми же правилами, что и статический режим на клиенте, иначе одна и та же ссылка
// давала бы разные выдачи.

export const GEARBOX_TYPES = ["Автомат", "Робот", "Вариатор", "Механика"];
export const FUEL_TYPES = ["Бензин", "Дизель"];

/**
 * Топливо машины с двигателем. Источник называет его словами: «Gasoline»,
 * «Diesel», «Gasoline + 48V Mild Hybrid System» (это бензиновая машина с лёгкой
 * подпиткой, заряжать её нельзя). У электромобилей и гибридов топлива нет —
 * там всё сказано типом машины.
 */
export const fuelType = (car) => {
  const text = String(car?.sourceFuelType ?? "").toLocaleLowerCase("en-US");
  if (!text) return "";
  if (text.includes("diesel")) return "Дизель";
  if (text.includes("gasoline") || text.includes("petrol")) return "Бензин";
  return "";
};

const engineText = (car) => String(car?.engine ?? "").toUpperCase();

/**
 * Объём в литрах: «1.4T 150HP L4» → 1.4. У машины с генератором в том же поле стоит
 * мощность («Range Extender 160 Horsepower») — там объёма нет, и число без буквы
 * литража мотором не считается.
 */
export const engineVolume = (car) => {
  const value = Number(engineText(car).match(/(\d+(?:\.\d+)?) ?[LT]/)?.[1]);
  return value >= 0.5 && value <= 8 ? value : null;
};

/** Мощность в лошадиных силах: «2.5T 367-horsepower L6» → 367. */
export const enginePower = (car) => {
  const value = Number(engineText(car).match(/(\d{2,4}) ?-? ?(?:HP|HORSEPOWER)/)?.[1]);
  return value >= 30 && value <= 2000 ? value : null;
};

/**
 * Тип коробки одним словом. Источник пишет её описанием («8-speed automatic with
 * manual shift mode», «E-CVT Continuously Variable Transmission»), а посетитель
 * выбирает «Автомат» или «Механика». Порядок проверок важен: преселектив и вариатор
 * узнаются раньше автомата, а «механика» — только там, где автомата не упомянуто
 * («ручной режим» у автоматической коробки механикой не делает).
 */
export const gearboxType = (car) => {
  const text = String(car?.transmission ?? "").toLocaleLowerCase("en-US").trim();
  if (!text) return "";
  if (/dual.?clutch|dct|dsg/.test(text)) return "Робот";
  if (/cvt|continuously variable/.test(text)) return "Вариатор";
  if (/automatic|dht/.test(text) || text === "at") return "Автомат";
  if (/manual/.test(text) || text === "mt") return "Механика";
  return "";
};

// Дробное значение печатается без лишнего нуля: 2.0 → «2 л», 1.4 → «1.4 л».
const engineNumber = (value) => String(Number(value));
const powerNumber = (value) => String(Math.round(Number(value)));

/**
 * Подпись фильтра объёма. Умный поиск приносит и точное значение («гольф 1.4»),
 * поэтому у совпавших границ подпись без «от» и «до».
 */
export const engineLabel = (min, max) =>
  min && max ? (min === max ? `${engineNumber(min)} л` : `от ${engineNumber(min)} до ${engineNumber(max)} л`) : min ? `от ${engineNumber(min)} л` : max ? `до ${engineNumber(max)} л` : "";

/** Обратный разбор подписи объёма в границы; не подпись — null. */
export const engineBounds = (label) => {
  const text = String(label ?? "").trim();
  let match = text.match(/^от (\d+(?:\.\d+)?) до (\d+(?:\.\d+)?) л$/);
  if (match) return { min: Number(match[1]), max: Number(match[2]) };
  match = text.match(/^от (\d+(?:\.\d+)?) л$/);
  if (match) return { min: Number(match[1]), max: null };
  match = text.match(/^до (\d+(?:\.\d+)?) л$/);
  if (match) return { min: null, max: Number(match[1]) };
  match = text.match(/^(\d+(?:\.\d+)?) л$/);
  if (match) return { min: Number(match[1]), max: Number(match[1]) };
  return null;
};

/** Подпись фильтра мощности: «от 150 л.с.», «до 200 л.с.», «от 150 до 250 л.с.». */
export const powerLabel = (min, max) =>
  min && max ? (min === max ? `${powerNumber(min)} л.с.` : `от ${powerNumber(min)} до ${powerNumber(max)} л.с.`) : min ? `от ${powerNumber(min)} л.с.` : max ? `до ${powerNumber(max)} л.с.` : "";

/** Обратный разбор подписи мощности в границы; не подпись — null. */
export const powerBounds = (label) => {
  const text = String(label ?? "").trim();
  let match = text.match(/^от (\d+) до (\d+) л\.с\.$/);
  if (match) return { min: Number(match[1]), max: Number(match[2]) };
  match = text.match(/^от (\d+) л\.с\.$/);
  if (match) return { min: Number(match[1]), max: null };
  match = text.match(/^до (\d+) л\.с\.$/);
  if (match) return { min: null, max: Number(match[1]) };
  match = text.match(/^(\d+) л\.с\.$/);
  if (match) return { min: Number(match[1]), max: Number(match[1]) };
  return null;
};

/** Машина проходит фильтр объёма/мощности только с известным значением. */
export const matchesEngineBounds = (car, bounds) => {
  if (!bounds) return true;
  const value = engineVolume(car);
  return value !== null && (!bounds.min || value >= bounds.min) && (!bounds.max || value <= bounds.max);
};

export const matchesPowerBounds = (car, bounds) => {
  if (!bounds) return true;
  const value = enginePower(car);
  return value !== null && (!bounds.min || value >= bounds.min) && (!bounds.max || value <= bounds.max);
};
