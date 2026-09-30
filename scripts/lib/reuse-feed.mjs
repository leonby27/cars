import { readFileSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

// Only UI-only deploys opt in. A missing/old feed falls back to normal generation.
export function reuseFeed(source, target, { now = Date.now(), maxAge = 24 * 3600_000 } = {}) {
  try {
    if (now - statSync(source).mtimeMs > maxAge) return false;
    const raw = readFileSync(source);
    if (!raw.length) return false;
    mkdirSync(dirname(target), { recursive:true });
    copyFileSync(source, target);
    for (const [suffix, unpack] of [[".br", brotliDecompressSync], [".gz", gunzipSync]]) {
      try {
        if (unpack(readFileSync(source + suffix)).equals(raw)) copyFileSync(source + suffix, target + suffix);
      } catch { /* The ordinary compression step supplies any missing copy. */ }
    }
    return true;
  } catch { return false; }
}
