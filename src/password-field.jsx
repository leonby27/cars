import { useState } from "react";
import { Eye, EyeSlash } from "./icons.jsx";

export function PasswordField({ label, value, onChange, autoComplete, placeholder = "", required = false, disabled = false }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">
      <span>{label}</span>
      <div className="password-input">
        <input type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={onChange} placeholder={placeholder} required={required} disabled={disabled} />
        <button type="button" aria-label={visible ? "Скрыть пароль" : "Показать пароль"} aria-pressed={visible} onClick={() => setVisible((current) => !current)} disabled={disabled}>
          {visible ? <EyeSlash size={20} /> : <Eye size={20} />}
        </button>
      </div>
    </label>
  );
}
