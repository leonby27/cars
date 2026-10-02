// Explicit boundary for customer-owned data. BY shares its historical pool until
// cross-table readers are migrated; RU must never inherit that pool by default.
export { sitePool as pool, withSiteTransaction as withTransaction } from "../db.mjs";
