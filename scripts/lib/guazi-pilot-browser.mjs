import { chromium } from 'playwright';
import { sourceUrl, productId, extractRawData, isChallenge } from './guazi-pilot-data.mjs';
import { pause } from './guazi-pilot-io.mjs';

export class SourceBlocked extends Error {
  constructor(url, status, reason = 'access_check') { super(`Guazi access check${status ? ` (HTTP ${status})` : ''} at ${url}`); this.code = 'SOURCE_BLOCKED'; this.url = url; this.status = status; this.reason = reason; }
}

// A normal access check may recur during a long session. Permit bounded checks
// in the SAME context, never an unbounded reload/profile/IP rotation loop.
export function verificationBudget({ now = Date.now, windowMs = 3600000, maxAttempts = 4, minIntervalMs = 60000 } = {}) {
  let attempts = [];
  return { take() {
    const at = now(); attempts = attempts.filter(t => at - t < windowMs);
    if (attempts.length && at - attempts.at(-1) < minIntervalMs) return 'verification_too_frequent';
    if (attempts.length >= maxAttempts) return 'verification_hourly_limit';
    attempts.push(at); return null;
  } };
}

// The request context shares the server browser's cookies. Dispose every response:
// Playwright otherwise retains its body until the context closes (too much for a bulk run).
export async function readSessionCard(request, url, { timeout = 25000, allowMissing = false } = {}) {
  const id = productId(url);
  const response = await request.get(url, { timeout, maxRedirects: 0 }).catch(e => {
    // Playwright's multi-line call log can include private request headers.
    throw new Error(String(e.message).split('\n')[0]);
  });
  try {
    const status = response.status();
    if ([403, 429, 566, 567, 570, 571, 579].includes(status)) {
      const error = new SourceBlocked(url, status, 'http_access_check');
      const retry = response.headers()['retry-after'];
      if ([429, 567, 570, 571, 579].includes(status)) {
        const advertised = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
        error.retryAfterMs = Math.max(30000, Number.isFinite(advertised) ? advertised : 0);
      }
      throw error;
    }
    const missing = allowMissing && [404, 410].includes(status);
    if (!missing && (status < 200 || status >= 300)) throw new Error(`Card HTTP ${status}`);
    if (productId(response.url()) !== id) throw new Error('Unexpected product redirect');
    const maxBytes = 8 * 1024 * 1024;
    if (Number(response.headers()['content-length']) > maxBytes) throw new Error('Card response too large');
    const body = await response.body();
    if (body.length > maxBytes) throw new Error('Card response too large');
    const html = body.toString('utf8');
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
    if (isChallenge({ title })) throw new SourceBlocked(url, status, 'challenge_html');
    if (missing) {
      // Only an ordinary, first-party Next.js missing page is evidence. Proxy
      // errors, redirects and challenges must never remove a catalog record.
      const visibleText = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, ' ');
      if (isChallenge({ title, text: visibleText }) || !/text\/html/i.test(response.headers()['content-type'] || '')
        || !html.includes('self.__next_f.push(') || !/\b(?:404|410|not found|no longer available)\b/i.test(visibleText)) {
        throw new SourceBlocked(url, status, 'unverified_missing_page');
      }
      return { url: response.url(), observedAt: new Date().toISOString(), unavailable: true, httpStatus: status };
    }
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
    if (!scripts.some(s => s.trim().startsWith('self.__next_f.push('))) throw new SourceBlocked(url, status, 'missing_product_payload');
    return { url: response.url(), observedAt: new Date().toISOString(), rawData: extractRawData(scripts, id) };
  } finally { await response.dispose(); }
}

// Reads only page DOM. Also useful for recording reproducible parser fixtures.
export function pageSnapshot() {
  return {
    url: location.href, title: document.title, text: document.body?.innerText || '',
    scripts: [...document.scripts].map(s => s.textContent).filter(s => s.trim().startsWith('self.__next_f.push(')),
    products: [...new Set([...document.querySelectorAll('a[href*="/products/"]')].map(a => a.href))],
    listingLinks: [...document.querySelectorAll('a[href*="/used-cars"]')].map(a => ({ text: a.textContent.trim(), url: a.href })),
    pages: [...document.querySelectorAll('a[aria-label^="Page "]')].map(a => ({ page: Number(a.getAttribute('aria-label').split(' ').pop()), url: a.href })),
  };
}

