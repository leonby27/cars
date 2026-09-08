// Слова и числа шкалы «цена среди похожих»: где встал бегунок, как называется цена,
// что под ней написано. Сама вёрстка — в price-rating-scale.jsx, набор для сравнения
// собирает сервер (server/price-rating.mjs); там же написано, почему сравниваем
// итоговую цену до Минска и только с той же моделью, годом, комплектацией, такой же
// батареей и похожим пробегом.
//
// Положение бегунка считается от того, насколько цена отличается от планки набора, а
// не от места в списке. Место в списке для шкалы не годится: в наборе, где все цены в
// пределах пары процентов, каждая пятая машина всё равно оказывалась бы «намного
// дешевле остальных», хотя разницы там нет.
//
// Планка — это типичная цена набора, сдвинутая под пробег самой машины (сдвиг считает
// сервер). Поэтому у машины с большим пробегом планка ниже, и её цена сравнивается не
// с машинами вообще, а с тем, сколько такая машина с таким пробегом и стоит.
//
// Строки под шкалой — про деньги, а не про место в очереди. «Дешевле, чем 105 из 205»
// пересказывает шкалу и ничего не добавляет; «такие машины с таким пробегом стоят
// около столько, эта на столько дешевле» отвечает на вопрос, который человек и
// задаёт. Все строки — обычные серые предложения: цветом отвечает только слово у
// шкалы, иначе выделено всё и не выделено ничего.

/** Края шкалы: отклонение от типичной цены на эту долю и больше упирается в конец. */
export const PRICE_RATING_SPAN = 0.2;
/** Столько делений в шкале. */
export const PRICE_RATING_STEPS = 5;
/** Отклонения, по которым цена получает своё название. */
export const PRICE_RATING_BANDS = { same:0.03, far:0.1 };

/** Планка набора: типичная цена, сдвинутая под пробег этой машины. */
export const priceRatingBar = (mode) => Number(mode?.expectedUsd) || Number(mode?.medianUsd) || 0;

const deviation = (priceUsd, medianUsd) =>
  (Number(medianUsd) > 0 && Number(priceUsd) > 0 ? (priceUsd - medianUsd) / medianUsd : null);

// Границы делений по отклонению от планки: край шкалы, «намного», «средняя», и так
// же в другую сторону. Одни и те же числа задают и деление, и место бегунка, —
// иначе бегунок вставал над одним делением, а подсвечивалось другое.
const PRICE_RATING_BOUNDS = [
  -PRICE_RATING_SPAN,
  -PRICE_RATING_BANDS.far,
  -PRICE_RATING_BANDS.same,
  PRICE_RATING_BANDS.same,
  PRICE_RATING_BANDS.far,
  PRICE_RATING_SPAN,
];

// Какое деление отвечает отклонению. Одна эта проверка задаёт и подсвеченное
// деление, и место бегунка, и слово у шкалы: пока их считали по отдельности, на
// границах ступеней бегунок вставал над одним делением, а подсвечивалось другое.
const stepOf = (diff) => {
  if (diff <= -PRICE_RATING_BANDS.far) return 0;
  if (diff <= -PRICE_RATING_BANDS.same) return 1;
  if (diff < PRICE_RATING_BANDS.same) return 2;
  if (diff < PRICE_RATING_BANDS.far) return 3;
  return 4;
};

/**
 * Где стоит бегунок, от 0 (дешевле всех) до 1 (дороже всех). Шкала не линейная по
 * деньгам: каждое деление занимает свою пятую часть ширины, а внутри деления бегунок
 * стоит там, где цена и стоит внутри своей ступени.
 */
export const priceRatingPosition = (priceUsd, medianUsd) => {
  const diff = deviation(priceUsd, medianUsd);
  if (diff === null) return null;
  const value = Math.min(PRICE_RATING_SPAN, Math.max(-PRICE_RATING_SPAN, diff));
  const step = stepOf(diff);
  const from = PRICE_RATING_BOUNDS[step];
  const to = PRICE_RATING_BOUNDS[step + 1];
  const raw = to === from ? 0.5 : (value - from) / (to - from);
  // Внутрь деления, не на шов: ровно на границе бегунок стоял бы между двумя
  // делениями, и было бы не видно, к какому из них он относится.
  const share = Math.min(0.94, Math.max(0.06, raw));
  return (step + share) / PRICE_RATING_STEPS;
};

const VERDICTS = [
  { label:"намного ниже", tone:"low" },
  { label:"ниже средней", tone:"low" },
  { label:"средняя", tone:"mid" },
  { label:"выше средней", tone:"high" },
  { label:"намного выше", tone:"high" },
];

/** Название цены словами и её сторона: дешёвая, обычная, дорогая. */
export const priceRatingVerdict = (priceUsd, medianUsd) => {
  const diff = deviation(priceUsd, medianUsd);
  if (diff === null) return null;
  const step = stepOf(diff);
  return { ...VERDICTS[step], step };
};

const formatKm = (value) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits:0 }).format(value);
const formatKwh = (value) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits:1 }).format(value);
// «с 41 такой же машиной», «с 205 такими же машинами» — падеж по последней цифре.
const carsWord = (count) => (count % 10 === 1 && count % 100 !== 11 ? "такой же машиной" : "такими же машинами");
// Крупный шаг суммы задаёт сама карточка: она знает выбранную валюту, и округлять
// надо в ней, иначе ровные доллары дают в рублях кривые числа. Без карточки (тесты,
// служебные вызовы) остаётся шаг в сотню долларов.
const roughUsd = (usd) => `${(Math.round(usd / 100) * 100).toLocaleString("ru-RU")} $`;

