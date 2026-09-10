import { usdToByn } from "./pricing.js";

const RU = new Intl.NumberFormat("ru-RU", { maximumFractionDigits:0 });

export const isBrandGuide = (landing, guide) => GUIDE_BRANDS.has(landing?.brand) && guide?.brand === landing.brand && guide.total > 0;
export const isBrandGuideLanding = (landing) => GUIDE_BRANDS.has(landing?.brand);
export const isZeekrGuide = (landing, guide) => landing?.brand === "Zeekr" && isBrandGuide(landing, guide);
export const guideNumber = (value) => RU.format(Math.round(Number(value) || 0));
export const guidePlural = (count, one, few, many) => {
  const value = Math.abs(Math.round(Number(count) || 0));
  if (value % 100 >= 11 && value % 100 <= 14) return many;
  if (value % 10 === 1) return one;
  if (value % 10 >= 2 && value % 10 <= 4) return few;
  return many;
};
export const guidePrice = (value, currency = "USD") => value == null
  ? "Нет данных"
  : currency === "BYN" ? `${guideNumber(usdToByn(value))} BYN` : `${guideNumber(value)} $`;
export const guideYears = ({ yearMin, yearMax }) => yearMin && yearMax
  ? yearMin === yearMax ? String(yearMin) : `${yearMin}–${yearMax}`
  : "Нет данных";
export const guidePowertrains = (values = []) => values
  .map((value) => value === "ДВС" ? "бензин" : value.toLowerCase())
  .join(", ") || "не указано";
export const guideDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ru-RU", {
    day:"numeric", month:"long", year:"numeric", timeZone:"Europe/Minsk",
  }).format(date);
};

export const ZEEKR_GUIDE_INTRO = "Zeekr — премиальная марка группы Geely с моделями разных классов: от лифтбеков и кроссоверов до минивэнов. В линейке представлены электрические и гибридные автомобили. При выборе стоит сравнивать тип силовой установки, привод, запас хода, комплектацию и год выпуска. Ниже собраны предложения с китайского вторичного рынка; цены, количество машин и состав моделей считаются по активным объявлениям и обновляются вместе с каталогом.";

export const XIAOMI_GUIDE_INTRO = "Xiaomi вышла на автомобильный рынок в 2024 году с электрическим седаном SU7, а затем добавила кроссовер YU7. Машины марки новые, поэтому на вторичном рынке это в основном свежие экземпляры с небольшим пробегом. При выборе стоит сравнивать версию, привод, ёмкость батареи, запас хода, комплектацию и год выпуска. Ниже собраны предложения с китайского вторичного рынка; цены, количество машин и состав моделей считаются по активным объявлениям и обновляются вместе с каталогом.";

export const ZEEKR_BUDGETS = [
  { key:"under25", max:25000, title:"До 25 000 $", text:"Самые доступные предложения марки" },
  { key:"25to35", min:25000, max:35000, title:"25 000–35 000 $", text:"Основной выбор массовых моделей" },
  { key:"35to50", min:35000, max:50000, title:"35 000–50 000 $", text:"Более свежие и дорогие версии" },
  { key:"over50", min:50000, title:"От 50 000 $", text:"Флагманские и редкие комплектации" },
];

export const guideBudgetTitle = (band, currency = "USD") => {
  if (currency !== "BYN") return band.title;
  const value = (usd) => `${guideNumber(usdToByn(usd))} BYN`;
  if (band.min == null) return `До ${value(band.max)}`;
  if (band.max == null) return `От ${value(band.min)}`;
  return `${guideNumber(usdToByn(band.min))}–${value(band.max)}`;
};

export const ZEEKR_ALTERNATIVES = [
  { brand:"Tesla", note:"седаны и кроссоверы на электротяге" },
  { brand:"NIO", note:"электромобили близкого ценового класса" },
  { brand:"XPeng", note:"электромобили с широким выбором кузовов" },
  { brand:"Avatr", note:"премиальные электрические модели и гибриды" },
  { brand:"Li Auto", note:"крупные гибридные кроссоверы" },
  { brand:"BYD", note:"самый широкий выбор электрических моделей и гибридов" },
];

