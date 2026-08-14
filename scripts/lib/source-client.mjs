import { fetch, ProxyAgent } from "undici";

export class SourceBlockedError extends Error {
  constructor(message, status = 0) { super(message); this.name="SourceBlockedError"; this.code="source_blocked"; this.status=status; }
}

const proxyUrl = process.env.GUAZI_PROXY_URL;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
const blockedLocation = (value = "") => /captcha|verify|security/i.test(value);
const blockedBody = (value = "") => /Security Verification|访问过于频繁|验证码|captcha/i.test(value);

export async function fetchSourceText(url, { accept="text/plain,text/markdown,text/html;q=0.9,*/*;q=0.5", userAgent="ChinaCarBY-Importer/0.2", attempts=3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      let currentUrl = url;
      for (let redirect = 0; redirect < 4; redirect += 1) {
        const response = await fetch(currentUrl, {
          headers:{ accept, "accept-language":"zh-CN,zh;q=0.9,en;q=0.5", "user-agent":userAgent, ...(process.env.GUAZI_COOKIE ? { cookie:process.env.GUAZI_COOKIE } : {}) },
          redirect:"manual",
          dispatcher,
          signal:AbortSignal.timeout(20_000),
        });
        const location = response.headers.get("location");
        if (response.status >= 300 && response.status < 400 && location) {
          if (blockedLocation(location)) throw new SourceBlockedError(`Source redirected to verification (${response.status})`, response.status);
          currentUrl = new URL(location, currentUrl).href;
          continue;
        }
        if (response.status === 403 || response.status === 429) throw new SourceBlockedError(`Source rate-limited request (${response.status})`, response.status);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const text = await response.text();
        if (blockedBody(text)) throw new SourceBlockedError("Source returned a verification page", response.status);
        return { status:response.status, text, url:currentUrl };
      }
      throw new Error("Too many redirects");
    } catch (error) {
      lastError=error;
      if (error.code === "source_blocked") throw error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}
