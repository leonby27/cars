const BRAND_MAP = new Map([
  ["比亚迪", "BYD"], ["理想汽车", "Li Auto"], ["理想", "Li Auto"],
  ["极氪", "Zeekr"], ["小鹏", "XPeng"], ["蔚来", "NIO"],
  ["吉利汽车", "Geely"], ["吉利", "Geely"], ["ARCFOX极狐", "ARCFOX"],
  ["极狐", "ARCFOX"], ["问界", "AITO"], ["零跑汽车", "Leapmotor"],
  ["零跑", "Leapmotor"], ["阿维塔科技", "Avatr"], ["阿维塔", "Avatr"],
  ["深蓝汽车", "Deepal"], ["深蓝", "Deepal"], ["腾势汽车", "Denza"],
  ["腾势", "Denza"], ["小米汽车", "Xiaomi"], ["小米", "Xiaomi"],
  ["岚图汽车", "Voyah"], ["岚图", "Voyah"], ["智界", "Luxeed"],
  ["享界", "Stelato"], ["尚界", "Shangjie"], ["鸿蒙智行", "HIMA"],
  ["吉利银河", "Geely Galaxy"], ["东风风神", "Dongfeng"],
]);

const SERIES_MAP = new Map([
  ["比亚迪e6", "e6"], ["元PLUS", "Yuan Plus"], ["元UP", "Yuan Up"],
  ["元Pro", "Yuan Pro"], ["海鸥", "Seagull"], ["海豚", "Dolphin"],
  ["海豹", "Seal"], ["汉", "Han"], ["唐新能源", "Tang"],
  ["宋PLUS新能源", "Song Plus"], ["宋Pro新能源", "Song Pro"],
  ["秦PLUS", "Qin Plus"], ["秦L", "Qin L"], ["理想L6", "L6"],
  ["理想L7", "L7"], ["理想L8", "L8"], ["理想L9", "L9"],
  ["银河E5", "E5"], ["银河L7", "L7"], ["银河E8", "E8"],
  ["东风风神E70", "E70"], ["风神L7新能源", "L7"], ["东风风神L8", "L8"],
  ["深蓝S05", "S05"], ["深蓝S07", "S07"], ["深蓝SL03", "SL03"],
  ["岚图FREE", "Free"], ["岚图梦想家", "Dream"],
]);

