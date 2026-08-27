// Ночные смены: за одну ночь актуализация отвечает лишь за часть каталога.
//
// Причина — ночь 25→26.08.2026: обход всех фидов подряд дал около 24 тысяч
// обращений к источнику за два часа, источник закрылся посреди прогона, а на
// следующую ночь перестал пускать сервер вовсе (Tencent EdgeOne показывает
// «Security Verification» даже на главной). Плотность обращений за одну ночь —
// то, по чему нас и вычислили, поэтому работа разложена на четыре ночи:
//
//   ev        — фиды 7/5/6 (электромобили, подключаемые гибриды, гибриды)
//   petrol-a  ┐
//   petrol-b  ├ фид 1 (бензин), марки поделены по переписи источника
//   petrol-c  ┘
//
// Ловушка, ради которой и написан этот файл: актуализация считает пропавшей
// (и отправляет на поштучную проверку) любую машину, которой не нашлось в
// списках. Если просто не листать бензиновый фид, все 70 тысяч бензиновых
// карточек уйдут в поштучную очередь — вместо экономии выйдет втрое больше
// обращений, чем было. Поэтому смена решает не только «что листать», но и
// «за какие машины мы сегодня отвечаем»: чужие не трогаем совсем, они
// дождутся своей ночи.
import { canonicalImportBrand } from "../../config/import-policy.mjs";

export const SHIFT_ORDER = Object.freeze(["ev", "petrol-a", "petrol-b", "petrol-c"]);
export const PETROL_SHIFTS = Object.freeze(SHIFT_ORDER.filter((shift) => shift.startsWith("petrol-")));

// Смена дня: ровный круг по календарю, без запоминания состояния между ночами.
// Пропущенная ночь (сбой, остановленный таймер) не сдвигает очередь — назавтра
// просто наступает черёд следующей смены.
export function shiftForDate(date = new Date()) {
  const day = Math.floor(date.getTime() / 86_400_000);
  return SHIFT_ORDER[((day % SHIFT_ORDER.length) + SHIFT_ORDER.length) % SHIFT_ORDER.length];
}

export function feedsForShift(shift) {
  return shift === "ev" ? [7, 5, 6] : [1];
}

// Марки бензинового фида раскладываются по трём сменам жадно: самые крупные
// первыми, каждая следующая — в наименее загруженную смену. Так ночи выходят
// примерно равными по числу страниц, а раскладка не зависит от даты — она
// целиком определяется переписью, значит одна и та же марка всегда попадает в
// свою ночь.
export function petrolBuckets(brandMap) {
  const brands = Object.entries(brandMap.brands || {})
    .map(([name, value]) => ({ name, listings: Number(value?.listings) || 0 }))
    .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name));

  const load = new Map(PETROL_SHIFTS.map((shift) => [shift, 0]));
  const byBrandName = new Map();
  for (const brand of brands) {
    let chosen = PETROL_SHIFTS[0];
    for (const shift of PETROL_SHIFTS) if (load.get(shift) < load.get(chosen)) chosen = shift;
    load.set(chosen, load.get(chosen) + brand.listings);
    byBrandName.set(brand.name, chosen);
  }
  return { byBrandName, load };
}

// В переписи имена марок такие, как их пишет источник; в нашей базе — уже
// приведённые к общему виду. Сводим одно к другому, иначе машина не найдёт
// свою смену и будет проверяться в чужую.
export function petrolShiftByBrand(brandMap) {
  const { byBrandName, load } = petrolBuckets(brandMap);
  const byCanonical = new Map();
  for (const [name, shift] of byBrandName) {
    const canonical = canonicalImportBrand(name) || name;
    if (!byCanonical.has(canonical)) byCanonical.set(canonical, shift);
  }
  return { byCanonical, byBrandName, load };
}

// Марка, которой в переписи нет (появилась после последней переписи, или мы
// знаем её под другим именем): раскладываем по имени — лишь бы каждый раз в
// одну и ту же ночь, а не в каждую подряд.
export function fallbackPetrolShift(brand) {
  let sum = 0;
  for (const ch of String(brand || "")) sum += ch.codePointAt(0);
  return PETROL_SHIFTS[sum % PETROL_SHIFTS.length];
}

// Смена машины из нашей базы. null — «тип неизвестен»: такую проверяем в любую
// ночь, их единицы, и потерять их было бы хуже, чем лишний раз проверить.
export function shiftOfCar({ type, brand }, byCanonical) {
  if (type === "Электромобиль" || type === "Гибрид") return "ev";
  if (type === "ДВС") return byCanonical.get(brand) || fallbackPetrolShift(brand);
  return null;
}
