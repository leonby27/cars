// Автовоз по Китаю до Хоргоса (граница с Казахстаном — основной маршрут на Минск).
// Города каталога сгруппированы в зоны по удалённости от границы; ставка за место
// на автовозе растёт с расстоянием. Ориентиры — открытые тарифы перевозчиков
// (30–80 тыс. ₽ за внутрикитайское плечо, лето 2026) и расстояния до Хоргоса.
export const CHINA_TRANSIT_ZONES = {
  border: { label: "Синьцзян, рядом с границей", usd: [150, 300], days: [1, 2] },
  west: { label: "запад Китая", usd: [400, 600], days: [3, 5] },
  center: { label: "центр Китая", usd: [500, 700], days: [4, 7] },
  east: { label: "север и восток Китая", usd: [600, 800], days: [5, 8] },
  far: { label: "юг, побережье или северо-восток", usd: [700, 950], days: [6, 10] },
};

// Сроки остальных этапов, дни [низ, верх]. Ориентиры те же, что у ставок:
// открытые сроки перевозчиков Китай→Минск (полный цикл 30–60 дней, автовоз
// от границы 14–21 день плюс погрузка и очередь на Хоргосе, таможня 1–5 дней).
export const DELIVERY_STAGE_DAYS = {
  buyout: [4, 8], // выкуп, снятие с учёта, экспортные документы
  intl: [20, 30], // ожидание погрузки, очередь на границе, автовоз до Минска
  svh: [2, 5], // разгрузка, оформление и выдача на СВХ
};

export function estimateDeliveryDays(city) {
  const transit = chinaTransitFor(city);
  const stages = [DELIVERY_STAGE_DAYS.buyout, transit.days, DELIVERY_STAGE_DAYS.intl, DELIVERY_STAGE_DAYS.svh];
  return {
    buyoutDays: DELIVERY_STAGE_DAYS.buyout,
    chinaDays: transit.days,
    intlDays: DELIVERY_STAGE_DAYS.intl,
    svhDays: DELIVERY_STAGE_DAYS.svh,
    totalDays: [stages.reduce((sum, [low]) => sum + low, 0), stages.reduce((sum, [, high]) => sum + high, 0)],
  };
}

// Город неизвестен или не размечен — берём восточную зону: там живёт
// большинство каталога, и ошибка в любую сторону остаётся в пределах $200.
export const DEFAULT_TRANSIT_ZONE = "east";

const ZONE_CITIES = {
  border: ["wulumuqi", "yili", "kelamayi", "changji", "kuerle", "akesu", "kashi", "hami", "shihezi", "tulufan", "aletai", "tacheng", "bole"],
  west: ["lanzhou", "xining", "yinchuan", "tianshui", "baiyin", "wuwei", "zhangye", "jiuquan", "jiayuguan", "wuzhong", "guyuan", "shizuishan", "zhongwei"],
  center: [
    "xian", "xianyang", "baoji", "weinan", "hanzhong", "ankang", "yulin",
    "chengdu", "mianyang", "nanchong", "yibin", "luzhou", "dazhou", "suining", "leshan", "meishan", "deyang", "ziyang", "neijiang", "zigong", "guangyuan", "panzhihua",
    "chongqing",
    "kunming", "qujing", "yuxi", "dali",
    "guiyang", "zunyi", "liupanshui", "anshun", "bijie", "tongren",
    "taiyuan", "datong", "zhangzhi", "changzhi", "jincheng", "jinzhong", "linfen", "yuncheng", "lvliang", "xinzhou", "yangquan", "shuozhou",
    "huhehaote", "baotou", "eerduosi", "wuhai", "chifeng", "tongliao", "wulanchabu", "bayannaoer",
  ],
  east: [
    "zhengzhou", "luoyang", "kaifeng", "anyang", "xinxiang", "xuchang", "puyang", "nanyang", "zhoukou", "zhumadian", "shangqiu", "xinyang", "pingdingshan", "jiaozuo", "hebi", "luohe", "sanmenxia", "jiyuan",
    "wuhan", "xiangyang", "yichang", "shiyan", "xiaogan", "jingzhou", "huangshi", "huanggang", "jingmen", "ezhou", "suizhou", "xianning",
    "changsha", "zhuzhou", "xiangtan", "hengyang", "yueyang", "changde", "chenzhou", "yiyang", "loudi", "shaoyang", "huaihua", "yongzhou",
    "shijiazhuang", "tangshan", "baoding", "langfang", "cangzhou", "handan", "xingtai", "hengshui", "zhangjiakou", "qinhuangdao", "chengde",
    "beijing", "tianjin",
    "jinan", "qingdao", "weifang", "linyi", "jining", "zibo", "yantai", "dezhou", "heze", "dongying", "binzhou", "rizhao", "liaocheng", "taian", "weihai", "zaozhuang",
    "hefei", "wuhu", "bangbu", "anqing", "maanshan", "chuzhou", "liuan", "huainan", "huaibei", "tongling", "fuyang", "bozhou", "chizhou", "xuancheng",
    "nanchang", "ganzhou", "shangrao", "yi_chun", "yichun", "jiujiang", "jian", "yingtan", "pingxiang", "xinyu", "fu_zhou",
  ],
  far: [
    "shanghai", "suzhou", "nanjing", "wuxi", "changzhou", "xuzhou", "nantong", "yancheng", "yangzhou", "zhenjiang", "taizhou", "tai_zhou", "suqian", "huaian", "lianyungang",
    "hangzhou", "ningbo", "wenzhou", "jinhua", "jiaxing", "shaoxing", "huzhou", "quzhou", "lishui", "zhoushan",
    "fuzhou", "xiamen", "quanzhou", "zhangzhou", "putian", "longyan", "sanming", "ningde", "nanping",
    "guangzhou", "shenzhen", "dongguan", "foshan", "zhongshan", "zhuhai", "huizhou", "jiangmen", "zhaoqing", "shantou", "chaozhou", "jieyang", "meizhou", "shaoguan", "heyuan", "maoming", "zhanjiang", "yangjiang", "qingyuan", "yunfu", "shanwei",
    "nanning", "liuzhou", "guilin", "wuzhou", "beihai", "qinzhou",
    "haikou", "sanya",
    "shenyang", "dalian", "anshan", "jinzhou", "panjin", "yingkou", "fushun", "benxi", "dandong", "liaoyang", "tieling", "chaoyang", "huludao",
    "changchun", "jilinshi", "siping", "tonghua", "songyuan", "baicheng",
    "haerbin", "mudanjiang", "qiqihaer", "daqing", "jiamusi", "suihua",
  ],
};

const CITY_ZONE = new Map();
for (const [zone, cities] of Object.entries(ZONE_CITIES)) {
  for (const city of cities) CITY_ZONE.set(city, zone);
}

export function chinaTransitFor(city) {
  const key = String(city || "").trim().toLowerCase();
  const zone = CITY_ZONE.get(key) || CITY_ZONE.get(key.replace(/_/g, "")) || DEFAULT_TRANSIT_ZONE;
  return CHINA_TRANSIT_ZONES[zone];
}
