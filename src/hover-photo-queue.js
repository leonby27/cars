// Общая очередь для всех карточек: четыре загрузки, а не четыре на каждую машину.
export function createHoverPhotoQueue({ createImage = () => new Image(), concurrency = 4 } = {}) {
  const entries = new Map();
  const queue = [];
  let running = 0;
  const drain = () => {
    while (running < concurrency && queue.length) {
      const entry = queue.shift();
      if (!entry.signals.some(signal => !signal?.aborted)) {
        entries.delete(entry.href);
        entry.resolve(false);
        continue;
      }
      running++;
      entry.state = "loading";
      const image = createImage();
      entry.image = image;
      image.decoding = "async";
      image.fetchPriority = entry.urgent ? "high" : "low";
      let finished = false;
      const finish = ok => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        image.onload = image.onerror = null;
        running--;
        entry.state = "ready";
        if (!ok) entries.delete(entry.href);
        entry.resolve(ok);
        for (const [href, cached] of entries) {
          if (entries.size <= 128) break;
          if (cached.state === "ready") entries.delete(href);
        }
        drain();
      };
      const timer = setTimeout(() => { image.src = ""; finish(false); }, 30_000);
      image.onload = async () => {
        try { await image.decode?.(); } catch { /* Уже загруженное изображение пригодно для показа. */ }
        finish(true);
      };
      image.onerror = () => finish(false);
      image.src = entry.href;
    }
  };
  return (href, { signal, urgent = false } = {}) => {
    if (!href || signal?.aborted) return Promise.resolve(false);
    let entry = entries.get(href);
    if (entry) {
      if (entry.state === "ready") return entry.promise;
      entry.signals.push(signal);
      if (urgent) {
        entry.urgent = true;
        if (entry.image) entry.image.fetchPriority = "high";
        const index = queue.indexOf(entry);
        if (index >= 0) { queue.splice(index, 1); queue.unshift(entry); }
      }
      return entry.promise;
    }
    entry = { href, signals: [signal], urgent, state: "queued" };
    entry.promise = new Promise(resolve => { entry.resolve = resolve; });
    entries.set(href, entry);
    if (urgent) queue.unshift(entry); else queue.push(entry);
    drain();
    return entry.promise;
  };
}

export const prepareHoverPhoto = createHoverPhotoQueue();
