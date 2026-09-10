import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { vehiclePhotoHref } from '../../src/photo-source.js';

export function catalogPhotoPaths(car, { previewCount = 1 } = {}) {
  return [...new Set((car.images?.length ? car.images : [car.image]).filter(Boolean).slice(0, previewCount === 5 ? 5 : 1)
    // Disk paths stay unversioned: the query marker exists only to refresh a
    // visitor's browser and must never become part of the stored filename.
    .map(source => vehiclePhotoHref(source,600,{cacheVersion:''}))
    .filter(href => /^\/photo\/escimg\/[A-Za-z0-9/_.-]+\.webp$/.test(href) && !href.split('/').includes('..')))];
}

export async function storeCatalogPhoto(href, { directory, site = 'https://abcars.by', fetcher = fetch, minFreeBytes = 5 * 1024**3 } = {}) {
  if (!/^\/photo\/escimg\/[A-Za-z0-9/_.-]+\.webp$/.test(href) || href.split('/').includes('..')) throw new Error('Invalid photo path');
  const file = path.join(directory,href);
  try { if ((await fs.stat(file)).size > 0) return { stored: false, bytes: 0 }; } catch (error) { if(error.code !== 'ENOENT') throw error; }
  const disk = await fs.statfs(directory);
  if (disk.bavail * disk.bsize < minFreeBytes + 8 * 1024**2) throw Object.assign(new Error('Photo storage paused: low disk space'), { code:'PHOTO_DISK_FULL' });
  const response = await fetcher(new URL(href,site), { signal:AbortSignal.timeout(40_000), headers:{'user-agent':'abcars-photo-store/1.0'}, redirect:'error' });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) { await response.body?.cancel(); throw new Error(`Photo HTTP ${response.status}`); }
  const chunks=[]; let size=0;
  for await (const chunk of response.body) {
    size+=chunk.length;
    if(size>8*1024**2) throw new Error('Photo too large');
    chunks.push(chunk);
  }
  const body=Buffer.concat(chunks);
  if(body.toString('ascii',0,4)!=='RIFF' || body.toString('ascii',8,12)!=='WEBP') throw new Error('Invalid WebP photo');
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temporary=file+'.'+randomUUID()+'.tmp';
  try { await fs.writeFile(temporary,body,{mode:0o644,flag:'wx'}); await fs.rename(temporary,file); }
  finally { await fs.rm(temporary,{force:true}); }
  return {stored:true,bytes:size};
}

export async function atomicPhotoState(file,state) {
  const temporary=file+'.tmp';
  await fs.writeFile(temporary,JSON.stringify(state));
  await fs.rename(temporary,file);
}
