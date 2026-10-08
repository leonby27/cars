export function leadPersonKey(row) {
  const contact = String(row.phone || "").trim().toLowerCase();
  const digits = contact.replace(/\D/g, "");
  const phone = /^[+\d\s().-]+$/.test(contact) && digits.length >= 7 ? digits : "";
  return phone ? `phone:${phone}` : row.customer_id ? `account:${row.customer_id}` : contact ? `contact:${contact}` : `lead:${row.id}`;
}
