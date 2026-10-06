// Weekly launches share the existing collectors and their durable progress.
import { circleSummary, circleFailure } from './circle-report.mjs';
export const CIRCLE_SOURCES = Object.freeze({ '1': 'che', '2': 'guazi', '3': 'encar' });

export function circlePlan(source, state) {
  if (source === 'che') return [{ command: 'xvfb-run', args: ['-a', 'node', 'scripts/refresh-che168.mjs', '--new-per-brand=100', '--new-circle'], log: '/tmp/circle.log' }];
  if (source === 'guazi') return [{ command: 'xvfb-run', args: ['-a', 'node', 'scripts/refresh-guazi.mjs', '--run', ...(!state || state.status === 'complete' ? ['--new-circle'] : [])], log: 'runtime/guazi-refresh/worker.log' }];
  if (source === 'encar') return [{ command: 'node', args: ['scripts/refresh-encar.mjs'], log: 'runtime/encar-circle.log' }];
  throw Error(`Unknown circle source: ${source}`);
}

export function sourceIsRunning(source, processList) {
  const scripts = { che: ['refresh-che168', 'import-v2'], guazi: ['refresh-guazi'], encar: ['refresh-encar', 'import-encar'] }[source];
  if (!scripts) throw Error(`Unknown circle source: ${source}`);
  return processList.split('\n').some(line => {
    // Match actual script arguments, never a shell command containing their names.
    const args = line.trim().split(/\s+/);
    if (!/^(?:.*\/)?node(?:js)?$/.test(args[0] || '')) return false;
    return args.some(arg => scripts.some(script => arg === `scripts/${script}.mjs` || arg.endsWith(`/scripts/${script}.mjs`)));
  });
}

export function encarImportPlan(discoveries, report, startedAt) {
  if (!report?.finishedAt || report.fatal || Date.parse(report.startedAt) < startedAt || !Number.isFinite(Date.parse(report.startedAt))) throw Error('Нет свежего завершённого отчёта Encar');
  if (report.walk?.broken || report.unknown) throw Error('Encar: не все списки или карточки проверены; пополнение отложено');
  if (!Array.isArray(discoveries?.items) || Date.parse(discoveries.generatedAt) < startedAt || !Number.isFinite(Date.parse(discoveries.generatedAt))) throw Error('Нет свежих находок Encar');
  if (!discoveries.items.length) return null;
  return { command: 'node', args: ['scripts/import-encar.mjs', '--discoveries', `--limit=${discoveries.items.length}`], log: 'runtime/encar-circle.log' };
}

export async function runScheduledCircle(source, { readState, running, run, notify = async () => {}, diagnostics = async () => ({}), now = Date.now }) {
  const number = Object.keys(CIRCLE_SOURCES).find(key => CIRCLE_SOURCES[key] === source);
  if (!number) throw Error(`Unknown circle source: ${source}`);
  const label = `Круг ${number} · ${source === 'che' ? 'Che168' : source === 'guazi' ? 'Guazi' : 'Encar'}`;
  const startedAt = now();
  let report, state, cursor, importReport;
  try {
    if (await running(source)) {
      await notify(`${label}: запуск по расписанию пропущен — источник уже работает.`);
      return 'busy';
    }
    state = source === 'guazi' ? await readState('runtime/guazi-refresh/current.json') : null;
    for (const step of circlePlan(source, state)) await run(step);
    if (source === 'encar') {
      report = await readState('runtime/encar-refresh-report.json');
      const step = encarImportPlan(await readState('runtime/encar-discoveries.json'), report, startedAt);
      if (step) {
        await run(step);
        importReport = await readState('runtime/encar-import-report.json');
        if (!importReport?.final || !Number.isFinite(Date.parse(importReport.startedAt)) || Date.parse(importReport.startedAt) < startedAt) throw Error('Нет свежего итогового отчёта пополнения Encar');
        const failures = Object.entries(importReport.rejectedByReason || {}).filter(([reason]) => /^(?:detail request failed|detail error:)/.test(reason));
        if (failures.length) throw Error(`Encar: ошибки чтения новых карточек: ${failures.map(([reason, count]) => `${reason} — ${count}`).join('; ')}`);
      }
    }
    // Collectors can save partial progress and exit normally. Do not call it complete.
    if (source === 'che') {
      cursor = await readState('runtime/refresh-cursor.json');
      report = await readState('runtime/refresh-report.json');
      if (!cursor || cursor.startedAt || !report?.finishedAt || !Number.isFinite(Date.parse(report.startedAt)) || Date.parse(report.startedAt) < startedAt) throw Error('Круг не завершён; прогресс сохранён. Продолжение: «Продолжить».');
      if (report.addFailed) throw Error(`Che168: не удалось добавить новых карточек: ${report.addFailed}`);
    }
    if (source === 'guazi') {
      state = await readState('runtime/guazi-refresh/current.json');
      if (state?.status !== 'complete') throw Error('Круг не завершён; прогресс сохранён. Продолжение: «Продолжить 2».');
    }
    await notify(circleSummary(source, { report, state, importReport, elapsedMs: now() - startedAt }));
    return 'complete';
  } catch (error) {
    let details;
    try { details = await diagnostics(source, startedAt); } catch (diagnosticError) { details = { logTail: `Не удалось прочитать диагностику: ${diagnosticError.message}` }; }
    await notify(circleFailure(source, error, { report, state, cursor, importReport, elapsedMs: now() - startedAt, ...details }));
    throw error;
  }
}
