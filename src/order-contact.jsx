import { useEffect, useId, useState } from "react";
import { X } from "./icons.jsx";

const contactOptions = [
  ["phone", "Телефон"],
  ["viber", "Viber"],
  ["telegram", "Telegram"],
];

const formatPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `+${digits}` : "+375";
};

const initialMethods = (order, user) => {
  if (Array.isArray(order.contactMethods) && order.contactMethods.length) return order.contactMethods;
  return user.preferredContact === "telegram" ? ["telegram"] : ["phone"];
};

export function OrderContactModal({ order, user, saving, onSubmit, onClose }) {
  const titleId = useId();
  const [values, setValues] = useState(() => ({
    name:order.contactName || user.name || "",
    phone:order.contactPhone || formatPhone(user.phone),
    methods:initialMethods(order, user),
    consent:true,
  }));
  const [error, setError] = useState("");

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [onClose, saving]);

  const update = (field) => (event) => {
    setError("");
    setValues((current) => ({ ...current, [field]:event.target.value }));
  };
  const updatePhone = (event) => {
    const source = event.target.value;
    const prefix = source.trimStart().startsWith("+") ? "+" : "";
    setError("");
    setValues((current) => ({ ...current, phone:`${prefix}${source.replace(/\D/g, "")}` }));
  };
  const toggleMethod = (method) => {
    setError("");
    setValues((current) => ({
      ...current,
      methods:current.methods.includes(method) ? current.methods.filter((item) => item !== method) : [...current.methods,method],
    }));
  };
  const submit = async (event) => {
    event.preventDefault();
    const name = values.name.trim();
    const digits = values.phone.replace(/\D/g, "");
    if (name.length < 2) return setError("Укажите имя — минимум 2 символа.");
    if (digits.length < 11 || digits.length > 15) return setError("Проверьте номер телефона.");
    if (!values.methods.length) return setError("Выберите хотя бы один способ связи.");
    if (!values.consent) return setError("Подтвердите согласие на обработку контактных данных.");
    const didSubmit = await onSubmit({ contactName:name, contactPhone:`+${digits}`, contactMethods:values.methods, consent:true });
    if (!didSubmit) setError("Не удалось отправить запрос. Попробуйте ещё раз.");
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="lead-modal order-contact-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button className="modal-close" type="button" onClick={onClose} disabled={saving} aria-label="Закрыть"><X size={19} /></button>
        <span>Проверка объявления</span>
        <h2 id={titleId}>Куда отправить ответ?</h2>
        <p>Проверьте контакт и выберите удобный способ связи.</p>
        <form onSubmit={submit}>
          <div className="order-contact-fields">
            <label><span>Имя</span><input autoComplete="name" value={values.name} onChange={update("name")} maxLength={80} required autoFocus /></label>
            <label><span>Телефон</span><input type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={updatePhone} maxLength={16} placeholder="+375291234567" required /></label>
          </div>
          <fieldset className="order-contact-methods">
            <legend>Как связаться</legend>
            <div>{contactOptions.map(([value,label]) => <label key={value} className={values.methods.includes(value) ? "selected" : ""}><input type="checkbox" checked={values.methods.includes(value)} onChange={() => toggleMethod(value)} /><span>{label}</span></label>)}</div>
          </fieldset>
          <label className="order-contact-consent">
            <input type="checkbox" checked={values.consent} onChange={(event) => { setError(""); setValues((current) => ({ ...current, consent:event.target.checked })); }} />
            <span>Согласен на обработку данных, с <a href="/privacy">политикой</a> и <a href="/terms">условиями</a>.</span>
          </label>
          {error ? <div className="order-contact-error" role="alert">{error}</div> : null}
          <button className="primary order-contact-submit" type="submit" disabled={saving}>{saving ? "Отправляем…" : "Отправить запрос"}</button>
        </form>
      </section>
    </div>
  );
}
