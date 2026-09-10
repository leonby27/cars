import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseComparables,
  expectedPrice,
  mileagePriceSlope,
  priceRatingFrom,
  trimKey,
  PRICE_RATING_MIN_CARS,
} from "../server/price-rating.mjs";
import { estimateLandedCost } from "../src/pricing.js";
import {
  priceRatingAssessment,
  priceRatingBar,
  priceRatingBasisNote,
  priceRatingBatteryNote,
  priceRatingLimits,
  priceRatingMileageNote,
  priceRatingPosition,
  priceRatingPriceNote,
  priceRatingVerdict,
} from "../src/price-rating.js";

// Машина каталога в том виде, в каком её видит расчёт цены: цена продавца, город,
// год, мотор и комплектация (её источник кладёт в описание).
const car = (fields = {}) => ({
  id:"che168-1",
  source:"Che168",
  brand:"BMW",
  model:"5 Series",
  year:2020,
  mileage:60_000,
  city:"beijing",
  type:"ДВС",
  engine:"2.0T 184HP L4",
  description:"2020 530Li Leading M Sport Package",
  chinaPrice:200_000,
  ...fields,
});

// Запись набора в том виде, в каком её держит память сервера.
const peer = (id, price, { year = 2020, mileage = 60_000, trim = "530li leading m sport package", battery = 0 } = {}) => ({
  id,
  year,
  trim,
  battery,
  mileage,
  priceQuotaOn:price,
  priceQuotaOff:price,
});

const five = (options) => [1, 2, 3, 4, 5].map((n) => peer(`p${n}`, 29_000 + n * 500, options));

// Числа в тексте разделены неразрывным пробелом — в ожиданиях тестов его не видно,
// поэтому перед сравнением приводим оба пробела к обычному.
const plain = (value) => String(value).replace(/[\u00a0\u202f]/g, " ");
const money = (usd) => `${usd.toLocaleString("ru-RU")} $`;

test("название комплектации приводится к сравнимому виду", () => {
  assert.equal(trimKey("2020 530Li Leading M Sport Package"), "530li leading m sport package");
  assert.equal(trimKey("2020 Model 530Li xDrive M Sport Package"), "530li xdrive m sport package");
  assert.equal(trimKey("  2021   525Li   Luxury  Package "), "525li luxury package");
  assert.equal(trimKey(""), "");
  assert.equal(trimKey(null), "");
});

test("лучший набор — та же комплектация и похожий пробег", () => {
  const rows = [
    ...five({ mileage:62_000 }),
    // Другая комплектация — в лучший набор не идёт.
    peer("other-trim", 20_000, { trim:"525li luxury package" }),
    // Тройной пробег — тоже.
    peer("far-mileage", 21_000, { mileage:180_000 }),
    // Другой год — тоже.
    peer("other-year", 40_000, { year:2022 }),
  ];
  const chosen = chooseComparables(car(), rows);
  assert.equal(chosen.sameTrim, true);
  assert.equal(chosen.sameMileage, true);
  assert.equal(chosen.sameYear, true);
  assert.equal(chosen.items.length, 5);
});

