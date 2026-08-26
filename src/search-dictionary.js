// Словари быстрого поиска: строка вида «Zeekr 001 2025» или «фольксваген гольф 1.4
// автомат» разбирается на марку, модель, кузов, привод, тип двигателя и коробку по
// тем же значениям, что стоят в выпадающих фильтрах каталога. Модуль без React и
// сети — весь разбор названий проверяется тестами.
import { colorLabelForWord } from "./colors.js";
import { latinVariants } from "./search-query.js";

// Быстрый поиск на главной: строка вида «Zeekr 001 2025» разбирается на марку,
// модель и годы по тому же справочнику, которым живут выпадающие фильтры, а
// найденное сразу подменяет витрину «Каталог» ниже — сервер ничего нового не считает.
// Надстрочные знаки в латинских названиях марок («Škoda», «Citroën») снимаются:
// посетитель набирает «skoda» и «citroen», а без этого такие марки не находились
// вовсе — «š» и «ë» вылетали вместе с остальными посторонними знаками. Кириллицу
// такое разложение трогать нельзя: «й» превратилось бы в «и».
const foldLatinMarks = (value) => value.replace(/[^\u0400-\u04ff]+/g, (part) => part.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
export const searchNormalize = (value) =>
  foldLatinMarks(String(value ?? ""))
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^0-9a-zа-я]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export const searchMatchRank = (candidate, text) => {
  const norm = searchNormalize(candidate);
  const compact = norm.replace(/ /g, "");
  const textCompact = text.replace(/ /g, "");
  if (!compact || !textCompact) return 0;
  if (norm === text || compact === textCompact) return 4;
  if (norm.startsWith(text) || compact.startsWith(textCompact)) return 3;
  if (norm.includes(` ${text}`)) return 2;
  if (compact.includes(textCompact)) return 1;
  return 0;
};
// Кроме набранного, пробуем его же латиницей: марки и модели в каталоге пишутся
// латиницей, а «8х», «гт», «про» набирают русскими буквами.
export const rankSearchEntries = (entries, text) => {
  const variants = [...new Set([text, ...latinVariants(text).map(searchNormalize)])].filter(Boolean);
  return entries
    .map((entry) => ({ ...entry, rank: Math.max(...variants.map((variant) => searchMatchRank(entry.name, variant))) }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank || b.count - a.count);
};

// Словари запроса: привод, кузов и тип двигателя словами — «задний», «седан»,
// «гибрид». Сравниваем по началу слова, чтобы понимались и падежи с множественным
// числом («заднего», «седаны»). Значения совпадают с вариантами выпадающих фильтров.
const HERO_DRIVE_ALIASES = [
  ["задн", "Задний"],
  ["передн", "Передний"],
  ["полн", "Полный"],
  ["rwd", "Задний"],
  ["fwd", "Передний"],
  ["awd", "Полный"],
  ["4wd", "Полный"],
  ["4x4", "Полный"],
  ["4х4", "Полный"],
];
const HERO_BODY_ALIASES = [
  ["кроссовер", "SUV / кроссовер"],
  ["suv", "SUV / кроссовер"],
  // «Джип» в этом списке не стоит: это ещё и марка Jeep, поэтому его разбирают
  // отдельно — см. isJeepWord в collectHeroAliases.
  ["внедорожник", "SUV / кроссовер"],
  ["паркетник", "SUV / кроссовер"],
  ["кросс", "SUV / кроссовер"],
  ["хэтч", "Хэтчбек"],
  ["хетч", "Хэтчбек"],
  ["хэч", "Хэтчбек"],
  ["хеч", "Хэтчбек"],
  ["седан", "Седан"],
  ["сидан", "Седан"],
  // «Лифтбэк» через «э» и сокращённое «лифт» — тот же кузов.
  ["лифт", "Лифтбек"],
  ["лифтбек", "Лифтбек"],
  ["хэтчбек", "Хэтчбек"],
  ["хетчбек", "Хэтчбек"],
  ["универсал", "Универсал"],
  ["минивэн", "Минивэн"],
  ["минивен", "Минивэн"],
  ["вэн", "Минивэн"],
];
export const HERO_TYPE_ALIASES = [
  ["электро", "Электромобиль"],
  ["электри", "Электромобиль"],
  ["гибрид", "Гибрид"],
  ["гибрет", "Гибрид"],
  ["phev", "Гибрид"],
  ["hev", "Гибрид"],
  // Машины с двигателем внутреннего сгорания каталог хранит одним типом «ДВС»,
  // а бензин от дизеля отличает топливо (см. HERO_FUEL_ALIASES).
  ["двс", "ДВС"],
];
// Топливо. Такое слово говорит и о типе машины («бензиновый» — это всегда ДВС),
// поэтому ставит оба признака сразу. Дизельных мы не возим, и запрос «дизель»
// честно покажет, что таких машин нет, вместо подмены бензиновыми.
const HERO_FUEL_ALIASES = [
  ["бензин", "Бензин"],
  ["дизел", "Дизель"],
];
// Коробка передач. Источник описывает её строкой («7-speed wet dual-clutch»),
// разбор в src/engine-spec.js сводит описания к четырём привычным словам.
export const HERO_GEARBOX_ALIASES = [
  ["автомат", "Автомат"],
  ["акпп", "Автомат"],
  ["механик", "Механика"],
  ["мкпп", "Механика"],
  ["ручк", "Механика"],
  ["робот", "Робот"],
  ["преселектив", "Робот"],
  ["dsg", "Робот"],
  ["dct", "Робот"],
  ["дсг", "Робот"],
  ["вариатор", "Вариатор"],
  ["cvt", "Вариатор"],
];
// «Джип» — и марка Jeep, и разговорное «внедорожник»; какое из двух, видно по
// остатку запроса (см. collectHeroAliases). Латинское «jeep» — всегда марка.
export const isJeepWord = (word) => word.startsWith("джип") || word === "jeep";
export const heroAliasValue = (word, aliases) => {
  for (const [alias, value] of aliases) if (word.startsWith(alias)) return value;
  return "";
};

// Соответствие клавиш латинской и русской раскладок: «яуулк» — это zeekr,
// набранный без переключения. Карта работает в обе стороны.
const LAYOUT_PAIRS = [
  ["q", "й"], ["w", "ц"], ["e", "у"], ["r", "к"], ["t", "е"], ["y", "н"], ["u", "г"], ["i", "ш"], ["o", "щ"], ["p", "з"], ["[", "х"], ["]", "ъ"],
  ["a", "ф"], ["s", "ы"], ["d", "в"], ["f", "а"], ["g", "п"], ["h", "р"], ["j", "о"], ["k", "л"], ["l", "д"], [";", "ж"], ["'", "э"],
  ["z", "я"], ["x", "ч"], ["c", "с"], ["v", "м"], ["b", "и"], ["n", "т"], ["m", "ь"], [",", "б"], [".", "ю"],
];
const LAYOUT_SWAP = new Map();
for (const [latin, cyrillic] of LAYOUT_PAIRS) {
  LAYOUT_SWAP.set(latin, cyrillic);
  LAYOUT_SWAP.set(cyrillic, latin);
}
export const swapKeyboardLayout = (value) => [...String(value ?? "").toLocaleLowerCase("ru")].map((char) => LAYOUT_SWAP.get(char) || char).join("");

// Русские написания марок: каталог хранит латиницу, а посетители часто пишут
// кириллицей — «ауди», «мерс», «зикр». Многословные варианты стоят раньше
// коротких, чтобы «джили галакси» не обрывалось на «джили».
export const HERO_BRAND_RU = [
  ["джили галакси", "Geely Galaxy"],
  ["гили галакси", "Geely Galaxy"],
  ["ли авто", "Li Auto"],
  // Марки бензиновых машин: их в каталоге сорок семь, и почти все посетители
  // набирают их кириллицей. Многословные стоят раньше коротких, чтобы
  // «ленд ровер» не обрывалось на первом слове.
  ["ленд ровер", "Land Rover"],
  ["лэнд ровер", "Land Rover"],
  ["лендровер", "Land Rover"],
  ["рендж ровер", "Land Rover"],
  ["рэндж ровер", "Land Rover"],
  ["ренж ровер", "Land Rover"],
  ["рендж", "Land Rover"],
  ["ровер", "Land Rover"],
  ["альфа ромео", "Alfa Romeo"],
  ["альфа", "Alfa Romeo"],
  ["грейт волл", "Great Wall"],
  ["грэйт волл", "Great Wall"],
  ["грейтволл", "Great Wall"],
  ["акура", "Acura"],
  ["бентли", "Bentley"],
  ["бьюик", "Buick"],
  ["буик", "Buick"],
  ["кадиллак", "Cadillac"],
  ["кадилак", "Cadillac"],
  ["чанган", "Changan"],
  ["чангань", "Changan"],
  ["чери", "Chery"],
  ["черри", "Chery"],
  ["шевроле", "Chevrolet"],
  ["шеви", "Chevrolet"],
  ["крайслер", "Chrysler"],
  ["ситроен", "Citroën"],
  ["ситроэн", "Citroën"],
  ["фиат", "Fiat"],
  ["форд", "Ford"],
  ["джиэмси", "GMC"],
  ["хавал", "Haval"],
  ["хавейл", "Haval"],
  ["хонда", "Honda"],
  ["хендай", "Hyundai"],
  ["хундай", "Hyundai"],
  ["хюндай", "Hyundai"],
  ["хендэ", "Hyundai"],
  ["инфинити", "Infiniti"],
  ["ягуар", "Jaguar"],
  ["джетур", "Jetour"],
  ["жетур", "Jetour"],
  ["киа", "Kia"],
  ["лексус", "Lexus"],
  ["линкольн", "Lincoln"],
  ["мазерати", "Maserati"],
  ["мицубиси", "Mitsubishi"],
  ["мицубиши", "Mitsubishi"],
  ["митсубиси", "Mitsubishi"],
  ["митсубиши", "Mitsubishi"],
  ["ниссан", "Nissan"],
  ["нисан", "Nissan"],
  ["пежо", "Peugeot"],
  ["порше", "Porsche"],
  ["порш", "Porsche"],
  ["рено", "Renault"],
  ["шкода", "Škoda"],
  ["смарт", "smart"],
  ["субару", "Subaru"],
  ["сузуки", "Suzuki"],
  ["судзуки", "Suzuki"],
  ["вольво", "Volvo"],
  ["волво", "Volvo"],
  ["мини", "MINI"],
  ["мг", "MG"],
  ["линк энд ко", "Lynk & Co"],
  ["линк ко", "Lynk & Co"],
  ["лип мотор", "Leapmotor"],
  ["аион", "AION"],
  ["эйон", "AION"],
  ["ауди", "Audi"],
  ["аватр", "Avatr"],
  ["аватар", "Avatr"],
  ["бмв", "BMW"],
  ["бид", "BYD"],
  ["бад", "BYD"],
  ["буд", "BYD"],
  ["биуайди", "BYD"],
  ["дипал", "Deepal"],
  ["денза", "Denza"],
  ["дунфэн", "Dongfeng"],
  ["дунфен", "Dongfeng"],
  ["донгфенг", "Dongfeng"],
  // Без второго слова «джили» — это марка Geely целиком: у неё в каталоге и
  // бензиновые машины, и электрические Galaxy, а «джили галакси» стоит выше.
  ["джили", "Geely"],
  ["гили", "Geely"],
  // Альянс Huawei разъехался по пяти маркам, и его прежнее общее имя всё равно
  // ищут — отправляем на самую большую из них.
  ["хима", "AITO"],
  ["аито", "AITO"],
  ["аито", "AITO"],
  ["вэньцзе", "AITO"],
  ["веньцзе", "AITO"],
  ["люксид", "Luxeed"],
  ["чжицзе", "Luxeed"],
  ["стелато", "Stelato"],
  ["сянцзе", "Stelato"],
  ["шанцзе", "Shangjie"],
  ["маэкстро", "Maextro"],
  ["цзуньцзе", "Maextro"],
  ["хунци", "Hongqi"],
  ["хонгци", "Hongqi"],
  ["липмотор", "Leapmotor"],
  ["лисян", "Li Auto"],
  ["ликсян", "Li Auto"],
  ["линк", "Lynk & Co"],
  ["мазда", "Mazda"],
  ["мерседес", "Mercedes-Benz"],
  ["мерс", "Mercedes-Benz"],
  ["нио", "NIO"],
  ["ора", "ORA"],
  ["тесла", "Tesla"],
  ["тойота", "Toyota"],
  ["тоета", "Toyota"],
  ["фольксваген", "Volkswagen"],
  ["фольцваген", "Volkswagen"],
  // Через «в» пишут не реже, чем через «ф».
  ["волксваген", "Volkswagen"],
  ["вольксваген", "Volkswagen"],
  ["вольцваген", "Volkswagen"],
  ["волсваген", "Volkswagen"],
  ["вольсваген", "Volkswagen"],
  ["воксваген", "Volkswagen"],
  ["воях", "Voyah"],
  ["воя", "Voyah"],
  ["икспенг", "XPeng"],
  ["сяопенг", "XPeng"],
  ["сяопэн", "XPeng"],
  ["сяоми", "Xiaomi"],
  ["ксиаоми", "Xiaomi"],
  ["шаоми", "Xiaomi"],
  ["зикр", "Zeekr"],
  ["зикер", "Zeekr"],
  ["зеекр", "Zeekr"],
  // Латинские сокращения, опечатки и жаргон: каталожные написания посетители
  // часто сокращают («vw») или пишут на слух («vokswagen», «тайота», «мерин»).
  ["vw", "Volkswagen"],
  ["vokswagen", "Volkswagen"],
  ["volswagen", "Volkswagen"],
  ["wolkswagen", "Volkswagen"],
  ["folkswagen", "Volkswagen"],
  ["volksvagen", "Volkswagen"],
  ["folksvagen", "Volkswagen"],
  ["mb", "Mercedes-Benz"],
  ["merc", "Mercedes-Benz"],
  ["benz", "Mercedes-Benz"],
  ["бенц", "Mercedes-Benz"],
  ["мерин", "Mercedes-Benz"],
  ["беха", "BMW"],
  ["бэха", "BMW"],
  ["бумер", "BMW"],
  ["тайота", "Toyota"],
  ["zikr", "Zeekr"],
  ["zeker", "Zeekr"],
  ["zeeker", "Zeekr"],
  ["xiomi", "Xiaomi"],
  ["xaomi", "Xiaomi"],
  ["джилли", "Geely"],
  ["хпенг", "XPeng"],
];
// Русские названия популярных моделей: каталог хранит латиницу, а ищут кириллицей —
// «камри», «гольф», «рав 4». Словарь дописывается по мере появления марок; названия
// вроде «C-Class» приводятся к каталожному написанию ещё до разбора чисел
// (см. expandRussianModelNames), потому что «с» разбор чисел принимает за «от».
export const HERO_MODEL_RU = [
  // Китайские имена переименованных моделей: их видят в чужих объявлениях и обзорах
  // и приходят с ними в поиск. Отправляем на беларуское название той же машины.
  // Длинные имена стоят раньше коротких: разбор берёт первое совпадение.
  ["zhuiguang l", "Passion L"],
  ["galaxy xingyao 8", "Galaxy Starshine 8"],
  ["galaxy stellar 6", "Galaxy Starshine 6"],
  ["shangjie suv", "H5"],
  ["beijing hyundai ix35", "ix35"],
  ["beijing hyundai ix25", "ix25"],
  ["kx3 smart run", "KX3"],
  ["mazda3 axela", "Mazda3"],
  ["cx-50 xingye", "CX-50"],
  ["rav4 rongfang", "RAV4"],
  ["id.7 vizzion", "ID.7"],
  ["ruicheng cc", "Raeton CC"],
  ["xing rui", "Preface"],
  ["син руй", "Preface"],
  ["синжуй", "Preface"],
  ["xingyue l", "Monjaro"],
  ["синъюэ", "Monjaro"],
  ["galaxy e5", "EX5"],
  ["starry wish", "EX2"],
  ["xingyuan", "EX2"],
  ["big dog", "Dargo"],
  ["биг дог", "Dargo"],
  ["da gou", "Dargo II"],
  ["дагоу", "Dargo"],
  ["tiggo 5x", "Tiggo 4 Pro"],
  ["tiggo 7 plus", "Tiggo 7 Pro Max"],
  ["tiggo 8 plus", "Tiggo 8 Pro Max"],
  ["enjoy world", "S9"],
  ["zhijie", "S7"],
  ["binyue", "Coolray"],
  ["биньюэ", "Coolray"],
  ["haoyue", "Okavango"],
  ["хаоюэ", "Okavango"],
  ["borui", "Emgrand GT"],
  ["боруй", "Emgrand GT"],
  ["dasheng", "Dashing"],
  ["дашэн", "Dashing"],
  ["traveler", "T2"],
  ["dreamer", "Dream"],
  ["дример", "Dream"],
  ["zhiyin", "Courage"],
  ["чжиинь", "Courage"],
  ["zhuiguang", "Passion"],
  ["чжуйгуан", "Passion"],
  ["haoying", "Breeze"],
  ["хаоин", "Breeze"],
  ["lingpai", "Crider"],
  ["линпай", "Crider"],
  ["vezel", "HR-V"],
  ["везел", "HR-V"],
  ["atenza", "Mazda6"],
  ["атенза", "Mazda6"],
  ["axela", "Mazda3"],
  ["аксела", "Mazda3"],
  ["kustu", "Custin"],
  ["z9gt", "Z9 GT"],
  ["rongfang", "RAV4"],
  ["zunjie", "MPV"],
  ["pao", "Poer"],
  ["рав 4", "RAV4"],
  ["рав4", "RAV4"],
  ["прадо", "Prado"],
  ["камри", "Camry"],
  ["королла", "Corolla"],
  ["корола", "Corolla"],
  ["хайлендер", "Highlander"],
  ["хайлюкс", "Hilux"],
  ["аккорд", "Accord"],
  ["акорд", "Accord"],
  ["цивик", "Civic"],
  ["сивик", "Civic"],
  ["црв", "CR-V"],
  ["кашкай", "Qashqai"],
  ["икстрейл", "X-Trail"],
  ["теана", "Teana"],
  ["гольф", "Golf"],
  ["пассат", "Passat"],
  ["поло", "Polo"],
  ["туарег", "Touareg"],
  ["тигуан", "Tiguan"],
  ["джетта", "Sagitar"],
  ["лавида", "Lavida"],
  ["бора", "Bora"],
  ["мажотан", "Magotan"],
  ["магатан", "Magotan"],
  ["терамонт", "Teramont"],
  ["сантана", "Santana"],
  ["виллоран", "Viloran"],
  ["вилоран", "Viloran"],
  ["октавия", "Octavia"],
  ["кодиак", "Kodiaq"],
  ["туксон", "Tucson"],
  ["санта фе", "Santa Fe"],
  ["солярис", "Verna"],
  ["спортейдж", "Sportage"],
  ["соренто", "Sorento"],
  ["фокус", "Focus"],
  ["мондео", "Mondeo"],
  ["эксплорер", "Explorer"],
  ["куга", "Kuga"],
  ["круз", "Cruze"],
  ["малибу", "Malibu"],
  ["каптива", "Captiva"],
  ["дискавери", "Discovery"],
  ["дефендер", "Defender"],
  ["ивок", "Evoque"],
  ["эвок", "Evoque"],
  ["кайен", "Cayenne"],
  ["макан", "Macan"],
  ["панамера", "Panamera"],
  ["аутлендер", "Outlander"],
  ["паджеро", "Pajero"],
  ["форестер", "Forester"],
  ["аутбек", "Outback"],
  ["дастер", "Duster"],
  ["колеос", "Koleos"],
  ["витара", "Vitara"],
  ["компас", "Compass"],
  ["чероки", "Cherokee"],
  ["вранглер", "Wrangler"],
  ["купер", "Cooper"],
  ["тигго", "Tiggo"],
  ["джолион", "Jolion"],
  ["ховер", "Hover"],
  ["гелик", "G-Class"],
  ["гелендваген", "G-Class"],
  ["гелендваген", "G-Class"],
  ["майбах", "Maybach S-Class"],
  ["вито", "Vito"],
  ["трешка", "3 Series"],
  ["троечка", "3 Series"],
  ["пятерка", "5 Series"],
  ["семерка", "7 Series"],
];

// Названия, которые разбор чисел испортил бы раньше словарей: «мерседес с класс»
// теряет «с» (разбор читает его как «от»), «гелендваген» пишут одним словом.
// Поэтому такие имена приводятся к каталожному написанию прямо в строке запроса,
// до всякого разбора.
const HERO_QUERY_REWRITES = [
  // «Ленд крузер» переписываем целиком: иначе «ленд» станет маркой Land Rover
  // раньше, чем словарь моделей увидит вторую половину названия.
  [/(^|[^0-9a-zа-я])(?:ленд|лэнд|ланд)[ -]?к(?:ру|рау)зер[а-я]*/g, "$1land cruiser"],
  [/(^|[^0-9a-zа-я])крузак[а-я]*/g, "$1land cruiser"],
  [/(^|[^0-9a-zа-я])(?:ц|це|цэ|c)[ -]?класс[а-я]*/g, "$1c-class"],
  [/(^|[^0-9a-zа-я])(?:е|э|e)[ -]?класс[а-я]*/g, "$1e-class"],
  [/(^|[^0-9a-zа-я])(?:эс|s|с)[ -]?класс[а-я]*/g, "$1s-class"],
  [/(^|[^0-9a-zа-я])(?:а|эй|a)[ -]?класс[а-я]*/g, "$1a-class"],
  [/(^|[^0-9a-zа-я])(?:ви|в|v)[ -]?класс[а-я]*/g, "$1v-class"],
  [/(^|[^0-9a-zа-я])(?:джи|г|g)[ -]?класс[а-я]*/g, "$1g-class"],
  [/(^|[^0-9a-zа-я])гелендваген[а-я]*/g, "$1g-class"],
  [/(^|[^0-9a-zа-я])гелик[а-я]*/g, "$1g-class"],
  [/(^|[^0-9a-zа-я])(глц|глк)(?![а-я])/g, "$1glc"],
  [/(^|[^0-9a-zа-я])гле(?![а-я])/g, "$1gle"],
  [/(^|[^0-9a-zа-я])глс(?![а-я])/g, "$1gls"],
  [/(^|[^0-9a-zа-я])гла(?![а-я])/g, "$1gla"],
  [/(^|[^0-9a-zа-я])глб(?![а-я])/g, "$1glb"],
];
export const rewriteQueryNames = (query) => HERO_QUERY_REWRITES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(query ?? "").toLocaleLowerCase("ru").replace(/ё/g, "е"));

