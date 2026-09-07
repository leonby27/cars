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

---

## Второй заход, 07.09.2026: электрички и гибриды «бензиновых» марок

Список марок ввоза стал общим для всех типов двигателя, и в каталог пошли электрические
и гибридные версии Toyota, Honda, Volvo, Porsche, Buick, Geely, Chery, Haval, MG, Lexus,
Land Rover, Hyundai, Changan. Приезжают они под китайскими именами. Правила прежние:
av.by → имя дилера → экспортное имя завода.

**Приставка завода снимается автоматически.** «FAW Toyota bZ4X» и «GAC Toyota bZ4X» — это
один bZ4X, «Dongfeng Honda S7» — просто S7. Правило добавлено в `MODEL_PREFIX_STRIPS`
(config/import-policy.mjs) рядом с тем же правилом для Volkswagen.

**Переименовано.** «New Energy» и «Plug-in Hybrid» → PHEV у гибрида и EV у электромобиля;
китайские имена — на те, что знает av.by:

| Приходит от источника | Станет | Основание |
|---|---|---|
| Toyota BoZhi 3X / 4X / 7 | **bZ3X / bZ4X / bZ7** | 铂智 — марка электричек Toyota в Китае, экспортное имя bZ |
| Toyota Corolla / Levin Twin Engine E+ | **Corolla PHEV / Levin PHEV** | «двойной двигатель E+» — заводское имя гибрида с розеткой |
| Toyota RAV4 Rongfang Dual Engine E+ | **RAV4 PHEV** | на av.by модель зовут RAV4 |
| Toyota Lingfang HARRIER | **Harrier** | 凌放 — китайская приставка, имя модели Harrier |
| Toyota Wildlander New Energy | **Wildlander PHEV** | |
| Honda Hunting Light e:NS2 | **e:NS2** | 猎光 — китайская приставка; на av.by есть e:NS1 |
| Honda e:NP2 Extreme Wave 2 | **e:NP2** | 极湃2 — то же самое |
| Honda Accord / Breeze / CR-V New Energy | **Accord / Breeze / CR-V PHEV** | |
| Honda Inspire Hybrid | **Inspire PHEV** | |
| Buick E4 / E5 | **Electra E4 / Electra E5** | на av.by модель записана как Electra E4 |
| Buick GL8 New Energy | **GL8 PHEV** | |
| Geely Bin Yue New Energy | **Coolray PHEV** | бензиновый 缤越 уже переименован в Coolray |
| Geely Borui PHEV | **Emgrand GT PHEV** | бензиновый 博瑞 уже Emgrand GT |
| Geely Emgrand New Energy / Emgrand L HiP | **Emgrand PHEV / Emgrand L PHEV** | |
| Geely Emgrand GSe | **Emgrand GS EV** | электрическая версия Emgrand GS |
| Geely Jiaji New Energy | **Jiaji PHEV** | |
| Chery Tiggo 7 PLUS New Energy | **Tiggo 7 Pro Max PHEV** | бензиновый PLUS уже Pro Max |
| Chery Tiggo 8 PLUS C-DM / Kunpeng e+ | **Tiggo 8 Pro Max C-DM / PHEV** | «Kunpeng e+» — имя установки, не модели |
| Haval H6 New Energy | **H6 PHEV** | |
| Haval Second-Generation Big Dog New Energy | **Dargo II PHEV** | 大狗 уже Dargo |
| MG EZS Pure Electric | **ZS EV** | на av.by марка знает ZS |
| MG 6 / HS New Energy | **6 PHEV / HS PHEV** | |
| Volvo XC60/XC70/XC90/S60/S90 Plug-in Hybrid | **… PHEV** | на av.by модели под обычными именами |
| Porsche Cayenne / Panamera New Energy | **Cayenne PHEV / Panamera PHEV** | |
| Land Rover Range Rover Evoque New Energy | **Range Rover Evoque PHEV** | |
| Volkswagen Magotan / Tayron GTE Plug-in Hybrid | **Magotan GTE / Tayron GTE** | GTE у завода уже значит гибрид |
| Lexus NX / RX New Energy, UX Electric | **NX PHEV / RX PHEV / UX EV** | |
| Hyundai Elantra Plug-in Hybrid | **Elantra PHEV** | |
| Changan UNI-Z New Energy | **UNI-Z PHEV** | |
| Changan New Energy E-Pro | **E-Pro** | |
| Changan CS55PLUS PHEV | **CS55 PLUS PHEV** | пробел как у бензиновой версии |

