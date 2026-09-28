import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "../scripts/lib/telegram-command-parse.mjs";

test("«круг», «круг 1» и их варианты запускают круг Che168, «круг 2» — отдельная команда Guazi", () => {
  for (const text of ["круг", "Круг 1", "круг1", "Круг №1", "полный круг 1", "круг 1."]) assert.deepEqual(parseCommand(text), { kind: "circle" }, text);
  for (const text of ["Круг 2", "круг2", "круг №2", "полный круг 2"]) assert.deepEqual(parseCommand(text), { kind: "guazi" }, text);
  for (const text of ["круг 3", "круг 12", "круг 21", "круги"]) assert.equal(parseCommand(text), null, text);
  assert.deepEqual(parseCommand("продолжить"), { kind: "resume" });
  assert.equal(parseCommand("марка BMW").kind, "brands");
});
