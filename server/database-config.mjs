const LOCAL_DATABASE_URL = "postgres://chinacar:chinacar@127.0.0.1:54329/chinacar";

// Pure configuration: no pool, credentials in logs, connection or migration.
export function databaseConfig(site, env = {}) {
  if (site.id === "abdrive") {
    const catalogUrl=env.CATALOG_DATABASE_URL;
    const siteUrl=env.SITE_DATABASE_URL;
    if (!catalogUrl || !siteUrl) throw new Error("RU requires explicit CATALOG_DATABASE_URL and SITE_DATABASE_URL; refusing the legacy database");
    const catalog=new URL(catalogUrl), customer=new URL(siteUrl);
    if (!['postgres:','postgresql:'].includes(catalog.protocol) || !['postgres:','postgresql:'].includes(customer.protocol)) throw new Error("PostgreSQL connections required");
    if (catalog.pathname === customer.pathname) throw new Error("RU customer database must have a different database name from the catalog");
    return Object.freeze({catalogUrl,siteUrl});
  }
  if (site.id !== "abcars") throw new Error("Unknown database site");
  const legacy = env.DATABASE_URL || LOCAL_DATABASE_URL;
  const catalogUrl = env.CATALOG_DATABASE_URL || legacy;
  const siteUrl = env.SITE_DATABASE_URL || legacy;
  // Orders and several analytics queries still join catalog and customer tables.
  // Do not silently enable physical separation before those readers are migrated.
  if (catalogUrl !== legacy || siteUrl !== legacy) {
    throw new Error("Database separation requires migrating legacy cross-database readers first");
  }
  return Object.freeze({ catalogUrl, siteUrl });
}
