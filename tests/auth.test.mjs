import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, normalizePhone, normalizeProfile, readCookie, verifyPassword } from "../server/auth.mjs";
import { isDatabaseUnavailable } from "../server/db.mjs";

test("normalizePhone accepts a local Belarus number", () => {
  assert.equal(normalizePhone("29 123-45-67"), "375291234567");
  assert.equal(normalizePhone("+375 (29) 123-45-67"), "375291234567");
});

test("password hashes can be verified without storing the password", async () => {
  const credentials = await hashPassword("strong-password");
  assert.equal(await verifyPassword("strong-password", credentials.salt, credentials.hash), true);
  assert.equal(await verifyPassword("wrong-password", credentials.salt, credentials.hash), false);
});

test("readCookie finds an encoded session token", () => {
  assert.equal(readCookie("theme=light; navostok_session=abc%20123", "navostok_session"), "abc 123");
});

test("normalizeProfile trims user details and allowlists contact preference", () => {
  assert.deepEqual(normalizeProfile({ name:"  Анна Иванова ", email:" ANNA@EXAMPLE.COM ", telegram:"@@anna ", city:" Минск ", preferredContact:"telegram" }), {
    name:"Анна Иванова",
    email:"anna@example.com",
    telegram:"anna",
    city:"Минск",
    preferredContact:"telegram",
  });
  assert.equal(normalizeProfile({ preferredContact:"sms" }).preferredContact, "phone");
});

test("database connection errors are classified as temporary unavailability", () => {
  assert.equal(isDatabaseUnavailable({ code:"ECONNREFUSED" }), true);
  assert.equal(isDatabaseUnavailable({ cause:{ code:"ETIMEDOUT" } }), true);
  assert.equal(isDatabaseUnavailable({ code:"23505" }), false);
});
