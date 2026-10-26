/* Marked catalog GET refusals continue on a separate verification page. */
(() => {
  if (window.__catalogGuardInstalled || !window.fetch) return;
  window.__catalogGuardInstalled = true;
  const originalFetch = window.fetch.bind(window);
  let redirecting = false;
  window.fetch = async function(input, options) {
    const response = await originalFetch(input, options);
    const method = String(options?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'GET' || response.status !== 429 || response.headers.get('X-Catalog-Verification') !== '/_catalog-check') return response;
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    if (url.origin !== location.origin) return response;
    const signal = options?.signal || (input instanceof Request ? input.signal : null);
    if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
    // Background catalog refreshes must not interrupt account or form entry.
    if (/^\/(?:login|register|account|favorites|searches|orders|analytics|partners)(?:\/|$)/.test(location.pathname)) return response;
    if (!redirecting) {
      redirecting = true;
      const target = location.pathname + location.search + location.hash;
      location.replace('/_catalog-check?return=' + encodeURIComponent(target));
    }
    return response;
  };
})();
