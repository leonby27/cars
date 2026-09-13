// Разбирает текст одной сводки ГТК об остатке квоты на электромобили.
// Отдельный модуль позволяет проверять новые формулировки без обращения к сети.

// «13 800», «13 800», «1511» — таможня пишет числа то с пробелом, то без.
const toNumber = (text) => Number(String(text).replace(/[\s  ]/g, ""));

export const readEvQuotaReport = ({ date, text }) => {
  const lower = text.toLowerCase();
  if (!lower.includes("квот") && !lower.includes("льгот")) return null;

  let personal = null;
  let business = null;

  const listPersonal = text.match(/([\d\s  ]+)шт\.?\s*(?:для|-)\s*граждан/i);
  const listBusiness = text.match(/([\d\s  ]+)шт\.?\s*(?:для|-)\s*юридических/i);
  if (listPersonal) personal = toNumber(listPersonal[1]);
  if (listBusiness) business = toNumber(listBusiness[1]);

  if (personal === null) {
    // Свободные формулировки: «…физическими лицами составляет 1511 штук»,
    // «…гражданами, на 24 июля 2026 г. он составляет 1708 авто»,
    // «…гражданами, остаток по состоянию на сегодня - 1987 ШТУК». Берём первое
    // число, за которым прямо стоит «штук», «авто» или «ед» — так в остаток
    // не попадают номера указов и даты из того же абзаца.
    const narrative = text.match(/(?:физическими лицами|гражданами|для граждан)[\s\S]{0,220}?([\d\s\u00a0\u202f]{3,})\s*(?:штук|авто|ед)/i);
    if (narrative) personal = toNumber(narrative[1]);
  }
  // Итоговая публикация уже не содержит число: «квота по беспошлинному ввозу
  // физическими лицами электромобилей ИСЧЕРПАНА». Ищем это в пределах одного
  // предложения, чтобы фраза ниже про сохранение льготы по НДС для физлиц не
  // превратила в ноль сообщение об исчерпании квоты другой категории.
  if (personal === null && /квот[^.!?]{0,100}(?:физическ[^.!?]{0,30}лиц|граждан)[^.!?]{0,100}исчерпан/i.test(text)) {
    personal = 0;
  }
  if (business === null && /торгового оборота/i.test(text)) {
    const single = text.match(/торгового оборота[^.]{0,160}?([\d\s  ]{3,})ШТУК/i);
    if (single) business = toNumber(single[1]);
  }
  // «Квота … юридическими лицами ИСЧЕРПАНА» — остаток ноль. Слова должны стоять
  // рядом, иначе сообщение про исчерпание квоты у граждан обнулило бы юрлиц.
  if (business === null && /(юридическ[^.]{0,90}исчерпан|исчерпан[^.]{0,90}юридическ)/i.test(text)) {
    business = 0;
  }

  const sane = (value, name) => {
    if (value === null) return null;
    if (!Number.isFinite(value) || value < 0 || value > 20000) {
      throw new Error(`Сводка от ${date}: остаток «${name}» = ${value} вне разумных пределов, файл не трогаем`);
    }
    return value;
  };

  personal = sane(personal, "граждане");
  business = sane(business, "юрлица");
  if (personal === null && business === null) return null;
  return { date, personal, business };
};
