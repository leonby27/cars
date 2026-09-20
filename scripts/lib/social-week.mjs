// Общие, не зависящие от базы правила недельного пакета соцсетей.
//
// Codex готовит пакет на ноутбуке, а сервер публикует его позже. Поэтому даты,
// имена файлов и проверка обязательной обложки должны считаться одинаково в обоих
// местах и не зависеть от часового пояса сервера.

export const SOCIAL_TIMEZONE = "Europe/Minsk";
export const VISUAL_TIMES = Object.freeze(["13:00", "13:00", "13:00", "13:00", "13:00"]);
export const COVER_PLACES = Object.freeze([
  "top-left",
  "top-center",
  "bottom-left",
  "bottom-center",
]);
export const THREADS_FILE_SLOTS = Object.freeze([
  { dayOffset:1, time:"18:30" },
  { dayOffset:5, time:"12:00" },
]);

const pad = (value) => String(value).padStart(2, "0");
export const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function mondayOf(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return value;
}

// Воскресная проверка уже готовит следующую неделю: иначе она создала бы пакет,
// все будние слоты которого давно прошли. С понедельника по субботу догоняем
// текущую неделю, если компьютер не работал в понедельник.
export function preparationMonday(date = new Date()) {
  const value = new Date(date);
  if (value.getDay() === 0) value.setDate(value.getDate() + 1);
  return mondayOf(value);
}

export function weekKey(date = new Date()) {
  return dateKey(mondayOf(date));
}

export function minskIso(monday, dayOffset, time) {
  const day = new Date(monday);
  day.setDate(day.getDate() + dayOffset);
  return `${dateKey(day)}T${time}:00+03:00`;
}

// Любые четыре соседних назначения дают точную долю 50/25/25. Пятая карточка
// начинает следующий цикл; на длинной дистанции пропорция остаётся той же.
export function promptNumbers(week, count = 5) {
  const pool = [1, 1, 2, 3];
  const seed = [...String(week)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % pool.length;
  return Array.from({ length:count }, (_, index) => pool[(seed + index) % pool.length]);
}

const stableNumber = (value) => [...String(value)].reduce(
  (result, char) => Math.imul(result ^ char.charCodeAt(0), 16_777_619) >>> 0,
  2_166_136_261,
);

const shuffledPlaces = (seed) => {
  const places = [...COVER_PLACES];
  let state = stableNumber(seed) || 1;
  for (let index = places.length - 1; index > 0; index -= 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const target = (state >>> 0) % (index + 1);
    [places[index], places[target]] = [places[target], places[index]];
  }
  return places;
};

// Позиция задаётся в исходнике до генерации. Внутри каждого полного цикла все
// четыре зоны используются по одному разу; неделя служит стабильным seed, поэтому
// повторный запуск не меняет уже подготовленную композицию.
export function coverPlaces(week, count = 5) {
  const result = [];
  for (let cycle = 0; result.length < count; cycle += 1) {
    const next = shuffledPlaces(`${week}:${cycle}`);
    if (result.length && next[0] === result.at(-1)) next.push(next.shift());
    result.push(...next);
  }
  return result.slice(0, count);
}

export function coverHeadlineSize(headline) {
  const length = String(headline || "").length;
  if (length <= 22) return "large";
  if (length <= 36) return "medium";
  return "small";
}

export function parseThreadsFile(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\.\s+(.+)$/);
      return match ? { line:Number(match[1]), text:match[2].trim() } : null;
    })
    .filter(Boolean);
}

export function nextThreadPosts(entries, lastLine = 0, count = 2) {
  if (!entries.length) return [];
  const start = Math.max(0, entries.findIndex((entry) => entry.line > Number(lastLine || 0)));
  return Array.from({ length:Math.min(count, entries.length) }, (_, index) => entries[(start + index) % entries.length]);
}

export const weeklyManifestUrl = (week, {
  repository = process.env.GITHUB_MEDIA_REPO || "leonby27/cars",
  tag = process.env.GITHUB_WEEKLY_TAG || "social-weekly",
} = {}) => `https://github.com/${repository}/releases/download/${tag}/abcars-week-${week}.json`;

export function hasRequiredVisual(post) {
  return post?.kind === "visual"
    && typeof post?.cover?.url === "string"
    && /^https:\/\//.test(post.cover.url)
    && typeof post?.cover?.asset === "string"
    && /\.jpe?g$/i.test(post.cover.asset);
}

// Снимки, из которых собрана AI-обложка. Их не повторяем сразу следом в сыром
// виде: обложка уже является первым кадром карусели.
export function coverSourcePhotos(draft) {
  if (draft?.coverPhoto) return [draft.coverPhoto];
  const photos = Array.isArray(draft?.photos) ? draft.photos : [];
  if (draft?.block === "duel") {
    const half = Math.max(1, Math.floor(photos.length / 2));
    return [photos[0], photos[half]].filter(Boolean);
  }
  return [photos[0]].filter(Boolean);
}

export function galleryPhotosAfterCover(draft) {
  const usedOnCover = new Set(coverSourcePhotos(draft));
  return (draft?.photos || []).filter((photo) => !usedOnCover.has(photo));
}

// Общий порядок именно для Threads: текстовые записи вставляются между
// визуальными по времени, а не публикуются отдельной пачкой после них.
export function threadsTimeline(manifest) {
  const order = (kind) => kind === "visual" ? 0 : 1;
  return [
    ...(manifest?.posts || []).map((post) => ({ kind:"visual", post })),
    ...(manifest?.threadPosts || []).map((post) => ({ kind:"threads-file", post })),
  ].sort((left, right) =>
    Date.parse(left.post.publishAt) - Date.parse(right.post.publishAt)
      || order(left.kind) - order(right.kind)
      || String(left.post.id).localeCompare(String(right.post.id)));
}

// Назначает каждой записи недели свой автомобиль на обложке. В подборках можно
// взять не первую машину списка; сам текст и порядок галереи при этом не меняются.
// Одиночная запись и дуэль не имеют запасного кандидата — при совпадении лучше
// остановить сборку, чем молча выпустить две одинаковые обложки.
export function assignUniqueWeeklyCovers(items) {
  const used = new Set();
  return items.map((item) => {
    const draft = item.draft;
    const cars = draft?.cars || [];
    if (!cars.length) throw new Error(`У рубрики ${draft?.block || "unknown"} нет машины для обложки`);

    if (draft.block === "duel") {
      const ids = cars.map((car) => String(car.externalId));
      if (ids.some((id) => used.has(id))) throw new Error(`Для рубрики ${draft.block} повторяется машина на обложке`);
      ids.forEach((id) => used.add(id));
      return { ...item, draft:{ ...draft, coverCarIds:ids } };
    }

    const index = cars.findIndex((car) => !used.has(String(car.externalId)));
    if (index < 0) throw new Error(`Для рубрики ${draft.block} не нашлось уникальной машины на обложку`);
    const id = String(cars[index].externalId);
    const coverPhoto = cars.length === 1 ? draft.photos?.[0] : draft.photos?.[index];
    if (!coverPhoto) throw new Error(`У машины ${id} нет фотографии для обложки`);
    used.add(id);
    return { ...item, draft:{ ...draft, coverCarIds:[id], coverPhoto } };
  });
}
