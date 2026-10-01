// Только подтверждённые решения. Контакты, тарифы и публикация ещё не готовы.
export const ABDRIVE_SITE = {
  id: "abdrive", market: "RU", origin: "https://abdrive.ru", locale: "ru-RU",
  currency: "RUB", timeZone: "Europe/Moscow",
  company: { brand: "ABDrive", schemaName: "ABDrive", countryCode: "RU" },
  destination: { id: "moscow", name: "Москва", country: "RU" },
  contentEdition: "ru",
  services: [],
  flags: {
    GUAZI_PREVIEW_ENABLED: { production: false, local: false },
    BLOG_ENABLED: { production: false, local: false },
    REVIEWS_ENABLED: { production: false, local: false },
    BLOG_DRAFTS_VISIBLE: { production: false, local: false },
  },
  leads: { assignment: "owner", notification: "telegram" },
};