export const XIAOMI_ALTERNATIVES = [
  { brand:"Tesla", note:"электрические седаны и кроссоверы" },
  { brand:"XPeng", note:"технологичные электромобили разных классов" },
  { brand:"Zeekr", note:"мощные электромобили и широкий выбор кузовов" },
  { brand:"NIO", note:"премиальные электромобили близкого класса" },
  { brand:"Avatr", note:"премиальные электрические модели" },
  { brand:"BYD", note:"широкий выбор электромобилей и гибридов" },
];

const guideIntro = (text) => `${text} При выборе стоит сравнивать модель, тип силовой установки, комплектацию, год выпуска и итоговую цену до Минска. Ниже собраны предложения с китайского вторичного рынка; цены, количество машин и состав моделей считаются по активным объявлениям и обновляются вместе с каталогом.`;

const alternatives = (...items) => items.map(([brand, note]) => ({ brand, note }));

const BRAND_GUIDE_CONFIG = {
  Zeekr: { intro:ZEEKR_GUIDE_INTRO, alternatives:ZEEKR_ALTERNATIVES },
  Xiaomi: { intro:XIAOMI_GUIDE_INTRO, alternatives:XIAOMI_ALTERNATIVES },
  Volkswagen: {
    intro:guideIntro("В китайском каталоге Volkswagen особенно широко представлены седаны Golf, Lamando, Passat и Magotan, а также кроссоверы Tayron, Tiguan L и Tharu. Большая часть машин бензиновая, но есть электрические модели семейства ID и отдельные гибридные версии."),
    alternatives:alternatives(
      ["Audi", "премиальные седаны и кроссоверы концерна Volkswagen"],
      ["Toyota", "массовые седаны и семейные кроссоверы"],
      ["Honda", "седаны и кроссоверы китайской сборки"],
      ["Geely", "массовые китайские седаны и кроссоверы"],
      ["BMW", "премиальные модели разных классов"],
      ["Mercedes-Benz", "премиальные седаны, кроссоверы и минивэны"],
    ),
  },
  "Mercedes-Benz": {
    intro:guideIntro("Основу предложений Mercedes-Benz из Китая составляют C-Class и E-Class, кроссоверы GLC и GLB, а также минивэны Vito и V-Class. Наряду с бензиновыми машинами в каталоге встречаются электрические модели EQ и гибридные версии."),
    alternatives:alternatives(
      ["BMW", "премиальные седаны и кроссоверы"],
      ["Audi", "немецкие модели китайской сборки"],
      ["Porsche", "спортивные премиальные автомобили"],
      ["Volvo", "премиальные седаны и семейные кроссоверы"],
      ["Volkswagen", "более доступные модели разных классов"],
      ["Lexus", "премиальные седаны и кроссоверы"],
    ),
  },
  BMW: {
    intro:guideIntro("В каталоге BMW из Китая больше всего седанов 3 и 5 Series и кроссоверов X1, X3 и X5. Основная часть предложений бензиновая; отдельно представлены электрические i3, i5, i7 и iX3, а также редкие гибридные версии."),
    alternatives:alternatives(
      ["Mercedes-Benz", "премиальные седаны, кроссоверы и минивэны"],
      ["Audi", "немецкие модели китайской сборки"],
      ["Volvo", "премиальные седаны и кроссоверы"],
      ["Porsche", "спортивные премиальные автомобили"],
      ["Volkswagen", "более доступные модели разных классов"],
      ["Tesla", "электрические седаны и кроссоверы"],
    ),
  },
  Audi: {
    intro:guideIntro("В китайском каталоге Audi широко представлены седаны A3, A4L, A6L и A7L, а также кроссоверы Q2L, Q3, Q5L и Q7. Большинство машин бензиновые, но есть электрические e-tron и e5 Sportback и отдельные гибридные версии."),
    alternatives:alternatives(
      ["BMW", "премиальные седаны и кроссоверы"],
      ["Mercedes-Benz", "премиальные модели разных классов"],
      ["Volkswagen", "модели того же концерна в массовом сегменте"],
      ["Volvo", "премиальные семейные автомобили"],
      ["Lexus", "премиальные седаны и кроссоверы"],
      ["Tesla", "электрические седаны и кроссоверы"],
    ),
  },
  BYD: {
    intro:guideIntro("BYD предлагает одну из самых широких линеек в каталоге: от компактных Seagull и Dolphin до седана Han и семейства кроссоверов Song. У многих моделей есть электрические и гибридные версии, которые при одинаковом названии заметно отличаются по платежам при ввозе."),
    alternatives:alternatives(
      ["Geely Galaxy", "электрические и гибридные модели Geely"],
      ["AION", "доступные массовые электромобили"],
      ["Geely", "массовые седаны и кроссоверы"],
      ["Tesla", "электрические седаны и кроссоверы"],
      ["Leapmotor", "электромобили и гибридные кроссоверы"],
      ["Changan", "широкий выбор седанов и кроссоверов"],
    ),
  },
  Tesla: {
    intro:guideIntro("Каталог Tesla в основном состоит из Model Y и Model 3 китайской сборки; Model S, Model X и удлинённая Model Y L встречаются заметно реже. Все актуальные модели марки электрические, но батареи, привод и запас хода отличаются между версиями и годами."),
    alternatives:alternatives(
      ["Xiaomi", "электрические седан SU7 и кроссовер YU7"],
      ["Zeekr", "мощные электромобили разных классов"],
      ["XPeng", "технологичные электрические модели"],
      ["NIO", "премиальные электромобили"],
      ["BYD", "широкая линейка электромобилей"],
      ["Audi", "премиальные бензиновые и электрические модели"],
    ),
  },
  Geely: {
    intro:guideIntro("Под маркой Geely в каталоге собраны массовые седаны Preface и Emgrand и кроссоверы Monjaro, Boyue и Coolray. Большинство предложений бензиновые; электрические и гибридные модели концерна также представлены в отдельных линейках."),
    alternatives:alternatives(
      ["Changan", "массовые седаны и кроссоверы"],
      ["Haval", "широкий выбор бензиновых кроссоверов"],
      ["Chery", "доступные седаны и кроссоверы"],
      ["Volkswagen", "массовые модели китайской сборки"],
      ["Honda", "седаны и семейные кроссоверы"],
      ["BYD", "электромобили и гибриды разных классов"],
    ),
  },
  Honda: {
    intro:guideIntro("В Китае Honda представлена седанами Civic и Accord, кроссоверами CR-V, Breeze, XR-V и HR-V и несколькими местными моделями. Основу каталога составляют бензиновые машины, выпущенные совместными предприятиями Dongfeng Honda и GAC Honda."),
    alternatives:alternatives(
      ["Toyota", "японские седаны и семейные кроссоверы"],
      ["Volkswagen", "массовые модели китайской сборки"],
      ["Nissan", "седаны и кроссоверы близкого класса"],
      ["Mazda", "японские седаны и кроссоверы"],
      ["Buick", "седаны, кроссоверы и минивэны"],
      ["Geely", "массовые китайские модели"],
    ),
  },
  "Li Auto": {
    intro:guideIntro("Li Auto известна крупными семейными кроссоверами L6, L7, L8 и L9 с гибридной установкой, где бензиновый двигатель работает генератором. В каталоге также есть более ранний Li ONE и полностью электрические модели MEGA, i6 и i8."),
    alternatives:alternatives(
      ["AITO", "гибридные и электрические кроссоверы с технологиями Huawei"],
      ["Voyah", "премиальные гибриды и электромобили"],
      ["Denza", "крупные семейные модели BYD"],
      ["Zeekr", "премиальные электромобили и гибриды"],
      ["NIO", "премиальные электрические кроссоверы"],
      ["Avatr", "технологичные электромобили и гибриды"],
    ),
  },
  Buick: {
    intro:guideIntro("Китайский каталог Buick включает седаны Excelle, Regal и LaCrosse, кроссоверы Envision и Enclave и большой выбор минивэнов GL8. Основная часть предложений бензиновая, а у коммерческих и бизнес-минивэнов особенно важно сравнивать пробег и историю эксплуатации."),
    alternatives:alternatives(
      ["Volkswagen", "массовые седаны и кроссоверы"],
      ["Honda", "седаны и семейные модели"],
      ["Toyota", "седаны, кроссоверы и минивэны"],
      ["Ford", "американские модели китайской сборки"],
      ["Chevrolet", "более доступные модели General Motors"],
      ["Geely", "массовые китайские седаны и кроссоверы"],
    ),
  },
  Changan: {
    intro:guideIntro("В каталоге Changan больше всего седанов UNI-V и Eado и кроссоверов CS75 PLUS, UNI-T и CS55 PLUS. Линейка часто обновляется, поэтому одинаковое имя модели может относиться к разным поколениям и комплектациям."),
    alternatives:alternatives(
      ["Geely", "массовые седаны и кроссоверы"],
      ["Haval", "бензиновые кроссоверы разных размеров"],
      ["Chery", "седаны и семейство кроссоверов Tiggo"],
      ["BYD", "электромобили и гибриды разных классов"],
      ["Jetour", "семейные кроссоверы концерна Chery"],
      ["Volkswagen", "массовые модели китайской сборки"],
    ),
  },
  Toyota: {
    intro:guideIntro("Китайский каталог Toyota включает седаны Camry, Corolla, Levin и Avalon и кроссоверы RAV4, Wildlander и Frontlander. Из-за двух совместных предприятий близкие по конструкции модели могут продаваться под разными именами."),
    alternatives:alternatives(
      ["Honda", "японские седаны и семейные кроссоверы"],
      ["Nissan", "седаны и кроссоверы китайской сборки"],
      ["Volkswagen", "массовые европейские модели из Китая"],
      ["Lexus", "премиальные модели Toyota"],
      ["Mazda", "японские седаны и кроссоверы"],
      ["Geely", "массовые китайские модели"],
    ),
  },
  NIO: {
    intro:guideIntro("NIO выпускает электрические седаны, универсалы и кроссоверы: больше всего в каталоге ES6, ES8, ET5T, EC6 и ET5. В Китае марка развивает замену батарей, но в Беларуси автомобили заряжаются обычным способом, поэтому перед покупкой важно проверить статус собственности батареи."),
    alternatives:alternatives(
      ["Zeekr", "премиальные электромобили разных классов"],
      ["XPeng", "технологичные электрические модели"],
      ["Tesla", "электрические седаны и кроссоверы"],
      ["Xiaomi", "электрические SU7 и YU7"],
      ["Avatr", "премиальные электромобили и гибриды"],
      ["Li Auto", "крупные семейные гибриды и электромобили"],
    ),
  },
  Haval: {
    intro:guideIntro("Haval специализируется на кроссоверах: основу каталога составляют H6, Dargo, M6, H9 и семейство F7. Марка хорошо известна в Беларуси, поэтому итоговую цену машины из Китая полезно сравнивать с предложениями местного рынка."),
    alternatives:alternatives(
      ["Geely", "массовые седаны и кроссоверы"],
      ["Changan", "седаны и кроссоверы разных классов"],
      ["Chery", "семейство кроссоверов Tiggo"],
      ["Jetour", "крупные семейные кроссоверы"],
      ["Toyota", "японские семейные кроссоверы"],
      ["Volkswagen", "кроссоверы китайской сборки"],
    ),
  },
  Nissan: {
    intro:guideIntro("В китайском каталоге Nissan особенно широко представлены седаны Sylphy и Teana и кроссоверы X-Trail и Qashqai. У массовых моделей встречаются разные поколения и силовые установки, поэтому название нужно сопоставлять с годом и характеристиками конкретной машины."),
    alternatives:alternatives(
      ["Toyota", "японские седаны и семейные кроссоверы"],
      ["Honda", "седаны и кроссоверы китайской сборки"],
      ["Volkswagen", "массовые европейские модели из Китая"],
      ["Mazda", "японские седаны и кроссоверы"],
      ["Buick", "седаны, кроссоверы и минивэны"],
      ["Geely", "массовые китайские модели"],
    ),
  },
  Hongqi: {
    intro:guideIntro("Hongqi предлагает представительские седаны H5 и H9, кроссоверы HS3, HS5 и HS7, электрические E-QM5 и E-HS9 и гибридные версии PHEV. У марки особенно широкий разброс класса, силовых установок и цен."),
    alternatives:alternatives(
      ["Mercedes-Benz", "премиальные седаны и кроссоверы"],
      ["BMW", "премиальные модели разных классов"],
      ["Audi", "премиальные модели китайской сборки"],
      ["Volvo", "седаны и семейные кроссоверы"],
      ["Geely", "более доступные китайские модели"],
      ["Lexus", "премиальные японские автомобили"],
    ),
  },
  Leapmotor: {
    intro:guideIntro("Leapmotor выпускает доступный городской T03, седаны и кроссоверы серий B и C. В каталоге есть как полностью электрические машины, так и гибридные версии C01, C10, C11 и C16 с генератором."),
    alternatives:alternatives(
      ["BYD", "широкий выбор электромобилей и гибридов"],
      ["Geely Galaxy", "электрические и гибридные модели Geely"],
      ["XPeng", "технологичные электромобили разных классов"],
      ["AION", "доступные массовые электромобили"],
      ["Deepal", "электромобили и гибриды Changan"],
      ["Geely", "массовые седаны и кроссоверы"],
    ),
  },
  XPeng: {
    intro:guideIntro("XPeng делает электрические седаны P5, P7 и MONA M03, кроссоверы G3, G6, G7 и G9 и минивэн X9. В новых моделях появляются и гибридные версии, поэтому тип силовой установки нужно сверять по конкретному объявлению."),
    alternatives:alternatives(
      ["Tesla", "электрические седаны и кроссоверы"],
      ["Zeekr", "премиальные электромобили разных классов"],
      ["NIO", "премиальные электрические модели"],
      ["Xiaomi", "электрические SU7 и YU7"],
      ["BYD", "широкая линейка электромобилей"],
      ["Leapmotor", "доступные электромобили и гибриды"],
    ),
  },
  "Lynk & Co": {
    intro:guideIntro("Lynk & Co — марка Geely и Volvo с бензиновыми седанами и кроссоверами 01, 03, 05 и 06, гибридами семейства EM-P и электрическим Z20. У похожих названий могут быть разные силовые установки и правила ввоза."),
    alternatives:alternatives(
      ["Geely", "массовые модели того же концерна"],
      ["Volvo", "премиальные модели на родственной технике"],
      ["BMW", "премиальные седаны и кроссоверы"],
      ["Volkswagen", "массовые модели китайской сборки"],
      ["BYD", "электромобили и гибриды разных классов"],
      ["Changan", "массовые седаны и кроссоверы"],
    ),
  },
  Chery: {
    intro:guideIntro("Каталог Chery состоит из седанов Arrizo и большого семейства кроссоверов Tiggo: от компактных Tiggo 4 и 7 до Tiggo 8 и 9. У близких названий Pro и Pro Max отличаются поколения и комплектации, поэтому их нужно сверять по году и характеристикам."),
    alternatives:alternatives(
      ["Haval", "массовые бензиновые кроссоверы"],
      ["Geely", "седаны и кроссоверы разных классов"],
      ["Changan", "массовые китайские модели"],
      ["Jetour", "семейные кроссоверы концерна Chery"],
      ["BYD", "электромобили и гибриды"],
      ["Volkswagen", "массовые модели китайской сборки"],
    ),
  },
};

