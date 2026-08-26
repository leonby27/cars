# Беларуские названия моделей

Многие китайские машины у нас знают под другим именем: 星瑞 в Беларуси — Geely Preface,
缤越 — Coolray, 大狗 — Dargo. Каталог переведён на беларуские названия 26.08.2026;
китайское имя показывается подсказкой рядом с названием в карточке.

**Сделано.** Словарь названий — `config/model-names-by.mjs`, он же источник истины для
импорта, базы, поиска и подсказки. Список ниже — то, что применено.

## Откуда взяты беларуские названия

1. **Справочник моделей av.by** — главный источник. Это то, как машину называют
   продавцы и по чему её ищут в Беларуси. У каждой модели взято ещё и число живых
   объявлений: если на av.by 166 «Coolray» и 10 «Binyue», спорить не о чем.
2. **Официальные названия дилеров** — модельный ряд Geely/БелДжи (Coolray, Cityray,
   Atlas, Monjaro, Okavango, Preface, EX5), Haval, GWM.
3. **Экспортные имена завода** — там, где машины в Беларуси ещё нет, но у неё есть
   официальное латинское имя (Raeton CC, Luxeed, Stelato).

Замеры сделаны 26.08.2026.

## Правки Сергея 26.08.2026

Под китайскими именами оставлены: **Sagitar, Magotan, Magotan GTE, Tiguan L,
Tiguan L PHEV** и **Hyundai ix25** (не переименован в Creta). Удлинённые китайские
версии сохраняют букву L: **A4L, A5L, A6L, A7L, Q2L, Q5L, Jaguar XEL и XFL,
Chevrolet Malibu XL**. Приставка **«New Energy» заменена на PHEV**.

Решения по четырём спорным моделям: **Monjaro**, **Boyue L**, **EX5**, **Emgrand GS**.

---

## Что переименовано

### Geely (бензин)

| В базе сейчас | Станет | В Китае | Основание |
|---|---|---|---|
| Xing Rui | **Preface** | 星瑞 Xingrui | av.by знает только Preface; официальное имя у дилера |
| Binyue | **Coolray** | 缤越 Binyue | av.by: Coolray 166 против Binyue 10 |
| Haoyue | **Okavango** | 豪越 Haoyue | av.by: Okavango 17 против Haoyue 3; имя дилера |
| Borui | **Emgrand GT** | 博瑞 Borui | av.by знает только Emgrand GT |
| Galaxy Xingyao 8 | **Galaxy Starshine 8** | 星耀8 | так в справочнике av.by |
| Galaxy Stellar 6 | **Galaxy Starshine 6** | 星耀6 | так в справочнике av.by |
| Galaxy Starship 7 EM-i | **Galaxy Starship 7** | 星舰7 | av.by без приставки EM-i |
| Starry Wish | **EX2** | 星愿 Xingyuan | av.by: EX2; это же имя завод дал на экспорт |

### Haval, Chery, Changan, Jetour, Great Wall

| В базе сейчас | Станет | В Китае | Основание |
|---|---|---|---|
| Haval Big Dog | **Dargo** | 大狗 Dagou | официальное имя в Беларуси |
| Haval Da Gou 2nd Gen | **Dargo (2-е поколение)** | 二代大狗 | то же, второе поколение |
| Chery Tiggo 5x | **Tiggo 4 Pro** | 瑞虎5x | av.by: Tiggo 4 Pro; экспортное имя завода |
| Chery Tiggo 7 PLUS | **Tiggo 7 Pro Max** | 瑞虎7 PLUS | av.by: Tiggo 7 Pro Max (10 объявлений) |
| Chery Tiggo 8 PLUS | **Tiggo 8 Pro Max** | 瑞虎8 PLUS | av.by: Tiggo 8 PRO MAX |
| Changan Ruicheng CC | **Raeton CC** | 锐程CC Ruicheng | латинское имя завода |
| Jetour Dasheng | **Dashing** | 大圣 Dasheng | av.by: Dashing (16), самая частая Jetour |
| Jetour Traveler | **T2** | 旅行者 | av.by: T2 (9) |
| Great Wall Pao | **GWM Poer** | 炮 Pao | продаётся в Беларуси как Poer с 2021 года |

### Voyah

