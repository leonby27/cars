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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blogPosts } from "../src/blog-posts.js";
import { BLOG_SOCIAL } from "../src/blog-social.js";
import { blogPost } from "./lib/social-blocks.mjs";
import { publishToInstagram, publishToTelegram, publishToThreads, refreshSocialTokens } from "./lib/social.mjs";
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
  for (const network of networks) {
    const draft = blogPost({ slug: post.slug, network, site });
    try {
      // Instagram не публикует записи без картинки, поэтому материал журнала уходит
      // туда только вместе с обложкой. Пока обложек нет, эта сеть пропускается.
      if (network === "instagram") { done.push("Instagram: пропущен, нужна обложка"); continue; }
      const sentPost = network === "telegram"
        ? await publishToTelegram({ text: draft.text, photos: [], config, log: console.log })
        : await publishToThreads({ text: draft.text, photos: [], config, log: console.log });
      done.push(`${network === "telegram" ? "Телеграм" : "Threads"}: ${sentPost.url || sentPost.id}`);
    } catch (error) {
      done.push(`${network}: не вышло — ${error.message}`);
    }
  }
  sent[post.slug] = { at: new Date().toISOString(), networks: done };
  await fs.mkdir(path.dirname(sentPath), { recursive: true });
  await fs.writeFile(sentPath, `${JSON.stringify(sent, null, 2)}\n`);
  results.push(`«${post.name || post.slug}» → ${done.join("; ")}`);
  console.log(results.at(-1));
}

const report = [`Журнал в соцсетях: ${results.length} материалов`, ...results];
if (missing.length) report.push(`Нужны тексты для ленты: ${missing.map((post) => post.slug).join(", ")}`);
await sendTelegram(report.join("\n"), { root: ROOT, log: console.log }).catch(() => {});