**Подмарка Changan Qiyuan сведена в Changan.** У источника 长安启源 — отдельная марка со
своим номером (582, 476 машин). В Беларуси такой марки не знают: в справочнике av.by это
Changan с моделями «Qiyuan A05», «Qiyuan A06», «Qiyuan A07», «Qiyuan Q05», «Qiyuan Q07» —
приставка живёт в названии модели. Сведение сделано словарём марок в
`config/import-policy.mjs`, отдельных переименований моделей не потребовалось.

### Имена, найденные за пределами av.by

Там, где в Беларуси машины ещё нет, смотрели официальное экспортное имя завода и то,
как модель продают в России.

| Приходит от источника | Станет | Основание |
|---|---|---|
| Buick Zenith Sedan | **Electra L7** | 至境 — марка электричек Buick, за границей Electra; это её седан на генераторе |
| Buick Zhijing E7 | **Electra E7** | та же марка, имя завода |
| Buick Zhijing Shijia | **Electra Encasa** | так минивэн 至境世家 назван на экспорт |
| Haval Meng Long NEV | **Raptor** | 猛龙 в России продаётся как Haval Raptor |
| Haval Menglong PLUS | **Raptor Plus** | то же семейство |
| Hyundai Encino Pure Electric | **Kona EV** | 昂希诺 — китайское имя Kona; на av.by Kona есть |
| Hyundai Fista EV | **Lafesta EV** | 菲斯塔 — Lafesta, официальное имя Hyundai |
| MINI Electric MINI COOPER | **Cooper SE** | на av.by есть Cooper SE |
| MINI Electric MINI ACEMAN | **Aceman** | на av.by есть Aceman |
| MINI Electric MINI JCW / JCW ACEMAN | **JCW Electric / Aceman JCW** | имени на av.by нет, собрано из имён завода |
| Lexus RX Classic | **RX** | на av.by поколения не разводят |
| MG MG4 EV | **MG4** | MG4 бывает только электрическим |

### Оставлено как есть — имя завода уже понятное

Geely Boyue REV (REV — собственное сокращение Geely для генератора), Haval Xiaolong MAX
(в России продаётся под этим же именем), Nissan ARIYA / N6 / N7 / NX8 / Frontier Pro,
Kia EV5 / EV6 / Niro / Sportage, Jetour X70 C-DM / X70S EV / X90 C-DM, Volvo C40 / EX30 /
EM90, Porsche Taycan / Macan EV, MG Cyberster / ES5, Honda e:NP1 / e:NS1, Toyota Avalon /
Crown Kluger, Hyundai ELEXIO, Changan Benben E-Star / Hunter / Qiyuan E07, Buick Velite 7.

### Экспортные марки Chery: Jaecoo и Omoda

Решение Сергея 07.09.2026. В Китае это модели самой Chery, но в Беларуси их знают только
под экспортными именами, и на av.by заведены как отдельные марки.

| Приходит от источника | Станет | В Китае |
|---|---|---|
| Chery Tansuo 06 | **Jaecoo J7** | 探索06 |
| Chery Explore 06 / Explore 06 C-DM | **Jaecoo J7 / J7 C-DM** | то же самое, второе написание источника |
| Chery Omoda | **Omoda C5** | 欧萌达 |

Логотипы — `public/brands/jaecoo.svg` и `public/brands/omoda.svg`, в тёмной теме
инвертируются (в список «цветных» марок не внесены).

**Что осталось под Chery и почему.** Jaecoo J8 — это китайский Tiggo 9, а Jaecoo J6 —
электрический iCar 03. Но на av.by обе машины стоят под маркой Chery (`chery/tiggo-9`,
`chery/icar-03t`), поэтому переименовывать их нельзя: покупатель ищет их как Chery.
Правило то же, что и везде — решает справочник av.by, а не логика концерна.

**Ловушка обхода.** У источника марок Jaecoo и Omoda не существует, их машины лежат
в списках Chery. Актуализация обходит источник по его маркам, поэтому в правилах ввоза
заведена подмена (`sourceBrandOf`): наша машина под именем Jaecoo ищется в списках Chery.
Без неё такая машина выпала бы из обхода насовсем — цена не обновлялась бы, а проданную
мы бы не заметили.
