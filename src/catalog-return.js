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
