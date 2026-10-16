import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { pool } from "../server/db.mjs";
import { handleApiRequest } from "../server/handler.mjs";
import { rowToCar, SOLD_LISTING_RETENTION_MS, soldListingVisible, purgeExpiredSoldFavorites } from "../server/repository.mjs";

// Проданная машина остаётся в базе — на неё ссылаются заявки. Каталог её не показывает,
// а избранное и прямая ссылка получают временную карточку в течение 60 дней.
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

test("проданная машина видна ровно 60 дней, включая бывшее двухнедельное окно", () => {
  const now = Date.parse("2026-09-11T12:00:00.000Z");
  assert.equal(SOLD_LISTING_RETENTION_MS, 60 * 86400_000);
  const soldAt = new Date(now - SOLD_LISTING_RETENTION_MS + 1).toISOString();
  const expiredAt = new Date(now - SOLD_LISTING_RETENTION_MS).toISOString();
  for (const days of [1, 14, 30, 59]) {
    const sold = rowToCar(listingRow("unavailable", new Date(now - days * 86400_000).toISOString()));
    assert.equal(soldListingVisible(sold, now), true);
  }
  assert.equal(soldListingVisible(rowToCar(listingRow("unavailable", soldAt)), now), true);
  assert.equal(soldListingVisible(rowToCar(listingRow("unavailable", expiredAt)), now), false);
});

test('automatically skipped cards are unavailable, never labeled sold, and have no sale retention', async () => {
  const row=listingRow('skipped',new Date().toISOString());
  const car=rowToCar(row);
  assert.equal(car.available,false);assert.equal(car.soldAt,null);
  assert.equal(car.status,'Карточка недоступна');assert.equal(soldListingVisible(car),false);
  assert.equal((await requestCar(row.id,'skipped',new Date().toISOString())).status,404);
});

test("недавно проданная машина отвечает карточкой, старая — как несуществующая", async () => {
  const recentAt = new Date(Date.now() - 59 * 86400_000).toISOString();
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

test("очистка избранного сохраняет продажи до 60 дней и удаляет только истёкшие", { skip:!process.env.TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  const db = new pg.Client({ connectionString:url.href });
  await db.connect();
  try {
    await db.query("BEGIN");
    // Временные таблицы скрывают настоящие; откат не меняет сохранённое избранное.
    await db.query(`CREATE TEMP TABLE listings(id text, status text, sold_at timestamptz, last_checked_at timestamptz, last_seen_at timestamptz);
      CREATE TEMP TABLE customer_favorites(customer_id text, listing_id text);
      INSERT INTO listings VALUES
        ('active', 'active', now()-interval '90 days', now(), now()),
        ('recent', 'unavailable', now()-interval '30 days', now(), now()),
        ('last-millisecond', 'unavailable', now()-interval '60 days'+interval '1 millisecond', now(), now()),
        ('boundary', 'unavailable', now()-interval '60 days', now(), now()),
        ('expired', 'unavailable', now()-interval '61 days', now(), now()),
        ('legacy-check', 'unavailable', NULL, now()-interval '59 days', now()-interval '90 days'),
        ('legacy-seen', 'unavailable', NULL, NULL, now()-interval '59 days'),
        ('legacy-expired', 'unavailable', NULL, now()-interval '61 days', now()),
        ('unknown-date', 'unavailable', NULL, NULL, NULL),
        ('skipped', 'skipped', NULL, now()-interval '90 days', now());
      INSERT INTO customer_favorites SELECT 'customer', id FROM listings;
      INSERT INTO customer_favorites VALUES ('another-customer', 'recent'), ('customer', 'missing');`);
    assert.equal(await purgeExpiredSoldFavorites(db), 3);
    const remaining = (await db.query("SELECT listing_id FROM customer_favorites ORDER BY listing_id")).rows.map(row => row.listing_id);
    assert.deepEqual(remaining, ["active", "last-millisecond", "legacy-check", "legacy-seen", "missing", "recent", "recent", "skipped", "unknown-date"]);
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
});
