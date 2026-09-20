// Удаляет тестовый недельный прогон после ручной проверки владельцем.
// Instagram намеренно не затрагивается: опубликованные там карточки владелец
// удаляет сам. Состояние сохраняется после каждого удаления, поэтому повторный
// запуск безопасен и продолжает с места остановки.
import fs from "node:fs/promises";
import path from "node:path";
import { deleteTelegramPost, deleteThreadsPost, refreshSocialTokens } from "./lib/social.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
try { process.loadEnvFile?.(path.join(ROOT, ".env.local")); } catch {}
try { process.loadEnvFile?.(path.join(ROOT, ".env")); } catch {}

const stateFile = process.env.SOCIAL_WEEK_PUBLISH_STATE_FILE
  || path.join(ROOT, "runtime", "social-week-test-published.json");
const state = JSON.parse(await fs.readFile(stateFile, "utf8"));
const config = await refreshSocialTokens({ log:console.log });

async function saveState() {
  const temporary = `${stateFile}.new`;
  await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
  await fs.rename(temporary, stateFile);
}

async function removeThreads(record, label) {
  if (!record?.id || record.deletedAt) return;
  await deleteThreadsPost(record.id, { config });
  record.deletedAt = new Date().toISOString();
  await saveState();
  console.log(`${label}: удалено из Threads`);
}

async function removeTelegram(record, label) {
  if (!record?.id || record.deletedAt) return;
  const ids = Array.isArray(record.ids) && record.ids.length ? record.ids : [record.id];
  for (const id of ids) await deleteTelegramPost(id, { config });
  record.deletedAt = new Date().toISOString();
  await saveState();
  console.log(`${label}: удалено из Telegram (${ids.length} сообщений)`);
}

for (const [id, post] of Object.entries(state.visual || {})) {
  await removeThreads(post.networks?.threads, id);
  await removeTelegram(post.networks?.telegram, id);
}
for (const [id, post] of Object.entries(state.threadsFile || {})) {
  await removeThreads(post, id);
}

console.log("Тестовые публикации Threads и Telegram удалены. Instagram не затронут.");
