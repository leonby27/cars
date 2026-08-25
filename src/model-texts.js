// Тексты всех обзоров разом: марка за маркой, по файлу на модель.
//
// Этот файл читают сервер (страница модели для поисковика), сборка и тесты — им
// нужны все 130 текстов сразу. В браузер он не попадает: приложение берёт текст
// одной открытой модели через `src/model-text-load.js`, иначе посетитель скачивал
// бы 1,3 МБ чужих обзоров на каждой странице сайта.
//
// Что лежит в файле текста: `intro` — первые абзацы, `stats` — полоса цифр,
// `sections` — разделы статьи, `versions` — таблица версий, `faq` — частые вопросы,
// `disclaimer` — оговорка внизу. Кроме абзацев у раздела есть три необязательных
// блока — они разбивают сплошной текст и вытаскивают из него главное:
//   list    — [{ term, text }] список, где начало строки выделено;
//   compare — [{ name, text }] две карточки рядом, когда выбор «или/или»;
//   callout — { title, text } врезка с тем, что легко упустить.
import { rewriteEvDutyCopyDeep } from "./ev-duty-copy.js";
import zeekr_007gt from "./model-texts/zeekr-007gt.js";
import tesla_model_y from "./model-texts/tesla-model-y.js";
import tesla_model_3 from "./model-texts/tesla-model-3.js";
import byd_seagull from "./model-texts/byd-seagull.js";
import byd_qin_plus from "./model-texts/byd-qin-plus.js";
import li_auto_l7 from "./model-texts/li-auto-l7.js";
import li_auto_l9 from "./model-texts/li-auto-l9.js";
import byd_han from "./model-texts/byd-han.js";
import nio_es6 from "./model-texts/nio-es6.js";
import leapmotor_t03 from "./model-texts/leapmotor-t03.js";
import byd_dolphin from "./model-texts/byd-dolphin.js";
import li_auto_l8 from "./model-texts/li-auto-l8.js";
import xiaomi_su7 from "./model-texts/xiaomi-su7.js";
import li_auto_li_one from "./model-texts/li-auto-li-one.js";
import xpeng_p7 from "./model-texts/xpeng-p7.js";
import leapmotor_c11 from "./model-texts/leapmotor-c11.js";
import bmw_i3 from "./model-texts/bmw-i3.js";
import byd_qin_l from "./model-texts/byd-qin-l.js";
import volkswagen_id3 from "./model-texts/volkswagen-id3.js";
import hima_m9 from "./model-texts/hima-m9.js";
import nio_es8 from "./model-texts/nio-es8.js";
import hima_m7 from "./model-texts/hima-m7.js";
import li_auto_l6 from "./model-texts/li-auto-l6.js";
import denza_d9 from "./model-texts/denza-d9.js";
import nio_et5t from "./model-texts/nio-et5t.js";
import aion_y from "./model-texts/aion-y.js";
import geely_galaxy_panda from "./model-texts/geely-galaxy-panda.js";
import voyah_dreamer from "./model-texts/voyah-dreamer.js";
import zeekr_001 from "./model-texts/zeekr-001.js";
import xpeng_mona_m03 from "./model-texts/xpeng-mona-m03.js";
import ora_good_cat from "./model-texts/ora-good-cat.js";
import nio_ec6 from "./model-texts/nio-ec6.js";
import byd_tang from "./model-texts/byd-tang.js";
import byd_song_plus_phev from "./model-texts/byd-song-plus-phev.js";
import byd_yuan_plus from "./model-texts/byd-yuan-plus.js";
import leapmotor_c10 from "./model-texts/leapmotor-c10.js";
import xiaomi_yu7 from "./model-texts/xiaomi-yu7.js";
import hima_shangjie from "./model-texts/hima-shangjie.js";
import leapmotor_c16 from "./model-texts/leapmotor-c16.js";
import voyah_free from "./model-texts/voyah-free.js";
import byd_seal_06 from "./model-texts/byd-seal-06.js";
import hima_m5 from "./model-texts/hima-m5.js";
import byd_song_pro from "./model-texts/byd-song-pro.js";
import nio_et5 from "./model-texts/nio-et5.js";
import leapmotor_b01 from "./model-texts/leapmotor-b01.js";
import leapmotor_b10 from "./model-texts/leapmotor-b10.js";
import bmw_5_series from "./model-texts/bmw-5-series.js";
import li_auto_mega from "./model-texts/li-auto-mega.js";
import byd_destroyer_05 from "./model-texts/byd-destroyer-05.js";
import hima_m8 from "./model-texts/hima-m8.js";
import xpeng_g9 from "./model-texts/xpeng-g9.js";
import bmw_ix3 from "./model-texts/bmw-ix3.js";
import geely_galaxy_starry_wish from "./model-texts/geely-galaxy-starry-wish.js";
import volkswagen_id4_crozz from "./model-texts/volkswagen-id4-crozz.js";
import volkswagen_id4_x from "./model-texts/volkswagen-id4-x.js";
import zeekr_009 from "./model-texts/zeekr-009.js";
import xpeng_g6 from "./model-texts/xpeng-g6.js";
import nio_et7 from "./model-texts/nio-et7.js";
import aion_s from "./model-texts/aion-s.js";
import mercedes_benz_eqe from "./model-texts/mercedes-benz-eqe.js";
import hongqi_e_qm5 from "./model-texts/hongqi-e-qm5.js";
import hima_luxeed_r7 from "./model-texts/hima-luxeed-r7.js";
import ora_black_cat from "./model-texts/ora-black-cat.js";
import byd_han_l from "./model-texts/byd-han-l.js";
import hongqi_e_hs9 from "./model-texts/hongqi-e-hs9.js";
import byd_seal from "./model-texts/byd-seal.js";
import geely_galaxy_xingyao_8 from "./model-texts/geely-galaxy-xingyao-8.js";
import zeekr_007 from "./model-texts/zeekr-007.js";
import byd_yuan_up from "./model-texts/byd-yuan-up.js";
import byd_seal_05_dmi from "./model-texts/byd-seal-05-dmi.js";
import avatr_07 from "./model-texts/avatr-07.js";
import volkswagen_id7 from "./model-texts/volkswagen-id7.js";
import deepal_s05 from "./model-texts/deepal-s05.js";
import deepal_sl03 from "./model-texts/deepal-sl03.js";
import li_auto_i6 from "./model-texts/li-auto-i6.js";
import toyota_bz3x from "./model-texts/toyota-bz3x.js";
import bmw_i5 from "./model-texts/bmw-i5.js";
import mercedes_benz_eqe_suv from "./model-texts/mercedes-benz-eqe-suv.js";
import avatr_06 from "./model-texts/avatr-06.js";
import xpeng_g3 from "./model-texts/xpeng-g3.js";
import byd_song_l_dmi from "./model-texts/byd-song-l-dmi.js";
import xpeng_p7_plus from "./model-texts/xpeng-p7-plus.js";
import geely_galaxy_a7 from "./model-texts/geely-galaxy-a7.js";
import deepal_s07 from "./model-texts/deepal-s07.js";
import byd_tang_l from "./model-texts/byd-tang-l.js";
import xpeng_p5 from "./model-texts/xpeng-p5.js";
import geely_galaxy_e5 from "./model-texts/geely-galaxy-e5.js";
import hima_zhijie_s7 from "./model-texts/hima-zhijie-s7.js";
import xiaomi_su7_ultra from "./model-texts/xiaomi-su7-ultra.js";
import voyah_zhiyin from "./model-texts/voyah-zhiyin.js";
import avatr_12 from "./model-texts/avatr-12.js";
import zeekr_x from "./model-texts/zeekr-x.js";
import deepal_l07 from "./model-texts/deepal-l07.js";
import xpeng_g7 from "./model-texts/xpeng-g7.js";
import volkswagen_magotan_gte from "./model-texts/volkswagen-magotan-gte.js";
import leapmotor_c01 from "./model-texts/leapmotor-c01.js";
import hima_s9 from "./model-texts/hima-s9.js";
import lynk_co_08 from "./model-texts/lynk-co-08.js";
import avatr_11 from "./model-texts/avatr-11.js";
import byd_sealion_06 from "./model-texts/byd-sealion-06.js";
import geely_galaxy_l6 from "./model-texts/geely-galaxy-l6.js";
import geely_galaxy_l7 from "./model-texts/geely-galaxy-l7.js";
import zeekr_9x from "./model-texts/zeekr-9x.js";
import lynk_co_07 from "./model-texts/lynk-co-07.js";
import byd_song_l_ev from "./model-texts/byd-song-l-ev.js";
import byd_seal_07_dmi from "./model-texts/byd-seal-07-dmi.js";
import voyah_taishan from "./model-texts/voyah-taishan.js";
import byd_yuan_pro from "./model-texts/byd-yuan-pro.js";
import geely_galaxy_e8 from "./model-texts/geely-galaxy-e8.js";
import geely_starship_7 from "./model-texts/geely-starship-7.js";
import lynk_co_06 from "./model-texts/lynk-co-06.js";
import lynk_co_09 from "./model-texts/lynk-co-09.js";
import denza_z9gt from "./model-texts/denza-z9gt.js";
import bmw_i7 from "./model-texts/bmw-i7.js";
import lynk_co_z20 from "./model-texts/lynk-co-z20.js";
import denza_n9 from "./model-texts/denza-n9.js";
import mercedes_benz_eqs from "./model-texts/mercedes-benz-eqs.js";
import mercedes_benz_eqc from "./model-texts/mercedes-benz-eqc.js";
import zeekr_7x from "./model-texts/zeekr-7x.js";
import deepal_s09 from "./model-texts/deepal-s09.js";
import leapmotor_lafa_5 from "./model-texts/leapmotor-lafa-5.js";
import voyah_zhuiguang from "./model-texts/voyah-zhuiguang.js";
import mercedes_benz_eqb from "./model-texts/mercedes-benz-eqb.js";
import audi_e5_sportback from "./model-texts/audi-e5-sportback.js";
import bmw_xm from "./model-texts/bmw-xm.js";
import voyah_zhuiguang_l from "./model-texts/voyah-zhuiguang-l.js";
import lynk_co_10 from "./model-texts/lynk-co-10.js";
import mercedes_benz_gle_hybrid from "./model-texts/mercedes-benz-gle-hybrid.js";
import tesla_model_x from "./model-texts/tesla-model-x.js";
import tesla_model_y_l from "./model-texts/tesla-model-y-l.js";
import mercedes_benz_c_class from "./model-texts/mercedes-benz-c-class.js";
import audi_a3 from "./model-texts/audi-a3.js";
import mercedes_benz_e_class from "./model-texts/mercedes-benz-e-class.js";
import bmw_3_series from "./model-texts/bmw-3-series.js";
import audi_a6l from "./model-texts/audi-a6l.js";
import bmw_5_series_petrol from "./model-texts/bmw-5-series-petrol.js";
import mercedes_benz_glc from "./model-texts/mercedes-benz-glc.js";
import volkswagen_golf from "./model-texts/volkswagen-golf.js";
import audi_q3 from "./model-texts/audi-q3.js";
import bmw_x1 from "./model-texts/bmw-x1.js";
import buick_gl8 from "./model-texts/buick-gl8.js";
import haval_h6 from "./model-texts/haval-h6.js";
import audi_a4l from "./model-texts/audi-a4l.js";
import volkswagen_lamando from "./model-texts/volkswagen-lamando.js";
import bmw_x3 from "./model-texts/bmw-x3.js";
import volkswagen_tayron from "./model-texts/volkswagen-tayron.js";
import volkswagen_passat from "./model-texts/volkswagen-passat.js";
import volkswagen_magotan from "./model-texts/volkswagen-magotan.js";
import cadillac_ct5 from "./model-texts/cadillac-ct5.js";
import hyundai_elantra from "./model-texts/hyundai-elantra.js";
import nissan_sylphy from "./model-texts/nissan-sylphy.js";
import volkswagen_tiguan_l from "./model-texts/volkswagen-tiguan-l.js";
import geely_xing_rui from "./model-texts/geely-xing-rui.js";
import volkswagen_tharu from "./model-texts/volkswagen-tharu.js";
import volkswagen_sagitar from "./model-texts/volkswagen-sagitar.js";
import audi_q5l from "./model-texts/audi-q5l.js";
import volkswagen_lavida from "./model-texts/volkswagen-lavida.js";
import mercedes_benz_a_class from "./model-texts/mercedes-benz-a-class.js";
import mercedes_benz_glb from "./model-texts/mercedes-benz-glb.js";
import changan_uni_v from "./model-texts/changan-uni-v.js";
import hongqi_h5 from "./model-texts/hongqi-h5.js";
import lynk_co_03 from "./model-texts/lynk-co-03.js";
import volkswagen_t_roc from "./model-texts/volkswagen-t-roc.js";
import mercedes_benz_s_class from "./model-texts/mercedes-benz-s-class.js";
import porsche_macan from "./model-texts/porsche-macan.js";
import porsche_panamera from "./model-texts/porsche-panamera.js";
import land_rover_range_rover from "./model-texts/land-rover-range-rover.js";
import audi_q2l from "./model-texts/audi-q2l.js";
import changan_cs75_plus from "./model-texts/changan-cs75-plus.js";
import land_rover_defender from "./model-texts/land-rover-defender.js";
import changan_eado from "./model-texts/changan-eado.js";
import honda_civic from "./model-texts/honda-civic.js";
import volkswagen_teramont from "./model-texts/volkswagen-teramont.js";
import honda_accord from "./model-texts/honda-accord.js";
import volkswagen_bora from "./model-texts/volkswagen-bora.js";
import porsche_911 from "./model-texts/porsche-911.js";
import mercedes_benz_vito from "./model-texts/mercedes-benz-vito.js";
import mazda_mazda3_axela from "./model-texts/mazda-mazda3-axela.js";
import chevrolet_monza from "./model-texts/chevrolet-monza.js";
import mercedes_benz_gle from "./model-texts/mercedes-benz-gle.js";
import mini_cooper from "./model-texts/mini-cooper.js";
import toyota_camry from "./model-texts/toyota-camry.js";
import bmw_x5 from "./model-texts/bmw-x5.js";
import mercedes_benz_g_class from "./model-texts/mercedes-benz-g-class.js";
import geely_xingyue_l from "./model-texts/geely-xingyue-l.js";
import mercedes_benz_maybach_s_class from "./model-texts/mercedes-benz-maybach-s-class.js";
import volvo_xc60 from "./model-texts/volvo-xc60.js";
import honda_xr_v from "./model-texts/honda-xr-v.js";
import land_rover_range_rover_sport from "./model-texts/land-rover-range-rover-sport.js";
import nissan_teana from "./model-texts/nissan-teana.js";
import land_rover_discovery_sport from "./model-texts/land-rover-discovery-sport.js";
import buick_excelle from "./model-texts/buick-excelle.js";
import chery_arrizo_8 from "./model-texts/chery-arrizo-8.js";
import hongqi_hs5 from "./model-texts/hongqi-hs5.js";
import honda_vezel from "./model-texts/honda-vezel.js";
import nissan_x_trail from "./model-texts/nissan-x-trail.js";
import mg_mg5 from "./model-texts/mg-mg5.js";
import volvo_s90 from "./model-texts/volvo-s90.js";
import nissan_qashqai from "./model-texts/nissan-qashqai.js";
import lexus_es from "./model-texts/lexus-es.js";
import mercedes_benz_v_class from "./model-texts/mercedes-benz-v-class.js";
import geely_boyue from "./model-texts/geely-boyue.js";
import honda_cr_v from "./model-texts/honda-cr-v.js";
import haval_big_dog from "./model-texts/haval-big-dog.js";
import bmw_4_series from "./model-texts/bmw-4-series.js";
import porsche_718 from "./model-texts/porsche-718.js";
import ford_mondeo from "./model-texts/ford-mondeo.js";
import honda_haoying from "./model-texts/honda-haoying.js";
import geely_emgrand from "./model-texts/geely-emgrand.js";
import geely_binyue from "./model-texts/geely-binyue.js";
import jetour_x70_plus from "./model-texts/jetour-x70-plus.js";
import cadillac_xt5 from "./model-texts/cadillac-xt5.js";
import toyota_rav4_rongfang from "./model-texts/toyota-rav4-rongfang.js";
import audi_q7 from "./model-texts/audi-q7.js";
import volkswagen_cc from "./model-texts/volkswagen-cc.js";
import buick_regal from "./model-texts/buick-regal.js";
import porsche_cayenne from "./model-texts/porsche-cayenne.js";
import land_rover_range_rover_evoque from "./model-texts/land-rover-range-rover-evoque.js";
import honda_fit from "./model-texts/honda-fit.js";
import bmw_1_series from "./model-texts/bmw-1-series.js";
import { MODEL_PAGES } from "./model-pages.js";

