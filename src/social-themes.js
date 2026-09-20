import { estimateLandedCost } from "./pricing.js";

// Темы записей для соцсетей — те самые блоки, что описаны в SOCIAL_PLAN.md.
//
// Здесь они нужны кабинету: в разделе «Посты соц сетей» по каждой теме показывается
// картинка так, как её увидят в ленте. Это витрина стиля — на ней отрабатывается
// оформление, которое потом наложит автопостинг, поэтому машина берётся простым
// запросом к каталогу, а не настоящим правилом отбора (правила живут в плане и в
// scripts/lib/social-card.mjs).
//
// У тем разные картинки, и витрина обязана это показывать: у сравнения двух моделей
// обложка из двух кадров со значком «vs» (её собирает scripts/blog-duel-cover.py),
// у материала журнала — собственная картинка статьи. Вид картинки задаёт `kind`.
export const KINDS = { car:"car", duel:"duel", cover:"cover" };

// Где на кадре стоит заголовок. Четыре места — левый край и середина, у верхней и
// нижней границы, — внутри безопасной области, которую задаёт вёрстка витрины
// (src/analytics.css): одинаковый отступ от края со всех сторон. Место закреплено
// за темой: тема должна узнаваться в ленте по одному взгляду, поэтому её заголовок
// всегда на одном и том же месте.
//
// Стиль надписи один на все темы (первое слово фирменным красным, остальное белым,
// без плашки — решение Сергея 17.09.2026), поэтому узнаваемость темы держится
// только на месте да на самом тексте. Место у правого края убрано в тот же день:
// коробка там прижималась к углу, но сама сжималась по ширине текста и на глаз
// воспринималась как «где-то в середине», а не как правый край, — путала, а не
// помогала. Осталось четыре места, по два на тему каждое.
export const PLACES = Object.freeze([
  "top-left", "top-center",
  "bottom-left", "bottom-center",
]);

// Кадры у источника идут в неизменном порядке: сначала кузов снаружи, потом салон.
// Сколько именно снимков снаружи — у каждого объявления своё: у одного семь, у
// другого всего два. Точное число присылает сам источник, и с 17.09.2026 мы его
// сохраняем (поле exteriorPhotos, считает scripts/lib/che168-parser.mjs).
//
// У машин, заведённых раньше этого дня, числа нет: оно появится, когда карточку
// перезаведут. До тех пор берём только те кадры, которые снаружи у всех, — первый
// (обложка объявления) и второй. Ракурс темы можно задавать любой: если у машины
// столько кадров снаружи нет, он сам опустится до последнего подходящего.
export const EXTERIOR_FRAMES = 2;

