// Названия моделей Guazi, приведённые к каталогу Che168.
//
// Guazi (en.guazi.com) пишет одни и те же машины иначе, чем Che168: с маркой в начале
// («Zeekr 8X», «Li Auto i6»), другим регистром и пробелами («CS35PLUS», «DARGO»,
// «001FR»), экспортными именами завода («Emgrand X7 Sport» — это Boyue, «Geome» — EX2,
// «VOYAH Light» — Passion) и словом «New Energy» там, где у нас PHEV. Без этого словаря
// одна модель стоит в фильтре двумя-тремя строками, а обзор модели собирает только
// половину машин.
//
// Эталон — как модель уже называется в каталоге по данным Che168 (28.09.2026, после
// выпуска Guazi). Соответствие проверено размерами кузова: у каждой пары длина,
// ширина и высота совпадают с машинами Che168 той же марки. Модели, которых у Che168
// нет (Fengyun, Sienna, Granvia и т. п.), остаются под именем Guazi, только без марки
// в начале.
//
// Словарь применяется только к машинам с source === "Guazi" (см. canonicalImportName):
// у Che168 те же короткие имена могут значить другое.

const ALIASES = {
  "AION": { "ut super": "UT super" },
  "Audi": { "a6l e-tron": "A6L e-tron" },
  "BYD": { "song ultra ev": "Song Ultra" },
  "Buick": {
    "zijing e7": "Electra E7",
    "gt": "Excelle",
    "l7": "Electra L7",
    // Под одним именем Guazi присылает три разных машины; разводим по кузову, как у Che168.
    "envision": (car) => {
      const length = Number(car.lengthMm) || 0;
      const width = Number(car.widthMm) || 0;
      if (length >= 4800) return "Envision Plus";
      if (length >= 4600 && width >= 1880) return "Envision S";
      return "Envision";
    },
  },
  "Changan": {
    "cs35plus": "CS35 PLUS",
    "cs55 electric version": "CS55 EV",
    "cs55plus": (car, powertrain) => powertrain === "Гибрид" ? "CS55 PLUS PHEV" : "CS55 PLUS",
    "eado dd": "Yida",
  },
  "Chery": {
    "tiggo 3x": "Tiggo 3x",
    "tiggo 8 l": "Tiggo 8L",
    "tiggo 8 pro new energy": "Tiggo 8 PRO PHEV",
  },
  "Geely": {
    "binray": "Binrui",
    "coolray new energy": "Coolray PHEV",
    "e5": "EX5",
    "e8": "Galaxy E8",
    "emgrand gt new energy": "Emgrand GT PHEV",
    "emgrand x7 sport": "Boyue",
    "fx11": "Boyue L",
    "galaxy 8": "Galaxy Starshine 8",
    "galaxy xingjian 7 em-i": "Galaxy Starship 7",
    "geome": "EX2",
    "jiajie": "Jia Ji",
    "jiajie new energy": "Jiaji PHEV",
    "l6": "Galaxy L6",
    "l7": "Galaxy L7",
    "levc l380": "Yizhen L380",
    "monjaro l": "Monjaro",
    "monjaro l extended range electric version": "Monjaro",
    "monjaro l intelligent engine": "Monjaro",
    "monjaro s": "Xingyue S",
    "vision x6": "Emgrand X6",
    "icon": "ICON",
  },
  "Haval": {
    "dargo": "Dargo",
    "fierce dragon": "Xiaolong",
    "fierce dragon max": "Xiaolong MAX",
    "h dog": "Dargo II",
    "h dog new energy": "Dargo II PHEV",
    "jolion": "First Love",
    "lhery": "Chitu",
    "raptor new energy": "Raptor",
    "x dog": "Cool Dog",
    "xy": "Shenshou",
  },
  "Honda": {
    "envix": "ENVIX",
    "inspire new energy": "Inspire PHEV",
  },
  "Hyundai": { "custo": "Custin" },
  "Jetour": {
    "dashing i-dm": "Dashing i-DM",
    "freelander": "Freedom",
    "free 7 plus": "Freedom 7 PLUS",
  },
  "Kia": {
    "pegas": "Huan Chi",
    "sportage (chinese domestic model)": "Sportage",
    "sportage r": "Sportage",
    "kx1 stonic": "KX1",
  },
  "Land Rover": {
    "discovery sport new energy": "Discovery Sport PHEV",
    "range rover sportnew energy": "Range Rover Sport PHEV",
  },
  "Leapmotor": {
    "lafa5": "Lafa 5",
    "zero run a10": "A10",
  },
  "Lexus": { "ux new energy": "UX EV" },
  "Li Auto": { "one": "Li ONE" },
  "Lynk & Co": { "07": "07 EM-P" },
  "MG": {
    "mg 4x": "MG 4X",
    "4 ev": "MG4",
    "5": "MG5",
    "5 scorpio": "MG5 Scorpio",
    "6": "MG6",
    "7": "MG7",
  },
  "MINI": {
    "clubman": "CLUBMAN",
    "countryman": "COUNTRYMAN",
    "electric mini cooper jcw": "JCW Electric",
    "jcm countryman": "JCW COUNTRYMAN",
  },
  "Mazda": { "mazda 3 axela": "Mazda3" },
  "Mercedes-Benz": {
    "a amg": "A-Class AMG",
    "cla electric": "CLA EV",
    "gle-class": "GLE",
  },
  "Nissan": { "lannia": "Bluebird" },
  "Porsche": { "cayenne e-hybrid": "Cayenne PHEV" },
  "Toyota": {
    "bz 3x": "bZ3X",
    "baozhi 7": "bZ7",
    "corolla hybrid e+": "Corolla PHEV",
    "frontlander": "Frontlander",
    "rav4 rongfang plug-in hybrid": "RAV4 PHEV",
  },
  "Volkswagen": {
    "id.unyx": "ID.UNYX 06",
    "zhongyu 07": "ID.UNYX 07",
    "zhongdu 08": "ID.UNYX 08",
    "tacqua": "Tanying",
    "tavendor": "Talagon",
    "tiguan l new energy": "Tiguan L PHEV",
  },
  "Volvo": {
    "s60 new energy": "S60 PHEV",
    "s90 new energy": "S90 PHEV",
    "xc60 new energy": "XC60 PHEV",
    "xc90 new energy": "XC90 PHEV",
  },
  "Voyah": {
    "avatr taishan x8": "Taishan X8",
    "courage": "Courage",
    "titan": "Taishan",
    "light": "Passion",
    "light l": "Passion L",
  },
  "Zeekr": { "001fr": "001 FR" },
};

