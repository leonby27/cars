import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { protectRussianShortWords } from "../src/typography.js";

const STYLESHEET_URL = new URL("../src/styles.css", import.meta.url);
const MINIMUM_FONT_SIZE_PX = 16;
// Решение владельца от 20.08.2026: в мобильной раскладке допустим шрифт от 14px.
const MOBILE_MINIMUM_FONT_SIZE_PX = 14;
const MOBILE_MAX_WIDTH_PX = 700;
const SMALL_TEXT_EXCEPTIONS = new Set([
  ".delivery-card-heading span",
  ".price-assumption",
  ".price-breakdown b",
  ".price-breakdown small",
  ".price-breakdown strong",
  // Список сроков доставки повторяет вид разбивки цены — и её размер шрифта.
  ".delivery-stages b",
  ".delivery-stages strong",
  ".mini-specs > span",
  ".car-row .mini-specs > span",
  ".car-row .summary",
  ".car-row .source-line",
  ".sort-custom-select .select-trigger b",
  ".sort-custom-select .select-options button",
  ".auth-modal .auth-consent",
  ".vehicle-quick-info-label",
  ".select-option-count",
  ".detail-action-tooltip",
  // Служебный номер объявления под карточкой цены, а не текст для чтения.
  ".listing-id-row",
  // Служебные элементы интерфейса, а не текст для чтения: кружок-счётчик
  // избранного, переключатель валюты и таб-кнопки в мобильном меню.
  ".icon-label b",
  ".header-actions .favorites-link > b",
  // Плашка цены на мини-превью в «Моих поисках»: мелкий плотный шрифт — явное
  // пожелание владельца продукта.
  ".saved-search-preview-price",
  ".header-menu-currency button",
  ".type-tabs button",
]);

test("CSS font sizes never fall below 16px (14px on mobile) outside explicit exceptions", async () => {
  const stylesheet = await readFile(STYLESHEET_URL, "utf8");
  const violations = [];

  // Диапазоны мобильных медиазапросов: внутри них действует мобильный минимум.
  const mobileRanges = [];
  for (const media of stylesheet.matchAll(/@media[^{]*\{/gi)) {
    const maxWidth = media[0].match(/max-width:\s*(\d+(?:\.\d+)?)px/i);
    if (!maxWidth || Number(maxWidth[1]) > MOBILE_MAX_WIDTH_PX) continue;
    let depth = 1;
    let end = media.index + media[0].length;
    while (end < stylesheet.length && depth > 0) {
      if (stylesheet[end] === "{") depth += 1;
      else if (stylesheet[end] === "}") depth -= 1;
      end += 1;
    }
    mobileRanges.push([media.index, end]);
  }
  const insideMobileMedia = (index) => mobileRanges.some(([start, end]) => index >= start && index < end);

  for (const match of stylesheet.matchAll(/font-size\s*:\s*([^;}]+)/gi)) {
    const declaration = match[1].trim();
    const minimum = insideMobileMedia(match.index) ? MOBILE_MINIMUM_FONT_SIZE_PX : MINIMUM_FONT_SIZE_PX;

    for (const value of declaration.matchAll(/(-?\d*\.?\d+)px/gi)) {
      const size = Number(value[1]);

      if (size < minimum) {
        const blockStart = stylesheet.lastIndexOf("{", match.index);
        const selectorStart = stylesheet.lastIndexOf("}", blockStart) + 1;
        // Внутри @media перед селектором остаётся её собственная открывающая скобка,
        // поэтому берём то, что после последней «{» в этом куске.
        const selectors = stylesheet.slice(selectorStart, blockStart).split("{").pop().split(",").map((selector) => selector.trim());
        if (selectors.some((selector) => SMALL_TEXT_EXCEPTIONS.has(selector))) continue;
        const line = stylesheet.slice(0, match.index).split("\n").length;
        violations.push(`line ${line}: font-size: ${declaration}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found font sizes below ${MINIMUM_FONT_SIZE_PX}px:\n${violations.join("\n")}`,
  );
});

test("binds short Russian words to the following word", () => {
  assert.equal(
    protectRussianShortWords("Понятный путь к автомобилю из Китая"),
    "Понятный путь к\u00a0автомобилю из\u00a0Китая",
  );
});

test("binds consecutive short words without changing ordinary spaces", () => {
  assert.equal(
    protectRussianShortWords("Документы и оплата в одном месте"),
    "Документы и\u00a0оплата в\u00a0одном месте",
  );
  assert.equal(protectRussianShortWords("Geely Galaxy"), "Geely Galaxy");
});
