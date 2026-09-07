// Общая очередь для всех карточек: четыре загрузки, а не четыре на каждую машину.
export function createHoverPhotoQueue({ createImage = () => new Image(), concurrency = 4, reserveUrgent = 0 } = {}) {
  const entries = new Map();
  const queue = [];
  let running = 0;
  const drain = () => {
    while (running < concurrency && queue.length) {
      queue.sort((a, b) => b.priority - a.priority);
      if (!queue[0].urgent && running >= Math.max(1, concurrency - reserveUrgent)) return;
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
  return (href, { signal, urgent = false, priority = 0 } = {}) => {
    if (!href || signal?.aborted) return Promise.resolve(false);
    let entry = entries.get(href);
    if (entry) {
      if (entry.state === "ready") return entry.promise;
      entry.signals.push(signal);
      entry.priority = Math.max(entry.priority, urgent ? 2 : priority);
      if (urgent) {
        entry.urgent = true;
        if (entry.image) entry.image.fetchPriority = "high";
        const index = queue.indexOf(entry);
        if (index >= 0) { queue.splice(index, 1); queue.unshift(entry); }
      }
      drain();
      return entry.promise;
    }
    entry = { href, signals: [signal], urgent, priority: urgent ? 2 : priority, state: "queued" };
    entry.promise = new Promise(resolve => { entry.resolve = resolve; });
    entries.set(href, entry);
    if (urgent) queue.unshift(entry); else queue.push(entry);
    drain();
    return entry.promise;
  };
}

export const prepareHoverPhoto = createHoverPhotoQueue({ reserveUrgent: 1 });

// Дальние карточки готовим заранее, видимые поднимаем выше в общей очереди.
// После ухода карточки за границу подготовки её незапущенные запросы отменяются.
export function observeHoverPhotos(frame, urls, {
  ahead = 300, Observer = IntersectionObserver, prepare = prepareHoverPhoto,
} = {}) {
  let pending;
  const enqueue = priority => {
    if (!pending || pending.signal.aborted) pending = new AbortController();
    for (const href of urls) prepare(href, { signal: pending.signal, priority });
  };
  const nearby = new Observer(([entry]) => {
    if (entry.isIntersecting) enqueue(0);
    else { pending?.abort(); pending = undefined; }
  }, { rootMargin: `${ahead}px 0px` });
  const visible = new Observer(([entry]) => {
    if (entry.isIntersecting) enqueue(1);
  }, { rootMargin: "0px" });
  nearby.observe(frame);
  visible.observe(frame);
  return () => { nearby.disconnect(); visible.disconnect(); pending?.abort(); };
}
