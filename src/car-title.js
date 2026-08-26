// Заголовок карточки: марка, модель, год.
//
// У источника модель иногда уже содержит имя марки, и склейка выдавала «Geely Galaxy
// Galaxy L6 2025», «Mazda Mazda3 2022», «MG MG5 2023». Поэтому повтор убираем: если
// модель начинается со слова из названия марки, это слово из модели выбрасываем.
//
// Слово считается повтором только тогда, когда за ним идёт пробел или цифра. Иначе
// «MGA» превратилась бы в «MG A», а это отдельная модель MG.
const brandWords = (brand) => {
  const words = String(brand || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  // Первое и последнее слово марки: «Geely Galaxy» повторяется словом Galaxy,
  // «Li Auto» — словом Li. Середина названий марок не повторяется.
  return [...new Set([words[0], words[words.length - 1]])];
};

export function carModelLabel(brand, model) {
  let label = String(model || "").trim();
  // У MINI модель в базе так и записана — «MINI». Повторять её незачем.
  if (brandWords(brand).some((word) => word.toLocaleLowerCase("en-US") === label.toLocaleLowerCase("en-US"))) return "";
  for (const word of brandWords(brand)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stripped = label.replace(new RegExp(`^${escaped}(?=\\s|\\d)\\s*`, "i"), "").trim();
    if (stripped) label = stripped;
  }
  return label || String(model || "").trim();
}

export function carTitle(brand, model, year) {
  return [String(brand || "").trim(), carModelLabel(brand, model), year].filter(Boolean).join(" ");
}
