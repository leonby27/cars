import fs from 'node:fs/promises';
import path from 'node:path';
import { vehiclePhotoHref, GUAZI_PHOTO_WIDTHS } from '../../src/photo-source.js';
import { guaziImageCacheFile } from '../../server/guazi-image-key.mjs';
// С 28.09.2026 проданная машина показывается серым блоком без фото, так что кадры
// нужны только на случай, если машина вернётся в продажу: неделя с первого
// наблюдения «снята», как и было решено для чистки 07.09.2026.
export const PHOTO_RETENTION_MS = 7 * 86400_000;

// All sizes of the same source share ownership, including old 900px copies.
export function photoIdentity(source) {
  const href = source?.startsWith('/photo/') ? source : vehiclePhotoHref(source, 'original', { cacheVersion:'' });
  if (typeof href !== 'string' || href.split('/').includes('..')) return null;
  // Кадры Encar: три размера в пути (/photo/encar/w600|w1200|w1920/…) — один владелец.
  const encar = href.match(/^\/photo\/encar\/(?:v2\/)?w(?:600|1200|1920)(\/[A-Za-z0-9/_.-]+\.jpe?g)$/i);
  if (encar) return `encar:${encar[1]}`;
  if (!/^\/photo\/escimg\/[A-Za-z0-9/_.-]+\.webp$/.test(href)) return null;
  return href.replace(/\/\d+x\d+_c\d+_(?=[^/]*$)/, '/');
}

// Копии Guazi лежат в кэше сайта под хешем адреса — отдельно для оригинала и
// каждого размера превью. Ключ — имя файла с приставкой, чтобы не спутать с Che168.
const guaziKeyPrefix = 'guazi:';
export function guaziPhotoKeys(source) {
  const keys = [];
  for (const width of [0, ...GUAZI_PHOTO_WIDTHS]) {
    const href = vehiclePhotoHref(source, width, { cacheVersion:'' });
    if (typeof href !== 'string' || !href.startsWith('/api/image?src=')) return [];
    keys.push(guaziKeyPrefix + path.basename(guaziImageCacheFile(new URLSearchParams(href.slice('/api/image?'.length)).get('src'))));
  }
  return [...new Set(keys)];
}

const photoKeys = source => { const key = photoIdentity(source); return key ? [key] : guaziPhotoKeys(source); };

export function observeListing(listing, previous, now) {
  // Unknown states are never treated as proof of removal.
  if (listing.status !== 'unavailable') return null;
  const lastSeen = listing.last_seen_at;
  if (previous?.lastSeen === lastSeen && Number.isFinite(previous.since) && previous.since <= now) return previous;
  return { since: now, lastSeen };
}

export function eligibleListing(observation, now) {
  return observation && Number.isFinite(observation.since) && now - observation.since >= PHOTO_RETENTION_MS;
}

export async function storedPhotoFiles(directory) {
  const files=[];
  const base=path.resolve(directory);
  // Never follow symbolic links, even for the photo/escimg directories.
  async function walk(folder) {
    let entries;
    try { entries=await fs.readdir(folder,{withFileTypes:true}); }
    catch(error) { if(error.code==='ENOENT') return; throw error; }
    for(const entry of entries) {
      const file=path.join(folder,entry.name);
      if(entry.isSymbolicLink()) continue;
      if(entry.isDirectory()) await walk(file);
      else if(entry.isFile()) {
        const href='/'+path.relative(base,file).split(path.sep).join('/');
        const key=photoIdentity(href);
        if(key) {
          const stat=await fs.lstat(file);
          if(stat.isFile()) files.push({file,key,ino:stat.ino,size:stat.size,mtimeMs:stat.mtimeMs});
        }
      }
    }
  }
  await walk(base);
  return files;
}

// Кэш Guazi плоский: файл-кадр с именем из 64 шестнадцатеричных знаков и рядом его
// описание .json. Временные и чужие файлы не трогаем.
export async function storedGuaziFiles(directory) {
  const base=path.resolve(directory);
  let entries;
  try { entries=await fs.readdir(base,{withFileTypes:true}); }
  catch(error) { if(error.code==='ENOENT') return []; throw error; }
  const files=[];
  for(const entry of entries) {
    if(!entry.isFile() || !/^[0-9a-f]{64}$/.test(entry.name)) continue;
    const file=path.join(base,entry.name);
    const stat=await fs.lstat(file);
    if(stat.isFile()) files.push({file,key:guaziKeyPrefix+entry.name,ino:stat.ino,size:stat.size,mtimeMs:stat.mtimeMs,base,sidecar:file+'.json'});
  }
  return files;
}

export async function removeUnchangedPhoto(entry, directory) {
  const base=await fs.realpath(directory);
  const parent=await fs.realpath(path.dirname(entry.file));
  // Кэш Guazi плоский, поэтому файл может лежать прямо в корне хранилища.
  if(parent!==base && !parent.startsWith(base+path.sep)) throw new Error('Photo outside storage');
  let stat;
  try { stat=await fs.lstat(entry.file); } catch(error) { if(error.code==='ENOENT') return false; throw error; }
  if(!stat.isFile() || stat.ino!==entry.ino || stat.size!==entry.size || stat.mtimeMs!==entry.mtimeMs) return false;
  await fs.unlink(entry.file);
  if(entry.sidecar) await fs.rm(entry.sidecar,{force:true});
  return true;
}

export function recordPhotoOwnership(listing, observation, now, wanted, owned, protectedKeys) {
  const eligible=eligibleListing(observation,now);
  for(const source of listing.images) for(const key of photoKeys(source)) {
    if(!wanted.has(key)) continue;
    owned.add(key);
    if(!eligible) protectedKeys.add(key);
  }
}
