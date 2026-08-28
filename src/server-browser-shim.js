// Заглушка браузера для сборки готовой разметки главной страницы вне браузера.
//
// Приложение писалось для браузера и кое-где спрашивает его прямо во время
// рисования: адрес страницы, ширину экрана, хранилище. Когда ту же разметку
// собирает сервер (scripts/prerender-home.mjs), этих объектов нет — подставляем
// безопасные пустышки. Ответы пустышек совпадают с тем, что видит браузер при
// самом первом рисовании после правок под оживление: хранилище читается только
// после старта, ширина экрана начинается с «настольной» (useMediaQuery в App.jsx),
// поэтому серверная и браузерная разметка получаются одинаковыми.
//
// Файл обязан стоять ПЕРВЫМ импортом в entry-server.jsx: импорты исполняются по
// порядку, и заглушка должна появиться раньше, чем модули приложения тронут window.
// В браузерную сборку файл не попадает (его импортирует только серверная точка
// входа), а условие ниже страхует от случайного двойного применения.

/* eslint-disable no-undef */
if (typeof window === "undefined") {
  const noStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };
  const noMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });
  const location = {
    // Меняется через setServerLocation ниже, если когда-нибудь начнём собирать
    // не только главную.
    href: "https://abcars.by/",
    origin: "https://abcars.by",
    protocol: "https:",
    host: "abcars.by",
    hostname: "abcars.by",
    pathname: "/",
    search: "",
    hash: "",
  };
  const win = {
    location,
    localStorage: noStorage,
    sessionStorage: noStorage,
    matchMedia: noMedia,
    history: { state: null },
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout,
    clearTimeout,
    navigator: { userAgent: "abcars-prerender" },
  };
  globalThis.window = win;
  globalThis.document = {
    documentElement: { classList: { add: () => {}, remove: () => {}, contains: () => false }, dataset: {} },
    body: {},
    head: {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({ style: {}, setAttribute: () => {} }),
  };
  globalThis.localStorage = noStorage;
  globalThis.sessionStorage = noStorage;
  // В Node глобальный navigator существует и защищён от записи — оставляем настоящий.
}

/** Подставляет адрес страницы, которую собираем. */
export const setServerLocation = (pathname = "/") => {
  if (typeof globalThis.window !== "undefined" && globalThis.window.navigator?.userAgent === "abcars-prerender") {
    globalThis.window.location.pathname = pathname;
    globalThis.window.location.href = `https://abcars.by${pathname}`;
  }
};
