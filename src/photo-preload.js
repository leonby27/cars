// Готовим только обложку заинтересовавшей машины. Адрес совпадает с галереей,
// поэтому открытие использует тот же запрос/браузерный кэш, а не вторую копию.
export function createPhotoPreloader({ createImage = () => new Image(), connection = () => globalThis.navigator?.connection } = {}) {
  const entries = new Map();
  return (href, urgent = false) => {
    if (!href) return null;
    const link = connection();
    if (!urgent && (link?.saveData || /(^|-)2g$/.test(link?.effectiveType || ""))) return null;
    const existing = entries.get(href);
    if (existing) {
      if (urgent) existing.image.fetchPriority = "high";
      return existing.image;
    }
    if (!urgent && [...entries.values()].filter(entry => entry.pending).length >= 2) return null;
    const image = createImage();
    const entry = { image, pending: true };
    entries.set(href, entry);
    image.decoding = "async";
    image.fetchPriority = urgent ? "high" : "low";
    image.onload = () => {
      entry.pending = false;
      // Декодируем заранее тоже: готовый файл ещё не всегда готовый кадр.
      image.decode?.().catch(() => {});
      for (const [key, value] of entries) {
        if (entries.size <= 24) break;
        if (!value.pending) entries.delete(key);
      }
    };
    image.onerror = () => entries.delete(href);
    image.src = href;
    return image;
  };
}

export const preloadPhoto = createPhotoPreloader();

export function bindPhotoIntent(target, href, { preload = preloadPhoto, delay = 150 } = {}) {
  let timer;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  const hover = event => {
    if (event.pointerType !== "mouse") return;
    cancel();
    timer = setTimeout(() => preload(href), delay);
  };
  const focus = () => preload(href);
  const open = event => {
    if (event.button > 0 || event.target?.closest?.("button")) return;
    cancel();
    preload(href, true);
  };
  const events = [["pointerenter", hover], ["pointerleave", cancel], ["focusin", focus], ["pointerdown", open], ["click", open]];
  const options = { capture: true };
  for (const [type, handler] of events) target.addEventListener(type, handler, options);
  return () => {
    cancel();
    for (const [type, handler] of events) target.removeEventListener(type, handler, options);
  };
}
