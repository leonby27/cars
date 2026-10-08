// Контакты форм и телефоны аккаунтов приводим к одному ключу. Имя и автомобиль
// не определяют человека; пустые контакты не склеиваем между собой.
import { leadPersonKey } from "../src/analytics-lead-people.js";
export function countLeadPeople(rows = []) {
  const all = new Set();
  const cars = new Set();
  const searches = new Set();
  for (const row of rows) {
    const person = leadPersonKey(row);
    all.add(person);
    (row.kind === "custom_search" ? searches : cars).add(person);
  }
  return { lead_people:all.size, car_lead_people:cars.size, custom_search_people:searches.size };
}
