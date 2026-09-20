// Серверная половина недельного конвейера. Запускается таймером, берёт готовый
// пакет из служебного релиза и публикует только наступившие слоты.
//
// Жёсткое правило: визуальная запись никогда не превращается в текстовую. Если
// готовой AI-обложки нет или она не скачалась, вся запись получает «пропущена».
// Единственный разрешённый вызов Threads без картинки — kind=threads-file.
import fs from "node:fs/promises";
import path from "node:path";
import { cleanupStalePhotos, stageBuffers, unstagePhotos } from "./lib/social-media-store.mjs";
import { dropFrames, prepareFrames } from "./lib/photo-local.mjs";
import { publishToInstagram, publishToTelegram, publishToThreads, refreshSocialTokens } from "./lib/social.mjs";
import { hasRequiredVisual, threadsTimeline, weekKey, weeklyManifestUrl } from "./lib/social-week.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
try { process.loadEnvFile?.(path.join(ROOT, ".env.local")); } catch {}
try { process.loadEnvFile?.(path.join(ROOT, ".env")); } catch {}

const dryRun = process.argv.includes("--dry");
const publishAllNow = process.argv.includes("--all-now");
const week = process.argv.find((arg) => arg.startsWith("--week="))?.slice(7) || weekKey();
const requestedNetworks = process.argv.find((arg) => arg.startsWith("--networks="))?.slice(11);
const networks = requestedNetworks
  ? requestedNetworks.split(",").map((value) => value.trim()).filter(Boolean)
  : ["instagram", "threads", "telegram"];
for (const network of networks) {
  if (!["instagram", "threads", "telegram"].includes(network)) throw new Error(`Неизвестная соцсеть: ${network}`);
}
const stateFile = process.env.SOCIAL_WEEK_PUBLISH_STATE_FILE || path.join(ROOT, "runtime", "social-week-published.json");
const workRoot = process.env.SOCIAL_WEEK_PUBLISH_WORK_ROOT || path.join(ROOT, "runtime", "social-week-publish");
const catalogOrigin = String(process.env.SOCIAL_CATALOG_ORIGIN || "https://abcars.by").replace(/\/$/, "");

const readJson = async (file, fallback) => {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
};
const state = await readJson(stateFile, { visual:{}, threadsFile:{} });
state.visual ||= {};
state.threadsFile ||= {};

async function saveState() {
  await fs.mkdir(path.dirname(stateFile), { recursive:true });
  const temporary = `${stateFile}.new`;
  await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
  await fs.rename(temporary, stateFile);
}

