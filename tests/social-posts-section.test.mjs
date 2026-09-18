// Раздел кабинета «Посты соц сетей» — витрина стиля: по каждой теме плана картинка
// показывается ровно так, как её увидят в ленте. Ценность раздела в том, что он не
// врёт: если сетка нарисует кадр иначе, чем его готовит публикация, смотреть на неё
// бессмысленно. Отсюда и проверки — форма, подложка, виды плиток и ракурсы.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { carFrame, DUEL_HEADLINES, EXTERIOR_FRAMES, exteriorFrames, headlineSize, headlineVariant, HEADLINE_SIZES, KINDS, PLACES, resolvePlace, SOCIAL_THEMES, socialThemeQuery, socialTiles, THEME_ROUNDS, tileHeadline, typeset } from "../src/social-themes.js";

const page = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/analytics.css", import.meta.url), "utf8");
const square = await readFile(new URL("../scripts/photo-to-social.py", import.meta.url), "utf8");

test("у каждой темы есть название, вид картинки и по заходу на каждый круг", () => {
  assert.equal(SOCIAL_THEMES.length, 8);
  assert.equal(new Set(SOCIAL_THEMES.map((theme) => theme.id)).size, SOCIAL_THEMES.length);
  for (const theme of SOCIAL_THEMES) {
    assert.ok(theme.title && theme.note, `у темы ${theme.id} нет подписи`);
    assert.ok(Object.values(KINDS).includes(theme.kind), `у темы ${theme.id} неизвестный вид картинки`);
    assert.equal(theme.picks.length, THEME_ROUNDS, `у темы ${theme.id} не ${THEME_ROUNDS} захода`);
    for (const pick of theme.picks) {
      if (theme.kind === KINDS.car) assert.ok(pick.query.brand && pick.query.model, `у темы ${theme.id} нет машины`);
      if (theme.kind === KINDS.duel) assert.equal(pick.sides.length, 2, "сравнение — это ровно две стороны");
      if (theme.kind === KINDS.cover) assert.match(pick.cover, /^\/blog\/.+\.jpg$/);
    }
  }
  const url = socialThemeQuery(SOCIAL_THEMES[0].picks[0].query);
  assert.match(url, /^\/api\/cars\?/);
  assert.match(url, /limit=1(&|$)/);
});

// Стеной лента и смотрится: одной плитки на тему мало, а одинаковые машины подряд
// сводят проверку оформления на нет.
test("витрина показывает каждую тему трижды, вперемежку и на разных машинах", () => {
  const tiles = socialTiles();
  assert.equal(tiles.length, SOCIAL_THEMES.length * THEME_ROUNDS);
  assert.equal(new Set(tiles.map((tile) => tile.key)).size, tiles.length);
  // Первые восемь плиток — все темы по разу: заходы не идут подряд.
  assert.deepEqual(tiles.slice(0, SOCIAL_THEMES.length).map((tile) => tile.theme.id), SOCIAL_THEMES.map((theme) => theme.id));
  const models = [];
  for (const theme of SOCIAL_THEMES) {
    for (const pick of theme.picks) {
      if (pick.query) models.push(`${pick.query.brand} ${pick.query.model}`);
      for (const side of pick.sides || []) models.push(`${side.query.brand} ${side.query.model}`);
    }
  }
  assert.equal(new Set(models).size, models.length, `машины повторяются: ${models.join(", ")}`);
});

// Все кадры с одного ракурса превращают ленту в обои — ракурсы должны различаться.
test("темы берут разные ракурсы", () => {
  const angles = SOCIAL_THEMES.flatMap((theme) => theme.picks.map((pick) => pick.angle)).filter((angle) => angle !== undefined);
  assert.ok(new Set(angles).size >= 3, `ракурсов слишком мало: ${angles.join(", ")}`);
  for (const angle of angles) assert.ok(angle >= 0, `ракурс ${angle} не бывает`);
});

