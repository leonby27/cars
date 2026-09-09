import test from "node:test";
import assert from "node:assert/strict";
import { vehiclePhotoHref, retryVehiclePhoto } from "../src/photo-source.js";
import { createSeoRenderer } from "../server/seo-render.mjs";

const source = "https://erscglobal2.autoimg.cn/escimg/auto/g34/1400x0_c42_car.jpg.webp";

test("все размеры Che168 и оригинал идут через сервер, включая превью без прокси", () => {
  for (const width of [240, 600, 900, 1400, "original"]) {
    const href = vehiclePhotoHref(source, width);
    assert.equal(href, `/photo/escimg/auto/g34/${width === "original" ? "" : `${width}x0_c42_`}car.jpg.webp`);
    assert.equal(vehiclePhotoHref(source.replace("https:", ""), width), href);
    assert.equal(vehiclePhotoHref(source, width, { mirrorOrigin: "https://abcars.by" }), `https://abcars.by${href}`);
  }
});

test("Guazi использует наш API; обычные локальные изображения сохраняются", () => {
  for (const host of ["image-public.guazistatic.com", "image-oversea.guazistatic-global.com"]) {
    const image = `https://${host}/photo.jpg?x=1&y=2`;
    assert.equal(vehiclePhotoHref(image), `/api/image?src=${encodeURIComponent(image)}`);
  }
  for (const image of ["/photo/escimg/a.webp", "/logo.svg", "https://example.com/a.jpg", null])
    assert.equal(vehiclePhotoHref(image, 600), image);
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

test("у Guazi нет других размеров: ошибка не запускает цикл", () => {
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
