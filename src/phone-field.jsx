import { useId, useLayoutEffect, useRef } from "react";
import { PHONE_COUNTRIES, deletePhoneDigit, formatPhoneNational, phoneCaretPosition, phoneCountry, readPhoneInput } from "./phone-mask.js";

const countryOptions = PHONE_COUNTRIES.map((country) => country.id);
const formatCountry = (id) => {
  const country = phoneCountry(id);
  return `${country.flag} ${country.code}`;
};

export function PhoneField({ value, onChange, CountrySelect }) {
  const inputId = useId();
  const inputRef = useRef(null);
  const caretRef = useRef(null);
  const country = phoneCountry(value.country);
  const formatted = formatPhoneNational(value);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (caretRef.current == null || document.activeElement !== input) return;
    const position = phoneCaretPosition(formatted, caretRef.current);
    input.setSelectionRange(position, position);
    caretRef.current = null;
  }, [value, formatted]);

  const update = (event) => {
    const input = event.currentTarget;
    const parsed = readPhoneInput(input.value, value.country);
    if (!parsed) {
      input.setCustomValidity("Введите номер Беларуси (+375) или России (+7) по маске.");
      return;
    }
    input.setCustomValidity("");
    const allDigits = input.value.replace(/\D/g, "").length;
    const before = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, "").length;
    caretRef.current = Math.max(0, before - (allDigits - parsed.national.length));
    onChange(parsed);
  };

  const removeDigit = (event) => {
    const input = event.currentTarget;
    if (!["Backspace", "Delete"].includes(event.key) || input.selectionStart !== input.selectionEnd || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    input.setCustomValidity("");
    const result = deletePhoneDigit(value, formatted, input.selectionStart ?? formatted.length, event.key === "Backspace");
    caretRef.current = result.caretDigits;
    onChange({ ...result.phone });
  };

  const paste = (event) => {
    const text = event.clipboardData.getData("text");
    const digits = text.replace(/\D/g, "");
    if (!/^\s*(\+|00)/.test(text) && !/^(375\d{9}|[78]\d{10}|80\d{9})$/.test(digits)) return;
    event.preventDefault();
    const parsed = readPhoneInput(text, value.country);
    if (!parsed) {
      event.currentTarget.setCustomValidity("Введите номер Беларуси (+375) или России (+7) по маске.");
      event.currentTarget.reportValidity();
      return;
    }
    event.currentTarget.setCustomValidity("");
    caretRef.current = parsed.national.length;
    onChange(parsed);
  };

  return (
    <div className="auth-field lead-phone-field">
      <label className="lead-phone-label" htmlFor={inputId}>Телефон</label>
      <div className="lead-phone-control">
        <div className="lead-phone-country" onKeyDown={(event) => {
          if (event.key === "Escape" && event.currentTarget.querySelector(".custom-select.open")) event.stopPropagation();
        }}>
          <CountrySelect
            label="Страна телефона"
            value={country.id}
            options={countryOptions}
            formatOption={formatCountry}
            onChange={(id) => {
              inputRef.current.setCustomValidity("");
              caretRef.current = null;
              onChange({ country: id, national: "" });
            }}
          />
        </div>
        <input
          ref={inputRef}
          id={inputId}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          enterKeyHint="done"
          value={formatted}
          onChange={update}
          onKeyDown={removeDigit}
          onPaste={paste}
          placeholder={country.placeholder}
          pattern={`(?:\\D*\\d){${country.length}}\\D*`}
          title={`${country.name}: ${country.length} цифр без кода страны`}
          required
        />
      </div>
    </div>
  );
}
