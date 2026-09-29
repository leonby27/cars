// Номер объявления в адресе машины `/cars/<номер>` и обратно.
//
// У китайских источников (Che168, Guazi) в адресе стоит голый номер площадки — так было
// с самого начала, и эти адреса уже в поиске. У корейского Encar номера тоже числовые и
// той же длины, поэтому голый номер рано или поздно совпал бы с китайским, и по одному
// адресу открывались бы две разные машины. Корейские адреса — с приставкой «kr-»:
// `/cars/kr-38712345`. Файл без импортов: его читают приложение, сервер и скрипты.
const CHINA_PREFIX = /^(che168|guazi|ch|gz)[-_](.+)$/i;
const KOREA_PREFIX = /^(encar|kr)[-_](.+)$/i;

/** Номер для адреса: `che168-123` → `123`, `encar-123` → `kr-123`, `123` → `123`. */
export const listingNumber = (value) => {
  const text = String(value ?? "");
  const china = text.match(CHINA_PREFIX);
  if (china) return china[2];
  const korea = text.match(KOREA_PREFIX);
  if (korea) return `kr-${korea[2]}`;
  return text;
};

/** Корейский ли адрес: `kr-123` → id `encar-123`; иначе null. */
export const koreanListingId = (number) => {
  const korea = String(number ?? "").match(KOREA_PREFIX);
  return korea ? `encar-${korea[2]}` : null;
};