test("условия снимаются по одному, от самого точного к широкому", () => {
  // Комплектация та же, но пробеги у всех другие.
  const trimOnly = five({ mileage:150_000 });
  const byTrim = chooseComparables(car(), trimOnly);
  assert.deepEqual([byTrim.sameTrim, byTrim.sameMileage], [true, false]);

  // Комплектации разные, зато пробег похожий.
  const mileageOnly = five({ trim:"525li luxury package", mileage:61_000 });
  const byMileage = chooseComparables(car(), mileageOnly);
  assert.deepEqual([byMileage.sameTrim, byMileage.sameMileage], [false, true]);

  // Ни то, ни другое — остаётся год.
  const yearOnly = five({ trim:"525li luxury package", mileage:150_000 });
  const byYear = chooseComparables(car(), yearOnly);
  assert.deepEqual([byYear.sameTrim, byYear.sameMileage, byYear.sameYear], [false, false, true]);

  // Не хватает ровесников — добавляем ближайшие годы.
  const nearYears = [
    peer("a", 30_000, { year:2019, trim:"x" }),
    peer("b", 31_000, { year:2019, trim:"x" }),
    peer("c", 32_000, { year:2021, trim:"x" }),
    peer("d", 33_000, { year:2021, trim:"x" }),
    peer("e", 34_000, { year:2021, trim:"x" }),
  ];
  const byYears = chooseComparables(car(), nearYears);
  assert.equal(byYears.sameYear, false);
  assert.equal(byYears.yearFrom, 2019);
  assert.equal(byYears.yearTo, 2021);
  assert.equal(priceRatingFrom(car(), [...five().slice(0, 4), ...nearYears]).count, 9);
  const wider = chooseComparables(car(), [...five({ year:2022 }), peer("far", 20_000, { year:2025 })]);
  assert.equal(wider.items.length, 5);
  assert.equal(wider.yearFrom, 2022);
  assert.equal(wider.yearTo, 2022);
  assert.equal(chooseComparables(car({ year:null }), five()), null);
  const exact = chooseComparables(car(), [...five(), ...nearYears]);
  assert.equal(exact.items.length, 5);
  assert.ok(exact.items.every((item) => item.year === 2020));
});

test("батарея сужает набор у электромобиля и не мешает бензиновому", () => {
  const electric = car({ type:"Электромобиль", engine:null, battery:100, description:"2020 Long Range" });
  const rows = [
    // Такая же батарея — в набор идут.
    ...[1, 2, 3, 4, 5].map((n) => peer(`same${n}`, 40_000 + n * 500, { battery:100, trim:"long range" })),
    // Пакет вдвое меньше — не идут, хотя комплектация записана так же.
    ...[1, 2, 3].map((n) => peer(`small${n}`, 30_000 + n * 100, { battery:60, trim:"long range" })),
  ];
  const chosen = chooseComparables(electric, rows);
  assert.equal(chosen.sameBattery, true);
  assert.deepEqual(chosen.items.map((item) => item.id), ["same1", "same2", "same3", "same4", "same5"]);

  // У машины с мотором батареи нет — условие не работает и набор не сужает.
  const petrol = chooseComparables(car(), five({ battery:0 }));
  assert.equal(petrol.sameBattery, false);
  assert.equal(petrol.items.length, 5);
});

test("батарей мало — условие снимается, и это видно в признаках набора", () => {
  const electric = car({ type:"Электромобиль", engine:null, battery:100, description:"2020 Long Range" });
  // Такой же батареи в наличии всего три — набор собирается без этого условия.
  const rows = [
    ...[1, 2, 3].map((n) => peer(`same${n}`, 40_000 + n * 500, { battery:100, trim:"long range" })),
    ...[1, 2, 3, 4].map((n) => peer(`small${n}`, 30_000 + n * 100, { battery:60, trim:"long range", mileage:61_000 })),
  ];
  const chosen = chooseComparables(electric, rows);
  assert.equal(chosen.sameBattery, false);
  assert.equal(chosen.items.length, 7);
});

test("меньше пяти машин для сравнения — шкалы нет", () => {
  const rows = Array.from({ length:PRICE_RATING_MIN_CARS - 1 }, (unused, index) => peer(`p${index}`, 30_000 + index));
  assert.equal(chooseComparables(car(), rows), null);
  assert.equal(priceRatingFrom(car(), rows), null);
});

test("сама машина в свой набор для сравнения не попадает", () => {
  const rows = [peer("che168-1", 1_000), ...five()];
  assert.deepEqual(chooseComparables(car(), rows).items.map((item) => item.id), ["p1", "p2", "p3", "p4", "p5"]);
});