export async function openGuaziBrowser({ profile, headless = false, cdp, timeout = 25000, delay = 1000, transport = 'navigation', verifyCheckbox = false, requestInterval = 400, authState, publicOnly = false, onEvent = async () => {} }, { browserEngine = chromium } = {}) {
  if (publicOnly && (authState || cdp)) throw new Error('Public collector cannot use authentication or an existing browser');
  let browser, context;
  if (publicOnly) {
    // A fresh context cannot inherit the owner's session from any persistent profile.
    browser = await browserEngine.launch({ headless, args: ['--disable-blink-features=AutomationControlled'] });
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  } else if (cdp) {
    const endpoint = new URL(cdp);
    if (!['http:', 'https:'].includes(endpoint.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password) throw new Error('CDP must be a local HTTP endpoint');
    browser = await browserEngine.connectOverCDP(cdp);
    context = browser.contexts()[0];
    if (!context) throw new Error('No browser context');
  } else {
    // Match the browser configuration already used by our Che168 collector.
    // Keep the real platform's user agent and a separate persistent Guazi profile.
    context = await browserEngine.launchPersistentContext(profile, {
      headless, viewport: { width: 1440, height: 900 }, locale: 'en-US',
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }
  if (authState) {
    const { readFile, stat } = await import('node:fs/promises');
    try {
      if ((await stat(authState)).mode & 0o077) throw new Error('Auth state must be owner-only (chmod 600)');
      const { cookies } = JSON.parse(await readFile(authState, 'utf8'));
      if (!Array.isArray(cookies) || !cookies.length || cookies.some(c => c.url !== 'https://en.guazi.com' || c.domain)) throw new Error('Auth state must contain en.guazi.com cookies only');
      await context.addCookies(cookies);
    } catch (error) { await context.close(); throw error; }
  }
  const ownedPages = [];
  if (publicOnly) await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === 'en.guazi.com' && /\/report(?:\/|$)/.test(url.pathname) ? route.abort() : route.continue();
  });
  const metrics = { transport, verificationAttempts: 0, checkboxClicks: 0, verificationPassed: 0, sessionRefreshes: 0, httpCards: 0, requestIntervalMs: requestInterval, cooldowns: 0 };
  let verificationResources = false;
  const checks = verificationBudget();
  async function verifyKnownCheckbox(page) {
    if (!verifyCheckbox) return false;
    const denied = checks.take();
    if (denied) throw new SourceBlocked(page.url(), undefined, denied);
    metrics.verificationAttempts++;
    await onEvent({ event: 'access_recovery', stage: 'verification_started', attempt: metrics.verificationAttempts, url: page.url() });
    verificationResources = true;
    try {
      // One attempt per encounter at the known EdgeOne checkbox, with a shared
      // hourly budget. Changed widgets/puzzles or a failed check stop the run.
      await page.reload({ waitUntil: 'domcontentloaded', timeout });
      const deadline = Date.now() + timeout;
      let clicked = false;
      while (Date.now() < deadline) {
        try {
          const snapshot = await page.evaluate(pageSnapshot);
          if (!isChallenge(snapshot) && (snapshot.products.length || snapshot.scripts.length)) { metrics.verificationPassed++; await onEvent({ event: 'access_recovery', stage: 'verification_passed', attempt: metrics.verificationAttempts, url: page.url() }); return true; }
          if (!clicked) {
            const frame = page.frames().find(f => {
              try { const u = new URL(f.url()); return u.hostname === 'gcaptcha.eo.gtimg.com' && u.pathname.startsWith('/static/template/widget_ele_global_eo.'); }
              catch { return false; }
            });
            if (frame && await frame.locator('#verifyCheckbox').isVisible()) {
              await frame.locator('#verifyCheckbox').click({ timeout: 5000 });
              metrics.checkboxClicks++;
              clicked = true;
            }
          }
        } catch (e) {
          if (!/Execution context was destroyed|Cannot find context|Frame was detached/.test(e.message)) throw e;
        }
        await pause(400);
      }
      return false;
    } finally { verificationResources = false; }
  }
  async function createReader() {
    const page = await context.newPage();
    ownedPages.push(page);
    // Gallery bytes are downloaded once by the separate photo queue.
    await page.route('**/*', route => {
      const u = new URL(route.request().url());
      if (publicOnly && u.hostname === 'en.guazi.com' && /\/report(?:\/|$)/.test(u.pathname)) return route.abort();
      return !verificationResources && ['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue();
    });
    page.setDefaultTimeout(timeout);
    let lastVisit = 0;
    async function navigate(url) {
      await pause(Math.max(0, delay - (Date.now() - lastVisit)));
      lastVisit = Date.now();
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      if ([403, 429, 566, 567, 570, 571, 579].includes(response?.status())) throw new SourceBlocked(url, response.status());
      if (response && response.status() >= 400) throw new Error(`Page HTTP ${response.status()}`);
    }
    async function read(url, parse) {
      await navigate(url);
      let began = Date.now(), lastError, checkAttempted = false;
      while (Date.now() - began < timeout) {
        let snapshot;
        try { snapshot = await page.evaluate(pageSnapshot); }
        catch (e) {
          if (!/Execution context was destroyed|Cannot find context/.test(e.message)) throw e;
          await pause(400); continue; // Source-side redirect during hydration.
        }
        if (isChallenge(snapshot)) {
          if (checkAttempted) throw new SourceBlocked(url, undefined, 'verification_did_not_clear');
          checkAttempted = true;
          if (!await verifyKnownCheckbox(page)) throw new SourceBlocked(url, undefined, 'verification_failed');
          began = Date.now(); continue;
        }
        try { return parse(snapshot); } catch (e) { lastError = e; }
        await pause(400);
      }
      throw lastError || new Error('Page did not load');
    }
    return {
      async inspectListing(url) {
        sourceUrl(url, 'listing');
        const pending = [];
        let observedCatalog = false;
        const capture = response => {
          const target = new URL(response.url());
          if (target.hostname !== 'en.guazi.com' || !/^\/os\//.test(target.pathname) || !/product|filter|search|brand|make|dict/i.test(target.pathname) || /report|account|user|login/i.test(target.pathname)) return;
          pending.push((async () => {
            if (!response.ok() || !response.headers()['content-type']?.includes('json')) return null;
            const body = await response.body();
            if (body.length > 4 * 1024 * 1024) return null;
            const payload = JSON.parse(body.toString('utf8'));
            if (target.pathname === '/os/facade/search/product/list' && payload.code === 0 && payload.success === true) observedCatalog = true;
            return { url: response.url(), method: response.request().method(), requestBody: response.request().postDataJSON(), body: payload };
          })().catch(() => null));
        };
        page.on('response', capture);
        try {
          const snapshot = await read(url, snapshot => {
            if (!snapshot.products.length && !observedCatalog) throw new Error(`Catalog bootstrap incomplete (title: ${snapshot.title.slice(0,100)}, text: ${snapshot.text.slice(0,180).replace(/\s+/g,' ')})`);
            return snapshot;
          });
          return { ...snapshot, publicResponses: (await Promise.all(pending)).filter(Boolean) };
        } finally { page.off('response', capture); }
      },
      async listing(url) {
        sourceUrl(url, 'listing');
        return read(url, snapshot => {
          const products = snapshot.products.map(u => { try { return sourceUrl(u); } catch { return null; } }).filter(Boolean);
          if (!products.length) throw new Error('No product links; not evidence of an empty inventory');
          return { url: snapshot.url, observedAt: new Date().toISOString(), products, pages: snapshot.pages.filter(p => Number.isInteger(p.page) && p.page > 0) };
        });
      },
      async card(url) {
        const id = productId(url);
        return read(url, snapshot => {
          if (productId(snapshot.url) !== id) throw new Error('Unexpected product redirect');
          return { url: snapshot.url, observedAt: new Date().toISOString(), rawData: extractRawData(snapshot.scripts, id) };
        });
      },
      async report(id) {
        if (publicOnly) throw new Error('Full reports are disabled in public-only mode');
        if (!/^[a-z0-9]{10}$/.test(id)) throw new Error('Invalid report ID');
        const url = sourceUrl(`https://en.guazi.com/report/?productId=${id}`, 'report');
        let captured = null;
        const pending = [];
        const listener = response => {
          const u = new URL(response.url());
          if (u.hostname !== 'en.guazi.com' || u.pathname !== '/os/product/report/detail') return;
          const request = response.request();
          let requestData;
          try { requestData = JSON.parse(request.postData() || '{}'); } catch { requestData = {}; }
          // Correlate to this vehicle without retaining request headers/cookies.
          if ((u.searchParams.get('productId') || requestData.productId) !== id) return;
          pending.push((async () => {
            if (!response.ok() || !response.headers()['content-type']?.includes('json')) return;
            const text = await response.text();
            if (text.length > 4 * 1024 * 1024) return;
            try { captured = JSON.parse(text); } catch { /* A protection response is not a report. */ }
          })().catch(() => {}));
        };
        page.on('response', listener);
        try {
          await navigate(url);
          const began = Date.now(); let body = '';
          while (Date.now() - began < timeout) {
            let snapshot;
            try { snapshot = await page.evaluate(() => ({ title: document.title, text: document.body?.innerText || '' })); }
            catch (e) {
              if (!/Execution context was destroyed|Cannot find context/.test(e.message)) throw e;
              await pause(400); continue;
            }
            body = snapshot.text;
            if (isChallenge(snapshot)) throw new SourceBlocked(url);
            await Promise.allSettled(pending);
            if (captured) return { status: 'captured_unvalidated', sourceUrl: url, observedAt: new Date().toISOString(), payload: captured };
            if (/sign in or create account|log in to view|sign in to view/i.test(body)) return { status: 'needs_login', sourceUrl: url };
            await pause(500);
          }
          return { status: 'unavailable', sourceUrl: url, reason: 'No correlated report JSON; schema/authentication needs checking' };
        } finally { page.off('response', listener); await Promise.allSettled(pending); }
      },
    };
  }
  const primary = await createReader();
  let anonymousIdentity = {};
  let ready = false, generation = 0, refresh;
  let nextRequestAt = 0, cooldownUntil = 0;
  async function paceRequest() {
    const at = Math.max(Date.now(), nextRequestAt, cooldownUntil);
    nextRequestAt = at + metrics.requestIntervalMs;
    await pause(Math.max(0, at - Date.now()));
    if (Date.now() < cooldownUntil) await paceRequest();
  }
  // Only one browser navigation renews the session for all request workers.
  // Each encounter gets at most one known-checkbox attempt; hourly limits apply.
  const renew = (url, error, catalog = false) => refresh ||= (async () => {
    await onEvent({ event: 'access_recovery', stage: 'session_refresh_started', url, reason: error?.reason, status: error?.status });
    if (error?.retryAfterMs) {
      cooldownUntil = Date.now() + error.retryAfterMs;
      metrics.requestIntervalMs = Math.max(400, Math.ceil(metrics.requestIntervalMs * 1.5));
      metrics.cooldowns++;
      // All workers share this pause; no burst of retries during an interception.
      await paceRequest();
    }
    if (catalog) await bootstrapCatalog();
    else await primary.card(url);
    ready = true; generation++; metrics.sessionRefreshes++;
    await onEvent({ event: 'access_recovery', stage: 'session_refreshed', url, generation, metrics: { ...metrics } });
  })().finally(() => { refresh = null; });
  const catalogUrl = 'https://en.guazi.com/used-cars/?tradeType=buyItNow';
  async function bootstrapCatalog() {
    const snapshot = await primary.inspectListing(catalogUrl);
    const observed = snapshot.publicResponses.find(r => r.url.includes('/search/product/list') && r.requestBody?.guid)?.requestBody;
    if (!observed) throw new Error('Missing anonymous catalog visitor context');
    anonymousIdentity = { did: observed.did || '', guid: observed.guid };
    ready = true;
    return snapshot;
  }
  async function fetchList(body) {
    const url = 'https://en.guazi.com/os/facade/search/product/list?language=en';
    const response = await context.request.post(url, { data: { ...body, ...anonymousIdentity }, timeout, maxRedirects: 0 }).catch(error => { throw new Error(String(error.message).split('\n')[0]); });
    try {
      const status = response.status();
      if ([401,403,429,566,567,570,571,579].includes(status)) {
        const error = new SourceBlocked(url, status, status === 401 ? 'anonymous_auth_required' : 'http_access_check');
        if ([429,567,570,571,579].includes(status)) {
          const retry = response.headers()['retry-after'];
          const advertised = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
          error.retryAfterMs = Math.max(30000, Number.isFinite(advertised) ? advertised : 0);
        }
        throw error;
      }
      if (!response.ok()) throw new Error(`List HTTP ${status}`);
      if (!response.headers()['content-type']?.includes('json')) throw new SourceBlocked(url,status,'non_json_list');
      const bytes = await response.body();
      if (bytes.length > 4 * 1024 * 1024) throw new Error('List too large');
      const payload = JSON.parse(bytes.toString('utf8'));
      if (payload.code === 0 && payload.success === true && (payload.data?.totalCount === 0 || body.clientScene === 'count') && payload.data.list === null) payload.data.list = [];
      if (payload.code !== 0 || payload.success !== true || !Array.isArray(payload.data?.list) || !Number.isInteger(payload.data?.totalCount)) throw new Error(`Unrecognized public list response (code ${payload.code}, success ${payload.success}, total ${payload.data?.totalCount}, list ${typeof payload.data?.list})`);
      metrics.httpLists = (metrics.httpLists || 0) + 1;
      return payload;
    } finally { await response.dispose(); }
  }
  const fetchCard = async (url, options) => { const result = await readSessionCard(context.request, url, { timeout, ...options }); metrics.httpCards++; return result; };
  const requestWorker = async () => {
    let lastVisit = 0;
    return { async card(url, options) {
      productId(url);
      if (!ready) await renew(url);
      if (refresh) await refresh;
      await pause(Math.max(0, delay - (Date.now() - lastVisit)));
      lastVisit = Date.now();
      await paceRequest();
      if (refresh) await refresh;
      const seen = generation;
      try { return await fetchCard(url, options); }
      catch (e) {
        if (e.code !== 'SOURCE_BLOCKED') throw e;
        if (refresh) await refresh;
        else if (seen === generation) await renew(url, e);
        await paceRequest();
        return fetchCard(url, options);
      }
    } };
  };
  return { ...primary, metrics,
    async publicBootstrap() {
      if (!publicOnly) throw new Error('Public API requires a fresh anonymous context');
      return bootstrapCatalog();
    },
    async publicSearch(body) {
      if (!publicOnly || !ready) throw new Error('Anonymous catalog must be bootstrapped first');
      if (refresh) await refresh;
      await paceRequest();
      if (refresh) await refresh;
      const seen = generation;
      try { return await fetchList(body); }
      catch (error) {
        if (error.code !== 'SOURCE_BLOCKED' || error.status === 401) throw error;
        if (refresh) await refresh;
        else if (seen === generation) await renew(catalogUrl,error,true);
        await paceRequest();
        return fetchList(body); // One retry only; another access check stops the run.
      }
    },
    async report(id, warmupUrl) {
      if (publicOnly) throw new Error('Full reports are disabled in public-only mode');
      if (transport !== 'session-http') return primary.report(id);
      if (!ready) {
        if (!warmupUrl || productId(warmupUrl) !== id) throw new Error('Report needs matching warmup card');
        await renew(warmupUrl);
      }
      await paceRequest();
      const url = `https://en.guazi.com/os/product/report/detail?language=en&productId=${id}`;
      const response = await context.request.get(url, { timeout, maxRedirects: 0 });
      try {
        if ([401,403].includes(response.status())) return { status: 'needs_login' };
        if ([429,567].includes(response.status())) throw new SourceBlocked(url,response.status());
        if (!response.ok()) throw new Error(`Report HTTP ${response.status()}`);
        if (!response.headers()['content-type']?.includes('json')) throw new SourceBlocked(url,response.status());
        if (Number(response.headers()['content-length']) > 4 * 1024 * 1024) throw new Error('Report too large');
        const body = await response.body();
        if (body.length > 4 * 1024 * 1024) throw new Error('Report too large');
        const payload = JSON.parse(body);
        if (payload.success !== true) return { status: /login|登录|登陆|sign.?in/i.test(`${payload.message} ${payload.localizedMessage}`) ? 'needs_login' : 'unavailable', sourceCode: payload.code };
        return { status:'captured_unvalidated', sourceUrl:`https://en.guazi.com/report/?productId=${id}`, observedAt:new Date().toISOString(), payload };
      } finally { await response.dispose(); }
    },
    async listing(url) { const result = await primary.listing(url); ready = true; return result; },
    worker: transport === 'session-http' ? requestWorker : createReader,
    async close() {
    if (publicOnly) { await context.close(); await browser.close(); }
    else if (cdp) { await Promise.all(ownedPages.map(p => p.close())); await browser.close(); }
    else await context.close();
  } };
}
