import test from "node:test";
import assert from "node:assert/strict";
import { latinVariants, mileageBounds, mileageLabel, parseQueryRanges } from "../src/search-query.js";
import { PRICING } from "../src/pricing.js";

test("понимает цену «от … до …»", () => {
  const result = parseQueryRanges("от 25000 до 40000");
  assert.equal(result.priceMinUsd, 25000);
  assert.equal(result.priceMaxUsd, 40000);
  assert.equal(result.rest, "");
  assert.equal(result.hasRanges, true);
});

test("цена не мешает марке и модели", () => {
  const result = parseQueryRanges("зикр 001 от 25 до 40 тыс");
  assert.equal(result.rest, "зикр 001");
  assert.equal(result.priceMinUsd, 25000);
  assert.equal(result.priceMaxUsd, 40000);
});

test("диапазон лет через дефис", () => {
  const result = parseQueryRanges("тесла 2021-2023");
  assert.equal(result.rest, "тесла");
  assert.equal(result.yearFrom, "2021");
  assert.equal(result.yearTo, "2023");
});

test("одиночный год ищется точно", () => {
  const result = parseQueryRanges("bmw 2022");
  assert.equal(result.rest, "bmw");
  assert.equal(result.yearFrom, "2022");
  assert.equal(result.yearTo, "2022");
});

test("«от 2022 года» — только нижняя граница", () => {
  const result = parseQueryRanges("гибрид от 2022 года");
  assert.equal(result.rest, "гибрид");
  assert.equal(result.yearFrom, "2022");
  assert.equal(result.yearTo, "");
});

test("пробег по слову «пробег» без «км»", () => {
  const result = parseQueryRanges("пробег до 50 тысяч");
  assert.equal(result.mileageMax, 50000);
  assert.equal(result.priceMaxUsd, null);
  assert.equal(result.rest, "");
});

test("пробег по «км» с разрядными пробелами", () => {
  const result = parseQueryRanges("до 50 000 км");
  assert.equal(result.mileageMax, 50000);
  assert.equal(result.priceMaxUsd, null);
});

test("пробег «от и до»", () => {
  const result = parseQueryRanges("пробег от 10000 до 50000");
  assert.equal(result.mileageMin, 10000);
  assert.equal(result.mileageMax, 50000);
});

test("голое число с «км» — потолок пробега", () => {
  const result = parseQueryRanges("100 000 км");
  assert.equal(result.mileageMax, 100000);
});

test("без валюты сумма читается в выбранной на сайте валюте", () => {
  const result = parseQueryRanges("до 30000", { currency: "BYN" });
  assert.equal(result.priceMaxUsd, Math.round(30000 / PRICING.usdByn));
});

test("явный знак доллара сильнее переключателя", () => {
  const result = parseQueryRanges("до 30000$", { currency: "BYN" });
  assert.equal(result.priceMaxUsd, 30000);
});

test("рубли пересчитываются по курсу", () => {
  const result = parseQueryRanges("до 90 тысяч рублей");
  assert.equal(result.priceMaxUsd, Math.round(90000 / PRICING.usdByn));
});

test("«дешевле 30к» — потолок цены", () => {
  const result = parseQueryRanges("кроссовер полный привод дешевле 30к");
  assert.equal(result.rest, "кроссовер полный привод");
  assert.equal(result.priceMaxUsd, 30000);
});

test("«не дороже» разворачивается в «до»", () => {
  const result = parseQueryRanges("не дороже 40 тыс");
  assert.equal(result.priceMaxUsd, 40000);
  assert.equal(result.priceMinUsd, null);
});

test("множитель одной границы работает на обе", () => {
  const result = parseQueryRanges("от 20 до 40 тысяч");
  assert.equal(result.priceMinUsd, 20000);
  assert.equal(result.priceMaxUsd, 40000);
});

test("диапазон цены через дефис", () => {
  const result = parseQueryRanges("25000-40000");
  assert.equal(result.priceMinUsd, 25000);
  assert.equal(result.priceMaxUsd, 40000);
});

test("«от 2020 до 45000» — год и цена, а не один диапазон", () => {
  const result = parseQueryRanges("от 2020 до 45000");
  assert.equal(result.yearFrom, "2020");
  assert.equal(result.priceMaxUsd, 45000);
  assert.equal(result.yearTo, "");
});

test("номер объявления не считается ценой", () => {
  const result = parseQueryRanges("59116012");
  assert.equal(result.rest, "59116012");
  assert.equal(result.hasRanges, false);
});