test("сводка отдаёт типичную цену, число машин дороже и признаки набора", () => {
  const rows = [peer("a", 28_000), peer("b", 29_000), peer("c", 30_000), peer("d", 31_000), peer("e", 32_000)];
  const rating = priceRatingFrom(car(), rows);
  assert.equal(rating.count, 5);
  assert.equal(rating.sameTrim, true);
  assert.equal(rating.sameMileage, true);
  assert.equal(rating.mileageMedian, 60_000);
  // Батареи у бензиновой машины нет — и типичной по набору тоже.
  assert.equal(rating.batteryMedian, null);
  assert.equal(rating.quotaOn.medianUsd, 30_000);
  // Машин мало и пробеги у всех одинаковые — планку сдвигать нечем.
  assert.equal(rating.quotaOn.expectedUsd, 30_000);
  assert.equal(rating.quotaOn.mileageAdjusted, false);
  // Цену самой машины считает тот же расчёт, что и в карточке, — по нему и сверяем.
  const ownUsd = Number(estimateLandedCost(car(), { quotaOver:false }).totalUsd);
  assert.equal(rating.quotaOn.cheaperThan, rows.filter((item) => item.priceQuotaOn > ownUsd).length);
  // Положение бегунка карточка считает сама — сервер присылает только планку.
  assert.equal(rating.quotaOn.position, undefined);
});

test("положение бегунка считается от отклонения цены, а не от места в списке", () => {
  assert.equal(priceRatingPosition(30_000, 30_000), 0.5);
  // Отклонение на пятую часть и дальше упирается в край шкалы.
  assert.ok(priceRatingPosition(24_000, 30_000) < 0.02);
  assert.ok(priceRatingPosition(36_000, 30_000) > 0.98);
  assert.equal(priceRatingPosition(10_000, 30_000), priceRatingPosition(24_000, 30_000));
  assert.equal(priceRatingPosition(90_000, 30_000), priceRatingPosition(36_000, 30_000));
  assert.equal(priceRatingPosition(30_000, 0), null);
});

test("бегунок всегда стоит над подсвеченным делением", () => {
  // Одна и та же цена не должна подсвечивать одно деление, а бегунком показывать на
  // соседнее: раньше деления считались по ступеням, а бегунок — линейно по деньгам.
  const bar = 100_000;
  for (let percent = -35; percent <= 35; percent += 1) {
    const price = bar * (1 + percent / 100);
    const position = priceRatingPosition(price, bar);
    const under = Math.min(4, Math.floor(position * 5));
    assert.equal(under, priceRatingVerdict(price, bar).step, `отклонение ${percent}%`);
  }
});

test("цена в пределах трёх процентов от типичной называется средней", () => {
  assert.equal(priceRatingVerdict(30_000, 30_000).label, "средняя");
  assert.equal(priceRatingVerdict(29_400, 30_000).label, "средняя");
  assert.equal(priceRatingVerdict(28_000, 30_000).label, "ниже средней");
  assert.equal(priceRatingVerdict(32_000, 30_000).label, "выше средней");
  assert.equal(priceRatingVerdict(26_000, 30_000).label, "намного ниже");
  assert.equal(priceRatingVerdict(34_000, 30_000).label, "намного выше");
  assert.deepEqual([0, 1, 2, 3, 4], [
    priceRatingVerdict(26_000, 30_000).step,
    priceRatingVerdict(28_000, 30_000).step,
    priceRatingVerdict(30_000, 30_000).step,
    priceRatingVerdict(32_000, 30_000).step,
    priceRatingVerdict(34_000, 30_000).step,
  ]);
});

test("первая строка называет планку и разницу, одним предложением", () => {
  const rating = { count:205 };
  const mode = { medianUsd:30_000, expectedUsd:30_000, mileageAdjusted:false };
  assert.equal(
    plain(priceRatingPriceNote(rating, mode, 26_800, money).text),
    "Такие машины стоят в среднем 30 000 $ — эта на 3 200 $ дешевле.",
  );
  assert.equal(
    plain(priceRatingPriceNote(rating, mode, 33_400, money).text),
    "Такие машины стоят в среднем 30 000 $ — эта на 3 400 $ дороже.",
  );
  // Разницы почти нет — числами про неё не сорим.
  assert.equal(
    plain(priceRatingPriceNote(rating, mode, 30_200, money).text),
    "Такие машины стоят в среднем 30 000 $ — эта почти столько же.",
  );
  // Даже старый ответ со сдвинутой планкой не подменяет реальные цены.
  const shifted = { medianUsd:30_000, expectedUsd:26_000, mileageAdjusted:true };
  assert.equal(
    plain(priceRatingPriceNote(rating, shifted, 24_000, money).text),
    "Такие машины стоят в среднем 30 000 $ — эта на 6 000 $ дешевле.",
  );
  // Цена около старой расчётной планки по-прежнему ниже реальной медианы.
  assert.equal(priceRatingPriceNote(rating, shifted, 26_100, money).tone, "low");
  assert.equal(priceRatingPriceNote(rating, { medianUsd:0 }, 30_000, money), null);
});

