// Local PostgreSQL verification; all fixtures and schema changes are rolled back.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pool } from "../server/db.mjs";
import { authenticateAccount, createSession, deleteSession, hashPassword } from "../server/auth.mjs";
import { getAnalyticsDashboard } from "../server/analytics.mjs";

const client = await pool.connect();
const originalQuery = pool.query;
let queued = Promise.resolve();
const db = { query:(...args) => {
  const result = queued.then(() => client.query(...args));
  queued = result.catch(() => {});
  return result;
} };
try {
  await client.query("BEGIN");
  await client.query("CREATE TEMP TABLE customer_accounts (LIKE public.customer_accounts INCLUDING DEFAULTS) ON COMMIT DROP");
  await client.query("CREATE TEMP TABLE customer_sessions (LIKE public.customer_sessions INCLUDING DEFAULTS) ON COMMIT DROP");
  const credentials = await hashPassword("integration-password");
  await client.query(`INSERT INTO customer_accounts (id,name,phone,password_salt,password_hash,staff)
    VALUES ('login-test','Test','375290000001',$1,$2,false),
           ('unknown-test','Unknown','375290000002',$1,$2,false)`, [credentials.salt, credentials.hash]);
  await client.query(`INSERT INTO customer_sessions (token_hash,customer_id,expires_at,created_at)
    VALUES ('old','login-test',now() - interval '1 day',now() - interval '2 days'),
           ('new','login-test',now() + interval '1 day',now() - interval '1 day')`);
  await client.query(await readFile(new URL("../db/migrations/052_customer_last_login.sql", import.meta.url), "utf8"));
  const before = await client.query("SELECT id,last_login_at FROM customer_accounts ORDER BY id");
  assert.ok(before.rows[0].last_login_at);
  assert.equal(before.rows[1].last_login_at, null, "missing historical sessions stay unknown");

  pool.query = db.query;
  assert.equal(await authenticateAccount({ phone:"375290000001", password:"wrong" }), null);
  assert.deepEqual((await db.query("SELECT id,last_login_at FROM customer_accounts ORDER BY id")).rows, before.rows);
  const token = await createSession("login-test");
  const signedIn = (await db.query("SELECT last_login_at FROM customer_accounts WHERE id='login-test'")).rows[0].last_login_at;
  assert.ok(signedIn > before.rows[0].last_login_at, "new session advances the saved sign-in date");
  await deleteSession({ headers:{ cookie:`navostok_session=${token}` } });
  assert.equal((await db.query("SELECT last_login_at FROM customer_accounts WHERE id='login-test'")).rows[0].last_login_at.getTime(), signedIn.getTime(), "logout retains last sign-in");

  const dashboard = await getAnalyticsDashboard("today", { db });
  assert.equal(dashboard.registrations.find(row => row.phone === "+375290000001").lastLoginAt.getTime(), signedIn.getTime());
  assert.equal(dashboard.registrations.find(row => row.phone === "+375290000002").lastLoginAt, null);
  console.log("Last-login migration, failed sign-in, successful session, logout and analytics response verified.");
} finally {
  pool.query = originalQuery;
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}