// У каждой темы три «захода»: одна и та же тема с разными машинами и с разных
// ракурсов. В ленте тема возвращается снова и снова, и смотреть её надо так же —
// на одной плитке не видно, во что это складывается стеной.
//
// Модели взяты из костяка плана и все разные: на однотипных кадрах оформление не
// проверишь. Проверено 17.09.2026 — машины есть по каждой строке.
// У тем с постоянной надписью формулировка не одна. Тема в ленте возвращается
// круг за кругом, и одна и та же фраза на каждом круге превращает ленту в бланк:
// читатель перестаёт её замечать, а поисковые выжимки и пересказы повторяются.
// Вариантов столько же, сколько кругов, выбирает их номер круга — тема узнаётся
// по месту надписи и смыслу, а сами слова каждый раз новые.
//
// Варианты держим короткими: длинная фраза уезжает на мелкий кегль и на три
// строки, а из центра её вдобавок выносит к левому краю (resolvePlace).
export const SOCIAL_THEMES = [
  { id:"core", kind:KINDS.car, title:"Машина из костяка", note:"Самая низкая цена по модели", place:"top-left", picks:[
    { angle:0, query:{ brand:"Zeekr", model:"001", sort:"price" } },
    { angle:1, query:{ brand:"BYD", model:"Qin L", sort:"price" } },
    { angle:2, query:{ brand:"BMW", model:"iX3", sort:"price" } },
  ] },
  { id:"optimal", kind:KINDS.car, title:"Оптимальная по параметрам", note:"Не старьё и не переплата", place:"top-center", headlines:[
    "Золотая середина",
    "Топ за свои деньги",
    "Оптимальное сочетание цены и состояния",
  ], picks:[
    { angle:3, query:{ brand:"Geely", model:"EX5", sort:"price" } },
    { angle:0, query:{ brand:"Deepal", model:"S07", sort:"price" } },
    { angle:1, query:{ brand:"Mercedes-Benz", model:"EQB", sort:"price" } },
  ] },
  { id:"price_question", kind:KINDS.car, title:"Как вам цена?", note:"Вопрос читателю — ради комментариев", place:"top-left", headlines:[
    "Как вам цена?",
    "Брать или искать дальше?",
    "Дорого или нормально?",
  ], picks:[
    { angle:1, query:{ brand:"BYD", model:"Seagull", sort:"price" } },
    { angle:2, query:{ brand:"Geely", model:"EX2", sort:"price" } },
    { angle:3, query:{ brand:"Zeekr", model:"7X", sort:"price" } },
  ] },
  { id:"price_drops", kind:KINDS.car, title:"Топ-5 упавших цен", note:"Раз в неделю, после обновления каталога", place:"bottom-left", headlines:[
    "Упали в цене",
    "Подешевели за неделю",
    "Цены пошли вниз",
  ], picks:[
    { angle:2, query:{ brand:"BMW", model:"i3", sort:"price" } },
    { angle:3, query:{ brand:"BYD", model:"Yuan UP", sort:"price" } },
    { angle:0, query:{ brand:"Deepal", model:"SL03", sort:"price" } },
  ] },
  { id:"fresh", kind:KINDS.car, title:"Новинки каталога", note:"Что появилось в последнем обновлении", place:"bottom-center", headlines:[
    "Новое в каталоге",
    "Свежее пополнение",
    "Новинки недели",
  ], picks:[
    { angle:3, query:{ brand:"Xiaomi", model:"SU7", sort:"newest" } },
    { angle:0, query:{ brand:"Zeekr", model:"007GT", sort:"newest" } },
    { angle:1, query:{ brand:"Geely", model:"Galaxy Starship 7", sort:"newest" } },
  ] },
  // Потолок цены у каждого захода свой, поэтому надпись стоит у самого захода, а не
  // в общем списке темы: варианты различаются и словами, и суммой.
  { id:"budget", kind:KINDS.car, title:"Подборка по бюджету", note:"Пять машин под заданный потолок", place:"bottom-center", picks:[
    { angle:0, headline:"Пять машин до 25 000$", query:{ brand:"Deepal", model:"L07", sort:"price" } },
    { angle:1, headline:"Что есть до 15 000$", query:{ brand:"BYD", model:"Yuan Pro", sort:"price" } },
    { angle:2, headline:"Уложиться в 35 000$", query:{ brand:"Geely", model:"Okavango", sort:"price" } },
  ] },
  { id:"duel", kind:KINDS.duel, title:"Сравнение двух моделей", note:"Две стороны и значок «vs» между ними", place:"top-center", picks:[
    { sides:[{ angle:0, query:{ brand:"Xiaomi", model:"YU7", sort:"price" } }, { angle:0, query:{ brand:"Mercedes-Benz", model:"EQE", sort:"price" } }] },
    { sides:[{ angle:1, query:{ brand:"BMW", model:"i5", sort:"price" } }, { angle:1, query:{ brand:"BYD", model:"Han L", sort:"price" } }] },
    { sides:[{ angle:0, query:{ brand:"Deepal", model:"S05", sort:"price" } }, { angle:2, query:{ brand:"Geely", model:"Monjaro", sort:"price" } }] },
  ] },
  { id:"blog", kind:KINDS.cover, title:"Материал журнала", note:"Своя картинка статьи, а не кадр машины", place:"bottom-left", picks:[
    { cover:"/blog/which-china-suv-card.jpg", headline:"Какой китайский кроссовер выбрать" },
    { cover:"/blog/ev-winter-belarus-card.jpg", headline:"Электромобиль зимой в Беларуси" },
    { cover:"/blog/charging-belarus-card.jpg", headline:"Где заряжаться в Беларуси" },
  ] },
];

