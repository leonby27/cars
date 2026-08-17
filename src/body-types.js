export const BODY_TYPES = ["SUV / кроссовер", "Седан", "Лифтбек", "Хэтчбек", "Универсал", "Минивэн"];

const modelRules = [
  [/^BYD$/i, /^(Song Pro)$/i, "SUV / кроссовер"],
  [/^BYD$/i, /^(Qin Plus|Han)$/i, "Седан"],
  [/^BYD$/i, /^Seagull$/i, "Хэтчбек"],
  [/^Zeekr$/i, /^001$/i, "Универсал"],
  [/^Zeekr$/i, /^007$/i, "Седан"],
  [/^Zeekr$/i, /^X$/i, "SUV / кроссовер"],
  [/^Li Auto$/i, /^L[6789]$/i, "SUV / кроссовер"],
  [/^Voyah$/i, /^(Dream|Dreamer|梦想家)$/i, "Минивэн"],
  [/^Voyah$/i, /^Free$/i, "SUV / кроссовер"],
  [/^Deepal$/i, /^SL03$/i, "Лифтбек"],
  [/^Deepal$/i, /^S0[57]$/i, "SUV / кроссовер"],
  [/^Geely Galaxy$/i, /^E8$/i, "Седан"],
  [/^Geely Galaxy$/i, /^(E5|L7)$/i, "SUV / кроссовер"],
  [/^Dongfeng$/i, /^E70$/i, "Седан"],
  [/^Dongfeng$/i, /^(SKY EV01|L8)$/i, "SUV / кроссовер"],
  [/^Avatr$/i, /^06$/i, "Седан"],
  [/^Avatr$/i, /^11$/i, "SUV / кроссовер"],
  [/^HIMA$/i, /^M[79]$/i, "SUV / кроссовер"],
  [/^Xiaomi$/i, /^SU7$/i, "Седан"],
  [/^Xiaomi$/i, /^YU7$/i, "SUV / кроссовер"],
  [/^XPeng$/i, /^P7$/i, "Седан"],
  [/^NIO$/i, /^ES6$/i, "SUV / кроссовер"],
  [/^Denza$/i, /^D9$/i, "Минивэн"],
];

const cleanModel = (value) => String(value || "").replace(/^(岚图|深蓝|小米|问界)/, "").trim();

export function normalizeSourceBodyType(value) {
  const source = String(value || "").trim();
  if (!source) return null;
  if (BODY_TYPES.includes(source)) return source;
  if (/MPV|Mini\s*Van|Minivan|商务车|多用途/i.test(source)) return "Минивэн";
  if (/SUV|Crossover|越野/i.test(source)) return "SUV / кроссовер";
  if (/Station\s*Wagon|Wagon|Touring|旅行|猎装/i.test(source)) return "Универсал";
  if (/Liftback|掀背/i.test(source)) return "Лифтбек";
  if (/Hatchback|两厢/i.test(source)) return "Хэтчбек";
  if (/Sedan|Saloon|三厢|轿车/i.test(source)) return "Седан";
  return null;
}

export function normalizeBodyType(car = {}) {
  const fromSource = normalizeSourceBodyType(car.bodyType) || normalizeSourceBodyType(car.bodyStructure) || normalizeSourceBodyType(car.vehicleClass);
  if (fromSource) return fromSource;
  const brand = String(car.brand || "").trim();
  const model = cleanModel(car.model);
  const mapped = modelRules.find(([brandPattern, modelPattern]) => brandPattern.test(brand) && modelPattern.test(model));
  if (mapped) return mapped[2];
  return normalizeSourceBodyType(car.description) || "Не определён";
}
