import { setTimeout as sleep } from 'node:timers/promises';
import { safeDiagnostic } from './circle-report.mjs';

const MAX_PRICE_CHANGE_KRW = 1_350_000;
const RETRY_DELAYS = [0, 0, 5 * 60_000, 0, 15 * 60_000];
const assertRunning = stop => {
  if (stop()) throw Object.assign(Error('Остановлено по команде; начните со свежей выдачи'), { code: 'ABCARS_STOPPED' });
};

export async function collectEncarSnapshot({ client, brands, yearFrom, stop, log, wait = sleep }) {
  const covered = new Set();
  const quotes = new Map();
  const skippedBrands = [];
  const errors = [];
  let pages = 0;
  for (const brand of brands) {
    let failure;
    for (const delay of RETRY_DELAYS) {
      if (failure) log(`[list] ${brand}: ${failure}; повтор${delay ? ` через ${delay / 60_000} мин` : ''}`);
      for (let remaining = delay; remaining > 0; remaining -= 1000) {
        assertRunning(stop);
        await wait(Math.min(remaining, 1000));
      }
      assertRunning(stop);
      const items = new Map();
      const result = await client.walk({ brands: [brand], yearFrom, minYear: yearFrom, stop, verifyCoverage: true,
        onItem: candidate => mergeQuote(items, candidate, brand),
        onSlice: ({ label, total, items }) => log(`[list] ${label}: ${items} из ${total}`),
      });
      assertRunning(stop);
      pages += result.pages;
      if (!result.broken && !result.stopped) {
        covered.add(brand);
        for (const quote of items.values()) mergeQuote(quotes, quote.candidate, brand, quote.conflict);
        break;
      }
      failure = result.errors?.[0]?.error || 'выдача пройдена не полностью';
    }
    if (!covered.has(brand)) {
      skippedBrands.push(brand);
      errors.push({ label: brand, error: safeDiagnostic(failure) });
      log(`[list] ${brand}: обход не завершён, перехожу к следующей марке`);
    }
  }
  return { covered, quotes, skippedBrands, errors, pages };
}

function mergeQuote(quotes, candidate, brand, conflict = false) {
  const id = candidate.externalId;
  const price = candidate.priceMan === null ? null : Math.round(candidate.priceMan * 10_000);
  const won = Number.isInteger(price) && price > 0 && price <= 2_147_483_647 ? price : null;
  const previous = quotes.get(id);
  quotes.set(id, {
    brand: previous?.brand ?? brand,
    candidate: previous?.won != null ? previous.candidate : candidate,
    won: previous?.won ?? won,
    conflict: Boolean(previous?.conflict || conflict || (previous?.won != null && won !== null && previous.won !== won)),
  });
}

export function planEncarSnapshot({ quotes, covered }, existing, known) {
  const updates = [];
  const discoveries = [];
  const returning = [];
  const counts = { seenSamePrice: 0, priceChanged: 0, sold: 0, skipped: 0, conflictingPrices: 0 };
  for (const row of existing) {
    if (!covered.has(row.brand)) continue;
    const quote = quotes.get(String(row.external_id));
    const previous = Number(row.price_cny);
    if (row.status === 'skipped' && quote) continue;
    const update = { id: row.id, externalId: String(row.external_id), status: row.status, previous };
    if (!quote) {
      counts.sold += 1;
      updates.push({ ...update, outcome: 'sold', reason: 'absent-from-list' });
    } else if (quote.won === null || (!quote.conflict && Math.abs(quote.won - previous) > MAX_PRICE_CHANGE_KRW)) {
      counts.skipped += 1;
      updates.push({ ...update, outcome: 'hidden', reason: quote.won === null ? 'invalid-list-price' : 'list-price-outlier', won: quote.won });
    } else if (quote.conflict || quote.won === previous) {
      counts.seenSamePrice += 1;
      if (quote.conflict) counts.conflictingPrices += 1;
      updates.push({ ...update, outcome: 'seen', reason: quote.conflict ? 'conflicting-list-prices' : 'present-in-list' });
    } else {
      counts.priceChanged += 1;
      updates.push({ ...update, outcome: 'price', reason: 'price-from-list', won: quote.won });
    }
  }
  for (const [id, quote] of quotes) {
    if (quote.won === null || quote.conflict) continue;
    const row = known.get(id);
    if (!row) discoveries.push({ ...quote.candidate, brand: quote.brand });
    else if (row.status !== 'active' && covered.has(row.brand)) returning.push(id);
  }
  return { updates, discoveries, returning, counts };
}
