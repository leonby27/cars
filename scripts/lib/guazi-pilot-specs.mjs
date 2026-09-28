// Keep the source table losslessly; derive only fields with known units.
import { normalizeDrive } from '../../src/drive-types.js';
export function normalizeGuaziSpecs(raw, details) {
  const groups = (raw.variantDetailDto?.specifications?.groupList || []).map(g => ({
    name: g.groupTitle, items: (g.itemList || []).map(i => ({ name: i.name, value: i.value })),
  }));
  const rows = new Map(groups.flatMap(g => g.items.map(i => [i.name.toLowerCase(), i.value])));
  const positive = value => {
    const s = String(value ?? '').replaceAll(',', '').trim();
    if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
    const n = Number(s); return n > 0 ? n : null;
  };
  const value = name => rows.get(name.toLowerCase());
  const n = name => positive(value(name));
  const power = n('Total Motor Power (kw)');
  const batteryType = value('Battery Type') ?? details.batteryType ?? null;
  const range = n('CLTC Electric Range (km)') ?? positive(details.cltcElectricRange);
  const length = n('Length (mm)'), width = n('Width (mm)'), height = n('Height (mm)');
  return {
    technicalSpecs: { schemaVersion: 1, sourceLocale: 'en', count: groups.reduce((s,g) => s + g.items.length,0), groups },
    catalogFields: {
      battery: n('Battery Capacity (kWh)') ?? positive(details.batteryCapacity),
      batteryType: ({'LFP Battery':'LFP','NCM Battery':'NCM'})[batteryType] ?? batteryType,
      electricRange: range, electricRangeStandard: range == null ? null : 'CLTC',
      motorPowerKw: power, horsepower: power == null ? null : Math.round(power * 1.3596216173),
      horsepowerDerivation: power == null ? null : { source: 'Total Motor Power (kw)', factor: 1.3596216173, unit: 'PS' },
      torqueNm: n('Total Motor Torque (N·m)'),
      drive: normalizeDrive(details.driveType), sourceDrive: details.driveType ?? null, bodyStructure: details.bodyType ?? null,
      seats: n('Number of Seats') ?? positive(details.seats), doors: n('Number of Doors') ?? positive(details.doors),
      dimensions: length && width && height ? `${length}×${width}×${height}` : details.dimension ?? null,
      lengthMm: length, widthMm: width, heightMm: height, wheelbaseMm: n('Wheelbase (mm)'),
      groundClearanceMm: n('Minimum Ground Clearance (mm)'), curbWeight: n('Curb Weight (kg)') ?? positive(details.weight),
      transmission: details.transmission ?? null, bodyColor: details.exteriorColor ?? null,
      energyConsumptionKwh100Km: n('Energy Consumption per 100km (kwh/100km)'),
      fastChargingHours: n('Fast Charging Time (hours)'), slowChargingHours: n('Slow Charging Time (hours)'),
    },
  };
}
