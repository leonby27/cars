// Имена корейских моделей так, как их ищут в Беларуси.
//
// Площадка Encar называет машину по-корейски и с кодом поколения: «그랜저 (GN7)»,
// «더 뉴 아반떼», «쏘나타 디 엣지». Парсер переведёт это в латиницу, но и латинское
// имя площадки не всегда беларуское: Avante в Беларуси — Elantra, Morning — Picanto.
// Правило то же, что у китайских имён (config/model-names-by.mjs, MODEL_NAMES_BY.md):
// главное имя — то, под которым модель стоит на av.by. Здесь лежат и корейские
// написания, и латинские, чтобы словарь работал независимо от того, что отдаст парсер.
//
// Приставки поколений («더 뉴», «올 뉴», «The New», «All New») и коды в скобках («(GN7)»,
// «(DN8)») отбрасываются: в каталоге одна страница на модель, а не на поколение.
// LPG-версии (쏘나타 LPi и т. п.) сюда не заводим: газовые машины не парсим (решение
// Сергея 29.09.2026), вопрос вернётся при написании парсера Encar.
const KOREAN_MODEL_NAMES = new Map([
  // ---------- Hyundai ----------
  ["hyundai|아반떼", "Elantra"], ["hyundai|avante", "Elantra"], ["hyundai|elantra", "Elantra"],
  ["hyundai|그랜저", "Grandeur"], ["hyundai|grandeur", "Grandeur"], ["hyundai|azera", "Grandeur"],
  ["hyundai|쏘나타", "Sonata"], ["hyundai|sonata", "Sonata"],
  ["hyundai|투싼", "Tucson"], ["hyundai|tucson", "Tucson"],
  ["hyundai|싼타페", "Santa Fe"], ["hyundai|santa fe", "Santa Fe"], ["hyundai|santafe", "Santa Fe"],
  ["hyundai|팰리세이드", "Palisade"], ["hyundai|palisade", "Palisade"],
  ["hyundai|코나", "Kona"], ["hyundai|kona", "Kona"],
  ["hyundai|캐스퍼", "Casper"], ["hyundai|casper", "Casper"],
  ["hyundai|베뉴", "Venue"], ["hyundai|venue", "Venue"],
  ["hyundai|스타리아", "Staria"], ["hyundai|staria", "Staria"],
  ["hyundai|아이오닉", "IONIQ"], ["hyundai|ioniq", "IONIQ"],
  ["hyundai|아이오닉 5", "IONIQ 5"], ["hyundai|ioniq 5", "IONIQ 5"], ["hyundai|ioniq5", "IONIQ 5"],
  ["hyundai|아이오닉 6", "IONIQ 6"], ["hyundai|ioniq 6", "IONIQ 6"], ["hyundai|ioniq6", "IONIQ 6"],
  ["hyundai|아이오닉 9", "IONIQ 9"], ["hyundai|ioniq 9", "IONIQ 9"],
  ["hyundai|넥쏘", "Nexo"], ["hyundai|nexo", "Nexo"],
  ["hyundai|i30", "i30"], ["hyundai|벨로스터", "Veloster"], ["hyundai|veloster", "Veloster"],
  // ---------- Kia ----------
  ["kia|k3", "K3"], ["kia|k5", "K5"], ["kia|k7", "K7"], ["kia|k8", "K8"], ["kia|k9", "K9"],
  ["kia|쏘렌토", "Sorento"], ["kia|sorento", "Sorento"],
  ["kia|스포티지", "Sportage"], ["kia|sportage", "Sportage"],
  ["kia|셀토스", "Seltos"], ["kia|seltos", "Seltos"],
  // Площадка пишет английское имя Carnival с опечаткой — «Canival».
  ["kia|카니발", "Carnival"], ["kia|carnival", "Carnival"], ["kia|canival", "Carnival"],
  ["kia|니로", "Niro"], ["kia|niro", "Niro"],
  ["kia|모닝", "Picanto"], ["kia|morning", "Picanto"], ["kia|picanto", "Picanto"],
  ["kia|레이", "Ray"], ["kia|ray", "Ray"],
  ["kia|모하비", "Mohave"], ["kia|mohave", "Mohave"],
  ["kia|스팅어", "Stinger"], ["kia|stinger", "Stinger"],
  ["kia|ev3", "EV3"], ["kia|ev5", "EV5"], ["kia|ev6", "EV6"], ["kia|ev9", "EV9"],
  ["kia|쏘울", "Soul"], ["kia|soul", "Soul"],
  // ---------- Genesis ----------
  ["genesis|g70", "G70"], ["genesis|g80", "G80"], ["genesis|g90", "G90"],
  ["genesis|gv60", "GV60"], ["genesis|gv70", "GV70"], ["genesis|gv80", "GV80"],
  ["hyundai|santafe", "Santa Fe"], ["hyundai|ioniq5", "IONIQ 5"], ["hyundai|ioniq6", "IONIQ 6"], ["hyundai|ioniq9", "IONIQ 9"],
  ["hyundai|스타렉스", "Grand Starex"], ["hyundai|starex", "Grand Starex"], ["hyundai|grand starex", "Grand Starex"],
  ["hyundai|엑센트", "Accent"], ["hyundai|accent", "Accent"], ["hyundai|i40", "i40"],
  ["hyundai|맥스크루즈", "Maxcruz"], ["hyundai|maxcruz", "Maxcruz"], ["hyundai|아슬란", "Aslan"], ["hyundai|aslan", "Aslan"],
  ["hyundai|엘란트라", "Elantra"],
  // ---------- Kia ----------
  ["kia|스토닉", "Stonic"], ["kia|stonic", "Stonic"],
  ["kia|프라이드", "Rio"], ["kia|pride", "Rio"], ["kia|rio", "Rio"],
  ["kia|타스만", "Tasman"], ["kia|tasman", "Tasman"],
  ["kia|카렌스", "Carens"], ["kia|carens", "Carens"],
  ["kia|포르테", "Forte"], ["kia|forte", "Forte"],
  ["kia|ev4", "EV4"], ["kia|pv5", "PV5"],
  // ---------- KGM (бывший SsangYong) ----------
  ["kgm|토레스", "Torres"], ["kgm|torres", "Torres"],
  ["kgm|티볼리", "Tivoli"], ["kgm|tivoli", "Tivoli"],
  ["kgm|코란도", "Korando"], ["kgm|korando", "Korando"],
  ["kgm|렉스턴", "Rexton"], ["kgm|rexton", "Rexton"],
  ["kgm|액티언", "Actyon"], ["kgm|actyon", "Actyon"],
  ["kgm|무쏘", "Musso"], ["kgm|musso", "Musso"],
  // ---------- Импортные марки на корейском рынке ----------
  // Площадка пишет их по-корейски («5시리즈», «E-클래스», «카이엔») или по-английски
  // через дефис («5-Series», «E-Class»). Эталон — как модель уже называется в каталоге
  // по данным Che168 (замер 29.09.2026): «5 Series», «E-Class», «GLC», «Cayenne».
  ["bmw|1시리즈", "1 Series"], ["bmw|2시리즈", "2 Series"], ["bmw|3시리즈", "3 Series"], ["bmw|4시리즈", "4 Series"],
  ["bmw|5시리즈", "5 Series"], ["bmw|6시리즈", "6 Series"], ["bmw|7시리즈", "7 Series"], ["bmw|8시리즈", "8 Series"],
  ["bmw|1-series", "1 Series"], ["bmw|2-series", "2 Series"], ["bmw|3-series", "3 Series"], ["bmw|4-series", "4 Series"],
  ["bmw|5-series", "5 Series"], ["bmw|6-series", "6 Series"], ["bmw|7-series", "7 Series"], ["bmw|8-series", "8 Series"],
  ["bmw|그란투리스모 (gt)", "Gran Turismo"], ["bmw|그란투리스모", "Gran Turismo"], ["bmw|gran turismo (gt)", "Gran Turismo"],
  ["bmw|x5m", "X5 M"], ["bmw|x6m", "X6 M"], ["bmw|x4m", "X4 M"], ["bmw|x3m", "X3 M"], ["bmw|m 쿠페/로드스터", "M Coupe"],
  ["mercedes-benz|a-클래스", "A-Class"], ["mercedes-benz|b-클래스", "B-Class"], ["mercedes-benz|c-클래스", "C-Class"],
  ["mercedes-benz|e-클래스", "E-Class"], ["mercedes-benz|s-클래스", "S-Class"], ["mercedes-benz|cla-클래스", "CLA"],
  ["mercedes-benz|cls-클래스", "CLS"], ["mercedes-benz|cle-클래스", "CLE"], ["mercedes-benz|gla-클래스", "GLA"],
  ["mercedes-benz|glb-클래스", "GLB"], ["mercedes-benz|glc-클래스", "GLC"], ["mercedes-benz|gle-클래스", "GLE"],
  ["mercedes-benz|gls-클래스", "GLS"], ["mercedes-benz|g-클래스", "G-Class"], ["mercedes-benz|v-클래스", "V-Class"],
  ["mercedes-benz|sl-클래스", "SL"], ["mercedes-benz|slk-클래스", "SLK"], ["mercedes-benz|slc-클래스", "SLC"],
  ["mercedes-benz|glk-클래스", "GLK"], ["mercedes-benz|m-클래스", "M-Class"], ["mercedes-benz|스프린터", "Sprinter"],
  ["mercedes-benz|cla-class", "CLA"], ["mercedes-benz|cls-class", "CLS"], ["mercedes-benz|cle-class", "CLE"],
  ["mercedes-benz|gla-class", "GLA"], ["mercedes-benz|glb-class", "GLB"], ["mercedes-benz|glc-class", "GLC"],
  ["mercedes-benz|gle-class", "GLE"], ["mercedes-benz|gls-class", "GLS"], ["mercedes-benz|sl-class", "SL"],
  ["mercedes-benz|slk-class", "SLK"], ["mercedes-benz|slc-class", "SLC"], ["mercedes-benz|glk-class", "GLK"],
  ["audi|e-트론", "e-tron"], ["audi|q4 e-트론", "Q4 e-tron"], ["audi|q6 e-트론", "Q6 e-tron"], ["audi|q8 e-트론", "Q8 e-tron"],
  ["audi|a6 e-트론", "A6 e-tron"], ["audi|e-트론 gt", "e-tron GT"], ["audi|rs e-트론 gt", "RS e-tron GT"], ["audi|sq6 e-트론", "SQ6 e-tron"],
  ["volkswagen|티구안", "Tiguan"], ["volkswagen|골프", "Golf"], ["volkswagen|제타", "Jetta"], ["volkswagen|아테온", "Arteon"],
  ["volkswagen|투아렉", "Touareg"], ["volkswagen|파사트", "Passat"], ["volkswagen|cc", "Passat CC"], ["volkswagen|비틀", "Beetle"],
  ["volkswagen|티록", "T-Roc"], ["volkswagen|t-roc", "T-Roc"], ["volkswagen|시로코", "Scirocco"], ["volkswagen|아틀라스", "Atlas"],
  ["volkswagen|폴로", "Polo"], ["volkswagen|페이톤", "Phaeton"], ["volkswagen|멀티밴", "Multivan"],
  ["tesla|모델 y", "Model Y"], ["tesla|모델 3", "Model 3"], ["tesla|모델 x", "Model X"], ["tesla|모델 s", "Model S"], ["tesla|사이버트럭", "Cybertruck"],
  ["toyota|캠리", "Camry"], ["toyota|프리우스", "Prius"], ["toyota|알파드", "Alphard"], ["toyota|시에나", "Sienna"], ["toyota|크라운", "Crown"],
  ["toyota|아발론", "Avalon"], ["toyota|하이랜더", "Highlander"], ["toyota|수프라", "Supra"], ["toyota|타코마", "Tacoma"], ["toyota|툰드라", "Tundra"],
  ["toyota|fj 크루져", "FJ Cruiser"], ["toyota|야리스(비츠)", "Yaris"], ["toyota|노아", "Noah"], ["toyota|에스티마", "Estima"],
  ["honda|어코드", "Accord"], ["honda|파일럿", "Pilot"], ["honda|오딧세이", "Odyssey"], ["honda|시빅", "Civic"], ["honda|레전드", "Legend"],
  ["nissan|알티마", "Altima"], ["nissan|큐브", "Cube"], ["nissan|쥬크", "Juke"], ["nissan|맥시마", "Maxima"], ["nissan|무라노", "Murano"],
  ["nissan|엑스트레일", "X-Trail"], ["nissan|패스파인더", "Pathfinder"], ["nissan|리프", "Leaf"], ["nissan|캐시카이", "Qashqai"],
  ["nissan|로그", "Rogue"], ["nissan|센트라", "Sentra"], ["nissan|티아나", "Teana"], ["nissan|엘그란드", "Elgrand"],
  ["porsche|카이엔", "Cayenne"], ["porsche|파나메라", "Panamera"], ["porsche|마칸", "Macan"], ["porsche|타이칸", "Taycan"],
  ["porsche|박스터", "Boxster"], ["porsche|카이맨", "Cayman"],
  ["land rover|레인지로버", "Range Rover"], ["land rover|디스커버리", "Discovery"], ["land rover|디스커버리 스포츠", "Discovery Sport"],
  ["land rover|레인지로버 스포츠", "Range Rover Sport"], ["land rover|레인지로버 이보크", "Range Rover Evoque"],
  ["land rover|레인지로버 벨라", "Range Rover Velar"], ["land rover|디펜더", "Defender"], ["land rover|프리랜더", "Freelander"],
  ["land rover|rangerover", "Range Rover"], ["land rover|range rover evoque", "Range Rover Evoque"],
  // MINI: хэтчбек Cooper в каталоге зовётся просто «MINI» (так у Che168 и на av.by).
  ["mini|쿠퍼", "MINI"], ["mini|cooper", "MINI"], ["mini|쿠퍼 컨버터블", "MINI"], ["mini|cooper convertible", "MINI"],
  ["mini|컨트리맨", "COUNTRYMAN"], ["mini|countryman", "COUNTRYMAN"], ["mini|클럽맨", "CLUBMAN"], ["mini|clubman", "CLUBMAN"],
  ["mini|에이스맨", "Aceman"], ["mini|aceman", "Aceman"], ["mini|쿠페", "Coupe"], ["mini|로드스터", "Roadster"], ["mini|페이스맨", "Paceman"],
  ["mazda|마쯔다 3", "Mazda3"], ["mazda|mazda 3", "Mazda3"], ["mazda|mx-5 miata", "MX-5"],
  // BYD в Корее продаётся под экспортными именами; в каталоге — имена Che168.
  ["byd|씨라이언 7", "Sealion 07 EV"], ["byd|sealion 7", "Sealion 07 EV"], ["byd|아토 3", "Yuan PLUS"], ["byd|atto 3", "Yuan PLUS"],
  ["byd|돌핀", "Dolphin"], ["byd|씰", "Seal"],
]);

