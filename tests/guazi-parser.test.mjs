import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEnergy, parseGuaziHtml, parseGuaziListing, parseGuaziMarkdown, parseGuaziSeriesLinks, parseMileage } from "../scripts/lib/guazi-parser.mjs";

test("parses Chinese mileage units", () => {
  assert.equal(parseMileage("0.25万公里"), 2500);
  assert.equal(parseMileage("12800公里"), 12800);
});

test("parses a Guazi markdown vehicle", () => {
  const markdown = `id:c168848183157610\nmanufacturer:比亚迪\nbrand:比亚迪\nseries:比亚迪e6\nmodel:2023款 出租版\nfull_payment:81700元\nfirst_register:2024-05\nmileage:2500公里\ntransfer_times:1次\ncity:西安\ntype:新能源\ncondition_grade:S\ncondition_desc:理赔0次/过户1次\nappearance_score:95分(满分100分)`;
  const car = parseGuaziMarkdown(markdown, "https://www.guazi.com/car-detail/c168848183157610.md");
  assert.equal(car.brand, "BYD");
  assert.equal(car.model, "e6");
  assert.equal(car.chinaPrice, 81700);
  assert.equal(car.mileage, 2500);
  assert.equal(car.owners, 2);
  assert.equal(car.appearanceScore, 95);
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

test("discovers only selected EV/PHEV series on a mixed brand page", () => {
  const html = `<a href="/bj/byd/qplus/">秦PLUS</a><a href="/bj/byd/byd-f3/">比亚迪F3</a><a href="/bj/byd/sproxny/">宋Pro新能源</a>`;
  const links = parseGuaziSeriesLinks(html, "https://www.guazi.com/bj/byd/", "新能源|PLUS");
  assert.deepEqual(links.map((item) => item.name), ["秦PLUS", "宋Pro新能源"]);
});

test("extracts listing IDs and pagination", () => {
  const html = `<a href="/car-detail/c170580306182112.html">car</a><script>{\\"totalPage\\":8}</script>`;
  assert.deepEqual(parseGuaziListing(html), { ids: ["170580306182112"], totalPages: 8 });
});
