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

test('numbered Guazi controls are isolated from legacy Che168 commands', () => {
  for (const [text, kind] of [['Статус 2', 'guazi-status'], ['статус №2.', 'guazi-status'], ['Стоп 2', 'guazi-stop'], ['продолжить2', 'guazi-resume'], ['Доделать #2!', 'guazi-resume']]) assert.deepEqual(parseCommand(text), { kind });
  for (const text of ['статус 22', 'стоп 21', 'продолжить 3', 'круг 2; rm -rf /']) assert.equal(parseCommand(text), null);
  assert.deepEqual(parseCommand('стоп'), { kind: 'stop' });
  assert.deepEqual(parseCommand('статус'), { kind: 'status' });
});