test("запятая перечисляет модели", () => {
  const result = parseQueryRanges("zeekr 001, 007");
  assert.equal(result.rest, "zeekr 001 или 007");
  assert.equal(result.hasRanges, false);
});

test("номера моделей с нулём впереди не склеиваются и не становятся суммами", () => {
  const result = parseQueryRanges("зикр 001 007 до 40 тыс");
  assert.equal(result.rest, "зикр 001 007");
  assert.equal(result.priceMaxUsd, 40000);
});

test("маленькие числа остаются названием модели", () => {
  const result = parseQueryRanges("бмв 530 и voyah 7");
  assert.equal(result.rest, "бмв 530 и voyah 7");
  assert.equal(result.hasRanges, false);
});

test("год не склеивается с соседним числом", () => {
  const result = parseQueryRanges("зикр 001 2022");
  assert.equal(result.rest, "зикр 001");
  assert.equal(result.yearFrom, "2022");
  assert.equal(result.yearTo, "2022");
});

test("перевёрнутые границы меняются местами", () => {
  const result = parseQueryRanges("от 40000 до 25000");
  assert.equal(result.priceMinUsd, 25000);
  assert.equal(result.priceMaxUsd, 40000);
});

test("сложный запрос целиком", () => {
  const result = parseQueryRanges("тесла model y 2021-2023 пробег до 50 тыс от 25000 до 40000$");
  assert.equal(result.rest, "тесла model y");
  assert.equal(result.yearFrom, "2021");
  assert.equal(result.yearTo, "2023");
  assert.equal(result.mileageMax, 50000);
  assert.equal(result.priceMinUsd, 25000);
  assert.equal(result.priceMaxUsd, 40000);
});

test("подпись пробега собирается и разбирается обратно", () => {
  assert.equal(mileageLabel(null, 50000), "до 50 000 км");
  assert.equal(mileageLabel(10000, null), "от 10 000 км");
  assert.equal(mileageLabel(10000, 50000), "от 10 000 до 50 000 км");
  assert.deepEqual(mileageBounds("до 50 000 км"), { min: null, max: 50000 });
  assert.deepEqual(mileageBounds("от 10 000 км"), { min: 10000, max: null });
  assert.deepEqual(mileageBounds("от 10 000 до 50 000 км"), { min: 10000, max: 50000 });
});

test("подписи-ступеньки каталога разбираются как раньше", () => {
  assert.deepEqual(mileageBounds("до 100 000 км"), { min: null, max: 100000 });
  assert.equal(mileageBounds("Пробег"), null);
});

test("евро пересчитываются по курсу", () => {
  const result = parseQueryRanges("до 25000 евро");
  assert.equal(result.priceMaxUsd, Math.round(25000 * (PRICING.eurByn / PRICING.usdByn)));
});

test("знак евро тоже понимается", () => {
  const result = parseQueryRanges("до 25000€");
  assert.equal(result.priceMaxUsd, Math.round(25000 * (PRICING.eurByn / PRICING.usdByn)));
});

test("«тыщ» и «у.е.» — разговорные варианты", () => {
  const result = parseQueryRanges("до 30 тыщ уе");
  assert.equal(result.priceMaxUsd, 30000);
});

test("белорусские рубли словом «бел»", () => {
  const result = parseQueryRanges("до 90 тыс бел рублей");
  assert.equal(result.priceMaxUsd, Math.round(90000 / PRICING.usdByn));
});

test("десятичная запятая: «1,5 млн рублей»", () => {
  const result = parseQueryRanges("до 1,5 млн рублей");
  assert.equal(result.priceMaxUsd, Math.round(1500000 / PRICING.usdByn));
});

test("«не более» и «в пределах» — потолок", () => {
  assert.equal(parseQueryRanges("не более 40 тыс").priceMaxUsd, 40000);
  assert.equal(parseQueryRanges("в пределах 35к").priceMaxUsd, 35000);
  assert.equal(parseQueryRanges("ниже 30000").priceMaxUsd, 30000);
  assert.equal(parseQueryRanges("не менее 20000").priceMinUsd, 20000);
});

test("«около» превращается в диапазон ±15%", () => {
  const result = parseQueryRanges("около 30000");
  assert.equal(result.priceMinUsd, 25500);
  assert.equal(result.priceMaxUsd, 34500);
  const mileage = parseQueryRanges("примерно 50 тыс км");
  assert.equal(mileage.mileageMin, 42500);
  assert.equal(mileage.mileageMax, 57500);
});

