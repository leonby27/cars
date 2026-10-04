export const PHONE_COUNTRIES = [
  { id: "BY", name: "Беларусь", flag: "🇧🇾", code: "+375", length: 9, areaLength: 2, placeholder: "(29) 123-45-67" },
  { id: "RU", name: "Россия", flag: "🇷🇺", code: "+7", length: 10, areaLength: 3, placeholder: "(999) 123-45-67" },
];

export const phoneCountry = (id) => PHONE_COUNTRIES.find((country) => country.id === id) || PHONE_COUNTRIES[0];
const digitsOf = (value) => String(value || "").replace(/\D/g, "");

// Accept national numbers, pasted international numbers and common trunk codes.
// An unsupported explicit international code must not become a different number.
export function readPhoneInput(value, countryId = "BY") {
  const source = String(value || "").trim();
  let digits = digitsOf(source);
  let country = phoneCountry(countryId);
  const international = source.startsWith("+") || source.startsWith("00");
  if (source.startsWith("00")) digits = digits.slice(2);
  if (international) {
    country = PHONE_COUNTRIES.find((item) => digits.startsWith(item.code.slice(1)));
    if (!country) return null;
    digits = digits.slice(country.code.length - 1);
    if (digits.length > country.length) return null;
  } else if (digits.length === 12 && digits.startsWith("375")) {
    country = phoneCountry("BY");
    digits = digits.slice(3);
  } else if (digits.length === 11 && digits.startsWith("80")) {
    country = phoneCountry("BY");
    digits = digits.slice(2);
  } else if (digits.length === 11 && /^[78]/.test(digits)) {
    country = phoneCountry("RU");
    digits = digits.slice(1);
  }
  return { country: country.id, national: digits.slice(0, country.length) };
}

export function formatPhoneNational({ country, national }) {
  const { areaLength } = phoneCountry(country);
  const digits = digitsOf(national);
  if (!digits) return "";
  let formatted = `(${digits.slice(0, areaLength)}`;
  if (digits.length > areaLength) formatted += `) ${digits.slice(areaLength, areaLength + 3)}`;
  if (digits.length > areaLength + 3) formatted += `-${digits.slice(areaLength + 3, areaLength + 5)}`;
  if (digits.length > areaLength + 5) formatted += `-${digits.slice(areaLength + 5)}`;
  return formatted;
}

export function completePhoneNumber({ country, national }) {
  const selected = phoneCountry(country);
  return /^\d+$/.test(national) && national.length === selected.length ? `${selected.code.slice(1)}${national}` : "";
}

export function phoneCaretPosition(formatted, digitCount) {
  if (digitCount <= 0) return formatted.startsWith("(") ? 1 : 0;
  let count = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index])) count += 1;
    if (count === digitCount) return index + 1;
  }
  return formatted.length;
}

export function deletePhoneDigit(phone, formatted, caret, backwards) {
  const before = digitsOf(formatted.slice(0, caret)).length;
  const index = backwards ? before - 1 : before;
  if (index < 0 || index >= phone.national.length) return { phone, caretDigits: before };
  return {
    phone: { ...phone, national: phone.national.slice(0, index) + phone.national.slice(index + 1) },
    caretDigits: index,
  };
}
