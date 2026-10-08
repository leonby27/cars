import { normalizeCoreCard, evaluateCoreCard } from './guazi-core.mjs';
import { isGuaziSoldCard } from './guazi-availability.mjs';

// Normal policy/data omissions have durable outcomes. Transport, parsing,
// identity and database errors still throw; they must never look like success.
export async function checkGuaziJob(job, { brand, active, segments, config, reader, retry, store, run, rechecked = false }) {
  const { candidate, listed } = job;
  const id = candidate.id;
  const row = active.get(id) || { id: `guazi-${id}`, externalId: id, sourceUrl: candidate.url };
  const base = { id, brand, rechecked, job: { candidate, listed, segmentId: job.segment?.id, partition: job.partition } };
  const skip = async (reason, observedAt) => {
    await store.markSkipped(row, { run, reason, observedAt });
    return { ...base, outcome: 'skipped', reason };
  };
  if (candidate.violations.length && !active.has(id)) return { ...base, outcome: 'rejected', reason: candidate.violations.join(',') };
  let capture = await retry(() => reader.card(candidate.url, { allowMissing: true }));
  if (capture.unavailable) {
    if (listed || !segments.some(s => s.covers.includes(row.brand))) return skip('detail_missing_unconfirmed', capture.observedAt);
    const second = await retry(() => reader.card(candidate.url, { allowMissing: true }));
    if (second.unavailable) {
      await store.markUnavailable(row, { run, observations: [capture, second] });
      return { ...base, outcome: 'unavailable' };
    }
    capture = second;
  }
  if (isGuaziSoldCard(capture, id)) {
    if (active.has(id)) await store.markUnavailable(row, { run, observations: [{ url: capture.url, observedAt: capture.observedAt,
      rawData: { productId: id, displayStatus: capture.rawData.displayStatus } }] });
    return { ...base, outcome: active.has(id) ? 'unavailable' : 'rejected', reason: 'source_sold' };
  }
  if (capture.rawData?.productId !== id || !/^\d{8,9}$/.test(String(capture.rawData?.clueId))) throw Error('Card identity mismatch');
  if (capture.rawData.images != null && !Array.isArray(capture.rawData.images)) throw Error('Invalid gallery schema');
  if (!capture.rawData.images?.length) return skip('gallery_missing', capture.observedAt);
  const card = normalizeCoreCard(capture, config);
  if (!card.catalogIdentity.model) return skip('model_unknown', capture.observedAt);
  if (!Number.isFinite(card.mileageKm) || card.mileageKm < 0) return skip('mileage_unknown', capture.observedAt);
  const segment = job.segment || segments.find(s => s.brand === card.catalogIdentity.sourceBrand && s.sourceFuelNames.includes(card.fuel));
  const evaluation = segment ? evaluateCoreCard(card, segment, config) : { status: 'needs_review', reason: 'source_segment_unknown' };
  if (!evaluation.car) {
    if (active.has(id) || evaluation.status === 'needs_review') return skip(evaluation.reason, capture.observedAt);
    return { ...base, outcome: 'rejected', reason: evaluation.reason };
  }
  if (!listed) return skip('availability_unverified', capture.observedAt);
  const car = { ...evaluation.car, checkedAt: card.observedAt, available: true, refreshRun: run,
    availabilityStatus: 'observed_in_catalog',
    ...(job.partition === undefined ? {} : { sourceExportPolicyEligible: job.partition }) };
  const saved = await store.upsert(car);
  // A retry may restore a row just skipped by this same round. Only rows
  // inactive at the start (or outside its snapshot) count as returning cars.
  if (saved.action === 'reactivated' && active.has(id) && active.get(id).status !== 'skipped') saved.action = 'updated';
  return { ...base, outcome: saved.action === 'added' ? 'added' : 'updated', ...saved };
}
