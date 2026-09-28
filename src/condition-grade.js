const CONDITION_GRADES = ["A", "B", "C", "D"];

const CONDITION_GRADE_META = {
  A: { label: "Отличное состояние", tone: "excellent" },
  B: { label: "Хорошее состояние", tone: "good" },
  C: { label: "Среднее состояние", tone: "average" },
  D: { label: "Плохое состояние", tone: "poor" },
};

// A — лучшее состояние, D — худшее. Если источник прислал две оценки,
// посетителю показываем более консервативную из них.
export function worstConditionGrade(...grades) {
  return grades.reduce((worst, grade) => {
    if (!CONDITION_GRADES.includes(grade)) return worst;
    if (!worst) return grade;
    return CONDITION_GRADES.indexOf(grade) > CONDITION_GRADES.indexOf(worst) ? grade : worst;
  }, null);
}

export function conditionGradeMeta(grade) {
  return CONDITION_GRADE_META[grade] || null;
}
