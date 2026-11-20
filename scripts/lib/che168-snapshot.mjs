import { che168PriceCny, isChe168ListingId } from './che168-result.mjs';
import { extractChe168ListPayload } from './che168-parser.mjs';
import { positiveSourceAmount, sourceQuoteChange } from './source-money.mjs';

const MAX_PRICE_CHANGE_USD = 1000;
const TOLERATED_DISTANCE_FROM_LAST_PAGE = 5;
const PAGE_RETRY_DELAYS_MS = [0, 0, 5 * 60_000, 0, 15 * 60_000];

export function acceptsChe168ListTail(failedPage, pageCount) {
  return failedPage > 1 && failedPage <= pageCount
    && pageCount - failedPage <= TOLERATED_DISTANCE_FROM_LAST_PAGE;
}

export function inspectChe168ListResponse({ status, text, timedOut, failure }, expectedPage) {
  const rejected = error => ({ payload: null, error });
  if (timedOut) return rejected('тайм-аут запроса');
  if (failure) return rejected(failure);
  if (!status) return rejected('источник не ответил');
  if (status !== 200) return rejected(`HTTP ${status}`);
  if (!text) return rejected('HTTP 200, пустой ответ');
  const payload = extractChe168ListPayload([`[1,${JSON.stringify(text)}])`]);
  if (!payload) return rejected('HTTP 200, в ответе нет разбираемого списка машин');
  const { pageIndex, pageCount, totalCount, items } = payload;
  if (pageIndex != null && pageIndex !== expectedPage) return rejected(`источник вернул номер страницы ${pageIndex}`);
  if (items.some(item => !isChe168ListingId(item?.infoid))) return rejected('некорректный ID в выдаче');
  if (items.length === 0 && !(expectedPage === 1 && totalCount === 0 && pageCount <= 1)) {
    return rejected(`пустая страница (заявлено страниц: ${pageCount ?? '?'}, машин: ${totalCount ?? '?'})`);
  }
  if (items.length > 0 && !(pageCount >= expectedPage && totalCount >= items.length)) {
    return rejected(`некорректные счётчики выдачи (страниц: ${pageCount ?? '?'}, машин: ${totalCount ?? '?'}, получено: ${items.length})`);
  }
  return { payload, error: null };
}

function listPrice(item) {
  const currency = item.currency ?? item.currencyCode ?? item.priceCurrency;
  if (currency != null && !['USD', '$', 'US$'].includes(String(currency).trim().toUpperCase())) return null;
  const price = positiveSourceAmount(item.price, { dollars: true });
  const cny = che168PriceCny(price);
  return cny > 0 && cny <= 2147483647 ? price : null;
}

function mergeObservation(quotes, observation) {
  const { externalId, price, conflict, candidate } = observation;
  const before = quotes.get(externalId);
  if (!before) {
    quotes.set(externalId, observation);
    return;
  }
  quotes.set(externalId, {
    externalId,
    price: before.price === null || price === null ? null : before.price,
    conflict: before.conflict || conflict || (before.price !== null && price !== null && before.price !== price),
    candidate: before.candidate || candidate,
  });
}

export function collectChe168ListPage(quotes, items, discover) {
  for (const item of items) {
    const externalId = String(item.infoid);
    if (!isChe168ListingId(externalId)) continue;
    const price = listPrice(item);
    mergeObservation(quotes, {
      externalId, price, conflict: false,
      candidate: price === null ? null : discover({ ...item, price }),
    });
  }
}

export function assertChe168Running(stopped) {
  if (stopped()) throw Object.assign(Error('Остановлено по команде; прогресс сохранён'), { code: 'ABCARS_STOPPED' });
}

