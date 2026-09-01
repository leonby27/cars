// Тексты всех материалов журнала разом, по файлу на материал.
//
// Этот файл читают сервер, сборка страниц для поисковика и тесты — им нужны все
// тексты сразу. В браузер он не попадает: приложение берёт текст одной открытой
// страницы через `src/blog-text-load.js`, иначе посетитель скачивал бы весь журнал
// на каждой странице сайта. Так же устроены обзоры моделей (`src/model-texts.js`).
//
// Что лежит в файле текста: `intro` — вступительные абзацы, `sections` — разделы,
// `faq` — частые вопросы, `disclaimer` — оговорка внизу. У раздела кроме абзацев
// есть три необязательных блока, они те же, что в обзорах моделей:
//   list    — [{ term, text }] список, где начало строки выделено;
//   compare — [{ name, text }] две карточки рядом, когда выбор «или/или»;
//   callout — { title, text } врезка с тем, что легко упустить.
// Цифры наличия и цен в тексты не пишутся: их подставляет каталог (см. blog-posts.js).
import { rewriteEvDutyCopyDeep } from "./ev-duty-copy.js";
import electric_range_700 from "./blog-texts/electric-range-700.js";
import acceleration_under_4 from "./blog-texts/acceleration-under-4.js";
import almost_new from "./blog-texts/almost-new.js";
import suv_under_20000 from "./blog-texts/suv-under-20000.js";
import xiaomi_su7_vs_tesla_model_3 from "./blog-texts/xiaomi-su7-vs-tesla-model-3.js";
import market_report_sample from "./blog-texts/market-report-sample.js";
import used_ev_worth_it from "./blog-texts/used-ev-worth-it.js";
import ev_winter_belarus from "./blog-texts/ev-winter-belarus.js";
import range_cycles from "./blog-texts/range-cycles.js";
import fresh_2024 from "./blog-texts/fresh-2024.js";
import ev_quota_end from "./blog-texts/ev-quota-end.js";
import li_auto_l7_vs_l9 from "./blog-texts/li-auto-l7-vs-l9.js";
import mercedes_from_china from "./blog-texts/mercedes-from-china.js";
import electric_suv_600 from "./blog-texts/electric-suv-600.js";
import china_cars_pros_cons from "./blog-texts/china-cars-pros-cons.js";
import byd_seagull_vs_dolphin from "./blog-texts/byd-seagull-vs-dolphin.js";

/** Тексты как написаны, без поправки на состояние квоты: нужны тестам. */
export const BLOG_TEXTS_RAW = Object.freeze({
  "electric-range-700": electric_range_700,
  "acceleration-under-4": acceleration_under_4,
  "almost-new": almost_new,
  "suv-under-20000": suv_under_20000,
  "xiaomi-su7-vs-tesla-model-3": xiaomi_su7_vs_tesla_model_3,
  "market-report-sample": market_report_sample,
  "used-ev-worth-it": used_ev_worth_it,
  "ev-winter-belarus": ev_winter_belarus,
  "range-cycles": range_cycles,
  "fresh-2024": fresh_2024,
  "ev-quota-end": ev_quota_end,
  "li-auto-l7-vs-l9": li_auto_l7_vs_l9,
  "mercedes-from-china": mercedes_from_china,
  "electric-suv-600": electric_suv_600,
  "china-cars-pros-cons": china_cars_pros_cons,
  "byd-seagull-vs-dolphin": byd_seagull_vs_dolphin,
});

// Пока льгота на электромобили действует, тексты отдаются слово в слово; когда квота
// закончится, фразы про нулевую пошлину переписываются — теми же правилами, что
// в обзорах моделей.
export const BLOG_TEXTS = rewriteEvDutyCopyDeep(BLOG_TEXTS_RAW);

/** Материал вместе с его текстом — для сервера и сборки. */
export const blogPostWithText = (post) => (post ? { ...post, ...(BLOG_TEXTS[post.slug] || {}) } : post);
