/* Only a marked catalog-budget response opens verification. No form interception. */
(() => {
  if (window.__catalogGuardInstalled || !window.fetch) return;
  window.__catalogGuardInstalled = true;
  const originalFetch = window.fetch.bind(window);
  let pending = null;
  const aborted = () => new DOMException('The request was aborted.', 'AbortError');
  function createVerification() {
    const state = { waiting:0, promise:null, finish:null };
    state.promise = new Promise(resolve => {
      const dialog = document.createElement('dialog');
      const label = document.createElement('span');
      label.textContent = 'Проверка для продолжения просмотра';
      label.id = 'catalog-guard-title';
      dialog.setAttribute('aria-labelledby', label.id);
      dialog.style.cssText = 'padding:0;border:1px solid #ccc;border-radius:16px;width:min(480px,94vw);max-height:90vh;background:white;color:#27303b;z-index:2147483647';
      const top = document.createElement('div');
      top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;font:14px system-ui';
      const close = document.createElement('button');
      close.type = 'button'; close.textContent = 'Закрыть';
      close.style.cssText = 'font:inherit;cursor:pointer;background:white;color:#27303b;border:1px solid #ccc;padding:8px;border-radius:8px';
      const frame = document.createElement('iframe');
      frame.title = 'Подтвердить продолжение просмотра';
      frame.src = '/_catalog-check';
      frame.style.cssText = 'border:0;width:100%;height:min(570px,73vh)';
      top.append(label, close); dialog.append(top, frame);
      document.body.append(dialog);
      const previousFocus = document.activeElement;
      let done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        window.removeEventListener('message', message);
        dialog.remove(); previousFocus?.focus?.();
        if (pending === state) pending = null;
        resolve(ok);
      }
      state.finish = finish;
      function message(event) {
        if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'catalog-verified') finish(true);
      }
      window.addEventListener('message', message);
      close.addEventListener('click', () => finish(false));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      if (dialog.showModal) dialog.showModal();
      else { dialog.setAttribute('open',''); dialog.style.cssText += ';position:fixed;inset:4vh auto auto 3vw'; }
    });
    return state;
  }
  function verify(signal) {
    if (signal?.aborted) return Promise.reject(aborted());
    if (!pending) pending = createVerification();
    const state = pending;
    state.waiting++;
    return new Promise((resolve, reject) => {
      let done = false;
      function release() {
        if (done) return false;
        done = true; state.waiting--;
        signal?.removeEventListener('abort', cancel);
        return true;
      }
      function cancel() {
        if (!release()) return;
        reject(aborted());
        if (!state.waiting) state.finish(false);
      }
      signal?.addEventListener('abort', cancel, { once:true });
      state.promise.then(ok => { if (release()) resolve(ok); });
      if (signal?.aborted) cancel();
    });
  }
  window.fetch = async function(input, options) {
    const response = await originalFetch(input, options);
    const method = String(options?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'GET' || response.status !== 429 || response.headers.get('X-Catalog-Verification') !== '/_catalog-check') return response;
    // Keep existing page/form state; cancelled or aborted requests are not retried.
    const signal = options?.signal || (input instanceof Request ? input.signal : null);
    if (await verify(signal)) {
      if (signal?.aborted) throw aborted();
      return originalFetch(input, options);
    }
    const headers = new Headers(response.headers);
    headers.delete("X-Catalog-Verification");
    return new Response(response.body, {status:403, statusText:"Verification cancelled", headers});
  };
})();