| В базе сейчас | Станет | В Китае | Основание |
|---|---|---|---|
| Dreamer | **Dream** | 梦想家 | справочник av.by |
| Zhiyin | **Courage** | 知音 Zhiyin | справочник av.by |
| Zhuiguang | **Passion** | 追光 Zhuiguang | справочник av.by |
| Zhuiguang L | **Passion L** | 追光L | то же |

### HIMA — это не одна марка, а пять

Наш каталог сваливает в «HIMA» пять разных марок альянса Huawei. В Беларуси их знают
по отдельности, и на av.by есть готовая марка **Aito** с моделями M5, M7, M8, M9.

| В базе сейчас | Станет | В Китае | Основание |
|---|---|---|---|
| HIMA M5 / M7 / M8 / M9 | **AITO M5 / M7 / M8 / M9** | 问界 Wenjie | av.by: марка Aito, 15 объявлений |
| HIMA Zhijie S7 | **Luxeed S7** | 智界S7 Zhijie | официальное имя марки — Luxeed (у R7 уже так) |
| HIMA Enjoy World S9 | **Stelato S9** | 享界S9 Xiangjie | официальное имя марки — Stelato |
| HIMA Enjoy World S9T | **Stelato S9T** | 享界S9T | то же |
| HIMA Shangjie SUV | **Shangjie H5** | 尚界H5 | у машины есть индекс H5 |
| HIMA Zunjie MPV | **Maextro** | 尊界 Zunjie | официальное имя марки — Maextro |

### Volkswagen

| В базе сейчас | Станет | В Китае | Основание |
|---|---|---|---|
| ID.7 VIZZION | **ID.7** | ID.7 VIZZION | av.by: ID.7 |
| ID. UNYX 06 / 07 / 08 | **ID.UNYX 06 / 07 / 08** | ID.与众 Yuzhong | av.by: ID.UNYX (без пробела) |
| CC | **Passat CC** | 一汽-大众CC | av.by: Passat CC (76) |

### Toyota, Honda, Mazda, Hyundai

| В базе сейчас | Станет | В Китае | Основание |
|---|---|---|---|
| Toyota RAV4 Rongfang | **RAV4** | 荣放 Rongfang | 荣放 — это просто китайское имя RAV4 |
| Toyota Yaris L | **Yaris** | 致炫 Zhixuan | av.by: Yaris (255) |
| Toyota YARiS L Zhi Xuan | **Yaris** | 致炫 | то же, дубль |
| Honda Haoying | **Breeze** | 皓影 Haoying | av.by: Breeze |
| Honda Lingpai | **Crider** | 凌派 Lingpai | av.by: Crider |
| Honda Vezel | **HR-V** | 缤智 Binzhi | av.by: HR-V (33), Vezel нет |
| Mazda Atenza | **Mazda6** | 阿特兹 Atezi | av.by: «6» (407 объявлений) |
| Mazda Mazda3 Axela | **Mazda3** | 昂克赛拉 | av.by: «3» (310) |
| Mazda CX-50 Xingye | **CX-50** | CX-50 行也 | av.by: CX-50 |
| Hyundai Beijing Hyundai ix35 | **ix35** | ix35 | убрать имя завода из названия |
| Hyundai Kustu | **Custin** | 库斯途 Kusitu | латинское имя модели |

### Немецкие удлинённые версии и прочая мелочь

| В базе сейчас | Станет | Почему |
|---|---|---|
| Audi Q5L | оставляем | на av.by Q5L есть отдельной моделью |
| Kia KX3 Smart Run | **KX3** | av.by: KX3; «Smart Run» — китайская приставка в названии версии |
| Denza Z9GT | **Z9 GT** | так на av.by |

---

## Похоже, но менять не надо

Важные находки — тут легко ошибиться в обратную сторону:

- **BYD.** Переименовывать нечего. В Европе 元PLUS зовут Atto 3, а 海鸥 — Dolphin Surf,
  но в Беларуси таких названий нет вообще: на av.by все BYD стоят под китайскими
  именами (Yuan Plus, Seagull, Song Plus, Sea Lion 06). Наши названия совпадают.
- **Ford Escape.** Это близнец Kuga, но на av.by 628 объявлений «Escape» против 183
  «Kuga» — имя Escape в Беларуси прижилось само. Оставляем.
