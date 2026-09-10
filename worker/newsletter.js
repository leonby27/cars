export const WORKER_NEWSLETTER_CONSENT_VERSION = "footer-2026-09-10";

export const normalizeWorkerNewsletterEmail = (value) => String(value || "").trim().toLowerCase();
const validEmail = (value) => value.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
const json = (payload, status = 200) => Response.json(payload, { status, headers:{ "cache-control":"no-store" } });
const schemaByDatabase = new WeakMap();

async function ensureNewsletterSchema(db) {
  if (!schemaByDatabase.has(db)) {
    schemaByDatabase.set(db, db.prepare(`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL DEFAULT 'footer',
      consent_version TEXT NOT NULL,
      consented_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      unsubscribed_at TEXT
    )`).run().catch((error) => { schemaByDatabase.delete(db); throw error; }));
  }
  await schemaByDatabase.get(db);
}

const fromSamePage = (request, url) => {
  const origin = String(request.headers.get("origin") || "").toLowerCase();
  if (origin) return origin === url.origin.toLowerCase();
  const referer = String(request.headers.get("referer") || "").toLowerCase();
  return referer === `${url.origin.toLowerCase()}/` || referer.startsWith(`${url.origin.toLowerCase()}/`);
};

export async function handleNewsletterRequest(request, env, url) {
  if (url.pathname !== "/api/newsletter") return null;
  if (request.method !== "POST") return json({ error:"method_not_allowed" }, 405);
  if (!env.DB) return json({ error:"service_unavailable" }, 503);
  if (!fromSamePage(request, url)) return json({ error:"invalid_source" }, 403);
  const body = await request.json().catch(() => ({}));
  const email = normalizeWorkerNewsletterEmail(body.email);
  if (!validEmail(email)) return json({ error:"invalid_email" }, 400);
  if (body.consent !== true) return json({ error:"consent_required" }, 400);
  await ensureNewsletterSchema(env.DB);
  await env.DB.prepare(`INSERT INTO newsletter_subscribers (email, source, consent_version)
    VALUES (?, 'footer', ?)
    ON CONFLICT(email) DO UPDATE SET status='active', source='footer', consent_version=excluded.consent_version,
      consented_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, unsubscribed_at=NULL`)
    .bind(email, WORKER_NEWSLETTER_CONSENT_VERSION).run();
  return json({ ok:true });
}
