import fs from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { refreshPaths } from './guazi-refresh.mjs';
import { readJson, pause } from './guazi-pilot-io.mjs';

const exec = promisify(execFile);
export async function guaziRunning(root) {
  let pid;
  try {
    const text = (await fs.readFile(refreshPaths(root).lock, 'utf8')).trim();
    if (!text) return null; // The worker has created its lock and is writing its PID.
    pid = Number(text);
  }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!Number.isSafeInteger(pid) || pid < 2) throw Error('Повреждён файл процесса Guazi; нужна проверка');
  try { process.kill(pid, 0); }
  catch (error) { if (error.code === 'ESRCH') return null; throw error; }
  let stdout;
  try { ({ stdout } = await exec('ps', ['-p', String(pid), '-o', 'args='])); }
  catch (error) { if (error.code === 1) return null; throw error; } // Exited since kill(pid, 0).
  if (!/(?:^|\s)(?:\S*\/)?scripts\/refresh-guazi\.mjs(?:\s|$)/.test(stdout)) throw Error('PID Guazi занят другим процессом; остановка отменена');
  return pid;
}

export function formatGuaziStatus(state, busy) {
  if (!state) return busy ? '🟢 Круг 2 · Guazi запускается.' : '⚪️ Круг 2 · Guazi ещё не запускался.';
  const labels = { complete: 'завершён', paused: 'остановлен', blocked: 'остановлен: проверка доступа', error: 'прерван из-за ошибки' };
  const counts = state.counts || {};
  const phases = { census: 'подсчёт марок', discovery: 'поиск машин', details: 'проверка карточек', dedupe: 'сверка дублей' };
  return [
    `${busy ? '🟢' : '⚪️'} Круг 2 · Guazi: ${busy ? 'идёт' : labels[state.status] || 'процесс не работает; можно продолжить'}`,
    state.brand ? `Марка: ${state.brand}` : null,
    busy && phases[state.phase] ? `Этап: ${phases[state.phase]}` : null,
    `Марок завершено: ${state.brandsDone?.length || 0}/${state.brandsTotal ?? '?'}`,
    `Обновлено: ${counts.updated || 0} · добавлено: ${counts.added || 0} · снято: ${counts.unavailable || 0}`,
    `На проверку: ${counts.review || 0} · отклонено новых: ${counts.rejected || 0}`,
    state.updatedAt ? `Данные на: ${new Date(state.updatedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Minsk' })} (Минск)` : null,
    state.error ? `Причина: ${state.error}` : null,
  ].filter(Boolean).join('\n');
}

export async function startGuazi(root, newCircle) {
  const paths = refreshPaths(root);
  await fs.mkdir(paths.base, { recursive: true });
  const output = await fs.open(paths.log, 'a');
  let child, ended = false;
  try {
    child = spawn('xvfb-run', ['-a', process.execPath, 'scripts/refresh-guazi.mjs', '--run', ...(newCircle ? ['--new-circle'] : [])], {
      cwd: root, detached: true, stdio: ['ignore', output.fd, output.fd], env: process.env,
    });
    child.once('exit', () => { ended = true; });
    await once(child, 'spawn');
    child.unref();
  } finally { await output.close(); }
  // A successful fork is not yet a running collector. Wait for its DB lock and
  // durable checkpoint, or report an actual startup failure.
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await readJson(paths.state);
    const pid = await guaziRunning(root);
    if (pid && state?.pid === pid && state.status === 'running') return 'Круг 2 · Guazi запущен. Отчёты будут приходить по маркам. Управление: «Статус 2», «Стоп 2».';
    if (ended) throw Error('Круг 2 не запустился. Проверьте runtime/guazi-refresh/worker.log на сервере.');
    await pause(100);
  }
  return 'Запуск Круга 2 запрошен, подтверждение ещё не получено. Проверьте «Статус 2».';
}

export async function handleGuaziCommand(cmd, { root, say, running = guaziRunning, start = startGuazi, stop = pid => process.kill(pid, 'SIGTERM'), readState = () => readJson(refreshPaths(root).state) }) {
  const busy = await running(root);
  const state = await readState();
  if (cmd.kind === 'guazi-status') return say(formatGuaziStatus(state, busy));
  if (cmd.kind === 'guazi-stop') {
    if (!busy) return say('Круг 2 · Guazi сейчас не запущен.');
    await stop(busy);
    return say('Останавливаю Круг 2 · Guazi. Текущие запросы завершатся, прогресс сохранится. Продолжение: «Продолжить 2».');
  }
  if (busy) return say('Круг 2 · Guazi уже идёт. «Статус 2» — прогресс, «Стоп 2» — остановить.');
  if (cmd.kind === 'guazi' && state && state.status !== 'complete') return say('Предыдущий Круг 2 не завершён. Напишите «Продолжить 2», чтобы проверить оставшиеся машины.');
  if (cmd.kind === 'guazi-resume' && (!state || state.status === 'complete')) return say('Незавершённого Круга 2 нет. Напишите «Круг 2», чтобы начать новый.');
  return say(await start(root, cmd.kind === 'guazi'));
}
