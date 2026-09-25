// Контакты компании: подвал, страница контактов и разметка для поисковиков берут их отсюда.
// Улицы нет намеренно: офиса пока нет, а адрес без помещения журналист или клиент
// проверит по панорамам (решение владельца 24.09.2026). Город оставлен — он же стоит
// в карточке Google. Часы совпадают с карточкой Google.
export const COMPANY = Object.freeze({
  brand: "abcars.by",
  // Имя компании для разметки, по которой поисковик узнаёт организацию. До этого
  // там стоял только адрес сайта, поэтому по запросу «абкарс» Google выводил
  // страницу контактов — единственную, где это слово встречалось словами.
  // Основное имя латиницей, остальные написания — как дополнительные.
  schemaName: "ABCars",
  schemaAlternateNames: Object.freeze(["Абкарс", "abcars.by"]),
  address: "Минск",
  city: "Минск",
  countryCode: "BY",
  hours: "Пн–Пт: 9:00–20:00 · Сб, Вс: Выходной",
  email: "abcarsby@gmail.com",
  phone: "+375 25 646-21-63",
  phoneHref: "+375256462163",
  telegram: "@abcarsby",
  telegramUrl: "https://t.me/abcarsby",
  instagram: "@abcars.by",
  instagramUrl: "https://www.instagram.com/abcars.by/",
  threads: "@abcars.by",
  threadsUrl: "https://www.threads.com/@abcars.by",
  viber: "+375 25 646-21-63",
  viberUrl: "viber://chat?number=%2B375256462163",
});
