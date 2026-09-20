// Готовит недельный пакет для генерации в Codex: пять исходников, тексты для трёх
// сетей и два разрешённых текстовых поста Threads из ../threads.txt.
//
// Этот скрипт ничего не публикует и не вызывает API генерации изображений. После
// него Codex обрабатывает каждый source.file указанным prompt.file, кладёт результат
// в generated.file и запускает social-week-finalize.mjs.
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { BLOG_POSTS } from "../src/blog-posts.js";
import { BLOG_SOCIAL } from "../src/blog-social.js";
import { carTitle } from "../src/car-title.js";
import { blogCover, dropCover } from "./lib/blog-cover.mjs";
import { withCatalogFooter } from "./lib/social-card.mjs";
import {
  CORE_MODELS,
  bestValueOfModel,
  biggestDrops,
  blogPost,
  budgetPick,
  cheapestOfModel,
  closeBlocks,
  freshArrivals,
  modelDuel,
} from "./lib/social-blocks.mjs";
import {
  THREADS_FILE_SLOTS,
  VISUAL_TIMES,
  assignUniqueWeeklyCovers,
  coverHeadlineSize,
  coverPlaces,
  coverSourcePhotos,
  coverTopicHeadline,
  galleryPhotosAfterCover,
  journalSlotsForWeek,
  minskIso,
  preparationMonday,
  nextThreadPosts,
  parseThreadsFile,
  promptNumbers,
  weekKey,
} from "./lib/social-week.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RUNTIME = process.env.SOCIAL_WEEK_RUNTIME_ROOT || path.join(ROOT, "runtime", "social-week");
const STATE_FILE = process.env.SOCIAL_WEEK_STATE_FILE || path.join(ROOT, "runtime", "social-week-state.json");
const THREADS_FILE = path.resolve(ROOT, "..", "threads.txt");
const NETWORKS = ["instagram", "threads", "telegram"];
const force = process.argv.includes("--force");
const weekOption = process.argv.find((arg) => arg.startsWith("--week="))?.slice(7);

const monday = weekOption
  ? new Date(`${weekOption}T00:00:00+03:00`)
  : preparationMonday(new Date());
const week = weekKey(monday);
if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || Number.isNaN(monday.getTime())) throw new Error("Неверная неделя");

const packageDir = path.join(RUNTIME, week);
const sourceDir = path.join(packageDir, "source");
const generatedDir = path.join(packageDir, "generated");
const manifestFile = path.join(packageDir, "manifest.json");

try {
  if (!force) {
    await fs.access(manifestFile);
    process.stdout.write(`${manifestFile}\n`);
    process.exit(0);
  }
} catch {}

