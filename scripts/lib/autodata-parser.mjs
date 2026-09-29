// Разбор справочника характеристик auto-data.net.
//
// Зачем: площадка Encar не публикует мощность, разгон, размеры, массу и батарею —
// только объём мотора, коробку и топливо. Справочник хранит характеристики по
// модели → поколению → комплектации (страница «модификации»), в том числе для
// корейских моделей, которых нет в Китае (Grandeur, Palisade, Carnival, Genesis).
// Корейский справочник Danawa из-за рубежа не отвечает (проверено 29.09.2026 с
// сервера и из Беларуси), auto-data.net открыт.
//
// Страницы: марка → модели (`/en/<brand>-brand-N`), модель → поколения
// (`…-model-N`), поколение → модификации (`…-generation-N`), модификация → строки
// «название — значение» по разделам (`<h2>`). Здесь только разбор HTML; обход —
// scripts/build-korea-specs.mjs, склейка с машиной — scripts/lib/korea-specs.mjs.

export const AUTODATA_BASE = "https://www.auto-data.net";

// Наши марки → страница марки в справочнике (проверено по /en/allbrands 29.09.2026).
// Audi есть дважды (41 и 355 «AUDI»); берём первую. KGM и SsangYong — две марки,
// у площадки Encar они одна.
export const AUTODATA_BRANDS = Object.freeze({
  Hyundai: ["/en/hyundai-brand-147"],
  Kia: ["/en/kia-brand-23"],
  Genesis: ["/en/genesis-brand-202"],
  KGM: ["/en/kgm-brand-337", "/en/ssangyong-brand-184"],
  BMW: ["/en/bmw-brand-86"],
  "Mercedes-Benz": ["/en/mercedes-benz-brand-138"],
  Audi: ["/en/audi-brand-41"],
  Volkswagen: ["/en/volkswagen-brand-80"],
  Tesla: ["/en/tesla-brand-197"],
  Toyota: ["/en/toyota-brand-40"],
  Lexus: ["/en/lexus-brand-58"],
  Honda: ["/en/honda-brand-127"],
  Nissan: ["/en/nissan-brand-4"],
  Volvo: ["/en/volvo-brand-85"],
  Porsche: ["/en/porsche-brand-64"],
  "Land Rover": ["/en/land-rover-brand-48"],
  MINI: ["/en/mini-brand-168"],
  Mazda: ["/en/mazda-brand-118"],
  BYD: ["/en/byd-brand-116"],
});

const ENTITIES = { "&amp;": "&", "&deg;": "°", "&nbsp;": " ", "&quot;": "\"", "&#39;": "'", "&lt;": "<", "&gt;": ">" };
export const textOf = (html) => String(html || "")
  .replace(/<sup>\s*3\s*<\/sup>/g, "³")
  .replace(/<su[bp]>\s*2\s*<\/su[bp]>/g, "2")
  .replace(/<br\s*\/?>/gi, "; ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z#0-9]+;/g, (entity) => ENTITIES[entity] ?? entity)
  .replace(/\s+/g, " ")
  .replace(/\s*;\s*$/, "")
  .trim();

/** «2022 - » → {from: 2022, to: null}; «2019 - 2022» → {from: 2019, to: 2022}. */
export function parseYears(text) {
  const match = String(text || "").match(/(\d{4})\s*-\s*(\d{4})?/);
  if (!match) return { from: null, to: null };
  return { from: Number(match[1]), to: match[2] ? Number(match[2]) : null };
}

/** Модели на странице марки: путь, имя, годы выпуска. */
export function parseBrandModels(html) {
  const models = [];
  const pattern = /<a class="modeli" href="(\/en\/[^"]+-model-\d+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of String(html || "").matchAll(pattern)) {
    const name = textOf(match[2].match(/<strong>([\s\S]*?)<\/strong>/)?.[1]);
    const years = parseYears(textOf(match[2].match(/<div class="(?:red|green)color">([\s\S]*?)<\/div>/)?.[1]));
    if (name) models.push({ path: match[1], name, ...years });
  }
  return models;
}

