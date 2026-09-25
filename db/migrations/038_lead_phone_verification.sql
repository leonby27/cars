-- Подтверждение номера в заявке с карточки (25.09.2026, разбор против IM4CAR).
-- Заявка сохраняется сразу, как и раньше; потом посетитель может подтвердить номер
-- через телеграм-бота (делится контактом — телеграм сам ручается за номер).
-- verify_token — одноразовый ключ ссылки на бота; verify_chat_id — чат, из которого
-- пришли по ссылке, чтобы сопоставить присланный контакт с заявкой.
ALTER TABLE order_drafts ADD COLUMN IF NOT EXISTS verify_token TEXT;
ALTER TABLE order_drafts ADD COLUMN IF NOT EXISTS verify_chat_id TEXT;
ALTER TABLE order_drafts ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
ALTER TABLE order_drafts ADD COLUMN IF NOT EXISTS phone_verified_via TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS order_drafts_verify_token_idx ON order_drafts(verify_token) WHERE verify_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_drafts_verify_chat_idx ON order_drafts(verify_chat_id) WHERE verify_chat_id IS NOT NULL;
