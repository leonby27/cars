import { normalizeDrive, UNKNOWN_DRIVE } from "./drive-types.js";

export const UX300E_DRIVE_SOURCE = "https://newsroom.lexus.eu/ux-300e-press-kit/";
const driveRow = (name) => /^(тип привода|drive type|驱动方式)$/i.test(String(name).trim());

// Correct only a positively identified BEV variant. Engine placement alone is
// not enough to infer drivetrain, especially for combustion cars and hybrids.
export function repairVerifiedDrive(car) {
  const rows = car.technicalSpecs?.groups?.flatMap((group) => group.items || []) || [];
  const variant = [car.rawModel, ...rows.filter((row) => /^(название модели|model name)$/i.test(row.name)).map((row) => row.value)].join(" ");
  if (car.brand !== "Lexus" || !/^UX(?: EV| Electric| 300e)?$/i.test(car.model || "")
    || car.type !== "Электромобиль" || !/\b300\s*e\b/i.test(variant)) return car;
  const changed = normalizeDrive(car.drive) !== "Передний" || rows.some((row) => driveRow(row.name) && normalizeDrive(row.value) !== "Передний");
  if (!changed) return car;
  const correction = {
    field: "drive", rule: "lexus-ux-300e-fwd", value: "Передний", source: UX300E_DRIVE_SOURCE,
    originalDrive: car.drive ?? null,
    originalSpecRows: rows.filter((row) => driveRow(row.name)).map((row) => ({ ...row })),
  };
  return {
    ...car, drive: "Передний",
    specCorrections: [...(car.specCorrections || []).filter((entry) => entry.rule !== correction.rule), correction],
    ...(car.technicalSpecs ? { technicalSpecs: {
      ...car.technicalSpecs,
      groups: car.technicalSpecs.groups.map((group) => ({ ...group, items: group.items.map((row) => driveRow(row.name)
        ? { ...row, value: /[А-Яа-я]/.test(row.name) ? "Передний привод" : "Front-Wheel Drive (FWD)" } : row) })),
    } } : {}),
  };
}

export function driveConflicts(car) {
  if (car.type !== "Электромобиль") return [];
  const rows = car.technicalSpecs?.groups?.flatMap((group) => group.items || []) || [];
  const value = (pattern) => String(rows.find((row) => pattern.test(row.name))?.value || "").trim();
  const count = value(/^(количество приводных двигателей|number of drive motors|number of motors)$/i);
  const layout = value(/^(компоновка двигателей|motor layout|motor placement)$/i);
  if (!/^(1|один мотор|одноэлектродвигательный|single motor)$/i.test(count)) return [];
  const expected = /^(передний|спереди|front|front-mounted)$/i.test(layout) ? "Передний"
    : /^(задний|сзади|rear|rear-mounted)$/i.test(layout) ? "Задний" : null;
  if (!expected) return [];
  const drives = [car.drive, ...rows.filter((row) => driveRow(row.name)).map((row) => row.value)].map(normalizeDrive);
  return drives.some((drive) => drive !== UNKNOWN_DRIVE && drive !== expected)
    ? [{ field: "drive", reason: "single-motor-layout-conflict", expected }] : [];
}
