import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEnergy, parseGuaziGlobalListing, parseGuaziGlobalProduct, parseGuaziHtml, parseGuaziListing, parseGuaziMarkdown, parseGuaziSeriesLinks, parseMileage } from "../scripts/lib/guazi-parser.mjs";

test("parses Chinese mileage units", () => {
  assert.equal(parseMileage("0.25万公里"), 2500);
  assert.equal(parseMileage("12800公里"), 12800);
});

test("parses a Guazi markdown vehicle", () => {
  const markdown = `id:c168848183157610\nmanufacturer:比亚迪\nbrand:比亚迪\nseries:比亚迪e6\nmodel:2023款 出租版\nfull_payment:81700元\nfirst_register:2024-05\nmileage:2500公里\ntransfer_times:1次\ncity:西安\ntype:新能源\ncondition_grade:S\ncondition_desc:理赔0次/过户1次\nappearance_score:95分(满分100分)\npublish_time:2026-07-20 10:30:00`;
  const car = parseGuaziMarkdown(markdown, "https://www.guazi.com/car-detail/c168848183157610.md");
  assert.equal(car.brand, "BYD");
  assert.equal(car.model, "e6");
  assert.equal(car.chinaPrice, 81700);
  assert.equal(car.mileage, 2500);
  assert.equal(car.owners, 2);
  assert.equal(car.appearanceScore, 95);
  assert.equal(car.sourceListedAt, "2026-07-20T02:30:00.000Z");
});

test("normalizes priority-market Galaxy and Dongfeng brands", () => {
  const base = `id:c168848183157611\nfull_payment:81700元\nfirst_register:2025-05\nmileage:1.25万公里\ntransfer_times:0次\ncity:杭州\ntype:新能源`;
  const galaxy = parseGuaziMarkdown(`${base}\nmanufacturer:吉利汽车\nbrand:吉利\nseries:银河E5\nmodel:2024款 530km`, "https://www.guazi.com/car-detail/c168848183157611.md");
  const dongfeng = parseGuaziMarkdown(`${base.replace("c168848183157611", "c168848183157612")}\nmanufacturer:东风风神\nbrand:东风风神\nseries:东风风神E70\nmodel:2023款 PRO`, "https://www.guazi.com/car-detail/c168848183157612.md");
  assert.equal(galaxy.brand, "Geely Galaxy");
  assert.equal(galaxy.model, "E5");
  assert.equal(dongfeng.brand, "Dongfeng");
  assert.equal(dongfeng.model, "E70");
});

test("normalizes international EV brands from the Chinese market", () => {
  const base = `full_payment:158000元\nfirst_register:2024-05\nmileage:1.25万公里\ntransfer_times:0次\ncity:杭州\ntype:新能源`;
  const bmw = parseGuaziMarkdown(`id:c168848183157620\n${base}\nmanufacturer:华晨宝马\nbrand:宝马\nseries:宝马i3\nmodel:2024款 eDrive 35 L`, "https://www.guazi.com/car-detail/c168848183157620.md");
  const volkswagen = parseGuaziMarkdown(`id:c168848183157621\n${base}\nmanufacturer:上汽大众\nbrand:大众\nseries:大众ID.3\nmodel:2024款 纯净智享版`, "https://www.guazi.com/car-detail/c168848183157621.md");
  const audi = parseGuaziMarkdown(`id:c168848183157622\n${base}\nmanufacturer:一汽奥迪\nbrand:奥迪\nseries:奥迪Q4 e-tron\nmodel:2024款 40 e-tron`, "https://www.guazi.com/car-detail/c168848183157622.md");
  assert.deepEqual([bmw.brand, bmw.model], ["BMW", "i3"]);
  assert.deepEqual([volkswagen.brand, volkswagen.model], ["Volkswagen", "ID.3"]);
  assert.deepEqual([audi.brand, audi.model], ["Audi", "Q4 e-tron"]);
});

test("extracts original gallery and detailed EV fields from HTML", () => {
  const html = `<link rel="preload" as="image" href="https://image-public.guazistatic.com/car.jpg?x-bce-process=image/quality,q_88/resize,m_fill,w_750,h_500"><script>\\"label\\":\\"能源类型\\",\\"value\\":\\"增程式\\",\\"label\\":\\"电池容量\\",\\"value\\":\\"31.73kWh\\",\\"label\\":\\"纯电续航\\",\\"value\\":\\"215km\\",\\"label\\":\\"综合续航\\",\\"value\\":\\"1130km\\",\\"label\\":\\"电池健康度\\",\\"value\\":\\"94%\\",\\"label\\":\\"发动机\\",\\"value\\":\\"1.5L\\",\\"label\\":\\"检测等级\\",\\"value\\":\\"优秀\\"</script>`;
  const detail = parseGuaziHtml(html);
  assert.equal(detail.images.length, 1);
  assert.equal(detail.battery, 31.73);
  assert.equal(detail.electricRange, 215);
  assert.equal(detail.combinedRange, 1130);
  assert.equal(detail.batteryHealth, 94);
  assert.equal(detail.engine, "1.5L");
  assert.equal(detail.inspectionGrade, "优秀");
  assert.equal(normalizeEnergy(detail.energy), "Гибрид");
});

test("extracts vehicle class and body structure from HTML", () => {
  const detail = parseGuaziHtml(`<script>"label":"车辆级别","value":"中型SUV","label":"车身结构","value":"5门5座SUV","publishTime":"2026-07-20T10:30:00Z"</script>`);
  assert.equal(detail.vehicleClass, "中型SUV");
  assert.equal(detail.bodyStructure, "5门5座SUV");
  assert.equal(detail.sourceListedAt, "2026-07-20T10:30:00.000Z");
});