test("вторая строка называет рамку сравнения", () => {
  assert.equal(
    priceRatingBasisNote({ count:205, sameYear:true, sameTrim:true, sameMileage:true, yearFrom:2020, yearTo:2020 }),
    "Сравнили с 205 такими же машинами 2020 года той же комплектации и с похожим пробегом.",
  );
  assert.equal(
    priceRatingBasisNote({ count:19, sameYear:true, sameTrim:true, sameBattery:true, sameMileage:true, yearFrom:2023, yearTo:2023 }),
    "Сравнили с 19 такими же машинами 2023 года той же комплектации, с такой же батареей и с похожим пробегом.",
  );
  assert.equal(
    priceRatingBasisNote({ count:41, sameYear:true, sameTrim:true, sameMileage:false, yearFrom:2023, yearTo:2023 }),
    "Сравнили с 41 такой же машиной 2023 года той же комплектации.",
  );
  assert.equal(
    priceRatingBasisNote({ count:17, sameYear:true, sameTrim:false, sameMileage:false, yearFrom:2021, yearTo:2021 }),
    "Сравнили с 17 такими же машинами 2021 года.",
  );
  assert.equal(
    priceRatingBasisNote({ count:12, sameYear:false, sameTrim:false, sameMileage:false, yearFrom:2019, yearTo:2021 }),
    "Сравнили с 12 такими же машинами 2019–2021 годов.",
  );
  assert.equal(
    priceRatingBasisNote({ count:30, sameYear:true, sameMileage:true, yearFrom:2020, yearTo:2020, quotaOn:{ mileageAdjusted:true } }),
    "Сравнили с 30 такими же машинами 2020 года с похожим пробегом.",
  );
  assert.equal(priceRatingBasisNote({ count:0 }), null);
});

test("про пробег пишем всегда, когда он выбивается из набора", () => {
  const loose = { sameMileage:false, mileageMedian:45_000 };
  assert.equal(plain(priceRatingMileageNote(loose, 62_300).text), "Пробег 62 300 км — больше, чем у похожих: у них около 45 000 км.");
  assert.equal(priceRatingMileageNote(loose, 62_300).tone, "high");
  assert.equal(priceRatingMileageNote(loose, 20_000).tone, "low");
  // Набор собран по пробегу, но допуск широкий: разница в четверть внутри него —
  // обычное дело, и о ней всё равно говорим.
  const tight = { sameMileage:true, mileageMedian:45_000 };
  assert.equal(plain(priceRatingMileageNote(tight, 60_000).text), "Пробег 60 000 км — больше, чем у похожих: у них около 45 000 км.");
  // А когда пробег и правда как у всех — строки нет.
  assert.equal(priceRatingMileageNote(tight, 46_000), null);
  assert.equal(priceRatingMileageNote(loose, 0), null);
});

test("цена километра считается по набору и только когда её видно", () => {
  const priceOf = (item) => item.price;
  // Восемь машин, цена ровно падает с пробегом: наклон отрицательный.
  const falling = [10, 20, 30, 40, 50, 60, 70, 80].map((km, index) => ({ mileage:km * 1000, price:40_000 - index * 1_000 }));
  const slope = mileagePriceSlope(falling, priceOf);
  assert.ok(slope < 0);
  // Машин мало — не считаем.
  assert.equal(mileagePriceSlope(falling.slice(0, 6), priceOf), null);
  // Пробеги почти одинаковые — половины неразличимы.
  const flat = falling.map((item) => ({ ...item, mileage:50_000 }));
  assert.equal(mileagePriceSlope(flat, priceOf), null);
  // Цена с пробегом растёт — такой набор поправке не верим.
  const rising = falling.map((item, index) => ({ ...item, price:30_000 + index * 1_000 }));
  assert.equal(mileagePriceSlope(rising, priceOf), null);
});

