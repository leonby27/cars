import assert from "node:assert/strict";
import test from "node:test";
import { CITY_NAMES, cityName } from "../src/city-names.js";

test("города латиницей переводятся на русский", () => {
  // Источник давно отдаёт города латиницей. Пока справочник был собран только по
  // иероглифам, перевод не срабатывал ни для одного объявления, и сайт показывал
  // «tangshan» вместо «Таншань».
  assert.equal(cityName("tangshan"), "Таншань");
  assert.equal(cityName("beijing"), "Пекин");
  assert.equal(cityName("guangzhou"), "Гуанчжоу");
  assert.equal(cityName("wulumuqi"), "Урумчи");
});

test("прежний формат с иероглифами продолжает работать", () => {
  assert.equal(cityName("长治"), "Чанчжи");
  assert.equal(cityName("北京"), "Пекин");
});

test("подчёркивание в названии не мешает переводу", () => {
  // Источник различает одноимённые города подчёркиванием: «tai_zhou», «yi_chun».
  assert.equal(cityName("tai_zhou"), "Тайчжоу");
  assert.equal(cityName("yi_chun"), "Ичунь");
  assert.equal(cityName("SU_ZHOU"), "Сучжоу");
});

test("неизвестный город не подменяется догадкой", () => {
  assert.equal(cityName("nowhere"), null);
  assert.equal(cityName(""), null);
  assert.equal(cityName(null), null);
  assert.equal(cityName(undefined), null);
});

test("в справочнике нет пустых значений", () => {
  for (const [key, value] of Object.entries(CITY_NAMES)) {
    assert.ok(key.trim(), "пустой ключ в справочнике городов");
    assert.match(value, /^[А-ЯЁ][А-Яа-яЁё\s-]*$/u, `${key}: русское название ожидается, получено «${value}»`);
  }
});