// Сравнение двух моделей тоже не повторяется дословно: вопрос «или» чередуется с
// коротким противопоставлением. Названия моделей подставляются на месте.
export const DUEL_HEADLINES = [
  (left, right) => `${left} или ${right}?`,
  (left, right) => `${left} против ${right}`,
];

/** Вариант из списка по номеру круга — список идёт по кругу вместе с лентой. */
export const headlineVariant = (list, round = 0) => list[((round % list.length) + list.length) % list.length];

// Сколько раз каждая тема повторяется в витрине.
export const THEME_ROUNDS = 3;

/**
 * Плитки витрины по порядку. Заходы идут не подряд, а вперемежку — сначала все темы
 * по разу, потом по второму: так это и выглядит в ленте, где темы чередуются.
 */
export function socialTiles(themes = SOCIAL_THEMES, rounds = THEME_ROUNDS) {
  const tiles = [];
  for (let round = 0; round < rounds; round += 1) {
    for (const theme of themes) {
      const pick = theme.picks[round % theme.picks.length];
      tiles.push({ key:`${theme.id}-${round}`, theme, pick, round });
    }
  }
  return tiles;
}

// Первая строка будущей записи. На картинке стоит именно она, а не название темы:
// витрина должна показывать то, что увидит читатель ленты. Значки из текста сюда не
// переносятся — на кадре они выглядят мусором (решение Сергея 17.09.2026).
//
// Где строка зависит от машины, она собирается на месте: у записи об одной машине
// это сама машина с ценой под ключ, у сравнения — вопрос из двух моделей. Там, где
// текст постоянный, он лежит рядом с темой или с заходом.
const modelName = (car) => [car?.brand, car?.model].filter(Boolean).join(" ");

// Перенос строки не должен разрывать то, что читается одним куском: цену с валютой
// («15 000 $»), число с единицей и короткий предлог, который иначе повисает в конце
// строки. Склеиваем их неразрывным пробелом — на узкой плитке это видно сразу.
const NBSP = "\u00a0";
const SHORT_WORDS = /(?<![\p{L}\p{N}_-])([А-Яа-яЁёA-Za-z]{1,2}|без|вне|для|из-за|из-под|над|около|перед|по(?:сле|среди)|под|при|про|ради|среди|через|между|возле|вокруг|кроме|против|или|либо)\s+(?=\S)/giu;
// Хвост строки в одну-три буквы (часто конец названия модели: «Han L?», «Zeekr
// 7X?») не должен переноситься один-одинёшенек на свою строку — приклеиваем его
// к предыдущему слову тем же неразрывным пробелом.
const TRAILING_SHORT = / (?=[А-Яа-яЁёA-Za-z0-9]{1,3}[?!.,:;]*$)/;
export function typeset(text) {
  let value = String(text || "")
    // Разряды числа и знак валюты: «15 000 $», «35 100$», «2 500 км».
    .replace(/(\d)[\s\u00a0](?=\d)/g, `$1${NBSP}`)
    .replace(/(\d)\s+(?=[$€₽]|BYN|км|кВт)/g, `$1${NBSP}`);
  // Предлоги и короткие служебные слова тянут за собой следующее слово. Повторяем
  // проход, чтобы обработать цепочки вроде «и в каталоге»: первая замена не должна
  // мешать второй увидеть следующий предлог.
  let previous;
  do {
    previous = value;
    value = value.replace(SHORT_WORDS, `$1${NBSP}`);
  } while (value !== previous);
  return value.replace(TRAILING_SHORT, NBSP);
}
const priceUsd = (car) => {
  const total = estimateLandedCost(car)?.totalUsd;
  return Number(total) > 0 ? `${new Intl.NumberFormat("ru-RU").format(Math.round(total))}$` : "";
};

// Длинная надпись тем же кеглем расползается на полкадра, поэтому размеров три, и
// выбирает их длина строки. Границы подобраны по нашим формулировкам: «Подешевели
// за неделю» — крупно, «Zeekr 001, 2022 21 400 $ под ключ» — средне,
// «Оптимальное сочетание цены и состояния» — мелко.
export const HEADLINE_SIZES = Object.freeze(["large", "medium", "small"]);