test("планка сдвигается под пробег, но не дальше седьмой части цены", () => {
  // Наклон: доллар за километр. Пробег на 2 000 км больше типичного — планка ниже.
  assert.equal(expectedPrice(30_000, 60_000, 62_000, -1).usd, 28_000);
  assert.equal(expectedPrice(30_000, 60_000, 62_000, -1).adjusted, true);
  // Пробег вдвое больше — сдвиг упирается в предел: 15% от 30 000 это 4 500.
  assert.equal(expectedPrice(30_000, 60_000, 200_000, -1).usd, 25_500);
  // Пробег меньше типичного — планка выше, и предел работает в обе стороны.
  assert.equal(expectedPrice(30_000, 60_000, 58_000, -1).usd, 32_000);
  assert.equal(expectedPrice(30_000, 60_000, 10_000, -1).usd, 34_500);
  // Наклона нет — планка равна типичной цене.
  assert.deepEqual(expectedPrice(30_000, 60_000, 200_000, null), { usd:30_000, adjusted:false });
  // Сдвиг меньше половины процента считать нечего.
  assert.equal(expectedPrice(30_000, 60_000, 60_050, -1).adjusted, false);
});

test("про батарею пишем, только когда набор собран без неё", () => {
  const rating = { sameBattery:false, batteryMedian:75 };
  assert.equal(plain(priceRatingBatteryNote(rating, 100).text), "Батарея 100 кВт·ч — больше, чем у похожих: у них около 75 кВт·ч.");
  assert.equal(plain(priceRatingBatteryNote(rating, 60).text), "Батарея 60 кВт·ч — меньше, чем у похожих: у них около 75 кВт·ч.");
  // Разница в пределах допуска — строки нет.
  assert.equal(priceRatingBatteryNote(rating, 77), null);
  // Набор уже собран по батарее — строки нет.
  assert.equal(priceRatingBatteryNote({ sameBattery:true, batteryMedian:75 }, 100), null);
  // У машины с мотором батареи нет ни у одной стороны.
  assert.equal(priceRatingBatteryNote({ sameBattery:false, batteryMedian:null }, 0), null);
});

test("подсказка честно говорит, чего в наборе не хватило", () => {
  assert.equal(priceRatingLimits({ sameTrim:true, sameBattery:true, sameMileage:true }), "");
  // У бензиновой машины про батарею не оговариваемся: её нет ни у кого.
  assert.equal(
    priceRatingLimits({ sameTrim:false, sameMileage:false, batteryMedian:null }),
    "Сравнение приблизительное: комплектация у них может быть другой, пробег разный.",
  );
  assert.equal(
    priceRatingLimits({ sameTrim:false, sameBattery:false, sameMileage:false, batteryMedian:75 }),
    "Сравнение приблизительное: комплектация у них может быть другой, батарея тоже разная, пробег разный.",
  );
  // Старый флаг сдвига не скрывает оговорку о разном пробеге.
  assert.equal(
    priceRatingLimits({ sameTrim:false, sameMileage:false, quotaOn:{ mileageAdjusted:true } }),
    "Сравнение приблизительное: комплектация у них может быть другой, пробег разный.",
  );
});

test("режим цен с квотой считается заранее для обоих состояний", () => {
  const electric = car({ type:"Электромобиль", engine:null, chinaPrice:400_000 });
  const rows = five().map((item) => ({ ...item, priceQuotaOff:item.priceQuotaOn * 1.15 }));
  const rating = priceRatingFrom(electric, rows);
  assert.ok(rating.quotaOff.medianUsd > rating.quotaOn.medianUsd);
  assert.equal(rating.quotaOn.medianUsd, 30_500);
});