/** Поколения на странице модели: путь, имя (с кодом в скобках), годы, кузов. */
export function parseModelGenerations(html) {
  const generations = [];
  const pattern = /<div id="(\d+)" class="f [^"]*">([\s\S]*?)(?=<div id="\d+" class="f |<\/div>\s*<\/div>\s*<div class="ad|$)/g;
  for (const match of String(html || "").matchAll(pattern)) {
    const block = match[2];
    const path = block.match(/href="(\/en\/[^"]+-generation-\d+)"/)?.[1];
    const name = textOf(block.match(/<strong class="tit">([\s\S]*?)<\/strong>/)?.[1]);
    if (!path || !name) continue;
    // Годы: у выпускаемого поколения класс «cur», у снятого — «end».
    const years = parseYears(textOf(block.match(/<strong class="(?:cur|end)">([\s\S]*?)<\/strong>/)?.[1]));
    const body = textOf(block.match(/<strong class="chas">([\s\S]*?)<\/strong>/)?.[1]) || null;
    // Коды из скобок: «(G30 LCI, facelift 2020)» → G30; «(IG, facelift 2019)» → IG.
    const codes = [...new Set([...name.matchAll(/\(([^)]+)\)/g)].flatMap((item) => [...item[1].matchAll(/\b([A-Z]{1,3}\d{1,3}[A-Z]?|[A-Z]{2,4})\b/g)].map((token) => token[1])).filter((code) => !/^(LCI|MK|GEN)$/.test(code)))];
    generations.push({ path, name, ...years, body, codes });
  }
  return generations;
}

/** Модификации на странице поколения: путь, имя («2.5 GDi (198 Hp) Automatic»), годы. */
export function parseGenerationModifications(html) {
  const modifications = [];
  const pattern = /<div class="thi">\s*<a href="(\/en\/[^"]+-\d+)"[^>]*>\s*<strong>\s*<span class="tit">([\s\S]*?)<\/span>\s*<span class="cur">([\s\S]*?)<\/span>/g;
  for (const match of String(html || "").matchAll(pattern)) {
    const path = match[1];
    if (/-generation-\d+$|-model-\d+$/.test(path)) continue;
    modifications.push({ path, name: textOf(match[2]), ...parseYears(textOf(match[3])) });
  }
  // Снятые с производства модификации помечены классом «end», а не «cur».
  for (const match of String(html || "").matchAll(/<div class="thi">\s*<a href="(\/en\/[^"]+-\d+)"[^>]*>\s*<strong>\s*<span class="tit">([\s\S]*?)<\/span>\s*<span class="end">([\s\S]*?)<\/span>/g)) {
    const path = match[1];
    if (/-generation-\d+$|-model-\d+$/.test(path) || modifications.some((item) => item.path === path)) continue;
    modifications.push({ path, name: textOf(match[2]), ...parseYears(textOf(match[3])) });
  }
  return modifications;
}

// Разделы страницы модификации, которые берём; «Key specs» — те же цифры вопросами.
const SECTION_NAMES = new Map([
  ["General information", "Общие сведения"],
  ["Performance specs", "Динамика и расход"],
  ["Engine specs", "Двигатель"],
  ["Internal combustion engine specs", "Двигатель"],
  ["Electric and hybrid car specs", "Электромотор и батарея"],
  ["Volume and weights", "Объёмы и масса"],
  ["Dimensions", "Размеры"],
  ["Drivetrain, brakes and suspension specs", "Привод, тормоза, подвеска"],
]);

/** Строки «название — значение» по разделам страницы модификации. */
export function parseModificationPage(html) {
  const sections = [];
  const chunks = String(html || "").split(/<h2[^>]*>/).slice(1);
  for (const chunk of chunks) {
    const title = textOf(chunk.slice(0, chunk.indexOf("</h2>")));
    if (!SECTION_NAMES.has(title)) continue;
    const rows = [];
    for (const match of chunk.matchAll(/<div class="par">([\s\S]*?)<\/div>\s*<div class="val">([\s\S]*?)<\/div>/g)) {
      const name = textOf(match[1]);
      const value = textOf(match[2].replace(/<span class="val2">[\s\S]*?<\/span>/g, ""));
      if (!name || !value || /Log in to see/i.test(value) || name.endsWith("?")) continue;
      rows.push({ name, value });
    }
    if (rows.length) sections.push({ name: title, nameRu: SECTION_NAMES.get(title), rows });
  }
  return sections;
}

