import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_FOOTER,
  buildPostText,
  carNumber,
  carPageUrl,
  pickPhotos,
  withCatalogFooter,
} from "../scripts/lib/social-card.mjs";

// Intl разделяет тысячи неразрывным пробелом — в ленте это правильно, а в тесте
// мешает читать ожидаемую строку, поэтому сравниваем по обычным пробелам.
const norm = (text) => text.replace(/\u00A0/g, " ");

const photo = (name) => `https://erscglobal2.autoimg.cn/escimg/auto/g34/1400x0_c42_${name}.jpg.webp`;

const electric = {
  id: "che168-59876786", externalId: "59876786", brand: "Zeekr", model: "001", year: 2026,
  type: "Электромобиль", mileage: 9500, battery: 95, range: 710,
  image: photo("a"), images: [photo("a"), photo("b")],
};

const hybrid = {
  id: "che168-59824704", externalId: "59824704", brand: "Li Auto", model: "Li Auto L6", year: 2024,
  type: "Гибрид", mileage: 55000, battery: 36.8, range: 212,
};

const petrol = {
  id: "che168-59764695", externalId: "59764695", brand: "Audi", model: "A3", year: 2023,
  type: "ДВС", mileage: 29000, engine: "1.4T 150HP L4", horsepower: 150, bodyType: "Хэтчбек",
};

test("у электромобиля в первой строке цена в двух валютах, дальше батарея и запас хода", () => {
  const lines = norm(buildPostText(electric, { totalUsd: 35100, totalByn: 106100 })).split("\n");
  assert.equal(lines[0], "⚡ Zeekr 001, 2026 · 35 100$ (106 100 BYN) под ключ");
  assert.equal(lines[1], "🛣 Пробег 9 500 км");
  assert.equal(lines[2], "🔋 Батарея 95 кВт·ч · запас хода 710 км");
  assert.equal(lines[3], "📦 В цену входит доставка, растаможка и все сборы");
  assert.equal(lines[4], "🔎 В каталоге под номером 59876786 — ссылка в шапке профиля");
});

test("у гибрида свой значок и пометка про бензин, дубль марки в названии убран", () => {
  const text = norm(buildPostText(hybrid, { totalUsd: 38100, totalByn: 115200 }));
  assert.match(text, /^🔌 Li Auto L6, 2024 · 38 100\$ \(115 200 BYN\) под ключ$/m);
  assert.match(text, /🔋 Батарея 36,8 кВт·ч · 212 км на электротяге, дальше бензин/);
});

test("у бензиновой вместо батареи объём, мощность и кузов", () => {
  const text = norm(buildPostText(petrol, { totalUsd: 31250, totalByn: 94500 }));
  assert.match(text, /^🚗 Audi A3, 2023 · 31 250\$ \(94 500 BYN\) под ключ$/m);
  assert.match(text, /⚙️ 1\.4 турбо · 150 л\.с\. · хэтчбек/);
});

test("в Threads ссылка кликается и меток нет, в Instagram наоборот", () => {
  const threads = norm(buildPostText(electric, { totalUsd: 35100, totalByn: 106100, network: "threads" }));
  assert.match(threads, /🔎 №59876786 · abcars\.by\/cars\/59876786$/);
  assert.ok(!threads.includes("#"), "в Threads метки не ставим");
  assert.ok(threads.length <= 500, "запись в Threads не длиннее 500 знаков");

  const instagram = norm(buildPostText(electric, { totalUsd: 35100, totalByn: 106100 }));
  assert.match(instagram, /#абкарс #автоизкитая #электромобиль #zeekr #авторынокбеларуси$/);
});

test("в телеграме ссылка прячется под словами, а рядом с кнопкой её нет совсем", () => {
  const withLink = buildPostText(electric, { totalUsd: 35100, totalByn: 106100, network: "telegram" });
  assert.match(withLink, /🔎 №59876786 · <a href="https:\/\/abcars\.by\/cars\/59876786">Смотреть в каталоге<\/a>$/);
  assert.ok(!withLink.includes("#"), "меток в телеграме нет");

  const withButton = buildPostText(electric, { totalUsd: 35100, totalByn: 106100, network: "telegram", withLink: false });
  assert.ok(!withButton.includes("<a href"), "при кнопке ссылки в тексте не нужно");
  assert.match(withButton, /🔎 №59876786$/, "номер машины остаётся даже рядом с кнопкой");
  assert.ok(withButton.length <= 1024, "подпись под снимком в телеграме не длиннее 1024 знаков");
  assert.equal(carPageUrl(electric), "https://abcars.by/cars/59876786");
});

test("угловые скобки из названия не ломают разметку телеграма", () => {
  const odd = { ...electric, brand: "A<B&C", model: "X" };
  const text = buildPostText(odd, { totalUsd: 0, network: "telegram" });
  assert.match(text, /^⚡ A&lt;B&amp;C X, 2026$/m);
});

test("недостающие характеристики строку не создают, а не печатают пустоту", () => {
  const bare = { id: "che168-1", externalId: "1", brand: "BYD", model: "Song", year: 2022, type: "Электромобиль" };
  const lines = norm(buildPostText(bare, { totalUsd: 0 })).split("\n");
  assert.equal(lines[0], "⚡ BYD Song, 2022");
  assert.equal(lines[1], "📦 В цену входит доставка, растаможка и все сборы");
  assert.ok(!lines.some((line) => /Пробег|Батарея|л\.с\./.test(line)));
});

test("кадры собираются без повторов, в JPEG и не больше запрошенного", () => {
  const car = { ...electric, images: [photo("a"), photo("a"), photo("b"), photo("c"), "https://example.com/x.jpg", null] };
  const photos = pickPhotos(car, { limit: 2 });
  assert.deepEqual(photos, [
    "https://erscglobal2.autoimg.cn/escimg/auto/g34/1080x0_a.jpg",
    "https://erscglobal2.autoimg.cn/escimg/auto/g34/1080x0_b.jpg",
  ]);
  assert.equal(pickPhotos(car).length, 3, "чужой адрес и пустые значения отброшены");
});

test("номер машины берётся и из внешнего поля, и из нашего кода", () => {
  assert.equal(carNumber(electric), "59876786");
  assert.equal(carNumber({ id: "che168-12345" }), "12345");
});

test("Threads и Telegram получают подпись каталога только когда ссылки на сайт ещё нет", () => {
  assert.equal(withCatalogFooter("Короткий текст", "threads"), `Короткий текст\n\n${CATALOG_FOOTER}`);
  assert.equal(withCatalogFooter("Короткий текст", "telegram"), `Короткий текст\n\n${CATALOG_FOOTER}`);
  assert.equal(withCatalogFooter("Смотрите abcars.by/cars/123", "threads"), "Смотрите abcars.by/cars/123");
  assert.equal(withCatalogFooter("Короткий текст", "instagram"), "Короткий текст");
});
