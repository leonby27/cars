import { vehiclePhotoHref } from '../../src/photo-source.js';
import { storeCatalogPhoto } from './catalog-photo-store.mjs';

export function galleryPhotoPaths(car) {
  return [...new Set((car.images?.length ? car.images : [car.image]).filter(Boolean)
    .flatMap(source => [600, 'original'].map(width => vehiclePhotoHref(source, width)))
    .filter(href => /^\/photo\/escimg\/[A-Za-z0-9/_.-]+\.webp$/.test(href) && !href.split('/').includes('..')))];
}

// A later view does not reset an existing failure's backoff or remove queued work.
export function enqueueGalleryVisits(state, visits, now = Date.now()) {
  for (const { id, viewed_at } of visits) {
    if (state.completed[id] >= viewed_at) continue;
    const previous = state.pending[id];
    state.pending[id] = previous
      ? { ...previous, viewedAt: viewed_at > previous.viewedAt ? viewed_at : previous.viewedAt }
      : { viewedAt: viewed_at, after: now, failures: 0 };
  }
  const cutoff = new Date(now - 8 * 86400_000).toISOString();
  for (const [id, at] of Object.entries(state.completed)) if (at < cutoff) delete state.completed[id];
}

export async function copyGallery(car, options = {}) {
  const paths = galleryPhotoPaths(car);
  const copy = options.copy || storeCatalogPhoto;
  const result = { total: paths.length, stored: 0, bytes: 0, failed: [] };
  let cursor = 0, fatal;
  // Two requests: galleries must not monopolise the origin alongside the catalog worker.
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (cursor < paths.length && !fatal && !options.stopping?.()) {
      const href = paths[cursor++];
      try {
        const saved = await copy(href, options);
        if (saved.stored) { result.stored++; result.bytes += saved.bytes; }
      } catch (error) {
        if (error.code === 'PHOTO_DISK_FULL') fatal = error;
        else result.failed.push({ href, error: error.message });
      }
    }
  }));
  if (fatal) throw fatal;
  result.interrupted = cursor < paths.length || Boolean(options.stopping?.());
  return result;
}

export function settleGallery(state, id, result, now = Date.now()) {
  const entry = state.pending[id];
  if (result.interrupted) return;
  if (!result.failed.length) {
    state.completed[id] = entry.viewedAt;
    delete state.pending[id];
  } else {
    entry.failures++;
    entry.after = now + Math.min(3600_000, 60_000 * 2 ** Math.min(entry.failures - 1, 6));
  }
}
