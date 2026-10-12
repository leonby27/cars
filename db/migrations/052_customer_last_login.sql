ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Only retained sessions provide evidence of historical sign-ins. Do not infer
-- a sign-in from account creation/profile updates or client analytics events.
UPDATE customer_accounts a
   SET last_login_at = GREATEST(a.last_login_at, s.last_login_at)
  FROM (
    SELECT customer_id, max(created_at) AS last_login_at
      FROM customer_sessions GROUP BY customer_id
  ) s
 WHERE a.id = s.customer_id;
