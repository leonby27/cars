import crypto from "node:crypto";

// Паспорт, личный номер, кем выдан и адрес прописки — самые чувствительные данные,
// которые собирает сайт: они нужны только для договора, а до появления внутренней CRM
// просто лежат в базе. Поэтому в базу они уходят зашифрованными: доступ к дампу базы
// сам по себе больше не открывает паспортные данные, для этого нужен ещё и ключ,
// который живёт в переменных окружения и в базу не попадает.
//
// Формат записи: `enc:v1:<случайная соль>:<метка целостности>:<шифртекст>`. Значение без
// этой приставки возвращается как есть — так продолжают читаться записи, сделанные до
// включения шифрования, и включение не требует переноса данных.
const PREFIX = "enc:v1:";
const encoded = (value) => Buffer.from(value).toString("base64url");

let warned = false;
function key() {
  const raw = String(process.env.PERSONAL_DATA_KEY || "").trim();
  if (!raw) {
    // Без ключа данные сохраняются как раньше, открытым текстом: молчаливый отказ
    // записывать профиль был бы хуже утечки-в-теории. Предупреждаем один раз.
    if (!warned) {
      warned = true;
      console.warn("PERSONAL_DATA_KEY не задан: паспортные данные сохраняются без шифрования.");
    }
    return null;
  }
  const bytes = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error("PERSONAL_DATA_KEY должен быть 32 байта: 64 шестнадцатеричных знака или base64.");
  return bytes;
}

export function encryptPersonalField(value) {
  const text = String(value ?? "");
  // Пустое поле не шифруем: запрос профиля превращает пустую строку в NULL, а шифртекст
  // пустой строки был бы непустым — и в базе вместо «поле не заполнено» осталась бы запись.
  if (!text) return "";
  const secret = key();
  if (!secret) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secret, iv);
  const payload = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${PREFIX}${encoded(iv)}:${encoded(cipher.getAuthTag())}:${encoded(payload)}`;
}

export function decryptPersonalField(value) {
  const text = value == null ? "" : String(value);
  if (!text.startsWith(PREFIX)) return text;
  const [iv, tag, payload] = text.slice(PREFIX.length).split(":");
  const secret = key();
  // Ключ потеряли или подменили — показываем пустое поле вместо падения страницы
  // профиля: остальные данные аккаунта должны оставаться доступными владельцу.
  if (!secret || !iv || !tag || !payload) return "";
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", secret, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