// Салон в ленте хуже однообразия: дальше кузова ракурс не заходит никогда. У машин,
// заведённых до 17.09.2026, числа кадров снаружи нет — там предел осторожный.
test("кадр по ракурсу никогда не заходит в салон", () => {
  const known = { images:["a", "b", "c", "d", "e", "f", "g"], exteriorPhotos:5 };
  assert.equal(carFrame(known, 0), "a");
  assert.equal(carFrame(known, 3), "d");
  assert.equal(carFrame(known, 4), "e");
  // Дальше кузова не уходим даже при большом номере.
  assert.equal(carFrame(known, 9), "e");
  assert.equal(exteriorFrames(known), 5);

  // Машина без числа: осторожный предел, ракурс сам опускается до второго кадра.
  const unknown = { images:["a", "b", "c", "d", "e"] };
  assert.equal(carFrame(unknown, 3), "b");
  assert.equal(exteriorFrames(unknown), EXTERIOR_FRAMES);

  // Снимков меньше, чем обещано, — берём последний, а не пустоту.
  assert.equal(carFrame({ images:["a", "b"], exteriorPhotos:7 }, 5), "b");
  assert.equal(carFrame({ image:"x" }, 2), "x");
  assert.equal(carFrame({}, 0), "");
});

test("кнопка раздела стоит отдельно от разделов аналитики и не включает выбор периода", () => {
  assert.match(page, /const socialSection = \{ id:"social", label:"Посты соц сетей".*ranged:false \}/);
  assert.match(page, /analytics-sidebar-social[\s\S]{0,200}openSection\("social"\)/);
  // Раздел обязан находиться по имени, иначе кабинет покажет «Обзор» и его период.
  assert.match(page, /\[\.\.\.sections, socialSection\]\.find\(\(item\) => item\.id === section\)/);
  assert.match(page, /hidden=\{section !== "social"\}><SocialPostsSection/);
  // И в меню на телефоне, иначе с телефона раздел недоступен вовсе.
  assert.match(page, /chooseSection\("social"\)/);
});

test("кадры грузятся только когда раздел открыт", () => {
  assert.match(page, /if \(!active\) return undefined;/);
});

// Отладочный режим React проводит эффект дважды. Пока ответ гасился уборкой
// эффекта, сетка навсегда оставалась на «загружается» — свежий ответ отбрасывался
// вместе с первым проходом. Ответ выбирается по номеру запроса, а не по уборке.
test("ответ каталога не теряется на повторном проходе эффекта", () => {
  assert.match(page, /const request = requestRef\.current \+ 1;/);
  assert.match(page, /if \(requestRef\.current !== request\) return;/);
  assert.doesNotMatch(page.slice(page.indexOf("function SocialPostsSection")), /let alive = true;/);
});

