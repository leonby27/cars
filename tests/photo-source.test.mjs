import test from "node:test";
import assert from "node:assert/strict";
import { PHOTO_BROWSER_CACHE_VERSION, vehiclePhotoHref, retryVehiclePhoto, socialPhotoHref, allowedGuaziPhotoQuery } from "../src/photo-source.js";
import { createSeoRenderer } from "../server/seo-render.mjs";

const source = "https://erscglobal2.autoimg.cn/escimg/auto/g34/1400x0_c42_car.jpg.webp";

test("Guazi: превью 600 и 1200 в webp у хранилища, оригинал без пережатия", () => {
  const bce = "https://global-image-pub.guazistatic-global.com/a.jpg?x-bce-process=image/format,f_jpg";
  const mogr = "https://global-image1.guazistatic-global.com/b.jpg?imageMogr2/format/jpg";
  const src = href => new URL(new URL(href, "https://abcars.by").searchParams.get("src"));
  const sized = { 240:600, 600:600, 800:1200, 1200:1200, 1400:1200 };
  for (const [width, expected] of Object.entries(sized)) {
    assert.equal(src(vehiclePhotoHref(bce, Number(width))).href, `https://global-image-pub.guazistatic-global.com/a.jpg?x-bce-process=image/resize,m_lfit,w_${expected}/format,f_webp/quality,q_90`);
    assert.equal(src(vehiclePhotoHref(mogr, Number(width))).href, `https://global-image1.guazistatic-global.com/b.jpg?imageMogr2/thumbnail/${expected}x/format/webp/quality/90`);
  }
  for (const width of [0, "original"]) {
    assert.equal(src(vehiclePhotoHref(bce, width)).href, bce);
    assert.equal(src(vehiclePhotoHref(mogr, width)).href, mogr);
  }
  for (const source of [bce, mogr]) for (const width of [0, 600, 1200]) assert.ok(allowedGuaziPhotoQuery(src(vehiclePhotoHref(source, width))));
  assert.equal(allowedGuaziPhotoQuery(new URL("https://global-image-pub.guazistatic-global.com/a.jpg?x-bce-process=image/resize,m_lfit,w_601/format,f_webp")), false);
  assert.equal(allowedGuaziPhotoQuery(new URL("https://global-image-pub.guazistatic-global.com/a.jpg?x-bce-process=image/format,f_jpg&n=1")), false);
});

test("все размеры Che168 и оригинал идут через сервер, включая превью без прокси", () => {
  for (const width of [240, 600, 900, 1400, "original"]) {
    const href = vehiclePhotoHref(source, width);
    assert.equal(href, `/photo/escimg/auto/g34/${width === "original" ? "" : `${width}x0_c42_`}car.jpg.webp?v=${PHOTO_BROWSER_CACHE_VERSION}`);
    assert.equal(vehiclePhotoHref(source.replace("https:", ""), width), href);
    assert.equal(vehiclePhotoHref(source, width, { mirrorOrigin: "https://abcars.by" }), `https://abcars.by${href}`);
    assert.equal(
      vehiclePhotoHref(source, width, { cacheVersion:"" }),
      `/photo/escimg/auto/g34/${width === "original" ? "" : `${width}x0_c42_`}car.jpg.webp`,
    );
  }
});

test("Guazi использует наш API; обычные локальные изображения сохраняются", () => {
  for (const host of ["image-public.guazistatic.com", "image-oversea.guazistatic-global.com", "global-image1.guazistatic-global.com"]) {
    const image = `https://${host}/photo.jpg?x=1&y=2`;
    assert.equal(vehiclePhotoHref(image), `/api/image?src=${encodeURIComponent(image)}&v=${PHOTO_BROWSER_CACHE_VERSION}`);
    assert.equal(vehiclePhotoHref(image, 0, { cacheVersion:"" }), `/api/image?src=${encodeURIComponent(image)}`);
  }
  for (const image of ["/photo/escimg/a.webp", "/logo.svg", "https://example.com/a.jpg", null])
    assert.equal(vehiclePhotoHref(image, 600), image);
});

test("для соцсетей адрес ведёт в хранилище источника, без webp и без версии", () => {
  const expected = "https://erscglobal2.autoimg.cn/escimg/auto/g34/1080x0_car.jpg";
  assert.equal(socialPhotoHref(source), expected);
  assert.equal(socialPhotoHref(source.replace("https:", "")), expected);
  assert.equal(socialPhotoHref("/photo/escimg/auto/g34/1400x0_c42_car.jpg.webp"), expected);
  assert.equal(socialPhotoHref(source, { width: 1440 }), expected.replace("1080x0_", "1440x0_"));
  assert.equal(
    socialPhotoHref(source, { origin: "https://abcars.by" }),
    "https://abcars.by/photo/escimg/auto/g34/1080x0_car.jpg",
  );
  // Чужие и нераспознанные адреса соцсетям не отдаём: пусть запись уйдёт без фото.
  for (const other of ["https://example.com/a.jpg", "/logo.svg", "", null, undefined])
    assert.equal(socialPhotoHref(other), "");
});

const mockImage = (src, srcset) => {
  const attrs = { src, ...(srcset ? { srcset, sizes: "100vw" } : {}) };
  return {
    dataset: {}, attrs,
    getAttribute: key => attrs[key] || null,
    removeAttribute: key => delete attrs[key],
    set src(value) { attrs.src = value; },
  };
};

