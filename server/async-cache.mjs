// One refresh per key; keep the last successful value available during refresh.
export function createAsyncCache(load, { ttl = 600_000, initial, initialAt = 0, now = Date.now, onError = console.error } = {}) {
  let value = initial;
  let at = initialAt;
  let pending;
  let retryAt = 0;
  return async function get() {
    if (value !== undefined && (now() - at < ttl || now() < retryAt)) return value;
    if (!pending) {
      pending = Promise.resolve().then(load).then((next) => {
        value = next;
        at = now();
        retryAt = 0;
        return value;
      }).catch((error) => {
        retryAt = now() + 30_000;
        throw error;
      }).finally(() => { pending = undefined; });
      if (value !== undefined) pending.catch(onError);
    }
    return value === undefined ? pending : value;
  };
}
