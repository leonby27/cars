import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

// Diagnostics must never turn a successful build into a failed publication.
export function writeBuildReport(file, value) {
  if (!file) return;
  try {
    mkdirSync(dirname(file), {recursive:true});
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
    renameSync(temporary, file);
  } catch (error) {
    console.error(`[timings] cannot save ${file}: ${error.code || error.message}`);
  }
}

export function buildMetrics(file, {now = () => performance.now(), report = () => {}} = {}) {
  const records = [];
  const pending = new Set();
  const start = stage => {
    const began = now();
    const record = {stage, seconds:null, exitCode:null};
    records.push(record);
    const finish = (exitCode = 0, details = {}) => {
      if (!pending.delete(finish)) return;
      Object.assign(record, details, {seconds:Math.round((now() - began) * 1000) / 1e6, exitCode});
      writeBuildReport(file, records);
      report(`[timings] ${stage}: ${record.seconds}s, exit=${exitCode}`);
    };
    pending.add(finish);
    writeBuildReport(file, records);
    return finish;
  };
  return {
    records, start,
    finishPending: (exitCode = 1) => { for (const finish of pending) finish(exitCode); },
    measure: async (stage, action) => {
      const finish = start(stage);
      try { const value = await action(); finish(); return value; }
      catch (error) { finish(1); throw error; }
    },
  };
}
