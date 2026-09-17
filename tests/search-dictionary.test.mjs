import test from "node:test";
import assert from "node:assert/strict";
import { collectHeroAliases, findBrandInText, listSearchMatches, listSearchVariants, rankSearchEntries, resolveBrandAndModels, rewriteQueryNames, searchNormalize, translateBrandWords, translateModelWords } from "../src/search-dictionary.js";

// Строка запроса проходит тот же путь, что и в приложении: разбор чисел отдаёт
// остаток, он режется на слова, из них вынимаются кузов, привод, тип и коробка,
// а оставшееся переводится в каталожные названия марок и моделей.
const words = (query) => searchNormalize(rewriteQueryNames(query)).split(" ").filter(Boolean);
const parse = (query) => {
  const collected = collectHeroAliases(words(query));
  return { ...collected, text: translateModelWords(translateBrandWords(collected.words)).join(" ") };
};

test("бензин, дизель и ДВС ищут машины с двигателем", () => {
  assert.equal(parse("бензин").powertrain, "ДВС");
  assert.equal(parse("бензиновый кроссовер").powertrain, "ДВС");
  assert.equal(parse("дизель").powertrain, "ДВС");
  assert.equal(parse("двс").powertrain, "ДВС");
  // Топливо названо словом — оно отбирается отдельно от типа машины: дизельных
  // мы не возим, и такой запрос честно ничего не найдёт.
  assert.equal(parse("бензин").fuel, "Бензин");
  assert.equal(parse("дизельный кроссовер").fuel, "Дизель");
  assert.equal(parse("двс").fuel, "");
  // Прежние типы никуда не делись.
  assert.equal(parse("электро").powertrain, "Электромобиль");
  assert.equal(parse("гибрид").powertrain, "Гибрид");
});

test("коробка передач словами", () => {
  assert.equal(parse("автомат").gearbox, "Автомат");
  assert.equal(parse("на автомате").gearbox, "Автомат");
  assert.equal(parse("акпп").gearbox, "Автомат");
  assert.equal(parse("механика").gearbox, "Механика");
  assert.equal(parse("робот").gearbox, "Робот");
  assert.equal(parse("dsg").gearbox, "Робот");
  assert.equal(parse("вариатор").gearbox, "Вариатор");
  // Слово про коробку не должно оставаться в тексте для поиска модели.
  assert.equal(parse("гольф автомат").text, "golf");
});

test("«джип» — внедорожник в одиночку и марка Jeep со вторым словом", () => {
  const alone = parse("джип");
  assert.equal(alone.bodyType, "SUV / кроссовер");
  assert.equal(alone.text, "");
  const withModel = parse("джип компас");
  assert.equal(withModel.bodyType, "");
  assert.equal(withModel.text, "jeep compass");
  // Латиницей это всегда марка.
  assert.equal(parse("jeep").text, "jeep");
});

test("марки бензиновых машин пишутся кириллицей", () => {
  const cases = [
    ["хонда", "honda"],
    ["хонду", "honda"],
    ["ниссан", "nissan"],
    ["хендай", "hyundai"],
    ["киа", "kia"],
    ["ленд ровер", "land rover"],
    ["грейт волл", "great wall"],
    ["мицубиси", "mitsubishi"],
    ["субару", "subaru"],
    ["пежо", "peugeot"],
    ["вольво", "volvo"],
    ["хавал", "haval"],
    ["чери", "chery"],
    ["джетур", "jetour"],
    ["лексус", "lexus"],
    ["порше", "porsche"],
  ];
  for (const [query, expected] of cases) assert.equal(parse(query).text, expected, `«${query}» не стало ${expected}`);
});

test("«джили» и «джили галакси» ведут в объединённую марку Geely", () => {
  assert.equal(parse("джили").text, "geely");
  assert.equal(parse("джили галакси").text, "geely");
});

test("русские названия моделей приводятся к каталожным", () => {
  assert.equal(parse("камри").text, "camry");
  assert.equal(parse("рав 4").text, "rav4");
  assert.equal(parse("рав4").text, "rav4");
  assert.equal(parse("тойота ленд крузер").text, "toyota land cruiser");
  assert.equal(parse("фольксваген гольф").text, "volkswagen golf");
  assert.equal(parse("тигуан").text, "tiguan");
});

