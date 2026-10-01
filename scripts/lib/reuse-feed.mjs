import { readFileSync, statSync, mkdirSync, copyFileSync, utimesSync } from "node:fs";
import { dirname } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

// Only UI-only deploys opt in. A missing/old feed falls back to normal generation.
export function reuseFeed(source, target, { now = Date.now(), maxAge = 24 * 3600_000, key } = {}) {
  try {
    const stat = statSync(source);
    if (Math.floor(stat.mtimeMs) > now || now - stat.mtimeMs >= maxAge) return false;
    if (key && JSON.parse(readFileSync(source + '.meta.json', 'utf8')).key !== key) return false;
    const raw = readFileSync(source);
    if (!raw.length) return false;
    mkdirSync(dirname(target), { recursive:true });
    copyFileSync(source, target);
    // Copying must never renew freshness across a chain of UI deployments.
    utimesSync(target, stat.atime, stat.mtime);
    if (key) copyFileSync(source + '.meta.json', target + '.meta.json');
    for (const [suffix, unpack] of [[".br", brotliDecompressSync], [".gz", gunzipSync]]) {
      try {
        if (unpack(readFileSync(source + suffix)).equals(raw)) copyFileSync(source + suffix, target + suffix);
      } catch { /* The ordinary compression step supplies any missing copy. */ }
    }
    return true;
  } catch { return false; }
}