- **Kia K3, K5, KX1, KX3.** В Европе это Cerato и Optima, но на av.by все четыре имени
  есть как есть — здесь машины ввозят из Кореи и Китая под ними.
- **Nissan Sylphy, Teana, Tiida, Kicks.** Все четыре в справочнике av.by. Не трогаем.
- **Deepal SL03 и L07.** Это не дубль: завод продаёт обе машины одновременно.
- **Toyota Wildlander, Frontlander, Venza, Levin.** Все свои имена, на av.by есть
  Wildlander, Frontlander и Venza. Levin — тоже отдельное имя модели, а не перевод.
- **Zeekr, NIO, XPeng, Xiaomi, Avatr, Leapmotor, Li Auto, Hongqi, Denza, ORA.**
  Названия совпадают со справочником av.by, менять нечего.

## Без беларуского имени — оставлено китайское

Этих машин в Беларуси нет, официального латинского имени у них тоже нет: Geely Binrui,
Geely Vision X3, Geely Emgrand X6, Geely Galaxy L6/A7/M9, Haval Chitu, Chery Arrizo 5
PLUS / Arrizo 8 / Arrizo 8 PRO, Chery Tiggo 3x, Changan Yida, Voyah Taishan, VW Lavida /
Lamando / Viloran / Santana / Tanying, Toyota Vios, Honda Avancier / UR-V / Integra /
Inspire / LIFE, Ford Territory, Nissan Terra, Mazda CX-4, ORA Black Cat / White Cat /
Ballet Cat / Lightning Cat, Leapmotor Lafa 5.

Отдельно про несколько из них — если захотим, можно вернуться:

- **Toyota Vios** — вне Китая это Yaris в кузове седан. Имя Vios в Беларуси не в ходу,
  но и «Yaris» рядом с хэтчбеком собьёт с толку.
- **Honda Integra и Inspire** — это китайские двойники Civic и Accord. Переименовать
  можно, но тогда в каталоге будет по два Civic и Accord.
- **VW Tanying** — на экспорте Tacqua (родственник T-Cross), в Беларуси не продавался.
- **Leapmotor Lafa 5** — на экспорте B05, но в Беларуси марку почти не знают.

## Что где лежит

- **Словарь названий** — `config/model-names-by.mjs`. Одна запись на модель: старое имя,
  новое, китайское для подсказки. Новое переименование дописывается только сюда.
- **Импорт** — `config/import-policy.mjs`: `canonicalImportName` отдаёт марку и модель
  вместе (у части машин меняется и марка). Ночная актуализация китайские имена не
  возвращает.
- **База** — `npm run db:models` прогоняет уже заведённые машины через словарь и
  пересобирает заголовки карточек. Повторный запуск безопасен.
- **Обзоры** — `src/model-pages.js` и `src/model-texts/*`. Старые адреса уводят на новые
  постоянным перебросом: карта в `MODEL_PAGE_REDIRECTS`, разделы каталога —
  `CATALOG_LANDING_REDIRECTS` в `src/catalog-landings.js`.
- **Поиск** — `src/search-dictionary.js`: китайские имена ведут на беларуские, поиск
  «binyue» находит Coolray.
- **Подсказка в карточке** — `ChineseNameMark` в `src/App.jsx`, стили
  `.chinese-name-mark` в `src/styles.css`. На готовой странице для поисковика то же
  имя добавляет `server/seo-render.mjs`.

## Заодно починено

Заголовки карточек дублировали марку: «Geely Galaxy **Galaxy** L6 2025», «Mazda
**Mazda3** 2022», «MG **MG5** 2023». Повтор убирает `src/car-title.js`.

## Марка HIMA разделена на пять

«HIMA» — имя альянса Huawei, которого не знает ни один покупатель. Машины разъехались
по своим маркам: **AITO** (1167 машин), **Shangjie** (255), **Luxeed** (227),
**Stelato** (132), **Maextro** (7). У AITO логотип альянса; у остальных четырёх своих
файлов нет, там показываются буквы.

## Осталось

- Логотипы для Luxeed, Stelato, Shangjie и Maextro.
- Три модели BYD разошлись по типу двигателя (Tang, Seal 06, Sealion 06 — на DM-i и EV),
  и у электрических версий обзора пока нет: 60 машин на три модели.
- `models-without-review.txt` — снимок до переименования, при следующем пересчёте
  обновится сам.
