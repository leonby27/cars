import "../config/load-env.mjs";
import pg from "pg";
import { SITE } from "../src/site-profile.js";
import { resolveSiteProfile } from "../config/sites/index.mjs";
import { databaseConfig } from "./database-config.mjs";

if (SITE !== resolveSiteProfile(process.env)) throw new Error("Site configuration changed after module initialization");
const connections = databaseConfig(SITE, process.env);
export const DATABASE_URL = connections.catalogUrl;
export const catalogPool = new pg.Pool({ connectionString: DATABASE_URL, max: Number(process.env.DB_POOL_SIZE || (process.env.VERCEL ? 3 : 12)) });
// Compatibility phase: one actual BY pool, two explicit ownership boundaries.
export const sitePool = catalogPool;
export const pool = catalogPool;

export const isDatabaseUnavailable = (error) => ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P01", "57P02", "57P03"].includes(error?.code || error?.cause?.code);

pool.on("error", (error) => console.error("PostgreSQL pool error", error));

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export const withSiteTransaction = withTransaction;
