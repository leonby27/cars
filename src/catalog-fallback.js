// Preserve only server-rendered catalog content, never a previous SPA route.
let snapshot = null;

export function catalogFallbackKey(href) {
  const url = new URL(href, 'https://abcars.by');
  const pathname = url.pathname.replace(/\/+$/, '');
  if (!/^\/catalog(?:\/[^/]+)?$/.test(pathname)) return null;
  for (const key of url.searchParams.keys()) {
    if (key !== 'page' && key !== 'nocount' && key !== 'ysclid' && key !== 'gclid' && key !== 'fbclid' && !key.startsWith('utm_')) return null;
  }
  const page = url.searchParams.get('page') || '1';
  if (!/^[1-9]\d{0,4}$/.test(page)) return null;
  return `${pathname}?page=${page}`;
}

export function captureCatalogFallback(document, location) {
  snapshot = null;
  const key = catalogFallbackKey(location.href);
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  const main = document.querySelector('#root .seo-body main.seo-prerender');
  if (!key || !canonical || catalogFallbackKey(canonical) !== key || !main) return;
  snapshot = { key, html: main.innerHTML };
}

export function readCatalogFallback(href) {
  return snapshot && snapshot.key === catalogFallbackKey(href) ? snapshot.html : null;
}
