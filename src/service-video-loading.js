// Keep the film's scroll space reserved while its bytes load, so it can appear
// without moving the rest of the page even if the visitor starts scrolling.
export function prepareServiceVideo({ video, poster, source, onReady, onProgress, onUnavailable, win = window }) {
  const controller = new AbortController();
  let disposed = false;
  let objectUrl;

  const removePendingListeners = () => {
    video.removeEventListener("loadeddata", onLoaded);
    video.removeEventListener("error", fail);
  };
  const cancel = () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    removePendingListeners();
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (objectUrl) win.URL.revokeObjectURL(objectUrl);
  };
  const fail = () => {
    if (disposed) return;
    cancel();
    onUnavailable?.();
  };
  const onLoaded = () => {
    if (disposed) return;
    removePendingListeners();
    onProgress?.(1);
    onReady();
  };

  if (win.navigator.connection?.saveData ||
      win.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    fail();
    return cancel;
  }

  video.addEventListener("loadeddata", onLoaded);
  video.addEventListener("error", fail);

  (async () => {
    try {
      // Give the tiny visible poster priority over the optional media download.
      await poster?.decode?.().catch(() => {});
      if (disposed) return;
      const response = await win.fetch(source, { signal: controller.signal });
      if (!response.ok) throw new Error("Video unavailable");
      const length = Number(response.headers?.get("content-length"));
      const reader = length > 0 ? response.body?.getReader?.() : null;
      let blob;
      if (reader) {
        const chunks = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (disposed) return;
          chunks.push(value);
          received += value.byteLength;
          onProgress?.(Math.min(0.96, (received / length) * 0.96));
        }
        blob = new Blob(chunks, { type: response.headers?.get("content-type") || "video/mp4" });
      } else {
        blob = await response.blob();
      }
      if (disposed) return;
      // Full buffering prevents scroll seeks from waiting on missing byte ranges.
      objectUrl = win.URL.createObjectURL(blob);
      video.src = objectUrl;
      video.load();
    } catch {
      fail();
    }
  })();

  return cancel;
}
