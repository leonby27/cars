import { useEffect, useId, useState } from "react";
import { CheckCircle, Phone } from "@phosphor-icons/react";

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

export function OrderContactCard({ order, user, saving, onSave }) {
  const titleId = useId();
  const [values, setValues] = useState(() => ({
    name:order.contactName || user.name || "",
    phone:order.contactPhone || formatPhone(user.phone),
    methods:initialMethods(order, user),
    consent:Boolean(order.contactConsentAt),
  }));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(Boolean(order.contactSavedAt));

  useEffect(() => {
    setValues({
      name:order.contactName || user.name || "",
      phone:order.contactPhone || formatPhone(user.phone),
      methods:initialMethods(order, user),
      consent:Boolean(order.contactConsentAt),
    });
    setSaved(Boolean(order.contactSavedAt));
    setError("");
  }, [order.id, order.contactName, order.contactPhone, order.contactMethods, order.contactConsentAt, order.contactSavedAt, user.name, user.phone, user.preferredContact]);

  const update = (field) => (event) => {
    setSaved(false);
    setError("");
    setValues((current) => ({ ...current, [field]:event.target.value }));
  };
  const updatePhone = (event) => {
    const source = event.target.value;
    const prefix = source.trimStart().startsWith("+") ? "+" : "";
    setSaved(false);
    setError("");
    setValues((current) => ({ ...current, phone:`${prefix}${source.replace(/\D/g, "")}` }));
  };
  const toggleMethod = (method) => {
    setSaved(false);
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
    const didSave = await onSave({ contactName:name, contactPhone:`+${digits}`, contactMethods:values.methods, consent:true });
    if (didSave) setSaved(true);
  };

  return (
    <section className="order-contact-card" aria-labelledby={titleId}>
      <div className="order-contact-heading">
        <span className="order-contact-icon"><Phone size={24} weight="duotone" /></span>
        <div><span>Связь по заказу</span><h2 id={titleId}>Контакт для связи</h2><p>Подтвердите, кому и каким способом сообщить результат проверки объявления.</p></div>
      </div>
      <form onSubmit={submit}>
        <div className="order-contact-fields">
          <label><span>Имя</span><input autoComplete="name" value={values.name} onChange={update("name")} maxLength={80} required /></label>
          <label><span>Телефон</span><input type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={updatePhone} maxLength={16} placeholder="+375291234567" required /></label>
        </div>
        <fieldset className="order-contact-methods">
          <legend>Как можно связаться</legend>
          <div>{contactOptions.map(([value,label]) => <label key={value} className={values.methods.includes(value) ? "selected" : ""}><input type="checkbox" checked={values.methods.includes(value)} onChange={() => toggleMethod(value)} /><span>{label}</span></label>)}</div>
        </fieldset>
        <label className="order-contact-consent">
          <input type="checkbox" checked={values.consent} onChange={(event) => { setSaved(false); setError(""); setValues((current) => ({ ...current, consent:event.target.checked })); }} />
          <span>Согласен на обработку персональных данных, с <a href="/privacy">политикой конфиденциальности</a> и <a href="/terms">условиями использования</a>.</span>
        </label>
        {error ? <div className="order-contact-error" role="alert">{error}</div> : null}
        <div className="order-contact-actions">
          <button className="primary" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
          {saved ? <p role="status"><CheckCircle size={20} weight="fill" /> Контакт сохранён</p> : null}
        </div>
      </form>
    </section>
  );
}
