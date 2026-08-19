import { pool } from "./db.mjs";

// Ограничение частоты запросов. Без него пароль к аккаунту можно подбирать сколько
// угодно, а заявками и событиями аналитики — наполнять базу и очередь краулера.
//
// Счётчик живёт в базе: на Vercel запросы расходятся по разным экземплярам функции,
// поэтому счётчик в памяти ограничивал бы только один экземпляр из многих.
//
// Правило одно на всё: у каждого «ведра» (действие + кто его делает) есть окно и
// предел попыток в нём. Первая попытка открывает окно, следующая за окном — начинает
// новое.

// Адрес посетителя за прокси Vercel приходит в `x-forwarded-for`; первым в списке
// стоит сам посетитель. Локально заголовка нет, берём адрес соединения.
export function clientAddress(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(request.headers["x-real-ip"] || "").trim() || request.socket?.remoteAddress || "unknown";
}

export async function consumeRateLimit(bucket, { limit, windowSeconds }) {
  try {
    const result = await pool.query(
      `INSERT INTO rate_limits (bucket, window_started_at, hits) VALUES ($1, now(), 1)
       ON CONFLICT (bucket) DO UPDATE SET
         hits = CASE WHEN rate_limits.window_started_at <= now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.hits + 1 END,
         window_started_at = CASE WHEN rate_limits.window_started_at <= now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_started_at END
       RETURNING hits, window_started_at`,
      [bucket, windowSeconds],
    );
    const { hits, window_started_at:windowStartedAt } = result.rows[0];
    const elapsed = (Date.now() - new Date(windowStartedAt).getTime()) / 1000;
    return { allowed:hits <= limit, retryAfter:Math.max(1, Math.ceil(windowSeconds - elapsed)) };
  } catch (error) {
    // База недоступна или таблицы счётчиков ещё нет — запрос пропускаем. Иначе сбой
    // базы закрывал бы вход всем сразу, а это хуже, чем на время потерять ограничение.
    console.error("rate limit unavailable", error.message);
    return { allowed:true, retryAfter:0 };
  }
}

// Пределы подобраны так, чтобы живой человек их не заметил: настоящий посетитель
// не входит десять раз за десять минут и не отправляет десять заявок за час.
export const RATE_LIMITS = {
  login:{ limit:10, windowSeconds:600 },
  register:{ limit:5, windowSeconds:3600 },
  accountDelete:{ limit:10, windowSeconds:600 },
  analyticsLogin:{ limit:10, windowSeconds:3600 },
  orderDraft:{ limit:10, windowSeconds:3600 },
  // Одна страница присылает десятки событий, и за одним адресом может сидеть целый
  // мобильный оператор, поэтому предел здесь высокий: он отсекает наполнение базы,
  // а не обычную посещаемость.
  analyticsEvents:{ limit:600, windowSeconds:600 },
};

// `keys` — всё, по чему считаем одно и то же действие. Для входа это и адрес, и телефон:
// иначе пароль к одному аккаунту перебирали бы с разных адресов.
export async function checkRateLimit(name, keys) {
  const rule = RATE_LIMITS[name];
  if (!rule) return { allowed:true, retryAfter:0 };
  let retryAfter = 0;
  let allowed = true;
  for (const key of keys.filter(Boolean)) {
    const result = await consumeRateLimit(`${name}:${key}`, rule);
    if (!result.allowed) {
      allowed = false;
      retryAfter = Math.max(retryAfter, result.retryAfter);
    }
  }
  return { allowed, retryAfter };
}

export async function purgeExpiredRateLimits() {
  const result = await pool.query("DELETE FROM rate_limits WHERE window_started_at < now() - interval '1 day'");
  return result.rowCount;
}
