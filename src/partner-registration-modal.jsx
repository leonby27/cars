import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "./icons.jsx";
import { PhoneField } from "./phone-field.jsx";
import { completePhoneNumber } from "./phone-mask.js";
import { bindModalViewport } from "./modal-viewport.js";

export function PartnerRegistrationModal({ onClose, restoreFocusRef, CountrySelect }) {
  const titleId = useId();
  const backdrop = useRef(null);
  const dialog = useRef(null);
  const title = useRef(null);
  const fields = useRef(null);
  const pendingRef = useRef(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState({ country:"BY", national:"" });
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousFocus = restoreFocusRef?.current || document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    dialog.current.querySelector('input[name="name"]')?.focus();
    const unbind = bindModalViewport(backdrop.current, fields.current);
    const keyboard = (event) => {
      if (event.defaultPrevented && event.key !== "Escape") return;
      if (event.key === "Escape") {
        // The nested country select handles its own Escape before the modal.
        if (dialog.current.querySelector(".custom-select.open")) return;
        event.preventDefault();
        if (!pendingRef.current) onClose();
      }
      if (event.key !== "Tab") return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')]
        .filter((item) => item.getClientRects().length > 0);
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      unbind();
      document.removeEventListener("keydown", keyboard);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll:true });
    };
  }, [onClose, restoreFocusRef]);
  useEffect(() => { if (saved) title.current?.focus(); }, [saved]);

  const submit = async (event) => {
    event.preventDefault();
    if (pendingRef.current) return;
    const number = completePhoneNumber(phone);
    if (!name.trim() || !number) { setError("Проверьте имя и номер телефона."); return; }
    pendingRef.current = true; setPending(true); setError("");
    try {
      const response = await fetch("/api/partner/registration-requests", {
        method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json" },
        body:JSON.stringify({ name:name.trim(), phone:`+${number}` }),
      });
      if (!response.ok) throw new Error(response.status === 429 ? "Слишком много попыток. Попробуйте позже." : response.status === 400 ? "Проверьте имя и номер телефона." : "Не удалось отправить заявку. Попробуйте ещё раз.");
      setSaved(true);
    } catch (error) { setError(error instanceof TypeError ? "Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз." : error.message); }
    finally { pendingRef.current = false; setPending(false); }
  };

  return createPortal(<div ref={backdrop} className="modal-backdrop auth-modal-backdrop availability-lead-backdrop partner-registration-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pendingRef.current) onClose(); }}>
    <section ref={dialog} className="auth-card auth-modal availability-lead-modal partner-registration-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={pending}>
      <button className="modal-close" type="button" aria-label="Закрыть" disabled={pending} onClick={onClose}><X size={19} weight="bold" aria-hidden="true" /></button>
      <div className="auth-modal-heading"><h1 ref={title} id={titleId} tabIndex={-1}>{saved ? "Заявка отправлена" : "Регистрация партнёра"}</h1></div>
      {saved ? <div ref={fields} className="availability-lead-fields"><p className="availability-lead-note" role="status">Мы свяжемся с вами по указанному телефону.</p><div className="availability-lead-footer"><button className="primary auth-submit availability-lead-submit" type="button" onClick={onClose}>Готово</button></div></div> : <form ref={fields} className="availability-lead-fields" onSubmit={submit}>
        <p className="availability-lead-note">Оставьте заявку на регистрацию в партнёрской программе.</p>
        <fieldset disabled={pending}><label className="auth-field"><span>Имя</span><input name="name" autoComplete="name" placeholder="Имя" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /></label><PhoneField value={phone} onChange={setPhone} CountrySelect={CountrySelect} /></fieldset>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <div className="availability-lead-footer"><button className="primary auth-submit availability-lead-submit" type="submit" disabled={pending}>{pending ? "Отправляем…" : "Отправить заявку"}</button></div>
      </form>}
    </section>
  </div>, document.body);
}