const number = (value) => {
  const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
const row = (sections, pattern) => {
  for (const section of sections) for (const item of section.rows) if (pattern.test(item.name)) return item.value;
  return null;
};

/** Короткая выжимка со страницы модификации — то, что ложится в поля записи. */
export function summarizeModification(sections) {
  const architecture = row(sections, /^Powertrain Architecture$/i) || "";
  const fuelText = row(sections, /^Fuel Type$/i) || "";
  // Порядок важен: «FHEV (Full Hybrid Electric Vehicle)» тоже содержит слова
  // «Electric Vehicle», поэтому гибриды узнаём раньше электромобилей.
  const powertrain = /PHEV|FHEV|MHEV|HEV|Hybrid/i.test(architecture) ? "Гибрид"
    : /\bBEV\b|FCEV|^Electric/i.test(architecture) || /^Electricity$/i.test(fuelText) ? "Электромобиль"
      : "ДВС";
  const mild = /MHEV|Mild/i.test(architecture);
  const plugIn = /PHEV|Plug-in/i.test(architecture);
  const fuel = /Diesel/i.test(fuelText) ? "Дизель" : /Petrol|Gasoline/i.test(fuelText) ? "Бензин" : /LPG|CNG|Hydrogen/i.test(fuelText) ? "Газ" : /Electric/i.test(fuelText) ? "Электричество" : null;
  const driveText = row(sections, /^Drive wheel$/i) || "";
  const drive = /All wheel|4x4|AWD/i.test(driveText) ? "Полный" : /Rear wheel/i.test(driveText) ? "Задний" : /Front wheel/i.test(driveText) ? "Передний" : null;
  const gearboxText = row(sections, /^Number of gears and type of gearbox$/i) || "";
  const gears = number(gearboxText);
  const dims = ["Length", "Width", "Height"].map((label) => number(row(sections, new RegExp(`^${label}$`, "i"))));
  const range = number(row(sections, /^(?:All-)?[Ee]lectric range \(WLTP\)/)) ?? number(row(sections, /^(?:All-)?[Ee]lectric range \(EPA\)/)) ?? number(row(sections, /^(?:All-)?[Ee]lectric range/));
  return {
    powertrain,
    mild,
    plugIn,
    fuel,
    horsepower: number(row(sections, /^System power$/i)) ?? number(row(sections, /^Power$/i)) ?? number(row(sections, /^Electric motor power$/i)),
    torqueNm: number(row(sections, /^System torque$/i)) ?? number(row(sections, /^Torque$/i)) ?? number(row(sections, /^Electric motor Torque$/i)),
    engineCc: number(row(sections, /^Engine displacement$/i)),
    cylinders: number(row(sections, /^Number of cylinders$/i)),
    aspiration: row(sections, /^Engine aspiration$/i),
    drive,
    gears,
    gearbox: /automatic/i.test(gearboxText) ? "Automatic" : /manual/i.test(gearboxText) ? "Manual" : /CVT/i.test(gearboxText) ? "CVT" : null,
    lengthMm: dims[0], widthMm: dims[1], heightMm: dims[2],
    wheelbaseMm: number(row(sections, /^Wheelbase$/i)),
    curbWeight: number(row(sections, /^Kerb Weight$/i)),
    seats: number(row(sections, /^Seats$/i)),
    doors: number(row(sections, /^Doors$/i)),
    acceleration: number(row(sections, /^Acceleration 0\s*-\s*100 km\/h/i)),
    topSpeed: number(row(sections, /^Maximum speed$/i)),
    battery: number(row(sections, /^Gross battery capacity$/i)) ?? number(row(sections, /^Net \(usable\) battery capacity$/i)),
    electricRange: range,
    consumption: row(sections, /^Fuel consumption \(economy\) - combined$/i) || row(sections, /^Average Energy consumption/i),
    tireSizeFront: (row(sections, /^Tire size$/i) || "").split(";")[0].trim() || null,
    tireRim: number((row(sections, /^Wheel rim size$/i) || "").split(";")[0].replace(/^[\d.]+J\s*x\s*/i, "")),
    bodyType: row(sections, /^Body type$/i),
    trunkL: number(row(sections, /^Trunk \(boot\) space - minimum$/i)),
  };
}

// ---------- Перевод строк для техкарты ----------

const LABELS_RU = new Map([
  ["Brand", "Марка"], ["Model", "Модель"], ["Generation", "Поколение"], ["Modification (Engine)", "Модификация"],
  ["Start of production", "Начало выпуска"], ["End of production", "Конец выпуска"], ["Powertrain Architecture", "Тип силовой установки"],
  ["Body type", "Тип кузова"], ["Seats", "Мест"], ["Doors", "Дверей"],
  ["Fuel consumption (economy) - urban", "Расход в городе"], ["Fuel consumption (economy) - extra urban", "Расход за городом"],
  ["Fuel consumption (economy) - combined", "Расход смешанный"], ["CO2 emissions", "Выбросы CO₂"], ["Fuel Type", "Топливо"],
  ["Battery capacity", "Ёмкость батареи"], ["Electric motor 1", "Электромотор 1"], ["Electric motor 2", "Электромотор 2"],
  ["Acceleration 0 - 100 km/h", "Разгон 0–100 км/ч"], ["Acceleration 0 - 62 mph", "Разгон 0–100 км/ч"], ["Maximum speed", "Максимальная скорость"],
  ["Emission standard", "Экологический класс"], ["Weight-to-power ratio", "Масса на мощность"], ["Weight-to-torque ratio", "Масса на момент"],
  ["Power", "Мощность двигателя"], ["Power per litre", "Мощность на литр"], ["Torque", "Крутящий момент двигателя"],
  ["System power", "Мощность системы"], ["System torque", "Момент системы"],
  ["Engine layout", "Расположение двигателя"], ["Engine Model/Code", "Индекс двигателя"], ["Engine displacement", "Объём двигателя"],
  ["Number of cylinders", "Цилиндров"], ["Engine configuration", "Схема двигателя"], ["Number of valves per cylinder", "Клапанов на цилиндр"],
  ["Fuel injection system", "Впрыск"], ["Engine aspiration", "Наддув"], ["Engine oil capacity", "Объём масла"], ["Engine systems", "Системы двигателя"],
  ["Gross battery capacity", "Ёмкость батареи (полная)"], ["Net (usable) battery capacity", "Ёмкость батареи (полезная)"], ["Battery voltage", "Напряжение батареи"],
  ["Battery technology", "Тип батареи"], ["Battery weight", "Масса батареи"], ["Battery location", "Расположение батареи"],
  ["Electric range (WLTP)", "Запас хода (WLTP)"], ["Electric range (EPA)", "Запас хода (EPA)"], ["Electric range (NEDC)", "Запас хода (NEDC)"],
  ["All-electric range (WLTP)", "Ход на электричестве (WLTP)"], ["All-electric range (EPA)", "Ход на электричестве (EPA)"], ["All-electric range (NEDC)", "Ход на электричестве (NEDC)"],
  ["Average Energy consumption (WLTP)", "Расход энергии (WLTP)"], ["Average Energy consumption (EPA)", "Расход энергии (EPA)"], ["Average Energy consumption (NEDC)", "Расход энергии (NEDC)"],
  ["Electric motor power", "Мощность электромотора"], ["Electric motor Torque", "Момент электромотора"], ["Electric motor location", "Расположение электромотора"], ["Electric motor type", "Тип электромотора"],
  ["Kerb Weight", "Снаряжённая масса"], ["Max. weight", "Полная масса"], ["Max load", "Грузоподъёмность"],
  ["Trunk (boot) space - minimum", "Багажник"], ["Trunk (boot) space - maximum", "Багажник максимум"], ["Fuel tank capacity", "Бак"],
  ["Length", "Длина"], ["Width", "Ширина"], ["Height", "Высота"], ["Wheelbase", "Колёсная база"], ["Front track", "Колея передняя"], ["Rear (Back) track", "Колея задняя"],
  ["Front overhang", "Передний свес"], ["Rear overhang", "Задний свес"], ["Ride height (ground clearance)", "Клиренс"], ["Drag coefficient (Cd)", "Коэффициент сопротивления"],
  ["Minimum turning circle (turning diameter)", "Диаметр разворота"], ["Approach angle", "Угол въезда"], ["Departure angle", "Угол съезда"],
  ["Drivetrain Architecture", "Схема привода"], ["Drive wheel", "Ведущие колёса"], ["Number of gears and type of gearbox", "Коробка передач"],
  ["Front suspension", "Передняя подвеска"], ["Rear suspension", "Задняя подвеска"], ["Front brakes", "Передние тормоза"], ["Rear brakes", "Задние тормоза"],
  ["Assisting systems", "Вспомогательные системы"], ["Steering type", "Рулевое управление"], ["Power steering", "Усилитель руля"],
  ["Tire size", "Размер шин"], ["Wheel rim size", "Диаметр дисков"],
]);
const VALUES_RU = [
  [/^Petrol \(Gasoline\)$/i, "Бензин"], [/^Diesel$/i, "Дизель"], [/^Electricity$/i, "Электричество"],
  [/^Internal Combustion engine$/i, "Двигатель внутреннего сгорания"], [/^BEV \(Electric Vehicle\)$/i, "Электромобиль"],
  [/^FHEV \(Full Hybrid Electric Vehicle\)$/i, "Полный гибрид"], [/^PHEV \(Plug-in Hybrid Electric Vehicle\)$/i, "Подключаемый гибрид"], [/^MHEV \(Mild Hybrid Electric Vehicle\)$/i, "Мягкий гибрид"],
  [/^Front wheel drive$/i, "Передний"], [/^Rear wheel drive$/i, "Задний"], [/^All wheel drive \(4x4\)$/i, "Полный"],
  [/^Sedan$/i, "Седан"], [/^SUV \(Sport Utility Vehicle\)$/i, "SUV / кроссовер"], [/^Hatchback$/i, "Хэтчбек"], [/^Coupe$/i, "Купе"], [/^Station wagon \(estate\)$/i, "Универсал"], [/^Minivan$/i, "Минивэн"],
  [/^Naturally aspirated engine$/i, "Атмосферный"], [/^Turbocharger, Intercooler$/i, "Турбонаддув, интеркулер"], [/^Turbocharger$/i, "Турбонаддув"],
  [/^Direct injection$/i, "Непосредственный впрыск"], [/^Inline$/i, "Рядный"], [/^V-engine$/i, "V-образный"], [/^Synchronous$/i, "Синхронный"],
  [/^Start & Stop System$/i, "Старт-стоп"], [/^Ventilated discs/i, "Вентилируемые диски"], [/^Disc/i, "Дисковые"],
  [/^Independent, McPherson type$/i, "Независимая, McPherson"], [/^Independent multi-link suspension$/i, "Независимая многорычажная"],
  [/^ABS \(Anti-lock braking system\)$/i, "ABS"], [/^Steering rack and pinion$/i, "Реечное"], [/^Electric Steering$/i, "Электроусилитель"],
  [/^Front, Transverse$/i, "Спереди, поперечно"], [/^Front, Longitudinal$/i, "Спереди, продольно"], [/^Below the floor$/i, "Под полом"], [/^Under the trunk$/i, "Под багажником"],
];
const UNITS_RU = [
  [/(\d) Hp\b/g, "$1 л.с."], [/ @ (\d+) rpm\.?/g, " при $1 об/мин"], [/(\d) Nm\b/g, "$1 Н·м"], [/(\d) km\/h\b/g, "$1 км/ч"],
  [/(\d) l\/100 km\b/g, "$1 л/100 км"], [/(\d) kWh\/100 km\b/g, "$1 кВт·ч/100 км"], [/(\d) kWh\b/g, "$1 кВт·ч"], [/(\d) km\b/g, "$1 км"],
  [/(\d) mm\b/g, "$1 мм"], [/(\d) kg\b/g, "$1 кг"], [/(\d) cm³/g, "$1 см³"], [/(\d) g\/km\b/g, "$1 г/км"], [/(\d) sec\b/g, "$1 с"],
  [/(\d) gears, automatic transmission/g, "$1-ступ. автомат"], [/(\d) gears, manual transmission/g, "$1-ступ. механика"], [/ l$/g, " л"], [/(\d) l\b/g, "$1 л"], [/(\d) V\b/g, "$1 В"],
];

export const translateAutodataLabel = (name) => LABELS_RU.get(String(name || "").trim()) || String(name || "").trim();
const MONTHS_RU = { January: "январь", February: "февраль", March: "март", April: "апрель", May: "май", June: "июнь", July: "июль", August: "август", September: "сентябрь", October: "октябрь", November: "ноябрь", December: "декабрь" };
export function translateAutodataValue(value) {
  let text = String(value || "").trim();
  const month = text.match(/^([A-Z][a-z]+), (\d{4})$/);
  if (month && MONTHS_RU[month[1]]) return `${MONTHS_RU[month[1]]} ${month[2]}`;
  for (const [pattern, replacement] of VALUES_RU) if (pattern.test(text)) return replacement;
  for (const [pattern, replacement] of UNITS_RU) text = text.replace(pattern, replacement);
  return text;
}

/** Группы техкарты из разделов страницы модификации (уже по-русски). */
export function autodataSpecGroups(sections) {
  return sections
    .map((section) => ({
      name: `Характеристики: ${section.nameRu || section.name}`,
      items: section.rows
        .filter((item) => !/^(Brand|Weight-to-power ratio|Weight-to-torque ratio|Power per litre)$/i.test(item.name))
        .map((item) => ({ name: translateAutodataLabel(item.name), value: translateAutodataValue(item.value) })),
    }))
    .filter((group) => group.items.length);
}