// Заменяет русские названия марок на каталожные. Недописанное слово от четырёх
// букв тоже считается («фолькс» → Volkswagen), как и падежи с множественным
// числом («теслы», «мерсом», «тойоты») — окончание до трёх букв поверх основы.
const translateAliasWords = (words, aliases) => {
  const result = [];
  for (let index = 0; index < words.length; index += 1) {
    let replacement = null;
    let consumed = 1;
    for (const [alias, brandName] of aliases) {
      const aliasWords = alias.split(" ");
      const slice = words.slice(index, index + aliasWords.length);
      if (slice.length !== aliasWords.length) continue;
      const exact = aliasWords.every((part, position) => slice[position] === part);
      const prefix = aliasWords.length === 1 && slice[0].length >= 4 && aliasWords[0].startsWith(slice[0]);
      // Короткие псевдонимы («воя», «нио») склоняем только целиком, иначе
      // обычные слова («вояж») превращались бы в марку.
      const inflected =
        aliasWords.length === 1 &&
        ((aliasWords[0].length >= 4 && slice[0].startsWith(aliasWords[0]) && slice[0].length - aliasWords[0].length <= 3) ||
          (aliasWords[0].length >= 5 && slice[0].startsWith(aliasWords[0].slice(0, -1)) && slice[0].length - aliasWords[0].length + 1 <= 3));
      if (exact || prefix || inflected) {
        replacement = brandName;
        consumed = aliasWords.length;
        break;
      }
    }
    if (replacement) {
      result.push(...searchNormalize(replacement).split(" "));
      index += consumed - 1;
    } else {
      result.push(words[index]);
    }
  }
  return result;
};
export const translateBrandWords = (words) => translateAliasWords(words, HERO_BRAND_RU);
// Модели переводим после марок: «джили тигго» — сначала марка, потом её модель.
export const translateModelWords = (words) => translateAliasWords(words, HERO_MODEL_RU);