export async function retryChe168ListPage({ read, pause, stopped, retry }) {
  const history = [];
  for (const delay of PAGE_RETRY_DELAYS_MS) {
    assertChe168Running(stopped);
    if (history.length) retry({ delay, attempt: history.length + 1, previousError: history.at(-1) });
    if (delay) await pause(delay);
    assertChe168Running(stopped);
    const result = await read();
    assertChe168Running(stopped);
    if (result.payload) return result;
    history.push(result.error);
  }
  return {
    payload: null,
    error: `после ${history.length} попыток: ${history.at(-1)}`,
    history,
  };
}

export async function collectChe168Snapshots({ brands, snapshots, failures, readBrand, saveBrand, saveFailure, stopped }) {
  for (const entry of brands) {
    if (snapshots.has(entry.brand) || failures.get(entry.brand)?.exhausted) continue;
    assertChe168Running(stopped);
    const result = await readBrand(entry);
    assertChe168Running(stopped);
    if (result.ok) {
      await saveBrand(entry.brand, result);
      snapshots.set(entry.brand, result);
      continue;
    }
    const failure = { exhausted: true, reason: result.why, history: result.history };
    await saveFailure(entry.brand, failure);
    failures.set(entry.brand, failure);
  }
}

export function planChe168Snapshot(snapshots, rows, knownStatuses, { estimate, newPerBrand, reportingThreshold }) {
  const quotes = new Map();
  for (const snapshot of snapshots.values()) {
    for (const observation of snapshot.quotes) mergeObservation(quotes, observation);
  }
  const updates = [];
  const counts = { priceChanged: 0, rePriced: 0, hiddenMissing: 0, hiddenPrice: 0, conflictingPrice: 0, unmapped: 0 };
  for (const row of rows) {
    const externalId = String(row.external_id);
    const observation = quotes.get(externalId);
    const update = { id: row.id, externalId, previous: row.usd_price };
    if (!observation) {
      // A brand without configured source filters has no coverage for absences.
      if (!snapshots.get(row.sourceBrand)?.covered) { counts.unmapped += 1; continue; }
      counts.hiddenMissing += 1;
      updates.push({ ...update, outcome: 'hidden', reason: 'absent-from-list' });
      continue;
    }
    const { price, conflict } = observation;
    if (price === null) {
      counts.hiddenPrice += 1;
      updates.push({ ...update, outcome: 'hidden', reason: 'invalid-list-price' });
      continue;
    }
    if (conflict) {
      counts.conflictingPrice += 1;
      updates.push({ ...update, outcome: 'seen', reason: 'conflicting-list-prices' });
      continue;
    }
    const previous = positiveSourceAmount(row.usd_price);
    if (price === previous) {
      updates.push({ ...update, outcome: 'seen' });
      continue;
    }
    if (previous === null || Math.abs(Math.round(price * 100) - Math.round(previous * 100)) > MAX_PRICE_CHANGE_USD * 100) {
      counts.hiddenPrice += 1;
      updates.push({ ...update, outcome: 'hidden', reason: 'list-price-outlier', observedUsd: price });
      continue;
    }
    const { significant } = sourceQuoteChange(previous, price, reportingThreshold);
    const cny = che168PriceCny(price);
    const est = estimate(row, price);
    if (!(Number.isFinite(est) && est > 0)) throw Error(`Che168: не удалось рассчитать цену для ${externalId}`);
    counts.priceChanged += 1;
    if (significant) counts.rePriced += 1;
    updates.push({ ...update, outcome: 'price', usd: price, cny, est, significant });
  }
  const seen = new Set();
  const candidates = [];
  for (const [brand, snapshot] of snapshots) {
    let queued = 0;
    for (const { externalId } of snapshot.quotes) {
      const { price, candidate } = quotes.get(externalId);
      const status = knownStatuses.get(externalId);
      if (price === null || !candidate || status === 'active' || seen.has(externalId)) continue;
      seen.add(externalId);
      candidates.push({ brand, externalId, candidate, returning: status !== undefined, queued: queued < newPerBrand });
      queued += 1;
    }
  }
  return { updates, counts, candidates, pricedByLists: quotes.size };
}
