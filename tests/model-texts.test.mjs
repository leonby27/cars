// Обзоры моделей разложены на две части: «обложка» в src/model-pages.js (её грузит
// каждый посетитель) и текст в src/model-texts/<slug>.js (его грузит только тот, кто
// открыл эту модель). Тесты здесь стерегут границу между ними: если текст снова
// окажется в обложке, сайт молча начнёт отдавать всем лишний мегабайт.
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_PAGES } from "../src/model-pages.js";
import { MODEL_TEXTS_RAW, modelPageWithText, modelPagesWithText } from "../src/model-texts.js";

const textsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "model-texts");
const HEAVY = ["intro", "stats", "sections", "versions", "faq", "disclaimer"];

test("у каждого обзора есть файл с текстом, и лишних файлов нет", () => {
  const files = readdirSync(textsDir).filter((name) => name.endsWith(".js")).map((name) => name.replace(/\.js$/, ""));
  const slugs = MODEL_PAGES.map((page) => page.slug);
  assert.deepEqual([...files].sort(), [...slugs].sort());
  assert.deepEqual(Object.keys(MODEL_TEXTS_RAW).sort(), [...slugs].sort());
});

test("текст обзора не возвращается в общий файл приложения", () => {
  const withText = MODEL_PAGES.filter((page) => HEAVY.some((key) => page[key] !== undefined));
  assert.deepEqual(
    withText.map((page) => page.slug),
    [],
    "текст обзора должен лежать в src/model-texts/<slug>.js, иначе его скачивает каждый посетитель",
  );
});

test("в обложке есть всё, что показывают чужие страницы", () => {
  // Превью читает блок «О модели» в карточке машины и список на /models: текста
  // обзора там нет, и подставить первый абзац вместо превью больше неоткуда.
  for (const page of MODEL_PAGES) {
    for (const key of ["slug", "path", "brand", "model", "name", "tagline", "teaser", "seoTitle", "seoDescription", "h1", "lead"]) {
      assert.ok(page[key], `${page.slug}: не заполнено поле ${key}`);
    }
  }
});

test("собранный обзор — это обложка плюс текст", () => {
  const pages = modelPagesWithText();
  assert.equal(pages.length, MODEL_PAGES.length);
  for (const page of pages) {
    assert.ok(page.intro?.length, `${page.slug}: нет вступления`);
    assert.ok(page.sections?.length, `${page.slug}: нет разделов текста`);
    assert.ok(page.faq?.length, `${page.slug}: нет частых вопросов`);
    assert.ok(page.disclaimer, `${page.slug}: нет оговорки внизу страницы`);
  }
});

test("у несуществующей модели текста нет, а не пустой обзор", () => {
  assert.equal(modelPageWithText(null), null);
});
