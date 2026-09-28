import { readJson, writeJson, downloadPhotos } from './lib/guazi-pilot-io.mjs';
import { buildGuaziPreviewCard, publicGuaziPreviewSource } from './lib/guazi-preview-card.mjs';

const input = process.argv[2] || 'runtime/guazi-enrichment-work/sample-enriched-card.json';
const out = 'runtime/local-guazi-preview';
const source = publicGuaziPreviewSource(await readJson(input));
await writeJson(`${out}/source.json`, source);
const images = source.images.map((image, index) => ({ ...image, position: index + 1 }));
const photos = await downloadPhotos({ ...source, images, photos: await readJson(`${out}/photos.json`, []) }, out, { count: 'all', mode: 'large', concurrency: 4 });
await writeJson(`${out}/photos.json`, photos);
// Refuse to publish an incomplete photo set. Saved hashes allow safe retries.
const card = buildGuaziPreviewCard(source, photos);
console.log(JSON.stringify({ path: '/cars/preview-y2ud7mtru4', gallery: card.images.length, inspectionPhotos: 0, authenticatedRequests: 0 }));