test("миниатюра пробует размер объявления, затем оригинал, без циклов", () => {
  const image = mockImage(vehiclePhotoHref(source, 600), `${vehiclePhotoHref(source, 1400)} 2x`);
  retryVehiclePhoto(image, source);
  assert.equal(image.attrs.src, vehiclePhotoHref(source));
  assert.equal(image.attrs.srcset, undefined);
  assert.equal(image.attrs.sizes, undefined);
  retryVehiclePhoto(image, source);
  assert.equal(image.attrs.src, vehiclePhotoHref(source, "original"));
  retryVehiclePhoto(image, source);
  assert.equal(image.attrs.src, vehiclePhotoHref(source, "original"));
});

test("ошибка оригинала переключает на размер объявления, затем сохранённое превью", () => {
  const image = mockImage(vehiclePhotoHref(source, "original"));
  retryVehiclePhoto(image, source);
  assert.equal(image.attrs.src, vehiclePhotoHref(source));
  retryVehiclePhoto(image, source);
  assert.equal(image.attrs.src, vehiclePhotoHref(source, 600));
  retryVehiclePhoto(image, source);
  assert.equal(image.attrs.src, vehiclePhotoHref(source, 600));
});

test("новый снимок сбрасывает попытки; адреса внешнего превью сохраняют сервер", () => {
  const options = { mirrorOrigin:"https://abcars.by" };
  const image = mockImage(vehiclePhotoHref(source, 600, options));
  retryVehiclePhoto(image, source, options);
  assert.equal(image.attrs.src, vehiclePhotoHref(source, 0, options));
  const next = source.replace("car.jpg", "next.jpg");
  image.src = vehiclePhotoHref(next, 600, options);
  retryVehiclePhoto(image, next, options);
  assert.equal(image.attrs.src, vehiclePhotoHref(next, 0, options));
});

test("у старых адресов Guazi без обработки в хранилище других размеров нет: ошибка не запускает цикл", () => {
  const source = "https://image-public.guazistatic.com/a.jpg";
  const image = mockImage(vehiclePhotoHref(source));
  retryVehiclePhoto(image, source);
  assert.equal(image.attrs.src, vehiclePhotoHref(source));
});

test("поисковая разметка старых Guazi тоже использует серверный адрес", () => {
  const image = "https://image-public.guazistatic.com/a.jpg";
  const renderer = createSeoRenderer({ shell: '<html lang="ru"><head></head><body><div id="root"></div></body></html>', siteUrl: "https://abcars.by" });
  const { html } = renderer.carPage({ car: { id: "guazi-123", title: "Car", image, chinaPrice: 100000 } });
  assert.match(html, /<img src="\/api\/image\?src=/);
  assert.match(html, /<meta property="og:image" content="https:\/\/abcars.by\/api\/image\?src=/);
});

test("сломанное превью Guazi переключается на оригинал", () => {
  const source = "https://global-image-pub.guazistatic-global.com/a.jpg?x-bce-process=image/format,f_jpg";
  const image = mockImage(vehiclePhotoHref(source, 600));
  retryVehiclePhoto(image, source);
  assert.equal(image.attrs.src, vehiclePhotoHref(source));
  retryVehiclePhoto(image, source);
  assert.equal(image.attrs.src, vehiclePhotoHref(source));
});

test("Encar: три размера в пути через наш сервер, соцсетям — JPEG с параметрами хранилища", () => {
  const encar = "https://ci.encar.com/carpicture/carpicture01/pic4012/40123456_001.jpg";
  assert.equal(vehiclePhotoHref(encar, 600, { cacheVersion: "" }), "/photo/encar/v2/w600/carpicture/carpicture01/pic4012/40123456_001.jpg");
  assert.equal(vehiclePhotoHref(encar, 1200, { cacheVersion: "" }), "/photo/encar/v2/w1200/carpicture/carpicture01/pic4012/40123456_001.jpg");
  assert.equal(vehiclePhotoHref(encar, "original", { cacheVersion: "" }), "/photo/encar/v2/w1920/carpicture/carpicture01/pic4012/40123456_001.jpg");
  assert.equal(vehiclePhotoHref(encar, 0, { cacheVersion: "" }), "/photo/encar/v2/w600/carpicture/carpicture01/pic4012/40123456_001.jpg");
  assert.equal(socialPhotoHref(encar), `${encar}?impolicy=heightRate&rh=608&cw=1080&ch=608&cg=Center`);
  assert.equal(socialPhotoHref("/photo/encar/v2/w600/carpicture/carpicture01/pic4012/40123456_001.jpg", { origin: "https://abcars.by" }), "https://abcars.by/photo/encar/v2/w1200/carpicture/carpicture01/pic4012/40123456_001.jpg");
  assert.equal(vehiclePhotoHref(encar, 1920, { cacheVersion: "" }), vehiclePhotoHref(encar, "original", { cacheVersion: "" }));
  assert.equal(socialPhotoHref("/photo/encar/w600/carpicture/carpicture01/pic4012/40123456_001.jpg", { origin: "https://abcars.by" }), socialPhotoHref(encar, { origin: "https://abcars.by" }));
  // Чужой хост по-прежнему уходит как есть.
  assert.equal(vehiclePhotoHref("https://example.com/a.jpg", 600), "https://example.com/a.jpg");
});
