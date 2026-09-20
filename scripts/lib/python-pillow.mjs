// На сервере Pillow установлен в системном Python, а локальная автоматизация
// Codex получает его в своей общей среде. Выбираем рабочий интерпретатор сами,
// чтобы расписание не зависело от ручного CODEX_PYTHON.
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export function pillowPythonCandidates({ env = process.env, home = os.homedir() } = {}) {
  return [...new Set([
    env.CODEX_PYTHON,
    path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "bin", "python3"),
    "python3",
    "python",
  ].filter(Boolean))];
}

export async function resolvePillowPython({
  candidates = pillowPythonCandidates(),
  probe = async (candidate) => {
    try {
      await run(candidate, ["-c", "import PIL"], { timeout:5_000 });
      return true;
    } catch { return false; }
  },
} = {}) {
  for (const candidate of candidates) {
    if (await probe(candidate)) return candidate;
  }
  throw new Error("Не найден Python с Pillow: проверьте среду Codex или установите пакет Pillow");
}