test("классы Mercedes и разговорные названия", () => {
  assert.equal(parse("мерседес е класс").text, "mercedes benz e class");
  assert.equal(parse("мерседес с класс").text, "mercedes benz s class");
  assert.equal(parse("мерседес ц класс").text, "mercedes benz c class");
  assert.equal(parse("гелик").text, "g class");
  assert.equal(parse("гелендваген").text, "g class");
  assert.equal(parse("мерседес глц").text, "mercedes benz glc");
  assert.equal(parse("трешка бмв").text, "3 series bmw");
});

test("надстрочные знаки в марках не мешают поиску", () => {
  const entries = [{ name:"Škoda", count:10 }, { name:"Citroën", count:5 }];
  assert.equal(rankSearchEntries(entries, "skoda")[0]?.name, "Škoda");
  assert.equal(rankSearchEntries(entries, "citroen")[0]?.name, "Citroën");
});

test("название модели без суффикса находит каталожное с суффиксом", () => {
  const models = [{ name:"Tiguan L", count:700 }, { name:"Tayron", count:900 }];
  assert.equal(rankSearchEntries(models, "tiguan")[0]?.name, "Tiguan L");
});

test("поиск в списке марок понимает часть слова и кириллицу", () => {
  const brands = ["Audi", "Avatr", "BMW", "Chery", "Haval", "Li Auto", "Zeekr"];
  const found = (query) => {
    const variants = listSearchVariants(query);
    return brands.filter((brand) => variants.some((variant) => searchNormalize(brand).includes(variant)));
  };
  // Незаконченное слово кириллицей: словарь марок «ау» не знает, а буква
  // в букву это «au» — и находится всё, где такие буквы есть.
  assert.deepEqual(found("ау"), ["Audi", "Li Auto"]);
  assert.deepEqual(found("ват"), ["Avatr"]);
  // Целые русские написания по-прежнему работают через словарь.
  assert.deepEqual(found("зикр"), ["Zeekr"]);
  assert.deepEqual(found("чери"), ["Chery"]);
  assert.deepEqual(found("хавал"), ["Haval"]);
  // Латиница как есть и середина слова.
  assert.deepEqual(found("ud"), ["Audi"]);
  assert.deepEqual(found("вмw"), ["BMW"]);
  // Пустая строка ничего не фильтрует.
  assert.deepEqual(listSearchVariants("   "), []);
});

test("заглавная буква с телефонной клавиатуры не мешает поиску", () => {
  const models = ["A5L Sportback", "E5 Sportback", "Han", "Yuan UP"];
  const found = (query) => {
    const variants = listSearchVariants(query);
    return models.filter((model) => variants.some((variant) => searchNormalize(model).includes(variant)));
  };
  // Телефон сам ставит заглавную в начале слова — раньше она оставалась
  // кириллической («Спортb») и не находилось ничего.
  assert.deepEqual(found("Спортб"), ["A5L Sportback", "E5 Sportback"]);
  assert.deepEqual(found("Хан"), ["Han"]);
  assert.deepEqual(found("ХАН"), ["Han"]);
  assert.deepEqual(found("Юань"), ["Yuan UP"]);
  // Хвост названия кузова по звучанию: буква в букву вышло бы «sportbek».
  assert.deepEqual(found("Спортбэк"), ["A5L Sportback", "E5 Sportback"]);
  assert.deepEqual(found("спортбека"), ["A5L Sportback", "E5 Sportback"]);
});

test("список марок и моделей ищется по всем написаниям справочника", () => {
  const brands = ["Zeekr", "Audi", "Mercedes-Benz", "Land Rover", "Great Wall", "Xiaomi", "Li Auto"];
  const models = ["Dargo", "Han", "Preface", "Coolray", "A5L Sportback", "G-Class"];
  // Недописанное русское написание: словарь знает «зикр», и его начало тоже годится.
  assert.deepEqual(listSearchMatches(brands, "зик"), ["Zeekr"]);
  assert.deepEqual(listSearchMatches(brands, "Зик"), ["Zeekr"]);
  assert.deepEqual(listSearchMatches(brands, "зее"), ["Zeekr"]);
  assert.deepEqual(listSearchMatches(brands, "мер"), ["Mercedes-Benz"]);
  assert.deepEqual(listSearchMatches(brands, "мерин"), ["Mercedes-Benz"]);
  assert.deepEqual(listSearchMatches(brands, "рендж"), ["Land Rover"]);
  assert.deepEqual(listSearchMatches(brands, "грейт"), ["Great Wall"]);
  assert.deepEqual(listSearchMatches(brands, "сяо"), ["Xiaomi"]);
  // Модели — по тому же справочнику: «биг дог» это Dargo, «гелик» — G-Class.
  assert.deepEqual(listSearchMatches(models, "биг дог"), ["Dargo"]);
  assert.deepEqual(listSearchMatches(models, "дагоу"), ["Dargo"]);
  assert.deepEqual(listSearchMatches(models, "Хан"), ["Han"]);
  assert.deepEqual(listSearchMatches(models, "гелик"), ["G-Class"]);
  assert.deepEqual(listSearchMatches(models, "Спортбэк"), ["A5L Sportback"]);
  // Пустой запрос ничего не отсеивает.
  assert.deepEqual(listSearchMatches(brands, "  "), brands);
});

