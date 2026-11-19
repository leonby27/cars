import { createHash } from 'node:crypto';
import { buildChe168Car, extractChe168DetailPayload } from './che168-parser.mjs';
import { CHE168_VERIFICATION_VERSION, che168DetailOutcome, che168DetailUrl } from './che168-result.mjs';

export const CHE168_SOLD_HEADING = 'The vehicle has been sold';
export const CHE168_SOLD_MESSAGE = 'This vehicle has already been sold. You can contact our car buying consultant to help you find a similar vehicle.';
export const CHE168_ACTIVE_TITLE = '[data-detail-title]:visible';
export const CHE168_DETAIL_READY = `${CHE168_ACTIVE_TITLE}, [class*="SoldOut_noDataTitle"]:visible`;

export function verifyChe168Observation(externalId, { url, status, scripts, active, soldHeading, soldMessage }) {
  const expectedUrl = che168DetailUrl(externalId);
  if (!expectedUrl || status !== 200 || url !== expectedUrl) return { verdict: 'unknown', reason: 'public-response-unverified', status };
  const payload = extractChe168DetailPayload(scripts);
  const observedAt = new Date().toISOString();
  const detail = che168DetailOutcome(payload, externalId, status);
  const returnedId = /^\d+$/.test(String(payload?.detail?.infoid)) ? String(payload.detail.infoid) : null;
  const evidence = { version: CHE168_VERIFICATION_VERSION, externalId: String(externalId), returnedId, url, status, observedAt };
  const unknown = reason => ({ verdict: 'unknown', reason, status, returnedId,
    // Keep only a bounded, non-personal projection of the response for diagnosis.
    sample: { active, soldHeading, soldMessage, hasDetail: Boolean(payload?.detail), priceUsd: detail.price ?? null,
      digest: createHash('sha256').update(scripts.join('\n')).digest('hex') },
  });
  // Che168 uses infoid 0 on some sold pages. A genuine foreign listing
  // still contradicts the sale panel. A placeholder never proves a sale alone.
  if (detail.reason === 'identity-mismatch') return unknown(detail.reason);
  if (soldHeading && soldMessage && !active) return {
    verdict: 'sold', evidence: { ...evidence, source: 'public-sold-panel' },
  };
  if (soldHeading || soldMessage) return unknown('public-status-conflict');
  if (detail.reason === 'placeholder-id') return unknown(detail.reason);
  if (!active) return unknown('public-active-title-missing');
  if (detail.verdict !== 'alive') return unknown(detail.reason);
  return { ...detail, payload, evidence: { ...evidence, source: 'public-active-card',
    amount: detail.price, currency: 'USD', basis: 'Vehicle Price' } };
}

export async function checkChe168PublicPage(page, externalId) {
  const attemptedAt = new Date().toISOString();
  const url = che168DetailUrl(externalId);
  if (!url) return { verdict: 'unknown', reason: 'invalid-id' };
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const status = response?.status();
    if (status !== 200 || page.url() !== url) return { verdict: 'unknown', reason: 'public-response-unverified', status, attemptedAt };
    await page.locator(CHE168_DETAIL_READY).first().waitFor({ state: 'visible', timeout: 10_000 });
    // Hidden SSR/mobile copies of the sale messages must not qualify.
    const visibleText = text => page.getByText(text, { exact: true }).filter({ visible: true }).first().isVisible();
    const [scripts, active, soldHeading, soldMessage] = await Promise.all([
      page.locator('script').allTextContents(),
      page.locator(CHE168_ACTIVE_TITLE).first().isVisible(),
      visibleText(CHE168_SOLD_HEADING),
      visibleText(CHE168_SOLD_MESSAGE),
    ]);
    return { ...verifyChe168Observation(externalId, { url: page.url(), status, scripts, active, soldHeading, soldMessage }), attemptedAt };
  } catch {
    return { verdict: 'unknown', reason: 'public-read-failed', attemptedAt };
  }
}

export function buildVerifiedChe168Car(result) {
  if (result.verdict !== 'alive') return null;
  const { payload, evidence } = result;
  const car = buildChe168Car(payload, {
    expectedLocale: 'en', expectedId: evidence.externalId, importedAt: evidence.observedAt,
  });
  return car ? { ...car, checkedAt: evidence.observedAt, sourceAvailability: evidence } : null;
}