// Что отбрасываем из названия площадки: приставки поколений и коды в скобках.
const GENERATION_PREFIX = /^(?:디\s*올\s*뉴|디\s*뉴|더\s*올\s*뉴|더\s*뉴|올\s*뉴|뉴|the\s+all\s+new|the\s+new|all\s+new|new)\s+/i;
const GENERATION_CODE = /\s*\([A-Za-z0-9\s.-]*\)\s*$/;
// Электрические и гибридные пометки в имени: «아이오닉 5 롱레인지» → IONIQ 5 (версия — не модель).
const TRIM_TAIL = /\s+(?:롱레인지|스탠다드|하이브리드|hybrid|hev|phev|long range|standard)\b.*$/i;

/** Имя из объявления Encar без приставок поколения и кода в скобках. */
export const cleanKoreanModel = (model) => String(model || "")
  .replace(GENERATION_CODE, "")
  .replace(GENERATION_PREFIX, "")
  .replace(TRIM_TAIL, "")
  .replace(/\s{2,}/g, " ")
  .trim();

/**
 * Беларуское имя корейской модели: «아반떼 (CN7)» → «Elantra», «Morning» → «Picanto».
 * Незнакомая модель возвращается очищенной от приставок, как пришла.
 */
export function koreanModelName(brand, model) {
  const cleaned = cleanKoreanModel(model);
  const key = `${String(brand || "").trim().toLocaleLowerCase("en-US")}|${cleaned.toLocaleLowerCase("en-US")}`;
  return KOREAN_MODEL_NAMES.get(key) || cleaned;
}