// Файл текста на каждый обзор: ключ — тот же slug, что в model-pages.js.
export const MODEL_TEXTS_RAW = {
  "zeekr-007gt": zeekr_007gt,
  "tesla-model-y": tesla_model_y,
  "tesla-model-3": tesla_model_3,
  "byd-seagull": byd_seagull,
  "byd-qin-plus": byd_qin_plus,
  "li-auto-l7": li_auto_l7,
  "li-auto-l9": li_auto_l9,
  "byd-han": byd_han,
  "nio-es6": nio_es6,
  "leapmotor-t03": leapmotor_t03,
  "byd-dolphin": byd_dolphin,
  "li-auto-l8": li_auto_l8,
  "xiaomi-su7": xiaomi_su7,
  "li-auto-li-one": li_auto_li_one,
  "xpeng-p7": xpeng_p7,
  "leapmotor-c11": leapmotor_c11,
  "bmw-i3": bmw_i3,
  "byd-qin-l": byd_qin_l,
  "volkswagen-id3": volkswagen_id3,
  "hima-m9": hima_m9,
  "nio-es8": nio_es8,
  "hima-m7": hima_m7,
  "li-auto-l6": li_auto_l6,
  "denza-d9": denza_d9,
  "nio-et5t": nio_et5t,
  "aion-y": aion_y,
  "geely-galaxy-panda": geely_galaxy_panda,
  "voyah-dreamer": voyah_dreamer,
  "zeekr-001": zeekr_001,
  "xpeng-mona-m03": xpeng_mona_m03,
  "ora-good-cat": ora_good_cat,
  "nio-ec6": nio_ec6,
  "byd-tang": byd_tang,
  "byd-song-plus-phev": byd_song_plus_phev,
  "byd-yuan-plus": byd_yuan_plus,
  "leapmotor-c10": leapmotor_c10,
  "xiaomi-yu7": xiaomi_yu7,
  "hima-shangjie": hima_shangjie,
  "leapmotor-c16": leapmotor_c16,
  "voyah-free": voyah_free,
  "byd-seal-06": byd_seal_06,
  "hima-m5": hima_m5,
  "byd-song-pro": byd_song_pro,
  "nio-et5": nio_et5,
  "leapmotor-b01": leapmotor_b01,
  "leapmotor-b10": leapmotor_b10,
  "bmw-5-series": bmw_5_series,
  "li-auto-mega": li_auto_mega,
  "byd-destroyer-05": byd_destroyer_05,
  "hima-m8": hima_m8,
  "xpeng-g9": xpeng_g9,
  "bmw-ix3": bmw_ix3,
  "geely-galaxy-starry-wish": geely_galaxy_starry_wish,
  "volkswagen-id4-crozz": volkswagen_id4_crozz,
  "volkswagen-id4-x": volkswagen_id4_x,
  "zeekr-009": zeekr_009,
  "xpeng-g6": xpeng_g6,
  "nio-et7": nio_et7,
  "aion-s": aion_s,
  "mercedes-benz-eqe": mercedes_benz_eqe,
  "hongqi-e-qm5": hongqi_e_qm5,
  "hima-luxeed-r7": hima_luxeed_r7,
  "ora-black-cat": ora_black_cat,
  "byd-han-l": byd_han_l,
  "hongqi-e-hs9": hongqi_e_hs9,
  "byd-seal": byd_seal,
  "geely-galaxy-xingyao-8": geely_galaxy_xingyao_8,
  "zeekr-007": zeekr_007,
  "byd-yuan-up": byd_yuan_up,
  "byd-seal-05-dmi": byd_seal_05_dmi,
  "avatr-07": avatr_07,
  "volkswagen-id7": volkswagen_id7,
  "deepal-s05": deepal_s05,
  "deepal-sl03": deepal_sl03,
  "li-auto-i6": li_auto_i6,
  "toyota-bz3x": toyota_bz3x,
  "bmw-i5": bmw_i5,
  "mercedes-benz-eqe-suv": mercedes_benz_eqe_suv,
  "avatr-06": avatr_06,
  "xpeng-g3": xpeng_g3,
  "byd-song-l-dmi": byd_song_l_dmi,
  "xpeng-p7-plus": xpeng_p7_plus,
  "geely-galaxy-a7": geely_galaxy_a7,
  "deepal-s07": deepal_s07,
  "byd-tang-l": byd_tang_l,
  "xpeng-p5": xpeng_p5,
  "geely-galaxy-e5": geely_galaxy_e5,
  "hima-zhijie-s7": hima_zhijie_s7,
  "xiaomi-su7-ultra": xiaomi_su7_ultra,
  "voyah-zhiyin": voyah_zhiyin,
  "avatr-12": avatr_12,
  "zeekr-x": zeekr_x,
  "deepal-l07": deepal_l07,
  "xpeng-g7": xpeng_g7,
  "volkswagen-magotan-gte": volkswagen_magotan_gte,
  "leapmotor-c01": leapmotor_c01,
  "hima-s9": hima_s9,
  "lynk-co-08": lynk_co_08,
  "avatr-11": avatr_11,
  "byd-sealion-06": byd_sealion_06,
  "geely-galaxy-l6": geely_galaxy_l6,
  "geely-galaxy-l7": geely_galaxy_l7,
  "zeekr-9x": zeekr_9x,
  "lynk-co-07": lynk_co_07,
  "byd-song-l-ev": byd_song_l_ev,
  "byd-seal-07-dmi": byd_seal_07_dmi,
  "voyah-taishan": voyah_taishan,
  "byd-yuan-pro": byd_yuan_pro,
  "geely-galaxy-e8": geely_galaxy_e8,
  "geely-starship-7": geely_starship_7,
  "lynk-co-06": lynk_co_06,
  "lynk-co-09": lynk_co_09,
  "denza-z9gt": denza_z9gt,
  "bmw-i7": bmw_i7,
  "lynk-co-z20": lynk_co_z20,
  "denza-n9": denza_n9,
  "mercedes-benz-eqs": mercedes_benz_eqs,
  "mercedes-benz-eqc": mercedes_benz_eqc,
  "zeekr-7x": zeekr_7x,
  "deepal-s09": deepal_s09,
  "leapmotor-lafa-5": leapmotor_lafa_5,
  "voyah-zhuiguang": voyah_zhuiguang,
  "mercedes-benz-eqb": mercedes_benz_eqb,
  "audi-e5-sportback": audi_e5_sportback,
  "bmw-xm": bmw_xm,
  "voyah-zhuiguang-l": voyah_zhuiguang_l,
  "lynk-co-10": lynk_co_10,
  "mercedes-benz-gle-hybrid": mercedes_benz_gle_hybrid,
  "tesla-model-x": tesla_model_x,
  "tesla-model-y-l": tesla_model_y_l,
  "mercedes-benz-c-class": mercedes_benz_c_class,
  "audi-a3": audi_a3,
  "mercedes-benz-e-class": mercedes_benz_e_class,
  "bmw-3-series": bmw_3_series,
  "audi-a6l": audi_a6l,
  "bmw-5-series-petrol": bmw_5_series_petrol,
  "mercedes-benz-glc": mercedes_benz_glc,
  "volkswagen-golf": volkswagen_golf,
  "audi-q3": audi_q3,
  "bmw-x1": bmw_x1,
  "buick-gl8": buick_gl8,
  "haval-h6": haval_h6,
  "audi-a4l": audi_a4l,
  "volkswagen-lamando": volkswagen_lamando,
  "bmw-x3": bmw_x3,
  "volkswagen-tayron": volkswagen_tayron,
  "volkswagen-passat": volkswagen_passat,
  "volkswagen-magotan": volkswagen_magotan,
  "cadillac-ct5": cadillac_ct5,
  "hyundai-elantra": hyundai_elantra,
  "nissan-sylphy": nissan_sylphy,
  "volkswagen-tiguan-l": volkswagen_tiguan_l,
  "geely-xing-rui": geely_xing_rui,
  "volkswagen-tharu": volkswagen_tharu,
  "volkswagen-sagitar": volkswagen_sagitar,
  "audi-q5l": audi_q5l,
  "volkswagen-lavida": volkswagen_lavida,
  "mercedes-benz-a-class": mercedes_benz_a_class,
  "mercedes-benz-glb": mercedes_benz_glb,
  "changan-uni-v": changan_uni_v,
  "hongqi-h5": hongqi_h5,
  "lynk-co-03": lynk_co_03,
  "volkswagen-t-roc": volkswagen_t_roc,
  "mercedes-benz-s-class": mercedes_benz_s_class,
  "porsche-macan": porsche_macan,
  "porsche-panamera": porsche_panamera,
  "land-rover-range-rover": land_rover_range_rover,
  "audi-q2l": audi_q2l,
  "changan-cs75-plus": changan_cs75_plus,
  "land-rover-defender": land_rover_defender,
  "changan-eado": changan_eado,
  "honda-civic": honda_civic,
  "volkswagen-teramont": volkswagen_teramont,
  "honda-accord": honda_accord,
  "volkswagen-bora": volkswagen_bora,
  "porsche-911": porsche_911,
  "mercedes-benz-vito": mercedes_benz_vito,
  "mazda-mazda3-axela": mazda_mazda3_axela,
  "chevrolet-monza": chevrolet_monza,
  "mercedes-benz-gle": mercedes_benz_gle,
  "mini-cooper": mini_cooper,
  "toyota-camry": toyota_camry,
  "bmw-x5": bmw_x5,
  "mercedes-benz-g-class": mercedes_benz_g_class,
  "geely-xingyue-l": geely_xingyue_l,
  "mercedes-benz-maybach-s-class": mercedes_benz_maybach_s_class,
  "volvo-xc60": volvo_xc60,
  "honda-xr-v": honda_xr_v,
  "land-rover-range-rover-sport": land_rover_range_rover_sport,
  "nissan-teana": nissan_teana,
  "land-rover-discovery-sport": land_rover_discovery_sport,
  "buick-excelle": buick_excelle,
  "chery-arrizo-8": chery_arrizo_8,
  "hongqi-hs5": hongqi_hs5,
  "honda-vezel": honda_vezel,
  "nissan-x-trail": nissan_x_trail,
  "mg-mg5": mg_mg5,
  "volvo-s90": volvo_s90,
  "nissan-qashqai": nissan_qashqai,
  "lexus-es": lexus_es,
  "mercedes-benz-v-class": mercedes_benz_v_class,
  "geely-boyue": geely_boyue,
  "honda-cr-v": honda_cr_v,
  "haval-big-dog": haval_big_dog,
  "bmw-4-series": bmw_4_series,
  "porsche-718": porsche_718,
  "ford-mondeo": ford_mondeo,
  "honda-haoying": honda_haoying,
  "geely-emgrand": geely_emgrand,
  "geely-binyue": geely_binyue,
  "jetour-x70-plus": jetour_x70_plus,
  "cadillac-xt5": cadillac_xt5,
  "toyota-rav4-rongfang": toyota_rav4_rongfang,
  "audi-q7": audi_q7,
  "volkswagen-cc": volkswagen_cc,
  "buick-regal": buick_regal,
  "porsche-cayenne": porsche_cayenne,
  "land-rover-range-rover-evoque": land_rover_range_rover_evoque,
  "honda-fit": honda_fit,
  "bmw-1-series": bmw_1_series,
};

// Пока действует льгота, тексты отдаются слово в слово. Когда квота кончится,
// фразы про нулевую пошлину переписываются под новую ставку — так же, как в
// «обложках» обзоров. Результат запоминаем: переписывание идёт по всему тексту,
// а страницу модели робот запрашивает тысячами.
const rewritten = new Map();

/** Текст обзора по адресу файла: `{ intro, stats, sections, versions, faq, disclaimer }`. */
export function modelText(slug) {
  const source = MODEL_TEXTS_RAW[slug];
  if (!source) return null;
  if (!rewritten.has(slug)) rewritten.set(slug, rewriteEvDutyCopyDeep(source));
  return rewritten.get(slug);
}

/** Обзор целиком: обложка из model-pages.js плюс её текст. */
export const modelPageWithText = (page) => (page ? { ...page, ...modelText(page.slug) } : null);

/** Все 130 обзоров с текстом — для сборки и тестов. */
export const modelPagesWithText = () => MODEL_PAGES.map(modelPageWithText);
