// Собирает готовые вертикальные карточки витрины в PNG для последующей генерации.
// Генератор получает не голую фотографию, а ровно тот кадр, который видит человек:
// фото, заголовок, переносы, цвет первого слова, тени и композицию.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { socialPhotoHref } from "../src/photo-source.js";
import { carFrame, headlineSize, KINDS, resolvePlace, socialThemeQuery, socialTiles, tileHeadline } from "../src/social-themes.js";

const root = path.resolve(import.meta.dirname, "..");
const sourceDir = path.join(root, "public/social/source");
const generatedDir = path.join(root, "public/social/generated");
const productionOrigin = "https://abcars.by";
// Равновероятные слоты дают устойчивое правило для будущих карточек:
// промт №1 — 50%, промты №2 и №3 — по 25%.
// Полные тексты всех трёх промтов лежат рядом:
// social-generation-prompt-1.txt, social-generation-prompt-2.txt и
// social-generation-prompt-3.txt.
const promptPool = Object.freeze([1, 1, 2, 3]);
const randomPrompt = () => promptPool[crypto.randomInt(promptPool.length)];

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const socialHeadline = (text) => {
  const value = String(text || "");
  const breakAt = value.search(/\s/);
  const lead = breakAt === -1 ? value : value.slice(0, breakAt);
  const rest = breakAt === -1 ? "" : value.slice(breakAt);
  return `<b>${escapeHtml(lead)}</b>${escapeHtml(rest)}`;
};

const fetchCar = async (query) => {
  const response = await fetch(`${productionOrigin}${socialThemeQuery(query)}`);
  if (!response.ok) throw new Error(`Каталог ответил ${response.status}: ${JSON.stringify(query)}`);
  const payload = await response.json();
  const car = payload?.items?.[0];
  if (!car) throw new Error(`В каталоге нет машины: ${JSON.stringify(query)}`);
  return car;
};

const directPhoto = (car, angle) => {
  const source = carFrame(car, angle);
  const href = socialPhotoHref(source, { width:1080 });
  if (!href) throw new Error(`Нет пригодного JPEG для ${car?.title || car?.id || "машины"}`);
  return href;
};

const fontUrl = (name) => pathToFileURL(path.join(root, `public/fonts/${name}`)).href;
const cardCss = `
  @font-face { font-family:"Montserrat Display"; font-style:normal; font-weight:100 900; src:url("${fontUrl("montserrat-var-latin.woff2")}") format("woff2"); }
  @font-face { font-family:"Montserrat Display"; font-style:normal; font-weight:100 900; src:url("${fontUrl("montserrat-var-cyrillic.woff2")}") format("woff2"); }
  * { box-sizing:border-box; }
  html, body { margin:0; width:1080px; height:1350px; overflow:hidden; background:#17191c; }
  .social-frame { --social-safe:5%; position:relative; container-type:inline-size; width:1080px; height:1350px; overflow:hidden; background:#17191c; }
  .social-frame img { width:100%; height:100%; display:block; object-fit:cover; }
  .social-frame.is-duel { display:grid; grid-template-columns:1fr 1fr; gap:3px; }
  .social-frame.is-duel > span:not(.social-title) { display:block; overflow:hidden; background:#101214; }
  .social-frame.is-duel > .social-duel-divider { position:absolute; left:50%; top:0; bottom:0; width:2px; transform:translateX(-50%); background:rgb(255 255 255 / 55%); }
  .social-frame:not(.edge-bottom)::before { content:""; position:absolute; left:0; right:0; bottom:0; height:50px; background:linear-gradient(to top, rgb(0 0 0 / 40%), rgb(0 0 0 / 0%)); pointer-events:none; }
  .social-frame::after { content:""; position:absolute; left:0; right:0; height:50%; pointer-events:none; }
  .social-frame.edge-top::after { top:0; background:linear-gradient(to bottom, rgb(0 0 0 / 80%), rgb(0 0 0 / 0%)); }
  .social-frame.edge-bottom::after { bottom:0; background:linear-gradient(to top, rgb(0 0 0 / 80%), rgb(0 0 0 / 0%)); }
  .social-title { position:absolute; z-index:1; max-width:74%; text-align:left; color:#fff; font-family:"Montserrat Display", sans-serif; font-weight:850; line-height:1.05; letter-spacing:-.02em; pointer-events:none; filter:drop-shadow(0 .05em .12em rgb(0 0 0 / 55%)); }
  .social-title > b { color:#ff485c; font-weight:inherit; }
  .social-title.size-large { font-size:calc(11cqw * var(--social-title-scale, 1)); }
  .social-title.size-medium { font-size:calc(8.8cqw * var(--social-title-scale, 1)); }
  .social-title.size-small { font-size:calc(7.2cqw * var(--social-title-scale, 1)); }
  .social-title.at-top-left { left:var(--social-safe); top:var(--social-safe); }
  .social-title.at-bottom-left { left:var(--social-safe); bottom:var(--social-safe); }
  .social-title.at-top-center, .social-title.at-bottom-center { left:0; right:0; margin-inline:auto; width:max-content; max-width:78%; text-align:center; }
  .social-title.at-top-center { top:var(--social-safe); }
  .social-title.at-bottom-center { bottom:var(--social-safe); }
`;