test("год сравнения виден в тексте цены, включая поправку на пробег", () => {
  const rating = { count:5, sameYear:true, yearFrom:2023, yearTo:2023 };
  const mode = { medianUsd:30_000, expectedUsd:30_000, mileageAdjusted:false };
  assert.equal(plain(priceRatingPriceNote(rating, mode, 27_000, money).text),
    "Такие машины 2023 года стоят в среднем 30 000 $ — эта на 3 000 $ дешевле.");
  assert.equal(plain(priceRatingPriceNote(rating, { ...mode, mileageAdjusted:true }, 27_000, money).text),
    "Такие машины 2023 года стоят в среднем 30 000 $ — эта на 3 000 $ дешевле.");
});


test("сравнение разных лет называет диапазон и оговорку", () => {
  const rating = { sameYear:false, yearFrom:2022, yearTo:2024 };
  assert.equal(plain(priceRatingPriceNote(rating, { medianUsd:30_000, expectedUsd:30_000 }, 27_000, money).text),
    "Такие машины 2022–2024 годов стоят в среднем 30 000 $ — эта на 3 000 $ дешевле. Сравнение приблизительное: без поправки на год.");
});


test("Volkswagen 59514400: самая дешёвая машина не становится дорогой из-за пробега", () => {
  const rating = { count:15, sameYear:true, mileageMedian:54_000 };
  const mode = { medianUsd:18_400, expectedUsd:15_673.626, mileageAdjusted:true, cheaperThan:15 };
  const assessment = priceRatingAssessment(rating, mode, 16_200, 136_700);
  assert.equal(priceRatingBar(mode), 18_400);
  assert.equal(assessment.verdict.label, "намного ниже");
  assert.equal(assessment.mileageAdjusted, false);
  assert.match(plain(priceRatingPriceNote(rating, mode, 16_200, money, 136_700).text), /18 400.*2 200.*дешевле/);
});

test("близкая цена и больший пробег ухудшают оценку, но не подменяют реальную медиану", () => {
  const rating = { count:10, sameYear:true, mileageMedian:50_000 };
  const mode = { medianUsd:20_000, cheaperThan:5 };
  const assessment = priceRatingAssessment(rating, mode, 20_000, 80_000);
  assert.equal(assessment.verdict.label, "выше средней");
  assert.equal(assessment.position, 0.7);
  assert.equal(assessment.mileageAdjusted, true);
  const note = priceRatingPriceNote(rating, mode, 20_000, money, 80_000);
  assert.match(plain(note.text), /20 000.*почти столько же.*больше пробег.*выше средней/);
  assert.equal(note.tone, "high");
  // Одинаковые цены также дают повод сравнить пробеги, без оценки цены километра.
  assert.equal(priceRatingAssessment(rating, { ...mode, cheaperThan:0 }, 20_000, 80_000).mileageAdjusted, true);
  for (const mileage of [0, 30_000, 50_000, 57_000]) {
    assert.equal(priceRatingAssessment(rating, mode, 20_000, mileage).verdict.label, "средняя");
  }
  for (const price of [18_000, 19_000, 21_000, 23_000]) {
    assert.deepEqual(priceRatingAssessment(rating, mode, price, 80_000).verdict, priceRatingVerdict(price, 20_000));
  }
  assert.equal(priceRatingAssessment(rating, { ...mode, cheaperThan:10 }, 19_900, 80_000).mileageAdjusted, false);
  assert.equal(priceRatingAssessment({ ...rating, sameYear:false }, mode, 20_000, 80_000).mileageAdjusted, false);
});

test("сервер возвращает реальные цены без расчётной скидки на пробег в обоих режимах", () => {
  const own = car({ mileage:136_700 });
  const rows = Array.from({ length:10 }, (_, i) => peer(`p${i}`, 40_000 - i * 1_000, { mileage:20_000 + i * 5_000 }));
  const rating = priceRatingFrom(own, rows);
  for (const mode of [rating.quotaOn, rating.quotaOff]) {
    assert.equal(mode.expectedUsd, mode.medianUsd);
    assert.equal(mode.mileageAdjusted, false);
  }
});
