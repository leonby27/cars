import { getSiteProfile, resolveSiteProfile, assertSiteProfile } from "../config/sites/index.mjs";

// Vite injects one public identifier in client and SSR builds. Node resolves the
// same registry from its process environment; secrets never enter this module.
export const SITE = typeof __SITE_ID__ !== "undefined"
  ? getSiteProfile(__SITE_ID__)
  : resolveSiteProfile(typeof process !== "undefined" ? process.env : {});

assertSiteProfile(SITE);
