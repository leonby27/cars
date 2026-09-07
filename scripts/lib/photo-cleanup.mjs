import fs from 'node:fs/promises';
import path from 'node:path';
import { vehiclePhotoHref } from '../../src/photo-source.js';
export const PHOTO_RETENTION_MS = 7 * 86400_000;

// All sizes of the same source share ownership, including old 900px copies.
export function photoIdentity(source) {
  const href = source?.startsWith('/photo/') ? source : vehiclePhotoHref(source, 'original');
  if (typeof href !== 'string' || !/^\/photo\/escimg\/[A-Za-z0-9/_.-]+\.webp$/.test(href) || href.split('/').includes('..')) return null;
  return href.replace(/\/\d+x\d+_c\d+_(?=[^/]*$)/, '/');
}

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

export async function removeUnchangedPhoto(entry, directory) {
  const base=await fs.realpath(directory);
  const parent=await fs.realpath(path.dirname(entry.file));
  if(!parent.startsWith(base+path.sep)) throw new Error('Photo outside storage');
  let stat;
  try { stat=await fs.lstat(entry.file); } catch(error) { if(error.code==='ENOENT') return false; throw error; }
  if(!stat.isFile() || stat.ino!==entry.ino || stat.size!==entry.size || stat.mtimeMs!==entry.mtimeMs) return false;
  await fs.unlink(entry.file);
  return true;
}

export function recordPhotoOwnership(listing, observation, now, wanted, owned, protectedKeys) {
  const eligible=eligibleListing(observation,now);
  for(const source of listing.images) {
    const key=photoIdentity(source);
    if(!wanted.has(key)) continue;
    owned.add(key);
    if(!eligible) protectedKeys.add(key);
  }
}
