import test from "node:test";
import assert from "node:assert/strict";
import { buildCarFilters, searchTerms } from "../server/repository.mjs";

const filters = (query) => buildCarFilters(new URLSearchParams(query));

test("свободный текст требует каждого слова", () => {
  const { where, values } = filters("text=surpass 401km");
  assert.equal(where.match(/l\.search_text LIKE/g).length, 2);
  assert.deepEqual(values, ["%surpass%", "%401km%"]);
});

test("знаки LIKE в запросе ищутся как обычные символы", () => {
  // Без этого «a%b» нашло бы вообще всё, а подчёркивание совпало бы с любой буквой.
  assert.deepEqual(filters("text=a%b a_b").values, ["%a\\%b%", "%a\\_b%"]);
  // По краям слова такие знаки просто отбрасываются вместе с прочей пунктуацией.
  assert.deepEqual(searchTerms("«100%»"), ["100"]);
});

test("пустой и однобуквенный запрос отбор не трогают", () => {
  assert.equal(filters("text=").where.includes("search_text"), false);
  assert.equal(filters("text=a").where.includes("search_text"), false);
  assert.deepEqual(searchTerms("a б"), []);
});

test("длинный запрос обрезается — каждое слово стоит отдельного прохода", () => {
  assert.equal(filters("text=one two three four five six seven eight").values.length, 6);
});
