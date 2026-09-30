// Read-only check of the actual HTML and image bytes served by the site.
// node scripts/audit-blog-images.mjs [--all] [--output=/tmp/blog-images.json]
// --all includes scheduled articles and drafts available at direct URLs.
import fs from "node:fs/promises";
import { BLOG_POSTS, blogPostHidden } from "../src/blog-posts.js";

const args = process.argv.slice(2);
const site = new URL(args.find(arg => arg.startsWith("--site="))?.slice(7) || "https://abcars.by");
const output = args.find(arg => arg.startsWith("--output="))?.slice(9);
const posts = BLOG_POSTS.filter(post => args.includes("--all") || !blogPostHidden(post));
const images = new Map();
const pages = [];
const decode = value => value.replaceAll("&amp;", "&").replaceAll("&#38;", "&").replaceAll("&quot;", '"');
const attr = (tag, name) => decode(tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] || "");

async function pool(items, task) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) await task(items[next++]);
  }));
}

await pool(posts, async post => {
  const page = { slug: post.slug, published: !blogPostHidden(post), images: [] };
  pages.push(page);
  try {
    const response = await fetch(new URL(`/blog/${post.slug}?nocount=1`, site), { signal: AbortSignal.timeout(45000) });
    page.status = response.status;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
      const sources = [attr(tag, "src"), ...attr(tag, "srcset").split(",").map(item => item.trim().split(/\s+/)[0])];
      for (const source of sources.filter(Boolean)) {
        const url = new URL(source, site);
        if (url.origin !== site.origin || !/^\/(?:photo\/|blog\/|api\/image\b)/.test(url.pathname)) continue;
        const href = url.href;
        if (!page.images.includes(href)) page.images.push(href);
        if (!images.has(href)) images.set(href, { url: href, pages: [] });
        if (!images.get(href).pages.includes(post.slug)) images.get(href).pages.push(post.slug);
      }
    }
    if (!page.images.length) throw new Error("No journal images found in HTML");
  } catch (error) { page.error = error.message; }
});
console.log(`Pages: ${pages.length}; unique image URLs: ${images.size}`);

let checked = 0;
await pool([...images.values()], async image => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(image.url, { signal: AbortSignal.timeout(45000) });
      image.status = response.status;
      image.type = response.headers.get("content-type") || "";
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      image.bytes = bytes.length;
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
      const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!image.type.startsWith("image/") || !(jpeg || webp || png)) throw new Error("Response is not a JPEG, WebP or PNG image");
      delete image.error;
      break;
    } catch (error) { image.error = error.message; }
  }
  checked++;
  if (checked % 100 === 0) console.log(`Checked images: ${checked}/${images.size}`);
});
const failures = [...images.values()].filter(image => image.error);
const failedPages = pages.filter(page => page.error);
const report = { checkedAt: new Date().toISOString(), site: site.href, pages: pages.sort((a,b) => a.slug.localeCompare(b.slug)), images: [...images.values()], failures: failures.length, failedPages: failedPages.length };
if (output) await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pages: pages.length, images: images.size, failedPages, failures }, null, 2));
if (failures.length || failedPages.length) process.exitCode = 1;
