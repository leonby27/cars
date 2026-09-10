import test from "node:test";
import assert from "node:assert/strict";
import { brandCatalogGuide } from "../server/repository.mjs";
import { pool } from "../server/db.mjs";
import { createSeoRenderer } from "../server/seo-render.mjs";
import { findCatalogLanding } from "../src/catalog-landings.js";
import { landingFaq } from "../src/landing-faq.js";

const guide = {
  brand:"Zeekr", calculatedAt:"2026-09-10T12:00:00.000Z", changedAt:"2026-09-06T12:00:00.000Z",
  total:1044, modelCount:3, pricedCount:947, yearMin:2021, yearMax:2026,
  priceMin:17400, priceMax:97950, priceP25:23100, priceMedian:28700, priceP75:37900, mileageMedian:32000,
  models:[
    { model:"001", count:389, yearMin:2021, yearMax:2026, priceMin:20050, priceMax:53125, priceMedian:28900, mileageMedian:35000, powertrains:["Электромобиль"], image:"https://img.example/001.jpg" },
    { model:"007", count:158, yearMin:2023, yearMax:2026, priceMin:20250, priceMax:39200, priceMedian:25900, mileageMedian:16000, powertrains:["Электромобиль"], image:"https://img.example/007.jpg" },
    { model:"9X", count:4, yearMin:2025, yearMax:2026, priceMin:96150, priceMax:97950, priceMedian:97800, mileageMedian:9000, powertrains:["Гибрид"], image:"https://img.example/9x.jpg" },
  ],
  budgets:{
    under25:{ count:260, models:["001", "007", "X"] },
    "25to35":{ count:500, models:["001", "007", "007GT", "X"] },
    "35to50":{ count:220, models:["001", "007GT", "009"] },
    over50:{ count:64, models:["001 FR", "009", "9X"] },
  },
};

test("brand guide aggregates only active listings of the requested brand", async () => {
  const previous = pool.query;
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("count(DISTINCT v.model)")) return { rows:[{
      total:1044, model_count:3, priced_count:947, price_min:"17400", price_max:"97950", price_p25:"23100", price_median:"28700", price_p75:"37900",
      year_min:2021, year_max:2026, mileage_median:"32000", changed_at:"2026-09-06T12:00:00.000Z",
    }] };
    if (sql.includes("GROUP BY v.model")) return { rows:guide.models.map((row) => ({
      model:row.model, count:row.count, year_min:row.yearMin, year_max:row.yearMax, price_min:String(row.priceMin), price_max:String(row.priceMax),
      price_median:String(row.priceMedian), mileage_median:String(row.mileageMedian), powertrains:row.powertrains, image:row.image,
    })) };
    return { rows:Object.entries(guide.budgets).map(([band, value]) => ({ band, ...value })) };
  };
  try {
    const result = await brandCatalogGuide("Zeekr");
    assert.equal(result.total, 1044);
    assert.equal(result.pricedCount, 947);
    assert.equal(result.priceMedian, 28700);
    assert.equal(result.priceMax, 97950);
    assert.equal(result.models[2].powertrains[0], "Гибрид");
    assert.equal(result.models[0].image, "https://img.example/001.jpg");
    assert.equal(result.budgets.under25.count, 260);
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.deepEqual(call.values, ["Zeekr"]);
      assert.match(call.sql, /l\.status='active' AND v\.brand=\$1/);
      assert.match(call.sql, /l\.estimated_total_usd > 0/);
    }
  } finally {
    pool.query = previous;
  }
});

test("Zeekr FAQ answers price with price and distinguishes EVs from hybrids", () => {
  const landing = findCatalogLanding("/catalog/zeekr");
  const faq = landingFaq(landing, { total:guide.total, guide });
  assert.match(faq[0].a, /17[^\d]*400 \$/);
  assert.match(faq[0].a, /28[^\d]*700 \$/);
  assert.match(faq[2].a, /встречаются и гибридные модели/);
  assert.match(faq[3].a, /Сведения продавца считаются исходными/);
  const bynFaq = landingFaq(landing, { total:guide.total, guide, currency:"BYN" });
  assert.match(bynFaq[0].a, /BYN/);
  assert.doesNotMatch(bynFaq[0].a, /\$/);
});

test("server-rendered Zeekr page exposes the same catalog evidence and methodology", () => {
  const renderer = createSeoRenderer({ shell:"<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>", siteUrl:"https://abcars.by", allowIndexing:true });
  const landing = findCatalogLanding("/catalog/zeekr");
  const html = renderer.landingPage({ landing, guide, total:guide.total, cars:[], modelPages:[
    { brand:"Zeekr", model:"001", name:"Zeekr 001", path:"/models/zeekr-001" },
    { brand:"Zeekr", model:"007", name:"Zeekr 007", path:"/models/zeekr-007" },
  ] }).html;
  assert.match(html, /цены и выбор по данным каталога/);
  assert.match(html, /1[^<]*044 автомобиля Zeekr/);
  assert.match(html, /Медианная цена/);
  assert.match(html, /максимальная — 97[^<]*950 \$/);
  assert.match(html, /Центральная половина/);
  assert.match(html, /947 объявлений с рассчитанной стоимостью/);
  assert.match(html, /href="\/models\/zeekr-001"/);
  assert.match(html, /Статистика рассчитана 10 сентября 2026/);
  assert.match(html, /С чем сравнить Zeekr/);
  assert.match(html, /Сколько стоит Zeekr с доставкой до Минска/);
  assert.doesNotMatch(html, /Другие разделы каталога/);
});
