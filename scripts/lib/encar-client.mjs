// Сеть Encar: запросы с повторами, обход срезов списка, чтение карточки целиком.
//
// Площадка отвечает простыми запросами без браузера, но только не из Беларуси:
// там CloudFront отвечает 404 на любой адрес api.encar.com (разведка 28.09.2026).
// Список никогда не отвечает 404 сам по себе, поэтому 404 на списке — признак
// закрытой сети, и клиент говорит об этом словами, а не молчит пустыми страницами.
//
// Замер 28.09.2026: 180 запросов подряд с паузой 150 мс — все 200, стены нет.
// Темп всё равно бережный (пауза между запросами и два потока): площадка чужая,
// и правила у неё строгие (research/encar-2026-09-28/README.md).
import {
  ENCAR_MANUFACTURERS, ENCAR_MAX_OFFSET, ENCAR_PAGE_SIZE, buildEncarCar, encarCandidate, encarDetailUrl,
  encarInspectionUrl, encarListQuery, encarListUrl, encarModelGroups, encarRecordUrl, encarPublicDetail, ENCAR_API, ENCAR_SITE,
} from "./encar-parser.mjs";
import { request } from 'undici';

import { applyKoreaSpecs } from "./korea-specs.mjs";

const encarBatteryUrl = (vehicleId) => `${ENCAR_API}/v1/readside/vehicle/ev-battery/${vehicleId}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const validListCount = json => json?.Count !== null && json?.Count !== undefined && Number.isSafeInteger(Number(json.Count)) && Number(json.Count) >= 0;

// fetch deliberately turns HTTP 407 into a network error with an empty cause.
// request preserves that status; no proxy, cookie or global dispatcher changes.
const sourceFetch = async (url, options) => {
  const response = await request(url, options);
  return { status: response.statusCode, headers: response.headers, text: () => response.body.text() };
};

// Node fetch often hides socket/DNS errors inside cause.errors (AggregateError).
const requestError = error => {
  const messages = [], codes = [];
  const visit = (item, depth = 0) => {
    if (!item || depth > 4) return;
    if (typeof item.code === 'string') codes.push(item.code);
    else if (item.name === 'TimeoutError') codes.push(item.name);
    if (item.message) messages.push(item.message);
    visit(item.cause, depth + 1);
    for (const child of (item.errors || []).slice(0, 4)) visit(child, depth + 1);
  };
  visit(error);
  const code = [...new Set(codes)].join(', ') || error?.name;
  return Object.assign(new Error([...new Set(messages)].join(': ') || String(error), { cause: error }), { code });
};

export class EncarGeoBlockedError extends Error {
  constructor(url) {
    super(`Encar: API не подтвердил доступ (HTTP 404 на ${url}); текущие статусы машин не подтверждены`);
    this.code = "ENCAR_GEO_BLOCKED";
  }

}

export class EncarClient {
  constructor({ fetcher = sourceFetch, pace = 250, timeoutMs = 30_000, attempts = 4, log = () => {}, specs = null, wait = sleep } = {}) {
    this.fetcher = fetcher;
    // Справочник характеристик (scripts/lib/korea-specs.mjs): дописывает мощность,
    // размеры и батарею в каждую прочитанную карточку.
    this.specs = specs;
    this.pace = pace;
    this.timeoutMs = timeoutMs;
    this.attempts = attempts;
    this.wait = wait;
    this.log = log;
    this.requests = 0;
    this.throttled = 0;
    this.failedRequests = 0;
    this.cooldown = null;
    this.unavailable = null;
    this.failedCards = 0;
    this.requirePublicMissing = false;
    this.nextRequestAt = 0;
    this.paceQueue = Promise.resolve();
  }

  sourceUnavailable(message, status, cause) {
    return this.unavailable ||= Object.assign(new Error(message, { cause }), { code: 'ENCAR_UNAVAILABLE', status });
  }

  /** JSON по адресу. 404 возвращается как есть (снятая машина), 429 и 5xx — повтор с ожиданием. */
  async response(url, { format = 'json' } = {}) {
    let last = null;
    for (let attempt = 0; attempt < this.attempts; attempt += 1) {
      if (this.cooldown) await this.cooldown;
      if (this.unavailable) throw this.unavailable;
      if (this.pace) {
        const paced = this.paceQueue.then(async () => {
          if (this.cooldown) await this.cooldown;
          const delay = this.nextRequestAt - Date.now();
          if (delay > 0) await this.wait(delay);
          if (this.cooldown) await this.cooldown;
          this.nextRequestAt = Date.now() + this.pace;
        });
        this.paceQueue = paced.catch(() => {});
        await paced;
        if (this.unavailable) throw this.unavailable;
      }
      this.requests += 1;
      try {
        const response = await this.fetcher(url, {
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: { accept: format === 'json' ? 'application/json' : 'text/html' },
        });
        const text = await response.text();
        if (response.status === 408 || response.status === 429 || response.status >= 500) {
          this.throttled += 1;
          last = { status: response.status, json: null, text };
          const header = response.headers?.get?.('retry-after') ?? response.headers?.['retry-after'];
          const delay = header == null ? NaN : /^\d+$/.test(String(header)) ? Number(header) * 1000 : Date.parse(header) - Date.now();
          if (Number.isFinite(delay) && delay > 120_000) throw this.sourceUnavailable(`Encar: HTTP ${response.status}; источник просит повторить после ${new Date(Date.now() + delay).toISOString()}`, response.status);
          if (attempt + 1 < this.attempts) {
            await this.wait(Number.isFinite(delay) ? Math.max(0, delay) : (response.status === 429 ? 30_000 : 1500) * (attempt + 1));
          }
          continue;
        }
        this.failedRequests = 0;
        let json = null;
        if (format === 'json') try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        if (format === 'json' && response.status === 200 && (!json || typeof json !== "object" || Array.isArray(json))) {
          last = { status: 200, json: null, text, error: Object.assign(new Error("Encar: invalid JSON response"), { code: "ENCAR_INVALID_JSON" }) };
          if (attempt + 1 < this.attempts) await this.wait(1000 * (attempt + 1));
          continue;
        }
        const error = response.status === 404 && /<(?:!doctype|html|body)\b/i.test(text)
          ? Object.assign(new Error('Encar: HTML вместо ответа API (HTTP 404)'), { code: 'ENCAR_INVALID_RESPONSE' }) : undefined;
        return { status: response.status, json, text, error };
      } catch (error) {
        if (error.code === 'ENCAR_UNAVAILABLE') throw error;
        last = { status: 0, json: null, text: "", error: requestError(error) };
        if (attempt + 1 < this.attempts) await this.wait(1000 * (attempt + 1));
      }
    }
    if (last && (last.status === 0 || last.status === 408 || last.status === 429 || last.status >= 500)) {
      this.failedRequests += 1;
      if (this.failedRequests >= 15) {
        throw this.sourceUnavailable(`Encar: 15 запросов подряд не прошли даже после повторов и пауз; проверка остановлена. Последняя ошибка: ${last.error?.message || `HTTP ${last.status}`}`, last.status, last.error);
      }
      if (this.failedRequests % 5 === 0 && !this.cooldown) {
        this.log(`[network] ${this.failedRequests} запросов подряд не прошли после повторов — общая пауза 60 с`);
        this.cooldown = Promise.resolve().then(() => this.wait(60_000)).finally(() => { this.cooldown = null; });
      }
    }
    return last || { status: 0, json: null, text: "" };
  }

  json(url) { return this.response(url); }

  // Resume does not walk lists, so verify API access before changing any cars.
  async verifyAccess({ brands, yearFrom, sampleId }) {
    try { await this.modelGroups(brands[0], { yearFrom }); }
    catch (error) {
      if (error.status !== 407 || !sampleId) throw error;
      const page = await this.publicDetail(sampleId);
      if (!page.detail) throw this.sourceUnavailable(`Encar: списки вернули HTTP 407, публичная карточка не подтверждена (HTTP ${page.status})`, 407, error);
      // During an API access problem, a bare API 404 is not sale evidence.
      this.requirePublicMissing = true;
    }
  }

  async publicDetail(id) {
    const page = await this.response(`${ENCAR_SITE}${encodeURIComponent(id)}`, { format: 'html' });
    return { ...page, detail: page.status === 200 ? encarPublicDetail(page.text, id) : null };
  }

  async list(query, offset = 0, count = ENCAR_PAGE_SIZE, { facets = false } = {}) {
    const url = encarListUrl(query, offset, count, { facets });
    const result = await this.json(url);
    if (result.status === 404) throw new EncarGeoBlockedError(url);
    return result;
  }

  /** Карточка с историей: { status, detail, record, inspection }. 404 — машина снята. */
  async vehicle(id, { history = true } = {}) {
    let detail = await this.json(encarDetailUrl(id));
    let availabilitySource;
    if (/has_been_cr_blocked|configured to block access from your country/i.test(detail.text || '')) {
      this.unavailable = new EncarGeoBlockedError(encarDetailUrl(id));
      throw this.unavailable;
    }
    if (detail.status === 404 && /<(?:!doctype|html|body)\b/i.test(detail.text || '')) throw this.sourceUnavailable('Encar: HTTP 404 с HTML вместо ответа API; снятие с продажи не подтверждено', 404);
    if (detail.status === 407 || (detail.status === 404 && this.requirePublicMissing)) {
      const page = await this.publicDetail(id);
      if (page.detail) {
        detail = { status: 200, json: page.detail };
        availabilitySource = page.detail.advertisement.status === 'SOLD' ? 'public-sold' : 'public-detail';
      } else {
        const error = Object.assign(new Error(`Encar: HTTP ${detail.status}; публичная карточка (HTTP ${page.status}) не подтверждает статус объявления ${id}`), { code: 'ENCAR_UNVERIFIED_STATUS', status: detail.status });
        return { status: detail.status, error, detail: null };
      }
    }
    if (detail.status === 401 || detail.status === 403) throw this.sourceUnavailable(`Encar: доступ к карточке ограничен (HTTP ${detail.status})`, detail.status);
    if (detail.status === 200 && detail.error) throw Object.assign(detail.error, { stage: 'parse' });
    if (detail.status !== 200 || !detail.json) return { status: detail.status, error: detail.error, detail: null, record: null, inspection: null, battery: null };
    if (!detail.json.vehicleId || !detail.json.advertisement?.status) {
      throw Object.assign(new Error("Encar: incomplete vehicle response"), { code: "ENCAR_INVALID_DETAIL", stage: 'parse' });
    }
    if (detail.json.advertisement.status !== 'ADVERTISE') return { status: 200, detail: detail.json, record: null, inspection: null, battery: null, availabilitySource };
    if (!detail.json.spec?.fuelName || !detail.json.category || !Array.isArray(detail.json.photos)
      || detail.json.category.formYear == null || detail.json.advertisement.price == null || detail.json.spec.mileage == null) {
      throw Object.assign(new Error('Encar: incomplete vehicle response'), { code: 'ENCAR_INVALID_DETAIL', stage: 'parse' });
    }
    const vehicleId = detail.json.vehicleId;
    let record = null;
    let inspection = null;
    let battery = null;
    if (history && vehicleId) {
      // История и осмотр необязательны: без них машина заводится с пустыми полями.
      // Данные о батарее площадка отдаёт только там, где сама их показывает.
      const wantsBattery = Boolean(detail.json.view?.hasEvBatteryInfo || detail.json.view?.isBatteryPass);
      const [recordResult, inspectionResult, batteryResult] = await Promise.all([
        this.json(encarRecordUrl(vehicleId)),
        this.json(encarInspectionUrl(vehicleId)),
        wantsBattery ? this.json(encarBatteryUrl(vehicleId)) : Promise.resolve(null),
      ]);
      // Missing optional history is fine; a failed request is not empty history.
      for (const result of [recordResult, inspectionResult, batteryResult].filter(Boolean)) {
        if (result.status === 200 && result.error) throw Object.assign(result.error, { stage: 'parse' });
        if (![200, 204, 404].includes(result.status) || result.error || (this.requirePublicMissing && result.status === 404)) return { status: result.status, detail: null, error: result.error || new Error(`Encar: история/осмотр не подтверждены (HTTP ${result.status})`) };
      }
      record = recordResult.status === 200 ? recordResult.json : null;
      inspection = inspectionResult.status === 200 ? inspectionResult.json : null;
      battery = batteryResult?.status === 200 ? batteryResult.json : null;
    }
    return { status: 200, detail: detail.json, record, inspection, battery, availabilitySource };
  }

  /** 404 without error means removed; an unverified 404 stays a read failure. */
  async car(id, { usdPerKrw, importedAt, history = true } = {}) {
    let stage = 'read';
    try {
      const fetched = await this.vehicle(id, { history });
      if (fetched.status !== 200) {
        if (fetched.status === 404 && !fetched.error) this.failedCards = 0;
        else if (++this.failedCards >= 15) throw this.sourceUnavailable(`Encar: 15 карточек подряд не удалось проверить (HTTP ${fetched.status}); ${fetched.error?.message || 'ответ источника не подтверждён'}`, fetched.status, fetched.error);
        return { ...fetched, car: null };
      }
      stage = 'parse';
      const built = buildEncarCar(fetched.detail, { id: String(id), record: fetched.record, inspection: fetched.inspection, battery: fetched.battery, importedAt, usdPerKrw });
      const car = built && this.specs ? applyKoreaSpecs(built, this.specs) : built;
      this.failedCards = 0;
      return { ...fetched, car };
    } catch (error) {
      if (error.code === 'ENCAR_UNAVAILABLE' || error.code === 'ENCAR_GEO_BLOCKED') throw error;
      if (stage === 'parse' || error.stage === 'parse') {
        error.stage = 'parse';
        if (++this.failedCards >= 15) throw Object.assign(this.sourceUnavailable(`Encar: 15 карточек подряд не удалось разобрать; ${error.message}`, 200, error), { stage: 'parse' });
      }
      throw error;
    }
  }

  /**
   * Список с терпением: сеть сервера временами рвётся на минуты (29.09.2026 полный
   * круг за десять минут «прошёл» 30 срезов из сотен — почти каждый первый запрос
   * среза отвечал ошибкой сети). Ошибка сети или 5xx — ждём и повторяем тот же
   * запрос, а не бросаем срез.
   */
  async patientList(query, offset, count, options = {}) {
    let last = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      last = await this.list(query, offset, count, options);
      if (last.status === 200 && last.json) return last;
      // A malformed filter/access refusal is not repaired by retrying it.
      if (last.status >= 400 && last.status < 500 && last.status !== 408 && last.status !== 429) return last;
      if (attempt === 5) break;
      const wait = Math.min(120_000, 15_000 * (attempt + 1));
      this.log(`[list] ответ ${last.status} (смещение ${offset}) — жду ${Math.round(wait / 1000)} с и повторяю`);
      await this.wait(wait);
    }
    return last;
  }

  /** Модельные группы марки у площадки (в пределах фильтра года и цены). */
  async modelGroups(brand, filters = {}) {
    const manufacturer = ENCAR_MANUFACTURERS[brand];
    if (!manufacturer) return [];
    const { status, json, error } = await this.patientList(encarListQuery({ manufacturer, ...filters }), 0, 1, { facets: true });
    if (status !== 200 || !json || !Array.isArray(json.iNav?.Nodes) || !validListCount(json)) {
      throw Object.assign(new Error(`Encar: model groups for ${brand}: HTTP ${status}${error ? ` (${error.code || error.message})` : ""}`), { code: "ENCAR_LIST_FAILED", status });
    }
    const groups = encarModelGroups(json);
    if (Number(json.Count) > 0 && !groups.length) throw Object.assign(new Error(`Encar: missing model groups for ${brand}`), { code: 'ENCAR_LIST_FAILED', status });
    return groups;
  }

  /**
   * Обход срезов: марка → модельная группа → (год, если срез глубже 10 000).
   * На каждую строку списка зовёт `onItem(candidate, item)`; `onSlice` получает
   * итог среза. Возвращает статистику. Останавливается, когда `stop()` истинно.
   */
  async walk({ brands = Object.keys(ENCAR_MANUFACTURERS), yearFrom = 2020, yearTo = null, priceMin = null, priceMax = null, minYear = yearFrom, onItem, onSlice = () => {}, stop = () => false } = {}) {
    const stats = { slices: 0, pages: 0, items: 0, candidates: 0, skipped: {}, errors: [] };
    const walkSlice = async (label, base, canSplit) => {
      if (stop()) return;
      const query = encarListQuery(base);
      let offset = 0;
      let total = null;
      let sliceItems = 0;
      let emptyRetries = 0;
      while (!stop()) {
        const { status, json, error } = await this.patientList(query, offset, ENCAR_PAGE_SIZE);
        stats.pages += 1;
        if (status !== 200 || !json || !Array.isArray(json.SearchResults) || !validListCount(json)) {
          this.log(`[list] ${label}: ответ ${status} на смещении ${offset} — срез оборван`);
          stats.broken = (stats.broken || 0) + 1;
          if (stats.errors.length < 20) stats.errors.push({ label, offset, status, error: error ? `${error.code || error.name}: ${error.message}` : "Invalid or failed list response" });
          break;
        }
        const firstPage = total === null;
        // Listings can disappear while we paginate; use the current count.
        total = Number(json.Count);
        if (firstPage) {
          // Глубже 10 000 список повторяет одну страницу: делим срез по годам.
          if (total > ENCAR_MAX_OFFSET && canSplit) {
            this.log(`[list] ${label}: ${total} машин — делю по годам`);
            const from = Number(base.yearFrom) || 2020;
            const to = Number(base.yearTo) || new Date().getFullYear() + 1;
            for (let year = from; year <= to; year += 1) await walkSlice(`${label} ${year}`, { ...base, yearFrom: year, yearTo: year }, false);
            return;
          }
        }
        const rows = Array.isArray(json.SearchResults) ? json.SearchResults : [];
        if (!rows.length && offset < total && offset < ENCAR_MAX_OFFSET && emptyRetries < 2) {
          const delay = 5000 * ++emptyRetries;
          this.log(`[list] ${label}: пустая страница на ${offset} из ${total} — повтор через ${delay / 1000} с`);
          await this.wait(delay);
          continue;
        }
        if (rows.length) emptyRetries = 0;
        for (const item of rows) {
          sliceItems += 1;
          stats.items += 1;
          const candidate = encarCandidate(item, { minYear });
          if (!candidate) continue;
          if (candidate.skip) { stats.skipped[candidate.skip] = (stats.skipped[candidate.skip] || 0) + 1; continue; }
          stats.candidates += 1;
          await onItem(candidate, item);
        }
        offset += rows.length;
        if (!rows.length || offset >= total || offset >= ENCAR_MAX_OFFSET) {
          if (offset < total) {
            stats.broken = (stats.broken || 0) + 1;
            if (stats.errors.length < 20) stats.errors.push({ label, offset, status, error: `Incomplete list: ${offset} of ${total}` });
            this.log(`[list] ${label}: неполная выдача ${offset} из ${total}`);
          }
          break;
        }
      }
      stats.slices += 1;
      await onSlice({ label, total, items: sliceItems });
    };
    for (const brand of brands) {
      const manufacturer = ENCAR_MANUFACTURERS[brand];
      if (!manufacturer) { this.log(`[walk] ${brand}: у площадки такой марки нет — пропускаю`); continue; }
      if (stop()) break;
      let groups;
      try { groups = await this.modelGroups(brand, { yearFrom, yearTo, priceMin, priceMax }); }
      catch (error) {
        if (error instanceof EncarGeoBlockedError || error.code === 'ENCAR_UNAVAILABLE') throw error;
        stats.broken = (stats.broken || 0) + 1;
        if (stats.errors.length < 20) stats.errors.push({ label: brand, status: error.status, error: error.message });
        this.log(`[walk] ${brand}: ${error.message}`);
        continue;
      }
      this.log(`[walk] ${brand}: ${groups.length} модельных групп`);
      for (const group of groups) {
        if (stop()) break;
        await walkSlice(`${brand} ${group.name}`, { manufacturer, modelGroup: group.name, yearFrom, yearTo, priceMin, priceMax }, true);
      }
    }
    stats.stopped = stop();
    return stats;
  }
}