test("discovers only selected EV/PHEV series on a mixed brand page", () => {
  const html = `<a href="/bj/byd/qplus/">秦PLUS</a><a href="/bj/byd/byd-f3/">比亚迪F3</a><a href="/bj/byd/sproxny/">宋Pro新能源</a>`;
  const links = parseGuaziSeriesLinks(html, "https://www.guazi.com/bj/byd/", "新能源|PLUS");
  assert.deepEqual(links.map((item) => item.name), ["秦PLUS", "宋Pro新能源"]);
});

test("extracts listing IDs and pagination", () => {
  const html = `<a href="/car-detail/c170580306182112.html">car</a><script>{\\"totalPage\\":8}</script>`;
  assert.deepEqual(parseGuaziListing(html), { ids: ["170580306182112"], totalPages: 8 });
});

test("parses Guazi Global listing links", () => {
  const markdown = `[Grade S Used Xiaomi](https://en.guazi.com/products/xiaomi-auto-yu7-2025-00l-gray-23800km-at-4wd-5-seats-45nkzqv325.html)\n[duplicate](https://en.guazi.com/products/xiaomi-auto-yu7-2025-00l-gray-23800km-at-4wd-5-seats-45nkzqv325.html)`;
  assert.deepEqual(parseGuaziGlobalListing(markdown), ["https://en.guazi.com/products/xiaomi-auto-yu7-2025-00l-gray-23800km-at-4wd-5-seats-45nkzqv325.html"]);
});

test("parses a Guazi Global EV product and its original gallery", () => {
  const markdown = `[Home](https://en.guazi.com/)/[Used Cars](https://en.guazi.com/used-cars/)/[Xiaomi Auto](https://en.guazi.com/used-cars/xiaomi-auto/)/[YU7](https://en.guazi.com/used-cars/xiaomi-auto/yu7/)/Used Xiaomi Auto YU7 2025 Max\nGrade S\n# Used Xiaomi Auto YU7 2025 Max\nElectric\n![Front](https://image-oversea.guazistatic-global.com/ovp/product/prod/yu7-front.jpg)\n![Rear](https://image-oversea.guazistatic-global.com/ovp/product/prod/yu7-rear.jpg)\nDownload all\nVehicle Details\nItem No 45nkzqv325\n1st Reg. Date 2025.09\nModel Year 2025\nMileage (km)23,800\nFuel Type BEV\nTransmission AT\nCLTC Electric Range (km)760\nBattery Capacity (kWh)101.7\nBattery Type NCM Battery\nDrive Train Dual Motor AWD\nBody Style SUV\nSeats 5\nDoors 5\nExterior Color Dark grey\nLocation Zhengzhou, China\nNo Accident Damage\nFOB Price\n$41,347`;
  const car = parseGuaziGlobalProduct(markdown, "https://en.guazi.com/products/xiaomi-auto-yu7-2025-00l-gray-23800km-at-4wd-5-seats-45nkzqv325.html");
  assert.equal(car.id, "guazi-global-45nkzqv325");
  assert.equal(car.brand, "Xiaomi Auto");
  assert.equal(car.model, "YU7");
  assert.equal(car.mileage, 23800);
  assert.equal(car.sourcePriceUsd, 41347);
  assert.equal(car.battery, 101.7);
  assert.equal(car.range, 760);
  assert.equal(car.drive, "Полный");
  assert.equal(car.images.length, 2);
});

test("classifies Guazi Global range extenders as hybrids", () => {
  const markdown = `[Home](https://en.guazi.com/)/[Used Cars](https://en.guazi.com/used-cars/)/[Li Auto](https://en.guazi.com/used-cars/li-auto/)/[L7](https://en.guazi.com/used-cars/li-auto/l7/)/Used Li Auto L7 2024 Max\nGrade A\n# Used Li Auto L7 2024 Max\n![Front](https://image-oversea.guazistatic-global.com/ovp/product/prod/l7-front.jpg)\nDownload all\nItem No abcdef1234\nModel Year 2024\nMileage (km)20,000\nFuel Type REEV\nFOB Price\n$20,000`;
  const car = parseGuaziGlobalProduct(markdown, "https://en.guazi.com/products/li-auto-l7-2024-15l-gray-20000km-at-4wd-5-seats-abcdef1234.html");
  assert.equal(car.type, "Гибрид");
  assert.equal(car.sourceFuelType, "REEV");
});

test("does not classify Guazi Global combustion cars as electric", () => {
  const markdown = `[Home](https://en.guazi.com/)/[Used Cars](https://en.guazi.com/used-cars/)/[Foton](https://en.guazi.com/used-cars/foton/)/[Scenic G7](https://en.guazi.com/used-cars/foton/scenic-g7/)/Used Foton Scenic G7 2017\n# Used Foton Scenic G7 2017\n![Front](https://image-oversea.guazistatic-global.com/ovp/product/prod/g7-front.jpg)\nDownload all\nItem No abcdef5678\nModel Year 2017\nMileage (km)98,000\nFuel Type Gasoline\nFOB Price\n$8,000`;
  const car = parseGuaziGlobalProduct(markdown, "https://en.guazi.com/products/foton-scenic-g7-2017-20l-white-98000km-mt-2wd-5-seats-abcdef5678.html");
  assert.equal(car.type, "ДВС");
  assert.equal(car.sourceFuelType, "Gasoline");
});
