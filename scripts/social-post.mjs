// Публикация одной машины в Threads, Instagram и телеграм-канал.
//
// Запуск:
//   npm run social:post -- 59876786            все три сети
//   npm run social:post -- 59876786 --dry      только показать текст, ничего не публикуя
//   npm run social:post -- 59876786 --threads  только Threads (или --instagram, --telegram)
//   npm run social:post -- 59876786 --photos=6 сколько кадров брать (по умолчанию 8)
//   npm run social:post -- 59876786 --tg=button вид записи в телеграме: album или button
//   npm run social:post -- 59876786 --no-store  не класть кадры в хранилище GitHub
//   npm run social:post -- 59876786 --square=fit  как обрезать: crop (по умолчанию,
//                                              обрезать по бокам) или fit (кадр целиком и полосы фона)
//   npm run social:post -- 59876786 --shape=vertical форма кадра: square (по умолчанию,
//                                              1080×1080) или vertical (1080×1350, 4:5)
//
// Расписание и правила отбора машин здесь намеренно отсутствуют: пока запись
// выбирает человек. Когда порядок будет решён, поверх этой команды встанет
// отдельный скрипт с расписанием — публиковать он будет этими же функциями.
//
// Данные о машине берутся не из базы напрямую, а через API сайта: тогда цена
// под ключ считается ровно тем же кодом, что показывает карточка, и команда
// одинаково работает и на сервере, и с ноутбука.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { estimateLandedCost, usdToByn } from "../src/pricing.js";
import { buildPostText, carNumber, carPageUrl, pickPhotos } from "./lib/social-card.mjs";
import { publishToInstagram, publishToTelegram, publishToThreads, refreshSocialTokens, remainingQuota } from "./lib/social.mjs";
import { cleanupStalePhotos, mediaStoreReady, stageBuffers, unstagePhotos } from "./lib/social-media-store.mjs";
import { dropFrames, FRAME_SHAPES, prepareFrames } from "./lib/photo-local.mjs";
import { sendTelegram } from "./lib/telegram.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile?.(path.join(ROOT, ".env.local")); } catch {}
try { process.loadEnvFile?.(path.join(ROOT, ".env")); } catch {}

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const found = args.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const carArg = args.find((arg) => !arg.startsWith("--"));
const dryRun = flag("dry");
const photoLimit = Number(option("photos", 8)) || 8;
const site = process.env.SITE_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "abcars.by";
// На сервере сайт отвечает на 8787 — туда и ходим, чтобы не гонять запрос через
// интернет и не зависеть от того, жив ли внешний адрес.
const apiBases = [process.env.SOCIAL_API_BASE, "http://127.0.0.1:8787", `https://${site}`].filter(Boolean);

const chosen = ["threads", "instagram", "telegram"].filter((network) => flag(network));
const networks = chosen.length ? chosen : ["threads", "instagram", "telegram"];
// В телеграме кнопку можно повесить только под одиночным снимком: под альбомом
// кнопок не бывает. Поэтому «album» — галерея со ссылкой в подписи, «button» —
// один кадр и кнопка «Смотреть в каталоге» под ним.
// Все кадры приводятся к одной форме: Instagram подгоняет галерею под первый
// снимок, и разнобой пропорций он режет сам. Обрезка по бокам выбрана
// 17.09.2026 — плотнее и без полос; «fit» вписывает кадр целиком и оставляет
// полосы фона.
const squareMode = option("square", process.env.SOCIAL_SQUARE_MODE || "crop") === "fit" ? "fit" : "crop";
// Квадрат (умолчание) или вертикальный 4:5 — 18.09.2026 добавили второй, чтобы
// сравнивать их в кабинете; какую форму публиковать взаправду, решит Сергей.
const frameShape = FRAME_SHAPES[option("shape", process.env.SOCIAL_FRAME_SHAPE || "square")] ? option("shape", process.env.SOCIAL_FRAME_SHAPE || "square") : "square";
const telegramStyle = option("tg", process.env.TELEGRAM_POST_STYLE || "album") === "button" ? "button" : "album";

if (!carArg) {
  console.error("Не указана машина. Пример: npm run social:post -- 59876786");
  process.exit(1);
}

const carId = carArg.startsWith("che168-") ? carArg : `che168-${carArg}`;

async function loadCar() {
  const failures = [];
  for (const base of apiBases) {
    try {
      const response = await fetch(`${base}/api/cars/${carId}`);
      if (!response.ok) { failures.push(`${base}: ответ ${response.status}`); continue; }
      const payload = await response.json();
      const car = payload?.car || payload?.item || payload;
      if (car?.id) return car;
      failures.push(`${base}: в ответе нет машины`);
    } catch (error) {
      failures.push(`${base}: ${error.message}`);
    }
  }
  throw new Error(`не удалось получить карточку машины — ${failures.join("; ")}`);
}

