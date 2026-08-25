// Находки — машины источника, которых у нас ещё нет.
//
// Раньше их искало пополнение (`import-v2.mjs`), заново обходя те же списки,
// которые за час до него уже пролистала актуализация: полтора десятка минут на
// 47 тысяч машин ради полутора сотен новых, и это без бензина — с ним обход
// вырос бы до часа. Между тем актуализация видит каждую карточку источника и
// просто выбрасывала незнакомые.
//
// Теперь она их складывает сюда. Отбор идёт по списковому слою: марка, год и
// тип по фиду — этого хватает, чтобы не тратить детальный запрос на заведомо
// чужую машину. Решает всё равно карточка: `importPolicyViolation` проверяет её
// ещё раз при разборе, потому что в списке нет ни объёма мотора, ни точного
// типа топлива.
import { MAX_LANDED_USD, canonicalImportBrand, importPolicyViolation } from "../../config/import-policy.mjs";

// Фиды источника по типу топлива. 3 (обычный гибрид) не обходится: наши правила
// его не берут, а актуализация ходит только по тем фидам, где лежит наш каталог.
export const FUEL_TYPE_POWERTRAIN = Object.freeze({
  1: "ДВС",
  5: "Гибрид",
  6: "Гибрид",
  7: "Электромобиль",
});

// Год в списке живёт в названии комплектации, а не отдельным полем. Если его там
// нет — берём год постановки на учёт: он не совпадает с модельным годом, но это
// ближайшее, что список даёт, а карточка потом уточнит.
export function listedYear(item) {
  const named = String(`${item?.specname || ""} ${item?.carname || ""}`).match(/\b(20\d{2})\b/)?.[1];
  const year = Number(named) || Number(String(item?.regdate || "").slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
}

// Одна карточка из списка: либо кандидат на скачивание, либо null.
// `knownIds` — идентификаторы вида `che168-<infoid>`, все, что у нас уже есть,
// вместе с проданными: иначе проданная машина, снова мелькнувшая в списке,
// качалась бы каждую ночь заново.
export function discoveryCandidate(item, { fuelType, knownIds }) {
  const externalId = String(item?.infoid || "").trim();
  if (!externalId || knownIds.has(`che168-${externalId}`)) return null;

  const type = FUEL_TYPE_POWERTRAIN[fuelType];
  if (!type) return null;

  // Цена в списке — китайская, без доставки и пошлины, то есть заведомо ниже
  // итоговой. Поэтому здесь она отсекает только безнадёжное: если машина уже
  // в Китае дороже потолка, под ключ она дороже тем более. Точный счёт — при
  // скачивании карточки, там есть объём мотора и дата выпуска.
  const sourceUsd = Number(String(item?.price ?? "").replace(/[^\d.]/g, ""));
  if (Number.isFinite(sourceUsd) && sourceUsd > MAX_LANDED_USD) return null;

  const brand = canonicalImportBrand(item?.brandname);
  const year = listedYear(item);
  // Бензиновым маркам свой список разрешён только в бензиновом фиде: электрический
  // Bentley из списка марок для ДВС в каталог попасть не должен.
  if (importPolicyViolation({ brand, year, type }, { combustion: type === "ДВС" })) return null;

  return { externalId, brand, year, carname: String(item?.carname || "").trim(), fuelType };
}