// Разбор остатка строки на марку и модель — тот же путь, каким идёт быстрый поиск
// на главной: справочник каталога подменён небольшим списком, модели марки отдаёт
// функция вместо запроса к серверу.
const CATALOG = {
  BMW: ["X3", "X5", "iX3", "iX1", "i3", "3 Series"],
  MINI: ["Cooper", "Countryman"],
  Zeekr: ["001", "007", "7X"],
  Tesla: ["Model 3", "Model Y"],
  "Li Auto": ["L6", "L7"],
  Geely: ["Preface", "Coolray"],
};
const entries = (names) => names.map((name) => ({ name, count: 10 }));
const resolve = (query) =>
  resolveBrandAndModels(dictionaryText(query), {
    brandEntries: entries(Object.keys(CATALOG)),
    modelEntries: entries([...new Set(Object.values(CATALOG).flat())]),
    modelsOfBrand: async (brand) => entries(CATALOG[brand] || []),
  });
const dictionaryText = (query) => parse(query).text;

test("марку находим и когда она написана после модели", async () => {
  assert.deepEqual(await resolve("bmw ix3"), { brand: "BMW", models: ["iX3"], matched: true });
  // То же самое задом наперёд и по-русски: искали именно BMW iX3.
  assert.deepEqual(await resolve("ix3 bmw"), { brand: "BMW", models: ["iX3"], matched: true });
  assert.deepEqual(await resolve("ix3 бмв"), { brand: "BMW", models: ["iX3"], matched: true });
  assert.deepEqual(await resolve("001 зикр"), { brand: "Zeekr", models: ["001"], matched: true });
  assert.deepEqual(await resolve("l6 ли авто"), { brand: "Li Auto", models: ["L6"], matched: true });
  // Перечисление моделей тоже переживает марку в конце: «x3» попутно находит и iX3,
  // как в обычном поиске по части названия.
  assert.deepEqual(await resolve("x3 или x5 bmw"), { brand: "BMW", models: ["X3", "iX3", "X5"], matched: true });
});

test("одна марка без модели и марка с чужой моделью", async () => {
  assert.deepEqual(await resolve("bmw"), { brand: "BMW", models: [], matched: true });
  // Марка первая, модель не её — пустая выдача честнее, чем все машины марки.
  assert.deepEqual(await resolve("bmw coolray"), { brand: "", models: [], matched: false });
  // Марка не первая: слово могло совпасть случайно, поэтому строку разбираем
  // заново целиком — «x5 mini» так и не находит ничего, а не все MINI подряд.
  assert.deepEqual(await resolve("x5 mini"), { brand: "", models: [], matched: false });
});

test("недописанная марка и модель без марки ищутся как раньше", async () => {
  assert.deepEqual(await resolve("bm"), { brand: "BMW", models: [], matched: true });
  assert.deepEqual(await resolve("зикр"), { brand: "Zeekr", models: [], matched: true });
  assert.deepEqual(await resolve("coolray"), { brand: "", models: ["Coolray"], matched: true });
  assert.deepEqual(await resolve("тесла модель 3"), { brand: "Tesla", models: ["Model 3"], matched: true });
  assert.deepEqual(await resolve("фывфыв"), { brand: "", models: [], matched: false });
});

test("марка в строке: самое длинное название и остаток на модель", () => {
  const names = ["MINI", "Li Auto", "BMW", "Land Rover"];
  assert.deepEqual(findBrandInText("ix3 bmw", names), { name: "BMW", index: 1, rest: "ix3" });
  assert.deepEqual(findBrandInText("land rover defender", names), { name: "Land Rover", index: 0, rest: "defender" });
  // Марка из двух слов побеждает случайное совпадение одного.
  assert.deepEqual(findBrandInText("l6 li auto", names), { name: "Li Auto", index: 1, rest: "l6" });
  assert.equal(findBrandInText("coolray", names), null);
  assert.equal(findBrandInText("", names), null);
});
