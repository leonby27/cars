// Российский профиль: независимые цены, документы и контакты оператора.
export const ABDRIVE_SITE = {
  id: "abdrive", market: "RU", origin: "https://abdrive.ru", locale: "ru-RU",
  currency: "RUB", timeZone: "Europe/Moscow",
  company: { brand: "ABDrive", schemaName: "ABDrive", countryCode: "RU" },
  destination: { id: "moscow", name: "Москва", country: "RU" },
  contentEdition: "ru",
  services: ['customs', 'delivery', 'brands', 'range'],
  flags: {
    GUAZI_PREVIEW_ENABLED: { production: false, local: false },
    BLOG_ENABLED: { production: true, local: true },
    REVIEWS_ENABLED: { production: false, local: false },
    BLOG_DRAFTS_VISIBLE: { production: false, local: false },
  },
  leads: { assignment: "owner", notification: "telegram" },
};
