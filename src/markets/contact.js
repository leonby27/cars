// Formatting validation, not proof of ownership or of the customer's country.
export function normalizeRussianPhone(value) {
  let digits=String(value ?? '').replace(/\D/g,'');
  if (digits.length===10) digits='7'+digits;
  if (digits.length===11 && digits.startsWith('8')) digits='7'+digits.slice(1);
  return /^7\d{10}$/.test(digits) ? '+'+digits : null;
}