async function fetchJson(url) {
  const response = await fetch(`${url}?v=${Date.now()}`, { signal:AbortSignal.timeout(20_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Недельный пакет ответил ${response.status}`);
  return response.json();
}

async function downloadImage(url, file) {
  const response = await fetch(`${url}?v=${Date.now()}`, { redirect:"follow", signal:AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`обложка ответила ${response.status}`);
  const type = response.headers.get("content-type") || "";
  const data = Buffer.from(await response.arrayBuffer());
  const jpeg = data[0] === 0xff && data[1] === 0xd8;
  if (!type.startsWith("image/") && type !== "application/octet-stream" && !jpeg) throw new Error(`вместо обложки пришёл ${type || "неизвестный файл"}`);
  if (!jpeg) throw new Error("готовая обложка не является JPEG");
  if (data.length < 10_000) throw new Error("файл обложки подозрительно мал");
  await fs.writeFile(file, data);
  return file;
}

async function carsStillActive(cars) {
  if (!cars?.length) return true;
  const checks = await Promise.all(cars.map(async (car) => {
    const prefix = car.source === "Che168" ? "che168" : car.source === "Guazi" ? "guazi" : String(car.source || "").toLowerCase();
    const response = await fetch(`${catalogOrigin}/api/cars/${encodeURIComponent(`${prefix}-${car.externalId}`)}`, {
      signal:AbortSignal.timeout(20_000),
    });
    if (!response.ok) return false;
    const live = await response.json();
    return live.available !== false && live.statusTone !== "red" && live.status !== "Продано";
  }));
  return checks.every(Boolean);
}

const due = (item) => publishAllNow || Date.parse(item.publishAt) <= Date.now();
const done = (record) => record?.status === "published" || record?.status === "skipped";
const manifest = await fetchJson(process.env.SOCIAL_WEEK_MANIFEST_URL || weeklyManifestUrl(week));
if (!manifest) {
  console.log(`Готового недельного пакета ${week} ещё нет.`);
  process.exit(0);
}
if (manifest.status !== "ready" || manifest.week !== week) throw new Error("Недельный пакет не готов или относится к другой неделе");

const config = dryRun ? null : await refreshSocialTokens({ log:console.log });

async function publishVisual(post, targetNetworks) {
  if (!targetNetworks.length || !due(post)) return false;
  const existing = state.visual[post.id];
  if (existing?.status === "skipped") return false;
  if (targetNetworks.every((network) => existing?.networks?.[network]?.status === "published")) {
    return targetNetworks.includes("threads") && existing?.networks?.threads?.status === "published";
  }
  if (!hasRequiredVisual(post)) {
    state.visual[post.id] = { status:"skipped", reason:"missing_generated_cover", at:new Date().toISOString() };
    await saveState();
    console.log(`${post.id}: пропущена — нет готовой сгенерированной обложки`);
    return false;
  }
  if (!(await carsStillActive(post.cars))) {
    state.visual[post.id] = { status:"skipped", reason:"inactive_car", at:new Date().toISOString() };
    await saveState();
    console.log(`${post.id}: пропущена — одна из машин больше не активна`);
    return false;
  }
  if (dryRun) {
    console.log(`${post.id}: готова к публикации в ${targetNetworks.join(", ")} (${post.rubric}), обложка ${post.cover.url}`);
    return targetNetworks.includes("threads");
  }

  const dir = path.join(workRoot, post.id);
  await fs.mkdir(dir, { recursive:true });
  const cover = path.join(dir, "00-cover.jpg");
  let frames = [];
  let staged = [];
  try {
    // Отсутствующая обложка пропускает запись целиком. Обычная фотография машины
    // никогда не занимает её место.
    await downloadImage(post.cover.url, cover);
    frames = await prepareFrames(post.photos || [], { dir, prefix:"gallery", mode:"crop", shape:"vertical", log:console.log });
    const files = [cover, ...frames].slice(0, 10);
    const coverStage = await stageBuffers([{ name:path.basename(cover), data:await fs.readFile(cover) }], { carNumber:`${post.id}-cover`, log:console.log });
    if (coverStage.links.length !== 1) throw new Error("сгенерированная обложка не попала в хранилище Meta");
    staged.push(...coverStage.assets);
    const galleryStage = frames.length
      ? await stageBuffers(await Promise.all(frames.slice(0, 9).map(async (file) => ({ name:path.basename(file), data:await fs.readFile(file) }))), { carNumber:`${post.id}-gallery`, log:console.log })
      : { links:[], assets:[] };
    staged.push(...galleryStage.assets);
    const links = [...coverStage.links, ...galleryStage.links];

    const record = state.visual[post.id] || { status:"publishing", networks:{} };
    record.networks ||= {};
    state.visual[post.id] = record;
    const actions = {
      instagram:() => publishToInstagram({ caption:post.texts.instagram, photos:links, config, log:console.log }),
      threads:() => publishToThreads({ text:post.texts.threads, photos:links, config, log:console.log }),
      telegram:() => publishToTelegram({ text:post.texts.telegram, files, config, log:console.log }),
    };
    for (const network of targetNetworks) {
      if (record.networks[network]?.status === "published") continue;
      if (!post.texts?.[network]) throw new Error(`нет текста для ${network}`);
      try {
        const result = await actions[network]();
        record.networks[network] = { status:"published", at:new Date().toISOString(), url:result.url || "", id:result.id, ...(result.ids ? { ids:result.ids } : {}) };
        await saveState();
      } catch (error) {
        record.networks[network] = { status:"error", at:new Date().toISOString(), error:error.message };
        await saveState();
        console.error(`${post.id}, ${network}: ${error.message}`);
      }
    }
    record.status = networks.every((network) => record.networks[network]?.status === "published") ? "published" : "retry";
    record.at = new Date().toISOString();
    await saveState();
  } catch (error) {
    // Только отсутствие самой обложки означает окончательный пропуск. Временный
    // сбой API или хранилища остаётся на повтор следующего запуска таймера.
    if (/обложк/.test(error.message) && /ответила|вместо|подозрительно мал|не является JPEG/.test(error.message)) {
      state.visual[post.id] = { status:"skipped", reason:"missing_generated_cover", error:error.message, at:new Date().toISOString() };
      await saveState();
      console.log(`${post.id}: пропущена — ${error.message}`);
    } else {
      console.error(`${post.id}: повторим позже — ${error.message}`);
    }
  } finally {
    await unstagePhotos(staged, { log:console.log }).catch(() => {});
    await dropFrames(frames).catch(() => {});
    await fs.rm(dir, { recursive:true, force:true });
  }
  return state.visual[post.id]?.networks?.threads?.status === "published";
}

// Instagram и Telegram идут своим расписанием. Threads обрабатывается ниже общей
// временной лентой, чтобы два текстовых поста не собрались отдельной пачкой.
const otherNetworks = networks.filter((network) => network !== "threads");
for (const post of manifest.posts || []) await publishVisual(post, otherNetworks);

if (networks.includes("threads")) {
  let lastKind = state.threadsFeed?.lastKind || null;
  for (const item of threadsTimeline(manifest)) {
    const post = item.post;
    if (!due(post)) continue;

    if (item.kind === "visual") {
      const published = await publishVisual(post, ["threads"]);
      if (published) {
        lastKind = "visual";
        if (!dryRun) {
          state.threadsFeed = { lastKind, postId:post.id, at:new Date().toISOString() };
          await saveState();
        }
      }
      continue;
    }

    // Только эти записи могут уйти в Threads без изображения. Если предыдущая
    // реально опубликованная запись тоже была текстовой, ждём следующую успешную
    // визуальную публикацию вместо двух текстов подряд.
    if (post.kind !== "threads-file") continue;
    if (done(state.threadsFile[post.id])) {
      lastKind = "text";
      continue;
    }
    if (lastKind === "text") {
      console.log(`${post.id}: отложен — текстовые посты Threads не публикуются подряд`);
      continue;
    }
    if (dryRun) {
      console.log(`${post.id}: готов текстовый пост Threads из строки ${post.sourceLine}`);
      lastKind = "text";
      continue;
    }
    try {
      const result = await publishToThreads({ text:post.text, photos:[], allowTextOnly:true, config, log:console.log });
      state.threadsFile[post.id] = { status:"published", at:new Date().toISOString(), url:result.url || "", id:result.id };
      lastKind = "text";
      state.threadsFeed = { lastKind, postId:post.id, at:new Date().toISOString() };
      await saveState();
    } catch (error) {
      state.threadsFile[post.id] = { status:"retry", at:new Date().toISOString(), error:error.message };
      await saveState();
      console.error(`${post.id}: повторим позже — ${error.message}`);
    }
  }
}

await cleanupStalePhotos({ log:console.log }).catch(() => {});
