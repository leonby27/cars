// Браузер с запретом хранить данные сайта (Chrome «Запретить сайтам сохранять
// данные», Safari «Блокировать все cookie», часть встроенных браузеров Android)
// бросает ошибку уже на обращении к window.localStorage. Приложение читает
// хранилище в десятках мест, в том числе при первом кадре, — одно такое чтение
// роняло всю страницу в пустой экран. Поэтому хранилище проверяется один раз при
// старте и при запрете подменяется памятью вкладки: выбор вида, валюты и темы
// просто не переживёт перезагрузку, а сайт работает.

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(String(key)) ? values.get(String(key)) : null),
    setItem: (key, value) => { values.set(String(key), String(value)); },
    removeItem: (key) => { values.delete(String(key)); },
    clear: () => { values.clear(); },
  };
}

// Запрет виден уже на чтении. Запись проверяем отдельно: старый Safari в частном
// режиме читать давал, а на записи падал. Переполненное хранилище с данными
// посетителя тоже падает на записи — его не подменяем, иначе потеряли бы избранное.
function usable(name) {
  let storage;
  try {
    storage = window[name];
    storage.getItem("__abcars_probe__");
  } catch {
    return false;
  }
  if (!storage) return false;
  try {
    storage.setItem("__abcars_probe__", "1");
    storage.removeItem("__abcars_probe__");
    return true;
  } catch {
    try { return storage.length > 0; } catch { return false; }
  }
}

export function guardBrowserStorage() {
  if (typeof window === "undefined") return;
  for (const name of ["localStorage", "sessionStorage"]) {
    if (usable(name)) continue;
    try {
      Object.defineProperty(window, name, { configurable:true, enumerable:true, value:memoryStorage() });
    } catch {}
  }
}

// Модуль подключается первым в main.jsx: проверка должна пройти раньше, чем
// остальные модули приложения начнут читать хранилище.
guardBrowserStorage();
