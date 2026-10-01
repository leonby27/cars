import path from "node:path";

// RU notifications belong to the owner, not an automatically selected partner.
// Explicit RU credentials prevent using BY's remembered chat by accident.
export function leadDeliveryConfig(site, env, root) {
  if (site.id === "abcars") return { root };
  if (site.id !== "abdrive") throw new Error("Unknown lead notification site");
  const token = String(env.ABDRIVE_TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(env.ABDRIVE_TELEGRAM_CHAT_ID || "").trim();
  if (!token || !/^-?\d+$/.test(chatId)) {
    throw new Error("ABDrive owner Telegram token and chat ID must be configured explicitly");
  }
  return { root: path.join(root, "runtime", "sites", site.id), token, chatId };
}
