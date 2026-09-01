/**
 * Свои картинки для статей журнала.
 *
 * У каждого материала должна быть хотя бы одна картинка. Для подборок и сравнений это
 * фотографии машин из каталога, а у статей про общие темы — зиму, циклы замера запаса
 * хода, изменение пошлин — фотографировать нечего. Фотобанки тут не помогают: по
 * запросу «Zeekr» там абстрактный седан в тумане, а к тексту про потерю запаса хода
 * зимой картинка нужна не для красоты, а чтобы показать цифры.
 *
 * Поэтому рисуем сами. Свой график — единственная картинка, которой нет больше ни у
 * кого: её перепечатывают со ссылкой, и она не устаревает вместе с фотографией.
 *
 * Разметку строит общий код: её вставляет и приложение, и версия страницы для
 * поисковика. Цвета берутся переменными оформления сайта, поэтому график сам
 * работает в тёмной теме.
 */

const escape = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Столбики в ряд: подпись слева, полоса, значение справа.
 *
 * Такой график читается без осей и подписей на цифрах — им и объясняются почти все
 * величины в статьях: сколько остаётся от паспортного запаса хода при разной погоде,
 * во что превращается цена под ключ после отмены льготы, чем отличаются циклы замера.
 *
 * `tone` у строки: `plain` — обычная, `good` — то, что хорошо (зелёная), `warn` —
 * то, что плохо (красная). Цвета те же, что у стрелки цены на карточке машины.
 */
export function barsSvg({ items = [], unit = "", max = null, width = 720, caption = null } = {}) {
  const rows = items.filter((item) => Number.isFinite(Number(item?.value)));
  if (rows.length < 2) return "";
  const rowHeight = 46;
  const labelWidth = 190;
  const valueWidth = 96;
  const padTop = 6;
  const height = padTop + rows.length * rowHeight + (caption ? 26 : 6);
  const trackLeft = labelWidth + 12;
  const trackWidth = width - trackLeft - valueWidth;
  const top = max ?? Math.max(...rows.map((row) => Number(row.value)));
  const scale = (value) => (top > 0 ? Math.max((Number(value) / top) * trackWidth, 2) : 2);
  const colour = (tone) => (tone === "good" ? "var(--green)" : tone === "warn" ? "var(--accent)" : "var(--muted)");

  const bars = rows
    .map((row, index) => {
      const y = padTop + index * rowHeight;
      const barY = y + 12;
      const value = Number(row.value);
      const text = row.text ?? `${new Intl.NumberFormat("ru-RU").format(value)}${unit ? ` ${unit}` : ""}`;
      return `<g>
      <text x="0" y="${barY + 14}" font-size="15" fill="var(--ink)">${escape(row.label)}</text>
      <rect x="${trackLeft}" y="${barY}" width="${trackWidth}" height="20" rx="6" fill="var(--line)" />
      <rect x="${trackLeft}" y="${barY}" width="${scale(value).toFixed(1)}" height="20" rx="6" fill="${colour(row.tone)}" fill-opacity="${row.tone ? "0.85" : "0.35"}" />
      <text x="${width}" y="${barY + 15}" text-anchor="end" font-size="15" font-weight="700" fill="var(--ink)">${escape(text)}</text>
      ${row.note ? `<text x="0" y="${barY + 32}" font-size="13" fill="var(--muted)">${escape(row.note)}</text>` : ""}
    </g>`;
    })
    .join("");

  // Подпись под графиком — часть картинки, а не абзац рядом: когда график
  // пересылают снимком экрана, подпись уезжает вместе с ним.
  const captionText = caption
    ? `<text x="0" y="${height - 6}" font-size="13" fill="var(--muted)">${escape(caption)}</text>`
    : "";
  const title = rows.map((row) => `${row.label}: ${row.text ?? row.value}`).join("; ");
  return `<svg class="blog-bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}">
${bars}${captionText}
</svg>`;
}

/**
 * Именованные графики статей. В тексте материала стоит только имя картинки, а сами
 * числа лежат здесь: текст остаётся текстом, а цифры видно в одном месте и их можно
 * поправить, не трогая абзацы.
 *
 * Числа тут — не наш замер, а сведённые данные из открытых источников. Каждая
 * картинка называет источник подписью, а полный список стоит в конце статьи.
 */
export const BLOG_FIGURES = Object.freeze({
  // Три поправки к паспортной цифре китайского объявления. Взята машина с типовым
  // паспортным запасом хода 700 км по циклу CLTC.
  "range-cycles": () =>
    barsSvg({
      unit: "км",
      items: [
        { label: "Паспорт CLTC", value: 700, note: "как написано в китайском объявлении" },
        { label: "Пересчёт в WLTP", value: 560, tone: "plain", note: "европейский цикл строже примерно на пятую часть" },
        { label: "Трасса 110 км/ч, лето", value: 480, tone: "plain", note: "скорость съедает больше всего" },
        { label: "Город и трасса зимой, −10 °C", value: 420, tone: "warn", note: "минус пятая часть к обычной езде" },
      ],
      caption: "Пример для машины с паспортными 700 км. Пересчёт CLTC → WLTP — по коэффициенту 0,8; зимняя потеря — по замерам NAF.",
    }),
  // Сколько остаётся от обычного запаса хода при разной температуре.
  "winter-range": () =>
    barsSvg({
      unit: "%",
      max: 100,
      items: [
        { label: "+20 °C", value: 100, text: "100%", tone: "good", note: "точка отсчёта — обычная летняя езда" },
        { label: "0 °C", value: 88, text: "≈ 88%", note: "печка включается, батарея ещё тёплая" },
        { label: "−10 °C", value: 78, text: "≈ 78%", note: "типичная беларуская зима" },
        { label: "−20 °C", value: 68, text: "≈ 68%", tone: "warn", note: "морозная неделя, машина ночует на улице" },
        { label: "−30 °C", value: 58, text: "≈ 58%", tone: "warn", note: "у нас редкость, в норвежских замерах — норма" },
      ],
      caption: "Сведено по зимним замерам Норвежской автомобильной федерации и данным Recurrent по 30 тысячам машин.",
    }),
  // Что сделала с ценой отмена льготы для последовательных гибридов.
  "hybrid-duty": () =>
    barsSvg({
      unit: "$",
      items: [
        { label: "Цена машины в Китае", value: 25000, note: "для примера взята машина за 25 000 $" },
        { label: "Под ключ до 2026 года", value: 30500, tone: "good", note: "льгота действовала: пошлины нет, НДС нулевой" },
        { label: "Под ключ с 2026 года", value: 40000, tone: "warn", note: "пошлина 15% и НДС 20% сверху" },
      ],
      caption: "Пример расчёта abcars.by. Доставка и оформление в обоих случаях одинаковые, разница — только в платежах.",
    }),
});

/** Готовая разметка картинки по её имени или пустая строка, если имени нет. */
export const blogFigureSvg = (name) => (name && BLOG_FIGURES[name] ? BLOG_FIGURES[name]() : "");
