// Только индивидуально разобранные события, без блокировки посетителя или URL.
// Основания: research/analytics-2026-10-30-filtered-direct-visits.md в родительском
// рабочем каталоге. Исходные строки сохраняются; исключение обратимо.
export const REVIEWED_AUTOMATION_EVENT_IDS = Object.freeze([
  "969d1f39-be7a-4065-9a1f-7cdc7281ba03",
  "43488ceb-6864-4c3b-aba5-4f1825f63d80",
]);
// Значения заданы в исходниках, не принимаются из URL или тела запроса.
export const REVIEWED_AUTOMATION_SQL = `event_id NOT IN (${REVIEWED_AUTOMATION_EVENT_IDS.map((id) => `'${id}'`).join(", ")})`;
