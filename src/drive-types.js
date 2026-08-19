export const DRIVE_TYPES = ["Передний", "Задний", "Полный"];
export const ANY_DRIVE = "Привод";
export const UNKNOWN_DRIVE = "Не указан";

const driveRules = [
  [/полный|四驱|全驱|全轮|AWD|4WD|4x4|all[\s-]?wheel|(dual|twin|double|two|three|triple|tri|four|quad)[\s-]*motors?/i, "Полный"],
  [/задний|后驱|后置|RWD|rear[\s-]?wheel/i, "Задний"],
  [/передний|前驱|前置|FWD|front[\s-]?wheel/i, "Передний"],
];

export function normalizeDrive(value) {
  const source = String(value ?? "").trim();
  if (!source) return UNKNOWN_DRIVE;
  for (const [pattern, label] of driveRules) if (pattern.test(source)) return label;
  return UNKNOWN_DRIVE;
}

export const orderDrives = (values) => DRIVE_TYPES.filter((item) => values.includes(item));
