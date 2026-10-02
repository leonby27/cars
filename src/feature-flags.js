// Разделы сайта, которые уже написаны, но на боевом сайте ещё не показываются.
//
// Зачем: над журналом («Подборки», статьи) работа идёт неделями, а мелкие правки
// каталога и текстов выкладываются каждые пару дней. Держать недоделанный раздел
// в отдельной ветке значит каждый раз сводить её с общей и рисковать конфликтами;
// вместо этого код лежит в общей ветке, а его видимость решает один выключатель.
//
// Правило простое: **на локальной версии недоделанный раздел виден всегда, на боевом
// сайте — только когда его включат здесь**. Так проверять работу можно без всяких
// переменных окружения, а выложить сайт можно в любой момент — журнала для посетителя
// не существует.
//
// Что выключатель прячет на боевом сайте, пока стоит на «нет»:
//   • блок подборок на главной и ссылку «Журнал» в подвале;
//   • адреса `/blog` и `/blog/…` — по ним сайт отвечает «страницы нет»;
//   • страницы журнала в сборке для поисковика и в карте сайта.
//
// Как включить насовсем: поменять `production: false` на `production: true` в профиле
// сайта в config/sites/ и выложить сайт. Разово включить можно переменной окружения —
// `VITE_BLOG_ENABLED=1` для сборки сайта и `BLOG_ENABLED=1` для сервера и сборки
// страниц поисковика; в боевом окружении задавать нужно обе, иначе сайт и поисковик
// увидят разное.
import { SITE } from "./site-profile.js";
const FLAGS = SITE.flags;

// Локальная версия — это `npm run dev`: сборщик помечает её признаком DEV. Сборка
// сайта (и та, что уезжает на сервер, и та, что собирает страницы для поисковика)
// этого признака не имеет, поэтому боевой сайт живёт по `production`.
const isLocal = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.DEV === true : false;

// Vite подставляет значения только в `import.meta.env`, Node видит только `process.env`:
// один модуль читают и браузер, и сервер, поэтому спрашиваем оба и обходим отсутствие
// каждого из них молча.
const fromEnvironment = (name) => {
  const build = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env[`VITE_${name}`] : undefined;
  const node = typeof process !== "undefined" && process.env ? process.env[name] : undefined;
  const value = build ?? node;
  return value === undefined || value === "" ? null : /^(1|true|yes|on)$/i.test(String(value));
};

const flag = (name) => fromEnvironment(name) ?? (isLocal ? FLAGS[name].local : FLAGS[name].production);

/** Виден ли раздел на боевом сайте. Этим значением проверяется готовность к выкладке. */
export const shippedFlag = (name) => FLAGS[name].production;

/** Журнал: подборки на главной, раздел `/blog` и его страницы. */
export const BLOG_ENABLED = flag("BLOG_ENABLED");

/** Показывать ли черновики журнала в списках. Локально да, на боевом сайте нет. */
export const BLOG_DRAFTS_VISIBLE = flag("BLOG_DRAFTS_VISIBLE");

/** Видимость блока отзывов в разделе «О сервисе». */
export const REVIEWS_ENABLED = flag("REVIEWS_ENABLED");

/** Полная пробная карточка Guazi доступна только в локальной версии. */
export const GUAZI_PREVIEW_ENABLED = flag("GUAZI_PREVIEW_ENABLED");
