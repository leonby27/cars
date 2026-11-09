// Bound both work in progress and requests waiting for a slot. A slot belongs
// to the running operation until it finishes, even if the client disconnects.
export function originCapacity(limit, maxWaiting = 0, waitMs = 0) {
  let active = 0;
  const waiting = new Set();
  function release() {
    const next = waiting.values().next().value;
    if (next) next(release);
    else active -= 1;
  }
  return {
    acquire() {
      if (active < limit) {
        active += 1;
        return release;
      }
      if (waiting.size >= maxWaiting) return null;
      return new Promise((resolve) => {
        function finish(slot) {
          clearTimeout(timeout);
          waiting.delete(finish);
          resolve(slot);
        }
        const timeout = setTimeout(() => finish(null), waitMs);
        waiting.add(finish);
      });
    },
  };
}

export const originBusyHeaders = { "retry-after": "2", "cache-control": "no-store" };