// typeset() склеивает цену, единицу и короткий предлог неразрывным пробелом — они
// не переносятся никогда. Из-за этого общая длина строки не единственное, что
// решает кегль: длинный неразрывный кусок («или нормально?») при крупном шрифте
// не помещается в свою строку и лезет за край кадра, даже если вся надпись короткая.
// Оцениваем этот кусок по самому узкому месту, где вообще стоит надпись, — по
// левому краю (74% ширины плитки, analytics.css): если тема окажется в центре
// (94%), запас останется, а не наоборот. Числа — сколько знаков влезает в эту
// ширину на каждом кегле (11 / 8.8 / 7.2 cqw), с запасом на то, что кириллица в
// жирном начертании шире Латиницы.
const CENTER_CHARS_PER_LINE = { large:10, medium:13, small:16 };
const longestChunk = (text) => Math.max(0, ...String(text).split(" ").map((part) => part.length));

export function headlineSize(text) {
  const value = String(text || "");
  const length = value.length;
  const chunk = longestChunk(value);
  if (length <= 22 && chunk <= CENTER_CHARS_PER_LINE.large) return "large";
  if (length <= 36 && chunk <= CENTER_CHARS_PER_LINE.medium) return "medium";
  return "small";
}

// Центрированный текст в три строки и больше читается рвано с обеих сторон, а не
// только с одной, как у левого края, — центр в таком случае запрещён совсем, только
// левое место (решение Сергея 17.09.2026). Строки оцениваются по той же ширине
// области (94% — место по центру шире, чем у края), что и в analytics.css.
const AREA_CHARS_PER_LINE = { large:14, medium:17, small:21 };

export function resolvePlace(place, text) {
  if (!place.endsWith("center")) return place;
  const perLine = AREA_CHARS_PER_LINE[headlineSize(text)];
  const lines = Math.ceil(String(text || "").length / perLine);
  return lines >= 3 ? place.replace("center", "left") : place;
}

export function tileHeadline(theme, pick, loaded, round = 0) {
  if (theme.kind === KINDS.duel) {
    const [left, right] = Array.isArray(loaded) ? loaded : [];
    return left && right ? typeset(headlineVariant(DUEL_HEADLINES, round)(modelName(left), modelName(right))) : "";
  }
  const fixed = pick.headline || (theme.headlines ? headlineVariant(theme.headlines, round) : "");
  if (fixed) return typeset(fixed);
  if (!loaded) return "";
  // Та же первая строка, что уходит в запись: машина, год и цена под ключ.
  // Между годом и ценой нет тире: при автоматическом переносе оно оказывалось
  // первым знаком новой строки и выглядело как случайный дефис.
  const price = priceUsd(loaded);
  const car = typeset(`${modelName(loaded)}, ${loaded.year}`);
  return price ? `${car} ${typeset(`${price} под ключ`)}` : car;
}

/** Адрес каталога, которым кабинет достаёт кадр для темы. */
export const socialThemeQuery = (query) =>
  `/api/cars?${new URLSearchParams({ ...query, limit:"1" })}`;

/** Сколько первых кадров машины показывают кузов снаружи, а не салон. */
export function exteriorFrames(car) {
  const images = carImages(car);
  const known = Number(car?.exteriorPhotos);
  return Math.min(known > 0 ? known : EXTERIOR_FRAMES, images.length);
}

const carImages = (car) => (Array.isArray(car?.images) && car.images.length ? car.images : [car?.image].filter(Boolean));

/**
 * Кадр машины под заданный ракурс. Дальше кузова не заходим никогда, а если
 * подходящих кадров меньше, чем просят, берём последний из них: повторяющийся
 * ракурс лучше и пустой плитки, и руля вместо машины.
 */
export function carFrame(car, angle = 0) {
  const images = carImages(car);
  if (!images.length) return "";
  return images[Math.max(0, Math.min(angle, exteriorFrames(car) - 1))];
}
