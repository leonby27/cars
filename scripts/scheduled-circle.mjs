#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { runScheduledCircle, sourceIsRunning } from './lib/scheduled-circle.mjs';
import { sendTelegram } from './lib/telegram.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = promisify(execFile);
let child, stopping = false, currentStep, logOffset = 0;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; child?.kill(signal); });
const readState = async relative => {
  try { return JSON.parse(await fs.readFile(path.join(root, relative), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const run = async step => {
  currentStep = step;
  if (stopping) throw Error('Запуск остановлен');
  const logPath = path.resolve(root, step.log);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  const log = await fs.open(logPath, 'a');
  logOffset = (await log.stat()).size;
  try {
    await new Promise((resolve, reject) => {
      child = spawn(step.command, step.args, { cwd: root, env: { ...process.env, ABCARS_CIRCLE_REPORT_OWNER: 'scheduler' }, stdio: ['ignore', log.fd, log.fd] });
      child.once('spawn', () => {
        console.log(`[schedule] started ${step.args.find(arg => arg.endsWith('.mjs'))}`);
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 && !stopping ? resolve() : reject(Error(`${step.args.find(arg => arg.endsWith('.mjs'))}: ${signal || `код ${code}`}. Подробности: ${step.log}`)));
    });
  } finally { child = null; await log.close(); }
};
const diagnostics = async (source, startedAt) => {
  const result = {};
  const files = source === 'che' ? { report: 'runtime/refresh-report.json', cursor: 'runtime/refresh-cursor.json' }
    : source === 'guazi' ? { state: 'runtime/guazi-refresh/current.json' }
    : { report: 'runtime/encar-refresh-report.json', importReport: 'runtime/encar-import-report.json' };
  for (const [key, name] of Object.entries(files)) {
    try {
      const value = await readState(name);
      // Old completed reports must not become progress of a failed new launch.
      result[key] = key === 'cursor' || Date.parse(value?.updatedAt ?? value?.startedAt) >= startedAt ? value : null;
    } catch (error) { result.logTail = `${name}: ${error.message}\n`; }
  }
  if (currentStep) {
    result.logPath = path.resolve(root, currentStep.log);
    try {
      const file = await fs.open(result.logPath, 'r');
      try {
        const size = (await file.stat()).size;
        const position = Math.max(logOffset, size - 4000);
        const buffer = Buffer.alloc(Math.max(0, size - position));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
        result.logTail = (result.logTail || '') + buffer.subarray(0, bytesRead).toString('utf8');
      } finally { await file.close(); }
    } catch (error) { result.logTail = (result.logTail || '') + `Журнал недоступен: ${error.message}`; }
  }
  return result;
};
try {
  const result = await runScheduledCircle(process.argv[2], {
    readState, run: async step => {
      try { await run(step); }
      catch (error) { error.stage = step.args.find(arg => arg.endsWith('.mjs')); throw error; }
    }, diagnostics,
    running: async source => sourceIsRunning(source, (await exec('ps', ['-eo', 'args='])).stdout),
    notify: text => sendTelegram(text, { root }).catch(error => console.error(`[telegram] ${error.message}`)),
  });
  console.log(`[schedule] ${process.argv[2]}: ${result}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