const htmlFor = ({ theme, pick, headline, loaded }) => {
  const place = resolvePlace(theme.place, headline);
  const title = headline ? `<span class="social-title at-${place} size-${headlineSize(headline)}">${socialHeadline(headline)}</span>` : "";
  const edge = theme.place.startsWith("top") ? "top" : "bottom";
  if (theme.kind === KINDS.duel) {
    const sides = loaded.map((car, index) => `<span><img src="${escapeHtml(directPhoto(car, pick.sides[index].angle))}" alt=""></span>`).join("");
    return `<div class="social-frame edge-${edge} is-duel">${title}${sides}<span class="social-duel-divider"></span></div>`;
  }
  const image = theme.kind === KINDS.cover
    ? `${productionOrigin}${pick.cover}`
    : directPhoto(loaded, pick.angle);
  return `<div class="social-frame edge-${edge}">${title}<img src="${escapeHtml(image)}" alt=""></div>`;
};

await fs.mkdir(sourceDir, { recursive:true });
await fs.mkdir(generatedDir, { recursive:true });

const tiles = socialTiles();
const prepared = [];
for (const tile of tiles) {
  let loaded = null;
  if (tile.theme.kind === KINDS.duel) loaded = await Promise.all(tile.pick.sides.map((side) => fetchCar(side.query)));
  else if (tile.theme.kind !== KINDS.cover) loaded = await fetchCar(tile.pick.query);
  const headline = tileHeadline(tile.theme, tile.pick, loaded, tile.round);
  prepared.push({ ...tile, loaded, headline });
}

const browser = await chromium.launch({ headless:true });
try {
  const page = await browser.newPage({ viewport:{ width:1080, height:1350 }, deviceScaleFactor:1 });
  for (const tile of prepared) {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${cardCss}</style></head><body>${htmlFor(tile)}</body></html>`, { waitUntil:"load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.complete && image.naturalWidth ? null : new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once:true });
        image.addEventListener("error", () => reject(new Error(`Не загрузилось изображение ${image.src}`)), { once:true });
      })));
      const title = document.querySelector(".social-title");
      if (!title) return;
      title.style.removeProperty("--social-title-scale");
      let scale = 1;
      while (title.scrollWidth > title.clientWidth + 1 && scale > 0.5) {
        scale -= 0.05;
        title.style.setProperty("--social-title-scale", scale.toFixed(2));
      }
    });
    await page.locator(".social-frame").screenshot({ path:path.join(sourceDir, `${tile.key}.png`), type:"png" });
    process.stdout.write(`source ${tile.key}\n`);
  }
} finally {
  await browser.close();
}

const plan = prepared.map(({ key, theme, headline }) => ({
  key,
  theme:theme.id,
  headline,
  source:`/social/source/${key}.png`,
  generated:`/social/generated/${key}.png`,
  prompt:randomPrompt(),
}));
await fs.writeFile(path.join(sourceDir, "manifest.json"), `${JSON.stringify(plan, null, 2)}\n`);
await fs.writeFile(path.join(generatedDir, "manifest.json"), `${JSON.stringify(plan.map(({ key, generated, prompt }) => ({ key, image:generated, prompt })), null, 2)}\n`);
process.stdout.write(`Готово исходников: ${plan.length}\n`);