const OTHER_GUIDE_BRANDS = [
  "Land Rover", "Hyundai", "Ford", "Volvo", "AITO", "Mazda", "Porsche", "Geely Galaxy", "AION", "Jetour", "Voyah",
  "Chevrolet", "MG", "Lexus", "MINI", "ORA", "Denza", "Deepal", "Kia", "Jaguar", "Avatr", "Luxeed", "Shangjie",
  "Mitsubishi", "Jeep", "Stelato", "Subaru", "Peugeot", "Maserati", "Great Wall", "Infiniti", "Dongfeng", "Maextro",
];

const NEW_ENERGY_GUIDE_BRANDS = new Set([
  "AITO", "Geely Galaxy", "AION", "Voyah", "ORA", "Denza", "Deepal", "Avatr", "Luxeed", "Shangjie", "Stelato", "Maextro",
]);
const PREMIUM_GUIDE_BRANDS = new Set(["Land Rover", "Volvo", "Porsche", "Lexus", "MINI", "Jaguar", "Maserati", "Infiniti"]);
const NEW_ENERGY_ALTERNATIVES = ["BYD", "Tesla", "Zeekr", "XPeng", "NIO", "Li Auto", "Geely Galaxy", "Leapmotor"];
const PREMIUM_ALTERNATIVES = ["BMW", "Mercedes-Benz", "Audi", "Volvo", "Lexus", "Porsche", "Land Rover", "Jaguar"];
const MASS_ALTERNATIVES = ["Volkswagen", "Toyota", "Honda", "Geely", "Changan", "Chery", "Haval", "Nissan"];
const COMPARISON_NOTES = {
  Audi:"премиальные седаны и кроссоверы",
  BMW:"премиальные модели разных классов",
  BYD:"электромобили и гибриды разных классов",
  Changan:"массовые седаны и кроссоверы",
  Chery:"седаны и семейство кроссоверов Tiggo",
  Geely:"массовые китайские седаны и кроссоверы",
  "Geely Galaxy":"электрические и гибридные модели Geely",
  Haval:"широкий выбор бензиновых кроссоверов",
  Honda:"японские седаны и семейные кроссоверы",
  Jaguar:"премиальные седаны и кроссоверы",
  "Land Rover":"премиальные кроссоверы и внедорожники",
  Leapmotor:"доступные электромобили и гибриды",
  Lexus:"премиальные японские автомобили",
  "Li Auto":"крупные семейные гибриды и электромобили",
  "Mercedes-Benz":"премиальные седаны, кроссоверы и минивэны",
  NIO:"премиальные электрические модели",
  Nissan:"японские седаны и кроссоверы",
  Porsche:"спортивные премиальные автомобили",
  Tesla:"электрические седаны и кроссоверы",
  Toyota:"японские седаны и семейные кроссоверы",
  Volkswagen:"массовые модели китайской сборки",
  Volvo:"премиальные семейные автомобили",
  XPeng:"технологичные электромобили разных классов",
  Zeekr:"премиальные электромобили разных классов",
};

