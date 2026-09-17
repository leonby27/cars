// Записи о материалах журнала: что вышло — то и уходит в ленты.
//
// Материалы журнала выходят по расписанию (поле `published` в src/blog-posts.js).
// Эта команда смотрит, что уже вышло, берёт заранее написанную выжимку из
// src/blog-social.js и публикует запись — по одной на материал, один раз.
//
// Запуск: npm run social:blog            опубликовать всё вышедшее и неотправленное
//         npm run social:blog -- --dry   показать, что ушло бы, не публикуя
//         npm run social:blog -- --slug=ev-quota-end   один конкретный материал
//
// Что уже отправлено, помнит runtime/social-blog-sent.json — файл вне git, выкладка
// его не трогает. Материал без выжимки не публикуется: о нём приходит напоминание
// в телеграм, чтобы текст дописали.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blogPosts } from "../src/blog-posts.js";
import { BLOG_SOCIAL } from "../src/blog-social.js";
import { blogCover, dropCover } from "./lib/blog-cover.mjs";
import { blogPost } from "./lib/social-blocks.mjs";
import { publishToInstagram, publishToTelegram, publishToThreads, refreshSocialTokens } from "./lib/social.mjs";
import { mediaStoreReady, stagePhotos, unstagePhotos } from "./lib/social-media-store.mjs";
import { sendTelegram } from "./lib/telegram.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile?.(path.join(ROOT, ".env.local")); } catch {}
try { process.loadEnvFile?.(path.join(ROOT, ".env")); } catch {}

const sentPath = path.join(ROOT, "runtime", "social-blog-sent.json");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const only = args.find((arg) => arg.startsWith("--slug="))?.slice("--slug=".length);
const site = process.env.SITE_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "abcars.by";
const chosen = ["threads", "instagram", "telegram"].filter((network) => args.includes(`--${network}`));
const networks = chosen.length ? chosen : ["threads", "instagram", "telegram"];

const readSent = async () => {
  try { return JSON.parse(await fs.readFile(sentPath, "utf8")); } catch { return {}; }
};

// Свой файл в хранилище: stagePhotos умеет брать только ссылку, поэтому поднимаем
// файл через тот же локальный сервер... вернее, просто читаем его и кладём напрямую.
async function stageCoverFile(file, slug) {
  const { readFile } = await import("node:fs/promises");
  const { stageBuffers } = await import("./lib/social-media-store.mjs");
  return stageBuffers([{ name: `${slug}.jpg`, data: await readFile(file) }], { carNumber: slug.replace(/[^a-z0-9]/gi, ""), log: console.log });
}

const published = blogPosts();
const sent = await readSent();
const due = published.filter((post) => (only ? post.slug === only : !sent[post.slug]));
const ready = due.filter((post) => BLOG_SOCIAL[post.slug]);
const missing = due.filter((post) => !BLOG_SOCIAL[post.slug]);

console.log(`Вышло материалов: ${published.length}. Ждут записи: ${due.length}, из них с готовым текстом: ${ready.length}.`);
if (missing.length) {
  console.log(`Без выжимки (записи не будет): ${missing.map((post) => post.slug).join(", ")}`);
}
if (!ready.length) process.exit(0);

if (dryRun) {
  for (const post of ready) {
    for (const network of networks) {
      const draft = blogPost({ slug: post.slug, network, site });
      console.log(`\n=== ${post.slug} · ${network} (${draft.text.length} знаков)\n${draft.text}`);
    }
  }
  process.exit(0);
}

const config = await refreshSocialTokens({ log: console.log });
const results = [];
for (const post of ready) {
  const done = [];
  // Обложка бывает трёх видов: своя картинка материала, собранная «vs» для сравнения
  // и кадр машины из выборки. Первые две — наши файлы, до которых сети не достают,
  // поэтому телеграму они уходят файлом, а Meta — через хранилище GitHub. Кадр машины
  // лежит в китайском хранилище, и его обе стороны берут по ссылке.
  const cover = await blogCover(post.slug, { site, log: console.log });
  const coverFile = cover?.kind === "file" ? cover.file : "";
  let staged = { links: [], assets: [] };
  if (cover?.kind === "url") {
    staged = { links: [cover.url], assets: [] };
  } else if (coverFile && await mediaStoreReady()) {
    staged = await stageCoverFile(coverFile, post.slug);
  }

  for (const network of networks) {
    const draft = blogPost({ slug: post.slug, network, site });
    try {
      // Instagram не публикует записи без картинки: без обложки материал туда не идёт.
      if (network === "instagram" && !staged.links.length) { done.push("Instagram: пропущен, нужна обложка"); continue; }
      const sentPost = network === "telegram"
        ? await publishToTelegram({ text: draft.text, photos: [], files: coverFile ? [coverFile] : [], config, log: console.log })
        : network === "threads"
          ? await publishToThreads({ text: draft.text, photos: staged.links, config, log: console.log })
          : await publishToInstagram({ caption: draft.text, photos: staged.links, config, log: console.log });
      done.push(`${network === "telegram" ? "Телеграм" : network === "threads" ? "Threads" : "Instagram"}: ${sentPost.url || sentPost.id}`);
    } catch (error) {
      done.push(`${network}: не вышло — ${error.message}`);
    }
  }
  if (staged.assets.length) await unstagePhotos(staged.assets, { log: console.log });
  await dropCover(cover);
  sent[post.slug] = { at: new Date().toISOString(), networks: done };
  await fs.mkdir(path.dirname(sentPath), { recursive: true });
  await fs.writeFile(sentPath, `${JSON.stringify(sent, null, 2)}\n`);
  results.push(`«${post.name || post.slug}» → ${done.join("; ")}`);
  console.log(results.at(-1));
}

const report = [`Журнал в соцсетях: ${results.length} материалов`, ...results];
if (missing.length) report.push(`Нужны тексты для ленты: ${missing.map((post) => post.slug).join(", ")}`);
await sendTelegram(report.join("\n"), { root: ROOT, log: console.log }).catch(() => {});
