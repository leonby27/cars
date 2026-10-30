import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { VISIT_COUNTRY_CODES, VISIT_FLAG_COUNTRIES, normalizeVisitCountry, visitCountryPresentation } from "../src/analytics-countries.js";
import { COUNTRY_SOURCES, ipv4RangeToCidrs, loadCountryRanges, parseDelegatedStats, validateCountryRanges } from "../scripts/update-country-ranges.mjs";

test("Europe, former USSR and North America have flags; other countries have named globes", () => {
  const europe = "AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM TR UA VA XK".split(" ");
  const formerUSSR = "AM AZ BY EE GE KG KZ LT LV MD RU TJ TM UA UZ".split(" ");
  for (const code of [...europe, ...formerUSSR, "US", "CA"]) {
    assert.ok(VISIT_FLAG_COUNTRIES.has(code), code);
    const result = visitCountryPresentation(code);
    assert.equal(result.flag, `/flags/analytics/${code.toLowerCase()}.svg`);
    assert.notEqual(result.label, code);
    assert.notEqual(result.label, "Другая страна");
  }
  for (const [code, label] of [["CN", "Китай"], ["JP", "Япония"], ["BR", "Бразилия"], ["AU", "Австралия"]]) {
    assert.deepEqual(visitCountryPresentation(code), { code, label, flag:"" });
  }
  assert.equal(visitCountryPresentation("US").label, "США");
  assert.equal(visitCountryPresentation("BY").label, "Беларусь");
  assert.equal(visitCountryPresentation("CA").label, "Канада");
});

test("legacy other and genuinely unknown visits keep distinct labels", () => {
  assert.deepEqual(visitCountryPresentation("other"), { code:"other", label:"Другая страна", flag:"" });
  for (const value of [null, undefined, "", "XX", "ZZ", "INVALID", "../../us"]) {
    assert.deepEqual(visitCountryPresentation(value), { code:"", label:"Страна не записана", flag:"" });
  }
  assert.equal(normalizeVisitCountry(" pl "), "PL");
  assert.equal(VISIT_COUNTRY_CODES.size, 250);
});

test("every advertised flag exists locally and contains no active or remote content", async () => {
  for (const code of VISIT_FLAG_COUNTRIES) {
    const source = await readFile(new URL(`../public/flags/analytics/${code.toLowerCase()}.svg`, import.meta.url), "utf8");
    assert.match(source, /<svg\b/);
    assert.doesNotMatch(source, /<script\b|<foreignObject\b|\bon\w+\s*=|(?:href|url)\s*[=(]\s*["']?https?:/i);
  }
});

test("worldwide country feeds retain IPv4 and IPv6 and reject unknown registries and country codes", () => {
  const text = [
    "afrinic|ZA|ipv4|196.0.0.0|256|20200101|allocated|x",
    "lacnic|BR|ipv6|2800::|32|20200101|assigned|x",
    "apnic|ZZ|ipv4|1.1.1.0|256|20200101|allocated|x",
    "other|PL|ipv4|2.2.2.0|256|20200101|allocated|x",
    "arin|US|ipv4|8.8.8.0|256|20200101|available|x",
    "arin|*|ipv4|*|50|summary",
  ].join("\n");
  assert.deepEqual(parseDelegatedStats(text), [["196.0.0.0/24", "ZA"], ["2800::/32", "BR"]]);
  assert.deepEqual(parseDelegatedStats(text, "afrinic"), [["196.0.0.0/24", "ZA"]]);
  assert.throws(() => ipv4RangeToCidrs("1.1.1.0", Infinity));
  assert.throws(() => ipv4RangeToCidrs("255.255.255.255", 2));
  assert.throws(() => parseDelegatedStats("arin|CA|ipv6|invalid|32|20200101|allocated|x"));
});

test("a failed or truncated regional feed never produces a partial replacement", async () => {
  const sources = COUNTRY_SOURCES.map((source) => ({ ...source, minimum:1 }));
  const fixture = (registry) => `${registry}|PL|ipv4|1.1.1.0|256|20200101|allocated|x`;
  const load = (failure) => loadCountryRanges({ sources, fetchImpl:async (url) => {
    const { registry } = sources.find((source) => source.url === url);
    return { ok:!(failure === "http" && registry === "arin"), status:503,
      text:async () => failure === "truncated" && registry === "arin" ? "" : fixture(registry) };
  } });
  assert.deepEqual(await load(), [["1.1.1.0/24", "PL"]]);
  await assert.rejects(load("http"), AggregateError);
  await assert.rejects(load("truncated"), AggregateError);
  assert.throws(() => validateCountryRanges([["1.1.1.0/24", "PL"]]), /Сетей слишком мало/);
  const complete = Object.entries({ BY:50, RU:5000, US:5000, CA:500, DE:1000, PL:500 })
    .flatMap(([code, count]) => Array.from({ length:count }, (_, index) => [`${code}-${index}`, code]));
  assert.equal(validateCountryRanges(complete).US, 5000);
  assert.throws(() => validateCountryRanges(complete, complete.length * 2), /Сетей слишком мало/);
});
