// A scroll film is an optional enhancement. Once the visitor starts reading,
// keep the static layout for this visit instead of extending the page beneath them.
export function prepareServiceVideo({ video, poster, source, onReady, win = window, timeoutMs = 5000 }) {
  const controller = new AbortController();
  let disposed = false;
  let ready = false;
  let objectUrl;
  let timeout;

  const removePendingListeners = () => {
    win.clearTimeout(timeout);
    win.removeEventListener("scroll", onScroll);
    video.removeEventListener("loadeddata", onLoaded);
  };
  const cancel = () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    removePendingListeners();
    video.removeEventListener("error", cancel);
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (objectUrl) win.URL.revokeObjectURL(objectUrl);
  };
  const onScroll = () => {
    if (!ready && win.scrollY > 8) cancel();
  };
  const onLoaded = () => {
    if (disposed || win.scrollY > 8) return cancel();
    ready = true;
    removePendingListeners();
    onReady();
  };

  if (win.scrollY > 8 || win.navigator.connection?.saveData ||
      win.matchMedia("(prefers-reduced-motion: reduce)").matches) return cancel;

  win.addEventListener("scroll", onScroll, { passive: true });
  video.addEventListener("loadeddata", onLoaded);
  video.addEventListener("error", cancel);
  timeout = win.setTimeout(cancel, timeoutMs);

  (async () => {
    try {
      // Give the tiny visible poster priority over the optional media download.
      await poster?.decode?.().catch(() => {});
      if (disposed) return;
      const response = await win.fetch(source, { signal: controller.signal });
      if (!response.ok) throw new Error("Video unavailable");
      const blob = await response.blob();
      if (disposed) return;
      if (win.scrollY > 8) return cancel();
      // Full buffering prevents scroll seeks from waiting on missing byte ranges.
      objectUrl = win.URL.createObjectURL(blob);
      video.src = objectUrl;
      video.load();
    } catch {
      cancel();
    }
  })();

  return cancel;
}
