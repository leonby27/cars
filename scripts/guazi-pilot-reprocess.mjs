#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeCard, parseChinaMarkdown, matchChina } from './lib/guazi-pilot-data.mjs';
import { readJson, writeJson } from './lib/guazi-pilot-io.mjs';
import { options } from './guazi-pilot.mjs';

export function reprocessCard(old, capture, markdown) {
  const next = normalizeCard(capture.rawData, capture.url, capture.observedAt);
  if (next.productId !== old.productId || next.clueId !== old.clueId) throw new Error('Backfill identity mismatch');
  const china = markdown == null ? old.china : matchChina(next, { ...parseChinaMarkdown(markdown,old.china.sourceUrl,old.clueId), fetchedAt:old.china.fetchedAt });
  return { ...old, ...next, observedAt: old.observedAt,
    china, conflicts: china.conflicts ?? old.conflicts,
    photos: old.photos, inspection: { ...next.inspection, full: old.inspection.full },
    enrichedAt: new Date().toISOString() };
}

export async function reprocessDirectory(directory) {
  const out = options(['--out',directory]).out;
  const real = await fs.realpath(out), runtime = await fs.realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../runtime'));
  if (!real.startsWith(runtime+path.sep)) throw new Error('Output resolves outside runtime');
  const lockFile = path.join(out,'.lock'); const lock = await fs.open(lockFile,'wx',0o600);
  await lock.writeFile(String(process.pid));
  try {
    const state = await readJson(path.join(out,'checkpoint.json'));
    if (!Array.isArray(state?.cards) || state.cards.some(id=>! /^[a-z0-9]{10}$/.test(id))) throw new Error('Invalid checkpoint');
    const backup = path.join(out,'backups',new Date().toISOString().replaceAll(':','-'));
    const staging = path.join(backup,'staged');
    const report = { cards:state.cards.length, technicalSpecs:0, specificationRows:0, chineseDescriptions:0,
      matchedChinese:0, preservedPhotos:0, networkRequests:0, backup };
    for (const id of state.cards) {
      const file = path.join(out,'cards',id+'.json');
      const old = await readJson(file); const capture = await readJson(path.join(out,'raw',id+'.json'));
      const markdown = await fs.readFile(path.join(out,'china',id+'.md'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
      const next = reprocessCard(old,capture,markdown);
      await writeJson(path.join(backup,id+'.json'),old);
      await writeJson(path.join(staging,id+'.json'),next);
      report.technicalSpecs += Number(next.technicalSpecs.count>0);
      report.specificationRows += next.technicalSpecs.count;
      report.chineseDescriptions += Number(!!next.china.condition?.highlights);
      report.matchedChinese += Number(next.china.status==='matched');
      report.preservedPhotos += next.photos?.length || 0;
    }
    // Stage on disk: tens of thousands of full reports must not accumulate in RAM.
    // Every input is validated and backed up before replacing the first card.
    for (const id of state.cards) await fs.rename(path.join(staging,id+'.json'),path.join(out,'cards',id+'.json'));
    await fs.rmdir(staging);
    await writeJson(path.join(out,'enrichment-summary.json'),report);return report;
  } finally {await lock.close();await fs.unlink(lockFile);}
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index=process.argv.indexOf('--out');
  if(index<0 || !process.argv[index+1]) throw new Error('Usage: node scripts/guazi-pilot-reprocess.mjs --out runtime/RUN');
  console.log(JSON.stringify(await reprocessDirectory(process.argv[index+1]),null,2));
}