const readJson = async (file, fallback) => {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
};
const fileDataUrl = async (file, explicitMime = "") => {
  const extension = path.extname(file).toLowerCase();
  const mime = explicitMime || (extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg");
  return `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
};
const state = await readJson(STATE_FILE, { coreIndex:0, threadLine:0 });
const weekSerial = Math.floor(monday.getTime() / (7 * 24 * 3600_000));
const occurrence = Math.floor(Math.abs(weekSerial) / 2);

const sameCars = (left, right) => JSON.stringify(left?.cars?.map((car) => car.externalId)) === JSON.stringify(right?.cars?.map((car) => car.externalId));
async function allNetworks(factory) {
  const drafts = {};
  for (const network of NETWORKS) {
    const draft = await factory(network);
    drafts[network] = draft ? { ...draft, text:withCatalogFooter(draft.text, network) } : draft;
  }
  const canonical = drafts.telegram || drafts.instagram || drafts.threads;
  if (!canonical || NETWORKS.some((network) => !drafts[network] || !sameCars(canonical, drafts[network]))) return null;
  return { ...canonical, texts:Object.fromEntries(NETWORKS.map((network) => [network, drafts[network].text])) };
}

async function nextModelBlock(factory, start) {
  for (let offset = 0; offset < CORE_MODELS.length; offset += 1) {
    const index = (start + offset) % CORE_MODELS.length;
    const model = CORE_MODELS[index];
    const block = await allNetworks((network) => factory(model, network));
    if (block) return { block, modelIndex:index };
  }
  return null;
}

const coreStart = Number(state.coreIndex || 0) % CORE_MODELS.length;
const core = await nextModelBlock((model, network) => cheapestOfModel({ ...model, network }), coreStart);
if (!core) throw new Error("Не удалось подобрать машину из костяка");

const engagementQuestion = weekSerial % 2 === 1;
const value = await nextModelBlock(
  (model, network) => bestValueOfModel({ ...model, network, asQuestion:engagementQuestion }),
  core.modelIndex + 1,
);
if (!value) throw new Error("Не удалось подобрать оптимальную машину");

const duelPairs = [
  [{ brand:"Xiaomi", model:"YU7" }, { brand:"Mercedes-Benz", model:"EQE" }],
  [{ brand:"BMW", model:"i5" }, { brand:"BYD", model:"Han L" }],
  [{ brand:"Deepal", model:"S05" }, { brand:"Geely", model:"Monjaro" }],
];
let middle;
let middleContext;
if (weekSerial % 2 === 0) {
  const caps = [25_000, 35_000, 20_000];
  const capUsd = caps[Math.abs(weekSerial) % caps.length];
  middle = await allNetworks((network) => budgetPick({ models:CORE_MODELS, capUsd, network, limit:5 }));
  middleContext = { count:middle?.cars?.length || 5, capUsd };
} else {
  const [left, right] = duelPairs[Math.abs(weekSerial) % duelPairs.length];
  middle = await allNetworks((network) => modelDuel({ left, right, network }));
  middleContext = {
    left:carTitle(left.brand, left.model, null),
    right:carTitle(right.brand, right.model, null),
  };
}
if (!middle) throw new Error("Не удалось подобрать среднюю рубрику недели");

const drops = await allNetworks((network) => biggestDrops({ models:CORE_MODELS, network, limit:5 }));
const fresh = await allNetworks((network) => freshArrivals({ models:CORE_MODELS, network, limit:5 }));
if (!drops || !fresh) throw new Error("Не удалось собрать недельные снижения цен или новинки");

const money = (value) => `${new Intl.NumberFormat("ru-RU").format(Math.round(Number(value) || 0))}$`;
const catalogPlan = assignUniqueWeeklyCovers([
  { draft:core.block, headline:coverTopicHeadline("cheapest", { single:`${carTitle(core.block.cars[0].brand, core.block.cars[0].model, null)} · ${money(core.block.cars[0].totalUsd)}` }) },
  { draft:value.block, headline:coverTopicHeadline(value.block.block, { occurrence }) },
  { draft:middle, headline:coverTopicHeadline(middle.block, { occurrence, ...middleContext }) },
  { draft:drops, headline:coverTopicHeadline("drops", { occurrence:Math.abs(weekSerial) }) },
  { draft:fresh, headline:coverTopicHeadline("fresh", { occurrence:Math.abs(weekSerial) }) },
]);

// Материал журнала входит в те же пять слотов, а не создаёт шестую публикацию.
// Он заменяет автомобильную рубрику своего буднего дня только при наличии готовой
// выжимки и доступной обложки; иначе недельный план остаётся автомобильным.
const planned = [...catalogPlan];
const temporaryBlogCovers = [];
const catalogOrigin = String(process.env.SOCIAL_CATALOG_ORIGIN || "https://abcars.by").replace(/\/$/, "");
const site = catalogOrigin.replace(/^https?:\/\//, "");
for (const { dayIndex, post:article } of journalSlotsForWeek(BLOG_POSTS, BLOG_SOCIAL, monday)) {
  const drafts = Object.fromEntries(NETWORKS.map((network) => [network, blogPost({ slug:article.slug, network, site })]));
  if (NETWORKS.some((network) => !drafts[network])) continue;

  let preparedCover = null;
  const localHero = path.join(ROOT, "public", "blog", `${article.slug}-hero.jpg`);
  try {
    await fs.access(localHero);
    preparedCover = { kind:"local", file:localHero };
  } catch {
    preparedCover = await blogCover(article.slug, { site, apiBase:catalogOrigin, log:console.log });
    if (preparedCover?.file) temporaryBlogCovers.push(preparedCover);
  }
  // setContent открывает документ как about:blank, откуда Chromium блокирует
  // file://. Встраиваем локальную обложку, чтобы на исходнике не появился пустой фон.
  const coverPhoto = preparedCover?.file ? await fileDataUrl(preparedCover.file) : preparedCover?.url;
  if (!coverPhoto) continue;
  planned[dayIndex] = {
    headline:coverTopicHeadline("blog", { article:BLOG_SOCIAL[article.slug].title }),
    draft:{
      block:"blog",
      slug:article.slug,
      cars:[],
      coverCarIds:[],
      coverPhoto,
      photos:[coverPhoto],
      texts:Object.fromEntries(NETWORKS.map((network) => [network, withCatalogFooter(drafts[network].text, network)])),
    },
  };
}
const places = coverPlaces(week, planned.length);

const promptIds = promptNumbers(week, planned.length);
for (const item of planned) {
  if (item.draft.texts.threads.length > 500) throw new Error(`Текст Threads для ${item.draft.block} длиннее 500 знаков`);
  if (item.draft.texts.telegram.length > 1024) throw new Error(`Подпись Telegram для ${item.draft.block} длиннее 1024 знаков`);
  if (item.draft.texts.instagram.length > 2200) throw new Error(`Подпись Instagram для ${item.draft.block} длиннее 2200 знаков`);
}
const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fontSource = await fileDataUrl(path.join(ROOT, "public/fonts/montserrat-var-cyrillic.woff2"), "font/woff2");
const css = `
  @font-face { font-family:Montserrat; font-weight:100 900; src:url("${fontSource}") format("woff2"); }
  * { box-sizing:border-box } html,body { margin:0; width:1080px; height:1350px; overflow:hidden; background:#17191c }
  .card { position:relative; width:1080px; height:1350px; overflow:hidden; background:#17191c }
  .photos { width:100%; height:100%; display:grid; grid-template-columns:repeat(var(--count),1fr); gap:3px }
  .photos span { overflow:hidden } img { width:100%; height:100%; display:block; object-fit:cover }
  .card::after { content:""; position:absolute; left:0; right:0; height:52%; pointer-events:none }
  .card.edge-top::after { top:0; background:linear-gradient(to bottom,rgba(0,0,0,.72),transparent) }
  .card.edge-bottom::after { bottom:0; background:linear-gradient(to top,rgba(0,0,0,.72),transparent) }
  h1 { position:absolute; z-index:1; max-width:88%; width:max-content; margin:0; color:white; font-family:Montserrat,sans-serif; font-weight:850; line-height:1.03; letter-spacing:-.035em; text-align:left; text-shadow:0 4px 22px rgba(0,0,0,.65) }
  h1.size-large { font-size:104px }
  h1.size-medium { font-size:86px }
  h1.size-small { font-size:70px }
  h1.at-top-left { top:54px; left:54px }
  h1.at-bottom-left { bottom:54px; left:54px }
  h1.at-top-center, h1.at-bottom-center { left:0; right:0; margin-inline:auto; text-align:center }
  h1.at-top-center { top:54px }
  h1.at-bottom-center { bottom:54px }
  h1 b { color:#ff485c }
`;

const headlineHtml = (headline) => {
  const [first, ...rest] = String(headline).split(/\s+/);
  return `<b>${escapeHtml(first)}</b>${rest.length ? ` ${escapeHtml(rest.join(" "))}` : ""}`;
};
await fs.mkdir(sourceDir, { recursive:true });
await fs.mkdir(generatedDir, { recursive:true });
const browser = await chromium.launch({ headless:true });
const posts = [];
try {
  const page = await browser.newPage({ viewport:{ width:1080, height:1350 }, deviceScaleFactor:1 });
  for (const [index, item] of planned.entries()) {
    const number = String(index + 1).padStart(2, "0");
    const id = `${week}-${number}`;
    const sourceFile = path.join(sourceDir, `${number}.png`);
    const generatedFile = path.join(generatedDir, `${number}.png`);
    const photos = coverSourcePhotos(item.draft);
    if (!photos.length) throw new Error(`У записи ${id} нет фотографии для исходника`);
    const place = places[index];
    const edge = place.startsWith("top") ? "top" : "bottom";
    const size = coverHeadlineSize(item.headline);
    const html = `<div class="card edge-${edge}"><div class="photos" style="--count:${photos.length}">${photos.map((photo) => `<span><img src="${escapeHtml(photo)}" alt=""></span>`).join("")}</div><h1 class="at-${place} size-${size}">${headlineHtml(item.headline)}</h1></div>`;
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`, { waitUntil:"load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.complete && image.naturalWidth ? null : new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once:true });
        image.addEventListener("error", reject, { once:true });
      })));
    });
    await page.locator(".card").screenshot({ path:sourceFile, type:"png" });
    const prompt = promptIds[index];
    posts.push({
      id,
      kind:"visual",
      rubric:item.draft.block,
      headline:item.headline,
      layout:{ place, size, strategy:"balanced-weekly-v1" },
      publishAt:minskIso(monday, index, VISUAL_TIMES[index]),
      cars:item.draft.cars.map((car) => ({ externalId:car.externalId, source:car.source, brand:car.brand, model:car.model })),
      coverCarIds:item.draft.coverCarIds,
      // AI-обложка идёт первой. Сырой кадр, из которого она сделана, сразу за
      // ней не повторяем; остальные фотографии серии сохраняют исходный порядок.
      photos:galleryPhotosAfterCover(item.draft),
      texts:item.draft.texts,
      prompt:{ number:prompt, file:`scripts/social-generation-prompt-${prompt}.txt` },
      source:{ file:path.relative(ROOT, sourceFile) },
      generated:{ file:path.relative(ROOT, generatedFile) },
    });
  }
} finally {
  await browser.close();
  await Promise.all(temporaryBlogCovers.map((cover) => dropCover(cover)));
  await closeBlocks();
}

