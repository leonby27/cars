#!/usr/bin/env node
// One foreground command: validate -> push -> pinned server deploy -> result.
// The server keeps per-release logs even if the connection is interrupted.
import { spawnSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { buildMetrics } from './lib/build-metrics.mjs';
const read = (...args) => {
  const result = spawnSync('git', args, {encoding:'utf8'});
  if (result.status) throw new Error(result.stderr);
  return result.stdout.trim();
};
async function run(command, args, input) {
  const code = await new Promise((resolve,reject) => {
    const child = spawn(command,args,{stdio:[input ? 'pipe' : 'ignore','inherit','inherit']});
    child.on('error',reject);child.on('close',code=>resolve(code ?? 1));
    if (input) child.stdin.end(input);
  });
  if (code) throw new Error(`${command} failed (${code})`);
}
if (read('branch','--show-current') !== 'main') throw new Error('Deploy from main only');
if (read('status','--porcelain')) throw new Error('Commit the intended changes before deploying');
const revision = read('rev-parse','HEAD');
const timingFile = resolve('runtime/deploy', `${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}`, 'client-timings.json');
const metrics = buildMetrics(timingFile, {report:console.log});
const finish = metrics.start('total');
try {
await metrics.measure('diff-check', () => run('git',['diff','--check','HEAD^','HEAD']));
await metrics.measure('tests', () => run('npm',['test']));
await metrics.measure('push', () => run('git',['push','origin','HEAD:main']));
await metrics.measure('server-deploy', () => run('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=20',
  '-o','ServerAliveCountMax=6',process.env.ABCARS_DEPLOY_HOST || 'root@5.23.48.128','bash','-s','--',revision],`
set -euo pipefail
cd /srv/abcars
revision=$1
git fetch origin main
test "$(git rev-parse origin/main)" = "$revision"
runner=$(mktemp /tmp/abcars-deploy.XXXXXX)
trap 'rm -f "$runner"' EXIT
git show "$revision:deploy/abcars-deploy.sh" > "$runner"
bash -n "$runner"
ABCARS_DEPLOY_REVISION="$revision" bash "$runner"
`));
console.log(`[deploy] Published ${revision}`);
} catch (error) {
  process.exitCode = 1;
  console.error(`[deploy] ${error.message}`);
} finally {
  finish(process.exitCode || 0);
  console.log(`[deploy] Timings: ${timingFile}`);
}
