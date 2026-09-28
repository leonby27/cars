import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pool } from "../server/db.mjs";
import { getCatalogMeta, listCars } from "../server/repository.mjs";

// Скорость каталога держится на трёх вещах, которые легко потерять при правке запроса.
// Замеры на боевой базе 28.09.2026, 80 тыс. машин после открытия Guazi.

const capturedListSql = async (query) => {
  const previousQuery = pool.query;
  const seen = [];
  pool.query = async (sql) => {
    seen.push(String(typeof sql === "string" ? sql : sql?.text || ""));
    return { rows: [{ total: 0 }] };
  };
  try {
    await listCars(new URLSearchParams(query));
  } finally {
    pool.query = previousQuery;
  }
  return seen.find((sql) => /LIMIT/.test(sql) && !/count\(\*\)/.test(sql));
};

test("выдача сортирует только номера, а строки целиком берёт для своей страницы", async () => {
  // Сортировка целых строк вместе с исходным ответом источника не влезала в память и
  // писала на диск ~48 МБ на каждый запрос «по умолчанию».
  for (const query of ["limit=48&sort=default&seed=s1", "limit=24&sort=price_asc&brand=BYD", "limit=48&sort=range_desc"]) {
    const sql = await capturedListSql(query);
    assert.ok(sql, query);
    const picked = sql.match(/WITH picked AS \(([\s\S]*?)\)\s*SELECT/);
    assert.ok(picked, `${query}: нет узкой выборки номеров`);
    assert.match(picked[1], /SELECT l\.id FROM catalog_listings/);
    assert.match(picked[1], /LIMIT \$\d+ OFFSET \$\d+/);
    assert.doesNotMatch(picked[1], /l\.\*|source_payload|listing_media/);
    assert.match(sql, /JOIN picked p ON p\.id=l\.id ORDER BY/);
  }
});

test("вид каталога не ищет живые пары дублей в каждом запросе", () => {
  // Готовый список скрытых дублей держат триггеры; поиск пар прямо в виде удваивал
  // подсчёт по каталогу. Действует последняя миграция, задающая вид.
  const dir = new URL("../db/migrations/", import.meta.url);
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  const lastView = files.map((name) => fs.readFileSync(new URL(name, dir), "utf8"))
    .map((sql) => sql.match(/CREATE OR REPLACE VIEW catalog_listings AS([\s\S]*?);/)?.[1])
    .filter(Boolean).at(-1);
  assert.ok(lastView);
  assert.match(lastView, /catalog_hidden_duplicates/);
  assert.doesNotMatch(lastView, /catalog_duplicate_matches/);

  const sql = fs.readFileSync(new URL("041_catalog_hidden_duplicates.sql", dir), "utf8");
  // Все четыре причины, по которым дубль должен показаться или спрятаться.
  assert.match(sql, /AFTER INSERT ON catalog_duplicate_matches/);
  assert.match(sql, /AFTER UPDATE ON catalog_duplicate_matches/);
  assert.match(sql, /AFTER DELETE ON catalog_duplicate_matches/);
  assert.match(sql, /AFTER UPDATE OF status, source ON listings/);
  assert.match(sql, /ON catalog_sources\s+FOR EACH STATEMENT/);
});

test("справочник фильтров проходит по каталогу два раза, а не шесть", async () => {
  // Шесть отдельных подсчётов на двух ядрах сервера стоили 1,2–1,9 с.
  const previousQuery = pool.query;
  const seen = [];
  pool.query = async (sql) => { seen.push(String(sql)); return { rows: [] }; };
  try {
    for (const args of [[null, null, null], ["ДВС", "Geely", ["Седан"]]]) {
      seen.length = 0;
      const meta = await getCatalogMeta(...args);
      assert.equal(seen.length, 2, JSON.stringify(args));
      assert.ok(seen.every((sql) => /GROUPING SETS/.test(sql)));
      assert.deepEqual(Object.keys(meta), ["total", "brands", "models", "bodyTypes", "drives", "availability"]);
    }
  } finally {
    pool.query = previousQuery;
  }
});