const GUIDE_BRANDS = new Set([...Object.keys(BRAND_GUIDE_CONFIG), ...OTHER_GUIDE_BRANDS]);

const genericGuideAlternatives = (brand) => {
  const candidates = NEW_ENERGY_GUIDE_BRANDS.has(brand)
    ? NEW_ENERGY_ALTERNATIVES
    : PREMIUM_GUIDE_BRANDS.has(brand) ? PREMIUM_ALTERNATIVES : MASS_ALTERNATIVES;
  return candidates
    .filter((candidate) => candidate !== brand)
    .slice(0, 6)
    .map((candidate) => ({ brand:candidate, note:COMPARISON_NOTES[candidate] }));
};

export const brandGuideConfig = (brand, notes = []) => {
  if (BRAND_GUIDE_CONFIG[brand]) return BRAND_GUIDE_CONFIG[brand];
  if (!GUIDE_BRANDS.has(brand)) return null;
  const summary = notes[0] || `${brand} представлена в каталоге автомобилями с китайского вторичного рынка.`;
  return { intro:guideIntro(summary), aboutNotes:notes.slice(1), alternatives:genericGuideAlternatives(brand) };
};

export function zeekrGuideFaq(guide, currency = "USD") {
  return brandGuideFaq(guide, currency);
}