const threadEntries = parseThreadsFile(await fs.readFile(THREADS_FILE, "utf8"));
const selectedThreads = nextThreadPosts(threadEntries, state.threadLine, 2);
const threadPosts = selectedThreads.map((entry, index) => ({
  id:`${week}-threads-${entry.line}`,
  kind:"threads-file",
  sourceLine:entry.line,
  publishAt:minskIso(monday, THREADS_FILE_SLOTS[index].dayOffset, THREADS_FILE_SLOTS[index].time),
  text:withCatalogFooter(entry.text, "threads"),
}));

const manifest = {
  version:1,
  week,
  timezone:"Europe/Minsk",
  preparedAt:new Date().toISOString(),
  status:"awaiting-generation",
  posts,
  threadPosts,
};
await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
await fs.mkdir(path.dirname(STATE_FILE), { recursive:true });
await fs.writeFile(STATE_FILE, `${JSON.stringify({
  coreIndex:(core.modelIndex + 1) % CORE_MODELS.length,
  threadLine:selectedThreads.at(-1)?.line || state.threadLine || 0,
  preparedWeek:week,
}, null, 2)}\n`);

process.stdout.write(`Недельный пакет: ${manifestFile}\n`);
for (const post of posts) process.stdout.write(`${post.id}: ${post.rubric}, промпт ${post.prompt.number}, ${post.source.file}\n`);
for (const post of threadPosts) process.stdout.write(`${post.id}: Threads, строка ${post.sourceLine}\n`);
