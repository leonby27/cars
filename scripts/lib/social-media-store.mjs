// Временное хранилище кадров для соцсетей — вложения к служебному релизу GitHub.
//
// Зачем: Instagram и Threads скачивают картинку сами по ссылке, а до нашего сервера
// загрузчик Meta не доходит (он в российской сети). Раньше мы давали им прямые адреса
// китайского хранилища — работает, но там нельзя ничего дорисовать: ни логотип, ни
// цену. Теперь кадр сначала кладётся сюда, а сети берут его уже отсюда.
//
// Почему вложения к релизу, а не файлы в репозитории: файл, положенный в репозиторий,
// остаётся в его истории навсегда, даже если его удалить. Вложение удаляется целиком.
//
// Порядок такой: перед публикацией кадры загружаются, после публикации — удаляются.
// Сетям этого хватает: Meta скачивает снимок один раз, при подготовке записи, и
// дальше хранит у себя.
//
// Про осторожность с удалением. Удаляется только то, что подходит сразу под три
// условия: лежит в нашем служебном релизе, имя начинается с «abcars-social-» и
// сам файл был загружен этим же прогоном (или он старше суток — значит остался от
// прогона, который оборвался). Сам релиз не удаляется никогда, чужие файлы не
// трогаются, других тегов и репозиториев код не касается.
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tmpDir = path.join(root, "runtime", "social-photos");

const REPO = process.env.GITHUB_MEDIA_REPO || "leonby27/cars";
const TAG = process.env.GITHUB_MEDIA_TAG || "social-media";
// Единственное имя, которое этот код готов удалять.
const OURS = /^abcars-social-[a-z0-9-]+\.jpg$/i;
const STALE_HOURS = 24;

async function token() {
  if (process.env.GITHUB_MEDIA_TOKEN) return process.env.GITHUB_MEDIA_TOKEN;
  // На ноутбуке ключ можно не прописывать: возьмём у установленного gh.
  try {
    const { stdout } = await run("gh", ["auth", "token"]);
    return stdout.trim();
  } catch { return ""; }
}

export async function mediaStoreReady() {
  return Boolean(await token());
}

async function api(url, { method = "GET", body = null, contentType = "application/json", raw = false } = {}) {
  const auth = await token();
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${auth}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(body ? { "content-type": contentType } : {}),
    },
    ...(body ? { body } : {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub ответил ${response.status}: ${text.slice(0, 160)}`);
  }
  return raw || response.status === 204 ? null : response.json();
}

async function release() {
  return api(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`);
}

// Имя кадра: по нему видно, к какой машине он относится и когда загружен.
const assetName = (carNumber, index) =>
  `abcars-social-${String(carNumber).replace(/[^a-z0-9]/gi, "")}-${index}-${Date.now().toString(36)}.jpg`;

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`кадр не скачался: ответ ${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!/^image\//.test(type)) throw new Error(`по адресу не картинка, а ${type || "непонятно что"}`);
  await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

/**
 * Скачивает кадры и кладёт их во вложения служебного релиза.
 * Возвращает ссылки для соцсетей и имена вложений, которые потом надо удалить.
 * Кадр, который не удалось скачать или загрузить, просто пропускается: запись
 * выйдет с остальными, а не сорвётся целиком.
 */
export async function stagePhotos(photos, { carNumber = "0", log = console.log } = {}) {
  const info = await release();
  const uploadBase = info.upload_url.replace(/\{.*$/, "");
  await fs.mkdir(tmpDir, { recursive: true });

  const links = [];
  const assets = [];
  for (const [index, source] of photos.entries()) {
    const name = assetName(carNumber, index + 1);
    const file = path.join(tmpDir, name);
    try {
      await download(source, file);
      const uploaded = await api(`${uploadBase}?name=${encodeURIComponent(name)}`, {
        method: "POST",
        body: await fs.readFile(file),
        contentType: "image/jpeg",
      });
      links.push(uploaded.browser_download_url);
      assets.push({ id: uploaded.id, name });
    } catch (error) {
      log(`кадр ${index + 1} не попал в хранилище (${error.message}), пропускаю`);
    } finally {
      await fs.rm(file, { force: true });
    }
  }
  return { links, assets };
}

/**
 * То же, что stagePhotos, но кадры уже у нас в памяти: так кладутся наши собственные
 * картинки — обложка материала журнала и собранная «vs», которых нет ни по какой
 * внешней ссылке.
 */
export async function stageBuffers(items, { carNumber = "0", log = console.log } = {}) {
  const info = await release();
  const uploadBase = info.upload_url.replace(/\{.*$/, "");
  const links = [];
  const assets = [];
  for (const [index, item] of items.entries()) {
    const name = assetName(carNumber, index + 1);
    try {
      const uploaded = await api(`${uploadBase}?name=${encodeURIComponent(name)}`, {
        method: "POST", body: item.data, contentType: "image/jpeg",
      });
      links.push(uploaded.browser_download_url);
      assets.push({ id: uploaded.id, name });
    } catch (error) {
      log(`картинка «${item.name}» не попала в хранилище (${error.message})`);
    }
  }
  return { links, assets };
}

/** Удаляет вложения, загруженные этим прогоном. Ничего другого не трогает. */
export async function unstagePhotos(assets, { log = console.log } = {}) {
  for (const asset of assets) {
    if (!OURS.test(asset.name)) {
      log(`не удаляю «${asset.name}»: это не наш файл`);
      continue;
    }
    try {
      await api(`https://api.github.com/repos/${REPO}/releases/assets/${asset.id}`, { method: "DELETE", raw: true });
    } catch (error) {
      log(`не удалось убрать «${asset.name}» (${error.message}) — подчистится следующим прогоном`);
    }
  }
}

/**
 * Подчищает вложения, оставшиеся от прогонов, которые оборвались на полпути:
 * наши по имени и старше суток. Чужие файлы и свежие кадры не трогает.
 */
export async function cleanupStalePhotos({ log = console.log, olderThanHours = STALE_HOURS } = {}) {
  const info = await release();
  const edge = Date.now() - olderThanHours * 60 * 60 * 1000;
  const stale = (info.assets || []).filter((asset) => OURS.test(asset.name) && Date.parse(asset.created_at) < edge);
  if (!stale.length) return 0;
  await unstagePhotos(stale.map((asset) => ({ id: asset.id, name: asset.name })), { log });
  log(`убрано забытых кадров: ${stale.length}`);
  return stale.length;
}
