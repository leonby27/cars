const labels = { che: 'Круг 1 · Che168', guazi: 'Круг 2 · Guazi', encar: 'Круг 3 · Encar' };
const count = (label, value) => Number.isFinite(value) ? `${label}: ${value.toLocaleString('ru-RU')}` : null;
const duration = ms => Number.isFinite(ms) ? `Длительность: ${Math.max(1, Math.round(ms / 60000))} мин` : null;
export function safeDiagnostic(value) {
  return String(value || '').replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1[скрыто]@')
    .replace(/(\/bot)\d+:[A-Za-z0-9_-]+/g, '$1[скрыто]')
    .replace(/((?:token|password|authorization|cookie|secret|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, '$1[скрыто]');
}
export function circleSummary(source, { report, state, importReport, elapsedMs } = {}) {
  let checked, changed, added, sold, remaining, rejected, skipped, reactivated;
  if (source === 'che') {
    checked = report?.checkedThisRun; changed = report?.rePriced; added = report?.added;
    sold = report?.sold; remaining = report?.remainingActive;
  } else if (source === 'guazi') {
    checked = state?.summary?.checked ?? state?.snapshotTotal;
    changed = state?.summary?.priceChanged; added = state?.counts?.added;
    sold = state?.counts?.unavailable; remaining = state?.summary?.remaining;
    rejected = state?.counts?.rejected;
    skipped = (state?.counts?.skipped || 0) + (state?.counts?.review || 0);
    reactivated = state?.summary?.reactivated;
    elapsedMs = state?.activeElapsedMs ?? elapsedMs;
  } else {
    checked = report?.active; changed = report?.priceChanged; sold = report?.sold;
    added = importReport?.imported ?? 0; rejected = importReport?.rejected;
  }
  return [
    `✅ ${labels[source]} завершён`,
    source === 'guazi' ? 'Итоги всего круга:' : 'Итоги этого запуска:',
    count('Проверено объявлений', checked), count(source === 'guazi' && state?.summary?.priceChangeThresholdUsd === 100 ? 'Изменилось цен (от $100)' : 'Изменилось цен', changed),
    count('Добавлено', added), count('Снято с продажи', sold),
    reactivated ? count('Вернулось в продажу', reactivated) : null,
    count('Осталось в каталоге источника', remaining),
    skipped ? count('Пропущено автоматически', skipped) : null,
    rejected ? count('Отклонено по правилам отбора', rejected) : null,
    duration(elapsedMs),
  ].filter(Boolean).join('\n');
}

export function circleFailure(source, error, { report, state, importReport, cursor, elapsedMs, logTail, logPath } = {}) {
  const phases = { census: 'подсчёт марок', discovery: 'поиск машин', details: 'проверка карточек', recheck: 'автоматическая перепроверка', audit: 'проверка целостности каталога', dedupe: 'сверка дублей', complete: 'завершение' };
  const counts = state?.counts;
  return safeDiagnostic([
    `❌ ${labels[source]} не завершён`,
    `Причина: ${String(error.message || error).slice(0, 650)}`,
    error.code ? `Код ошибки: ${error.code}` : null,
    error.stage ? `Этап запуска: ${error.stage}` : null,
    state?.phase ? `Этап обхода: ${phases[state.phase] || state.phase}` : null,
    state?.brand ? `Последняя марка: ${state.brand}` : null,
    state?.error && !String(error.message).includes(state.error) ? `Ошибка источника: ${state.error}` : null,
    report?.note || report?.fatal,
    state ? `Марок завершено: ${state.brandsDone?.length || 0} из ${state.brandsTotal ?? '?'}` : null,
    count('Сохранено проверок', counts?.checked ?? report?.checkedThisRun),
    count('Добавлено', counts?.added ?? importReport?.imported ?? report?.added),
    count('Снято с продажи', counts?.unavailable ?? report?.sold),
    count('Осталось проверить объявлений', report?.remainingListings),
    count('Незавершённых марок', report?.remainingBrands),
    count('Карточек без ответа', report?.unknown ?? report?.noAnswer),
    count('Оборванных разделов выдачи', report?.walk?.broken),
    report?.errors?.length ? `Ошибки: ${report.errors.slice(0, 5).map(item => `${item.externalId || item.brand}: ${item.error}`).join('; ')}` : null,
    duration(elapsedMs),
    source === 'guazi' && state?.status !== 'complete' ? 'Прогресс круга сохранён. Продолжение: «Продолжить 2».' : null,
    source === 'che' && cursor?.startedAt ? 'Прогресс круга сохранён. Продолжение: «Продолжить».' : null,
    logPath ? `Полный журнал: ${logPath}` : null,
    logTail ? `Последние записи текущего запуска:\n${safeDiagnostic(logTail).slice(-1500)}` : null,
  ].filter(Boolean).join('\n')).slice(0, 3900);
}
