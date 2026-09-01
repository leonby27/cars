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
import fast_suv_5 from "./blog-texts/fast-suv-5.js";
import bmw_from_china from "./blog-texts/bmw-from-china.js";
import which_china_suv from "./blog-texts/which-china-suv.js";
import awd_electric from "./blog-texts/awd-electric.js";
import util_fee from "./blog-texts/util-fee.js";
import denza_d9_vs_voyah_dream from "./blog-texts/denza-d9-vs-voyah-dream.js";
import charging_belarus from "./blog-texts/charging-belarus.js";
import hybrids_big_battery from "./blog-texts/hybrids-big-battery.js";
import phev_hev_erev from "./blog-texts/phev-hev-erev.js";
import volkswagen_from_china from "./blog-texts/volkswagen-from-china.js";
import ev_under_20000 from "./blog-texts/ev-under-20000.js";
import china_cars_rust from "./blog-texts/china-cars-rust.js";
import tesla_model_y_vs_li_auto_l7 from "./blog-texts/tesla-model-y-vs-li-auto-l7.js";
import home_charging from "./blog-texts/home-charging.js";
import cheap_low_mileage from "./blog-texts/cheap-low-mileage.js";
import vin_check from "./blog-texts/vin-check.js";
import audi_from_china from "./blog-texts/audi-from-china.js";
import petrol_suv_25000 from "./blog-texts/petrol-suv-25000.js";
import most_reliable_china from "./blog-texts/most-reliable-china.js";
import bmw_x3_vs_volvo_xc60 from "./blog-texts/bmw-x3-vs-volvo-xc60.js";
import transport_tax from "./blog-texts/transport-tax.js";
import sedans_under_20000 from "./blog-texts/sedans-under-20000.js";
import toyota_from_china from "./blog-texts/toyota-from-china.js";
import service_parts_minsk from "./blog-texts/service-parts-minsk.js";
import cars_2025 from "./blog-texts/cars-2025.js";
import li_auto_l7_vs_zeekr_001 from "./blog-texts/li-auto-l7-vs-zeekr-001.js";
import electric_vs_petrol from "./blog-texts/electric-vs-petrol.js";
import five_years_vat from "./blog-texts/five-years-vat.js";
import range_500_under_25000 from "./blog-texts/range-500-under-25000.js";
import real_mileage from "./blog-texts/real-mileage.js";

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
  "fast-suv-5": fast_suv_5,
  "bmw-from-china": bmw_from_china,
  "which-china-suv": which_china_suv,
  "awd-electric": awd_electric,
  "util-fee": util_fee,
  "denza-d9-vs-voyah-dream": denza_d9_vs_voyah_dream,
  "charging-belarus": charging_belarus,
  "hybrids-big-battery": hybrids_big_battery,
  "phev-hev-erev": phev_hev_erev,
  "volkswagen-from-china": volkswagen_from_china,
  "ev-under-20000": ev_under_20000,
  "china-cars-rust": china_cars_rust,
  "tesla-model-y-vs-li-auto-l7": tesla_model_y_vs_li_auto_l7,
  "home-charging": home_charging,
  "cheap-low-mileage": cheap_low_mileage,
  "vin-check": vin_check,
  "audi-from-china": audi_from_china,
  "petrol-suv-25000": petrol_suv_25000,
  "most-reliable-china": most_reliable_china,
  "bmw-x3-vs-volvo-xc60": bmw_x3_vs_volvo_xc60,
  "transport-tax": transport_tax,
  "sedans-under-20000": sedans_under_20000,
  "toyota-from-china": toyota_from_china,
  "service-parts-minsk": service_parts_minsk,
  "cars-2025": cars_2025,
  "li-auto-l7-vs-zeekr-001": li_auto_l7_vs_zeekr_001,
  "electric-vs-petrol": electric_vs_petrol,
  "five-years-vat": five_years_vat,
  "range-500-under-25000": range_500_under_25000,
  "real-mileage": real_mileage,
});

// Пока льгота на электромобили действует, тексты отдаются слово в слово; когда квота
// закончится, фразы про нулевую пошлину переписываются — теми же правилами, что
// в обзорах моделей.
export const BLOG_TEXTS = rewriteEvDutyCopyDeep(BLOG_TEXTS_RAW);

/** Материал вместе с его текстом — для сервера и сборки. */
export const blogPostWithText = (post) => (post ? { ...post, ...(BLOG_TEXTS[post.slug] || {}) } : post);
