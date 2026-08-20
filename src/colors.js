// Цвет кузова. В базе он хранится по-английски и уже нормализован источником:
// Black, White, Silver, Dark Gray, Blue, Red, Green, Yellow, Champagne
// (покрытие полное, «--» — цвет не указан). Посетители пишут по-русски и в любых
// падежах, поэтому у каждого варианта — основы слов для сравнения по началу.
// «Серебристый» и «Тёмно-серый» показываем одним пунктом: живому глазу это один
// серый, а тёмно-серых машин считаные десятки.
export const COLOR_FILTERS = [
  { label: "Чёрный", values: ["Black"], stems: ["черн", "black"] },
  { label: "Белый", values: ["White"], stems: ["бел", "white"] },
  { label: "Серый / серебристый", values: ["Silver", "Dark Gray"], stems: ["сер", "серебр", "граф", "silver", "gray", "grey"] },
  { label: "Синий", values: ["Blue"], stems: ["син", "голуб", "blue"] },
  { label: "Красный", values: ["Red"], stems: ["красн", "бордо", "вишн", "red"] },
  { label: "Зелёный", values: ["Green"], stems: ["зелен", "green"] },
  { label: "Жёлтый", values: ["Yellow"], stems: ["желт", "yellow"] },
  { label: "Шампань", values: ["Champagne"], stems: ["шампан", "золот", "беж", "champagne", "gold"] },
];

export const COLOR_LABELS = COLOR_FILTERS.map((color) => color.label);

// Слово запроса → подпись пункта фильтра; не цвет — пустая строка.
// Основа «бел» не путается с рублями: слова валюты разбираются раньше цветов.
export const colorLabelForWord = (word) => {
  for (const color of COLOR_FILTERS) {
    for (const stem of color.stems) if (word.startsWith(stem)) return color.label;
  }
  return "";
};

// Подписи пунктов → значения из базы, которыми фильтрует сервер.
export const colorValuesForLabels = (labels) => {
  const values = [];
  for (const label of Array.isArray(labels) ? labels : [labels]) {
    const color = COLOR_FILTERS.find((item) => item.label === label);
    if (color) for (const value of color.values) if (!values.includes(value)) values.push(value);
  }
  return values;
};

export const matchesColorLabels = (bodyColor, labels) => {
  const list = Array.isArray(labels) ? labels : [labels];
  if (!list.length) return true;
  return colorValuesForLabels(list).includes(bodyColor);
};

// Точный перевод для страницы машины: в отличие от пунктов фильтра, здесь
// «Серебристый» и «Тёмно-серый» не склеиваются — показываем цвет как есть.
// Незнакомое значение возвращаем как пришло, «--» и пустоту — как отсутствие.
const COLOR_TRANSLATIONS = {
  Black: "Чёрный",
  White: "Белый",
  Silver: "Серебристый",
  "Dark Gray": "Тёмно-серый",
  Blue: "Синий",
  Red: "Красный",
  Green: "Зелёный",
  Yellow: "Жёлтый",
  Champagne: "Шампань",
};

export const translateColor = (bodyColor) => {
  const value = String(bodyColor ?? "").trim();
  if (!value || value === "--") return null;
  return COLOR_TRANSLATIONS[value] || value;
};
