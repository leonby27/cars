import test from "node:test";
import assert from "node:assert/strict";
import { buildCarFilters, buildCarOrder, catalogHasMore, catalogPaging, maxOffset, withoutDetailPayload } from "../server/repository.mjs";

test("parameterizes all catalog filters", () => {
  const params = new URLSearchParams({ type:"Гибрид", brand:"Deepal", model:"S07", bodyType:"SUV / кроссовер", drive:"Полный", ownersMax:"2", noClaims:"1", yearMin:"2024", mileageMax:"50000", landedMax:"40000" });
  const result = buildCarFilters(params);
  assert.deepEqual(result.values, ["Гибрид", "Deepal", ["S07"], ["SUV / кроссовер"], "Полный", 2, 2024, 50000, 40000]);
  assert.match(result.where, /v\.drivetrain=\$5/);
  assert.match(result.where, /l\.owners<=\$6/);
  assert.match(result.where, /0\\s\*次理赔/);
  assert.match(result.where, /v\.model_year>=\$7/);
  assert.match(result.where, /l\.estimated_total_usd<=\$9/);
});

test("ignores selector defaults and invalid numbers", () => {
  const result = buildCarFilters(new URLSearchParams({ type:"Все", brand:"Все марки", yearMin:"nope", conditionGrade:"DROP TABLE listings" }));
  assert.deepEqual(result.values, []);
  assert.equal(result.where, "WHERE l.status='active'");
});

test("filters by several body types at once", () => {
  const params = new URLSearchParams();
  params.append("bodyType", "SUV / кроссовер");
  params.append("bodyType", "Седан");
  params.append("bodyType", "Все кузова");
  params.append("bodyType", "Седан");
  const result = buildCarFilters(params);
  assert.deepEqual(result.values, [["SUV / кроссовер", "Седан"]]);
  assert.match(result.where, /v\.specifications->>'bodyType'=ANY\(\$1\)/);
});

test("filters by several models at once and keeps commas inside names", () => {
  const params = new URLSearchParams();
  params.append("model", "Song Plus, DM-i");
  params.append("model", "Han");
  params.append("model", "Все модели");
  params.append("model", "Han");
  const result = buildCarFilters(params);
  assert.deepEqual(result.values, [["Song Plus, DM-i", "Han"]]);
  assert.match(result.where, /v\.model=ANY\(\$1\)/);
});

test("accepts a comma separated body type list", () => {
  const result = buildCarFilters(new URLSearchParams({ bodyType:"Седан,Хэтчбек" }));
  assert.deepEqual(result.values, [["Седан", "Хэтчбек"]]);
});

test("filters by a closed year range", () => {
  const result = buildCarFilters(new URLSearchParams({ yearMin:"2022", yearMax:"2024" }));
  assert.deepEqual(result.values, [2022, 2024]);
  assert.match(result.where, /v\.model_year>=\$1/);
  assert.match(result.where, /v\.model_year<=\$2/);
});

test("filters by a landed price floor", () => {
  const result = buildCarFilters(new URLSearchParams({ landedMin:"100000" }));
  assert.deepEqual(result.values, [100000]);
  assert.match(result.where, /l\.estimated_total_usd>=\$1/);
});

test("filters by an allowlisted condition grade", () => {
  const result = buildCarFilters(new URLSearchParams({ conditionGrade:"A" }));
  assert.deepEqual(result.values, ["A"]);
  assert.match(result.where, /l\.condition_grade=\$1/);
});

test("uses only allowlisted catalog sort orders", () => {
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"price" })), "l.estimated_total_usd ASC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"price_asc" })), "l.estimated_total_usd ASC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"price_desc" })), "l.estimated_total_usd DESC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"mileage_asc" })), "l.mileage_km ASC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"range_desc" })), "COALESCE(v.electric_range_km, v.combined_range_km) DESC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"newest" })), "l.listed_at DESC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"year_desc" })), "v.model_year DESC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"year_asc" })), "v.model_year ASC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"DROP TABLE listings" })), "l.listed_at DESC NULLS LAST, l.id");
});

test("keeps the default order stable per seed and strips seed injection", () => {
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"default", seed:"ab12cd" })), "md5(l.id::text || 'ab12cd'), l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"default", seed:"x'; DROP TABLE listings; --" })), "md5(l.id::text || 'xDROPTABLElistings'), l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"default" })), "md5(l.id::text || 'catalog'), l.id");
});

test("omits heavy technical specifications from catalog summaries", () => {
  const car = { id:"che168-1", title:"Audi Q4 e-tron 2025", technicalSpecs:{ count:65, groups:[{ name:"Body", items:[] }] } };
  assert.deepEqual(withoutDetailPayload(car), { id:"che168-1", title:"Audi Q4 e-tron 2025", _summary:true });
  assert.equal(car.technicalSpecs.count, 65);
});

test("листает каталог до потолка и честно сообщает, что дальше ничего нет", () => {
  // Потолок защищает каталог от постраничной выкачки: обычный посетитель берёт по 24
  // карточки, то есть до упора ему нужно больше двухсот нажатий «Показать ещё».
  const page = catalogPaging(new URLSearchParams({ limit:"24", offset:"48" }));
  assert.deepEqual(page, { limit:24, offset:48, beyondCap:false });
  assert.equal(catalogHasMore(48, 24, 32916), true);

  // На потолке подгрузка обязана остановиться, иначе прокрутка просит пустые страницы.
  assert.equal(catalogHasMore(maxOffset - 24, 24, 32916), false);
  assert.equal(catalogPaging(new URLSearchParams({ offset:String(maxOffset) })).beyondCap, true);

  // Запрос за потолком не должен повторять уже показанные карточки.
  const beyond = catalogPaging(new URLSearchParams({ offset:String(maxOffset + 500) }));
  assert.equal(beyond.beyondCap, true);
  assert.equal(beyond.offset, maxOffset + 500);
  assert.equal(catalogHasMore(beyond.offset, 0, 32916), false);
});

test("короткий каталог заканчивается по своему размеру, а не по потолку", () => {
  // Под фильтрами машин обычно немного: список должен закончиться на последней странице.
  assert.equal(catalogHasMore(0, 24, 24), false);
  assert.equal(catalogHasMore(0, 24, 30), true);
  assert.equal(catalogHasMore(24, 6, 30), false);
});

test("ограничивает размер страницы и не принимает мусор в листании", () => {
  assert.equal(catalogPaging(new URLSearchParams({ limit:"5000" })).limit, 100);
  assert.equal(catalogPaging(new URLSearchParams({ limit:"0" })).limit, 24);
  assert.deepEqual(catalogPaging(new URLSearchParams({ limit:"nope", offset:"-40" })), { limit:24, offset:0, beyondCap:false });
});
