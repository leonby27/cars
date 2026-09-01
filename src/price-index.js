/**
 * Индекс цены под ключ по постоянной корзине.
 *
 * Главная ловушка отчёта о ценах: состав каталога всё время меняется — то появляются
 * сорок семь бензиновых марок, то вычёркиваются восемь тысяч машин. Средняя цена по
 * каталогу при этом скачет на десятки процентов, хотя ни одна машина не подорожала.
 *
 * Поэтому считаем как считают индекс потребительских цен: берём только те наборы
 * «модель + год выпуска», которые были и в прошлом снимке, и в этом, смотрим, как
 * изменилась медианная цена каждого набора, и сводим изменения в одно число.
 * Появившиеся и исчезнувшие наборы в расчёт не идут — они и есть смена состава.
 *
 * Медиана изменений, а не среднее: если у одного набора цена скакнула вдвое из-за
 * пары странных объявлений, среднее уедет, а медиана — нет.
 */

/** Середина ряда. Для чётной длины — половина суммы двух средних значений. */
export const median = (values) => {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const asMap = (rows) => new Map((rows || []).map((row) => [row.bucket, row]));

/**
 * Изменение цены между двумя снимками.
 *
 * `minListings` — сколько машин должно быть в наборе в обоих снимках, чтобы набор
 * пошёл в расчёт. Набор из двух объявлений — это не цена модели, а два случайных
 * продавца.
 */
export function priceIndexChange(previous, current, { minListings = 3 } = {}) {
  const before = asMap(previous);
  const kept = [];
  for (const row of current || []) {
    const was = before.get(row.bucket);
    if (!was) continue;
    if (row.listings < minListings || was.listings < minListings) continue;
    if (!(was.medianUsd > 0) || !(row.medianUsd > 0)) continue;
    kept.push({
      bucket: row.bucket,
      brand: row.brand,
      model: row.model,
      year: row.year ?? row.modelYear ?? null,
      listings: row.listings,
      wasUsd: was.medianUsd,
      nowUsd: row.medianUsd,
      changePct: ((row.medianUsd - was.medianUsd) / was.medianUsd) * 100,
    });
  }
  const changePct = median(kept.map((row) => row.changePct));
  return {
    // Сколько наборов сравнилось — это и есть «размер корзины». Обмелевшую корзину
    // (меньше полусотни наборов) в отчёте нужно называть вслух: по двум десяткам
    // моделей рынок не измеряется.
    baskets: kept.length,
    listings: kept.reduce((sum, row) => sum + row.listings, 0),
    changePct: changePct === null ? null : Number(changePct.toFixed(2)),
    rows: kept,
  };
}

/**
 * Что подешевело и что подорожало сильнее всех. Из тех же сравнимых наборов, поэтому
 * «подешевела» всегда означает «та же модель того же года стоит меньше», а не
 * «ушла дорогая машина».
 */
export function priceMovers(change, { limit = 10, minChangePct = 1 } = {}) {
  const rows = (change?.rows || []).filter((row) => Math.abs(row.changePct) >= minChangePct);
  const sorted = [...rows].sort((left, right) => left.changePct - right.changePct);
  return {
    cheaper: sorted.filter((row) => row.changePct < 0).slice(0, limit),
    dearer: sorted.filter((row) => row.changePct > 0).reverse().slice(0, limit),
  };
}

/**
 * Ряд индекса от первой недели: каждая точка — во сколько обходится та же корзина
 * по отношению к началу наблюдений, где начало равно ста.
 *
 * Считается по цепочке: изменение первой недели ко второй, второй к третьей и так
 * далее. Сравнивать каждую неделю с самой первой нельзя — за месяц половина наборов
 * сменится, и корзина обмелеет до пустоты.
 */
export function priceIndexSeries(snapshotsByDate, options = {}) {
  const dates = [...(snapshotsByDate?.keys?.() ? snapshotsByDate.keys() : [])].sort();
  const points = [];
  let value = 100;
  dates.forEach((date, index) => {
    if (index === 0) {
      points.push({ date, value: 100, changePct: null, baskets: (snapshotsByDate.get(date) || []).length });
      return;
    }
    const step = priceIndexChange(snapshotsByDate.get(dates[index - 1]), snapshotsByDate.get(date), options);
    value = step.changePct === null ? value : value * (1 + step.changePct / 100);
    points.push({ date, value: Number(value.toFixed(2)), changePct: step.changePct, baskets: step.baskets });
  });
  return points;
}

/** Насколько сдвинулась цена корзины за весь ряд, в процентах. */
export const seriesChangePct = (points) => {
  if (!points?.length) return null;
  const last = points[points.length - 1]?.value;
  const first = points[0]?.value;
  if (!(first > 0) || !(last > 0)) return null;
  return Number((((last - first) / first) * 100).toFixed(2));
};
