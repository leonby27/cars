const guaziHosts = new Set(["image-public.guazistatic.com", "image-oversea.guazistatic-global.com"]);

// Единый путь для интерфейса, аналитики и поисковой разметки.
// На превью без собственного прокси mirrorOrigin указывает на наш сервер.
export function vehiclePhotoHref(source, width = 0, { mirrorOrigin = "" } = {}) {
  if (!source) return source;
  try {
    const url = new URL(source.startsWith("//") ? `https:${source}` : source);
    if (!/^https?:$/.test(url.protocol)) return source;
    if (guaziHosts.has(url.hostname)) {
      url.protocol = "https:";
      return `${mirrorOrigin}/api/image?src=${encodeURIComponent(url.href)}`;
    }
    if (!/(^|\.)autoimg\.cn$/.test(url.hostname)) return source;
    const path = width === "original"
      ? url.pathname.replace(/\/\d+x\d+_c\d+_(?=[^/]*$)/, "/")
      : width ? url.pathname.replace(/\/\d+x\d+_(?=[^/]*$)/, `/${width}x0_`) : url.pathname;
    return `${mirrorOrigin}/photo${path}`;
  } catch { return source; }
}

// Один запасной вариант, тоже через нас. Сбрасываем srcset: иначе браузер
// продолжает выбирать сломанный вариант, игнорируя заменённый src.
export function retryVehiclePhoto(image, source, options) {
  if (!source || image.dataset.fullSize === source) return;
  const original = vehiclePhotoHref(source, "original", options);
  const fallback = original === image.getAttribute("src") ? vehiclePhotoHref(source, 0, options) : original;
  image.dataset.fullSize = source;
  if (fallback === image.getAttribute("src") && !image.getAttribute("srcset")) return;
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  image.src = fallback;
}
