import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { circlePlan, sourceIsRunning, encarImportPlan, runScheduledCircle } from '../scripts/lib/scheduled-circle.mjs';

const startedAt = Date.parse('2026-10-05T15:00:00Z');
const iso = new Date(startedAt + 1000).toISOString();
const report = { startedAt: iso, finishedAt: iso, walk: {} };
test('same collector arguments as manual Che168 and Guazi launches', () => {
  assert.deepEqual(circlePlan('che')[0].args, ['-a', 'node', 'scripts/refresh-che168.mjs', '--new-per-brand=100', '--new-circle']);
  for (const state of [null, { status: 'complete' }]) assert.ok(circlePlan('guazi', state)[0].args.includes('--new-circle'));
  for (const status of ['paused', 'blocked', 'error', 'running']) assert.ok(!circlePlan('guazi', { status })[0].args.includes('--new-circle'));
  assert.throws(() => circlePlan('other'));
});
test('detect existing manual/scheduled collectors and imports without matching grep or shell commands', () => {
  assert.equal(sourceIsRunning('che', '/usr/bin/node scripts/refresh-che168.mjs --new-circle'), true);
  assert.equal(sourceIsRunning('encar', 'node /srv/abcars/scripts/import-encar.mjs --discoveries'), true);
  assert.equal(sourceIsRunning('guazi', '/usr/bin/node scripts/refresh-guazi.mjs --run'), true);
  assert.equal(sourceIsRunning('che', 'bash -c node scripts/refresh-che168.mjs\nnode scripts/scheduled-circle.mjs che'), false);
  assert.equal(sourceIsRunning('che', 'node scripts/refresh-guazi.mjs --run'), false);
});
test('Encar imports all fresh discoveries only after a verified refresh', () => {
  const discoveries = { generatedAt: iso, items: [{}, {}, {}] };
  assert.deepEqual(encarImportPlan(discoveries, report, startedAt).args, ['scripts/import-encar.mjs', '--discoveries', '--limit=3']);
  assert.equal(encarImportPlan({ ...discoveries, items: [] }, report, startedAt), null);
  for (const bad of [null, { ...report, fatal: 'failed' }, { ...report, startedAt: '2026-10-04' }, { ...report, unknown: 1 }, { ...report, walk: { broken: 1 } }]) assert.throws(() => encarImportPlan(discoveries, bad, startedAt));
  assert.throws(() => encarImportPlan({ ...discoveries, generatedAt: 'bad' }, report, startedAt));
});
test('busy source is skipped without reading or overwriting its checkpoint', async () => {
  const messages = [];
  assert.equal(await runScheduledCircle('che', { running: async () => true, readState: () => assert.fail(), run: () => assert.fail(), notify: async text => messages.push(text) }), 'busy');
  assert.match(messages[0], /уже работает/);
});
test('Guazi schedule resumes its actual current.json and verifies completion', async () => {
  let complete = false;
  await runScheduledCircle('guazi', { now: () => startedAt, running: async () => false,
    readState: async name => { assert.equal(name, 'runtime/guazi-refresh/current.json'); return { status: complete ? 'complete' : 'paused' }; },
    run: async step => { assert.ok(!step.args.includes('--new-circle')); complete = true; },
  });
});
test('Encar failure stops subsequent import and reports the error', async () => {
  let calls = 0;
  const messages = [];
  await assert.rejects(runScheduledCircle('encar', { running: async () => false, readState: () => assert.fail(), run: async () => { calls++; throw Error('network failed'); }, notify: async text => messages.push(text) }), /network failed/);
  assert.equal(calls, 1);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /не завершён/);
});
test('Encar refresh and import run in order', async () => {
  const steps = [];
  await runScheduledCircle('encar', { now: () => startedAt, running: async () => false,
    readState: async name => name.includes('discoveries') ? { generatedAt: iso, items: [{}] } : name.includes('import-report') ? { ...report, final: true, imported: 1 } : report,
    run: async step => steps.push(step.args[0]),
  });
  assert.deepEqual(steps, ['scripts/refresh-encar.mjs', 'scripts/import-encar.mjs']);
});
test('Che168 emits a single numeric summary, and a single detailed failure for partial work', async () => {
  for (const partial of [false, true]) {
    const messages = [];
    const current = { ...report, checkedThisRun: 25, rePriced: 3, added: 2, sold: 1, remainingListings: partial ? 8 : 0, remainingBrands: partial ? 1 : 0 };
    const options = { now: () => startedAt, running: async () => false, run: async () => {},
      readState: async name => name.includes('cursor') ? { startedAt: partial ? iso : null } : current,
      notify: async text => messages.push(text),
      diagnostics: async () => ({ report: current, cursor: { startedAt: partial ? iso : null }, logTail: 'SOURCE_BLOCKED: source refused requests', logPath: '/tmp/circle.log' }),
    };
    if (partial) await assert.rejects(runScheduledCircle('che', options));
    else assert.equal(await runScheduledCircle('che', options), 'complete');
    assert.equal(messages.length, 1);
    assert.match(messages[0], partial ? /Осталось проверить объявлений: 8/ : /Проверено объявлений: 25/);
    assert.match(messages[0], /Добавлено: 2/);
    if (partial) assert.match(messages[0], /SOURCE_BLOCKED/);
  }
});
test('Encar import request errors produce detailed failure instead of a green summary', async () => {
  const messages = [];
  await assert.rejects(runScheduledCircle('encar', { now: () => startedAt, running: async () => false, run: async () => {},
    readState: async name => name.includes('discoveries') ? { generatedAt: iso, items: [{}] } : name.includes('import-report') ? { ...report, final: true, rejectedByReason: { 'detail request failed (503)': 2 } } : report,
    notify: async text => messages.push(text),
  }), /503/);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /503/);
  assert.match(messages[0], /не завершён/);
});
test('Che168 stale reports or partial cursors never report completion', async () => {
  for (const cursor of [null, { startedAt: iso }, { startedAt: null }]) {
    await assert.rejects(runScheduledCircle('che', { now: () => startedAt, running: async () => false, run: async () => {}, readState: async name => name.includes('cursor') ? cursor : { ...report, startedAt: '2026-10-04' } }), /не завершён/);
  }
});
test('weekly timers encode Minsk time with no jitter or missed-run catchup', async () => {
  for (const [source, day] of [['che', 'Mon'], ['guazi', 'Wed'], ['encar', 'Sat']]) {
    const timer = await fs.readFile(new URL(`../deploy/abcars-circle-${source}.timer`, import.meta.url), 'utf8');
    assert.ok(timer.includes(`OnCalendar=${day} *-*-* 18:00:00 Europe/Minsk`));
    assert.ok(timer.includes(`Unit=abcars-circle@${source}.service`));
    assert.ok(timer.includes('RandomizedDelaySec=0'));
    assert.ok(timer.includes('Persistent=false'));
  }
});
