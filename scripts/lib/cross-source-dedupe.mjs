const STRATEGY = "indirect-v1";

const text = (value) => String(value ?? "").trim().toLocaleLowerCase("en-US");
const number = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeCity = (value) => text(value)
  .replace(/,?\s*china$/i, "")
  .replace(/\s+/g, " ")
  .trim();

export const duplicateFingerprint = (listing) => {
  const parts = [
    text(listing.brand),
    text(listing.model),
    number(listing.modelYear),
    text(listing.firstRegistration),
    normalizeCity(listing.city),
    text(listing.color),
    text(listing.powertrain),
    text(listing.drivetrain),
  ];
  return parts.every((part) => part !== "" && part !== null) ? parts.join("\u001f") : null;
};

const closeWhenKnown = (left, right, tolerance) => {
  const a = number(left);
  const b = number(right);
  return a === null || b === null || Math.abs(a - b) <= tolerance;
};

export function compatibleCrossSourcePair(guazi, che168) {
  if (guazi.source !== "Guazi" || che168.source !== "Che168") return false;
  if (guazi.status !== "active" || che168.status !== "active") return false;
  const fingerprint = duplicateFingerprint(guazi);
  if (!fingerprint || fingerprint !== duplicateFingerprint(che168)) return false;

  const guaziMileage = number(guazi.mileageKm);
  const che168Mileage = number(che168.mileageKm);
  const guaziPrice = number(guazi.priceCny);
  const che168Price = number(che168.priceCny);
  if ([guaziMileage, che168Mileage, guaziPrice, che168Price].some((value) => value === null)) return false;
  if (Math.abs(guaziMileage - che168Mileage) > 500) return false;
  if (Math.abs(guaziPrice - che168Price) > Math.max(8000, guaziPrice * 0.08)) return false;
  if (!closeWhenKnown(guazi.batteryKwh, che168.batteryKwh, 0.5)) return false;
  if (!closeWhenKnown(guazi.electricRangeKm, che168.electricRangeKm, 5)) return false;
  return true;
}

const matchSignals = (duplicate, canonical) => ({
  brand: duplicate.brand,
  model: duplicate.model,
  modelYear: number(duplicate.modelYear),
  firstRegistration: duplicate.firstRegistration,
  city: normalizeCity(duplicate.city),
  color: duplicate.color,
  powertrain: duplicate.powertrain,
  drivetrain: duplicate.drivetrain,
  mileageDeltaKm: Math.abs(number(duplicate.mileageKm) - number(canonical.mileageKm)),
  priceDeltaCny: Math.abs(number(duplicate.priceCny) - number(canonical.priceCny)),
});

// A match must be unique in both directions. If two physical cars can satisfy
// the same indirect description, neither is hidden automatically.
export function findCrossSourceDuplicates(listings) {
  const che168ByFingerprint = new Map();
  const guazi = [];
  for (const listing of listings) {
    if (listing.status !== "active") continue;
    if (listing.source === "Guazi") {
      guazi.push(listing);
      continue;
    }
    if (listing.source !== "Che168") continue;
    const fingerprint = duplicateFingerprint(listing);
    if (!fingerprint) continue;
    const bucket = che168ByFingerprint.get(fingerprint) || [];
    bucket.push(listing);
    che168ByFingerprint.set(fingerprint, bucket);
  }

  const uniqueFromGuazi = [];
  for (const duplicate of guazi) {
    const fingerprint = duplicateFingerprint(duplicate);
    if (!fingerprint) continue;
    const candidates = (che168ByFingerprint.get(fingerprint) || [])
      .filter((canonical) => compatibleCrossSourcePair(duplicate, canonical));
    if (candidates.length !== 1) continue;
    uniqueFromGuazi.push({ duplicate, canonical: candidates[0] });
  }

  const guaziPerCanonical = new Map();
  for (const match of uniqueFromGuazi) {
    guaziPerCanonical.set(match.canonical.id, (guaziPerCanonical.get(match.canonical.id) || 0) + 1);
  }

  return uniqueFromGuazi
    .filter(({ canonical }) => guaziPerCanonical.get(canonical.id) === 1)
    .map(({ duplicate, canonical }) => ({
      duplicateId: duplicate.id,
      canonicalId: canonical.id,
      strategy: STRATEGY,
      confidence: 98,
      signals: matchSignals(duplicate, canonical),
    }));
}

export const CROSS_SOURCE_DEDUPE_STRATEGY = STRATEGY;