const lower = (value) => value.toLocaleLowerCase("en-US");
const squashSpaces = (value) => String(value || "").replace(/\s+/g, " ").trim();

// Марка в начале названия модели: «Zeekr 8X», «Li Auto i6», «VOYAH Light».
// «Li ONE» и модель «MINI» не трогаем: они не начинаются с марки и пробела.
function stripBrand(brand, model) {
  if (!lower(model).startsWith(`${lower(brand)} `)) return model;
  return model.slice(brand.length).trim() || model;
}

// `brand` — уже наша марка (после canonicalImportBrand). `car` — запись машины: нужны
// размеры кузова для Buick Envision.
export function guaziModelName(brand, model, powertrain, car = {}) {
  const table = ALIASES[brand] || {};
  const pick = (name) => {
    const alias = table[lower(name)];
    if (alias === undefined) return null;
    return typeof alias === "function" ? alias(car, powertrain) : alias;
  };
  const full = squashSpaces(model);
  const stripped = stripBrand(brand, full);
  return pick(full) || pick(stripped) || stripped;
}

// Ключ для сверки написаний: регистр, пробелы, дефисы и точки не различаем.
// «CS35PLUS» и «CS35 PLUS», «Lafa5» и «Lafa 5», «YARiS L  Zhi Xiang» и «YARiS L Zhi Xiang».
export const modelSpellingKey = (model) => lower(String(model || "")).replace(/[\s\-‐‑–—._]+/g, "");
