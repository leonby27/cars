// Присмотр за локальным API. `node --watch` умеет только одно: перезапустить сервер
// после правки файла. Если сервер завершился сам — необработанная ошибка в запросе,
// сон ноутбука, гонка при перезапуске, — watch молча ждёт следующего сохранения, и
// локальный API пропадает на часы: каталог живёт на запасной выгрузке, а аналитика и
// личный кабинет отвечают «недоступно». На сервере такого не бывает, там systemd
// поднимает упавший процесс через две секунды (Restart=always). Здесь то же самое:
// перезапуск после правок плюс главное — упавший сервер всегда поднимается заново.
import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "server", "index.mjs");

let child = null;
let planned = false; // перезапуск затеяли мы: выход процесса ожидаем, это не авария
let stopping = false;
let startedAt = 0;
let crashes = 0;
let debounce = null;

const start = () => {
  startedAt = Date.now();
  child = spawn(process.execPath, [entry], { cwd: root, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    child = null;
    if (stopping) { process.exit(0); return; }
    if (planned) { planned = false; start(); return; }
    // Считаем аварией только быструю смерть подряд: иначе после долгой нормальной
    // работы пауза росла бы на ровном месте.
    crashes = Date.now() - startedAt < 2000 ? crashes + 1 : 0;
    const delay = Math.min(500 * 2 ** crashes, 5000);
    console.error(`[api] сервер остановился (${signal || `код ${code}`}) — поднимаю заново через ${delay} мс`);
    setTimeout(start, delay);
  });
};

const restart = () => {
  if (stopping || !child) return; // без ребёнка перезапуск уже идёт сам
  planned = true;
  const dying = child;
  dying.kill("SIGTERM");
  // Сервер рвёт keep-alive и выходит сам, но если он завис — не оставляем порт занятым.
  setTimeout(() => { if (dying === child) dying.kill("SIGKILL"); }, 4000).unref();
};

// Правки прилетают пачками (сохранение редактора, несколько файлов сразу), поэтому
// собираем их в одну паузу и перезапускаем один раз.
const schedule = () => {
  clearTimeout(debounce);
  debounce = setTimeout(restart, 400);
};

// Сам API лежит в server/ и config/. Из src/ он берёт только общие модули (.js):
// цены, названия моделей, тексты обзоров. Каталог src/ слушаем без вложенности и
// целиком, а не по отдельным файлам: редактор часто сохраняет файл заменой, и слежка
// за конкретным файлом после первой же правки перестала бы работать.
const watchDir = (dir, recursive, accept) => {
  if (!existsSync(dir)) return;
  try {
    watch(dir, { recursive }, (_event, name) => { if (!name || accept(name)) schedule(); });
  } catch (error) {
    console.error(`[api] не слежу за ${path.relative(root, dir)}: ${error.message}`);
  }
};

watchDir(path.join(root, "server"), true, (name) => name.endsWith(".mjs") && !name.endsWith("dev.mjs"));
watchDir(path.join(root, "config"), true, (name) => name.endsWith(".mjs"));
watchDir(path.join(root, "src"), false, (name) => name.endsWith(".js"));

const stop = () => {
  if (stopping) return;
  stopping = true;
  if (!child) process.exit(0);
  child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 4000).unref();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

start();
