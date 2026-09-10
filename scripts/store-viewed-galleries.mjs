// Reads production data only. The durable queue and photographs live on disk.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../server/db.mjs';
import { atomicPhotoState } from './lib/catalog-photo-store.mjs';
import { enqueueGalleryVisits, copyGallery, settleGallery } from './lib/gallery-photo-store.mjs';

const directory = process.env.PHOTO_STORE_DIR || '/srv/abcars-media';
const stateDirectory = process.env.PHOTO_STORE_STATE_DIR || '/srv/abcars/runtime/photo-store';
await fs.mkdir(directory, { recursive: true });
await fs.mkdir(stateDirectory, { recursive: true });
const stateFile = path.join(stateDirectory, 'galleries.json');
let state = { pending: {}, completed: {} };
try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let stopping = false, scannedAt = 0;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
try {
  do {
    if (Date.now() - scannedAt >= 60_000) {
      // Rolling overlap also picks up late-committed events. No top-100 truncation.
      const visits = await pool.query(`SELECT listing_id AS id, max(created_at) AS viewed_at
        FROM analytics_events WHERE event_name='vehicle_view' AND human=true
          AND path NOT LIKE '/analytics%' AND listing_id IS NOT NULL
          AND created_at >= now() - interval '7 days'
        GROUP BY listing_id`);
      enqueueGalleryVisits(state, visits.rows.map(row => ({ ...row, viewed_at: new Date(row.viewed_at).toISOString() })));
      await atomicPhotoState(stateFile, state);
      scannedAt = Date.now();
    }
    // Earliest due first: failed galleries cannot starve unprocessed visits.
    const next = Object.entries(state.pending).filter(([, item]) => item.after <= Date.now())
      .sort((a, b) => a[1].after - b[1].after)[0];
    if (next && !stopping) {
      const [id] = next;
      const cars = await pool.query(`SELECT l.id,
        (SELECT array_agg(url ORDER BY position) FROM listing_media WHERE listing_id=l.id) AS images
        FROM listings l WHERE l.id=$1 AND l.status='active'`, [id]);
      if (!cars.rows.length) delete state.pending[id];
      else {
        const result = await copyGallery(cars.rows[0], { directory, stopping: () => stopping });
        settleGallery(state, id, result);
        console.log('[gallery-store]', JSON.stringify({ id, ...result, pending: Object.keys(state.pending).length }));
      }
      await atomicPhotoState(stateFile, state);
    }
    if (process.argv.includes('--once')) break;
    if (!stopping) await new Promise(resolve => setTimeout(resolve, next ? 1000 : 10_000));
  } while (!stopping);
} finally { await pool.end(); }
