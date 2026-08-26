// Беларуские названия моделей вместо китайских.
//
// Источник даёт машину под китайским именем: 星瑞 приходит как «Xing Rui», 缤越 — как
// «Binyue». В Беларуси эти машины ищут по другим именам: Preface и Coolray. Здесь лежит
// перевод одного в другое плюс китайское имя — его показываем подсказкой рядом с
// названием в карточке.
//
// Как выбиралось беларуское имя (замеры 26.08.2026, разбор в MODEL_NAMES_BY.md):
//  1. Справочник моделей av.by и число живых объявлений под каждым именем. Если под
//     «Coolray» 166 объявлений, а под «Binyue» — 10, спорить не о чем.
//  2. Официальное имя у дилера: модельный ряд Geely с завода в Жодино, Haval, GWM.
//  3. Латинское имя завода там, где машины в Беларуси ещё нет: Raeton CC, Luxeed, Stelato.
//
// Экспортное имя из энциклопедии беларуским не считается. В Европе BYD 元PLUS зовут
// Atto 3, но на av.by такого имени нет вообще — все BYD стоят под китайскими именами,
// и переименовывать их нельзя. То же с Ford Escape: здесь прижилось имя Escape, а не Kuga.
//
// Правки Сергея 26.08.2026: Sagitar, Magotan, Tiguan L и Hyundai ix25 остаются под
// китайскими именами; удлинённые китайские версии сохраняют букву L (A6L, XEL, XFL,
// Malibu XL); «New Energy» меняется на «PHEV».

// Марки, которых в Беларуси не знают под нашим именем.
//
// «HIMA» — это не марка, а альянс Huawei: под этим именем у нас лежат пять разных марок.
// На av.by есть готовая марка Aito с моделями M5, M7, M8, M9 — так их здесь и ищут.
// Остальные четыре тоже имеют официальные имена: Luxeed, Stelato, Maextro, Shangjie.
//
// Марка меняется вместе с моделью, поэтому переезд описан в MODEL_RENAMES: у каждой
// записи может быть своя новая марка. Здесь — только справка о том, что появится.
export const NEW_BRANDS = Object.freeze(["AITO", "Luxeed", "Stelato", "Shangjie", "Maextro"]);

// Марки, которые после переименования пропадут из каталога.
export const RETIRED_BRANDS = Object.freeze(["HIMA"]);

