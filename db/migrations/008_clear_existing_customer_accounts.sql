-- One-time reset requested during the account prototype phase.
-- Sessions are removed through the ON DELETE CASCADE relationship.
TRUNCATE TABLE customer_accounts CASCADE;
