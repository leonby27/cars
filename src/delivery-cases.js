// Demo delivery stories for the prototype. Replace with verified customer cases before publication.
export const DELIVERY_STATS = Object.freeze([
  { value: "64", label: "автомобиля доставлено" },
  { value: "44 дня", label: "средний срок до Минска" },
  { value: "17%", label: "вариантов отклоняем после проверки" },
]);

export const DELIVERY_CASES = Object.freeze([
  {
    id: "li-auto-l7-minsk",
    vehicle: "Li Auto L7 Max 2023",
    image: "li-auto-l7.png",
    delivered: "Июль 2026",
    route: "Ханчжоу → Сиань → Минск",
    duration: 43,
    mileage: "31 800 км",
    total: "118 600 BYN",
    client: "Алексей, Минск",
    summary: "Искали семейный гибрид с прозрачной историей и обязательной проверкой батареи. От первого запроса до выдачи прошло чуть больше шести недель.",
    quote: "Получил именно тот автомобиль и комплектацию, которые согласовали. Особенно помог подробный отчёт до оплаты.",
  },
  {
    id: "byd-yuan-plus-borovlyany",
    vehicle: "BYD Yuan Plus 2023",
    image: "byd-yuan-plus.png",
    delivered: "Июнь 2026",
    route: "Шэньчжэнь → Алматы → Минск",
    duration: 39,
    mileage: "22 400 км",
    total: "76 900 BYN",
    client: "Марина, Боровляны",
    summary: "Подбирали компактный электромобиль для города. Отказались от первого варианта после диагностики и нашли автомобиль без кузовных ремонтов.",
    quote: "Понравилось, что меня не уговаривали брать первый вариант. Второй автомобиль оказался заметно лучше.",
  },
  {
    id: "arcfox-alpha-s5-minsk",
    vehicle: "Arcfox Alpha S5 2024",
    image: "arcfox-alpha-s5.png",
    delivered: "Май 2026",
    route: "Пекин → Эрэн-Хото → Минск",
    duration: 47,
    mileage: "12 700 км",
    total: "92 300 BYN",
    client: "Илья, Минск",
    summary: "Клиент хотел свежий электрический седан с небольшим пробегом. Проверили батарею, историю страховых случаев и комплектацию до подписания договора.",
    quote: "Все изменения по срокам видел заранее, а итоговая сумма совпала со сметой в договоре.",
  },
]);
