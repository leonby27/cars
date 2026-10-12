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
  encarInspectionUrl, encarListQuery, encarListUrl, encarModelGroups, encarRecordUrl, ENCAR_API,
} from "./encar-parser.mjs";

import { applyKoreaSpecs } from "./korea-specs.mjs";

const encarBatteryUrl = (vehicleId) => `${ENCAR_API}/v1/readside/vehicle/ev-battery/${vehicleId}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const validListCount = json => json?.Count !== null && json?.Count !== undefined && Number.isSafeInteger(Number(json.Count)) && Number(json.Count) >= 0;

export class EncarGeoBlockedError extends Error {
  constructor(url) {
    super(`Encar закрыт для этой сети (404 на ${url}): запускайте на сервере в Петербурге, из Беларуси api.encar.com не отвечает`);
    this.code = "ENCAR_GEO_BLOCKED";
  }
}

export class EncarClient {
  constructor({ fetcher = fetch, pace = 250, timeoutMs = 30_000, attempts = 4, log = () => {}, specs = null, wait = sleep } = {}) {
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
  }

  /** JSON по адресу. 404 возвращается как есть (снятая машина), 429 и 5xx — повтор с ожиданием. */
  async json(url) {
    let last = null;
    for (let attempt = 0; attempt < this.attempts; attempt += 1) {
      this.requests += 1;
      try {
        const response = await this.fetcher(url, {
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) abcars-encar/1.0" },
        });
        const text = await response.text();
        if (response.status === 429 || response.status >= 500) {
          this.throttled += 1;
          last = { status: response.status, json: null, text };
          if (attempt + 1 < this.attempts) await this.wait(1500 * (attempt + 1));
          continue;
        }
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        if (response.status === 200 && (!json || typeof json !== "object" || Array.isArray(json))) {
          last = { status: 200, json: null, text, error: Object.assign(new Error("Encar: invalid JSON response"), { code: "ENCAR_INVALID_JSON" }) };
          if (attempt + 1 < this.attempts) await this.wait(1000 * (attempt + 1));
          continue;
        }
        if (this.pace) await this.wait(this.pace);
        return { status: response.status, json, text };
      } catch (error) {
        last = { status: 0, json: null, text: "", error };
        if (attempt + 1 < this.attempts) await this.wait(1000 * (attempt + 1));
      }
    }
    return last || { status: 0, json: null, text: "" };
  }

  async list(query, offset = 0, count = ENCAR_PAGE_SIZE, { facets = false } = {}) {
    const url = encarListUrl(query, offset, count, { facets });
    const result = await this.json(url);
    if (result.status === 404) throw new EncarGeoBlockedError(url);
    return result;
  }

  /** Карточка с историей: { status, detail, record, inspection }. 404 — машина снята. */
  async vehicle(id, { history = true } = {}) {
    const detail = await this.json(encarDetailUrl(id));
    if (detail.status === 200 && detail.error) throw Object.assign(detail.error, { stage: 'parse' });
    if (detail.status !== 200 || !detail.json) return { status: detail.status, error: detail.error, detail: null, record: null, inspection: null, battery: null };
    if (!detail.json.vehicleId || !detail.json.advertisement?.status || !detail.json.spec?.fuelName) {
      throw Object.assign(new Error("Encar: incomplete vehicle response"), { code: "ENCAR_INVALID_DETAIL", stage: 'parse' });
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
      record = recordResult.status === 200 ? recordResult.json : null;
      inspection = inspectionResult.status === 200 ? inspectionResult.json : null;
      battery = batteryResult?.status === 200 ? batteryResult.json : null;
    }
    return { status: 200, detail: detail.json, record, inspection, battery };
  }

  /** Запись каталога по номеру объявления. `car: null` + status 404 — снята; status 200 и car null — не наша. */
  async car(id, { usdPerKrw, importedAt, history = true } = {}) {
    const fetched = await this.vehicle(id, { history });
    if (fetched.status !== 200) return { ...fetched, car: null };
    try {
      const built = buildEncarCar(fetched.detail, { id: String(id), record: fetched.record, inspection: fetched.inspection, battery: fetched.battery, importedAt, usdPerKrw });
      const car = built && this.specs ? applyKoreaSpecs(built, this.specs) : built;
      return { ...fetched, car };
    } catch (error) { throw Object.assign(error, { stage: 'parse' }); }
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
      if (last.status >= 400 && last.status < 500 && last.status !== 429) return last;
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
      while (!stop()) {
        const { status, json } = await this.patientList(query, offset, ENCAR_PAGE_SIZE);
        stats.pages += 1;
        if (status !== 200 || !json || !Array.isArray(json.SearchResults) || !validListCount(json)) {
          this.log(`[list] ${label}: ответ ${status} на смещении ${offset} — срез оборван`);
          stats.broken = (stats.broken || 0) + 1;
          if (stats.errors.length < 20) stats.errors.push({ label, offset, status, error: "Invalid or failed list response" });
          break;
        }
        if (total === null) {
          total = Number(json.Count) || 0;
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
        if (error instanceof EncarGeoBlockedError) throw error;
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
