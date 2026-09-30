// Encar может публиковать обычное и dummy-объявление одной машины.
// Номер объявления нужен для запросов, sourceVehicleId — для защиты от дублей.
const vehicleKey = (value) => {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : null;
};

export function createEncarImportIdentity(rows = []) {
  const knownIds = new Set(rows.map((row) => String(row.external_id)));
  const activeVehicles = new Set(rows
    .filter((row) => row.status === "active")
    .map((row) => vehicleKey(row.source_vehicle_id))
    .filter(Boolean));

  return {
    knownIds,
    // Проверка и резервирование синхронны: два рабочих потока не примут одну
    // машину до того, как очередная пачка успеет записаться в базу.
    claim(car, { repair = false } = {}) {
      const externalId = String(car.externalId);
      if (knownIds.has(externalId)) return "already in catalog";
      const key = vehicleKey(car.sourceVehicleId);
      if (!key) return "missing Encar vehicle identity";
      if (!repair && activeVehicles.has(key)) return "duplicate Encar vehicle";
      knownIds.add(externalId);
      activeVehicles.add(key);
      return null;
    },
  };
}
