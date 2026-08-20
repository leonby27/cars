// Возврат в каталог: фильтры и позиция карточки живут в history.state, но по
// хлебным крошкам мы приходим новой записью истории — для неё то же состояние
// достаём из sessionStorage (своё на вкладку, переживает перезагрузку).
const storageKey = "catalog-return-state";

const attribute = (value) => String(value).replace(/["\\]/g, "\\$&");
export const carAnchorSelector = (id) => `[data-car-id="${attribute(id)}"]`;
// Лента главной может показать одну машину дважды, поэтому там якорь — ключ позиции.
export const feedAnchorSelector = (key) => `[data-feed-key="${attribute(key)}"]`;

export function saveCatalogReturn(state) {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {}
}

export function readCatalogReturn() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
    return stored?.catalog ? stored : null;
  } catch {
    return null;
  }
}

export function clearCatalogReturn() {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {}
}

// Позицию прокрутки каталога обновляем часто, а history такого не выдерживает:
// в sessionStorage её можно освежать без ограничений.
export function saveCatalogReturnScroll(scrollY, search) {
  const stored = readCatalogReturn();
  if (!stored || stored.search !== search) return;
  saveCatalogReturn({ ...stored, scrollY });
}

// Поиск на главной: выдача живёт только в памяти страницы, поэтому для возврата
// из карточки снимок (запрос, сортировка, загруженные машины) держим здесь.
// Признак «возврат к поиску» лежит в history.state той записи, откуда ушли.
const homeSearchKey = "home-search-return-state";

export function saveHomeSearchReturn(state) {
  try {
    window.sessionStorage.setItem(homeSearchKey, JSON.stringify(state));
  } catch {}
}

export function readHomeSearchReturn() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(homeSearchKey) || "null");
    return stored?.query && stored.items?.length ? stored : null;
  } catch {
    return null;
  }
}
