import { pool } from "./site-data/db.mjs";
import { getSessionAccount } from "./auth.mjs";

// Больше живой человек не сохранит, а без предела один аккаунт мог бы наполнять таблицу без конца.
const MAX_SAVED_SEARCHES = 30;

import {normalizeSearchFilters} from "./search-filters.mjs";
export {normalizeSearchFilters};

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
