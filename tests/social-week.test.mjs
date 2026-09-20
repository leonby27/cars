import test from "node:test";
import assert from "node:assert/strict";
import {
  COVER_HEADLINE_VARIANTS,
  THREADS_FILE_SLOTS,
  COVER_PLACES,
  hasRequiredVisual,
  assignUniqueWeeklyCovers,
  coverHeadlineSize,
  coverPlaces,
  coverTopicHeadline,
  coverSourcePhotos,
  galleryPhotosAfterCover,
  journalSlotsForWeek,
  mondayOf,
  nextThreadPosts,
  parseThreadsFile,
  preparationMonday,
  promptNumbers,
  threadsTimeline,
  weekKey,
} from "../scripts/lib/social-week.mjs";
import { publishToTelegram, publishToThreads } from "../scripts/lib/social.mjs";
import {
  SOCIAL_QUOTA_OVER,
  isLiveAvailable,
  shapeSocialCar,
  socialLandedPrice,
} from "../scripts/lib/social-blocks.mjs";
import { estimateLandedCost } from "../src/pricing.js";

test("недельный ключ всегда указывает на понедельник", () => {
  const saturday = new Date("2026-09-19T12:00:00+03:00");
  assert.equal(weekKey(saturday), "2026-09-14");
  assert.equal(weekKey(new Date("2026-09-21T09:00:00+03:00")), "2026-09-21");
  assert.equal(mondayOf(saturday).getDay(), 1);
});

test("в воскресенье готовится следующая неделя, в остальные дни — текущая", () => {
  assert.equal(weekKey(preparationMonday(new Date("2026-09-20T09:00:00+03:00"))), "2026-09-21");
  assert.equal(weekKey(preparationMonday(new Date("2026-09-22T09:00:00+03:00"))), "2026-09-21");
});

test("промпты распределяются в пропорции 50/25/25 на каждом полном цикле", () => {
  const prompts = promptNumbers("2026-09-21", 40);
  assert.equal(prompts.filter((value) => value === 1).length, 20);
  assert.equal(prompts.filter((value) => value === 2).length, 10);
  assert.equal(prompts.filter((value) => value === 3).length, 10);
});

test("вопросы Threads идут по порядку и после конца начинают новый круг", () => {
  const entries = parseThreadsFile("1. Первый\n2. Второй\n3. Третий\n");
  assert.deepEqual(nextThreadPosts(entries, 1, 2), [
    { line:2, text:"Второй" },
    { line:3, text:"Третий" },
  ]);
  assert.deepEqual(nextThreadPosts(entries, 3, 2).map((item) => item.line), [1, 2]);
});

test("текстовые Threads-посты стоят между визуальными, а не идут друг за другом", () => {
  const monday = new Date("2026-09-21T00:00:00+03:00");
  const manifest = {
    posts:Array.from({ length:5 }, (_, index) => ({ id:`visual-${index}`, publishAt:`2026-09-${21 + index}T13:00:00+03:00` })),
    threadPosts:THREADS_FILE_SLOTS.map((slot, index) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + slot.dayOffset);
      return { id:`text-${index}`, publishAt:`2026-09-${String(date.getDate()).padStart(2, "0")}T${slot.time}:00+03:00` };
    }),
  };
  const kinds = threadsTimeline(manifest).map((item) => item.kind);
  assert.ok(!kinds.some((kind, index) => kind === "threads-file" && kinds[index - 1] === "threads-file"));
  assert.deepEqual(kinds, ["visual", "visual", "threads-file", "visual", "visual", "visual", "threads-file"]);
});

test("визуальная запись без сгенерированной JPEG-обложки не готова", () => {
  assert.equal(hasRequiredVisual({ kind:"visual" }), false);
  assert.equal(hasRequiredVisual({ kind:"visual", cover:{ asset:"cover.png", url:"https://example.com/cover.png" } }), false);
  assert.equal(hasRequiredVisual({ kind:"threads-file" }), false);
  assert.equal(hasRequiredVisual({ kind:"visual", cover:{ asset:"cover.jpg", url:"https://example.com/cover.jpg" } }), true);
});

test("низкоуровневая отправка запрещает голый текст, кроме явного исключения Threads", async () => {
  await assert.rejects(
    publishToThreads({ text:"Обычная запись", photos:[], config:{ threads:{ userId:"1", token:"test" } } }),
    /без картинки запрещена/,
  );
  await assert.rejects(
    publishToTelegram({ text:"Обычная запись", photos:[], files:[], config:{ telegram:{ token:"test", channel:"@test" } } }),
    /без картинки запрещена/,
  );
});

test("соцсети считают цену по тем же полям, что и полная карточка каталога", () => {
  const car = shapeSocialCar({
    external_id:"58924764",
    brand:"Zeekr",
    model:"001",
    year:2021,
    mileage:67_000,
    battery:100,
    range:732,
    powertrain:"Электромобиль",
    specifications:{},
    city:"hangzhou",
    source:"Che168",
    chinaPrice:107_200,
    usd_price:14_990,
    first_registration:"2021.08",
    source_payload:{ dimensions:"4970*1999*1548", curbWeight:2350, transmission:"single-speed" },
  });
  assert.equal(car.firstRegistration, "2021.08");
  assert.equal(car.dimensions, "4970*1999*1548");
  assert.equal(car.curbWeight, 2350);
  assert.equal(car.transmission, "single-speed");
  assert.equal(car.usdPrice, 14_990);
});

