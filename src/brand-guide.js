import { usdToByn } from "./pricing.js";

const RU = new Intl.NumberFormat("ru-RU", { maximumFractionDigits:0 });

export const isZeekrGuide = (landing, guide) => landing?.brand === "Zeekr" && guide?.brand === "Zeekr" && guide.total > 0;
export const guideNumber = (value) => RU.format(Math.round(Number(value) || 0));
export const guidePlural = (count, one, few, many) => {
  const value = Math.abs(Math.round(Number(count) || 0));
  if (value % 100 >= 11 && value % 100 <= 14) return many;
  if (value % 10 === 1) return one;
  if (value % 10 >= 2 && value % 10 <= 4) return few;
  return many;
};
export const guidePrice = (value, currency = "USD") => value == null
  ? "Нет данных"
  : currency === "BYN" ? `${guideNumber(usdToByn(value))} BYN` : `${guideNumber(value)} $`;
export const guideYears = ({ yearMin, yearMax }) => yearMin && yearMax
  ? yearMin === yearMax ? String(yearMin) : `${yearMin}–${yearMax}`
  : "Нет данных";
export const guidePowertrains = (values = []) => values
  .map((value) => value === "ДВС" ? "бензин" : value.toLowerCase())
  .join(", ") || "не указано";
export const guideDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ru-RU", {
    day:"numeric", month:"long", year:"numeric", timeZone:"Europe/Minsk",
  }).format(date);
};

export const ZEEKR_GUIDE_INTRO = "Zeekr — премиальная марка группы Geely с моделями разных классов: от лифтбеков и кроссоверов до минивэнов. В линейке представлены электрические и гибридные автомобили. При выборе стоит сравнивать тип силовой установки, привод, запас хода, комплектацию и год выпуска. Ниже собраны предложения с китайского вторичного рынка; цены, количество машин и состав моделей считаются по активным объявлениям и обновляются вместе с каталогом.";

export const ZEEKR_BUDGETS = [
  { key:"under25", max:25000, title:"До 25 000 $", text:"Самые доступные предложения марки" },
  { key:"25to35", min:25000, max:35000, title:"25 000–35 000 $", text:"Основной выбор массовых моделей" },
  { key:"35to50", min:35000, max:50000, title:"35 000–50 000 $", text:"Более свежие и дорогие версии" },
  { key:"over50", min:50000, title:"От 50 000 $", text:"Флагманские и редкие комплектации" },
];

export const guideBudgetTitle = (band, currency = "USD") => {
  if (currency !== "BYN") return band.title;
  const value = (usd) => `${guideNumber(usdToByn(usd))} BYN`;
  if (band.min == null) return `До ${value(band.max)}`;
  if (band.max == null) return `От ${value(band.min)}`;
  return `${guideNumber(usdToByn(band.min))}–${value(band.max)}`;
};

export const ZEEKR_ALTERNATIVES = [
  { brand:"Tesla", note:"седаны и кроссоверы на электротяге" },
  { brand:"NIO", note:"электромобили близкого ценового класса" },
  { brand:"XPeng", note:"электромобили с широким выбором кузовов" },
  { brand:"Avatr", note:"премиальные электрические модели и гибриды" },
  { brand:"Li Auto", note:"крупные гибридные кроссоверы" },
  { brand:"BYD", note:"самый широкий выбор электрических моделей и гибридов" },
];

export function zeekrGuideFaq(guide, currency = "USD") {
  if (!guide) return [];
  const mainModels = guide.models.slice(0, 4).map((row) => `Zeekr ${row.model}`).join(", ");
  return [
    {
      q:"Сколько стоит Zeekr с доставкой до Минска?",
      a:`Сейчас цены в каталоге начинаются от ${guidePrice(guide.priceMin, currency)}. Медианная цена — ${guidePrice(guide.priceMedian, currency)}: половина предложений дешевле, половина дороже. У центральной половины объявлений цена находится примерно между ${guidePrice(guide.priceP25, currency)} и ${guidePrice(guide.priceP75, currency)}. Это предварительный расчёт до Минска; перед договором подтверждаем цену продавца, курс и логистику.`,
    },
    {
      q:"Какие модели Zeekr чаще встречаются в каталоге?",
      a:`Больше всего предложений сейчас приходится на ${mainModels}. Таблица выше показывает количество машин, годы выпуска и медианную цену каждой модели и обновляется вместе с каталогом.`,
    },
    {
      q:"Все Zeekr оформляются как электромобили?",
      a:"Нет. Большинство предложений марки — электромобили, но в каталоге встречаются и гибридные модели. Для электромобиля пошлина зависит от действующей льготной квоты. Гибрид льготу не получает, поэтому сравнивать модели нужно по итоговой цене до Минска, указанной в карточке.",
    },
    {
      q:"Что проверить у Zeekr перед покупкой в Китае?",
      a:"Нужно подтвердить VIN, комплектацию и возможность экспорта, проверить кузов, историю обслуживания и заявленный пробег. Для электромобиля отдельно проверяют ошибки высоковольтной системы и доступные данные о батарее. Сведения продавца считаются исходными, а не независимой проверкой.",
    },
    {
      q:"Сколько ждать доставку Zeekr из Китая?",
      a:"Обычно 30–50 дней от договора до выдачи в Минске. Срок зависит от города отправления, оформления экспортных документов, маршрута и очереди на границе.",
    },
  ];
}
