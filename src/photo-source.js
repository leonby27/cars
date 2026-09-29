const guaziHosts = new Set(["image-public.guazistatic.com", "image-oversea.guazistatic-global.com", "global-image-pub.guazistatic-global.com", "global-image1.guazistatic-global.com"]);

// Хранилища Guazi сами ужимают кадр по параметру в адресе, как Che168 по размеру
// в имени файла. Размеров два, чтобы копия на сервере не дробилась: 600 для
// каталога и 1200 для экранов с двойной плотностью. Webp с качеством 90 весит
// ~34 и ~92 КБ против ~275 КБ оригинального JPEG. «original» и 0 — сам оригинал:
// открытая галерея показывает его без пережатия.
const guaziResizers = {
  "global-image-pub.guazistatic-global.com": width => `x-bce-process=image/resize,m_lfit,w_${width}/format,f_webp/quality,q_90`,
  "global-image1.guazistatic-global.com": width => `imageMogr2/thumbnail/${width}x/format/webp/quality/90`,
};
export const GUAZI_PHOTO_WIDTHS = [600, 1200];

function guaziSizedHref(url, width) {
  const resize = guaziResizers[url.hostname];
  if (!resize || typeof width !== "number" || width <= 0) return url.href;
  const sized = new URL(url.href);
  sized.search = `?${resize(width <= GUAZI_PHOTO_WIDTHS[0] ? GUAZI_PHOTO_WIDTHS[0] : GUAZI_PHOTO_WIDTHS[1])}`;
  return sized.href;
}

// Сервер отдаёт и хранит только эти формы адреса: оригинал из объявления и два
// размера выше. Любой другой параметр был бы новой копией того же кадра на диске.
export function allowedGuaziPhotoQuery(url) {
  const resize = guaziResizers[url.hostname];
  const allowed = new Set(["", "?x-bce-process=image/format,f_jpg", "?imageMogr2/format/jpg"]);
  if (resize) for (const width of GUAZI_PHOTO_WIDTHS) allowed.add(`?${resize(width)}`);
  return allowed.has(url.search);
}

// Хранилище Encar (Корея): кадр по умолчанию 640×360, размер задаётся параметрами
// (`?impolicy=heightRate&rh=<высота>&cw=<ширина>&ch=<высота>&cg=Center`). Через наш
// сервер идёт три размера, и размер стоит в самом пути (`/photo/encar/w600/…`), а не в
// параметрах: nginx хранит копии по адресу, и `?w=` слепил бы два размера в один файл.
const encarHosts = new Set(["ci.encar.com"]);
export const ENCAR_PHOTO_WIDTHS = Object.freeze([600, 1200, 1920]);
const encarBucket = (width) => (width === "original" ? 1920 : Number(width) > 600 ? 1200 : 600);
/** Параметры хранилища Encar для ширины бакета — их же подставляет nginx (deploy/nginx-abcars-photo-location.conf). */
export const encarResizeQuery = (width) => `impolicy=heightRate&rh=${Math.round(width * 9 / 16)}&cw=${width}&ch=${Math.round(width * 9 / 16)}&cg=Center`;
export const isEncarPhotoHost = (hostname) => encarHosts.has(String(hostname || "").toLowerCase());

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
      return versionedPhotoHref(`${mirrorOrigin}/api/image?src=${encodeURIComponent(guaziSizedHref(url, width))}`, cacheVersion);
    }
    if (isEncarPhotoHost(url.hostname)) {
      return versionedPhotoHref(`${mirrorOrigin}/photo/encar/w${encarBucket(width)}${url.pathname}`, cacheVersion);
    }
    if (!/(^|\.)autoimg\.cn$/.test(url.hostname)) return source;
    const path = width === "original"
      ? url.pathname.replace(/\/\d+x\d+_c\d+_(?=[^/]*$)/, "/")
      : width ? url.pathname.replace(/\/\d+x\d+_(?=[^/]*$)/, `/${width}x0_`) : url.pathname;
    return versionedPhotoHref(`${mirrorOrigin}/photo${path}`, cacheVersion);
  } catch { return source; }
}

// Соцсети скачивают картинку сами и понимают только JPEG, поэтому для них тот же
// кадр берётся без webp и без версии в адресе. По умолчанию адрес ведёт прямо в
// хранилище Che168: загрузчик Meta не открывает соединения с нашим сервером (он
// в российской сети), а китайское хранилище ему доступно. origin задаётся, если
// картинку нужно отдать со своего домена. Ширина 1080 — то, что показывают ленты.
export function socialPhotoHref(source, { origin = "", width = 1080 } = {}) {
  if (!source) return "";
  const sourceOrigin = "https://erscglobal2.autoimg.cn";
  try {
    // Кадр Encar: уже JPEG, размер — параметрами хранилища; со своего домена — бакет 1200.
    const encarStored = String(source).match(/^\/photo\/encar\/w\d+(\/.+)$/);
    const encarUrl = encarStored ? new URL(`https://ci.encar.com${encarStored[1]}`) : new URL(source.startsWith("//") ? `https:${source}` : source, "https://abcars.by");
    if (isEncarPhotoHost(encarUrl.hostname)) {
      if (!/\.jpe?g$/i.test(encarUrl.pathname)) return "";
      return origin ? `${origin}/photo/encar/w1200${encarUrl.pathname}` : `https://${encarUrl.hostname}${encarUrl.pathname}?${encarResizeQuery(width)}`;
    }
    const url = new URL(
      source.startsWith("/photo/") ? `${sourceOrigin}${source.slice("/photo".length)}`
        : source.startsWith("//") ? `https:${source}` : source,
    );
    if (!/(^|\.)autoimg\.cn$/.test(url.hostname)) return "";
    const path = url.pathname.replace(/\.webp$/i, "").replace(/\/\d+x\d+_(?:c\d+_)?(?=[^/]*$)/, "/");
    if (!/\.jpe?g$/i.test(path)) return "";
    const sized = path.replace(/\/(?=[^/]*$)/, `/${width}x0_`);
    return origin ? `${origin}/photo${sized}` : `https://${url.hostname}${sized}`;
  } catch { return ""; }
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