test("«новее» и «старше» — границы по году", () => {
  assert.equal(parseQueryRanges("новее 2022").yearFrom, "2022");
  assert.equal(parseQueryRanges("старше 2022 года").yearTo, "2022");
});

test("окончание «2022-го» не мешает году", () => {
  const result = parseQueryRanges("от 2022-го");
  assert.equal(result.yearFrom, "2022");
});

test("«с пробегом 50000» — потолок, а не нижняя граница", () => {
  const result = parseQueryRanges("с пробегом 50000");
  assert.equal(result.mileageMin, null);
  assert.equal(result.mileageMax, 50000);
});

test("«километров» понимается как «км»", () => {
  const result = parseQueryRanges("до 60 тысяч километров");
  assert.equal(result.mileageMax, 60000);
});

test("косая черта перечисляет модели", () => {
  const result = parseQueryRanges("zeekr 001/007");
  assert.equal(result.rest, "zeekr 001 или 007");
});

test("«бел руб» из двух слов и другие имена белорусского рубля", () => {
  const byn = Math.round(100000 / PRICING.usdByn);
  assert.equal(parseQueryRanges("зикр до 100к бел руб").priceMaxUsd, byn);
  assert.equal(parseQueryRanges("зикр до 100к бел руб").rest, "зикр");
  assert.equal(parseQueryRanges("до 100 тыс белорусских рублей").priceMaxUsd, byn);
  assert.equal(parseQueryRanges("25000 р").priceMaxUsd, Math.round(25000 / PRICING.usdByn));
});

test("валюта, названная до числа, относится к сумме", () => {
  const result = parseQueryRanges("в рублях от 20 до 40 тыс");
  assert.equal(result.priceMinUsd, Math.round(20000 / PRICING.usdByn));
  assert.equal(result.priceMaxUsd, Math.round(40000 / PRICING.usdByn));
  assert.equal(result.rest, "");
  // А голый год суммой не становится.
  assert.equal(parseQueryRanges("в рублях 2022").yearFrom, "2022");
});

test("слова-паразиты не мешают: «машина», «б/у», «за»", () => {
  assert.equal(parseQueryRanges("машина до 30000").rest, "");
  assert.equal(parseQueryRanges("зикр б/у до 30к").rest, "зикр");
  assert.equal(parseQueryRanges("зикр за 30к").priceMaxUsd, 30000);
});

test("«пробега» после числа — метка пробега, «к» — тысячи", () => {
  const full = parseQueryRanges("зикр gt до 100к руб и до 20к пробега");
  assert.equal(full.priceMaxUsd, Math.round(100000 / PRICING.usdByn));
  assert.equal(full.mileageMax, 20000);
  assert.equal(full.rest, "зикр gt и");
  assert.equal(parseQueryRanges("20 к пробега").mileageMax, 20000);
  assert.equal(parseQueryRanges("зикр 20к пробег").mileageMax, 20000);
});

test("«зикр от 25к» — нижняя граница цены в валюте переключателя", () => {
  const usd = parseQueryRanges("зикр от 25к", { currency: "USD" });
  assert.equal(usd.rest, "зикр");
  assert.equal(usd.priceMinUsd, 25000);
  const byn = parseQueryRanges("зикр от 25к", { currency: "BYN" });
  assert.equal(byn.priceMinUsd, Math.round(25000 / PRICING.usdByn));
  // «к» отделённое пробелом и явная валюта поверх переключателя.
  assert.equal(parseQueryRanges("зикр от 25 к").priceMinUsd, 25000);
  assert.equal(parseQueryRanges("зикр от 25к$", { currency: "BYN" }).priceMinUsd, 25000);
});

test("разгон: «до 5 сек» и его варианты", () => {
  for (const query of ["разгон до 5 сек", "разгон до 5 секунд", "быстрее 5 сек", "ускорение 5с"]) {
    const result = parseQueryRanges(query);
    assert.equal(result.accelMax, 5, query);
    assert.equal(result.rest, "");
  }
  assert.equal(parseQueryRanges("разгон до 3.5 сек").accelMax, 3.5);
});

test("батарея: «от 70» и киловатт-часы в любом написании", () => {
  for (const query of ["батарея от 70", "аккумулятор больше 70 кВт·ч", "емкость батареи от 70 квтч"]) {
    const result = parseQueryRanges(query);
    assert.equal(result.batteryMin, 70, query);
    assert.equal(result.rest, "");
  }
});

