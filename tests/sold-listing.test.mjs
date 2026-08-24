import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../server/db.mjs";
import { handleApiRequest } from "../server/handler.mjs";
import { rowToCar } from "../server/repository.mjs";

// Проданная машина остаётся в базе — на неё ссылаются заявки, — но снаружи её больше
// не должно быть видно: каталог такие объявления не показывает, карточка отвечает
// «объявления нет», и на этом ответе держится чистка избранного в личном кабинете.
const listingRow = (status) => ({
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
  images: ["https://example.com/zeekr-1.jpg"],
  specifications: { bodyType: "Универсал" },
  source_payload: { usdPrice: 18000 },
  price_history: [],
});

const requestCar = async (id, status) => {
  const previousQuery = pool.query;
  pool.query = async () => ({ rows: [listingRow(status)] });
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
  assert.equal(rowToCar(listingRow("unavailable")).available, false);
  // Узкие выборки столбец состояния не берут: такую строку считаем живой.
  const { status, ...withoutStatus } = listingRow("active");
  assert.equal(rowToCar(withoutStatus).available, true);
});

test("проданная машина отвечает как несуществующая, живая — как обычно", async () => {
  const sold = await requestCar("che168-59343088", "unavailable");
  assert.equal(sold.status, 404);
  assert.match(String(sold.body), /listing_unavailable/);
  const alive = await requestCar("che168-59343088", "active");
  assert.equal(alive.status, 200);
});
