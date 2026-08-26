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
import aito_m9 from "./model-texts/aito-m9.js";
import nio_es8 from "./model-texts/nio-es8.js";
import aito_m7 from "./model-texts/aito-m7.js";
import li_auto_l6 from "./model-texts/li-auto-l6.js";
import denza_d9 from "./model-texts/denza-d9.js";
import nio_et5t from "./model-texts/nio-et5t.js";
import aion_y from "./model-texts/aion-y.js";
import geely_galaxy_panda from "./model-texts/geely-galaxy-panda.js";
import voyah_dream from "./model-texts/voyah-dream.js";
import zeekr_001 from "./model-texts/zeekr-001.js";
import xpeng_mona_m03 from "./model-texts/xpeng-mona-m03.js";
import ora_good_cat from "./model-texts/ora-good-cat.js";
import nio_ec6 from "./model-texts/nio-ec6.js";
import byd_tang_dmi from "./model-texts/byd-tang-dmi.js";
import byd_song_plus_dmi from "./model-texts/byd-song-plus-dmi.js";
import byd_yuan_plus from "./model-texts/byd-yuan-plus.js";
import leapmotor_c10 from "./model-texts/leapmotor-c10.js";
import xiaomi_yu7 from "./model-texts/xiaomi-yu7.js";
import shangjie_h5 from "./model-texts/shangjie-h5.js";
import leapmotor_c16 from "./model-texts/leapmotor-c16.js";
import voyah_free from "./model-texts/voyah-free.js";
import byd_seal_06_dmi from "./model-texts/byd-seal-06-dmi.js";
import aito_m5 from "./model-texts/aito-m5.js";
import byd_song_pro from "./model-texts/byd-song-pro.js";
import nio_et5 from "./model-texts/nio-et5.js";
import leapmotor_b01 from "./model-texts/leapmotor-b01.js";
import leapmotor_b10 from "./model-texts/leapmotor-b10.js";
import bmw_5_series from "./model-texts/bmw-5-series.js";
import li_auto_mega from "./model-texts/li-auto-mega.js";
import byd_destroyer_05 from "./model-texts/byd-destroyer-05.js";
import aito_m8 from "./model-texts/aito-m8.js";
import xpeng_g9 from "./model-texts/xpeng-g9.js";
import bmw_ix3 from "./model-texts/bmw-ix3.js";
import geely_ex2 from "./model-texts/geely-ex2.js";
import volkswagen_id4_crozz from "./model-texts/volkswagen-id4-crozz.js";
import volkswagen_id4_x from "./model-texts/volkswagen-id4-x.js";
import zeekr_009 from "./model-texts/zeekr-009.js";
import xpeng_g6 from "./model-texts/xpeng-g6.js";
import nio_et7 from "./model-texts/nio-et7.js";
import aion_s from "./model-texts/aion-s.js";
import mercedes_benz_eqe from "./model-texts/mercedes-benz-eqe.js";
import hongqi_e_qm5 from "./model-texts/hongqi-e-qm5.js";
import luxeed_r7 from "./model-texts/luxeed-r7.js";
import ora_black_cat from "./model-texts/ora-black-cat.js";
import byd_han_l from "./model-texts/byd-han-l.js";
import hongqi_e_hs9 from "./model-texts/hongqi-e-hs9.js";
import byd_seal from "./model-texts/byd-seal.js";
import geely_galaxy_starshine_8 from "./model-texts/geely-galaxy-starshine-8.js";
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
import geely_ex5 from "./model-texts/geely-ex5.js";
import luxeed_s7 from "./model-texts/luxeed-s7.js";
import xiaomi_su7_ultra from "./model-texts/xiaomi-su7-ultra.js";
import voyah_courage from "./model-texts/voyah-courage.js";
import avatr_12 from "./model-texts/avatr-12.js";
import zeekr_x from "./model-texts/zeekr-x.js";
import deepal_l07 from "./model-texts/deepal-l07.js";
import xpeng_g7 from "./model-texts/xpeng-g7.js";
import volkswagen_magotan_gte from "./model-texts/volkswagen-magotan-gte.js";
import leapmotor_c01 from "./model-texts/leapmotor-c01.js";
import stelato_s9 from "./model-texts/stelato-s9.js";
import lynk_co_08 from "./model-texts/lynk-co-08.js";
import avatr_11 from "./model-texts/avatr-11.js";
import byd_sealion_06_dmi from "./model-texts/byd-sealion-06-dmi.js";
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
import denza_z9_gt from "./model-texts/denza-z9-gt.js";
import bmw_i7 from "./model-texts/bmw-i7.js";
import lynk_co_z20 from "./model-texts/lynk-co-z20.js";
import denza_n9 from "./model-texts/denza-n9.js";
import mercedes_benz_eqs from "./model-texts/mercedes-benz-eqs.js";
import mercedes_benz_eqc from "./model-texts/mercedes-benz-eqc.js";
import zeekr_7x from "./model-texts/zeekr-7x.js";
import deepal_s09 from "./model-texts/deepal-s09.js";
import leapmotor_lafa_5 from "./model-texts/leapmotor-lafa-5.js";
import voyah_passion from "./model-texts/voyah-passion.js";
import mercedes_benz_eqb from "./model-texts/mercedes-benz-eqb.js";
import audi_e5_sportback from "./model-texts/audi-e5-sportback.js";
import voyah_passion_l from "./model-texts/voyah-passion-l.js";
import lynk_co_10 from "./model-texts/lynk-co-10.js";
import mercedes_benz_gle_phev from "./model-texts/mercedes-benz-gle-phev.js";
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
import hyundai_elantra from "./model-texts/hyundai-elantra.js";
import nissan_sylphy from "./model-texts/nissan-sylphy.js";
import volkswagen_tiguan_l from "./model-texts/volkswagen-tiguan-l.js";
import geely_preface from "./model-texts/geely-preface.js";
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
import mercedes_benz_vito from "./model-texts/mercedes-benz-vito.js";
import mazda_mazda3 from "./model-texts/mazda-mazda3.js";
import chevrolet_monza from "./model-texts/chevrolet-monza.js";
import mercedes_benz_gle from "./model-texts/mercedes-benz-gle.js";
import mini_cooper from "./model-texts/mini-cooper.js";
import toyota_camry from "./model-texts/toyota-camry.js";
import bmw_x5 from "./model-texts/bmw-x5.js";
import geely_monjaro from "./model-texts/geely-monjaro.js";
import mercedes_benz_maybach_s_class from "./model-texts/mercedes-benz-maybach-s-class.js";
import volvo_xc60 from "./model-texts/volvo-xc60.js";
import honda_xr_v from "./model-texts/honda-xr-v.js";
import land_rover_range_rover_sport from "./model-texts/land-rover-range-rover-sport.js";
import nissan_teana from "./model-texts/nissan-teana.js";
import land_rover_discovery_sport from "./model-texts/land-rover-discovery-sport.js";
import buick_excelle from "./model-texts/buick-excelle.js";
import chery_arrizo_8 from "./model-texts/chery-arrizo-8.js";
import hongqi_hs5 from "./model-texts/hongqi-hs5.js";
import honda_hr_v from "./model-texts/honda-hr-v.js";
import nissan_x_trail from "./model-texts/nissan-x-trail.js";
import mg_mg5 from "./model-texts/mg-mg5.js";
import volvo_s90 from "./model-texts/volvo-s90.js";
import nissan_qashqai from "./model-texts/nissan-qashqai.js";
import lexus_es from "./model-texts/lexus-es.js";
import mercedes_benz_v_class from "./model-texts/mercedes-benz-v-class.js";
import geely_boyue from "./model-texts/geely-boyue.js";
import honda_cr_v from "./model-texts/honda-cr-v.js";
import haval_dargo from "./model-texts/haval-dargo.js";
import bmw_4_series from "./model-texts/bmw-4-series.js";
import porsche_718 from "./model-texts/porsche-718.js";
import ford_mondeo from "./model-texts/ford-mondeo.js";
import honda_breeze from "./model-texts/honda-breeze.js";
import geely_emgrand from "./model-texts/geely-emgrand.js";
import geely_coolray from "./model-texts/geely-coolray.js";
import jetour_x70_plus from "./model-texts/jetour-x70-plus.js";
import toyota_rav4 from "./model-texts/toyota-rav4.js";
import audi_q7 from "./model-texts/audi-q7.js";
import volkswagen_passat_cc from "./model-texts/volkswagen-passat-cc.js";
import buick_regal from "./model-texts/buick-regal.js";
import porsche_cayenne from "./model-texts/porsche-cayenne.js";
import land_rover_range_rover_evoque from "./model-texts/land-rover-range-rover-evoque.js";
import honda_fit from "./model-texts/honda-fit.js";
import bmw_1_series from "./model-texts/bmw-1-series.js";
import bmw_x2 from "./model-texts/bmw-x2.js";
import changan_uni_t from "./model-texts/changan-uni-t.js";
import audi_a8 from "./model-texts/audi-a8.js";
import changan_cs55_plus from "./model-texts/changan-cs55-plus.js";
import haval_m6 from "./model-texts/haval-m6.js";
import buick_envision_plus from "./model-texts/buick-envision-plus.js";
import volkswagen_talagon from "./model-texts/volkswagen-talagon.js";
import jaguar_xel from "./model-texts/jaguar-xel.js";
import mazda_cx_5 from "./model-texts/mazda-cx-5.js";
import audi_a7l from "./model-texts/audi-a7l.js";
import lexus_rx from "./model-texts/lexus-rx.js";
import geely_binrui from "./model-texts/geely-binrui.js";
import hongqi_h9 from "./model-texts/hongqi-h9.js";
import buick_lacrosse from "./model-texts/buick-lacrosse.js";
import toyota_levin from "./model-texts/toyota-levin.js";
import toyota_avalon from "./model-texts/toyota-avalon.js";
import buick_verano from "./model-texts/buick-verano.js";
import jetour_t2 from "./model-texts/jetour-t2.js";
import bmw_7_series from "./model-texts/bmw-7-series.js";
import lynk_co_06_petrol from "./model-texts/lynk-co-06-petrol.js";
import toyota_corolla from "./model-texts/toyota-corolla.js";
import mercedes_benz_gla from "./model-texts/mercedes-benz-gla.js";
import volkswagen_viloran from "./model-texts/volkswagen-viloran.js";
import honda_integra from "./model-texts/honda-integra.js";
import lexus_nx from "./model-texts/lexus-nx.js";
import mazda_cx_4 from "./model-texts/mazda-cx-4.js";
import chevrolet_malibu_xl from "./model-texts/chevrolet-malibu-xl.js";
import toyota_wildlander from "./model-texts/toyota-wildlander.js";
import honda_inspire from "./model-texts/honda-inspire.js";
import mg_mg7 from "./model-texts/mg-mg7.js";
import ford_explorer from "./model-texts/ford-explorer.js";
import jaguar_xfl from "./model-texts/jaguar-xfl.js";
import hyundai_ix35 from "./model-texts/hyundai-ix35.js";
import geely_boyue_l from "./model-texts/geely-boyue-l.js";
import volvo_s60 from "./model-texts/volvo-s60.js";
import honda_avancier from "./model-texts/honda-avancier.js";
import mg_mg6 from "./model-texts/mg-mg6.js";
import volkswagen_polo from "./model-texts/volkswagen-polo.js";
import volvo_xc90 from "./model-texts/volvo-xc90.js";
import mitsubishi_outlander from "./model-texts/mitsubishi-outlander.js";
import geely_emgrand_x6 from "./model-texts/geely-emgrand-x6.js";
import kia_kx1 from "./model-texts/kia-kx1.js";
import ford_focus from "./model-texts/ford-focus.js";
import bmw_6_series_gt from "./model-texts/bmw-6-series-gt.js";
import mazda_mazda6 from "./model-texts/mazda-mazda6.js";
import chery_tiggo_7 from "./model-texts/chery-tiggo-7.js";
import toyota_frontlander from "./model-texts/toyota-frontlander.js";
import changan_cs75 from "./model-texts/changan-cs75.js";
import nissan_tiida from "./model-texts/nissan-tiida.js";
import audi_a5 from "./model-texts/audi-a5.js";
import volkswagen_tanying from "./model-texts/volkswagen-tanying.js";
import volkswagen_touareg from "./model-texts/volkswagen-touareg.js";
import geely_vision_x3 from "./model-texts/geely-vision-x3.js";
import geely_icon from "./model-texts/geely-icon.js";
import mercedes_benz_a_class_amg from "./model-texts/mercedes-benz-a-class-amg.js";
import land_rover_discovery from "./model-texts/land-rover-discovery.js";
import toyota_yaris from "./model-texts/toyota-yaris.js";
import chery_tiggo_8_pro from "./model-texts/chery-tiggo-8-pro.js";
import ford_edge from "./model-texts/ford-edge.js";
import audi_a7 from "./model-texts/audi-a7.js";
import jetour_dashing from "./model-texts/jetour-dashing.js";
import changan_cs35_plus from "./model-texts/changan-cs35-plus.js";
import chery_tiggo_8_pro_max from "./model-texts/chery-tiggo-8-pro-max.js";
import chery_tiggo_8 from "./model-texts/chery-tiggo-8.js";
import mercedes_benz_glc_coupe from "./model-texts/mercedes-benz-glc-coupe.js";
import land_rover_range_rover_velar from "./model-texts/land-rover-range-rover-velar.js";
import audi_q3_sportback from "./model-texts/audi-q3-sportback.js";
import volkswagen_id_unyx_06 from "./model-texts/volkswagen-id-unyx-06.js";
import toyota_highlander from "./model-texts/toyota-highlander.js";
import lynk_co_05 from "./model-texts/lynk-co-05.js";
import kia_k3 from "./model-texts/kia-k3.js";
import buick_enclave from "./model-texts/buick-enclave.js";
import zeekr_mix from "./model-texts/zeekr-mix.js";
import mercedes_benz_e_class_phev from "./model-texts/mercedes-benz-e-class-phev.js";
import kia_k5 from "./model-texts/kia-k5.js";
import jetour_x70 from "./model-texts/jetour-x70.js";
import ford_escape from "./model-texts/ford-escape.js";
import bmw_x6 from "./model-texts/bmw-x6.js";
import mini_clubman from "./model-texts/mini-clubman.js";
import haval_chitu from "./model-texts/haval-chitu.js";
import volkswagen_golf_gti from "./model-texts/volkswagen-golf-gti.js";
import li_auto_i8 from "./model-texts/li-auto-i8.js";
import mini_countryman from "./model-texts/mini-countryman.js";
import denza_n8l from "./model-texts/denza-n8l.js";
import mazda_cx_50 from "./model-texts/mazda-cx-50.js";
import changan_uni_k from "./model-texts/changan-uni-k.js";
import chery_tiggo_3x from "./model-texts/chery-tiggo-3x.js";
import haval_h9 from "./model-texts/haval-h9.js";
import chery_arrizo_8_pro from "./model-texts/chery-arrizo-8-pro.js";
import aion_s_plus from "./model-texts/aion-s-plus.js";
import mercedes_benz_cla from "./model-texts/mercedes-benz-cla.js";
import buick_envision_s from "./model-texts/buick-envision-s.js";
import peugeot_2008 from "./model-texts/peugeot-2008.js";
import jeep_wrangler from "./model-texts/jeep-wrangler.js";
import ford_escort from "./model-texts/ford-escort.js";
import audi_q8 from "./model-texts/audi-q8.js";
import mini_jcw from "./model-texts/mini-jcw.js";
import great_wall_poer from "./model-texts/great-wall-poer.js";
import geely_emgrand_s from "./model-texts/geely-emgrand-s.js";
import nissan_terra from "./model-texts/nissan-terra.js";
import jaguar_f_pace from "./model-texts/jaguar-f-pace.js";
import ford_bronco from "./model-texts/ford-bronco.js";
import deepal_g318 from "./model-texts/deepal-g318.js";
import stelato_s9t from "./model-texts/stelato-s9t.js";
import volkswagen_santana from "./model-texts/volkswagen-santana.js";
import honda_ur_v from "./model-texts/honda-ur-v.js";
import volvo_xc40 from "./model-texts/volvo-xc40.js";
import toyota_corolla_cross from "./model-texts/toyota-corolla-cross.js";
import bmw_x4 from "./model-texts/bmw-x4.js";
import audi_a5l from "./model-texts/audi-a5l.js";
import mercedes_benz_cls from "./model-texts/mercedes-benz-cls.js";
import aion_v from "./model-texts/aion-v.js";
import volkswagen_tiguan_l_phev from "./model-texts/volkswagen-tiguan-l-phev.js";
import hongqi_hq9_phev from "./model-texts/hongqi-hq9-phev.js";
import audi_a6 from "./model-texts/audi-a6.js";
import chery_tiggo_7_pro_max from "./model-texts/chery-tiggo-7-pro-max.js";
import volkswagen_t_cross from "./model-texts/volkswagen-t-cross.js";
import subaru_forester from "./model-texts/subaru-forester.js";
import chevrolet_cavalier from "./model-texts/chevrolet-cavalier.js";
import lynk_co_01 from "./model-texts/lynk-co-01.js";
import buick_century from "./model-texts/buick-century.js";
import chevrolet_equinox from "./model-texts/chevrolet-equinox.js";
import nio_es7 from "./model-texts/nio-es7.js";
import aion_ut from "./model-texts/aion-ut.js";
import volkswagen_tayron_gte from "./model-texts/volkswagen-tayron-gte.js";
import haval_f7 from "./model-texts/haval-f7.js";
import jetour_x90_plus from "./model-texts/jetour-x90-plus.js";
import ora_white_cat from "./model-texts/ora-white-cat.js";
import byd_e2 from "./model-texts/byd-e2.js";
import lynk_co_02 from "./model-texts/lynk-co-02.js";
import mercedes_benz_gle_amg from "./model-texts/mercedes-benz-gle-amg.js";
import kia_sportage from "./model-texts/kia-sportage.js";
import mg_mg5_scorpio from "./model-texts/mg-mg5-scorpio.js";
import ford_ranger from "./model-texts/ford-ranger.js";
import honda_life from "./model-texts/honda-life.js";
import bmw_ix1 from "./model-texts/bmw-ix1.js";
import bmw_3_series_gt from "./model-texts/bmw-3-series-gt.js";
import geely_okavango from "./model-texts/geely-okavango.js";
import hongqi_h6 from "./model-texts/hongqi-h6.js";
import mercedes_benz_c_class_amg from "./model-texts/mercedes-benz-c-class-amg.js";
import hongqi_h5_phev from "./model-texts/hongqi-h5-phev.js";
import chery_arrizo_5_plus from "./model-texts/chery-arrizo-5-plus.js";
import byd_frigate_07 from "./model-texts/byd-frigate-07.js";
import hongqi_hs3_phev from "./model-texts/hongqi-hs3-phev.js";
import toyota_vios from "./model-texts/toyota-vios.js";
import hongqi_hs3 from "./model-texts/hongqi-hs3.js";
import mercedes_benz_glc_amg from "./model-texts/mercedes-benz-glc-amg.js";
import kia_kx3 from "./model-texts/kia-kx3.js";
import geely_emgrand_gt from "./model-texts/geely-emgrand-gt.js";
import mercedes_benz_gle_coupe from "./model-texts/mercedes-benz-gle-coupe.js";
import changan_raeton_cc from "./model-texts/changan-raeton-cc.js";
import nissan_kicks from "./model-texts/nissan-kicks.js";
import bmw_z4 from "./model-texts/bmw-z4.js";
import ford_territory from "./model-texts/ford-territory.js";
import volkswagen_passat_phev from "./model-texts/volkswagen-passat-phev.js";
import volkswagen_tayron_x from "./model-texts/volkswagen-tayron-x.js";
import changan_yida from "./model-texts/changan-yida.js";
import bmw_ix from "./model-texts/bmw-ix.js";
import mg_zs from "./model-texts/mg-zs.js";
import maserati_levante from "./model-texts/maserati-levante.js";
import toyota_c_hr from "./model-texts/toyota-c-hr.js";
import hyundai_custin from "./model-texts/hyundai-custin.js";
import buick_gl6 from "./model-texts/buick-gl6.js";
import lynk_co_900 from "./model-texts/lynk-co-900.js";
import ford_mustang from "./model-texts/ford-mustang.js";
import mercedes_benz_gls from "./model-texts/mercedes-benz-gls.js";
import audi_q5l_sportback from "./model-texts/audi-q5l-sportback.js";
import xpeng_x9 from "./model-texts/xpeng-x9.js";
import byd_seal_06_dmi_touring from "./model-texts/byd-seal-06-dmi-touring.js";
import byd_xia from "./model-texts/byd-xia.js";
import honda_crider from "./model-texts/honda-crider.js";
import chery_tiggo_9 from "./model-texts/chery-tiggo-9.js";
import bmw_2_series from "./model-texts/bmw-2-series.js";
import mazda_cx_30 from "./model-texts/mazda-cx-30.js";
import hongqi_hs7_phev from "./model-texts/hongqi-hs7-phev.js";
import hyundai_tucson from "./model-texts/hyundai-tucson.js";
import bmw_x7 from "./model-texts/bmw-x7.js";
import kia_seltos from "./model-texts/kia-seltos.js";
import audi_s4 from "./model-texts/audi-s4.js";
import chery_tiggo_4_pro from "./model-texts/chery-tiggo-4-pro.js";
import haval_dargo_ii from "./model-texts/haval-dargo-ii.js";
import mercedes_benz_cla_amg from "./model-texts/mercedes-benz-cla-amg.js";
import geely_emgrand_gs from "./model-texts/geely-emgrand-gs.js";
import geely_emgrand_gl from "./model-texts/geely-emgrand-gl.js";
import toyota_venza from "./model-texts/toyota-venza.js";
import mercedes_benz_b_class from "./model-texts/mercedes-benz-b-class.js";
import toyota_bz3 from "./model-texts/toyota-bz3.js";
import geely_galaxy_starshine_6 from "./model-texts/geely-galaxy-starshine-6.js";
import hyundai_ix25 from "./model-texts/hyundai-ix25.js";
import byd_sealion_05_ev from "./model-texts/byd-sealion-05-ev.js";
import mercedes_benz_glb_amg from "./model-texts/mercedes-benz-glb-amg.js";
import audi_a4 from "./model-texts/audi-a4.js";
import byd_song_plus from "./model-texts/byd-song-plus.js";
import lynk_co_09_petrol from "./model-texts/lynk-co-09-petrol.js";
import audi_q6 from "./model-texts/audi-q6.js";
import byd_song_max from "./model-texts/byd-song-max.js";
import volkswagen_touran from "./model-texts/volkswagen-touran.js";
import volvo_v90 from "./model-texts/volvo-v90.js";
import geely_galaxy_m9 from "./model-texts/geely-galaxy-m9.js";
import audi_a6l_phev from "./model-texts/audi-a6l-phev.js";
import hyundai_santa_fe from "./model-texts/hyundai-santa-fe.js";
import byd_song from "./model-texts/byd-song.js";
import byd_seal_06gt from "./model-texts/byd-seal-06gt.js";
import bmw_x3_m from "./model-texts/bmw-x3-m.js";
import bmw_i4 from "./model-texts/bmw-i4.js";
import changan_uni_z from "./model-texts/changan-uni-z.js";
import mercedes_benz_cle from "./model-texts/mercedes-benz-cle.js";
import byd_song_pro_petrol from "./model-texts/byd-song-pro-petrol.js";
import byd_sealion_07_ev from "./model-texts/byd-sealion-07-ev.js";
import mercedes_benz_c_class_phev from "./model-texts/mercedes-benz-c-class-phev.js";
import bmw_8_series from "./model-texts/bmw-8-series.js";
import mercedes_benz_eqa from "./model-texts/mercedes-benz-eqa.js";
import audi_rs_5 from "./model-texts/audi-rs-5.js";
import geely_emgrand_l from "./model-texts/geely-emgrand-l.js";
import bmw_m3 from "./model-texts/bmw-m3.js";
import audi_s5 from "./model-texts/audi-s5.js";
import volkswagen_id6_crozz from "./model-texts/volkswagen-id6-crozz.js";
import bmw_x4_m from "./model-texts/bmw-x4-m.js";
import toyota_bz5 from "./model-texts/toyota-bz5.js";
import byd_song_max_dmi from "./model-texts/byd-song-max-dmi.js";
import deepal_l06 from "./model-texts/deepal-l06.js";
import toyota_bz4x from "./model-texts/toyota-bz4x.js";
import mercedes_benz_glc_coupe_amg from "./model-texts/mercedes-benz-glc-coupe-amg.js";
import volkswagen_id6_x from "./model-texts/volkswagen-id6-x.js";
import audi_a5l_sportback from "./model-texts/audi-a5l-sportback.js";
import toyota_bz7 from "./model-texts/toyota-bz7.js";
import byd_tang_petrol from "./model-texts/byd-tang-petrol.js";
import nio_et9 from "./model-texts/nio-et9.js";
import mazda_ez_6 from "./model-texts/mazda-ez-6.js";
import bmw_x4_m40i from "./model-texts/bmw-x4-m40i.js";
import bmw_x5_phev from "./model-texts/bmw-x5-phev.js";
import zeekr_8x from "./model-texts/zeekr-8x.js";
import zeekr_001_fr from "./model-texts/zeekr-001-fr.js";
import mazda_ez_60 from "./model-texts/mazda-ez-60.js";
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
  "aito-m9": aito_m9,
  "nio-es8": nio_es8,
  "aito-m7": aito_m7,
  "li-auto-l6": li_auto_l6,
  "denza-d9": denza_d9,
  "nio-et5t": nio_et5t,
  "aion-y": aion_y,
  "geely-galaxy-panda": geely_galaxy_panda,
  "voyah-dream": voyah_dream,
  "zeekr-001": zeekr_001,
  "xpeng-mona-m03": xpeng_mona_m03,
  "ora-good-cat": ora_good_cat,
  "nio-ec6": nio_ec6,
  "byd-tang-dmi": byd_tang_dmi,
  "byd-song-plus-dmi": byd_song_plus_dmi,
  "byd-yuan-plus": byd_yuan_plus,
  "leapmotor-c10": leapmotor_c10,
  "xiaomi-yu7": xiaomi_yu7,
  "shangjie-h5": shangjie_h5,
  "leapmotor-c16": leapmotor_c16,
  "voyah-free": voyah_free,
  "byd-seal-06-dmi": byd_seal_06_dmi,
  "aito-m5": aito_m5,
  "byd-song-pro": byd_song_pro,
  "nio-et5": nio_et5,
  "leapmotor-b01": leapmotor_b01,
  "leapmotor-b10": leapmotor_b10,
  "bmw-5-series": bmw_5_series,
  "li-auto-mega": li_auto_mega,
  "byd-destroyer-05": byd_destroyer_05,
  "aito-m8": aito_m8,
  "xpeng-g9": xpeng_g9,
  "bmw-ix3": bmw_ix3,
  "geely-ex2": geely_ex2,
  "volkswagen-id4-crozz": volkswagen_id4_crozz,
  "volkswagen-id4-x": volkswagen_id4_x,
  "zeekr-009": zeekr_009,
  "xpeng-g6": xpeng_g6,
  "nio-et7": nio_et7,
  "aion-s": aion_s,
  "mercedes-benz-eqe": mercedes_benz_eqe,
  "hongqi-e-qm5": hongqi_e_qm5,
  "luxeed-r7": luxeed_r7,
  "ora-black-cat": ora_black_cat,
  "byd-han-l": byd_han_l,
  "hongqi-e-hs9": hongqi_e_hs9,
  "byd-seal": byd_seal,
  "geely-galaxy-starshine-8": geely_galaxy_starshine_8,
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
  "geely-ex5": geely_ex5,
  "luxeed-s7": luxeed_s7,
  "xiaomi-su7-ultra": xiaomi_su7_ultra,
  "voyah-courage": voyah_courage,
  "avatr-12": avatr_12,
  "zeekr-x": zeekr_x,
  "deepal-l07": deepal_l07,
  "xpeng-g7": xpeng_g7,
  "volkswagen-magotan-gte": volkswagen_magotan_gte,
  "leapmotor-c01": leapmotor_c01,
  "stelato-s9": stelato_s9,
  "lynk-co-08": lynk_co_08,
  "avatr-11": avatr_11,
  "byd-sealion-06-dmi": byd_sealion_06_dmi,
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
  "denza-z9-gt": denza_z9_gt,
  "bmw-i7": bmw_i7,
  "lynk-co-z20": lynk_co_z20,
  "denza-n9": denza_n9,
  "mercedes-benz-eqs": mercedes_benz_eqs,
  "mercedes-benz-eqc": mercedes_benz_eqc,
  "zeekr-7x": zeekr_7x,
  "deepal-s09": deepal_s09,
  "leapmotor-lafa-5": leapmotor_lafa_5,
  "voyah-passion": voyah_passion,
  "mercedes-benz-eqb": mercedes_benz_eqb,
  "audi-e5-sportback": audi_e5_sportback,
  "voyah-passion-l": voyah_passion_l,
  "lynk-co-10": lynk_co_10,
  "mercedes-benz-gle-phev": mercedes_benz_gle_phev,
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
  "hyundai-elantra": hyundai_elantra,
  "nissan-sylphy": nissan_sylphy,
  "volkswagen-tiguan-l": volkswagen_tiguan_l,
  "geely-preface": geely_preface,
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
  "mercedes-benz-vito": mercedes_benz_vito,
  "mazda-mazda3": mazda_mazda3,
  "chevrolet-monza": chevrolet_monza,
  "mercedes-benz-gle": mercedes_benz_gle,
  "mini-cooper": mini_cooper,
  "toyota-camry": toyota_camry,
  "bmw-x5": bmw_x5,
  "geely-monjaro": geely_monjaro,
  "mercedes-benz-maybach-s-class": mercedes_benz_maybach_s_class,
  "volvo-xc60": volvo_xc60,
  "honda-xr-v": honda_xr_v,
  "land-rover-range-rover-sport": land_rover_range_rover_sport,
  "nissan-teana": nissan_teana,
  "land-rover-discovery-sport": land_rover_discovery_sport,
  "buick-excelle": buick_excelle,
  "chery-arrizo-8": chery_arrizo_8,
  "hongqi-hs5": hongqi_hs5,
  "honda-hr-v": honda_hr_v,
  "nissan-x-trail": nissan_x_trail,
  "mg-mg5": mg_mg5,
  "volvo-s90": volvo_s90,
  "nissan-qashqai": nissan_qashqai,
  "lexus-es": lexus_es,
  "mercedes-benz-v-class": mercedes_benz_v_class,
  "geely-boyue": geely_boyue,
  "honda-cr-v": honda_cr_v,
  "haval-dargo": haval_dargo,
  "bmw-4-series": bmw_4_series,
  "porsche-718": porsche_718,
  "ford-mondeo": ford_mondeo,
  "honda-breeze": honda_breeze,
  "geely-emgrand": geely_emgrand,
  "geely-coolray": geely_coolray,
  "jetour-x70-plus": jetour_x70_plus,
  "toyota-rav4": toyota_rav4,
  "audi-q7": audi_q7,
  "volkswagen-passat-cc": volkswagen_passat_cc,
  "buick-regal": buick_regal,
  "porsche-cayenne": porsche_cayenne,
  "land-rover-range-rover-evoque": land_rover_range_rover_evoque,
  "honda-fit": honda_fit,
  "bmw-1-series": bmw_1_series,
  "bmw-x2": bmw_x2,
  "changan-uni-t": changan_uni_t,
  "audi-a8": audi_a8,
  "changan-cs55-plus": changan_cs55_plus,
  "haval-m6": haval_m6,
  "buick-envision-plus": buick_envision_plus,
  "volkswagen-talagon": volkswagen_talagon,
  "jaguar-xel": jaguar_xel,
  "mazda-cx-5": mazda_cx_5,
  "audi-a7l": audi_a7l,
  "lexus-rx": lexus_rx,
  "geely-binrui": geely_binrui,
  "hongqi-h9": hongqi_h9,
  "buick-lacrosse": buick_lacrosse,
  "toyota-levin": toyota_levin,
  "toyota-avalon": toyota_avalon,
  "buick-verano": buick_verano,
  "jetour-t2": jetour_t2,
  "bmw-7-series": bmw_7_series,
  "lynk-co-06-petrol": lynk_co_06_petrol,
  "toyota-corolla": toyota_corolla,
  "mercedes-benz-gla": mercedes_benz_gla,
  "volkswagen-viloran": volkswagen_viloran,
  "honda-integra": honda_integra,
  "lexus-nx": lexus_nx,
  "mazda-cx-4": mazda_cx_4,
  "chevrolet-malibu-xl": chevrolet_malibu_xl,
  "toyota-wildlander": toyota_wildlander,
  "honda-inspire": honda_inspire,
  "mg-mg7": mg_mg7,
  "ford-explorer": ford_explorer,
  "jaguar-xfl": jaguar_xfl,
  "hyundai-ix35": hyundai_ix35,
  "geely-boyue-l": geely_boyue_l,
  "volvo-s60": volvo_s60,
  "honda-avancier": honda_avancier,
  "mg-mg6": mg_mg6,
  "volkswagen-polo": volkswagen_polo,
  "volvo-xc90": volvo_xc90,
  "mitsubishi-outlander": mitsubishi_outlander,
  "geely-emgrand-x6": geely_emgrand_x6,
  "kia-kx1": kia_kx1,
  "ford-focus": ford_focus,
  "bmw-6-series-gt": bmw_6_series_gt,
  "mazda-mazda6": mazda_mazda6,
  "chery-tiggo-7": chery_tiggo_7,
  "toyota-frontlander": toyota_frontlander,
  "changan-cs75": changan_cs75,
  "nissan-tiida": nissan_tiida,
  "audi-a5": audi_a5,
  "volkswagen-tanying": volkswagen_tanying,
  "volkswagen-touareg": volkswagen_touareg,
  "geely-vision-x3": geely_vision_x3,
  "geely-icon": geely_icon,
  "mercedes-benz-a-class-amg": mercedes_benz_a_class_amg,
  "land-rover-discovery": land_rover_discovery,
  "toyota-yaris": toyota_yaris,
  "chery-tiggo-8-pro": chery_tiggo_8_pro,
  "ford-edge": ford_edge,
  "audi-a7": audi_a7,
  "jetour-dashing": jetour_dashing,
  "changan-cs35-plus": changan_cs35_plus,
  "chery-tiggo-8-pro-max": chery_tiggo_8_pro_max,
  "chery-tiggo-8": chery_tiggo_8,
  "mercedes-benz-glc-coupe": mercedes_benz_glc_coupe,
  "land-rover-range-rover-velar": land_rover_range_rover_velar,
  "audi-q3-sportback": audi_q3_sportback,
  "volkswagen-id-unyx-06": volkswagen_id_unyx_06,
  "toyota-highlander": toyota_highlander,
  "lynk-co-05": lynk_co_05,
  "kia-k3": kia_k3,
  "buick-enclave": buick_enclave,
  "zeekr-mix": zeekr_mix,
  "mercedes-benz-e-class-phev": mercedes_benz_e_class_phev,
  "kia-k5": kia_k5,
  "jetour-x70": jetour_x70,
  "ford-escape": ford_escape,
  "bmw-x6": bmw_x6,
  "mini-clubman": mini_clubman,
  "haval-chitu": haval_chitu,
  "volkswagen-golf-gti": volkswagen_golf_gti,
  "li-auto-i8": li_auto_i8,
  "mini-countryman": mini_countryman,
  "denza-n8l": denza_n8l,
  "mazda-cx-50": mazda_cx_50,
  "changan-uni-k": changan_uni_k,
  "chery-tiggo-3x": chery_tiggo_3x,
  "haval-h9": haval_h9,
  "chery-arrizo-8-pro": chery_arrizo_8_pro,
  "aion-s-plus": aion_s_plus,
  "mercedes-benz-cla": mercedes_benz_cla,
  "buick-envision-s": buick_envision_s,
  "peugeot-2008": peugeot_2008,
  "jeep-wrangler": jeep_wrangler,
  "ford-escort": ford_escort,
  "audi-q8": audi_q8,
  "mini-jcw": mini_jcw,
  "great-wall-poer": great_wall_poer,
  "geely-emgrand-s": geely_emgrand_s,
  "nissan-terra": nissan_terra,
  "jaguar-f-pace": jaguar_f_pace,
  "ford-bronco": ford_bronco,
  "deepal-g318": deepal_g318,
  "stelato-s9t": stelato_s9t,
  "volkswagen-santana": volkswagen_santana,
  "honda-ur-v": honda_ur_v,
  "volvo-xc40": volvo_xc40,
  "toyota-corolla-cross": toyota_corolla_cross,
  "bmw-x4": bmw_x4,
  "audi-a5l": audi_a5l,
  "mercedes-benz-cls": mercedes_benz_cls,
  "aion-v": aion_v,
  "volkswagen-tiguan-l-phev": volkswagen_tiguan_l_phev,
  "hongqi-hq9-phev": hongqi_hq9_phev,
  "audi-a6": audi_a6,
  "chery-tiggo-7-pro-max": chery_tiggo_7_pro_max,
  "volkswagen-t-cross": volkswagen_t_cross,
  "subaru-forester": subaru_forester,
  "chevrolet-cavalier": chevrolet_cavalier,
  "lynk-co-01": lynk_co_01,
  "buick-century": buick_century,
  "chevrolet-equinox": chevrolet_equinox,
  "nio-es7": nio_es7,
  "aion-ut": aion_ut,
  "volkswagen-tayron-gte": volkswagen_tayron_gte,
  "haval-f7": haval_f7,
  "jetour-x90-plus": jetour_x90_plus,
  "ora-white-cat": ora_white_cat,
  "byd-e2": byd_e2,
  "lynk-co-02": lynk_co_02,
  "mercedes-benz-gle-amg": mercedes_benz_gle_amg,
  "kia-sportage": kia_sportage,
  "mg-mg5-scorpio": mg_mg5_scorpio,
  "ford-ranger": ford_ranger,
  "honda-life": honda_life,
  "bmw-ix1": bmw_ix1,
  "bmw-3-series-gt": bmw_3_series_gt,
  "geely-okavango": geely_okavango,
  "hongqi-h6": hongqi_h6,
  "mercedes-benz-c-class-amg": mercedes_benz_c_class_amg,
  "hongqi-h5-phev": hongqi_h5_phev,
  "chery-arrizo-5-plus": chery_arrizo_5_plus,
  "byd-frigate-07": byd_frigate_07,
  "hongqi-hs3-phev": hongqi_hs3_phev,
  "toyota-vios": toyota_vios,
  "hongqi-hs3": hongqi_hs3,
  "mercedes-benz-glc-amg": mercedes_benz_glc_amg,
  "kia-kx3": kia_kx3,
  "geely-emgrand-gt": geely_emgrand_gt,
  "mercedes-benz-gle-coupe": mercedes_benz_gle_coupe,
  "changan-raeton-cc": changan_raeton_cc,
  "nissan-kicks": nissan_kicks,
  "bmw-z4": bmw_z4,
  "ford-territory": ford_territory,
  "volkswagen-passat-phev": volkswagen_passat_phev,
  "volkswagen-tayron-x": volkswagen_tayron_x,
  "changan-yida": changan_yida,
  "bmw-ix": bmw_ix,
  "mg-zs": mg_zs,
  "maserati-levante": maserati_levante,
  "toyota-c-hr": toyota_c_hr,
  "hyundai-custin": hyundai_custin,
  "buick-gl6": buick_gl6,
  "lynk-co-900": lynk_co_900,
  "ford-mustang": ford_mustang,
  "mercedes-benz-gls": mercedes_benz_gls,
  "audi-q5l-sportback": audi_q5l_sportback,
  "xpeng-x9": xpeng_x9,
  "byd-seal-06-dmi-touring": byd_seal_06_dmi_touring,
  "byd-xia": byd_xia,
  "honda-crider": honda_crider,
  "chery-tiggo-9": chery_tiggo_9,
  "bmw-2-series": bmw_2_series,
  "mazda-cx-30": mazda_cx_30,
  "hongqi-hs7-phev": hongqi_hs7_phev,
  "hyundai-tucson": hyundai_tucson,
  "bmw-x7": bmw_x7,
  "kia-seltos": kia_seltos,
  "audi-s4": audi_s4,
  "chery-tiggo-4-pro": chery_tiggo_4_pro,
  "haval-dargo-ii": haval_dargo_ii,
  "mercedes-benz-cla-amg": mercedes_benz_cla_amg,
  "geely-emgrand-gs": geely_emgrand_gs,
  "geely-emgrand-gl": geely_emgrand_gl,
  "toyota-venza": toyota_venza,
  "mercedes-benz-b-class": mercedes_benz_b_class,
  "toyota-bz3": toyota_bz3,
  "geely-galaxy-starshine-6": geely_galaxy_starshine_6,
  "hyundai-ix25": hyundai_ix25,
  "byd-sealion-05-ev": byd_sealion_05_ev,
  "mercedes-benz-glb-amg": mercedes_benz_glb_amg,
  "audi-a4": audi_a4,
  "byd-song-plus": byd_song_plus,
  "lynk-co-09-petrol": lynk_co_09_petrol,
  "audi-q6": audi_q6,
  "byd-song-max": byd_song_max,
  "volkswagen-touran": volkswagen_touran,
  "volvo-v90": volvo_v90,
  "geely-galaxy-m9": geely_galaxy_m9,
  "audi-a6l-phev": audi_a6l_phev,
  "hyundai-santa-fe": hyundai_santa_fe,
  "byd-song": byd_song,
  "byd-seal-06gt": byd_seal_06gt,
  "bmw-x3-m": bmw_x3_m,
  "bmw-i4": bmw_i4,
  "changan-uni-z": changan_uni_z,
  "mercedes-benz-cle": mercedes_benz_cle,
  "byd-song-pro-petrol": byd_song_pro_petrol,
  "byd-sealion-07-ev": byd_sealion_07_ev,
  "mercedes-benz-c-class-phev": mercedes_benz_c_class_phev,
  "bmw-8-series": bmw_8_series,
  "mercedes-benz-eqa": mercedes_benz_eqa,
  "audi-rs-5": audi_rs_5,
  "geely-emgrand-l": geely_emgrand_l,
  "bmw-m3": bmw_m3,
  "audi-s5": audi_s5,
  "volkswagen-id6-crozz": volkswagen_id6_crozz,
  "bmw-x4-m": bmw_x4_m,
  "toyota-bz5": toyota_bz5,
  "byd-song-max-dmi": byd_song_max_dmi,
  "deepal-l06": deepal_l06,
  "toyota-bz4x": toyota_bz4x,
  "mercedes-benz-glc-coupe-amg": mercedes_benz_glc_coupe_amg,
  "volkswagen-id6-x": volkswagen_id6_x,
  "audi-a5l-sportback": audi_a5l_sportback,
  "toyota-bz7": toyota_bz7,
  "byd-tang-petrol": byd_tang_petrol,
  "nio-et9": nio_et9,
  "mazda-ez-6": mazda_ez_6,
  "bmw-x4-m40i": bmw_x4_m40i,
  "bmw-x5-phev": bmw_x5_phev,
  "zeekr-8x": zeekr_8x,
  "zeekr-001-fr": zeekr_001_fr,
  "mazda-ez-60": mazda_ez_60,
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
