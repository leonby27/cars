// Encar может публиковать обычное и dummy-объявление одной машины.
// Номер объявления нужен для запросов, sourceVehicleId — для защиты от дублей.
const vehicleKey = (value) => {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : null;
};

export function createEncarImportIdentity(rows = []) {
  const knownIds = new Set(rows.map((row) => String(row.external_id)));
  const activeVehicles = new Map();
  const activeAds = new Map();
  const inFlight = new Map();
  const hasDuplicate = (externalId, key) => [...(activeVehicles.get(key) || [])].some(id => id !== externalId);
  const activate = (externalId, key) => {
    if (!activeVehicles.has(key)) activeVehicles.set(key, new Set());
    activeVehicles.get(key).add(externalId);
    activeAds.set(externalId, key);
  };
  for (const row of rows) {
    const key = vehicleKey(row.source_vehicle_id);
    if (row.status === 'active' && key) activate(String(row.external_id), key);
  }

  return {
    knownIds,
    // Let another ad for the same vehicle proceed if this one fails verification.
    async reserveDetail(externalId, vehicleId) {
      const key = vehicleKey(vehicleId);
      if (!key) return () => {};
      while (inFlight.has(key)) await inFlight.get(key);
      if (hasDuplicate(String(externalId), key)) return null;
      const { promise, resolve } = Promise.withResolvers();
      inFlight.set(key, promise);
      return () => { inFlight.delete(key); resolve(); };
    },
    // Проверка и резервирование синхронны: два рабочих потока не примут одну
    // машину до того, как очередная пачка успеет записаться в базу.
    claim(car, { repair = false, reactivate = false } = {}) {
      const externalId = String(car.externalId);
      if (knownIds.has(externalId) && !reactivate) return "already in catalog";
      const key = vehicleKey(car.sourceVehicleId);
      if (!key) return "missing Encar vehicle identity";
      if (!repair && hasDuplicate(externalId, key)) return "duplicate Encar vehicle";
      knownIds.add(externalId);
      activate(externalId, key);
      return null;
    },
    release(externalId) {
      const key = activeAds.get(externalId);
      if (!key) return;
      activeVehicles.get(key).delete(externalId);
      if (!activeVehicles.get(key).size) activeVehicles.delete(key);
      activeAds.delete(externalId);
    },
    isActive: externalId => activeAds.has(externalId),
  };
}
