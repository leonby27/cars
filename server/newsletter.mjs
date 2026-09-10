import { pool } from "./db.mjs";

export const NEWSLETTER_CONSENT_VERSION = "footer-2026-09-10";

export const normalizeNewsletterEmail = (value) => String(value || "").trim().toLowerCase();

export const validNewsletterEmail = (value) => {
  const email = normalizeNewsletterEmail(value);
  return email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
};

// Адреса лежат отдельно от аккаунтов: подписка — самостоятельное согласие, поэтому
// email из профиля нельзя автоматически превращать в получателя рассылки.
export async function subscribeToNewsletter(value, database = pool) {
  const email = normalizeNewsletterEmail(value);
  if (!validNewsletterEmail(email)) return { error:"invalid_email" };
  const result = await database.query(
    `INSERT INTO newsletter_subscribers (email, source, consent_version)
     VALUES ($1, 'footer', $2)
     ON CONFLICT ((lower(email))) DO UPDATE SET
       status='active', source=EXCLUDED.source, consent_version=EXCLUDED.consent_version,
       consented_at=now(), updated_at=now(), unsubscribed_at=NULL
     RETURNING email, status`,
    [email, NEWSLETTER_CONSENT_VERSION],
  );
  return { email:result.rows[0].email, status:result.rows[0].status };
}
