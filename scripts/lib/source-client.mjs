import { fetch, ProxyAgent } from "undici";

try { process.loadEnvFile?.(); } catch {}

export class SourceBlockedError extends Error {
  constructor(message, status = 0) { super(message); this.name="SourceBlockedError"; this.code="source_blocked"; this.status=status; }
}

const blockedLocation = (value = "") => /captcha|verify|security/i.test(value);
const blockedBody = (value = "") => /Security Verification|访问过于频繁|验证码|captcha/i.test(value);

function configuredChannels() {
  const channels = [];
  try {
    const parsed = JSON.parse(process.env.GUAZI_CHANNELS_JSON || "[]");
    for (const [index, item] of parsed.entries()) {
      if (!item?.proxyUrl) continue;
      channels.push({ name:item.name || `proxy-${index + 1}`, dispatcher:new ProxyAgent(item.proxyUrl), cookie:item.cookie || process.env.GUAZI_COOKIE });
    }
  } catch { throw new Error("GUAZI_CHANNELS_JSON must be a JSON array"); }
  const legacyUrls = [process.env.GUAZI_PROXY_URL, ...(process.env.GUAZI_PROXY_URLS || "").split(/[\n,]+/)].filter(Boolean);
  for (const [index, proxyUrl] of legacyUrls.entries()) channels.push({ name:`proxy-${channels.length + index + 1}`, dispatcher:new ProxyAgent(proxyUrl.trim()), cookie:process.env.GUAZI_COOKIE });
  if (process.env.GUAZI_ALLOW_DIRECT !== "false" || !channels.length) channels.push({ name:"direct", dispatcher:undefined, cookie:process.env.GUAZI_COOKIE });
  return channels;
}

const channels = configuredChannels();
export const sourceChannelNames = channels.map((channel) => channel.name);
const stickyIndex = (url) => {
  const key = url.replace(/\.(?:md|html)(?:\?.*)?$/, "");
  let hash=0; for (const char of key) hash=((hash * 31) + char.charCodeAt(0)) >>> 0;
  return hash % channels.length;
};

async function requestThrough(channel, url, { accept, userAgent }) {
  let currentUrl=url;
  for (let redirect=0; redirect<4; redirect+=1) {
    const response = await fetch(currentUrl, {
      headers:{ accept, "accept-language":"zh-CN,zh;q=0.9,en;q=0.5", "user-agent":userAgent, ...(channel.cookie ? { cookie:channel.cookie } : {}) },
      redirect:"manual",
      dispatcher:channel.dispatcher,
      signal:AbortSignal.timeout(20_000),
    });
    const location=response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      if (blockedLocation(location)) throw new SourceBlockedError(`${channel.name}: source redirected to verification (${response.status})`, response.status);
      currentUrl=new URL(location,currentUrl).href;
      continue;
    }
    if (response.status === 403 || response.status === 429) throw new SourceBlockedError(`${channel.name}: source rate-limited request (${response.status})`, response.status);
    if (!response.ok) throw new Error(`${channel.name}: ${response.status} ${response.statusText}`);
    const text=await response.text();
    if (blockedBody(text)) throw new SourceBlockedError(`${channel.name}: source returned a verification page`, response.status);
    return { status:response.status, text, url:currentUrl, channel:channel.name };
  }
  throw new Error(`${channel.name}: too many redirects`);
}

export async function fetchSourceText(url, { accept="text/plain,text/markdown,text/html;q=0.9,*/*;q=0.5", userAgent="NaVostokBY-Importer/0.2", attempts=3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let blocked=0;
    const start=stickyIndex(url);
    for (let offset=0; offset<channels.length; offset+=1) {
      const channel=channels[(start + offset) % channels.length];
      try { return await requestThrough(channel,url,{ accept,userAgent }); }
      catch (error) { lastError=error; if (error.code === "source_blocked") blocked+=1; }
    }
    if (blocked === channels.length) throw new SourceBlockedError(`All ${channels.length} source channels require verification`, lastError?.status);
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw lastError;
}
