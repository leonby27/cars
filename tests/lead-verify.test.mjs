import test from "node:test";
import assert from "node:assert/strict";
import { newVerifyToken, phoneVerifiedMessage, phonesMatch, tokenFromStart, verifyDeepLink } from "../server/lead-verify.mjs";

// Подтверждение номера через бота (25.09.2026): здесь проверяются чистые части —
// сверка номеров, разбор ссылки и текст сообщения. База и телеграм в тестах не нужны.

test("номера сравниваются по цифрам: с плюсом, без плюса и с пробелами", () => {
  assert.equal(phonesMatch("+375 29 123-45-67", "375291234567"), true);
  assert.equal(phonesMatch("+375291234567", "+375291234568"), false);
  assert.equal(phonesMatch("", ""), false);
  assert.equal(phonesMatch(null, "375291234567"), false);
});

test("ключ из ссылки на бота разбирается, чужие команды — нет", () => {
  const token = newVerifyToken();
  assert.match(token, /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(tokenFromStart(`/start v_${token}`), token);
  assert.equal(tokenFromStart(`/start@importabcarsbot v_${token}`), token);
  assert.equal(tokenFromStart("/start"), null);
  assert.equal(tokenFromStart("/start hello"), null);
  assert.equal(tokenFromStart("круг"), null);
  assert.equal(verifyDeepLink("importabcarsbot", token), `https://t.me/importabcarsbot?start=v_${token}`);
  assert.equal(verifyDeepLink("@importabcarsbot", token), `https://t.me/importabcarsbot?start=v_${token}`);
  assert.equal(verifyDeepLink(null, token), null);
});

test("сообщение о подтверждённом номере называет клиента, телефон и машину", () => {
  const text = phoneVerifiedMessage({ customer_name: "Алексей", contact: "+375291234567", listing_id: "che168-59370942", title: "BYD Song Plus 2023" });
  assert.match(text, /Номер подтверждён через Telegram/);
  assert.match(text, /Клиент: Алексей/);
  assert.match(text, /Телефон: \+375291234567/);
  assert.match(text, /Машина: BYD Song Plus 2023/);
  assert.match(text, /\/cars\/59370942$/m);
  assert.match(text, /\/analytics$/m);
});
