import test from "node:test";
import assert from "node:assert/strict";
import { collectHeroAliases, listSearchVariants, rankSearchEntries, rewriteQueryNames, searchNormalize, translateBrandWords, translateModelWords } from "../src/search-dictionary.js";

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

test("«джили» — это марка Geely целиком, «джили галакси» — её электрическая линейка", () => {
  assert.equal(parse("джили").text, "geely");
  assert.equal(parse("джили галакси").text, "geely galaxy");
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