/**
 * Первая строка: планка для этой машины и чем её цена от планки отличается. Одним
 * предложением и без выделений — цветом отвечает только слово у шкалы.
 *
 * Когда планка сдвинута под пробег, так и сказано: «с таким пробегом». Иначе вышло бы
 * непонятное «такие машины стоят в среднем 96 000» под машиной, у которой пробег вдвое
 * больше, чем у набора.
 */
export const priceRatingPriceNote = (rating, mode, priceUsd, formatMoney) => {
  const bar = priceRatingBar(mode);
  const price = Number(priceUsd) || 0;
  if (!bar || !price) return null;
  const money = (usd) => (formatMoney ? formatMoney(usd) : roughUsd(usd));
  const verdict = priceRatingVerdict(price, bar);
  const head = mode.mileageAdjusted
    ? `С таким пробегом такие машины стоят около ${money(bar)}`
    : `Такие машины стоят в среднем ${money(bar)}`;
  if (verdict.tone === "mid") return { text:`${head} — эта почти столько же.`, tone:"mid" };
  const gap = money(Math.abs(price - bar));
  return { text:`${head} — эта на ${gap} ${price < bar ? "дешевле" : "дороже"}.`, tone:verdict.tone };
};

/**
 * Вторая строка: с кем сравнивали. Набор собирается по тому, что удалось совпасть
 * (год, комплектация, пробег), и здесь это названо словами — чтобы человек видел
 * рамку сравнения, а не доверял шкале на слово.
 */
export const priceRatingBasisNote = (rating) => {
  if (!rating?.count) return null;
  const years = rating.sameYear === false ? `${rating.yearFrom}–${rating.yearTo} годов` : `${rating.yearFrom} года`;
  const matched = [];
  if (rating.sameTrim) matched.push("той же комплектации");
  if (rating.sameBattery) matched.push("с такой же батареей");
  if (rating.sameMileage) matched.push("с похожим пробегом");
  // Перечисление по-русски: «а, б и в», а не «а и б и в».
  const list = matched.length > 1 ? `${matched.slice(0, -1).join(", ")} и ${matched.at(-1)}` : matched[0] || "";
  const tail = list ? ` ${list}` : "";
  const adjusted = rating.quotaOn?.mileageAdjusted || rating.quotaOff?.mileageAdjusted
    ? " Планка сдвинута под пробег этой машины."
    : "";
  return `Сравнили с ${rating.count} ${carsWord(rating.count)} ${years}${tail}.${adjusted}`;
};

/**
 * Строка про пробег. Пишем всегда, когда пробег выбивается из набора, — даже если
 * набор по пробегу и собирался: допуск там широкий, и разница в четверть внутри него
 * обычное дело. Планка её уже учла, но человек должен видеть, откуда взялась разница
 * в цене.
 */
export const priceRatingMileageNote = (rating, mileage) => {
  const own = Number(mileage) || 0;
  const typical = Number(rating?.mileageMedian) || 0;
  if (!own || !typical) return null;
  const ratio = own / typical;
  if (ratio >= 1.15) return { text:`Пробег ${formatKm(own)} км — больше, чем у похожих: у них около ${formatKm(typical)} км.`, tone:"high" };
  if (ratio <= 0.85) return { text:`Пробег ${formatKm(own)} км — меньше, чем у похожих: у них около ${formatKm(typical)} км.`, tone:"low" };
  return null;
};

/**
 * Строка про батарею — там, где набор собран без неё. У электромобиля батарея решает
 * цену не меньше пробега: та же модель с пакетом на 100 кВт·ч стоит заметно дороже,
 * чем на 60, и без этой строки шкала выглядела бы как выгода. У машины с мотором
 * батареи нет — строки тоже нет.
 */
export const priceRatingBatteryNote = (rating, battery) => {
  if (rating?.sameBattery) return null;
  const own = Number(battery) || 0;
  const typical = Number(rating?.batteryMedian) || 0;
  if (!own || !typical) return null;
  const ratio = own / typical;
  if (ratio >= 1.08) return { text:`Батарея ${formatKwh(own)} кВт·ч — больше, чем у похожих: у них около ${formatKwh(typical)} кВт·ч.`, tone:"low" };
  if (ratio <= 0.92) return { text:`Батарея ${formatKwh(own)} кВт·ч — меньше, чем у похожих: у них около ${formatKwh(typical)} кВт·ч.`, tone:"high" };
  return null;
};

/** Чего в наборе не хватило — для подсказки при наведении. */
export const priceRatingLimits = (rating) => {
  const missing = [];
  if (!rating?.sameTrim) missing.push("комплектация у них может быть другой");
  // Про батарею оговариваемся только там, где батарея вообще есть: у машины с мотором
  // её нет ни у одной стороны сравнения.
  if (!rating?.sameBattery && Number(rating?.batteryMedian) > 0) missing.push("батарея тоже разная");
  // Про разный пробег оговариваемся, только если планку под него не сдвинули: иначе
  // подсказка спорила бы сама с собой — «поправили» и тут же «приблизительно».
  const adjusted = rating?.quotaOn?.mileageAdjusted || rating?.quotaOff?.mileageAdjusted;
  if (!rating?.sameMileage && !adjusted) missing.push("пробег разный");
  return missing.length ? `Сравнение приблизительное: ${missing.join(", ")}.` : "";
};
