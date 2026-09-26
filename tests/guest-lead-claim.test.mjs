import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const handler = readFileSync(new URL("../server/handler.mjs", import.meta.url), "utf8");
const orders = readFileSync(new URL("../server/orders.mjs", import.meta.url), "utf8");

// 26.09.2026 гость оставил заявку, зарегистрировался и отправил ту же машину ещё раз:
// кабинет не знал о его заявке. Вход и регистрация должны забирать её в кабинет.
test("регистрация и вход переносят заявку гостя в кабинет", () => {
  const register = handler.slice(handler.indexOf('url.pathname === "/api/auth/register"'), handler.indexOf('url.pathname === "/api/auth/login"'));
  const login = handler.slice(handler.indexOf('url.pathname === "/api/auth/login"'), handler.indexOf('url.pathname === "/api/auth/me"'));
  assert.match(register, /claimGuestLeads\(result\.user\)/);
  assert.match(login, /claimGuestLeads\(user\)/);
});

test("перенесённая заявка уходит из форм и не шлётся в телеграм второй раз", () => {
  const claim = orders.slice(orders.indexOf("export async function claimGuestAvailabilityLeads"), orders.indexOf("const actionUpdates"));
  assert.match(claim, /availability_status,availability_requested_at/);
  assert.match(claim, /DELETE FROM order_drafts/);
  assert.doesNotMatch(claim, /notifyLead/);
});
