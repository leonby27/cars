-- Свои собственные аккаунты не должны выглядеть интересом клиентов: регистрация,
-- избранное и пробные заявки сотрудников в разделе аналитики не считаются.
-- Пометка ставится вручную (scripts/db-staff.mjs), новые аккаунты обычные.
ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS staff BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS customer_accounts_staff_idx ON customer_accounts (staff) WHERE staff;
