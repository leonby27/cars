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
  assert.match(guazi, /Пропущено автоматически: 1/);
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

test('Encar failure distinguishes transport, malformed data, database errors and saved queue', () => {
  const text = circleFailure('encar', Error('incomplete'), { report: {
    readFailed: 12, parseFailed: 1, writeFailed: 45, unknown: 58, remainingListings: 60,
    responseStatuses: { 0: 10, 503: 2 }, checkpointPath: '/srv/abcars/runtime/encar-refresh-checkpoint.json', walk: {},
    fatal: 'Encar: проверка остановлена после повторов и пауз',
    errors: [{externalId: '123', stage: 'read', code: 'ETIMEDOUT', error: 'fetch failed'}],
  } });
  assert.match(text, /Ошибок чтения карточек: 12/);
  assert.match(text, /Ошибок разбора карточек: 1/);
  assert.match(text, /Ошибок записи в базу: 45/);
  assert.match(text, /сеть\/таймаут — 10/);
  assert.match(text, /HTTP 503 — 2/);
  assert.match(text, /Следующий запуск продолжит/);
  assert.match(text, /проверка остановлена/);
  assert.match(text, /123: ETIMEDOUT · fetch failed/);
  assert.doesNotMatch(text, /Карточек без ответа: 58/);
});

test('automatic omissions keep a green single result and reactivations and significant prices are explicit',()=>{
  const text=circleSummary('guazi',{state:{counts:{skipped:81,review:0},summary:{priceChanged:7,priceChangeThresholdUsd:100,reactivated:172}}});
  assert.match(text,/^✅/);assert.match(text,/Пропущено автоматически: 81/);
  assert.match(text,/Вернулось в продажу: 172/);assert.match(text,/Изменилось цен \(от \$100\): 7/);
  assert.doesNotMatch(text,/ручной|⚠️/);
});

test('Encar resume report shows current-attempt failures and cause instead of old queued network errors',()=>{
  const text=circleFailure('encar',Error('scripts/refresh-encar.mjs: код 1'),{report:{
    resumedAt:'2026-10-19T04:00:00Z',sold:3510,remainingListings:18516,readFailed:18516,
    fatal:'Encar: HTTP 407; статус не подтверждён',responseStatuses:{0:18516},errors:[{externalId:'old',error:'old fetch failed'}],
    attempt:{completed:505,readFailed:27,parseFailed:0,writeFailed:0,responseStatuses:{407:27},errors:[{externalId:'new',error:'HTTP 407'}]},
  }});
  assert.match(text,/Причина: Encar: HTTP 407/);
  assert.match(text,/Осталось проверить объявлений: 18\D516/);
  assert.match(text,/Завершено за этот запуск: 505/);
  assert.match(text,/Ошибок чтения за этот запуск: 27/);
  assert.match(text,/HTTP 407 — 27/);
  assert.doesNotMatch(text,/old fetch failed|сеть\/таймаут|Ошибок чтения карточек: 18/);
});