// Переименования моделей. `brand` и `model` — ровно то, что лежит в базе сейчас.
// `toModel` — как будет; `toBrand` — если модель заодно переезжает в другую марку.
// `zh` — китайское имя для подсказки, `pinyin` — как оно читается.
// `note` — короткое пояснение для подсказки там, где имени мало.
export const MODEL_RENAMES = Object.freeze([
  // ---------- Geely ----------
  { brand: "Geely", model: "Xing Rui", toModel: "Preface", zh: "星瑞", pinyin: "Xingrui" },
  { brand: "Geely", model: "Binyue", toModel: "Coolray", zh: "缤越", pinyin: "Binyue" },
  { brand: "Geely", model: "Haoyue", toModel: "Okavango", zh: "豪越", pinyin: "Haoyue" },
  { brand: "Geely", model: "Borui", toModel: "Emgrand GT", zh: "博瑞", pinyin: "Borui" },
  // Решение Сергея: главным именем ставим дилерское, китайское уходит в подсказку и в поиск.
  { brand: "Geely", model: "Xingyue L", toModel: "Monjaro", zh: "星越L", pinyin: "Xingyue L" },
  // 银河E5 в Беларуси продаёт дилер под именем Geely EX5 — без приставки Galaxy,
  // поэтому модель переезжает из подмарки «Geely Galaxy» в основную марку.
  { brand: "Geely Galaxy", model: "Galaxy E5", toBrand: "Geely", toModel: "EX5", zh: "银河E5", pinyin: "Yinhe E5" },
  // 星愿 у завода и на av.by называется EX2 — тоже без приставки.
  { brand: "Geely Galaxy", model: "Starry Wish", toBrand: "Geely", toModel: "EX2", zh: "星愿", pinyin: "Xingyuan" },
  { brand: "Geely Galaxy", model: "Galaxy Xingyao 8", toModel: "Galaxy Starshine 8", zh: "星耀8", pinyin: "Xingyao 8" },
  { brand: "Geely Galaxy", model: "Galaxy Stellar 6", toModel: "Galaxy Starshine 6", zh: "星耀6", pinyin: "Xingyao 6" },
  { brand: "Geely Galaxy", model: "Galaxy Starship 7 EM-i", toModel: "Galaxy Starship 7", zh: "星舰7", pinyin: "Xingjian 7" },

  // ---------- Haval, Chery, Changan, Jetour, Great Wall ----------
  { brand: "Haval", model: "Big Dog", toModel: "Dargo", zh: "大狗", pinyin: "Dagou" },
  { brand: "Haval", model: "Da Gou 2nd Gen", toModel: "Dargo II", zh: "二代大狗", pinyin: "Erdai Dagou" },
  { brand: "Chery", model: "Tiggo 5x", toModel: "Tiggo 4 Pro", zh: "瑞虎5x", pinyin: "Ruihu 5x" },
  { brand: "Chery", model: "Tiggo 7 PLUS", toModel: "Tiggo 7 Pro Max", zh: "瑞虎7 PLUS", pinyin: "Ruihu 7 PLUS" },
  { brand: "Chery", model: "Tiggo 8 PLUS", toModel: "Tiggo 8 Pro Max", zh: "瑞虎8 PLUS", pinyin: "Ruihu 8 PLUS" },
  { brand: "Changan", model: "Ruicheng CC", toModel: "Raeton CC", zh: "锐程CC", pinyin: "Ruicheng CC" },
  { brand: "Jetour", model: "Dasheng", toModel: "Dashing", zh: "大圣", pinyin: "Dasheng" },
  { brand: "Jetour", model: "Traveler", toModel: "T2", zh: "旅行者", pinyin: "Lüxingzhe" },
  { brand: "Great Wall", model: "Pao", toModel: "Poer", zh: "炮", pinyin: "Pao" },

  // ---------- Voyah ----------
  { brand: "Voyah", model: "Dreamer", toModel: "Dream", zh: "梦想家", pinyin: "Mengxiangjia" },
  { brand: "Voyah", model: "Zhiyin", toModel: "Courage", zh: "知音", pinyin: "Zhiyin" },
  { brand: "Voyah", model: "Zhuiguang", toModel: "Passion", zh: "追光", pinyin: "Zhuiguang" },
  { brand: "Voyah", model: "Zhuiguang L", toModel: "Passion L", zh: "追光L", pinyin: "Zhuiguang L" },

  // ---------- HIMA: пять марок вместо одной ----------
  { brand: "HIMA", model: "M5", toBrand: "AITO", toModel: "M5", zh: "问界M5", pinyin: "Wenjie M5" },
  { brand: "HIMA", model: "M6", toBrand: "AITO", toModel: "M6", zh: "问界M6", pinyin: "Wenjie M6" },
  { brand: "HIMA", model: "M7", toBrand: "AITO", toModel: "M7", zh: "问界M7", pinyin: "Wenjie M7" },
  { brand: "HIMA", model: "M8", toBrand: "AITO", toModel: "M8", zh: "问界M8", pinyin: "Wenjie M8" },
  { brand: "HIMA", model: "M9", toBrand: "AITO", toModel: "M9", zh: "问界M9", pinyin: "Wenjie M9" },
  { brand: "HIMA", model: "Luxeed R7", toBrand: "Luxeed", toModel: "R7", zh: "智界R7", pinyin: "Zhijie R7" },
  { brand: "HIMA", model: "Zhijie S7", toBrand: "Luxeed", toModel: "S7", zh: "智界S7", pinyin: "Zhijie S7" },
  { brand: "HIMA", model: "Enjoy World S9", toBrand: "Stelato", toModel: "S9", zh: "享界S9", pinyin: "Xiangjie S9" },
  { brand: "HIMA", model: "Enjoy World S9T", toBrand: "Stelato", toModel: "S9T", zh: "享界S9T", pinyin: "Xiangjie S9T" },
  // Те же машины, но с именем подмарки, уже приклеенным к модели: так они лежали в базе
  // до разделения марок, и так их иногда присылает источник.
  { brand: "HIMA", model: "Luxeed S7", toBrand: "Luxeed", toModel: "S7", zh: "智界S7", pinyin: "Zhijie S7" },
  { brand: "HIMA", model: "Stelato S9", toBrand: "Stelato", toModel: "S9", zh: "享界S9", pinyin: "Xiangjie S9" },
  { brand: "HIMA", model: "Stelato S9T", toBrand: "Stelato", toModel: "S9T", zh: "享界S9T", pinyin: "Xiangjie S9T" },
  { brand: "HIMA", model: "AITO M9", toBrand: "AITO", toModel: "M9", zh: "问界M9", pinyin: "Wenjie M9" },
  { brand: "HIMA", model: "Shangjie SUV", toBrand: "Shangjie", toModel: "H5", zh: "尚界H5", pinyin: "Shangjie H5" },
  { brand: "HIMA", model: "Shangjie Z7", toBrand: "Shangjie", toModel: "Z7", zh: "尚界Z7", pinyin: "Shangjie Z7" },
  { brand: "HIMA", model: "Shangjie Z7T", toBrand: "Shangjie", toModel: "Z7T", zh: "尚界Z7T", pinyin: "Shangjie Z7T" },
  { brand: "HIMA", model: "Zunjie MPV", toBrand: "Maextro", toModel: "MPV", zh: "尊界", pinyin: "Zunjie" },

  // ---------- Volkswagen ----------
  // Sagitar, Magotan и Tiguan L Сергей оставил под китайскими именами.
  { brand: "Volkswagen", model: "ID.7 VIZZION", toModel: "ID.7", zh: "ID.7 揽巡", pinyin: "ID.7 VIZZION" },
  { brand: "Volkswagen", model: "ID. UNYX 06", toModel: "ID.UNYX 06", zh: "ID.与众 06", pinyin: "ID. Yuzhong 06" },
  { brand: "Volkswagen", model: "ID. UNYX 07", toModel: "ID.UNYX 07", zh: "ID.与众 07", pinyin: "ID. Yuzhong 07" },
  { brand: "Volkswagen", model: "ID. UNYX 08", toModel: "ID.UNYX 08", zh: "ID.与众 08", pinyin: "ID. Yuzhong 08" },
  { brand: "Volkswagen", model: "CC", toModel: "Passat CC", zh: "一汽-大众CC", pinyin: "CC" },

  // ---------- Toyota, Honda, Mazda, Hyundai, Kia ----------
  { brand: "Toyota", model: "RAV4 Rongfang", toModel: "RAV4", zh: "荣放", pinyin: "Rongfang", note: "китайское имя RAV4" },
  // Две записи источника на одну машину: 致炫 приходит и как «Yaris L», и как «YARiS L Zhi Xuan».
  { brand: "Toyota", model: "Yaris L", toModel: "Yaris", zh: "致炫", pinyin: "Zhixuan" },
  { brand: "Toyota", model: "YARiS L Zhi Xuan", toModel: "Yaris", zh: "致炫", pinyin: "Zhixuan" },
  { brand: "Honda", model: "Haoying", toModel: "Breeze", zh: "皓影", pinyin: "Haoying" },
  { brand: "Honda", model: "Lingpai", toModel: "Crider", zh: "凌派", pinyin: "Lingpai" },
  { brand: "Honda", model: "Vezel", toModel: "HR-V", zh: "缤智", pinyin: "Binzhi" },
  { brand: "Mazda", model: "Atenza", toModel: "Mazda6", zh: "阿特兹", pinyin: "Atezi" },
  { brand: "Mazda", model: "Mazda3 Axela", toModel: "Mazda3", zh: "昂克赛拉", pinyin: "Angkesaila" },
  { brand: "Mazda", model: "CX-50 Xingye", toModel: "CX-50", zh: "CX-50 行也", pinyin: "CX-50 Xingye" },
  { brand: "Hyundai", model: "Beijing Hyundai ix35", toModel: "ix35", zh: "北京现代ix35", pinyin: "Beijing Xiandai ix35", note: "к названию был приклеен завод" },
  // Сергей оставил ix25 под своим именем — убираем только приклеенный завод.
  { brand: "Hyundai", model: "Beijing Hyundai ix25", toModel: "ix25", zh: "北京现代ix25", pinyin: "Beijing Xiandai ix25", note: "к названию был приклеен завод" },
  { brand: "Hyundai", model: "Kustu", toModel: "Custin", zh: "库斯途", pinyin: "Kusitu" },
  { brand: "Kia", model: "KX3 Smart Run", toModel: "KX3", zh: "KX3 智跑", pinyin: "KX3 Zhipao" },

  // ---------- Мелочь ----------
  { brand: "Denza", model: "Z9GT", toModel: "Z9 GT", zh: "腾势Z9GT", pinyin: "Tengshi Z9GT" },

  // ---------- «New Energy» → «PHEV» ----------
  // Китайское «新能源» значит «на новой энергии» и покрывает и гибрид, и электромобиль.
  // Где под именем лежат только гибриды — ставим PHEV. Где только электромобили —
  // EV: назвать электромобиль гибридом на карточке было бы неправдой.
  { brand: "BMW", model: "5 Series New Energy", toModel: "5 Series PHEV", zh: "5系新能源", pinyin: "5 Xi Xinnengyuan" },
  { brand: "BMW", model: "7 Series New Energy", toModel: "7 Series PHEV", zh: "7系新能源", pinyin: "7 Xi Xinnengyuan" },
  { brand: "BMW", model: "X1 New Energy", toModel: "X1 PHEV", zh: "X1新能源", pinyin: "X1 Xinnengyuan" },
  { brand: "BMW", model: "X5 New Energy", toModel: "X5 PHEV", zh: "X5新能源", pinyin: "X5 Xinnengyuan" },
  { brand: "Mercedes-Benz", model: "C-Class New Energy", toModel: "C-Class PHEV", zh: "C级新能源", pinyin: "C Ji Xinnengyuan" },
  { brand: "Mercedes-Benz", model: "C-Class AMG New Energy", toModel: "C-Class AMG PHEV", zh: "AMG C级新能源", pinyin: "AMG C Ji Xinnengyuan" },
  { brand: "Mercedes-Benz", model: "E-Class New Energy", toModel: "E-Class PHEV", zh: "E级新能源", pinyin: "E Ji Xinnengyuan" },
  { brand: "Mercedes-Benz", model: "S-Class New Energy", toModel: "S-Class PHEV", zh: "S级新能源", pinyin: "S Ji Xinnengyuan" },
  { brand: "Mercedes-Benz", model: "GLC New Energy", toModel: "GLC PHEV", zh: "GLC新能源", pinyin: "GLC Xinnengyuan" },
  { brand: "Mercedes-Benz", model: "GLE New Energy", toModel: "GLE PHEV", zh: "GLE新能源", pinyin: "GLE Xinnengyuan" },
  { brand: "Mercedes-Benz", model: "GLE Coupe New Energy", toModel: "GLE Coupe PHEV", zh: "GLE轿跑新能源", pinyin: "GLE Jiaopao Xinnengyuan" },
  { brand: "Mercedes-Benz", model: "AMG GT New Energy", toModel: "AMG GT PHEV", zh: "AMG GT新能源", pinyin: "AMG GT Xinnengyuan" },
  { brand: "Mercedes-Benz", model: "G-Class New Energy", toModel: "G-Class EV", zh: "G级新能源", pinyin: "G Ji Xinnengyuan", note: "под этим именем едут только электромобили" },
  { brand: "Mercedes-Benz", model: "CLA New Energy", toModel: "CLA EV", zh: "CLA新能源", pinyin: "CLA Xinnengyuan", note: "под этим именем едут только электромобили" },
  { brand: "Audi", model: "A6L New Energy", toModel: "A6L PHEV", zh: "A6L新能源", pinyin: "A6L Xinnengyuan" },
  { brand: "Audi", model: "A8 New Energy", toModel: "A8 PHEV", zh: "A8新能源", pinyin: "A8 Xinnengyuan" },
  { brand: "Volkswagen", model: "Passat New Energy", toModel: "Passat PHEV", zh: "帕萨特新能源", pinyin: "Passat Xinnengyuan" },
  { brand: "Volkswagen", model: "Touareg New Energy", toModel: "Touareg PHEV", zh: "途锐新能源", pinyin: "Tourui Xinnengyuan" },
  { brand: "Volkswagen", model: "Tharu New Energy", toModel: "Tharu EV", zh: "途岳新能源", pinyin: "Tuyue Xinnengyuan", note: "под этим именем едут только электромобили" },
  { brand: "Toyota", model: "Wildlander New Energy", toModel: "Wildlander PHEV", zh: "威兰达新能源", pinyin: "Weilanda Xinnengyuan" },
  { brand: "Toyota", model: "RAV4 Rongfang Dual Engine E+", toModel: "RAV4 PHEV", zh: "荣放双擎E+", pinyin: "Rongfang Shuangqing E+" },
  { brand: "Toyota", model: "Corolla Twin Engine E+", toModel: "Corolla PHEV", zh: "卡罗拉双擎E+", pinyin: "Kaluola Shuangqing E+" },
  { brand: "Toyota", model: "IZOA E-engine", toModel: "IZOA EV", zh: "奕泽E进擎", pinyin: "Yize E Jinqing", note: "под этим именем едут только электромобили" },
  { brand: "Lynk & Co", model: "03 New Energy", toModel: "03 PHEV", zh: "领克03新能源", pinyin: "Lingke 03 Xinnengyuan" },
  { brand: "Lynk & Co", model: "02 New Energy", toModel: "02 PHEV", zh: "领克02新能源", pinyin: "Lingke 02 Xinnengyuan" },

  // У BYD своё слово для гибрида с розеткой — DM-i, и в каталоге оно уже стоит у половины
  // моделей (Seal 05 DM-i, Song L DM-i). На av.by тоже пишут «Song Plus DM». Поэтому у BYD
  // «New Energy» превращается в DM-i, а не в PHEV.
  { brand: "BYD", model: "Song Pro New Energy", toModel: "Song Pro DM-i", zh: "宋Pro新能源", pinyin: "Song Pro Xinnengyuan" },
  { brand: "BYD", model: "Song MAX New Energy", toModel: "Song MAX DM-i", zh: "宋MAX新能源", pinyin: "Song MAX Xinnengyuan" },
  { brand: "BYD", model: "Song PLUS PHEV", toModel: "Song PLUS DM-i", zh: "宋PLUS新能源", pinyin: "Song PLUS Xinnengyuan" },
  { brand: "BYD", model: "Qin New Energy", toModel: "Qin EV", zh: "秦新能源", pinyin: "Qin Xinnengyuan", note: "под этим именем едут только электромобили" },
  // Здесь под одним китайским именем едут и гибриды, и электромобили: ни PHEV, ни EV
  // одно на всех не подходит, а убрать приставку нельзя — рядом стоит бензиновый Tang.
  // Поэтому машины разъезжаются по типу двигателя, как это делает сам BYD и как уже
  // названы остальные модели в каталоге (Seal 05 DM-i, Sealion 05 EV, Song L EV).
  { brand: "BYD", model: "Tang New Energy", toModel: "Tang DM-i", byPowertrain: { "Электромобиль": "Tang EV" }, zh: "唐新能源", pinyin: "Tang Xinnengyuan" },
  { brand: "BYD", model: "Seal 06 New Energy", toModel: "Seal 06 DM-i", byPowertrain: { "Электромобиль": "Seal 06 EV" }, zh: "海豹06新能源", pinyin: "Haibao 06 Xinnengyuan" },
  { brand: "BYD", model: "Sealion 06 New Energy", toModel: "Sealion 06 DM-i", byPowertrain: { "Электромобиль": "Sealion 06 EV" }, zh: "海狮06新能源", pinyin: "Haishi 06 Xinnengyuan" },
  // Те же три модели без приставки: так их присылает источник и так они успели лечь
  // в базу. Бензиновый Tang при этом остаётся просто Tang — приставка только у машин
  // с розеткой, ей и отличается от бензиновой версии в каталоге.
  { brand: "BYD", model: "Tang", toModel: "Tang", byPowertrain: { "Гибрид": "Tang DM-i", "Электромобиль": "Tang EV" }, zh: "唐", pinyin: "Tang" },
  { brand: "BYD", model: "Seal 06", toModel: "Seal 06", byPowertrain: { "Гибрид": "Seal 06 DM-i", "Электромобиль": "Seal 06 EV" }, zh: "海豹06", pinyin: "Haibao 06" },
  { brand: "BYD", model: "Sealion 06", toModel: "Sealion 06", byPowertrain: { "Гибрид": "Sealion 06 DM-i", "Электромобиль": "Sealion 06 EV" }, zh: "海狮06", pinyin: "Haishi 06" },
  // Написания источника, которых сейчас в живом каталоге нет, но они уже приходили
  // раньше. Держим здесь, чтобы вернувшаяся машина не завелась под китайским именем.
  { brand: "BYD", model: "Song New Energy", toModel: "Song EV", zh: "宋新能源", pinyin: "Song Xinnengyuan" },
  { brand: "BYD", model: "Song PLUS New Energy", toModel: "Song PLUS EV", zh: "宋PLUS新能源", pinyin: "Song PLUS Xinnengyuan" },
  { brand: "Changan", model: "Eado New Energy", toModel: "Eado EV", zh: "逸动新能源", pinyin: "Yidong Xinnengyuan" },
  { brand: "Volvo", model: "XC40 New Energy", toModel: "XC40 EV", zh: "XC40新能源", pinyin: "XC40 Xinnengyuan" },
]);

