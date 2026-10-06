// Без подтверждённого действия заход всё равно остаётся записанным переходом.
export const analyticsActivityKind = (value) => value === "actions" ? "actions" : "all";
