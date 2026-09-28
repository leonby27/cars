// Разбор команд телеграм-бота. Отдельно от бота, чтобы проверять тестами:
// сам бот при загрузке сразу начинает слушать телеграм.
import { IMPORT_BRANDS, EXCLUDED_BRANDS, canonicalImportBrand } from "../../config/import-policy.mjs";

const allowedBrands = IMPORT_BRANDS.filter((b) => !EXCLUDED_BRANDS.includes(b));

// Разбираем сообщение. Всё, что не команда, молча пропускаем — бот не болтает.
export function parseCommand(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  // «Круг 1» — Che168, «Круг 2» — Guazi. Просто «круг» по-прежнему значит Che168.
  if (/^(?:круг|весь|всё|все|полный круг)(?:\s*(?:№|n|#)?\s*1)?[.!]?$/.test(t)) return { kind: "circle" };
  if (/^(?:круг|полный круг)\s*(?:№|n|#)?\s*2[.!]?$/.test(t)) return { kind: "guazi" };
  if (/^(?:продолжить|продолжи|доделать|доделай|дальше)\s*(?:№|n|#)?\s*2[.!]?$/.test(t)) return { kind: "guazi-resume" };
  if (/^(?:стоп|стой|хватит)\s*(?:№|n|#)?\s*2[.!]?$/.test(t)) return { kind: "guazi-stop" };
  if (/^(?:статус|как дела|что там)\s*(?:№|n|#)?\s*2[.!]?$/.test(t)) return { kind: "guazi-status" };
  if (/^(продолжить|продолжи|доделать|доделай|дальше)$/.test(t)) return { kind: "resume" };
  if (/^(стоп|стой|хватит)$/.test(t)) return { kind: "stop" };
  if (/^(статус|как дела|что там)$/.test(t)) return { kind: "status" };
  if (/^(помощь|команды|\/start|\/help)$/.test(t)) return { kind: "help" };
  const m = t.match(/^(?:марк[аи]|бренд[ы]?)\s+(.+)$/);
  if (m) {
    const asked = m[1].split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
    const found = [];
    const missing = [];
    for (const name of asked) {
      const hit = allowedBrands.find((b) => b.toLowerCase() === canonicalImportBrand(name).toLowerCase() || b.toLowerCase() === name);
      if (hit) found.push(hit);
      else missing.push(name);
    }
    return { kind: "brands", found, missing };
  }
  return null;
}
