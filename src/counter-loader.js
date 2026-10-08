// Queued page views are created in HTML immediately. Download the counters only
// after the app is interactive, one at a time, yielding to rendering between them.
export function createCounterQueue({ idle, allowed = () => true, onError = () => {} }) {
  const pending = [];
  let ready = false;
  let busy = false;
  function pump() {
    if (!ready || busy || !pending.length || !allowed()) return;
    busy = true;
    idle(async () => {
      try {
        if (allowed()) await pending.shift()?.();
      } catch (error) { onError(error); }
      finally { busy = false; pump(); }
    });
  }
  return {
    push(start) { pending.push(start); pump(); },
    ready() { ready = true; pump(); },
    flush() {
      if (!allowed()) return;
      for (const start of pending.splice(0)) Promise.resolve().then(start).catch(onError);
    },
  };
}

let queue;
export function countersAfterAppReady() {
  // Preserve an installed queue across development module updates.
  if (!queue && typeof window.__counterQueue?.ready === "function") queue = window.__counterQueue;
  if (!queue) {
    queue = createCounterQueue({
      idle: (run) => window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 2000 }) : window.setTimeout(run, 0),
      allowed: () => !/^\/(?:analytics|partner)(?:\/|$)/.test(window.location.pathname),
    });
    const waiting = window.__counterQueue || [];
    window.__counterQueue = queue;
    for (const start of waiting) queue.push(start);
    window.addEventListener("pagehide", () => queue.flush(), { once: true });
  }
  // Images lower down the page must not hold up analytics indefinitely.
  queue.ready();
}
