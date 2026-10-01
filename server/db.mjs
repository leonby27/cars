import "../config/load-env.mjs";
import pg from "pg";
import { SITE } from "../src/site-profile.js";
import { resolveSiteProfile } from "../config/sites/index.mjs";
import { databaseConfig } from "./database-config.mjs";

if (SITE !== resolveSiteProfile(process.env)) throw new Error("Site configuration changed after module initialization");
const connections = databaseConfig(SITE, process.env);
export const DATABASE_URL = connections.catalogUrl;
export const catalogPool = new pg.Pool({ connectionString: DATABASE_URL, max: Number(process.env.DB_POOL_SIZE || (SITE.market === "RU" ? 3 : process.env.VERCEL ? 3 : 12)), ...(SITE.market === "RU" ? { options: "-c default_transaction_read_only=on -c statement_timeout=5000" } : {}) });
// BY keeps its historical pool; RU uses an explicitly separate private database.
export const sitePool = SITE.market === "BY" ? catalogPool : new pg.Pool({ connectionString: connections.siteUrl, max: 3 });
export const pool = catalogPool;

export const isDatabaseUnavailable = (error) => ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P01", "57P02", "57P03"].includes(error?.code || error?.cause?.code);

pool.on("error", (error) => console.error("PostgreSQL pool error", error));

async function transaction(database, callback) {
  const client = await database.connect();
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

export const withTransaction = (callback) => transaction(catalogPool, callback);
export const withSiteTransaction = (callback) => transaction(sitePool, callback);
export const closePools = () => Promise.all([...new Set([catalogPool, sitePool])].map(database => database.end()));
if (sitePool !== catalogPool) sitePool.on("error", (error) => console.error("Site PostgreSQL pool error", error));