const car = await loadCar();
if (car.status && !String(car.status).startsWith("Карточка доступна")) {
  console.log(`Внимание: у машины состояние «${car.status}» — возможно, она уже снята с продажи.`);
}

const totalUsd = estimateLandedCost(car).totalUsd;
const sourcePhotos = pickPhotos(car, { limit: photoLimit });
let photos = sourcePhotos;
const texts = Object.fromEntries(networks.map((network) => [
  network,
  buildPostText(car, {
    totalUsd, totalByn: usdToByn(totalUsd), network, site,
    withLink: network !== "telegram" || telegramStyle === "album",
  }),
]));

console.log(`Машина: ${car.title} (№${carNumber(car)}), кадров подобрано: ${sourcePhotos.length}`);
for (const network of networks) {
  console.log(`\n— ${network} —\n${texts[network]}`);
}

if (dryRun) {
  console.log("\nПробный запуск: ничего не опубликовано.");
  process.exit(0);
}

// Кадры готовятся один раз и одинаковыми — квадрат для всех сетей. Дальше
// каждая сеть получает их так, как умеет: телеграм файлами, Threads и Instagram по
// ссылке из хранилища GitHub (в Китай они ходить умеют, но незачем: кадр может быть
// уже с нашим оформлением, а зависимость от чужой доступности лишняя).
const framesDir = path.join(ROOT, "runtime", "social-frames", carNumber(car));
const frames = await prepareFrames(sourcePhotos, { dir: framesDir, prefix: carNumber(car), mode: squareMode, shape: frameShape, log: console.log });
const [frameW, frameH] = FRAME_SHAPES[frameShape];
console.log(`кадров подготовлено: ${frames.length} (${frameW}×${frameH}, режим ${squareMode})`);

let staged = [];
if (frames.length && !flag("no-store") && await mediaStoreReady()) {
  const { readFile } = await import("node:fs/promises");
  const items = await Promise.all(frames.map(async (file) => ({ name: path.basename(file), data: await readFile(file) })));
  const result = await stageBuffers(items, { carNumber: carNumber(car), log: console.log });
  if (result.links.length) {
    photos = result.links;
    staged = result.assets;
    console.log(`кадров в хранилище: ${result.links.length}`);
  } else {
    console.log("хранилище не приняло ни одного кадра — беру адреса источника");
  }
} else if (!flag("no-store")) {
  console.log("ключа к хранилищу нет — беру адреса источника");
}

const config = await refreshSocialTokens({ log: console.log });
const quota = await remainingQuota(config);
console.log(`\nОсталось публикаций сегодня: Threads ${quota.threads ?? "?"}, Instagram ${quota.instagram ?? "?"} (у телеграма лимита нет)`);

const names = { threads: "Threads", instagram: "Instagram", telegram: "Телеграм" };
const results = [];
for (const network of networks) {
  try {
    const published = network === "threads"
      ? await publishToThreads({ text: texts.threads, photos, config, log: console.log })
      : network === "instagram"
        ? await publishToInstagram({ caption: texts.instagram, photos, config, log: console.log })
        : await publishToTelegram({
            text: texts.telegram,
            // Телеграму — файлы: по ссылке он не берёт ни наши кадры, ни одиночный
            // снимок источника. Если подготовить кадры не вышло, остаются адреса.
            files: telegramStyle === "button" ? frames.slice(0, 1) : frames,
            photos: frames.length ? [] : (telegramStyle === "button" ? sourcePhotos.slice(0, 1) : sourcePhotos),
            buttonUrl: telegramStyle === "button" ? carPageUrl(car, site) : "",
            config, log: console.log,
          });
    console.log(`${network}: опубликовано ${published.url || published.id}`);
    results.push(`${names[network]}: ${published.url || published.id}`);
  } catch (error) {
    console.error(`${network}: не опубликовано — ${error.message}`);
    results.push(`${names[network]}: не вышло — ${error.message}`);
  }
}

if (staged.length) {
  await unstagePhotos(staged, { log: console.log });
  console.log("кадры из хранилища убраны");
}
await dropFrames(frames);
// Заодно подчистим то, что осталось от прогонов, оборвавшихся раньше.
await cleanupStalePhotos({ log: console.log }).catch(() => {});

await sendTelegram([`Запись о машине ${car.title} (№${carNumber(car)})`, ...results].join("\n"), { root: ROOT, log: console.log }).catch(() => {});
