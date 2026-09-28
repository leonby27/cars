import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { handleGuaziCommand, formatGuaziStatus, guaziRunning } from '../scripts/lib/telegram-guazi.mjs';
import { refreshPaths } from '../scripts/lib/guazi-refresh.mjs';

function setup(state = null, busy = null) {
  const messages = [], starts = [], stops = [];
  const deps = { root: '/unused', readState: async () => state, running: async () => busy,
    say: async text => messages.push(text), start: async (root, fresh) => { starts.push(fresh); return 'started'; }, stop: async pid => stops.push(pid),
  };
  return { messages, starts, stops, run: kind => handleGuaziCommand({ kind }, deps) };
}
test('Guazi starts and resumes its own worker, and stop targets only its verified PID', async () => {
  const fresh = setup(); await fresh.run('guazi'); assert.deepEqual(fresh.starts, [true]);
  const resume = setup({ status: 'paused' }); await resume.run('guazi-resume'); assert.deepEqual(resume.starts, [false]);
  const stop = setup({ status: 'running' }, 1234); await stop.run('guazi-stop'); assert.deepEqual(stop.stops, [1234]); assert.deepEqual(stop.starts, []);
});
test('duplicate start, abandoned checkpoint, and empty resume are rejected without spawning', async () => {
  for (const [state, busy, kind, pattern] of [[null, 1234, 'guazi', /уже идёт/], [{ status: 'error' }, null, 'guazi', /не завершён/], [null, null, 'guazi-resume', /Незавершённого/], [{ status: 'complete' }, null, 'guazi-resume', /Незавершённого/]]) {
    const f = setup(state, busy); await f.run(kind); assert.deepEqual(f.starts, []); assert.match(f.messages[0], pattern);
  }
});
test('status reports a dead worker honestly and never starts or stops it', async () => {
  const state = { status: 'running', brand: 'Tesla', counts: { updated: 12, added: 3, unavailable: 1, review: 2 }, brandsDone: ['Nio'], brandsTotal: 39 };
  assert.match(formatGuaziStatus(state, null), /процесс не работает/);
  const f = setup(state); await f.run('guazi-status'); assert.match(f.messages[0], /обновлено: 12/i); assert.match(f.messages[0], /На проверку: 2/);
  assert.deepEqual(f.starts, []); assert.deepEqual(f.stops, []);
});

test('process inspection tolerates a lock being created and refuses a PID belonging to another command', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guazi-pid-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.equal(await guaziRunning(root), null);
  const paths = refreshPaths(root); await fs.mkdir(paths.base, { recursive: true });
  await fs.writeFile(paths.lock, ''); assert.equal(await guaziRunning(root), null);
  await fs.writeFile(paths.lock, String(process.pid));
  await assert.rejects(guaziRunning(root), /другим процессом/);
});
