import pg from "pg";

try { process.loadEnvFile?.(); } catch {}

export const DATABASE_URL = process.env.DATABASE_URL || "postgres://chinacar:chinacar@127.0.0.1:54329/chinacar";
export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: Number(process.env.DB_POOL_SIZE || (process.env.VERCEL ? 3 : 12)) });

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
