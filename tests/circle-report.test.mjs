import test from 'node:test';
import assert from 'node:assert/strict';
import { circleSummary, circleFailure, safeDiagnostic } from '../scripts/lib/circle-report.mjs';

test('success summaries use each source actual metrics and duration', () => {
  const che = circleSummary('che', { report: { checkedThisRun: 12, rePriced: 2, added: 3, sold: 4 }, elapsedMs: 120000 });
  assert.match(che, /Круг 1 · Che168 завершён/);
  assert.match(che, /Проверено объявлений: 12/);
  assert.match(che, /Изменилось цен: 2/);
  assert.match(che, /Длительность: 2 мин/);
  const guazi = circleSummary('guazi', { state: { snapshotTotal: 12, counts: { added: 3, unavailable: 4, review: 1 }, summary: { priceChanged: 5 }, activeElapsedMs: 180000 }, elapsedMs: 60000 });
  assert.match(guazi, /Итоги всего круга/);
  assert.match(guazi, /Требуют ручной проверки: 1/);
  assert.match(guazi, /Длительность: 3 мин/);
  const encar = circleSummary('encar', { report: { active: 20, priceChanged: 6, sold: 2 }, importReport: { imported: 8, rejected: 4 } });
  assert.match(encar, /Добавлено: 8/);
  assert.match(encar, /Отклонено по правилам отбора: 4/);
});
test('failure details carry source code, stage, saved progress, and bounded current log', () => {
  const text = circleFailure('guazi', Object.assign(Error('access failed'), { code: 'SOURCE_BLOCKED', stage: 'refresh' }), {
    state: { phase: 'details', brand: 'Tesla', brandsDone: ['Kia'], brandsTotal: 39, counts: { checked: 21, added: 2 }, status: 'blocked' },
    logTail: 'timeout\n'.repeat(1000), logPath: '/srv/abcars/runtime/guazi-refresh/worker.log',
  });
  assert.match(text, /Код ошибки: SOURCE_BLOCKED/);
  assert.match(text, /Этап обхода: проверка карточек/);
  assert.match(text, /Сохранено проверок: 21/);
  assert.match(text, /Продолжить 2/);
  assert.ok(text.length < 4096);
});
test('diagnostics redact credentials in database URLs and Telegram paths', () => {
  const text = safeDiagnostic('postgresql://abcars:supersecret@localhost/db /bot123456:fake_test_token/token password=hunter2');
  assert.ok(!text.includes('supersecret')); assert.ok(!text.includes('fake_test_token')); assert.ok(!text.includes('hunter2'));
});
