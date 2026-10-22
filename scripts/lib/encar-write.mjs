import { upsertCar } from '../../server/repository.mjs';
import { encarIncident } from './encar-parser.mjs';

// Run inside the caller's transaction. A verified price/status can change while
// optional history is refused; retain the saved history and technical sheet.
const historyFields = ['owners', 'transfers', 'claims', 'claimsCount', 'totalLoss',
  'inspection', 'battery', 'batteryCapacity', 'batteryType', 'batteryBrand',
  'batteryHealth', 'electricRange', 'combinedRange', 'range',
  'evBattery', 'technicalSpecs'];
const historyGroup = group => /^(?:Осмотр:|Страховая история$|Батарея$)/.test(group.name);

export async function upsertEncarCar(car, db, upsert = upsertCar) {
  let current = car;
  const { rows } = await db.query("SELECT source_payload FROM listings WHERE source='Encar' AND external_id=$1 FOR UPDATE", [car.externalId]);
  const previous = rows[0]?.source_payload;
  if (previous) {
    let retained = false;
    if (previous.sourceVehicleId != null && car.sourceVehicleId != null
      && String(previous.sourceVehicleId) !== String(car.sourceVehicleId)) {
      throw new Error('Encar: сохранённая история принадлежит другой машине');
    }
    current = { ...car };
    for (const field of historyFields) if (Object.hasOwn(previous, field)
      && (car.historyUnavailable || current[field] == null)) {
      current[field] = previous[field];
      if (previous[field] != null && (field !== 'technicalSpecs' || previous[field].groups?.some(historyGroup))) retained = true;
    }
    if (!car.historyUnavailable) {
      if (current.inspection && previous.inspection) {
        if (Object.keys(previous.inspection).some(key => previous.inspection[key] != null && current.inspection[key] == null)) retained = true;
        current.inspection = { ...previous.inspection, ...Object.fromEntries(Object.entries(current.inspection).filter(([, value]) => value !== null)) };
      }
      const groups = [...(current.technicalSpecs?.groups || [])];
      for (const group of previous.technicalSpecs?.groups || []) {
        if (!historyGroup(group)) continue;
        const at = groups.findIndex(item => item.name === group.name);
        if (at < 0) { groups.push(group); retained = true; }
        else {
          const fresh = groups[at];
          const missing = group.items.filter(item => !fresh.items.some(row => row.name === item.name));
          if (missing.length) retained = true;
          groups[at] = { ...fresh, items: [...fresh.items, ...missing] };
        }
      }
      if (groups.length) current.technicalSpecs = { ...current.technicalSpecs, groups, count: groups.reduce((sum, group) => sum + group.items.length, 0) };
    }
    current.incident = encarIncident(current);
    if (retained) current.historyUnavailable = true;
  }
  return upsert(current, db);
}