// в «или» ещё при разборе чисел): «001 и 007» — два куска текста, каждый ищется сам.
const MODEL_SEPARATORS = new Set(["или", "и", "либо"]);
export const splitModelSegments = (value) => {
  const segments = [];
  let current = [];
  for (const word of String(value).split(" ").filter(Boolean)) {
    if (MODEL_SEPARATORS.has(word)) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    } else current.push(word);
  }
  if (current.length) segments.push(current.join(" "));
  return segments;
};

// Слова-исключения: всё, что стоит после них, попадает в списки «не показывать».
// Отдельного окончания у этой части нет — она идёт до конца строки, поэтому такое
// слово пишут последним. Голое «не» маркером не считаем: «не дорогой зикр» — это
// не просьба убрать Zeekr; а вот «не считая» и «за исключением» узнаются по второму
// слову («не» и «за» перед ним отбрасывает разбор чисел).
const HERO_EXCLUDE_EXACT = new Set(["кроме", "окромя", "без", "минус", "помимо", "except"]);
const HERO_EXCLUDE_STEMS = ["исключ", "убер", "убра", "убир", "выкин", "скрыт", "спрят", "счита", "отбро", "отсе"];
export const isHeroExcludeWord = (word) => HERO_EXCLUDE_EXACT.has(word) || HERO_EXCLUDE_STEMS.some((stem) => word.startsWith(stem));
// Разбор слов запроса на привод, кузов, тип двигателя, цвет и остаток (марка с моделью).
export const collectHeroAliases = (tokens) => {
  let drive = "";
  let bodyType = "";
  let powertrain = "";
  let gearbox = "";
  let fuel = "";
  // Место, где в запросе стоял «джип»: марка это или кузов, станет ясно только
  // после разбора остальных слов.
  let jeepAt = -1;
  const colors = [];
  const words = [];
  for (const word of tokens) {
    // Само слово «привод» ничего не уточняет — направление уже назвало соседнее слово.
    if (word.startsWith("привод")) continue;
    // «Тесла модель 3»: русское «модель» — это Model из названия.
    if (word === "модель") {
      words.push("model");
      continue;
    }
    // «Джип» проверяем раньше кузовов: марка это или внедорожник, решится в конце,
    // когда станет видно, осталось ли в запросе слово под модель.
    if (word === "jeep") {
      words.push("jeep");
      continue;
    }
    if (isJeepWord(word)) {
      if (jeepAt === -1) jeepAt = words.length;
      continue;
    }
    const driveValue = heroAliasValue(word, HERO_DRIVE_ALIASES);
    if (driveValue) {
      drive = driveValue;
      continue;
    }
    const bodyValue = heroAliasValue(word, HERO_BODY_ALIASES);
    if (bodyValue) {
      bodyType = bodyValue;
      continue;
    }
    const typeValue = heroAliasValue(word, HERO_TYPE_ALIASES);
    if (typeValue) {
      powertrain = typeValue;
      continue;
    }
    const fuelValue = heroAliasValue(word, HERO_FUEL_ALIASES);
    if (fuelValue) {
      fuel = fuelValue;
      powertrain = "ДВС";
      continue;
    }
    const gearboxValue = heroAliasValue(word, HERO_GEARBOX_ALIASES);
    if (gearboxValue) {
      gearbox = gearboxValue;
      continue;
    }
    // «Чёрный или белый зикр»: цветов может быть несколько, ищутся любым из них.
    const colorLabel = colorLabelForWord(word);
    if (colorLabel) {
      if (!colors.includes(colorLabel)) colors.push(colorLabel);
      continue;
    }
    words.push(word);
  }
  // «Или» по краям осталось от съеденных соседей («чёрный или белый бмв») —
  // марке и модели оно только мешает.
  while (words.length && MODEL_SEPARATORS.has(words[0])) words.shift();
  while (words.length && MODEL_SEPARATORS.has(words[words.length - 1])) words.pop();
  // «Джип» без продолжения — просьба показать внедорожники; «джип компас» —
  // марка Jeep с моделью.
  if (jeepAt >= 0) {
    if (words.some((word) => !MODEL_SEPARATORS.has(word))) words.splice(Math.min(jeepAt, words.length), 0, "jeep");
    else if (!bodyType) bodyType = "SUV / кроссовер";
  }
  return { drive, bodyType, powertrain, gearbox, fuel, colors, words };
};

