import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
for (const failed of [false, true]) test(`actual scheduler runner sends one ${failed ? 'failure' : 'summary'} and suppresses child/start notifications`, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'circle-notifications-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const directory of ['scripts/lib', 'bin', 'runtime/guazi-refresh']) await fs.mkdir(path.join(root, directory), { recursive: true });
  for (const file of ['scripts/scheduled-circle.mjs', 'scripts/lib/scheduled-circle.mjs', 'scripts/lib/circle-report.mjs']) {
    await fs.copyFile(new URL(`../${file}`, import.meta.url), path.join(root, file));
  }
  await fs.writeFile(path.join(root, 'scripts/lib/telegram.mjs'), `import fs from 'node:fs/promises';
export const sendTelegram = async (text, {root}) => fs.appendFile(root + '/messages.jsonl', JSON.stringify(text) + '\\n');`);
  await fs.writeFile(path.join(root, 'bin/xvfb-run'), '#!/bin/sh\nshift\nexec "$@"\n', { mode: 0o755 });
  await fs.symlink(process.execPath, path.join(root, 'bin/node'));
  await fs.writeFile(path.join(root, 'scripts/refresh-guazi.mjs'), `import fs from 'node:fs/promises';
import {sendTelegram} from './lib/telegram.mjs';
if (process.env.ABCARS_CIRCLE_REPORT_OWNER !== 'scheduler') {
  await sendTelegram('brand notification', {root:process.cwd()});
  await sendTelegram('child final notification', {root:process.cwd()});
}
await fs.writeFile('runtime/guazi-refresh/current.json', JSON.stringify({
  status: '${failed ? 'blocked' : 'complete'}', updatedAt: new Date().toISOString(), phase:'details', brand:'Tesla',
  brandsDone:['Kia'], brandsTotal:2, counts:{checked:12, added:2, unavailable:1}, snapshotTotal:12,
  summary:{checked:12, priceChanged:3, remaining:13}, activeElapsedMs:120000
}));
${failed ? "throw Object.assign(Error('access rejected on card fake-id'), {code:'SOURCE_BLOCKED'});" : ''}
`);
  const options = { cwd: root, env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}` } };
  if (failed) await assert.rejects(exec(process.execPath, ['scripts/scheduled-circle.mjs', 'guazi'], options), { code: 1 });
  else await exec(process.execPath, ['scripts/scheduled-circle.mjs', 'guazi'], options);
  const messages = (await fs.readFile(path.join(root, 'messages.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(messages.length, 1);
  assert.match(messages[0], failed ? /не завершён/ : /Круг 2 · Guazi завершён/);
  assert.match(messages[0], /Добавлено: 2/);
  if (failed) {
    assert.match(messages[0], /SOURCE_BLOCKED/);
    assert.match(messages[0], /access rejected on card fake-id/);
    assert.match(messages[0], /Последняя марка: Tesla/);
    assert.match(messages[0], /Сохранено проверок: 12/);
  }
});
