import fs from 'node:fs/promises';
import path from 'node:path';

export function serverRunPath(root, run) {
  if (path.resolve(root) !== '/opt/abcars-guazi-pilot' || !/^guazi-import-\d{8}$/.test(run || '')) throw Error('Server collector requires its isolated installation and a valid run');
  return path.join(root, 'runtime', run);
}

// Service restarts may encounter a lock left by a terminated process/reboot.
// A live or unverifiable owner is never removed.
export async function removeDeadProcessLock(file, {alive = pid => process.kill(pid, 0)} = {}) {
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const pid = Number(text.trim());
  if (!Number.isSafeInteger(pid) || pid < 2) throw Error('Invalid lock owner; manual inspection required');
  try { alive(pid); throw Error(`Collector lock belongs to live PID ${pid}`); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  if (await fs.readFile(file, 'utf8') !== text) throw Error('Lock owner changed during inspection');
  await fs.unlink(file);
}

export function compactCollectorEvent(event) {
  const {car, ...summary} = event;
  return summary;
}
