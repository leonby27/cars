import { productId } from './guazi-pilot-data.mjs';

// Verified against Guazi's product page on 2026-09-30 (see GUAZI_IMPORT.md):
// displayStatus === 1 selects the sold panel; 2 means Under Offer. Sold pages
// retain old FOB prices, so neither a price nor HTTP 200 proves availability.
export function isGuaziSoldCard(capture, expectedId) {
  if (capture?.rawData?.displayStatus !== 1) return false;
  try {
    const id = productId(capture.url);
    return capture.rawData.productId === id && (expectedId === undefined || expectedId === id);
  } catch { return false; }
}
