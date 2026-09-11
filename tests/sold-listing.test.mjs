import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../server/db.mjs";
import { handleApiRequest } from "../server/handler.mjs";
import { rowToCar, SOLD_LISTING_RETENTION_MS, soldListingVisible } from "../server/repository.mjs";

// Проданная машина остаётся в базе — на неё ссылаются заявки. Каталог её не показывает,
// а избранное и прямая ссылка получают временную карточку в течение двух недель.
const listingRow = (status, soldAt = null) => ({
  id: "che168-59343088",
  external_id: "59343088",
  source: "Che168",
  source_url: "https://global.che168.com/en/detail/59343088",
  title: "Zeekr 007GT 2025",
  brand: "Zeekr",
  model: "007GT",
  model_year: 2025,
  powertrain: "Электромобиль",
  drivetrain: "Задний",
  mileage_km: 25000,
  price_cny: 128600,
  city: "dongguan",
  status,
  sold_at: soldAt,
  last_checked_at: soldAt,
  images: ["https://example.com/zeekr-1.jpg"],
  specifications: { bodyType: "Универсал" },
  source_payload: { usdPrice: 18000 },
  price_history: [],
});

const requestCar = async (id, status, soldAt = null) => {
  const previousQuery = pool.query;
  pool.query = async () => ({ rows: [listingRow(status, soldAt)] });
  const state = { status: 0 };
  const response = {
    req: { headers: {} },
    writeHead(code) { state.status = code; return this; },
    end(body) { state.body = body; return this; },
  };
  try {
    await handleApiRequest({ method: "GET", url: `/api/cars/${id}`, headers: { host: "example.test" } }, response);
  } finally {
    pool.query = previousQuery;
  }
  return state;
};

test("состояние объявления доезжает до карточки признаком available", () => {
  assert.equal(rowToCar(listingRow("active")).available, true);
  const soldAt = "2026-09-10T12:00:00.000Z";
  const sold = rowToCar(listingRow("unavailable", soldAt));
  assert.equal(sold.available, false);
  assert.equal(sold.soldAt, soldAt);
  assert.equal(sold.status, "Продано");
  // Узкие выборки столбец состояния не берут: такую строку считаем живой.
  const { status, ...withoutStatus } = listingRow("active");
  assert.equal(rowToCar(withoutStatus).available, true);
});

test("проданная машина видна ровно две недели", () => {
  const now = Date.parse("2026-09-11T12:00:00.000Z");
  const soldAt = new Date(now - SOLD_LISTING_RETENTION_MS + 1).toISOString();
  const expiredAt = new Date(now - SOLD_LISTING_RETENTION_MS).toISOString();
  assert.equal(soldListingVisible(rowToCar(listingRow("unavailable", soldAt)), now), true);
  assert.equal(soldListingVisible(rowToCar(listingRow("unavailable", expiredAt)), now), false);
});

test("недавно проданная машина отвечает карточкой, старая — как несуществующая", async () => {
  const recentAt = new Date(Date.now() - 86400_000).toISOString();
  const oldAt = new Date(Date.now() - SOLD_LISTING_RETENTION_MS - 1000).toISOString();
  const recent = await requestCar("che168-59343088", "unavailable", recentAt);
  assert.equal(recent.status, 200);
  assert.match(String(recent.body), /"available":false/);
  assert.match(String(recent.body), /"status":"Продано"/);
  const old = await requestCar("che168-59343088", "unavailable", oldAt);
  assert.equal(old.status, 404);
  assert.match(String(old.body), /listing_unavailable/);
  const alive = await requestCar("che168-59343088", "active");
  assert.equal(alive.status, 200);
});
