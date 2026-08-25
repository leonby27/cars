import test from "node:test";
import assert from "node:assert/strict";
import { brandNotice } from "../src/brand-notice.js";

test("предупреждение показывается только для NIO", () => {
  assert.ok(brandNotice("NIO"));
  assert.ok(brandNotice("Nio"), "написание марки в базе встречалось в двух видах");
  assert.equal(brandNotice("BYD"), null);
  assert.equal(brandNotice(""), null);
  assert.equal(brandNotice(undefined), null);
});

test("в тексте сказано и про выкуп батареи, и про зарядку без станций", () => {
  const notice = brandNotice("NIO");
  const text = [notice.title, ...notice.lines].join(" ");
  assert.match(text, /аренд|подписк/i);
  assert.match(text, /выкуп/i);
  assert.match(text, /заряжается/i);
  assert.ok(notice.lines.length > 0);
});
