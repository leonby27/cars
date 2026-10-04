import assert from "node:assert/strict";
import test from "node:test";
import { completePhoneNumber, deletePhoneDigit, formatPhoneNational, phoneCaretPosition, phoneCountry, readPhoneInput } from "../src/phone-mask.js";
import { normalizePhone } from "../server/auth.mjs";

test("Belarus is the default, with a nine-digit national mask", () => {
  assert.equal(phoneCountry().id, "BY");
  const phone = readPhoneInput("291234567");
  assert.deepEqual(phone, { country: "BY", national: "291234567" });
  assert.equal(formatPhoneNational(phone), "(29) 123-45-67");
  assert.equal(completePhoneNumber(phone), "375291234567");
});

test("the Russian mask includes ten national digits and uses +7", () => {
  const phone = readPhoneInput("9161234567", "RU");
  assert.equal(formatPhoneNational(phone), "(916) 123-45-67");
  assert.equal(completePhoneNumber(phone), "79161234567");
});

test("pasting a full phone number selects the correct country without duplicating its code", () => {
  for (const source of ["+375 (29) 123-45-67", "375291234567", "00375 29 123 45 67", "8 (029) 123-45-67"]) {
    assert.deepEqual(readPhoneInput(source, "BY"), { country: "BY", national: "291234567" }, source);
  }
  assert.deepEqual(readPhoneInput("+375291234567", "RU"), { country: "BY", national: "291234567" });
  assert.deepEqual(readPhoneInput("8 (029) 123-45-67", "RU"), { country: "BY", national: "291234567" });
  for (const source of ["+7 (916) 123-45-67", "79161234567", "8 (916) 123-45-67", "0079161234567"]) {
    assert.deepEqual(readPhoneInput(source, "BY"), { country: "RU", national: "9161234567" }, source);
  }
});

test("partial and empty input do not become a submittable contact", () => {
  assert.equal(formatPhoneNational({ country: "BY", national: "" }), "");
  assert.equal(formatPhoneNational({ country: "BY", national: "2" }), "(2");
  assert.equal(formatPhoneNational({ country: "BY", national: "291" }), "(29) 1");
  assert.equal(completePhoneNumber({ country: "BY", national: "" }), "");
  assert.equal(completePhoneNumber({ country: "BY", national: "29123456" }), "");
  assert.equal(completePhoneNumber({ country: "RU", national: "916123456" }), "");
  assert.equal(completePhoneNumber({ country: "BY", national: "2912345678" }), "");
  assert.equal(completePhoneNumber({ country: "BY", national: "29123456a" }), "");
  assert.equal(readPhoneInput("+44 7911 123456"), null);
  assert.equal(readPhoneInput("+375 29 123 45 678"), null);
});

test("Backspace at a separator removes the preceding digit instead of getting stuck", () => {
  const phone = { country: "BY", national: "291234567" };
  const display = formatPhoneNational(phone);
  const caret = display.indexOf("-") + 1;
  const result = deletePhoneDigit(phone, display, caret, true);
  assert.equal(result.phone.national, "29124567");
  const formatted = formatPhoneNational(result.phone);
  assert.equal(formatted, "(29) 124-56-7");
  assert.equal(phoneCaretPosition(formatted, result.caretDigits), 7);
});

test("Delete before a separator removes the next digit; mask punctuation stays intact", () => {
  const phone = { country: "RU", national: "9161234567" };
  const display = formatPhoneNational(phone);
  const result = deletePhoneDigit(phone, display, display.indexOf("-"), false);
  assert.equal(result.phone.national, "916123567");
  assert.equal(formatPhoneNational(result.phone), "(916) 123-56-7");
  assert.equal(deletePhoneDigit(phone, display, 0, true).phone.national, phone.national);
  assert.equal(deletePhoneDigit(phone, display, display.length, false).phone.national, phone.national);
});

test("both countries produce the existing backend contact format", () => {
  for (const source of ["+375291234567", "+79161234567"]) {
    const canonical = completePhoneNumber(readPhoneInput(source));
    assert.equal(canonical, normalizePhone(source));
    assert.equal(normalizePhone(canonical), canonical);
  }
});