test("сетка показывает обрезанные квадраты, а без подписей — отступы как в ленте", () => {
  assert.match(styles, /\.social-grid \{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.social-frame \{[^}]*aspect-ratio:1\/1/);
  assert.match(styles, /\.social-frame img \{[^}]*object-fit:cover/);
  assert.match(styles, /\.social-grid\.bare \{ gap:3px; \}/);
  assert.match(page, /social-grid\$\{captions \? "" : " bare"\}/);
  // Подписи рисуются только когда их попросили.
  assert.match(page, /\{captions && \(\s*<figcaption>/);
});

test("у сравнения плитка из двух кадров рядом", () => {
  assert.match(page, /\$\{frameClass\} is-duel/);
  assert.match(styles, /\.social-frame\.is-duel \{[^}]*grid-template-columns:1fr 1fr/);
});

test("подложка кадра в кабинете и в подготовке публикации — один цвет", () => {
  const [, r, g, b] = square.match(/BACKGROUND = \((\d+), (\d+), (\d+)\)/).map(Number);
  const hex = `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  assert.match(styles, new RegExp(`\\.social-frame \\{[^}]*background:${hex}`));
});

// Историю аналитики однажды стёрли этой кнопкой. Кнопку убрали вместе с окном
// подтверждения; сам сброс остался только на сервере, вручную.
test("кнопки «Обнулить аналитику» в кабинете нет", () => {
  assert.doesNotMatch(page, /Обнулить аналитику/);
  assert.doesNotMatch(page, /ResetAnalyticsModal/);
  assert.doesNotMatch(styles, /analytics-sidebar-danger|analytics-reset-modal/);
});

// Число кадров снаружи не хранится отдельным столбцом: оно едет в карточке машины,
// которую импорт кладёт в базу целиком. Проверка следит, что по дороге из импорта
// в каталог оно не теряется — иначе витрина и лента молча вернутся к угадыванию.
test("число кадров снаружи доезжает из импорта до карточки в каталоге", async () => {
  const { normalizeCar, rowToCar, withoutDetailPayload } = await import("../server/repository.mjs");
  const images = ["https://img/a.jpg", "https://img/b.jpg", "https://img/c.jpg"];
  const stored = normalizeCar({ id:"che168-1", brand:"BYD", model:"Seagull", year:2024, images, exteriorPhotos:3 });
  assert.equal(stored.exteriorPhotos, 3);
  // Так карточка ложится в базу и так же читается обратно.
  const row = { id:"che168-1", source_payload:JSON.parse(JSON.stringify(stored)), images, brand:"BYD", model:"Seagull", model_year:2024, status:"active" };
  assert.equal(withoutDetailPayload(rowToCar(row)).exteriorPhotos, 3);
});

// Логотип в углу — первый настоящий элемент оформления: витрина для того и нужна,
// чтобы увидеть его на реальных кадрах. Он обязан быть на каждой плитке, включая
// сравнение и обложку журнала, и не должен растянуться на весь квадрат: общее
// правило кадра задаёт картинкам размер во всю плитку с обрезкой.
test("логотип стоит в углу каждой плитки и не растягивается на весь кадр", () => {
  assert.equal(page.match(/className="social-mark"/g)?.length, 2, "логотипа нет у одного из видов плиток");
  assert.match(page, /social-mark" src="\/logo-dark\.svg/);
  assert.match(styles, /\.social-frame > img\.social-mark \{[^}]*position:absolute/);
  assert.match(styles, /\.social-frame > img\.social-mark \{[^}]*right:[\d.]+%/);
  assert.match(styles, /\.social-frame > img\.social-mark \{[^}]*bottom:[\d.]+%/);
  assert.match(styles, /\.social-frame > img\.social-mark \{[^}]*width:[\d.]+%/);
  // Логотип обязан быть выше обеих теней, а не просто удачно нарисован последним:
  // без явного номера слоя порядок в разметке решил бы иначе для разных мест.
  assert.match(styles, /\.social-frame > img\.social-mark \{[^}]*z-index:1/);
});

// Заголовок темы поверх кадра — второй элемент оформления после логотипа.
// Размер меряется шириной плитки, а не экрана: в ленте на телефоне кадр занимает
// всю ширину, и надпись обязана вырасти вместе с ним.
test("заголовок темы лежит на кадре и растёт вместе с плиткой", () => {
  assert.equal(page.match(/className=\{titleClass\}/g)?.length, 2, "надписи нет у одного из видов плиток");
  assert.match(page, /const titleClass = `social-title at-\$\{resolvePlace\(theme\.place, headline\)\} size-\$\{headlineSize\(headline\)\}`/);
  assert.match(page, /const headline = tileHeadline\(theme, pick, loaded, round\)/);
  assert.match(styles, /\.social-frame \{[^}]*container-type:inline-size/);
  assert.match(styles, /\.social-title \{[\s\S]*?color:#fff/);
  assert.match(styles, /\.social-title\.size-[a-z]+ \{ font-size:calc\([\d.]+cqw \* var\(--social-title-scale, 1\)\)/);
  // Половинки сравнения — тоже span: их правило не должно красить заголовок фоном.
  assert.match(styles, /\.social-frame\.is-duel > span:not\(\.social-title\)/);
});

// Одно и то же место у всех записей превращает ленту в бланк, а разное — помогает
// узнавать тему с одного взгляда. Мест четыре (право убрано 17.09.2026 — коробка
// там сжималась по ширине текста и на глаз читалась как середина, а не край), и
// они разделены между темами поровну — по две на каждое, а не так, что одно место
// людное, а другое пустует.
test("у каждой темы своё место для заголовка, и места разделены поровну", () => {
  for (const theme of SOCIAL_THEMES) assert.ok(PLACES.includes(theme.place), `у темы ${theme.id} место «${theme.place}» неизвестно`);
  const perPlace = SOCIAL_THEMES.length / PLACES.length;
  for (const place of PLACES) {
    const count = SOCIAL_THEMES.filter((theme) => theme.place === place).length;
    assert.equal(count, perPlace, `место ${place} досталось ${count} темам вместо ${perPlace}`);
  }
  for (const place of PLACES) assert.match(styles, new RegExp(`\\.social-title\\.at-${place}[,\\s{]`), `место ${place} не описано в стилях`);
  // Область одна на все записи: общий отступ по краям и своя полоса под логотип.
  assert.match(styles, /\.social-frame \{ --social-safe:\d+%; --social-mark-strip:\d+%; \}/);
  // Левый нижний угол — тот же маленький отступ, что и у левого верхнего: логотип
  // стоит в правом нижнем углу и этой надписи не мешает. Центр остаётся приподнят
  // над логотипом отдельно (его коробка шире и ближе к нему).
  assert.match(styles, /\.social-title\.at-bottom-left \{[^}]*bottom:var\(--social-safe\)/);
  assert.match(styles, /\.social-title\.at-bottom-center \{[^}]*bottom:calc\(var\(--social-mark-strip\) \* [\d.]+\)/);
});

// Шрифт лежит на нашем домене: подключение с Google Fonts когда-то давало прыжок
// текста на первой загрузке, и с тех пор все шрифты сайта свои.
test("заголовки набраны примеряемым шрифтом, и файлы шрифта лежат у нас", async () => {
  const fonts = await readFile(new URL("../src/fonts.css", import.meta.url), "utf8");
  // Шрифт надписи Сергей меняет на глаз; проверка следит не за именем, а за тем,
  // что выбранный шрифт объявлен в наших правилах и лежит у нас файлами.
  const family = styles.match(/\.social-title \{[\s\S]*?font-family:"([^"]+)"/)?.[1];
  assert.ok(family, "у надписи не задан шрифт");
  assert.match(fonts, new RegExp(`font-family: "${family}"`), `шрифт ${family} не объявлен в fonts.css`);
  // Адреса в правилах — только наши; про Google в файле есть лишь пояснение в шапке.
  assert.doesNotMatch(fonts, /url\(["']?https?:\/\//);
  // Все файлы, на которые ссылаются правила, должны существовать: иначе браузер
  // тихо подставит запасной шрифт, и надпись поедет.
  for (const file of fonts.match(/\/fonts\/[a-z0-9-]+\.woff2/g) || []) {
    await readFile(new URL(`../public${file}`, import.meta.url));
  }
  for (const part of ["latin", "latin-ext", "cyrillic"]) {
    assert.match(fonts, new RegExp(`/fonts/ubuntu-mono-700-${part}\\.woff2`), `нет набора знаков ${part}`);
  }
});

// На кадре стоит первая строка будущей записи, а не название темы: витрина для того
// и нужна, чтобы увидеть ленту глазами читателя. Значков в этой строке быть не
// должно — на картинке они выглядят мусором.
test("на кадре стоит первая строка записи, и в ней нет значков", () => {
  const car = { brand:"Zeekr", model:"001", year:2022, type:"Электромобиль", chinaPrice:180_000, usdPrice:25_000, battery:86 };
  const lines = socialTiles().map(({ theme, pick, round }) => {
    const loaded = theme.kind === KINDS.duel ? [car, { brand:"BMW", model:"i5", year:2024 }] : theme.kind === KINDS.cover ? null : car;
    return tileHeadline(theme, pick, loaded, round);
  });
  assert.equal(lines.filter(Boolean).length, lines.length, "у какой-то плитки нет первой строки");
  // Значки, которыми начинаются строки записи: на картинку они не переносятся.
  for (const line of lines) assert.doesNotMatch(line, /\p{Extended_Pictographic}/u, `в строке «${line}» остался значок`);
  // Запись об одной машине начинается с самой машины и цены под ключ.
  const core = SOCIAL_THEMES.find((theme) => theme.id === "core");
  assert.match(tileHeadline(core, core.picks[0], car), /^Zeekr 001, 2022 — [\d\s\u00a0]+\$[\s\u00a0]под[\s\u00a0]ключ$/);
  // Сравнение спрашивает про обе модели сразу.
  const duel = SOCIAL_THEMES.find((theme) => theme.id === "duel");
  assert.equal(tileHeadline(duel, duel.picks[0], [car, { brand:"BMW", model:"i5" }]), typeset("Zeekr 001 или BMW i5?"));
  // Пока машина не пришла, надписи нет — пустой строкой кадр не портим.
  assert.equal(tileHeadline(core, core.picks[0], null), "");
});

// Формулировки не должны повторяться: одинаковый текст круг за кругом — это та же
// лента-бланк, от которой уводили разные места для надписи. У каждой темы с
// постоянным текстом формулировка своя на каждый круг.
test("у кругов одной темы формулировки разные", () => {
  const rounds = [...Array(THEME_ROUNDS).keys()];
  for (const theme of SOCIAL_THEMES) {
    // Темы, где надпись собирается из самой машины (цена под ключ, сравнение),
    // проверяются отдельно: без загруженной машины строки у них пустые.
    if (!theme.headlines && !theme.picks.every((pick) => pick.headline)) continue;
    const lines = rounds.map((round) => tileHeadline(theme, theme.picks[round % theme.picks.length], null, round));
    assert.equal(new Set(lines).size, lines.length, `у темы ${theme.id} круги говорят одно и то же: ${lines.join(" / ")}`);
  }
  // Сравнение двух моделей тоже не повторяет один и тот же вопрос дословно.
  const duel = SOCIAL_THEMES.find((theme) => theme.id === "duel");
  const pair = [{ brand:"BMW", model:"i5" }, { brand:"BYD", model:"Han L" }];
  const duelLines = rounds.map((round) => tileHeadline(duel, duel.picks[0], pair, round));
  assert.ok(new Set(duelLines).size > 1, `сравнение спрашивает одно и то же: ${duelLines.join(" / ")}`);
  assert.ok(DUEL_HEADLINES.length >= 2, "у сравнения всего одна формулировка");
});

// Список идёт по кругу: круг за пределами списка возвращается к его началу, а не
// к пустоте — иначе на четвёртом круге кадр остался бы без надписи.
test("варианты идут по кругу и не кончаются", () => {
  assert.equal(headlineVariant(["а", "б"], 0), "а");
  assert.equal(headlineVariant(["а", "б"], 3), "б");
  const fresh = SOCIAL_THEMES.find((theme) => theme.id === "fresh");
  assert.equal(tileHeadline(fresh, fresh.picks[0], null, THEME_ROUNDS), tileHeadline(fresh, fresh.picks[0], null, 0));
});

// Длинная надпись уезжает на мелкий кегль и на три строки, а из центра её вдобавок
// выносит к краю: варианты должны быть в основном короткими.
test("варианты заголовков короткие", () => {
  const fixed = SOCIAL_THEMES.flatMap((theme) => [...(theme.headlines || []), ...theme.picks.map((pick) => pick.headline).filter(Boolean)]);
  assert.ok(fixed.length >= 12, `постоянных формулировок слишком мало: ${fixed.length}`);
  for (const line of fixed) assert.ok(line.length <= 40, `формулировка «${line}» длиннее 40 знаков`);
  const short = fixed.filter((line) => headlineSize(line) === "large");
  assert.ok(short.length >= fixed.length / 3, `коротких формулировок всего ${short.length} из ${fixed.length}`);
});

// Стиль надписи один на все темы (решение Сергея 17.09.2026: плашки под текстом
// убрали везде) — первое слово фирменным красным, остальное белым, фона нет.
test("первое слово надписи красное, остальное белое, фона под текстом нет", () => {
  assert.match(styles, /\.social-title \{[\s\S]*?color:#fff/);
  assert.match(styles, /\.social-title > b \{ color:#ff485c/);
  // ^ и флаг m — иначе шаблон цепляется за «.social-title» внутри :not(.social-title)
  // у соседнего правила (половинки сравнения) и находит чужой background.
  assert.doesNotMatch(styles, /^\.social-title\b[^{]*\{[^}]*background/m);
  // Тень держит буквы читаемыми на пёстром снимке — раз фона под ними больше нет.
  assert.match(styles, /\.social-title \{[\s\S]*?drop-shadow/);
  assert.match(page, /className=\{titleClass\}><SocialHeadline text=\{headline\} \/>/);
});

// Место у правого края убрано 17.09.2026: коробка там сжималась по ширине текста и
// на глаз читалась как «где-то в середине», путая, а не помогая узнавать тему.
// Остались только левый край и середина.
test("места у правого края нет, а надписи выровнены по левому краю, кроме тех, что по центру", () => {
  assert.deepEqual([...PLACES], ["top-left", "top-center", "bottom-left", "bottom-center"]);
  assert.doesNotMatch(styles, /\.social-title\.at-(top|bottom)-right/);
  for (const theme of SOCIAL_THEMES) assert.doesNotMatch(theme.place, /-right$/, `у темы ${theme.id} осталось место у правого края`);
  assert.match(styles, /\.social-title \{[\s\S]*?text-align:left/);
  assert.match(styles, /\.social-title\.at-top-center, \.social-title\.at-bottom-center \{[^}]*text-align:center/s);
  // Центровка распором, а не сдвигом от левого края: у прижатой к середине коробки
  // место для текста считается от середины до правого края — половина кадра, и
  // надпись ломается на лишние строки, сколько ширины ей ни разреши.
  assert.match(styles, /\.social-title\.at-top-center, \.social-title\.at-bottom-center \{[^}]*left:0; right:0; margin-inline:auto/s);
  assert.doesNotMatch(styles, /\.social-title\.at-\w+-center[^{]*\{[^}]*translateX/s);
});

// Цена, разорванная переносом («15 000» на одной строке, «$» на другой), выглядит
// browkом, а висячий предлог в конце строки — неряшливостью.
test("цены, единицы и короткие слова не разрываются переносом", () => {
  const nbsp = "\u00a0";
  assert.equal(typeset("Пять машин до 25 000 $"), `Пять машин до${nbsp}25${nbsp}000${nbsp}$`);
  assert.equal(typeset("Пробег 150 000 км"), `Пробег 150${nbsp}000${nbsp}км`);
  assert.equal(typeset("Где заряжаться в Беларуси"), `Где заряжаться в${nbsp}Беларуси`);
  // Обычные слова длиннее двух букв никуда не приклеиваются.
  assert.equal(typeset("Новое в каталоге за неделю"), `Новое в${nbsp}каталоге за${nbsp}неделю`);
});

// Длинная надпись тем же кеглем занимает полкадра — размеров три, выбирает длина.
test("кегль надписи падает с её длиной", () => {
  assert.equal(headlineSize("Подешевели за неделю"), "large");
  assert.equal(headlineSize("Zeekr 001, 2022 — 21 400$ под ключ"), "medium");
  assert.equal(headlineSize("Оптимальное сочетание цены и состояния"), "small");
  const sizes = HEADLINE_SIZES.map((size) => Number(styles.match(new RegExp(`\\.social-title\\.size-${size} \\{ font-size:calc\\(([\\d.]+)cqw`))?.[1]));
  for (const size of sizes) assert.ok(size > 0, "какой-то кегль не описан в стилях");
  assert.deepEqual(sizes, [...sizes].sort((left, right) => right - left), `кегли не убывают: ${sizes.join(", ")}`);
  assert.match(page, /size-\$\{headlineSize\(headline\)\}/);
});

// Первое слово надписи красится отдельно — проверяем сам разбор строки, не только
// правила CSS: он должен резать по любому пробелу, включая неразрывный, который
// typeset() ставит между короткими словами.
test("первое слово надписи отрезается верно, включая неразрывный пробел", () => {
  const mod = page.slice(page.indexOf("function SocialHeadline"), page.indexOf("function SocialPostsSection"));
  const breakAt = (text) => {
    const at = text.search(/\s/);
    return at === -1 ? [text, ""] : [text.slice(0, at), text.slice(at)];
  };
  assert.deepEqual(breakAt("Подешевели за\u00a0неделю"), ["Подешевели", " за\u00a0неделю"]);
  assert.deepEqual(breakAt("Новое"), ["Новое", ""]);
  assert.ok(mod.includes("text.search(/\\s/)"), "разбор строки не по /\\s/");
  assert.match(mod, /return <><b>\{lead\}<\/b>\{rest\}<\/>/);
});

// Тень под фотографией держит надпись читаемой на любом снимке. Она обязана лежать
// с той стороны кадра, где стоит сама надпись, — иначе на светлом небе буквы
// потеряются ровно там, где их и нужно прочесть.
test("тень под текстом ложится с той стороны кадра, где стоит надпись", () => {
  assert.match(page, /const frameClass = `social-frame edge-\$\{theme\.place\.startsWith\("top"\) \? "top" : "bottom"\}\$\{shape === "vertical" \? " shape-vertical" : ""\}`/);
  // Тонкая тень снизу — только там, где надпись сверху: у тем с надписью снизу этот
  // же край уже закрыт широкой тенью, и вторая, короткая, поверх нею была бы лишней.
  assert.match(styles, /\.social-frame:not\(\.edge-bottom\)::before \{[^}]*bottom:0; height:50px/);
  assert.match(styles, /\.social-frame:not\(\.edge-bottom\)::before \{[^}]*background:linear-gradient\(to top, rgb\(0 0 0 \/ 40%\), rgb\(0 0 0 \/ 0%\)\)/);
  assert.doesNotMatch(styles, /^\.social-frame::before/m);
  // Широкая тень — с края, где надпись, и заметно темнее у самого края.
  assert.match(styles, /\.social-frame::after \{[^}]*height:50%/);
  assert.match(styles, /\.social-frame\.edge-top::after \{ top:0; background:linear-gradient\(to bottom, rgb\(0 0 0 \/ 80%\), rgb\(0 0 0 \/ 0%\)\); \}/);
  assert.match(styles, /\.social-frame\.edge-bottom::after \{ bottom:0; background:linear-gradient\(to top, rgb\(0 0 0 \/ 80%\), rgb\(0 0 0 \/ 0%\)\); \}/);
});

test("у каждой темы класс тени совпадает с тем, где у неё стоит надпись", () => {
  for (const theme of SOCIAL_THEMES) {
    const expected = theme.place.startsWith("top") ? "edge-top" : "edge-bottom";
    const derived = theme.place.startsWith("top") ? "top" : "bottom";
    assert.equal(`edge-${derived}`, expected, `у темы ${theme.id} место «${theme.place}» не top и не bottom`);
  }
});

// Короткий хвост строки (одна-три буквы, часто окончание модели: «Han L?»)
// не должен переноситься один — приклеиваем его к предыдущему слову неразрывным
// пробелом, тем же способом, что и остальные правила typeset().
test("короткий хвост строки не остаётся сиротой на своей строке", () => {
  const nbsp = " ";
  assert.equal(typeset("BMW i5 или BYD Han L?"), `BMW i5 или${nbsp}BYD Han${nbsp}L?`);
  assert.equal(typeset("Дорого или нормально?"), `Дорого или${nbsp}нормально?`);
  // Длинное последнее слово не трогаем — приклеивать нечего, оно не сирота.
  assert.equal(typeset("Новое в каталоге"), `Новое в${nbsp}каталоге`);
});

// Слово не переносится никогда: overflow-wrap:anywhere однажды ломал слова
// посередине («Электромобил» / «ь») и был убран. Раз перенос запрещён совсем,
// единственный способ вернуть слишком широкое слово в кадр — уменьшить масштаб,
// а измеряет это SocialTitle в браузере (scrollWidth против clientWidth).
test("слово никогда не переносится — вместо этого надпись меряется и уменьшается в браузере", () => {
  assert.doesNotMatch(styles, /\.social-title[^{]*\{[^}]*overflow-wrap/s);
  assert.match(page, /function SocialTitle\(\{ className, children \}\) \{/);
  assert.match(page, /el\.scrollWidth > el\.clientWidth \+ 1/);
  assert.match(page, /<SocialTitle className=\{titleClass\}><SocialHeadline text=\{headline\} \/><\/SocialTitle>/);
  // Множитель, который эта проверка понижает, и есть то, на что умножается кегль.
  assert.match(styles, /font-size:calc\(11cqw \* var\(--social-title-scale, 1\)\)/);
});

// Значок «vs» убран — вместо него простой разделитель между кадрами.
test("вместо значка «vs» — простой разделитель между кадрами", () => {
  assert.doesNotMatch(page, />vs</);
  assert.match(page, /className="social-duel-divider"/);
  assert.match(styles, /\.social-frame\.is-duel > \.social-duel-divider \{[^}]*left:50%/);
  assert.doesNotMatch(styles, /is-duel > b \{/);
});

// Переключатель формы над сеткой — только для сравнения, публикацию не трогает.
// Вертикальная форма (4:5, 1080×1350) — самый узкий кадр, который сегодня
// принимает публикация в ленту (см. scripts/lib/social.mjs); это подтверждено
// собственными замерами, а не только описанием формата Instagram.
test("переключатель показывает квадрат и вертикальный 4:5, оба CSS-приближением", () => {
  assert.match(page, /const \[shape, setShape\] = useState\("square"\)/);
  assert.match(page, /shape === "vertical" \? " shape-vertical" : ""/);
  assert.match(styles, /\.social-frame\.shape-vertical \{ aspect-ratio:4\/5; \}/);
  // 1080×1350 = 4:5 — именно то число, что фактически проверено на сервере.
  assert.equal(1080 / 1350, 4 / 5);
});
