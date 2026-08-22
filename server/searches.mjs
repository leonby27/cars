import { pool } from "./db.mjs";
import { getSessionAccount } from "./auth.mjs";

// Больше живой человек не сохранит, а без предела один аккаунт мог бы наполнять таблицу без конца.
const MAX_SAVED_SEARCHES = 30;

// Форму набора фильтров задаёт фронтенд; сервер принимает только известные ключи
// и строковые значения разумной длины, чтобы в базу не попадал произвольный JSON.
const FILTER_KEYS = ["type", "brand", "model", "bodyType", "color", "yearMin", "yearMax", "mileage", "priceMin", "priceMax", "drive", "owners", "battery", "condition", "accel", "tire", "torque", "range", "excludeBrand", "excludeModel", "excludeBodyType", "excludeColor", "excludeType", "excludeDrive", "sort"];
const LIST_KEYS = new Set(["model", "bodyType", "color", "excludeBrand", "excludeModel", "excludeBodyType", "excludeColor", "excludeType", "excludeDrive"]);
// Ключи, появившиеся позже запуска сохранённых поисков: вкладка со старой сборкой
// их не шлёт, и это не повод отклонять весь набор — просто ключа не будет.
const OPTIONAL_KEYS = new Set(["accel", "tire", "torque", "range"]);
const MAX_FILTER_VALUE = 80;
const MAX_FILTER_LIST = 30;

export function normalizeSearchFilters(filters) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return null;
  const normalized = {};
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (LIST_KEYS.has(key)) {
      if (value === undefined || value === null) { normalized[key] = []; continue; }
      if (!Array.isArray(value) || value.length > MAX_FILTER_LIST) return null;
      if (value.some((item) => typeof item !== "string" || !item.trim() || item.length > MAX_FILTER_VALUE)) return null;
      normalized[key] = value.map((item) => item.trim());
      continue;
    }
    if ((value === undefined || value === null) && OPTIONAL_KEYS.has(key)) continue;
    if (typeof value !== "string" || !value.trim() || value.length > MAX_FILTER_VALUE) return null;
    normalized[key] = value.trim();
  }
  // Лишние ключи не запрещаем, а отбрасываем: старый клиент после обновления
  // формы фильтров не должен получать отказ на ровном месте.
  return normalized;
}

const searchRow = (row) => ({ id:Number(row.id), title:row.title, filters:row.filters, createdAt:row.created_at });

export async function listCustomerSearches(request) {
  const account = await getSessionAccount(request);
  if (!account) return { error:"unauthorized" };
  const result = await pool.query(
    "SELECT id,title,filters,created_at FROM customer_searches WHERE customer_id=$1 ORDER BY created_at DESC, id DESC",
    [account.id],
  );
  return { searches:result.rows.map(searchRow) };
}

export async function createCustomerSearch(request, title, filters) {
  const account = await getSessionAccount(request);
  if (!account) return { error:"unauthorized" };
  const count = await pool.query("SELECT count(*)::int AS total FROM customer_searches WHERE customer_id=$1", [account.id]);
  if (count.rows[0].total >= MAX_SAVED_SEARCHES) return { error:"too_many_searches" };
  // Повторное сохранение того же набора не плодит дубликат, а обновляет заголовок:
  // JSONB сравнивается по содержимому, порядок ключей не важен.
  const result = await pool.query(
    `INSERT INTO customer_searches (customer_id,title,filters) VALUES ($1,$2,$3)
     ON CONFLICT (customer_id,filters) DO UPDATE SET title=EXCLUDED.title
     RETURNING id,title,filters,created_at`,
    [account.id, title, JSON.stringify(filters)],
  );
  return { search:searchRow(result.rows[0]) };
}

export async function deleteCustomerSearch(request, searchId) {
  const account = await getSessionAccount(request);
  if (!account) return { error:"unauthorized" };
  // Удаление идемпотентно: уже удалённый поиск — тот же результат, а не ошибка.
  await pool.query("DELETE FROM customer_searches WHERE customer_id=$1 AND id=$2", [account.id, searchId]);
  return { ok:true };
}