const key = (brand, model) => `${String(brand || "").trim().toLocaleLowerCase("en-US")} ${String(model || "").trim().toLocaleLowerCase("en-US")}`;

const RENAME_BY_KEY = new Map(MODEL_RENAMES.map((entry) => [key(entry.brand, entry.model), entry]));

// Модель уже переименована, а марка ещё старая — так выходит, когда имя модели прошло
// через общий словарь названий до переезда в другую марку. Заводим второй ключ, иначе
// 银河E5 останется «Geely Galaxy EX5» вместо «Geely EX5».
for (const entry of MODEL_RENAMES) {
  if (!entry.toBrand || entry.toBrand === entry.brand) continue;
  const pending = key(entry.brand, entry.toModel);
  if (!RENAME_BY_KEY.has(pending)) RENAME_BY_KEY.set(pending, entry);
}

// Марку «HIMA» словарь марок приводит к AITO — самой большой из пяти. Поэтому модель
// может дойти сюда уже с маркой AITO, но ещё с именем подмарки в названии: «AITO Luxeed
// R7», «AITO Shangjie SUV». Без этих ключей такая машина осталась бы у AITO навсегда.
const HUAWEI_HOST_BRAND = "AITO";
for (const entry of MODEL_RENAMES) {
  if (entry.brand !== "HIMA" || entry.toBrand === HUAWEI_HOST_BRAND) continue;
  const pending = key(HUAWEI_HOST_BRAND, entry.model);
  if (!RENAME_BY_KEY.has(pending)) RENAME_BY_KEY.set(pending, entry);
}

