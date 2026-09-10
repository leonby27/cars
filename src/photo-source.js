const guaziHosts = new Set(["image-public.guazistatic.com", "image-oversea.guazistatic-global.com"]);

// Source photo URLs are stable most of the time, but a browser can occasionally
// cache a broken response under that stable URL. Bumping this value gives every
// visitor a fresh browser-cache key without throwing away the server-side copy.
export const PHOTO_BROWSER_CACHE_VERSION = "20260910-1";

const versionedPhotoHref = (href, version) => {
  if (!href || !version) return href;
  return `${href}${href.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
};

// Единый путь для интерфейса, аналитики и поисковой разметки.
// На превью без собственного прокси mirrorOrigin указывает на наш сервер.
export function vehiclePhotoHref(source, width = 0, { mirrorOrigin = "", cacheVersion = PHOTO_BROWSER_CACHE_VERSION } = {}) {
  if (!source) return source;
  try {
    const url = new URL(source.startsWith("//") ? `https:${source}` : source);
    if (!/^https?:$/.test(url.protocol)) return source;
    if (guaziHosts.has(url.hostname)) {
      url.protocol = "https:";
      return versionedPhotoHref(`${mirrorOrigin}/api/image?src=${encodeURIComponent(url.href)}`, cacheVersion);
    }
    if (!/(^|\.)autoimg\.cn$/.test(url.hostname)) return source;
    const path = width === "original"
      ? url.pathname.replace(/\/\d+x\d+_c\d+_(?=[^/]*$)/, "/")
      : width ? url.pathname.replace(/\/\d+x\d+_(?=[^/]*$)/, `/${width}x0_`) : url.pathname;
    return versionedPhotoHref(`${mirrorOrigin}/photo${path}`, cacheVersion);
  } catch { return source; }
}

// Сначала размер из объявления: он уже существует у источника, в отличие от
// произвольной миниатюры. Затем оригинал и сохранённое превью. Каждый адрес
// пробуем один раз; сбрасываем srcset, чтобы браузер не выбрал сломанную версию.
export function retryVehiclePhoto(image, source, options) {
  if (!source) return;
  const key = JSON.stringify([source, options?.mirrorOrigin || ""]);
  if (image.dataset.photoRetrySource !== key) {
    image.dataset.photoRetrySource = key;
    image.dataset.photoRetryTried = "[]";
  }
  const tried = new Set(JSON.parse(image.dataset.photoRetryTried || "[]"));
  tried.add(image.getAttribute("src"));
  if (image.currentSrc) tried.add(image.currentSrc);
  const candidates = [...new Set([
    vehiclePhotoHref(source, 0, options),
    vehiclePhotoHref(source, "original", options),
    vehiclePhotoHref(source, 600, options),
  ])];
  const fallback = candidates.find((href) => href && !tried.has(href));
  image.dataset.photoRetryTried = JSON.stringify([...tried]);
  if (!fallback) return;
  tried.add(fallback);
  image.dataset.photoRetryTried = JSON.stringify([...tried]);
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  image.src = fallback;
}
