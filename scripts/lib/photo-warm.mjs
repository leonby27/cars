// План запросов совпадает с размерами App.jsx. Сначала обложки, потом галерея.
export function photoWarmUrls(car, { site, widths = ["original", 900, 600], previewCount = 1, galleryCount = 1 }) {
  const sources = [...new Set([car.image, ...(car.images || [])].filter(Boolean))];
  const urls = new Set();
  for (const [index, source] of sources.slice(0, Math.max(previewCount, galleryCount)).entries()) {
    let path;
    try {
      const url = new URL(source);
      if (!/^https?:$/.test(url.protocol) || !/(^|\.)autoimg\.cn$/.test(url.hostname)) continue;
      path = url.pathname;
      if (!/^\/escimg\/[A-Za-z0-9/_.-]+\.webp$/.test(path)) continue;
    } catch { continue; }
    const sizes = index === 0 ? [...widths] : [];
    if (index > 0 && index < previewCount) sizes.push(600, 900, 240);
    if (index > 0 && index < galleryCount) sizes.push("original");
    if (index === 0 && previewCount > 1) sizes.push(240);
    for (const width of sizes) {
      const resized = width === "original"
        ? path.replace(/\/\d+x\d+_c\d+_(?=[^/]*$)/, "/")
        : path.replace(/\/\d+x\d+_(?=[^/]*$)/, `/${width}x0_`);
      urls.add(`${site}/photo${resized}`);
    }
  }
  return [...urls];
}

// Таймаут охватывает и заголовки, и полное тело: зависший кадр не занимает
// рабочий поток навсегда. Ошибку/HTML нельзя считать подготовленной фотографией.
export async function warmPhoto(url, { fetcher = fetch, timeoutMs = 40_000 } = {}) {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "abcars-warm/1.0" },
  });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
    await response.body?.cancel();
    throw new Error(`Photo HTTP ${response.status}`);
  }
  const body = await response.arrayBuffer();
  if (!body.byteLength) throw new Error("Empty photo");
  return { bytes: body.byteLength, hit: response.headers.get("x-photo-cache") === "HIT" };
}