// Китайское имя ищем и по старому названию, и по новому: карточка знает уже
// переименованную машину, а импорт — ещё китайскую.
const CHINESE_BY_KEY = new Map();
for (const entry of MODEL_RENAMES) {
  if (!entry.zh) continue;
  const info = Object.freeze({ zh: entry.zh, pinyin: entry.pinyin || "", note: entry.note || "" });
  CHINESE_BY_KEY.set(key(entry.brand, entry.model), info);
  CHINESE_BY_KEY.set(key(entry.toBrand || entry.brand, entry.toModel), info);
  for (const model of Object.values(entry.byPowertrain || {})) {
    CHINESE_BY_KEY.set(key(entry.toBrand || entry.brand, model), info);
  }
}

// Как машина называется в Китае. Возвращает `null`, если имя совпадает с нашим —
// тогда подсказку в карточке показывать не нужно.
export function chineseModelName(brand, model) {
  return CHINESE_BY_KEY.get(key(brand, model)) || null;
}

// Беларуское название по тому, что пришло от источника. Возвращает марку и модель:
// у части моделей вместе с именем меняется и марка (HIMA → AITO, Luxeed, Stelato).
//
// `powertrain` нужен трём моделям BYD, где под одним китайским именем едут и гибриды,
// и электромобили. Без него машина получит гибридное имя — так названо большинство.
export function belarusianName(brand, model, powertrain) {
  const entry = RENAME_BY_KEY.get(key(brand, model));
  if (!entry) return { brand: String(brand || "").trim(), model: String(model || "").trim() };
  const byPowertrain = entry.byPowertrain?.[String(powertrain || "").trim()];
  return { brand: entry.toBrand || entry.brand, model: byPowertrain || entry.toModel };
}

export function isRenamedModel(brand, model) {
  return RENAME_BY_KEY.has(key(brand, model));
}