const field = (text, name) => text.match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null;
const numeric = (value) => {
  const match = String(value || "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

export function parseMileage(value) {
  if (!value) return null;
  const amount = numeric(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(value.includes("万") ? amount * 10000 : amount);
}

export function parseGuaziMarkdown(markdown, sourceUrl) {
  const id = field(markdown, "id")?.replace(/^c/, "") ?? sourceUrl.match(/c(\d+)/)?.[1];
  const manufacturer = field(markdown, "manufacturer");
  const rawBrand = field(markdown, "brand") || manufacturer;
  const rawSeries = field(markdown, "series") || "";
  const mappedBrand = BRAND_MAP.get(rawBrand) || BRAND_MAP.get(manufacturer) || null;
  const brand = /银河/.test(`${rawBrand || ""} ${manufacturer || ""} ${rawSeries}`) ? "Geely Galaxy" : mappedBrand;
  const rawModel = field(markdown, "model") || "";
  const priceCny = numeric(field(markdown, "full_payment"));
  const guidePriceCny = numeric(field(markdown, "guide_price"));
  const register = field(markdown, "first_register");
  const year = numeric(register?.slice(0, 4));
  const mileage = parseMileage(field(markdown, "mileage"));
  const transfers = numeric(field(markdown, "transfer_times")) ?? 0;
  const energy = field(markdown, "type");
  const grade = field(markdown, "condition_grade");
  const condition = field(markdown, "condition_desc");
  const appearanceScore = numeric(field(markdown, "appearance_score"));
  const description = markdown.match(/^highlights:\s*>-\s*\n([\s\S]*?)^generatedAt:/m)?.[1]
    ?.replace(/^\s+/gm, " ").replace(/\*\*/g, "").trim() ?? "";

  if (!id || !brand || !priceCny || !year || !mileage || energy !== "新能源") return null;

  const strippedSeries = rawSeries.replace(rawBrand || "", "").replace(manufacturer || "", "").trim();
  const model = SERIES_MAP.get(rawSeries) || SERIES_MAP.get(strippedSeries) || strippedSeries || rawModel.split(" ")[0];

  return {
    id: `guazi-${id}`,
    externalId: id,
    source: "Guazi",
    sourceUrl,
    brand,
    model,
    rawBrand,
    rawSeries,
    rawModel,
    year,
    firstRegistration: register,
    mileage,
    chinaPrice: priceCny,
    guidePriceCny,
    usdPrice: Math.round((priceCny / 7.15 + 5800) / 100) * 100,
    city: field(markdown, "city") || "Китай",
    owners: transfers + 1,
    transfers,
    conditionGrade: grade,
    appearanceScore,
    incident: condition || "Состояние указано в отчёте Guazi",
    description,
  };
}

const decodeUrl = (url) => url.replaceAll("\\u0026", "&").replaceAll("&amp;", "&");
const jsonValue = (html, label) => {
  const escaped = html.match(new RegExp(`\\\\"label\\\\":\\\\"${label}\\\\",\\\\"value\\\\":\\\\"([^"\\\\]+)`));
  const direct = html.match(new RegExp(`"label":"${label}","value":"([^"]+)`));
  return escaped?.[1] || direct?.[1] || null;
};

export function parseGuaziHtml(html) {
  if (!html || html.includes("Security Verification")) return { blocked: true, images: [] };
  const allImages = [...html.matchAll(/https:\/\/image-public\.guazistatic\.com\/[^"'\\\s<]+?\.jpg(?:\?[^"'\\\s<]+)?/g)]
    .map((match) => decodeUrl(match[0]));
  const gallery = [...new Set(allImages.filter((url) => url.includes("image/quality,q_88/resize,m_fill,w_750,h_500")))].slice(0, 32);
  const batteryValue = jsonValue(html, "电池容量");
  const electricRangeValue = jsonValue(html, "纯电续航") || jsonValue(html, "新车续航");
  const combinedRangeValue = jsonValue(html, "综合续航");
  const energyValue = jsonValue(html, "能源类型") || jsonValue(html, "能源形式");
  const driveValue = jsonValue(html, "驱动电机") || jsonValue(html, "驱动方式") || jsonValue(html, "驱动类型");
  const claimValue = jsonValue(html, "保险理赔");
  return {
    blocked: false,
    images: gallery,
    battery: numeric(batteryValue),
    batteryType: jsonValue(html, "电池类型"),
    batteryBrand: jsonValue(html, "电池品牌"),
    batteryHealth: numeric(jsonValue(html, "电池健康度")),
    electricRange: numeric(electricRangeValue),
    combinedRange: numeric(combinedRangeValue),
    range: numeric(electricRangeValue) || numeric(combinedRangeValue),
    energy: energyValue,
    driveRaw: driveValue,
    claims: claimValue,
    engine: jsonValue(html, "发动机"),
    transmission: jsonValue(html, "变速箱"),
    bodyColor: jsonValue(html, "车身颜色"),
    vehicleClass: jsonValue(html, "车辆级别"),
    driverAssistance: jsonValue(html, "智能驾驶"),
    infotainmentChip: jsonValue(html, "车机芯片"),
    assistanceLevel: jsonValue(html, "辅驾级别"),
    radarCount: numeric(jsonValue(html, "毫米波雷达")),
    cameraCount: numeric(jsonValue(html, "辅助摄像头")),
    ultrasonicCount: numeric(jsonValue(html, "超声传感")),
    comfort: jsonValue(html, "空间舒适性"),
    warranty: jsonValue(html, "三电质保"),
    inspectionGrade: jsonValue(html, "检测等级"),
    powertrainInspection: jsonValue(html, "三电附件检测"),
    bodyInspection: jsonValue(html, "车身外观"),
    interiorInspection: jsonValue(html, "内饰及配置"),
    structureInspection: jsonValue(html, "车身骨架"),
    engineBayInspection: jsonValue(html, "机舱工况"),
    batteryProtection: jsonValue(html, "电池保障"),
    conditionProtection: jsonValue(html, "车况保障"),
    buybackProtection: jsonValue(html, "回购保障"),
  };
}

export function normalizeEnergy(value, title = "") {
  const source = `${value || ""} ${title}`;
  if (/增程|插电|混动|DM-i|DM-p|HiP|PHEV/i.test(source)) return "Гибрид";
  return "Электромобиль";
}

export function normalizeDrive(value) {
  if (!value) return "Не указан";
  if (/四驱|全驱/.test(value)) return "Полный";
  if (/后驱/.test(value)) return "Задний";
  if (/前驱/.test(value)) return "Передний";
  return value;
}

const absoluteGuaziUrl = (value, baseUrl) => new URL(value.replaceAll("\\/", "/"), baseUrl).href;

export function parseGuaziSeriesLinks(html, brandUrl, includeSeries) {
  const brandPath = new URL(brandUrl).pathname;
  const matcher = includeSeries ? new RegExp(includeSeries, "i") : null;
  const links = [...html.matchAll(/href=["']([^"']+)["'][^>]*>([^<]{1,60})</g)]
    .map((match) => ({ url: absoluteGuaziUrl(match[1], brandUrl), name: match[2].trim() }))
    .filter(({ url, name }) => {
      const path = new URL(url).pathname;
      return path.startsWith(brandPath) && path !== brandPath && /^\/[^/]+\/[^/]+\/[^/]+\/$/.test(path) && (!matcher || matcher.test(name));
    });
  return [...new Map(links.map((item) => [item.url, item])).values()];
}

export function parseGuaziListing(html) {
  const ids = [...new Set([...html.matchAll(/\/car-detail\/c(\d+)\.html/g)].map((match) => match[1]))];
  const directPages = html.match(/"totalPage":(\d+)/)?.[1];
  const escapedPages = html.match(/\\"totalPage\\":(\d+)/)?.[1];
  return { ids, totalPages: Number(directPages || escapedPages || 1) };
}

export { BRAND_MAP };
