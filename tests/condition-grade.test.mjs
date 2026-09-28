import assert from "node:assert/strict";
import test from "node:test";

import { conditionGradeMeta, worstConditionGrade } from "../src/condition-grade.js";

test("из двух оценок состояния выбирается худшая", () => {
  assert.equal(worstConditionGrade("A", "B"), "B");
  assert.equal(worstConditionGrade("C", "A"), "C");
  assert.equal(worstConditionGrade("B", "B"), "B");
});

test("пустые и неизвестные оценки не влияют на результат", () => {
  assert.equal(worstConditionGrade(null, "A"), "A");
  assert.equal(worstConditionGrade("Z", undefined), null);
});

test("буквенные оценки получают понятные статусы и цветовые тона", () => {
  assert.deepEqual(conditionGradeMeta("A"), { label: "Отличное состояние", tone: "excellent" });
  assert.deepEqual(conditionGradeMeta("B"), { label: "Хорошее состояние", tone: "good" });
  assert.deepEqual(conditionGradeMeta("C"), { label: "Среднее состояние", tone: "average" });
  assert.deepEqual(conditionGradeMeta("D"), { label: "Плохое состояние", tone: "poor" });
  assert.equal(conditionGradeMeta("Z"), null);
});