test("запас хода в километрах не путается с пробегом", () => {
  const result = parseQueryRanges("запас хода от 500 км пробег до 30 тыс");
  assert.equal(result.rangeMin, 500);
  assert.equal(result.mileageMax, 30000);
  assert.equal(result.rest, "");
});

test("марка и модель остаются, когда рядом разгон и батарея", () => {
  const result = parseQueryRanges("зикр 001 разгон до 4 сек батарея от 90");
  assert.equal(result.rest, "зикр 001");
  assert.equal(result.accelMax, 4);
  assert.equal(result.batteryMin, 90);
  assert.equal(result.hasRanges, true);
});

test("числа названий моделей не становятся разгоном и батареей", () => {
  const result = parseQueryRanges("бмв 530");
  assert.equal(result.rest, "бмв 530");
  assert.equal(result.accelMax, null);
  assert.equal(result.batteryMin, null);
  assert.equal(result.rangeMin, null);
});

test("постороннее слово между границами не путает величины", () => {
  const result = parseQueryRanges("лифтбэк от 2024 года, запас хода от 500 электро до 100к бел руб", { currency: "USD" });
  assert.equal(result.yearFrom, "2024");
  assert.equal(result.rangeMin, 500);
  assert.equal(result.priceMaxUsd, Math.round(100000 / PRICING.usdByn));
  assert.equal(result.rest, "лифтбэк или электро");
});

test("кириллица в названии модели читается латиницей", () => {
  assert.deepEqual(latinVariants("8х"), ["8x"]);
  assert.ok(latinVariants("007гт").includes("007gt"));
  // «у» пишут и как u (по звучанию), и как y (по начертанию) — годятся оба.
  assert.deepEqual(latinVariants("у"), ["u", "y"]);
  assert.ok(latinVariants("ен7").includes("eh7"));
});

test("названия латинских букв словами", () => {
  assert.ok(latinVariants("эль7").includes("l7"));
  assert.ok(latinVariants("икс9").includes("x9"));
  assert.ok(latinVariants("джи6").includes("g6"));
  // Внутри слова название буквы не подменяется.
  assert.ok(!latinVariants("иксбандит").some((item) => item.startsWith("x")));
});

test("латинский запрос не порождает лишних вариантов", () => {
  assert.deepEqual(latinVariants("zeekr 8x"), []);
  assert.deepEqual(latinVariants(""), []);
});

test("объём мотора: литры не путаются с ценой", () => {
  // Раньше «до 2 литров» читалось как цена в 2000 долларов и выдавало пустой каталог.
  const result = parseQueryRanges("бензин до 2 литров");
  assert.equal(result.rest, "бензин");
  assert.equal(result.engineMax, 2);
  assert.equal(result.priceMaxUsd, null);
  assert.equal(parseQueryRanges("объем двигателя от 1.6 л").engineMin, 1.6);
  const range = parseQueryRanges("от 1.6 до 2 л");
  assert.equal(range.engineMin, 1.6);
  assert.equal(range.engineMax, 2);
});

test("дробное число рядом с моделью — это объём мотора", () => {
  const result = parseQueryRanges("гольф 1.4");
  assert.equal(result.rest, "гольф");
  assert.equal(result.engineMin, 1.4);
  assert.equal(result.engineMax, 1.4);
  // Сумма с множителем объёмом не становится.
  const price = parseQueryRanges("до 1.5 млн", { currency: "BYN" });
  assert.equal(price.engineMax, null);
  assert.ok(price.priceMaxUsd > 0);
});

test("мощность в лошадиных силах", () => {
  assert.equal(parseQueryRanges("от 150 л.с.").powerMin, 150);
  assert.equal(parseQueryRanges("от 150 лс").powerMin, 150);
  assert.equal(parseQueryRanges("200 сил").powerMin, 200);
  assert.equal(parseQueryRanges("мощность от 180").powerMin, 180);
  assert.equal(parseQueryRanges("до 200 л.с.").powerMax, 200);
  // Силы не превращаются в цену.
  assert.equal(parseQueryRanges("от 150 л.с.").priceMinUsd, null);
});

test("мотор, коробка и цена в одной строке", () => {
  const result = parseQueryRanges("фольксваген гольф 1.4 автомат от 150 л.с. до 25000");
  assert.equal(result.rest, "фольксваген гольф автомат");
  assert.equal(result.engineMin, 1.4);
  assert.equal(result.powerMin, 150);
  assert.equal(result.priceMaxUsd, 25000);
});

test("«турбо» не мешает искать модель", () => {
  assert.equal(parseQueryRanges("хонда 1.5 турбо").rest, "хонда");
});
