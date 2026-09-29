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

const encarBatteryUrl = (vehicleId) => `${ENCAR_API}/v1/readside/vehicle/ev-battery/${vehicleId}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class EncarGeoBlockedError extends Error {
  constructor(url) {
    super(`Encar закрыт для этой сети (404 на ${url}): запускайте на сервере в Петербурге, из Беларуси api.encar.com не отвечает`);
    this.code = "ENCAR_GEO_BLOCKED";
  }
}

export class EncarClient {
  constructor({ fetcher = fetch, pace = 250, timeoutMs = 30_000, attempts = 4, log = () => {} } = {}) {
    this.fetcher = fetcher;
    this.pace = pace;
    this.timeoutMs = timeoutMs;
    this.attempts = attempts;
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
          await sleep(1500 * (attempt + 1));
          continue;
        }
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        if (this.pace) await sleep(this.pace);
        return { status: response.status, json, text };
      } catch (error) {
        last = { status: 0, json: null, text: "", error };
        await sleep(1000 * (attempt + 1));
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
    if (detail.status !== 200 || !detail.json) return { status: detail.status, detail: null, record: null, inspection: null, battery: null };
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
    const car = buildEncarCar(fetched.detail, { id: String(id), record: fetched.record, inspection: fetched.inspection, battery: fetched.battery, importedAt, usdPerKrw });
    return { ...fetched, car };
  }

  /** Модельные группы марки у площадки (в пределах фильтра года и цены). */
  async modelGroups(brand, filters = {}) {
    const manufacturer = ENCAR_MANUFACTURERS[brand];
    if (!manufacturer) return [];
    const { json } = await this.list(encarListQuery({ manufacturer, ...filters }), 0, 1, { facets: true });
    return encarModelGroups(json);
  }

  /**
   * Обход срезов: марка → модельная группа → (год, если срез глубже 10 000).
   * На каждую строку списка зовёт `onItem(candidate, item)`; `onSlice` получает
   * итог среза. Возвращает статистику. Останавливается, когда `stop()` истинно.
   */
  async walk({ brands = Object.keys(ENCAR_MANUFACTURERS), yearFrom = 2020, yearTo = null, priceMin = null, priceMax = null, minYear = yearFrom, onItem, onSlice = () => {}, stop = () => false } = {}) {
    const stats = { slices: 0, pages: 0, items: 0, candidates: 0, skipped: {} };
    const walkSlice = async (label, base, canSplit) => {
      if (stop()) return;
      const query = encarListQuery(base);
      let offset = 0;
      let total = null;
      let sliceItems = 0;
      while (!stop()) {
        const { status, json } = await this.list(query, offset, ENCAR_PAGE_SIZE);
        stats.pages += 1;
        if (status !== 200 || !json) {
          this.log(`[list] ${label}: ответ ${status} на смещении ${offset} — срез оборван`);
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
        if (!rows.length || offset >= total || offset >= ENCAR_MAX_OFFSET) break;
      }
      stats.slices += 1;
      await onSlice({ label, total, items: sliceItems });
    };
    for (const brand of brands) {
      const manufacturer = ENCAR_MANUFACTURERS[brand];
      if (!manufacturer) { this.log(`[walk] ${brand}: у площадки такой марки нет — пропускаю`); continue; }
      if (stop()) break;
      const groups = await this.modelGroups(brand, { yearFrom, yearTo, priceMin, priceMax });
      this.log(`[walk] ${brand}: ${groups.length} модельных групп`);
      for (const group of groups) {
        if (stop()) break;
        await walkSlice(`${brand} ${group.name}`, { manufacturer, modelGroup: group.name, yearFrom, yearTo, priceMin, priceMax }, true);
      }
    }
    return stats;
  }
}
