-- Подписка не зависит от регистрации: в список попадают только адреса, которые
-- посетитель сам отправил через форму рассылки.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  source TEXT NOT NULL DEFAULT 'footer',
  consent_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_idx
  ON newsletter_subscribers ((lower(email)));

CREATE INDEX IF NOT EXISTS newsletter_subscribers_status_created_idx
  ON newsletter_subscribers (status, created_at DESC);
