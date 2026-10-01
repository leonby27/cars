// Контакты форм и телефоны аккаунтов приводим к одному ключу. Имя и автомобиль
// не определяют человека; пустые контакты не склеиваем между собой.
export function countLeadPeople(rows = []) {
  const all = new Set();
  const cars = new Set();
  const searches = new Set();
  for (const row of rows) {
    const contact = String(row.phone || "").trim().toLowerCase();
    const digits = contact.replace(/\D/g, "");
    const phone = /^[+\d\s().-]+$/.test(contact) && digits.length >= 7 ? digits : "";
    const person = phone ? `phone:${phone}` : row.customer_id ? `account:${row.customer_id}` : contact ? `contact:${contact}` : `lead:${row.id}`;
    all.add(person);
    (row.kind === "custom_search" ? searches : cars).add(person);
  }
  return { lead_people:all.size, car_lead_people:cars.size, custom_search_people:searches.size };
}
