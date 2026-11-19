import { assertChe168Evidence, isChe168ListingId } from './che168-result.mjs';

export const CHE168_CHECK_BATCH_SIZE = 24;

function integrityError(message, diagnostic) {
  return Object.assign(new Error(message), { code: 'CHE168_INTEGRITY_FAILED', diagnostic });
}

// A repeated foreign ID across independent requests indicates a broken source
// response or parser contract. It cannot be deferred as individual bad cards.
export function che168IdentityGuard() {
  const requestedByForeignId = new Map();
  return (result, requestedId) => {
    if (result.reason !== 'identity-mismatch' || !isChe168ListingId(result.returnedId)) return;
    const ids = requestedByForeignId.get(result.returnedId) || new Set();
    ids.add(String(requestedId));
    requestedByForeignId.set(result.returnedId, ids);
    if (ids.size >= 3) throw integrityError('Che168: один чужой ID в ответах на разные карточки',
      { returnedId: result.returnedId, requestedIds: [...ids] });
  };
}

export function validateChe168CheckBatch(checks) {
  const ids = new Set();
  const majorChangesByPrice = new Map();
  for (const { row, result } of checks) {
    const id = String(row.external_id);
    if (ids.has(id) || row.id !== `che168-${id}` || !['alive', 'sold'].includes(result.verdict)) {
      throw integrityError('Che168: неверная идентичность или повтор в пакете', { id });
    }
    ids.add(id);
    assertChe168Evidence(result.evidence, id, result.verdict, result.price);
    const before = Number(row.usd_price);
    if (result.verdict !== 'alive' || !(before > 0) || Math.abs(result.price - before) / before < 0.3) continue;
    const group = majorChangesByPrice.get(result.price) || [];
    group.push({ id, before });
    majorChangesByPrice.set(result.price, group);
  }
  for (const [price, group] of majorChangesByPrice) {
    if (group.length >= 8 && new Set(group.map(item => item.before)).size >= 4) {
      throw integrityError('Che168: массовый переход разных котировок к одной цене; пакет требует сверки',
        { price, listings: group });
    }
  }
}
