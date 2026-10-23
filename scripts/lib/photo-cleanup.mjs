import fs from 'node:fs/promises';
import syncFs, { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { vehiclePhotoHref, GUAZI_PHOTO_WIDTHS } from '../../src/photo-source.js';
import { guaziImageCacheFile } from '../../server/guazi-image-key.mjs';
// Основание удаления — сохранённый статус «Продано», без проверки источника.
export const eligibleListing = listing => listing.status === 'unavailable';

// All sizes of the same source share ownership, including old 900px copies.
export function photoIdentity(source) {
  const href = source?.startsWith('/photo/') ? source
    : source?.startsWith('/escimg/') ? '/photo' + source
    : vehiclePhotoHref(source, 'original', { cacheVersion:'' });
  if (typeof href !== 'string' || href.split('/').includes('..')) return null;
  // Кадры Encar: три размера в пути (/photo/encar/w600|w1200|w1920/…) — один владелец.
  const encar = href.match(/^\/photo\/encar\/(?:v2\/)?w(?:600|1200|1920)(\/[A-Za-z0-9/_.-]+\.jpe?g)$/i);
  if (encar) return `encar:${encar[1]}`;
  if (!/^\/photo\/escimg\/[A-Za-z0-9/_.-]+\.(?:webp|jpg)$/.test(href)) return null;
  return href.replace(/\/\d+x\d+_(?:c\d+_)?(?=[^/]*$)/, '/').replace(/\.jpg$/, '.jpg.webp');
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
  // Старые страницы могли запросить тот же оригинал с другим разрешённым JPEG-параметром.
  const original = new URL(source.startsWith('//') ? 'https:' + source : source);
  for (const query of ['', '?x-bce-process=image/format,f_jpg', '?imageMogr2/format/jpg']) {
    original.search = query;
    keys.push(guaziKeyPrefix + path.basename(guaziImageCacheFile(original.href)));
  }
  return [...new Set(keys)];
}

const photoKeys = source => { const key = photoIdentity(source); return key ? [key] : guaziPhotoKeys(source); };

const fileSnapshot = (file, stat) => ({file, ino:stat.ino, size:stat.size, allocatedBytes:stat.blocks*512, mtimeMs:stat.mtimeMs});

function walkRegularFiles(folder, visit) {
  let entries;
  try {
    const stat = syncFs.lstatSync(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return;
    entries = syncFs.readdirSync(folder,{withFileTypes:true});
  } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const file = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walkRegularFiles(file,visit);
    else if (entry.isFile()) visit(file);
  }
}

export async function storedPhotoFiles(directory) {
  const files=[];
  const base=path.resolve(directory);
  walkRegularFiles(base,file=>{
    const key=photoIdentity('/'+path.relative(base,file).split(path.sep).join('/'));
    if (!key) return;
    try {
      const stat=syncFs.lstatSync(file);
      if(stat.isFile()) files.push({...fileSnapshot(file,stat),key,base,kind:'stored'});
    } catch(error) { if(error.code!=='ENOENT') throw error; }
  });
  return files;
}

// Кэш Guazi плоский: файл-кадр с именем из 64 шестнадцатеричных знаков и рядом его
// описание .json. Временные и чужие файлы не трогаем.
export async function storedGuaziFiles(directory) {
  const base=path.resolve(directory);
  const files=[];
  let entries;
  try {
    const stat=syncFs.lstatSync(base);
    if(!stat.isDirectory() || stat.isSymbolicLink()) return files;
    entries=syncFs.opendirSync(base,{bufferSize:1024});
  } catch(error) { if(error.code==='ENOENT') return files; throw error; }
  // Только плоский многомиллионный каталог читаем потоком, не держим все Dirent в памяти.
  try { for(let entry;(entry=entries.readSync());) {
    if(!entry.isFile() || !/^[0-9a-f]{64}$/.test(entry.name)) continue;
    const file=path.join(base,entry.name), name=entry.name;
    try {
      const stat=syncFs.lstatSync(file);
      if(!stat.isFile()) continue;
      let sidecar;
      try { const meta=syncFs.lstatSync(file+'.json'); if(meta.isFile()) sidecar=fileSnapshot(file+'.json',meta); }
      catch(error) { if(error.code!=='ENOENT') throw error; }
      files.push({...fileSnapshot(file,stat),key:guaziKeyPrefix+name,base,kind:'guazi',sidecar});
    } catch(error) { if(error.code!=='ENOENT') throw error; }
  }} finally {entries.closeSync();}
  return files;
}

export async function guaziCacheDirectories(primary, {releaseDirectory='/srv/abdrive/releases',extra=[]}={}) {
  const candidates=[primary,...extra], roots=new Set();
  try {
    for(const entry of await fs.readdir(releaseDirectory,{withFileTypes:true})) {
      if(entry.isDirectory()) candidates.push(path.join(releaseDirectory,entry.name,'runtime/guazi-image-cache'));
    }
  } catch(error) { if(error.code!=='ENOENT') throw error; }
  for(const candidate of candidates) {
    try {
      const stat=await fs.lstat(candidate);
      if(stat.isDirectory() && !stat.isSymbolicLink()) roots.add(await fs.realpath(candidate));
    } catch(error) { if(error.code!=='ENOENT') throw error; }
  }
  return [...roots];
}

export function nginxPhotoIdentity(header, filename) {
  const match=header.toString('latin1').match(/\nKEY: ([^\r\n]+)\n/);
  if(!match || createHash('md5').update(match[1], 'latin1').digest('hex')!==filename) return null;
  const stored=photoIdentity(match[1]);
  if(stored) return stored;
  // Общий nginx-кэш обоих сайтов также может содержать ответ Guazi /api/image.
  const api=match[1].match(/^https?(?:www\.)?(?:abcars\.by|abdrive\.ru)(?:GET|HEAD)(\/api\/image\?[^|]+)(?:\|catalog-guard-v1)?$/);
  if(!api) return null;
  const params=new URL(api[1],'https://abcars.by').searchParams;
  if(params.getAll('src').length!==1 || [...params.keys()].some(key=>!['src','v'].includes(key))) return null;
  const source=params.get('src');
  const keys=guaziPhotoKeys(source);
  const key=guaziKeyPrefix+path.basename(guaziImageCacheFile(source));
  return keys.includes(key) ? key : null;
}

export async function storedNginxPhotoFiles(directory) {
  const base=path.resolve(directory), files=[];
  walkRegularFiles(base,file=>{
    const name=path.basename(file);
    if(!/^[0-9a-f]{32}$/.test(name)) return;
    let handle;
    try {
      handle=syncFs.openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
      const stat=syncFs.fstatSync(handle);
      if(!stat.isFile()) return;
      const buffer=Buffer.alloc(8192);
      const bytesRead=syncFs.readSync(handle,buffer,0,buffer.length,0);
      const key=nginxPhotoIdentity(buffer.subarray(0,bytesRead),name);
      if(key) files.push({...fileSnapshot(file,stat),key,base,kind:'nginx'});
    } catch(error) { if(!['ENOENT','ELOOP'].includes(error.code)) throw error; }
    finally { if(handle!==undefined) syncFs.closeSync(handle); }
  });
  return files;
}

export async function selectPhotoCandidates(files, readOwnership, {recheck=false,onPlan=()=>{}}={}) {
  const candidates=await readOwnership(new Set(files.map(file=>file.key)));
  await onPlan(files.filter(file=>candidates.has(file.key)));
  const confirmed=recheck && candidates.size ? await readOwnership(candidates) : candidates;
  return files.filter(file=>candidates.has(file.key) && confirmed.has(file.key));
}

async function unchanged(entry) {
  try {
    const stat=await fs.lstat(entry.file);
    return stat.isFile() && stat.ino===entry.ino && stat.size===entry.size && stat.mtimeMs===entry.mtimeMs;
  } catch(error) { if(error.code==='ENOENT') return false; throw error; }
}

export async function removeUnchangedPhoto(entry, directory) {
  let base,parent;
  try {
    base=await fs.realpath(directory);
    parent=await fs.realpath(path.dirname(entry.file));
  } catch(error) { if(error.code==='ENOENT') return false; throw error; }
  const relative=path.relative(path.resolve(directory),path.dirname(entry.file));
  if(relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)) throw new Error('Photo outside storage');
  if(parent!==path.join(base,relative)) return false;
  if(entry.sidecar && entry.sidecar.file!==entry.file+'.json') throw new Error('Photo sidecar outside storage');
  if(!await unchanged(entry) || (entry.sidecar && !await unchanged(entry.sidecar))) return false;
  try { await fs.unlink(entry.file); }
  catch(error) { if(error.code==='ENOENT') return false; throw error; }
  if(entry.sidecar && await unchanged(entry.sidecar)) {
    try { await fs.unlink(entry.sidecar.file); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
  }
  return true;
}

export function recordPhotoOwnership(listing, wanted, owned, protectedKeys) {
  const eligible=eligibleListing(listing);
  for(const source of listing.images) for(const key of photoKeys(source)) {
    if(!wanted.has(key)) continue;
    owned.add(key);
    if(!eligible) protectedKeys.add(key);
  }
}
