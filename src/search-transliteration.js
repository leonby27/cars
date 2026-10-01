// Shared name transliteration: independent of market, currency and pricing.
// Латиница, набранная кириллицей: «зикр 8х» — это Zeekr 8X, «007гт» — 007GT.
// Названия моделей в каталоге всегда латинские, поэтому кириллицу переводим двумя
// способами и пробуем оба: по звучанию («гт» → gt) и по начертанию букв
// («у» → y, «н» → h) — набирают и так, и так.
const CYRILLIC_TO_LATIN = {
  а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ж:"zh", з:"z", и:"i", й:"i", к:"k", л:"l", м:"m",
  н:"n", о:"o", п:"p", р:"r", с:"s", т:"t", у:"u", ф:"f", х:"x", ц:"c", ч:"ch", ш:"sh",
  щ:"sch", ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya",
};
const CYRILLIC_LOOKALIKE = { в:"b", н:"h", р:"p", с:"c", у:"y", х:"x" };
// Третье написание — для букв, у которых два равноправных латинских варианта:
// «хан» это Han, а не Xan, «жун» — Jun, «щи» — Shi. Остальные буквы берутся
// из основной карты.
const CYRILLIC_ALTERNATE = { х:"h", ц:"ts", ж:"j", щ:"sh", ы:"i", й:"y" };
// Названия латинских букв словами: «эль7» — это L7, «икс9» — X9. Берём только те,
// что не спутать с русскими словами, и только целой группой букв («иксбандит» — нет).
const LETTER_NAMES = { икс:"x", эль:"l", эйч:"h", джи:"g", джей:"j", кей:"k", уай:"y", зет:"z", дабл:"w", ку:"q", эм:"m", эн:"n", эф:"f", эр:"r", эс:"s" };
const LETTER_NAMES_RE = new RegExp(`(?<![а-я])(${Object.keys(LETTER_NAMES).join("|")})(?![а-я])`, "g");
const transliterate = (text, map) => text.replace(/[а-я]/g, (letter) => map[letter] ?? CYRILLIC_TO_LATIN[letter] ?? letter);

/** Латинские написания кириллического запроса; для латиницы — пустой список. */
export const latinVariants = (text) => {
  // Приводим к строчным сразу: телефонная клавиатура ставит заглавную букву в
  // начале слова («Спортб»), а карта заглавных не знает — первая буква оставалась
  // кириллической, получалось «Спортb», и слово не находилось.
  const source = String(text ?? "").toLocaleLowerCase("ru").replace(/ё/g, "е");
  if (!/[а-я]/.test(source)) return [];
  const spelled = source.replace(LETTER_NAMES_RE, (name) => LETTER_NAMES[name]);
  const variants = [transliterate(source, CYRILLIC_TO_LATIN), transliterate(source, CYRILLIC_LOOKALIKE), transliterate(source, CYRILLIC_ALTERNATE)];
  if (spelled !== source) variants.push(transliterate(spelled, CYRILLIC_TO_LATIN));
  return [...new Set(variants)].filter((item) => item !== source);
};