export function brandGuideFaq(guide, currency = "USD") {
  const brand = guide?.brand;
  if (!brandGuideConfig(brand)) return [];
  const mainModels = guide.models.slice(0, 4).map((row) => `${brand} ${row.model}`).join(", ");
  const powertrains = new Set(guide.models.flatMap((row) => row.powertrains || []));
  const electricOnly = powertrains.size === 1 && powertrains.has("Электромобиль");
  const listedPowertrains = guidePowertrains([...powertrains]);
  const powertrainAnswer = brand === "Zeekr"
    ? "Нет. Большинство предложений марки — электромобили, но в каталоге встречаются и гибридные модели. Для электромобиля пошлина зависит от действующей льготной квоты. Гибрид льготу не получает, поэтому сравнивать модели нужно по итоговой цене до Минска, указанной в карточке."
    : electricOnly
    ? `Да. Все актуальные предложения ${brand} в каталоге — электромобили. Пошлина зависит от действующей льготной квоты, поэтому сравнивать варианты нужно по итоговой цене до Минска, указанной в карточке.`
    : `Среди актуальных предложений ${brand} в каталоге встречаются: ${listedPowertrains}. Правила ввоза и платежи зависят от типа силовой установки, поэтому сравнивать варианты нужно по итоговой цене до Минска, указанной в карточке.`;
  return [
    {
      q:`Сколько стоит ${brand} с доставкой до Минска?`,
      a:`Сейчас цены в каталоге начинаются от ${guidePrice(guide.priceMin, currency)}. Медианная цена — ${guidePrice(guide.priceMedian, currency)}: половина предложений дешевле, половина дороже. У центральной половины объявлений цена находится примерно между ${guidePrice(guide.priceP25, currency)} и ${guidePrice(guide.priceP75, currency)}. Это предварительный расчёт до Минска; перед договором подтверждаем цену продавца, курс и логистику.`,
    },
    {
      q:`Какие модели ${brand} чаще встречаются в каталоге?`,
      a:`Больше всего предложений сейчас приходится на ${mainModels}. Таблица выше показывает количество машин, годы выпуска и медианную цену каждой модели и обновляется вместе с каталогом.`,
    },
    {
      q:brand === "Zeekr" ? "Все Zeekr в каталоге — электромобили?" : electricOnly ? `Все ${brand} в каталоге — электромобили?` : `Какие типы двигателя есть у ${brand} в каталоге?`,
      a:powertrainAnswer,
    },
    {
      q:`Что проверить у ${brand} перед покупкой в Китае?`,
      a:"Нужно подтвердить VIN, комплектацию и возможность экспорта, проверить кузов, историю обслуживания и заявленный пробег. Для электромобиля отдельно проверяют ошибки высоковольтной системы и доступные данные о батарее. Сведения продавца считаются исходными, а не независимой проверкой.",
    },
    {
      q:`Сколько ждать доставку ${brand} из Китая?`,
      a:"Обычно 30–50 дней от договора до выдачи в Минске. Срок зависит от города отправления, оформления экспортных документов, маршрута и очереди на границе.",
    },
  ];
}