test("до квот 2027 соцсети всегда считают электромобиль с полной пошлиной", () => {
  const car = { source:"Che168", usdPrice:20_000, chinaPrice:143_000, year:2025, type:"Электромобиль" };
  assert.equal(SOCIAL_QUOTA_OVER, true);
  assert.deepEqual(socialLandedPrice(car), estimateLandedCost(car, { quotaOver:true }));
  assert.notEqual(socialLandedPrice(car).totalUsd, estimateLandedCost(car, { quotaOver:false }).totalUsd);
});

test("проданная или недоступная машина не проходит проверку живого каталога", () => {
  const base = { images:["https://example.com/car.jpg"], available:true, status:"Карточка доступна", statusTone:"green" };
  assert.equal(isLiveAvailable(base), true);
  assert.equal(isLiveAvailable({ ...base, available:false }), false);
  assert.equal(isLiveAvailable({ ...base, status:"Продано", statusTone:"red" }), false);
  assert.equal(isLiveAvailable({ ...base, images:[] }), false);
});

test("у всех недельных постов разные машины на обложках", () => {
  const items = assignUniqueWeeklyCovers([
    { draft:{ block:"cheapest", cars:[{ externalId:"1" }], photos:["one-a", "one-b"] } },
    { draft:{ block:"budget", cars:[{ externalId:"1" }, { externalId:"2" }], photos:["one", "two"] } },
    { draft:{ block:"fresh", cars:[{ externalId:"2" }, { externalId:"3" }], photos:["two", "three"] } },
  ]);
  assert.deepEqual(items.map((item) => item.draft.coverCarIds), [["1"], ["2"], ["3"]]);
  assert.deepEqual(items.map((item) => item.draft.coverPhoto), ["one-a", "two", "three"]);
});

test("исходный кадр обложки не дублируется вторым кадром карусели", () => {
  const draft = { block:"budget", coverPhoto:"second", photos:["first", "second", "third"] };
  assert.deepEqual(coverSourcePhotos(draft), ["second"]);
  assert.deepEqual(galleryPhotosAfterCover(draft), ["first", "third"]);

  const duel = { block:"duel", photos:["left-cover", "left-extra", "right-cover", "right-extra"] };
  assert.deepEqual(coverSourcePhotos(duel), ["left-cover", "right-cover"]);
  assert.deepEqual(galleryPhotosAfterCover(duel), ["left-extra", "right-extra"]);
});

test("недельный пакет останавливается, если уникальной машины на обложку нет", () => {
  assert.throws(() => assignUniqueWeeklyCovers([
    { draft:{ block:"cheapest", cars:[{ externalId:"1" }], photos:["one"] } },
    { draft:{ block:"fresh", cars:[{ externalId:"1" }], photos:["one-again"] } },
  ]), /не нашлось уникальной машины/);
});

test("позиции обложек распределяются равномерно и повторяются стабильно", () => {
  const first = coverPlaces("2026-09-21", 5);
  const again = coverPlaces("2026-09-21", 5);
  assert.deepEqual(first, again);
  assert.deepEqual(new Set(first.slice(0, 4)), new Set(COVER_PLACES));
  assert.notEqual(first[3], first[4]);
});

test("размер заголовка зависит от длины темы", () => {
  assert.equal(coverHeadlineSize("Новинки недели"), "large");
  assert.equal(coverHeadlineSize("5 машин до 25 000$"), "large");
  assert.equal(coverHeadlineSize("Оптимальное сочетание цены и состояния"), "small");
});

test("тематические заголовки идут по кругу без соседних повторов", () => {
  for (const [rubric, variants] of Object.entries(COVER_HEADLINE_VARIANTS)) {
    const headlines = Array.from({ length:variants.length + 1 }, (_, occurrence) => coverTopicHeadline(rubric, { occurrence }));
    assert.deepEqual(headlines.slice(0, variants.length), [...variants]);
    assert.ok(headlines.every((headline, index) => index === 0 || headline !== headlines[index - 1]), rubric);
  }
});

test("обложка подборки называет тему, а не выбранную машину", () => {
  assert.equal(coverTopicHeadline("budget", { occurrence:0, count:5, capUsd:25_000 }), "5 машин до 25 000$");
  assert.equal(coverTopicHeadline("budget", { occurrence:1, count:5, capUsd:25_000 }), "Что есть до 25 000$");
  assert.equal(coverTopicHeadline("cheapest", { single:"Zeekr 001 · 22 700$" }), "Zeekr 001 · 22 700$");
});

test("сравнения чередуют формулировку, сохраняя обе модели", () => {
  assert.equal(coverTopicHeadline("duel", { occurrence:0, left:"BMW i5", right:"BYD Han L" }), "BMW i5 или BYD Han L?");
  assert.equal(coverTopicHeadline("duel", { occurrence:1, left:"BMW i5", right:"BYD Han L" }), "BMW i5 против BYD Han L");
});

test("готовый материал журнала занимает свой будний слот, но не добавляет шестой", () => {
  const posts = [
    { slug:"monday", published:"2026-09-21" },
    { slug:"tuesday-b", published:"2026-09-22" },
    { slug:"tuesday-a", published:"2026-09-22" },
    { slug:"without-copy", published:"2026-09-23" },
    { slug:"weekend", published:"2026-09-27" },
  ];
  const slots = journalSlotsForWeek(posts, {
    monday:{}, "tuesday-a":{}, "tuesday-b":{}, weekend:{},
  }, new Date("2026-09-21T00:00:00+03:00"));
  assert.deepEqual(slots.map(({ dayIndex, post }) => [dayIndex, post.slug]), [
    [0, "monday"],
    [1, "tuesday-a"],
  ]);
});
