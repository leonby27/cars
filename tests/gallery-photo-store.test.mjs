import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { galleryPhotoPaths, enqueueGalleryVisits, copyGallery, settleGallery } from '../scripts/lib/gallery-photo-store.mjs';
import { photoIdentity } from '../scripts/lib/photo-cleanup.mjs';

const images = Array.from({ length: 13 }, (_, i) => `https://erscglobal2.autoimg.cn/escimg/auto/1400x0_c42_car${i}.webp`);
const now = Date.parse('2026-09-10T06:00:00Z');
const visit = { id: 'che168-58933390', viewed_at: new Date(now).toISOString() };
const makeState = () => ({ pending: {}, completed: {} });

test('all 13 frames have a preview and original, share cleanup ownership and deduplicate', () => {
  const paths = galleryPhotoPaths({ images: [...images, images[0], 'https://example.com/x.webp'] });
  assert.equal(paths.length, 26);
  for (const source of images) assert.equal(paths.filter(href => photoIdentity(href) === photoIdentity(source)).length, 2);
  assert.equal(galleryPhotoPaths({ image: images[0] }).length, 2);
});

test('queue survives restart, new visits preserve backoff, recovery completes the latest visit', () => {
  let state = makeState();
  enqueueGalleryVisits(state, [visit], now);
  settleGallery(state, visit.id, { failed: [{}] }, now);
  assert.equal(state.pending[visit.id].after, now + 60_000);
  state = JSON.parse(JSON.stringify(state));
  const latest = { ...visit, viewed_at: new Date(now + 1000).toISOString() };
  enqueueGalleryVisits(state, [latest], now + 1000);
  assert.equal(state.pending[visit.id].after, now + 60_000);
  settleGallery(state, visit.id, { failed: [{}] }, now + 60_000);
  assert.equal(state.pending[visit.id].after, now + 180_000);
  settleGallery(state, visit.id, { failed: [], interrupted: true }, now);
  assert.ok(state.pending[visit.id]);
  settleGallery(state, visit.id, { failed: [] }, now);
  assert.equal(state.completed[visit.id], latest.viewed_at);
  enqueueGalleryVisits(state, [latest, visit], now);
  assert.deepEqual(state.pending, {});
});

test('a failed frame is retried while successful files survive without another download', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-'));
  const car = { images: images.slice(0, 2) };
  const bad = galleryPhotoPaths(car)[1];
  let recovered = false;
  const requests = [];
  const options = { directory, minFreeBytes: 0, fetcher: async url => {
    requests.push(url.pathname);
    if (url.pathname === bad && !recovered) return new Response('upstream failure', { status: 502 });
    return new Response(Buffer.from('RIFF0000WEBPtest'), { headers: { 'content-type': 'image/webp' } });
  } };
  try {
    const first = await copyGallery(car, options);
    assert.equal(first.stored, 3);
    assert.equal(first.failed.length, 1);
    await assert.rejects(fs.stat(path.join(directory, bad)), { code: 'ENOENT' });
    recovered = true;
    const second = await copyGallery(car, options);
    assert.equal(second.stored, 1);
    assert.deepEqual(second.failed, []);
    assert.equal(requests.length, 5);
    assert.equal((await copyGallery(car, options)).stored, 0);
    assert.equal(requests.length, 5);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('low disk space halts copying; at most two copies run concurrently', async () => {
  let active = 0, peak = 0, calls = 0;
  await copyGallery({ images }, { copy: async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--; return { stored: false, bytes: 0 };
  } });
  assert.equal(peak, 2);
  await assert.rejects(copyGallery({ images }, { copy: async () => {
    calls++; throw Object.assign(new Error('low disk'), { code: 'PHOTO_DISK_FULL' });
  } }), { code: 'PHOTO_DISK_FULL' });
  assert.ok(calls <= 2);
});
