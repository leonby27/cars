import assert from "node:assert/strict";
import test from "node:test";
import { protectRussianShortWords } from "../src/typography.js";

// Проверка минимального размера шрифта удалена по решению владельца от 20.08.2026:
// размер шрифта в вёрстке не ограничиваем.

test("binds short Russian words to the following word", () => {
  assert.equal(
    protectRussianShortWords("Понятный путь к автомобилю из Китая"),
    "Понятный путь к автомобилю из Китая",
  );
});

test("binds consecutive short words without changing ordinary spaces", () => {
  assert.equal(
    protectRussianShortWords("Документы и оплата в одном месте"),
    "Документы и оплата в одном месте",
  );
  assert.equal(protectRussianShortWords("Geely Galaxy"), "Geely Galaxy");
});
