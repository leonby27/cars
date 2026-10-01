import { ABCARS_SITE } from "./abcars.mjs";
import { ABDRIVE_SITE } from "./abdrive.mjs";

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const SITES = freeze({ abcars: ABCARS_SITE, abdrive: ABDRIVE_SITE });

export function getSiteProfile(id) {
  if (!Object.hasOwn(SITES, id)) throw new Error(`Unknown SITE_ID: ${String(id)}`);
  return SITES[id];
}

// Only process/build configuration chooses the site, never request headers or query input.
export function resolveSiteProfile(env = {}) {
  const serverId = String(env.SITE_ID || "").trim();
  const clientId = String(env.VITE_SITE_ID || "").trim();
  if (serverId && clientId && serverId !== clientId) {
    throw new Error("SITE_ID and VITE_SITE_ID must match");
  }
  const site = getSiteProfile(serverId || clientId || "abcars");
  if (env.SITE_URL) {
    const hostname = new URL(env.SITE_URL).hostname.replace(/^www\./, "");
    const owner = Object.values(SITES).find((candidate) => new URL(candidate.origin).hostname === hostname);
    if (owner && owner !== site) throw new Error("SITE_URL belongs to another site profile");
  }
  return site;
}

export function assertSiteProfile(site) {
  // Validate identity only. Feature completeness is not a global launch gate.
  const registered = getSiteProfile(site.id);
  if (site !== registered) {
    throw new Error(`Site ${site.id} must use its registered profile`);
  }
  return site;
}

export const hasSiteService = (site, service) => site.services.includes(service);

export function contentForSite(site, editions) {
  return Object.hasOwn(editions, site.contentEdition) ? editions[site.contentEdition] : null;
}
