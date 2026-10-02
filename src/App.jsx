import { secondaryPage } from "./secondary-page-load.jsx";

import { isAuthEntryPath, preservesAuthScroll, resolveAuthRoute, resolvePostAuthPath } from "./auth-route.js";
import { Phone } from "@phosphor-icons/react";
import { observeHoverPhotos, prepareHoverPhoto } from "./hover-photo-queue.js";
import { vehiclePhotoHref, retryVehiclePhoto } from "./photo-source.js";
import { Fragment, Suspense, createContext, lazy, memo, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { appHref } from "./app-href.js";

import { Illustration } from "./illustration.jsx";
import { StripPhoto } from "./strip-photo.jsx";
import { schedulePriceFit } from "./price-fit.js";
import { scheduleSpecFit } from "./spec-fit.js";
import { SearchField } from "./search-field.jsx";
import { SegmentedControl } from "./segmented-control.jsx";
import { homeModelBrands, homeModelEntries, homePopularModels } from "./home-popular-models.js";
import { EmptyState } from "./empty-state.jsx";
import { bindPhotoIntent, preloadPhoto } from "./photo-preload.js";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BatteryHigh, BookmarkSimple, CarProfile, CaretDown, CaretRight, ChatCircleText, Check, CheckCircle, ClipboardText, Desktop, Engine, Eye, EyeSlash, GasPump, Gauge, Gear, Heart, Images, InstagramLogo, Lightning, List, LinkSimple, MagnifyingGlass, MapPin, Moon, Palette, RoadHorizon, Rows, ShareNetwork, ShieldCheck, SlidersHorizontal, SquaresFour, SteeringWheel, Sun, TelegramLogo, TelegramOfficialLogo, ThreadsLogo, Timer, Tire, UserCircle, UsersThree, X } from "./icons.jsx";
import { matchesYearRange, sortCars } from "./car-filters.js";
import { latinVariants, mileageBounds, mileageLabel, parseQueryRanges } from "./search-query.js";
import { FUEL_TYPES, GEARBOX_TYPES, engineAspiration, engineBounds, engineLabel, enginePower, engineVolume, engineVolumeBadge, fuelType, gearboxType, matchesEngineBounds, matchesPowerBounds, powerBounds, powerLabel } from "./engine-spec.js";
import { matchesSearchText, searchTextWords, searchWordStem } from "./car-search-text.js";
import { collectHeroAliases, isHeroExcludeWord, listSearchMatches, listSearchVariants, nameSpellings, rankSearchEntries, resolveBrandAndModels, rewriteQueryNames, searchNormalize, splitModelSegments, swapKeyboardLayout, translateBrandWords, translateModelWords } from "./search-dictionary.js";
import { COLOR_LABELS, colorLabelForWord, colorValuesForLabels, matchesColorLabels } from "./colors.js";
import { cityName } from "./city-names.js";
import { EXCLUDED_BRANDS, canonicalImportModel } from "../config/import-policy.mjs";
import { CATALOG_INDEX_SEO, CATALOG_LANDINGS, HOME_H1_PARTS, HOME_SEO, brandLandingPath, modelFromSlug, findCatalogLanding, landingFilterParams, parseModelLandingPath } from "./catalog-landings.js";
import { modelLandingObject } from "./model-landing.js";
import { modelSlug } from "./model-slug.js";

import { seededRandom, shuffleCars, varietyOrder } from "./car-variety.js";
import { selectHomeFeed, isHomePriority, HOME_PRIORITY_SHARE } from "./home-feed.js";
import { estimateLandedCost, usdToByn, usdToRub, sourcePriceOf, sourceCurrencySymbol } from "./pricing.js";
import { chooseDecreePricing, chooseQuotaPricing, getPricingState, getServerPricingState, restorePricingChoice, subscribePricing } from "./pricing-state.js";
import { evQuotaPricingAvailable, evQuotaState } from "./ev-quota.js";

import { BODY_TYPES, normalizeBodyType } from "./body-types.js";
import { ANY_DRIVE, DRIVE_TYPES, normalizeDrive, orderDrives } from "./drive-types.js";
import { clearCatalogReturn, feedAnchorSelector, readCatalogReturn, readHomeSearchReturn, readQuickViewReturn, saveCatalogReturnScroll, saveHomeSearchReturn, saveQuickViewReturn } from "./catalog-return.js";
import { getListingAddedAt, isNewListing } from "./listing-age.js";
import { formatChangeDate, formatChangePercent, getPriceChange, minskClock } from "./price-change.js";

import { MODEL_PAGES, MODELS_INDEX, findModelPage, modelPageRedirect } from "./model-pages.js";
import { carTitle, carTitleDetails } from "./car-title.js";

import { splitInlineLinks } from "./inline-links.js";

import { formatRoundedListingCount } from "./catalog-count.js";
import { COMPANY } from "./company-data.js";
import { LEGAL_DOCUMENTS } from "./legal-documents.js";

import { TOOL_PAGES, findToolPage } from "./tool-pages.js";

import { CHINA_BRANDS } from "./china-brands.js";
import { ACTIVE_ORIGINS, countryName, fromPhrase, inPhrase, originForSource, originFromParam, siteCountriesGenitive, siteFromPhrase, siteInPhrase } from "./origin.js";
import { INFO_PAGES_SEO } from "./info-pages-seo.js";

import { BLOG_ENABLED, REVIEWS_ENABLED } from "./feature-flags.js";

import { BLOG_INDEX, blogApiParams, blogArticlePhotoParams, blogPostSides, blogPostTags, blogPosts, blogAllPosts, blogPostDateSentence, findBlogPost, homeBlogPosts } from "./blog-posts.js";

import { embeddedApiValue, initialApiValue } from "./boot-api.js";
import { HOME_FAQ, HOME_FAQ_LEAD, HOME_ORDER_STEPS } from "./purchase-info.js";
import { TRACKING_FAQ } from "./tracking-info.js";
import { stopMetrika, trackEvent, trackMetrikaGoal, trackMetrikaView } from "./analytics.js";

// Страница аналитики — служебная, посетителям не показывается. Её код (и код её
// таблиц) не кладём в общий файл приложения, а подгружаем отдельным файлом при
// первом открытии /analytics: каждому посетителю сайта он не нужен.
const HowItWorksPage = secondaryPage("HowItWorksPage");
const ContactsPage = secondaryPage("ContactsPage");
const ToolPage = secondaryPage("ToolPage");
const ModelsIndexPage = secondaryPage("ModelsIndexPage");
const BlogIndexPage = secondaryPage("BlogIndexPage");
const BlogPostPage = secondaryPage("BlogPostPage");
const Catalog = secondaryPage("Catalog");
const Detail = secondaryPage("Detail");
const OrderDraft = secondaryPage("OrderDraft");
const VehicleQuickViewModal = secondaryPage("VehicleQuickViewModal");
const AccountPage = secondaryPage("AccountPage");
const SavedSearchesPage = secondaryPage("SavedSearchesPage");
const Favorites = secondaryPage("Favorites");
const AnalyticsPage = lazy(() => import("./analytics-entry.jsx").then((m) => ({ default: m.AnalyticsPage })));

const numberFormatter = new Intl.NumberFormat("ru-RU");
const number = (value) => numberFormatter.format(value);

// В адресе карточки и в подписи «ID объявления» показываем только номер объявления:
// приставка источника («che168-», «CH-») посетителю ничего не говорит. Внутри
// приложения и в базе идентификатор остаётся полным, а сервер понимает оба вида,
// поэтому старые ссылки и закладки продолжают открываться.
// Номер в адресе: китайские — голый номер, корейские — с приставкой «kr-» (src/listing-id.js).
import { listingNumber } from "./listing-id.js";
const carHref = (car) => `/cars/${encodeURIComponent(listingNumber(car?.id))}`;
// Заголовок страницы машины. Он же уходит в Метрику, когда карточку открывают
// быстрым просмотром: в отчётах такой просмотр должен выглядеть ровно так же,
// как открытая страница этой машины, а не как что-то отдельное.
const carPageTitle = (car) => `${car?.title || carTitle(car?.brand, car?.model, car?.year)}, ${carTitleDetails(car, estimateLandedCost(car).totalUsd)} | abcars.by`;
// Адрес несёт короткий номер, а карточки и избранное — полный идентификатор,
// поэтому сравниваем их по номеру.
const sameListing = (left, right) => Boolean(left) && Boolean(right) && listingNumber(left) === listingNumber(right);
const findCarByListing = (cars, id) => (id ? cars.find((item) => sameListing(item.id, id)) || null : null);
const hasFavoriteListing = (favorites, id) => (id ? favorites.has(id) || [...favorites].some((item) => sameListing(item, id)) : false);
const uniqueSorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru"));
// Режим цен — с льготной квотой или с пошлиной 15% — живёт в корне приложения:
// переключение должно пересчитать цены на всех открытых экранах, ничего не
// перезагружая и не сбивая ни выдачу, ни прокрутку.
const QuotaPricingContext = createContext(null);

// Сколько всего машин в каталоге и когда его обновляли. Оба числа живут в корне
// приложения (их приносит первый же ответ каталога) и нужны далеко от него — в
// рекламной врезке посреди статьи. Тащить их пропсами через страницу материала и
// её тело незачем.
const EMPTY_CATALOG_FACTS = { total: 0, updatedAt: "" };
const CatalogFactsContext = createContext(EMPTY_CATALOG_FACTS);

const CurrencyContext = createContext("USD");
// Валюту переключают не только в шапке: в быстром просмотре шапка недоступна,
// поэтому сеттер доступен из любого места дерева.
const SetCurrencyContext = createContext(null);
// Машины, по которым у посетителя уже есть заказ. Кнопка на такой карточке ведёт в
// кабинет, а не заводит второй заказ по той же машине. Список нужен и в каталоге, и
// в быстром просмотре, и на странице автомобиля — поэтому лежит в контексте, а не
// передаётся пропсами через все экраны. Второй контекст — на запись: кабинет,
// загрузив заказы, обновляет список для всего приложения.
const EMPTY_ORDERED_LISTINGS = new Set();
const OrderedListingsContext = createContext(null);
const SetOrderedListingsContext = createContext(null);
// Всё, что нужно карточке машины для запроса актуальности: вошёл ли посетитель и как
// отправить запрос. Заказ заводит и запрос шлёт приложение — оно знает, работает ли
// кабинет на сервере или в браузере, карточке это знать незачем.
const EMPTY_AVAILABILITY = { signedIn:false, request:null };
const AvailabilityContext = createContext(EMPTY_AVAILABILITY);
const AuthContext = createContext({ user:null, backend:null });
// Заказ хранит полный идентификатор объявления, карточка — тоже, но в адресах живёт
// короткий номер. Сравниваем по номеру, как и избранное.
const orderedListingsFrom = (orders) => new Set((orders || []).map((order) => listingNumber(order?.listingId)).filter(Boolean));

// Три валюты показа: доллары, белорусские и российские рубли (₽ добавлен 29.09.2026).
const CURRENCIES = [["USD", "$"], ["BYN", "BYN"], ["RUB", "₽"]];
const toDisplayCurrency = (usd, currency) => (currency === "BYN" ? usdToByn(usd) : currency === "RUB" ? usdToRub(usd) : usd);
const money = (usd, currency) => (currency === "BYN" ? `${number(toDisplayCurrency(usd, currency))} BYN` : currency === "RUB" ? `${number(toDisplayCurrency(usd, currency))} ₽` : `$${number(usd)}`);

// Знак белорусского рубля (постановление Нацбанка № 25 от 27.01.2026, в силе с 04.02.2026):
// буква «Б» с горизонтальной чертой. В Юникоде знака пока нет, поэтому он рисуется
// стилем (.byn-sign в styles.css), а в строках — для адресов, заголовков и поисковика —
// остаётся «BYN». Проба Сергея 29.09.2026: как смотрится вместо букв.
const BynSign = () => <span className="byn-sign" role="img" aria-label="BYN">Б</span>;
// Текст с суммой, где «BYN» заменён знаком; строки без «BYN» возвращаются как есть.
const bynify = (value) => {
  if (typeof value !== "string" || !value.includes("BYN")) return value;
  // Пробел перед знаком — неразрывный: в строках-флексах (смета, цена карточки) обычный
  // пробел на конце текста пропадает, и цифры прилипают к знаку.
  const parts = value.split("BYN").map((part, index, all) => (index < all.length - 1 ? part.replace(/ $/, "\u00A0") : part));
  return parts.flatMap((part, index) => (index < parts.length - 1 ? [part, <BynSign key={index} />] : [part]));
};
// Знак «≈» перед суммой приглушён (.approx-sign): первой читается сама сумма.
// withApprox выделяет знак в строке вида «≈ $1 200», прочие значения отдаёт как есть.
const ApproxSign = () => <span className="approx-sign">≈</span>;
const withApprox = (value) => (typeof value === "string" && value.startsWith("≈ ") ? <><ApproxSign />{bynify(value.slice(1))}</> : bynify(value));

const ANY_YEAR_MIN = "Год от";
const ANY_YEAR_MAX = "До";
const ANY_PRICE_MIN = "Цена от";
const ANY_PRICE_MAX = "До";
const ANY_MILEAGE = "Пробег";
const ANY_CONDITION = "Состояние";
// Фильтр «Страна» (29.09.2026): значение в состоянии — название страны, в адресе и в
// запросе к каталогу — ключ страны (`country=korea`, см. src/origin.js).
const ANY_COUNTRY = "Все страны";
const countryKey = (label) => ACTIVE_ORIGINS.find((key) => countryName(key) === label) || null;
const countryLabel = (key) => (key ? countryName(key) : ANY_COUNTRY);
const carOrigin = (car) => car?.origin || originForSource(car?.source);
// Варианты фильтра — все страны, откуда возим, всегда (решение Сергея 29.09.2026): фильтр
// стоит в панели постоянно, даже пока корейских машин в каталоге нет.
const countryOptionsFor = () => [ANY_COUNTRY, ...ACTIVE_ORIGINS.map((key) => countryName(key))];
const ANY_OWNERS = "Владельцы";
const ANY_BATTERY = "Батарея";
const ANY_BODY_TYPE = "Все кузова";
const ANY_MODEL = "Все модели";
const ANY_COLOR = "Все цвета";
const ANY_ACCEL = "Разгон до";
const ANY_TIRE = "Размер шин";
const ANY_RANGE = "Запас хода";
const ANY_ENGINE = "Объём двигателя";
const ANY_POWER = "Мощность";
const ANY_GEARBOX = "Коробка";
const ANY_FUEL = "Топливо";
// Переключатель силовой установки. В карточке тип хранится в единственном числе
// («Электромобиль»), а на кнопке и в адресе страницы стоит множественное
// («Электромобили»), поэтому перевод между ними собран в двух местах, а не
// повторяется по файлу: раньше добавление типа требовало правки в семи точках.
// В базе бензиновые машины лежат под сокращением «ДВС», а покупателю показываем
// «Бензин»: сокращение он не набирает в поиске и не всегда понимает. Старую подпись
// принимаем по-прежнему — с ней остались ссылки на сайте и в закладках.
// «Бензин» и «Дизель» в этом списке — не отдельные типы машины, а машины с двигателем
// (тип «ДВС») плюс фильтр топлива: так дизели с корейского рынка выбираются одним
// пунктом, а в базе и адресах ничего нового не появляется. Бензин и дизель — разные
// вещи (решение Сергея 29.09.2026): «Бензин» — только бензиновые, «Дизель» — только
// дизельные; старые ссылки `type=Бензин` без топлива читаются как бензин.
const DIESEL_TAB = "Дизель";
const PETROL_TAB = "Бензин";
const POWERTRAIN_TABS = ["Все", "Электромобили", "Гибриды", "Бензин", DIESEL_TAB];
const typeLabel = (value) => (value === "Электромобиль" ? "Электромобили" : value === "Гибрид" ? "Гибриды" : value === "ДВС" ? "Бензин" : "Все");
const typeValue = (label) => (label === "Электромобили" ? "Электромобиль" : label === "Гибриды" ? "Гибрид" : label === "Бензин" || label === "ДВС" || label === DIESEL_TAB ? "ДВС" : "Все");
// Выбор пункта списка → тип машины и топливо; и обратно — какой пункт показать.
const tabSelection = (label) => (label === DIESEL_TAB ? { type: "ДВС", fuel: "Дизель" } : label === PETROL_TAB ? { type: "ДВС", fuel: "Бензин" } : { type: typeValue(label), fuel: ANY_FUEL });
const tabLabel = (type, fuel) => (type === "ДВС" && fuel === "Дизель" ? DIESEL_TAB : typeLabel(type));
// Тот же тип в карточке машины: там он стоит в единственном числе и рядом с пробегом.
const powertrainName = (value) => (value === "ДВС" ? "Бензин" : value);
// Кузов и модель выбираются списком, поэтому их значение хранится массивом.
// Пустой массив = «все»; строку принимаем ради старых ссылок и history.state.
const multiValues = (value, anyLabel) => (Array.isArray(value) ? value : [value]).filter((item) => item && item !== anyLabel);
const matchesMulti = (carValue, value, anyLabel) => {
  const list = multiValues(value, anyLabel);
  return !list.length || list.includes(carValue);
};
const appendMulti = (query, key, value, anyLabel) => {
  for (const item of multiValues(value, anyLabel)) query.append(key, item);
};
// Год тоже задаётся диапазоном; список идёт от свежих к старым, как привычно в каталоге.
const yearSteps = Array.from({ length: 7 }, (_, step) => String(2026 - step));
const yearMinOptions = [ANY_YEAR_MIN, ...yearSteps];
const yearMaxOptions = [ANY_YEAR_MAX, ...yearSteps];
const yearBound = (value, anyLabel) => (!value || value === anyLabel ? null : Number(value));
const yearLabel = (value, anyLabel) => (yearBound(value, anyLabel) === null ? anyLabel : value);
// Верхний список не показывает годы раньше выбранного «от», чтобы диапазон нельзя было вывернуть.
const yearMaxChoices = (yearMin) => {
  const min = yearBound(yearMin, ANY_YEAR_MIN);
  return min === null ? yearMaxOptions : yearMaxOptions.filter((item) => item === ANY_YEAR_MAX || Number(item) >= min);
};
const clampYearMax = (yearMin, yearMax) => {
  const min = yearBound(yearMin, ANY_YEAR_MIN);
  const max = yearBound(yearMax, ANY_YEAR_MAX);
  return min !== null && max !== null && max < min ? ANY_YEAR_MAX : yearMax;
};
const hasYearRange = (yearMin, yearMax) => yearBound(yearMin, ANY_YEAR_MIN) !== null || yearBound(yearMax, ANY_YEAR_MAX) !== null;
const matchesYears = (car, yearMin, yearMax) => matchesYearRange(car, yearBound(yearMin, ANY_YEAR_MIN), yearBound(yearMax, ANY_YEAR_MAX));
const appendYearRange = (query, yearMin, yearMax) => {
  const min = yearBound(yearMin, ANY_YEAR_MIN);
  const max = yearBound(yearMax, ANY_YEAR_MAX);
  if (min !== null) query.set("yearMin", String(min));
  if (max !== null) query.set("yearMax", String(max));
};
// Цена задаётся диапазоном: одна и та же лестница $5 000 от $15 000 до $100 000
// работает и нижней, и верхней границей, каждая независимо необязательна.
const priceSteps = Array.from({ length: 18 }, (_, step) => String(15000 + step * 5000));
const priceMinOptions = [ANY_PRICE_MIN, ...priceSteps];
const priceMaxOptions = [ANY_PRICE_MAX, ...priceSteps];
// Шаг сгущается там, где машин больше всего: три прежние ступени делили каталог
// только между 25% и 67%, а всё, что дальше 50 000 км, не разделялось вовсе.
// Подпись целиком лежит в ссылке `?mileage=`, поэтому разряды разделяет обычный
// пробел: с неразрывным старые ссылки перестали бы совпадать и сбрасывали фильтр.
const mileageOptions = [ANY_MILEAGE, ...[100000, 70000, 50000, 30000, 20000, 15000, 10000, 5000].map((value) => `до ${String(value).replace(/\B(?=(\d{3})+$)/g, " ")} км`)];
const batteryOptions = [ANY_BATTERY, ...[40, 60, 80, 100].map((value) => `От ${value} кВт·ч`)];
const batteryFloor = (value) => Number(String(value).replace(/\D/g, "")) || 0;
// Разгон и шины лежат в specifications каждой машины (перенесены из полной
// техкарты источника). Ступени подобраны по живому каталогу: медианный разгон 6,1 с,
// диски от R13 до R23 с горбом на R18–R20. Фильтр по моменту убран 24.08.2026:
// значение в базе остаётся и показывается в характеристиках, выбирать по нему нельзя.
const accelOptions = [ANY_ACCEL, ...[4, 5, 6, 7, 8].map((value) => `До ${value} с`)];
const tireOptions = [ANY_TIRE, ...[16, 17, 18, 19, 20, 21].map((value) => `От R${value}`)];
// Запас хода: у электромобиля берётся электрический, у гибрида — общий, как
// в карточке и в сортировке «с наибольшим запасом хода».
const rangeOptions = [ANY_RANGE, ...[300, 400, 500, 600, 700].map((value) => `От ${value} км`)];
// Бензиновые машины выбирают по мотору и коробке. Ступени объёма — по живому
// каталогу: половина машин уложилась в 1.4–2.0 литра. Объём и мощность хранятся
// подписью с границами, как пробег: умный поиск приносит и свои значения
// («гольф 1.4», «от 180 л.с.»), а не только ступеньки списка.
const engineOptions = [ANY_ENGINE, "до 1.6 л", "от 1.6 до 2 л", "от 2 до 3 л", "от 3 л"];
const powerOptions = [ANY_POWER, ...[150, 200, 250, 300].map((value) => `от ${value} л.с.`)];
const gearboxOptions = [ANY_GEARBOX, ...GEARBOX_TYPES];
// Топливо источник называет у каждой машины. Пока возим только бензиновые, поэтому
// выбирать не из чего — список появится сам, если в каталоге окажется второе топливо.
const fuelOptions = [ANY_FUEL, ...FUEL_TYPES];
// Умный поиск задаёт свои границы («разгон до 4.5 сек», «батарея от 70»), поэтому
// каталог принимает не только ступеньки списков, но и любую подпись такой же формы.
const FREE_ACCEL_LABEL = /^До \d+(?:\.\d+)? с$/;
const FREE_BATTERY_LABEL = /^От \d+ кВт·ч$/;
const FREE_RANGE_LABEL = /^От \d+ км$/;
const engineRangeBounds = (label) => (!label || label === ANY_ENGINE ? null : engineBounds(label));
const powerRangeBounds = (label) => (!label || label === ANY_POWER ? null : powerBounds(label));
const priceBound = (value, anyLabel) => (!value || value === anyLabel ? null : Number(value));
// Половинки узкие, а порядок и так читается по паре — префиксы «от»/«до» не печатаем.
const priceMinLabel = (value, currency) => (priceBound(value, ANY_PRICE_MIN) === null ? ANY_PRICE_MIN : money(Number(value), currency));
const priceMaxLabel = (value, currency) => (priceBound(value, ANY_PRICE_MAX) === null ? ANY_PRICE_MAX : money(Number(value), currency));
// Верхний список не показывает суммы ниже выбранного «от», чтобы диапазон нельзя было вывернуть.
const priceMaxChoices = (priceMin) => {
  const min = priceBound(priceMin, ANY_PRICE_MIN);
  return min === null ? priceMaxOptions : priceMaxOptions.filter((item) => item === ANY_PRICE_MAX || Number(item) >= min);
};
const clampPriceMax = (priceMin, priceMax) => {
  const min = priceBound(priceMin, ANY_PRICE_MIN);
  const max = priceBound(priceMax, ANY_PRICE_MAX);
  return min !== null && max !== null && max < min ? ANY_PRICE_MAX : priceMax;
};
const hasPriceRange = (priceMin, priceMax) => priceBound(priceMin, ANY_PRICE_MIN) !== null || priceBound(priceMax, ANY_PRICE_MAX) !== null;
const useCurrency = () => useContext(CurrencyContext);
const useQuotaPricing = () => useContext(QuotaPricingContext);
const useSetCurrency = () => useContext(SetCurrencyContext);

const displayValue = (value, fallback = "Не указано") => (value === null || value === undefined || value === "" ? fallback : value);
const translateCity = (value) => cityName(value) || displayValue(value);
const conditionLabels = {
  S: "Превосходное состояние",
  A: "Отличное состояние",
  B: "Хорошее состояние",
  C: "Удовлетворительное состояние",
  D: "Посредственное состояние",
};
const conditionGrades = Object.fromEntries(Object.entries(conditionLabels).map(([grade, label]) => [label, grade]));
const conditionOptions = [ANY_CONDITION, ...Object.values(conditionLabels)];
const translateCondition = (value) => conditionLabels[value] || displayValue(value, "Состояние не указано");

// Из подписи фильтра берём число; дробное тоже («До 3.5 с» — умный поиск умеет).
const filterNumber = (value) => Number(String(value).replace(/[^\d.]/g, "")) || 0;
const matchesPriceRange = (car, priceMin, priceMax) => {
  const total = estimateLandedCost(car).totalUsd;
  const min = priceBound(priceMin, ANY_PRICE_MIN);
  const max = priceBound(priceMax, ANY_PRICE_MAX);
  return (min === null || total >= min) && (max === null || total <= max);
};
const appendPriceRange = (query, priceMin, priceMax) => {
  const min = priceBound(priceMin, ANY_PRICE_MIN);
  const max = priceBound(priceMax, ANY_PRICE_MAX);
  if (min !== null) query.set("landedMin", String(min));
  if (max !== null) query.set("landedMax", String(max));
};
// Пробег хранится подписью («до 50 000 км», «от 10 000 до 50 000 км»): разбор
// границ один и тот же для запросов к серверу и локальной фильтрации.
const mileageRangeBounds = (label) => (!label || label === ANY_MILEAGE ? null : mileageBounds(label));
const matchesMileageRange = (car, label) => {
  const bounds = mileageRangeBounds(label);
  if (!bounds) return true;
  const mileage = Number(car.mileage) || 0;
  return (!bounds.min || mileage >= bounds.min) && (!bounds.max || mileage <= bounds.max);
};
const appendMileageRange = (query, label) => {
  const bounds = mileageRangeBounds(label);
  if (bounds?.min) query.set("mileageMin", String(bounds.min));
  if (bounds?.max) query.set("mileageMax", String(bounds.max));
};
const appendEngineRange = (query, label) => {
  const bounds = engineRangeBounds(label);
  if (bounds?.min) query.set("engineMin", String(bounds.min));
  if (bounds?.max) query.set("engineMax", String(bounds.max));
};
const appendPowerRange = (query, label) => {
  const bounds = powerRangeBounds(label);
  if (bounds?.min) query.set("powerMin", String(bounds.min));
  if (bounds?.max) query.set("powerMax", String(bounds.max));
};
const matchesAdvancedFilters = (car, { country = ANY_COUNTRY, drive, owners, battery = ANY_BATTERY, condition = ANY_CONDITION, accel = ANY_ACCEL, tire = ANY_TIRE, range = ANY_RANGE, engine = ANY_ENGINE, power = ANY_POWER, gearbox = ANY_GEARBOX, fuel = ANY_FUEL }) =>
  (country === ANY_COUNTRY || carOrigin(car) === countryKey(country)) &&
  (drive === ANY_DRIVE || car.drive === drive) &&
  (owners === ANY_OWNERS || Number(car.owners) <= filterNumber(owners)) &&
  (battery === ANY_BATTERY || Number(car.battery) >= batteryFloor(battery)) &&
  (condition === ANY_CONDITION || car.conditionGrade === conditionGrades[condition]) &&
  // Машину без значения фильтр отсеивает: Number(null) = 0 прошёл бы «до N с».
  (accel === ANY_ACCEL || (Number(car.acceleration) > 0 && Number(car.acceleration) <= filterNumber(accel))) &&
  (tire === ANY_TIRE || Number(car.tireRim) >= filterNumber(tire)) &&
  (range === ANY_RANGE || Number(car.electricRange || car.combinedRange || car.range) >= filterNumber(range)) &&
  matchesEngineBounds(car, engineRangeBounds(engine)) &&
  matchesPowerBounds(car, powerRangeBounds(power)) &&
  (gearbox === ANY_GEARBOX || gearboxType(car) === gearbox) &&
  (fuel === ANY_FUEL || fuelType(car) === fuel);
// Исключения: «зикр кроме 001», «электро кроме белых». Каждая величина живёт
// отдельным списком — в ссылке и в запросе к серверу это парные «…Not»-параметры.
// Цвет стоит особняком: в подписях он русский, в базе — английский.
const EXCLUDE_FIELDS = [
  { key:"excludeBrand", param:"brandNot", valueOf:(car) => car.brand },
  { key:"excludeModel", param:"modelNot", valueOf:(car) => car.model },
  { key:"excludeBodyType", param:"bodyTypeNot", valueOf:(car) => car.bodyType },
  { key:"excludeType", param:"typeNot", valueOf:(car) => car.type },
  { key:"excludeDrive", param:"driveNot", valueOf:(car) => car.drive },
];
const EXCLUDE_KEYS = [...EXCLUDE_FIELDS.map((item) => item.key), "excludeColor"];
const emptyExclusions = () => Object.fromEntries(EXCLUDE_KEYS.map((key) => [key, []]));
const exclusionValues = (filters, key) => (Array.isArray(filters?.[key]) ? filters[key] : []).filter(Boolean);
const hasExclusions = (filters) => EXCLUDE_KEYS.some((key) => exclusionValues(filters, key).length > 0);
const matchesExclusions = (car, filters = {}) =>
  EXCLUDE_FIELDS.every(({ key, valueOf }) => !exclusionValues(filters, key).includes(valueOf(car))) &&
  !(exclusionValues(filters, "excludeColor").length > 0 && matchesColorLabels(car.bodyColor, exclusionValues(filters, "excludeColor")));
// В ссылку каталога цвета уходят русскими подписями, в API — английскими значениями.
const appendExclusions = (query, filters, { api = false } = {}) => {
  EXCLUDE_FIELDS.forEach(({ key, param }) => exclusionValues(filters, key).forEach((value) => query.append(param, value)));
  const colors = exclusionValues(filters, "excludeColor");
  (api ? colorValuesForLabels(colors) : colors).forEach((value) => query.append("colorNot", value));
};
const exclusionsFromParams = (params) => ({
  excludeBrand: params.getAll("brandNot").filter(Boolean).slice(0, 12),
  excludeModel: params.getAll("modelNot").filter(Boolean).slice(0, 24),
  excludeBodyType: BODY_TYPES.filter((item) => params.getAll("bodyTypeNot").includes(item)),
  excludeType: ["Электромобиль", "Гибрид", "ДВС"].filter((item) => params.getAll("typeNot").includes(item)),
  excludeDrive: DRIVE_TYPES.filter((item) => params.getAll("driveNot").includes(item)),
  excludeColor: COLOR_LABELS.filter((item) => params.getAll("colorNot").includes(item)),
});
const ownerOptions = [ANY_OWNERS, "1 владелец", "До 2 владельцев"];
// Сеед перемешивания уходит в адрес запроса каталога. Полностью случайный делал адрес
// уникальным для каждого посетителя, поэтому общий кэш по нему не срабатывал никогда.
// Дюжины вариантов достаточно, чтобы выдача не выглядела одинаковой у всех, и при этом
// адреса повторяются — ответ отдаётся из кэша, а не собирается в базе заново.
const CATALOG_SHUFFLE_SEEDS = 12;
const randomShuffleSeed = () => `s${Math.floor(Math.random() * CATALOG_SHUFFLE_SEEDS)}`;
const photoOptions = import.meta.env.BASE_URL === "/" ? undefined : { mirrorOrigin: "https://abcars.by" };
const imageSource = (source, width) => vehiclePhotoHref(source, width, photoOptions);
// Ширины под места, где показываем фото: с запасом для экранов с двойной плотностью.
// Большое фото в карточке машины и в галерее просит настоящий оригинал — см.
// IMAGE_ORIGINAL ниже.
// Кадр карточки на широком экране занимает 250 точек, лента фото на телефоне — около
// 250: просить 800 значило качать снимок в четыре раза крупнее, чем он показан. На
// главной это была ровно половина её веса — 68 фотографий вместо 1,4 МБ дают 0,4 МБ.
const IMAGE_WIDTH_CARD = 600;
// Превью каталога на всех экранах — 600px: один файл для телефона и компьютера.
// Один адрес с плиткой и облегчённым кадром галереи: копия уже в кэше.
const IMAGE_WIDTH_STRIP = IMAGE_WIDTH_CARD;

// Особая «ширина» для больших фото: настоящий оригинал снимка. Хранилище отдаёт его
// по тому же адресу без части «1400x0_c42_» перед именем файла, и это не просто более
// широкий кадр — версия с кодом c42 сжата вдвое сильнее (0,06 байта на пиксель против
// 0,12 у оригинала) и вдобавок подрезана. Замер 28.08.2026 на 12 снимках: у половины
// объявлений исходник всего 1024 точки, у остальных 1601–2016, средний вес оригинала
// 70,7 КБ против 55 КБ у кадра 1400x0_c42. Дороже на четверть, а разрешение и чистота
// заметно выше — для снимка, показанного во всю ширину галереи, это того стоит.
const IMAGE_ORIGINAL = "original";

// Запасной размер тоже отдаёт наш сервер, включая статьи с srcset.
const retryWithFullImage = (event, source) => retryVehiclePhoto(event.currentTarget, source, photoOptions);

function normalizeImportedCar(car) {
  const description = car.description || "";
  const legacyScore = Number(car.appearanceScore);
  const appearanceScore = legacyScore > 100 ? Number(String(legacyScore).slice(0, 2)) : legacyScore || null;
  const model = car.brand === "Honda" ? canonicalImportModel(car.brand, car.model, car) : car.brand === "Deepal" ? String(car.model).replace(/^深蓝/, "") : car.brand === "Voyah" ? String(car.model).replace(/^岚图/, "") : car.model;
  const electricRange = car.electricRange ?? (Number(description.match(/纯电续航\s*(\d+)/)?.[1]) || null);
  const combinedRange = car.combinedRange ?? (Number(description.match(/综合续航\s*(\d+)/)?.[1]) || null);
  const batteryHealth = car.batteryHealth ?? (Number(description.match(/电池健康度\s*(\d+)%/)?.[1]) || null);
  return {
    ...car,
    model,
    title: carTitle(car.brand, model, car.year),
    bodyType: normalizeBodyType({ ...car, model }),
    drive: normalizeDrive(car.drive),
    appearanceScore,
    electricRange,
    combinedRange,
    batteryHealth,
    range: car.range || electricRange || combinedRange,
    checkedAt: car.checkedAt || car.importedAt,
  };
}

const pluralRu = (count, one, few, many) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
};

// Начало суток по Минску — одинаково у сервера (UTC) и браузера (любой пояс), см. minskClock.
const startOfDayMs = (value) => {
  const date = minskClock(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

// «сегодня» / «вчера» / «5 дней назад», а для давних дат — число и месяц:
// «143 дня назад» посетителю ничего не говорит, «18 августа» — говорит.
// До какого возраста считать «давним», решает место: в датах карточки это месяц,
// в подсказке у стрелки цены — неделя.
function formatDayAgo(value, recentDays = 30) {
  const at = new Date(value || "");
  if (!Number.isFinite(at.getTime())) return null;
  const now = new Date();
  const days = Math.round((startOfDayMs(now) - startOfDayMs(at)) / 86400000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days <= recentDays) return `${days} ${pluralRu(days, "день", "дня", "дней")} назад`;
  const date = formatChangeDate(at);
  const year = minskClock(at).getUTCFullYear();
  return year === minskClock(now).getUTCFullYear() ? date : `${date} ${year}`;
}

// Safari отменяет history.replaceState/pushState чаще ~100 раз за 30 секунд
// (Firefox — 200 за 10), и дальше запись истории молча остаётся без state: назад
// жестом или кнопкой браузера открывает каталог без фильтров и без позиции.
// Поэтому историю пишем редко, всегда через try/catch, а вторую копию снимка
// держим в sessionStorage.
const historyWriteInterval = 1000;
const patchHistoryState = (patch) => {
  try {
    window.history.replaceState({ ...window.history.state, ...patch }, "");
    return true;
  } catch {
    return false;
  }
};
const replaceHistoryEntry = (state, url) => {
  try {
    window.history.replaceState(state, "", url);
    return true;
  } catch {
    return false;
  }
};
const pushHistoryEntry = (state, url) => {
  try {
    window.history.pushState(state, "", url);
    return true;
  } catch {
    // Запись создать не дали — уходим обычным переходом, иначе адрес разойдётся
    // с тем, что показано на экране. Снимок каталога поднимется из sessionStorage.
    window.location.assign(url);
    return false;
  }
};
// Снимок относится к этому же экрану каталога, только если совпадает поисковая строка.
// Сохранённое состояние каталога подходит только той же странице: у разделов каталога
// («/catalog/byd», «/catalog/suv») своих параметров в адресе нет, и сравнения одних
// параметров было недостаточно — раздел подхватывал фильтры соседнего.
const matchingCatalogReturn = () => {
  const stored = readCatalogReturn();
  return stored && stored.path === currentAppPath() && stored.search === window.location.search ? stored : null;
};

function useRoute(user) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const appPath = (pathname) => {
    const unbased = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
    return unbased.length > 1 ? unbased.replace(/\/+$/, "") : unbased;
  };
  const [route, setRoute] = useState({
    path: appPath(window.location.pathname),
    restoreY: null,
    restoreAnchor: null,
    restoreOffset: 0,
    key: 0,
  });
  const scrollSaveTimer = useRef(null);
  const lastScrollSave = useRef(0);
  const restoringScroll = useRef(false);
  const dropScrollSave = () => {
    if (scrollSaveTimer.current === null) return;
    window.clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = null;
  };
  const saveScrollNow = () => {
    dropScrollSave();
    lastScrollSave.current = Date.now();
    patchHistoryState({ scrollY: window.scrollY });
    // sessionStorage частотой не ограничен, поэтому позиция каталога всегда свежая.
    if (isCatalogPath(appPath(window.location.pathname))) saveCatalogReturnScroll(window.scrollY, appPath(window.location.pathname), window.location.search);
  };
  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    // Не чаще одной записи в секунду: на каждый кадр прокрутки браузер перестаёт
    // сохранять state вообще, вместе с фильтрами каталога.
    const onScroll = () => {
      // Пока идёт доводка возврата, прокрутка — наша, а не пользователя: её
      // промежуточные значения не должны затирать сохранённую позицию.
      if (restoringScroll.current || scrollSaveTimer.current !== null) return;
      scrollSaveTimer.current = window.setTimeout(saveScrollNow, Math.max(0, historyWriteInterval - (Date.now() - lastScrollSave.current)));
    };
    const onHide = () => {
      if (scrollSaveTimer.current !== null) saveScrollNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    const onPop = (event) => {
      // Отложенная запись относилась к прежней записи истории: выполнить её сейчас
      // значит подставить текущую прокрутку в ту, куда мы только что вернулись.
      dropScrollSave();
      const path = appPath(window.location.pathname);
      const state = event.state || window.history.state || {};
      const stored = (state.catalog || !isCatalogPath(path)) ? null : matchingCatalogReturn();
      const source = stored || state;
      setRoute((current) => ({
        path,
        restoreY: Number(source.scrollY) || 0,
        restoreAnchor: source.scrollAnchor || null,
        restoreOffset: Number(source.scrollAnchorOffset) || 0,
        key: current.key + 1,
      }));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPop);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      dropScrollSave();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    if (route.restoreY === null) return;
    const { restoreY: target, restoreAnchor, restoreOffset } = route;
    const deadline = Date.now() + 4000;
    let timer = null;
    let cancelled = false;
    let coarseDone = false;
    let stable = 0;
    restoringScroll.current = true;
    const stop = () => {
      cancelled = true;
      restoringScroll.current = false;
      if (timer) window.clearTimeout(timer);
    };
    // Сохранённый scrollY — только грубая оценка: выдача догружается и
    // достраивается асинхронно, поэтому одного прыжка мало. Как только карточка,
    // с которой ушли, появилась в DOM, держим её на той же высоте экрана, пока
    // раскладка не перестанет меняться.
    // Прокрутка всегда instant: behavior "auto" берёт smooth из CSS и уезжает
    // вниз анимацией вместо мгновенного возврата.
    const restore = () => {
      if (cancelled) return;
      const anchor = restoreAnchor ? document.querySelector(restoreAnchor) : null;
      if (anchor) {
        const top = Math.max(0, Math.round(anchor.getBoundingClientRect().top + window.scrollY - restoreOffset));
        stable = Math.abs(top - window.scrollY) <= 1 ? stable + 1 : 0;
        if (!stable) window.scrollTo({ top, behavior: "instant" });
        if (stable >= 3 || Date.now() >= deadline) {
          restoringScroll.current = false;
          return;
        }
        timer = window.setTimeout(restore, 100);
        return;
      }
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const expired = Date.now() >= deadline;
      if (!coarseDone && (maxScroll >= target || expired)) {
        window.scrollTo({ top: Math.min(target, maxScroll), behavior: "instant" });
        coarseDone = true;
      }
      if (expired || (coarseDone && !restoreAnchor)) {
        restoringScroll.current = false;
        return;
      }
      timer = window.setTimeout(restore, 50);
    };
    timer = window.setTimeout(restore, 0);
    // Взялся за прокрутку сам — доводку прекращаем. Жест «назад» на трекпаде —
    // это тоже wheel, и его инерция прилетает уже после popstate, поэтому ждём
    // явного вертикального движения и не слушаем первые мгновения после перехода.
    const grace = Date.now() + 300;
    const handOver = (event) => {
      if (event.type === "wheel" && (Date.now() < grace || Math.abs(event.deltaY) < 4)) return;
      stop();
    };
    const handOverEvents = ["wheel", "touchstart", "keydown"];
    for (const name of handOverEvents) window.addEventListener(name, handOver, { passive: true });
    return () => {
      stop();
      for (const name of handOverEvents) window.removeEventListener(name, handOver);
    };
  }, [route.key, route.restoreY, route.restoreAnchor, route.restoreOffset]);
  // Переход на страницу каталога ждёт справочник её фильтров (не дольше
  // CATALOG_META_WAIT_MS): тогда новая страница сразу рисуется с рядом моделей марки,
  // а не получает его через мгновение — ряд в несколько строк сдвигал вниз всю выдачу
  // (жалоба Сергея 25.09.2026: «микролаги» при переходах между марками). Прежняя
  // страница остаётся на экране эти доли секунды. Два быстрых перехода подряд —
  // выполняется последний.
  const navigationTurn = useRef(0);
  const navigate = useCallback((next, options = {}) => {
    const turn = ++navigationTurn.current;
    const query = typeof next === "string" ? catalogMetaQueryForPath(next) : null;
    if (query === null || resolvedCatalogMeta(query)) {
      navigateNow(next, options);
      return;
    }
    const go = () => {
      if (navigationTurn.current === turn) navigateNow(next, options);
    };
    Promise.race([requestCatalogMeta(query), new Promise((resolve) => setTimeout(resolve, CATALOG_META_WAIT_MS))]).then(go, go);
  }, [user]);
  const navigateNow = (next, { replace = false, preserveScroll = false, preserveCatalog = false, catalogState = null } = {}) => {
    if (next === -1) {
      window.history.back();
      return;
    }
    const target = new URL(next, window.location.origin);
    // Обзор мог переехать на новый адрес вместе с переименованием модели. Внутри сайта
    // все ссылки уже новые, но старая могла остаться в закладках или чужом письме —
    // тогда сервер отдаёт переброс сам, а здесь подстраховка для перехода внутри сайта.
    const movedModel = target.pathname.startsWith("/models/")
      ? modelPageRedirect(target.pathname.slice("/models/".length))
      : null;
    if (movedModel && movedModel !== target.pathname) {
      navigateNow(movedModel, { replace: true, preserveScroll, preserveCatalog, catalogState });
      return;
    }
    const currentPath = appPath(window.location.pathname);
    const targetPath = appPath(target.pathname);
    const keepScrollPosition = preserveScroll || preservesAuthScroll(targetPath, user);
    const targetUrl = `${basePath}${target.pathname}${target.search}${target.hash}`;
    dropScrollSave();
    if (replace) {
      const currentIsAuthRoute = isAuthEntryPath(currentPath);
      replaceHistoryEntry(
        {
          ...window.history.state,
          fromPath: currentIsAuthRoute ? window.history.state?.fromPath || "/" : currentPath,
          scrollY: window.scrollY,
          // Замена адреса тоже умеет переносить снимок каталога: на нём держится
          // переход между разделами при смене фильтра — фильтры и сортировка
          // переезжают на новый адрес, а не сбрасываются к тем, что задаёт раздел.
          ...(catalogState ? { catalog: catalogState.catalog, scrollAnchor: catalogState.scrollAnchor || null, scrollAnchorOffset: Number(catalogState.scrollAnchorOffset) || 0 } : {}),
        },
        targetUrl,
      );
    } else {
      patchHistoryState({ scrollY: window.scrollY });
      // Свежий заход в каталог (меню, ссылка с главной) — не возврат: прошлый
      // снимок фильтров к этому экрану уже не относится.
      if (isCatalogPath(targetPath) && !catalogState) clearCatalogReturn();
      pushHistoryEntry(
        {
          fromPath: currentPath,
          scrollY: catalogState ? Number(catalogState.scrollY) || 0 : keepScrollPosition ? window.scrollY : 0,
          ...(catalogState
            ? { catalog: catalogState.catalog, scrollAnchor: catalogState.scrollAnchor || null, scrollAnchorOffset: Number(catalogState.scrollAnchorOffset) || 0 }
            : {}),
        },
        targetUrl,
      );
    }
    // Mark only the committed navigation, after the metadata wait. Background
    // renders while waiting must not consume a filter transition.
    catalogFilterMoveTarget = preserveCatalog ? targetPath : null;
    setRoute((current) => ({
      path: targetPath,
      restoreY: catalogState ? Number(catalogState.scrollY) || 0 : null,
      restoreAnchor: catalogState?.scrollAnchor || null,
      restoreOffset: Number(catalogState?.scrollAnchorOffset) || 0,
      key: current.key + 1,
    }));
    if (!keepScrollPosition && !catalogState) window.scrollTo({ top: 0, behavior: "instant" });
  };
  // Шаг назад по истории отдаёт и фильтры, и позицию карточки. Если в каталог
  // пришли не оттуда (прямая ссылка, переход через похожую машину), поднимаем
  // состояние сами — но только когда уходили из каталога именно в эту карточку,
  // иначе показали бы фильтры от какого-то прошлого поиска.
  const backToCatalog = (carId = null) => {
    if (isCatalogPath(window.history.state?.fromPath || "")) {
      navigate(-1);
      return;
    }
    const stored = readCatalogReturn();
    if (stored && carId && stored.openedCarId === carId) {
      navigate(`/catalog${stored.search || ""}`, { catalogState: stored });
      return;
    }
    navigate("/catalog");
  };
  return { path: route.path, navigate, backToCatalog };
}

// Страницы марок, типов двигателя и кузова — это тот же каталог с выставленным фильтром,
// поэтому всё, что каталог делает со своим адресом (сохраняет прокрутку, помнит фильтры
// при возврате из карточки, подсвечивает пункт меню), должно работать и на них.
const isCatalogPath = (path) => path === "/catalog" || Boolean(findCatalogLanding(path)) || Boolean(parseModelLandingPath(path));

// Адрес текущей страницы в том же виде, в каком его хранят маршруты: без базового
// префикса сборки и без косой черты на конце.
const currentAppPath = () => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pathname = window.location.pathname;
  const unbased = base && pathname.startsWith(base) ? pathname.slice(base.length) || "/" : pathname;
  return unbased.length > 1 ? unbased.replace(/\/+$/, "") : unbased;
};

function AppLink({ href, navigate, onClick, children, ...props }) {
  const handleClick = (event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  // Ссылка в каталог: справочник раздела начинаем грузить уже при наведении.
  const prefetch = String(href || "").startsWith("/catalog") ? () => prefetchCatalogMeta(href) : undefined;
  return <a href={appHref(href)} onClick={handleClick} onPointerEnter={prefetch} onTouchStart={prefetch} onFocus={prefetch} {...props}>{children}</a>;
}

// Внешние ссылки по умолчанию не передают поисковый вес. `follow` разрешён только
// для редкого явного исключения, согласованного владельцем сайта.
const EXTERNAL_LINK_REL = "nofollow noopener noreferrer";
function ExternalLink({ href, follow = false, children, ...props }) {
  return <a {...props} href={href} target="_blank" rel={follow ? "noopener noreferrer" : EXTERNAL_LINK_REL}>{children}</a>;
}

// Абзацы обзоров изредка ссылаются со середины текста на соседний раздел каталога —
// разбор ссылок общий с сервером, см. src/inline-links.js.
function renderInlineText(text, navigate) {
  return splitInlineLinks(text).map((part, index) =>
    typeof part === "string" ? (
      part
    ) : part.external ? (
      // Первоисточник: чужой сайт открываем в новой вкладке, статья остаётся на месте.
      // `nofollow` — не передаём вес чужому сайту, `noreferrer` заодно скрывает,
      // с какой страницы пришли.
      <ExternalLink className="article-inline-link" key={`link-${index}`} href={part.href}>
        {part.label}
      </ExternalLink>
    ) : (
      <AppLink className="article-inline-link" key={`link-${index}`} href={part.href} navigate={navigate}>
        {part.label}
      </AppLink>
    ),
  );
}

// Ярлык новой машины. Показывается только у карточек, попавших в каталог за
// последние дни (см. src/listing-age.js), и говорит, сколько дней назад это было.
// В карточках каталога он лежит поверх фотографии, в свободном углу: в списке —
// сверху справа, в плитке — снизу справа.
function NewListingBadge({ car, className }) {
  if (!isNewListing(car)) return null;
  // Дни считаем тем же способом, что и строка дат в открытой карточке (по датам,
  // а не по суткам от момента до момента), иначе в списке и в карточке у одной
  // машины стояли разные числа.
  const added = formatDayAgo(getListingAddedAt(car));
  if (!added) return null;
  // В плашке остаётся только «3 дня назад»: слово «Добавлено» съедало половину
  // кадра, а смысл понятен и без него.
  return (
    <span className={`new-listing-badge${className ? ` ${className}` : ""}`}>
      {added}
    </span>
  );
}

// Стрелка изменения цены: вверх красная, вниз зелёная. По наведению — дата
// переоценки, прежняя цена и разница в процентах и деньгах. Старая цена
// пересчитывается тем же расчётом, что и текущая, поэтому в подсказке обе суммы
// в выбранной валюте и с учётом переключателя квот.
function PriceChangeMark({ car }) {
  const currency = useCurrency();
  const change = getPriceChange(car);
  if (!change) return null;
  // Свежую переоценку понятнее считать днями («3 дня назад»), а всё, что старше
  // недели, — датой: «9 дней назад» уже приходится переводить в число самому.
  const date = formatDayAgo(change.changedAt, 6);
  const was = money(change.previousTotalUsd, currency);
  const percent = formatChangePercent(change.previousTotalUsd, change.currentTotalUsd);
  const gap = Number.isFinite(change.currentTotalUsd) ? Math.abs(change.currentTotalUsd - change.previousTotalUsd) : null;
  // Сначала деньги, процент — в скобках; знак у обоих один: «−20 500 BYN (−6%)».
  const sign = change.direction === "up" ? "+" : "−";
  const shift = percent && gap ? `${sign}${money(gap, currency)} (${percent})` : percent;
  // Вторая строка подсказки — одной фразой: «2 дня назад было 116 100 BYN».
  const before = date ? `${date} было ${was}` : `Было ${was}`;
  const hint = ["Цена изменилась", shift, before].filter(Boolean).join(" · ");
  const tooltip = (
    <>
      {shift && <b className={`price-change-shift price-change-${change.direction}`}>{shift}</b>}
      <i>{before.charAt(0).toUpperCase() + before.slice(1)}</i>
    </>
  );
  return (
    <span className={`price-change-mark price-change-${change.direction}`} role="img" aria-label={hint} tabIndex="0">
      {change.direction === "up" ? <ArrowUp weight="bold" /> : <ArrowDown weight="bold" />}
      <ActionTooltip className="price-change-tooltip" text={tooltip} tapToOpen />
    </span>
  );
}

// Итог «под ключ» со стрелкой переоценки — одной строкой.
//
// Длинная цена в рублях («≈ 1 521 400 BYN») вместе с кружком стрелки в строку не
// влезала, и стрелка съезжала под цену. По длине надписи этого не угадать: места
// разной ширины (каталог, карточка заказа, телефон), а в карточке заказа рядом стоит
// ещё и переключатель валюты. Поэтому смотрим на уже нарисованную строку: если она
// разъехалась на две — или, там где переносы запрещены, вылезла за край, — уменьшаем
// кегль ступенью и смотрим снова. Множитель кладём в переменную: на сколько это точек,
// решают стили того места, где цена нарисована.

function TotalPrice({ car, price, currency, className = "", approximate = true, compactApproximation = false }) {
  const boxRef = useRef(null);
  const lineRef = useRef(null);
  const text = `${approximate ? "≈ " : ""}${money(price.totalUsd, currency)}`;
  useLayoutEffect(() => {
    const box = boxRef.current;
    const line = lineRef.current;
    if (!box || !line) return undefined;
    // Все цены измеряются вместе перед следующим кадром: записи размеров
    // одной карточки больше не заставляют пересчитывать остальные по очереди.
    let cancelFit;
    const fit = () => { cancelFit?.(); cancelFit = schedulePriceFit(box, line); };
    fit();
    if (typeof ResizeObserver === "undefined") return () => cancelFit?.();
    // Место под цену меняется при повороте телефона и при перетаскивании окна.
    // Ширину запоминаем: без этого пересчёт, меняющий кегль, мог бы вызвать сам себя.
    let known = box.parentElement?.clientWidth ?? 0;
    const observer = new ResizeObserver(() => {
      const width = box.parentElement?.clientWidth ?? 0;
      if (width === known) return;
      known = width;
      fit();
    });
    if (box.parentElement) observer.observe(box.parentElement);
    return () => { observer.disconnect(); cancelFit?.(); };
  }, [text]);
  return (
    <strong ref={boxRef} className={className || undefined}>
      {/* Обёртка нужна только для замера: у блочного `strong` ширина всегда во всю
          колонку, а перенос виден лишь по строчному элементу вокруг самой надписи.
          Класс на ней — чтобы правила вида «любой span внутри цены — серый и мелкий»
          (а такие есть и в строке каталога, и в карточке на главной) не покрасили
          саму цену: см. .price-line в стилях. */}
      <span ref={lineRef} className="price-line">{approximate && compactApproximation ? <><span className="price-approximation">≈</span>{" "}{bynify(money(price.totalUsd, currency))}</> : withApprox(text)}<PriceChangeMark car={car} /></span>
    </strong>
  );
}

// Карточка должна вести себя как ссылка целиком: правый клик по любому её месту
// открывает системное меню ссылки, а не картинки, а средняя кнопка и ⌘-клик уводят
// в новую вкладку силами браузера. Обычный клик отдаём обработчику карточки — он
// успевает запомнить позицию возврата в каталог. Заголовок карточки и так ссылка,
// поэтому подложку убираем и с клавиатуры, и из скринридеров, чтобы не дублировать.
function CardLinkOverlay({ car, open }) {
  return <AppLink className="card-link-overlay" href={carHref(car)} navigate={open} onClick={(event) => event.stopPropagation()} tabIndex={-1} aria-hidden="true" />;
}

function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let frame = null;
    const updateVisibility = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        setVisible(window.scrollY > 360);
        frame = null;
      });
    };
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateVisibility);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);
  const scrollToTop = () => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };
  return (
    <button
      type="button"
      className={`mobile-scroll-top${visible ? " is-visible" : ""}`}
      aria-label="Наверх"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={scrollToTop}
    >
      <ArrowUp size={22} weight="bold" />
    </button>
  );
}

const routeSeo = {
  "/": [HOME_SEO.title, HOME_SEO.description],
  "/catalog": [CATALOG_INDEX_SEO.title, CATALOG_INDEX_SEO.description],
  // Пять инфостраниц — из src/info-pages-seo.js: те же записи читает сборка
  // поисковых копий, чтобы заголовки не расходились.
  ...Object.fromEntries(Object.entries(INFO_PAGES_SEO).map(([key, page]) => [`/${key}`, [page.title, page.description]])),
  "/privacy": ["Политика конфиденциальности | abcars.by", "Политика обработки и защиты персональных данных пользователей сайта abcars.by."],
};
// Страницы моделей описаны в model-pages.js; их заголовки попадают в ту же карту,
// чтобы SEO-механика работала для них без отдельной ветки.
routeSeo[MODELS_INDEX.path] = [MODELS_INDEX.seoTitle, MODELS_INDEX.seoDescription];
// Описания обзоров (`seoDescription`) в браузерную сборку не попадают: 449 описаний —
// это 58 КБ, которые скачивал каждый посетитель, а нужны они только там, где страницу
// собирает сервер (scripts/vite-trim-model-pages.mjs). Поэтому у страниц обзоров здесь
// стоит заголовок и `null` вместо описания: описание уже лежит в полученной от сервера
// странице, и его достаточно не трогать.
for (const modelPage of MODEL_PAGES) routeSeo[modelPage.path] = [modelPage.seoTitle, null];
for (const tool of TOOL_PAGES) routeSeo[tool.path] = [tool.seoTitle, tool.seoDescription];
// Журнал попадает в эту карту только вместе с выключателем: пока раздел выключен,
// у его адресов нет ни заголовка, ни разрешения на индексацию — как у несуществующей
// страницы, которой он для посетителя и является.
if (BLOG_ENABLED) {
  routeSeo[BLOG_INDEX.path] = [BLOG_INDEX.seoTitle, BLOG_INDEX.seoDescription];
  // Черновики тоже: страница у них есть, и заголовок вкладки должен быть свой.
  // Без этого черновик показывался с заголовком «Страница не найдена», хотя
  // содержимое рисовалось целиком — и та же ошибка ждала бы статью в день выпуска.
  for (const post of blogAllPosts()) routeSeo[post.path] = [post.seoTitle, post.seoDescription];
}

const privateRouteSeo = {
  "/favorites": ["Избранные автомобили | abcars.by", "Сохранённые автомобили в вашем личном кабинете abcars.by."],
  "/searches": ["Мои поиски | abcars.by", "Сохранённые поиски автомобилей в вашем личном кабинете abcars.by."],
  "/login": ["Вход в личный кабинет | abcars.by", "Вход в личный кабинет клиента abcars.by."],
  "/register": ["Регистрация личного кабинета | abcars.by", "Создание личного кабинета клиента abcars.by."],
  "/account": ["Личный кабинет | abcars.by", "Заказы, избранные автомобили и личные данные клиента abcars.by."],
  // Закрытый раздел статистики. Без своей строки заголовок вкладки брался из
  // запасного варианта — «Страница не найдена», — хотя раздел открывался
  // нормально. Из поиска он всё равно закрыт: ниже все эти адреса помечаются
  // «не индексировать».
  "/analytics": ["Аналитика | abcars.by", "Закрытый раздел статистики и заявок abcars.by."],
};

// Заголовок вкладки, описание, запрет индексации и адрес-первоисточник — одним
// вызовом. Общий для ClientSeo и страниц, которые задают эти поля сами
// (каталожная страница модели: у неё заголовок из живых цифр).
function applyPageHead({ title, description, canonical, indexable }) {
  const ensureMeta = (selector, attribute, value) => {
    let element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement("meta");
      const [key, name] = selector.includes("property=") ? ["property", selector.match(/property="([^"]+)/)?.[1]] : ["name", selector.match(/name="([^"]+)/)?.[1]];
      element.setAttribute(key, name);
      document.head.appendChild(element);
    }
    element.setAttribute(attribute, value);
  };
  document.title = title;
  // `null` означает «описание уже стоит в странице, менять нечем».
  if (description) ensureMeta('meta[name="description"]', "content", description);
  ensureMeta('meta[name="robots"]', "content", indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow, noarchive");
  ensureMeta('meta[property="og:title"]', "content", title);
  if (description) ensureMeta('meta[property="og:description"]', "content", description);
  ensureMeta('meta[property="og:url"]', "content", canonical);
  ensureMeta('meta[name="twitter:title"]', "content", title);
  if (description) ensureMeta('meta[name="twitter:description"]', "content", description);
  let canonicalLink = document.head.querySelector('link[rel="canonical"]');
  if (!canonicalLink) {
    canonicalLink = document.createElement("link");
    canonicalLink.rel = "canonical";
    document.head.appendChild(canonicalLink);
  }
  canonicalLink.href = canonical;
}

function ClientSeo({ path, car, landing, carPending = false }) {
  // Страница списка раздела («?page=2») — свой первоисточник и свой заголовок, как
  // отдаёт сервер; номер читаем при каждой отрисовке, а не только при смене пути.
  const listPageRaw = isCatalogPath(path) ? String(new URLSearchParams(window.location.search).get("page") || "") : "";
  const listPage = /^[1-9]\d{0,4}$/.test(listPageRaw) && listPageRaw !== "1" ? Number(listPageRaw) : 0;
  useEffect(() => {
    // Сервер уже поставил заголовок, описание и адрес-первоисточник для этого адреса —
    // с живыми цифрами, которых у приложения нет. Не переписываем их, пока человек на
    // этом адресе; ушёл внутри сайта — метку снимаем, дальше заголовки ставит приложение.
    const serverPath = document.documentElement.dataset.seoPath;
    if (serverPath) {
      if (serverPath === `${path.replace(/\/+$/, "") || "/"}${listPage ? `?page=${listPage}` : ""}`) return;
      delete document.documentElement.dataset.seoPath;
    }
    // Машина ещё грузится — заголовок «Страница не найдена» ставить рано.
    if (carPending && !car) return;
    const privatePage = ["/favorites", "/searches", "/login", "/register", "/account", "/analytics"].includes(path) || path.startsWith("/orders/");
    const detailTitle = car?.title || (car ? carTitle(car.brand, car.model, car.year) : null);
    // Заголовок и описание страницы марки, типа двигателя или кузова лежат в её
    // описании (src/catalog-landings.js) — там же, откуда их берёт сервер, когда
    // собирает эту страницу для поисковика. Иначе два места писали бы по-разному.
    const landingSeo = landing ? [landing.seoTitle, landing.seoDescription] : null;
    const [baseTitle, baseDescription] = detailTitle
      ? [carPageTitle(car), `${detailTitle} ${fromPhrase(carOrigin(car))}: пробег ${number(car.mileage)} км, ${String(car.type || "автомобиль").toLowerCase()}. Проверка и предварительный расчёт цены с доставкой до Минска.`]
      : landingSeo || privateRouteSeo[path] || (path.startsWith("/orders/") ? ["Заказ автомобиля | abcars.by", "Оформление и статус заказа автомобиля в личном кабинете abcars.by."] : null) || routeSeo[path] || ["Страница не найдена | abcars.by", "Запрошенная страница не найдена."];
    const title = listPage ? String(baseTitle).replace(/ \| abcars\.by$/, ` — страница ${listPage} | abcars.by`) : baseTitle;
    const description = listPage && baseDescription ? `${baseDescription} Страница ${listPage} списка.` : baseDescription;
    const canonicalRoot = document.querySelector('link[rel="canonical"]')?.href || `${window.location.origin}${import.meta.env.BASE_URL}`;
    const canonicalBase = new URL(canonicalRoot);
    canonicalBase.pathname = "/";
    canonicalBase.search = "";
    canonicalBase.hash = "";
    // Без косой черты на конце — как отвечает хостинг и как ведут внутренние ссылки.
    // С чертой первоисточник указывал на адрес, с которого посетителя перебрасывают.
    const canonicalPath = detailTitle ? carHref(car) : path === "/" ? "/" : path.replace(/\/+$/, "");
    const canonical = new URL(listPage ? `${canonicalPath}?page=${listPage}` : canonicalPath, canonicalBase).href;
    const indexingEnabled = document.documentElement.dataset.seoIndexing === "true";
    // Раздел вычеркнутой марки живёт для человека («привезём под заказ»), а машин в
    // нём нет — сервер отдаёт его с noindex, и приложение при переходе внутри сайта
    // не должно это отменять.
    const emptyLanding = Boolean(landing?.kind === "brand" && landing.brand && EXCLUDED_BRANDS.includes(landing.brand))
      // Страница модели без обзора и меньше чем с тремя машинами — тонкая: не индексируем.
      || Boolean(landing?.kind === "model" && landing.facts && !landing.review && (Number(landing.facts.total) || 0) < 3);
    const indexable = indexingEnabled && !privatePage && !emptyLanding && Boolean(routeSeo[path] || detailTitle || landingSeo);
    applyPageHead({ title, description, canonical, indexable });
  }, [path, car, landing, listPage, carPending]);
  return null;
}

/* Both theme variants ship in the markup and CSS reveals the matching one: the
   theme attribute is set before first paint, so swapping `src` from React state
   would only add a flash of the wrong logo on hydration. */
function CurrencySwitch({ currency, setCurrency, className = "" }) {
  return (
    <SegmentedControl
      options={CURRENCIES.map(([value, label]) => ({ value, label }))}
      value={currency}
      onChange={setCurrency}
      label="Валюта цен"
      className={`currency-switch${className ? ` ${className}` : ""}`}
      renderOption={({ value, label }) => value === "BYN" ? <BynSign /> : label}
    />
  );
}

function ThemeSwitch({ mode, setMode }) {
  const choices = [
    ["system", Desktop, "Системная тема"],
    ["light", Sun, "Светлая тема"],
    ["dark", Moon, "Тёмная тема"],
  ];
  return (
    <div className="theme-switch header-menu-theme" role="group" aria-label="Оформление сайта">
      {choices.map(([value, Glyph, label]) => (
        <button key={value} type="button" className={mode === value ? "active" : ""} aria-label={label} aria-pressed={mode === value} onClick={() => setMode(value)}>
          <Glyph size={19} weight="bold" />
          <ActionTooltip text={label} />
        </button>
      ))}
    </div>
  );
}

// Клик по логотипу на главной не меняет ни адрес, ни содержимое, поэтому подтверждаем
// его короткой анимацией: страница проявляется заново, логотип чуть подаётся под палец.
// Класс висит на <html> и снимается по таймеру, чтобы пережить перерисовку при переходе
// с другого экрана.
const refreshPulseMs = 420;
let refreshPulseTimer = 0;
const playRefreshPulse = (event) => {
  // ⌘-клик и средняя кнопка уводят в новую вкладку — эту страницу трогать не нужно.
  if (event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
  const root = document.documentElement;
  window.clearTimeout(refreshPulseTimer);
  root.classList.remove("refresh-pulse");
  // Повторный клик перезапустит анимацию только после того, как браузер увидел класс снятым.
  void root.offsetWidth;
  root.classList.add("refresh-pulse");
  refreshPulseTimer = window.setTimeout(() => root.classList.remove("refresh-pulse"), refreshPulseMs);
};

// Viber нет в наборе Phosphor, поэтому фирменный контур храним здесь.
function ViberLogo({ size = 27 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M11.4 0C9.473.028 5.333.344 3.02 2.467 1.302 4.187.696 6.7.633 9.817.57 12.933.488 18.776 6.12 20.36h.003l-.004 2.416s-.037.977.61 1.177c.777.242 1.234-.5 1.98-1.302.407-.44.972-1.084 1.397-1.58 3.85.326 6.812-.416 7.15-.525.776-.252 5.176-.816 5.892-6.657.74-6.02-.36-9.83-2.34-11.546-.596-.55-3.006-2.3-8.375-2.323 0 0-.395-.025-1.037-.017zm.058 1.693c.545-.004.88.017.88.017 4.542.02 6.717 1.388 7.222 1.846 1.675 1.435 2.53 4.868 1.906 9.897v.002c-.604 4.878-4.174 5.184-4.832 5.395-.28.09-2.882.737-6.153.524 0 0-2.436 2.94-3.197 3.704-.12.12-.26.167-.352.144-.13-.033-.166-.188-.165-.414l.02-4.018c-4.762-1.32-4.485-6.292-4.43-8.895.054-2.604.543-4.738 1.996-6.173 1.96-1.773 5.474-2.018 7.11-2.03zm.38 2.602c-.167 0-.303.135-.304.302 0 .167.133.303.3.305 1.624.01 2.946.537 4.028 1.592 1.073 1.046 1.62 2.468 1.633 4.334.002.167.14.3.307.3.166-.002.3-.138.3-.304-.014-1.984-.618-3.596-1.816-4.764-1.19-1.16-2.692-1.753-4.447-1.765zm-3.96.695c-.19-.032-.4.005-.616.117l-.01.002c-.43.247-.816.562-1.146.932-.002.004-.006.004-.008.008-.267.323-.42.638-.46.948-.008.046-.01.093-.007.14 0 .136.022.27.065.4l.013.01c.135.48.473 1.276 1.205 2.604.42.768.903 1.5 1.446 2.186.27.344.56.673.87.984l.132.132c.31.308.64.6.984.87.686.543 1.418 1.027 2.186 1.447 1.328.733 2.126 1.07 2.604 1.206l.01.014c.13.042.265.064.402.063.046.002.092 0 .138-.008.31-.036.627-.19.948-.46.004 0 .003-.002.008-.005.37-.33.683-.72.93-1.148l.003-.01c.225-.432.15-.842-.18-1.12-.004 0-.698-.58-1.037-.83-.36-.255-.73-.492-1.113-.71-.51-.285-1.032-.106-1.248.174l-.447.564c-.23.283-.657.246-.657.246-3.12-.796-3.955-3.955-3.955-3.955s-.037-.426.248-.656l.563-.448c.277-.215.456-.737.17-1.248-.217-.383-.454-.756-.71-1.115-.25-.34-.826-1.033-.83-1.035-.137-.165-.31-.265-.502-.297zm4.49.88c-.158.002-.29.124-.3.282-.01.167.115.312.282.324 1.16.085 2.017.466 2.645 1.15.63.688.93 1.524.906 2.57-.002.168.13.306.3.31.166.003.305-.13.31-.297.025-1.175-.334-2.193-1.067-2.994-.74-.81-1.777-1.253-3.05-1.346h-.024zm.463 1.63c-.16.002-.29.127-.3.287-.008.167.12.31.288.32.523.028.875.175 1.113.422.24.245.388.62.416 1.164.01.167.15.295.318.287.167-.008.295-.15.287-.317-.03-.644-.215-1.178-.58-1.557-.367-.378-.893-.574-1.52-.607h-.018z" />
    </svg>
  );
}

function SiteLogo() {
  return (
    <>
      <img className="wordmark-image wordmark-image-light" src="/logo-light.svg?v=2" width="480" height="100" alt="" aria-hidden="true" />
      <img className="wordmark-image wordmark-image-dark" src="/logo-dark.svg?v=2" width="480" height="100" alt="" aria-hidden="true" />
    </>
  );
}

// Переключатель режима цен. Стоит над вкладками, потому что относится ко всему
// сайту, а не к выбранной половине квоты: включённый показывает льготную цену,
// выключенный — цену с пошлиной 15%.
function QuotaPricingToggle() {
  const pricing = useQuotaPricing();
  const available = Boolean(pricing?.available);
  const on = Boolean(pricing?.on);
  const hint = !available
    ? "Режим цены на электромобили задан ссылкой для проверки."
    : on
      ? "Цены на электромобили по квоте: пошлина 0%. Выключите — добавится пошлина 15%."
      : "Цены на электромобили без квоты: пошлина 15%. Включите — вернутся льготные цены.";
  return (
    <div className="quota-panel-pricing">
      <label className="quick-view-toggle quota-pricing-toggle">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={!available}
          onChange={(event) => pricing?.set(event.target.checked)}
        />
        <span className="quick-view-toggle-track" aria-hidden="true">
          <i />
        </span>
        <span className="quick-view-toggle-label">Цены с квотами</span>
      </label>
      <small>{hint}</small>
    </div>
  );
}

function EvQuotaPanel({ navigate, onDetails }) {
  return (
    <div className="quota-panel">
      <QuotaPricingToggle />
      <AppLink className="primary quota-panel-details" href="/ev-quota" navigate={navigate} onClick={onDetails}>
        <Lightning size={17} weight="bold" aria-hidden="true" />
        <span>Подробнее</span>
      </AppLink>
    </div>
  );
}

const QUOTA_TOOLTIP = (
  <>
    <b>Что за квоты</b>
    <span>Беларусь ограничивает число электромобилей, которые можно ввезти без пошлины. После исчерпания квоты действует пошлина 15%.</span>
  </>
);

const DECREE_DESCRIPTION = "Для многодетных родителей, людей с инвалидностью I–II группы и родителей/опекунов детей с инвалидностью до 18 лет. Постоянное проживание в Беларуси, 1 авто в год. Сборы без скидки.";

function DecreePricingPanel() {
  const pricing = useQuotaPricing();
  const isMobile = useNarrowViewport();
  const hintId = useId();
  return (
    <div className="quota-panel decree-panel">
      <div className="quota-panel-pricing">
        <label className="quick-view-toggle">
          <input type="checkbox" role="switch" checked={Boolean(pricing?.refund50)}
            aria-describedby={hintId} onChange={(event) => pricing?.setRefund50(event.target.checked)} />
          <span className="quick-view-toggle-track" aria-hidden="true"><i /></span>
          <span className="quick-view-toggle-label">Указ № 140</span>
        </label>
        <small id={hintId}>
          Возмещение 50% пошлин и налогов.{!isMobile && ` ${DECREE_DESCRIPTION}`}
        </small>
      </div>
    </div>
  );
}

function DecreePricingButton({ compact, path, className = "" }) {
  const pricing = useQuotaPricing();
  const on = Boolean(pricing?.refund50);
  const [open, setOpen] = useState(false);
  const shellRef = useRef(null);
  const triggerRef = useRef(null);
  const panelId = useId();
  useEffect(() => setOpen(false), [compact, path]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (event.type === "pointerdown" && !shellRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="quota-shell decree-shell" ref={shellRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`icon-label decree-pricing-button${className ? ` ${className}` : ""}`}
        role={compact ? undefined : "switch"}
        aria-checked={compact ? undefined : on}
        aria-expanded={compact ? open : undefined}
        aria-controls={compact ? panelId : undefined}
        aria-label={compact ? `Указ № 140: ${on ? "включён" : "выключен"}` : "Указ № 140: учитывать возмещение"}
        data-active={on}
        onClick={() => compact ? setOpen((value) => !value) : pricing?.setRefund50(!on)}
      >
        <span className="decree-label">Указ № 140</span>
        {!compact && <span className="decree-switch-track" aria-hidden="true"><i /></span>}
        {!open && <ActionTooltip className="quota-link-tooltip" text={<>
          <b>Возмещение 50% пошлин и налогов</b>
          <span>{DECREE_DESCRIPTION}</span>
        </>} />}
      </button>
      {compact && <div className={`quota-pop${open ? " open" : ""}`} id={panelId}
        aria-hidden={!open} inert={open ? undefined : true}>
        <DecreePricingPanel />
      </div>}
    </div>
  );
}

// The hidden full-size button remains measurable in every mode, so moving the
// control into the menu cannot cause resize feedback or lose its natural width.
function useHeaderDecreeMode(headerRef) {
  const [mode, setMode] = useState("menu");
  useLayoutEffect(() => {
    const header = headerRef.current;
    const logo = header.querySelector(".wordmark");
    const menu = header.querySelector(".header-menu-shell");
    const left = header.querySelector(".header-left-controls");
    const quota = left.querySelector(".quota-shell");
    const right = header.querySelector(".header-right-controls");
    const probe = header.querySelector(".decree-measure");
    const track = probe.querySelector(".decree-switch-track");
    const width = (node) => node.getBoundingClientRect().width;
    const px = (value) => Number.parseFloat(value) || 0;
    const update = () => {
      const available = width(header) - width(logo) - width(menu) - width(quota) - width(right)
        - px(getComputedStyle(menu).marginLeft) - px(getComputedStyle(header).columnGap) * 3
        - px(getComputedStyle(left).columnGap);
      const full = width(probe);
      const compact = full - width(track) - px(getComputedStyle(probe).columnGap);
      setMode(available >= full ? "full" : available >= compact ? "compact" : "menu");
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    [header, logo, menu, quota, right, probe].forEach((node) => observer?.observe(node));
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [headerRef]);
  return mode;
}

function EvQuotaButton({ quotas, navigate, className = "" }) {
  // В шапке — общий остаток по стране: физлица плюс юрлица. Разбивка по каждой
  // половине лежит во вкладках карточки.
  const remaining = quotas.personal.remaining + quotas.business.remaining;
  const total = quotas.personal.total + quotas.business.total;
  const [open, setOpen] = useState(false);
  const shellRef = useRef(null);
  const triggerRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === "Escape" || (event.type === "pointerdown" && !shellRef.current?.contains(event.target))) {
        if (event.key === "Escape") {
          event.stopPropagation();
          triggerRef.current?.focus();
        }
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="quota-shell" ref={shellRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`icon-label quota-link${open ? " selected" : ""}${className ? ` ${className}` : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Квоты ${number(remaining)}: осталось из ${number(total)} на беспошлинный ввоз электромобилей`}
        onClick={() => setOpen((value) => !value)}
      >
        <Lightning size={20} weight="bold" />
        <span>Квоты</span>
        {" "}<strong>{number(remaining)}</strong>
        {/* Слово «квота» само себя не объясняет, поэтому по наведению — короткий
            рассказ о том, что это и зачем на него смотреть. Пока карточка открыта,
            подсказки нет: цифры и прогноз уже перед глазами. Своя подсказка вместо
            title у кнопки — иначе браузер показал бы рядом вторую, системную. */}
        {!open && <ActionTooltip className="quota-link-tooltip" text={QUOTA_TOOLTIP} />}
      </button>
      <div
        className={`quota-pop${open ? " open" : ""}`}
        id={panelId}
        aria-hidden={!open}
        inert={open ? undefined : true}
      >
        <EvQuotaPanel navigate={navigate} onDetails={() => setOpen(false)} />
      </div>
    </div>
  );
}

function Header({ navigate, favoritesCount, savedSearchesCount, path, user, themeMode, setThemeMode }) {
  const currency = useCurrency();
  const setCurrency = useSetCurrency();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const headerRef = useRef(null);
  const decreeMode = useHeaderDecreeMode(headerRef);
  // Остаток квоты считается по вшитым в сборку сводкам — за сессию он не меняется.
  const quotas = useMemo(() => ({
    personal: evQuotaState({ audience: "personal" }),
    business: evQuotaState({ audience: "business" }),
  }), []);

  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  // Пока меню раскрыто, плавающие кнопки внизу экрана убираем — иначе на
  // телефоне они накрывают его нижние пункты.
  useEffect(() => {
    if (!menuOpen) return undefined;
    document.body.classList.add("header-menu-open");
    return () => document.body.classList.remove("header-menu-open");
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeMenu = (event) => {
      if (event.key === "Escape" || (event.type === "pointerdown" && !menuRef.current?.contains(event.target))) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="header-inner" ref={headerRef}>
        <AppLink className="wordmark" href="/" navigate={navigate} onClick={playRefreshPulse} aria-label="abcars.by — на главную">
          <SiteLogo />
        </AppLink>
        <div className="header-menu-shell" ref={menuRef}>
          <button
            type="button"
            className={`header-menu-trigger${menuOpen ? " open" : ""}`}
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={menuOpen}
            aria-controls="header-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="header-menu-icon header-menu-icon-list"><List size={27} weight="bold" /></span>
            <span className="header-menu-icon header-menu-icon-close"><X size={25} weight="bold" /></span>
          </button>
          <div
            className={`header-menu${menuOpen ? " open" : ""}`}
            id="header-menu"
            aria-hidden={!menuOpen}
            inert={menuOpen ? undefined : true}
          >
              <div className="header-menu-settings">
                {setCurrency && <CurrencySwitch currency={currency} setCurrency={setCurrency} className="header-menu-currency" />}
              </div>
              {decreeMode === "menu" && <DecreePricingPanel />}
              <nav aria-label="Основная навигация">
                {/* Каталог и журнал — первыми (25.09.2026): главный раздел сайта в главном
                    меню, как у всех сайтов в выдаче; до этого на каталог вели только
                    подвал и кнопки на главной, а на журнал — только подвал. */}
                <AppLink href="/catalog" navigate={navigate} className={path === "/catalog" || path.startsWith("/catalog/") ? "active" : ""} aria-current={path === "/catalog" ? "page" : undefined}>Автомобили</AppLink>
                {BLOG_ENABLED && <AppLink href={BLOG_INDEX.path} navigate={navigate} className={path === BLOG_INDEX.path || path.startsWith(`${BLOG_INDEX.path}/`) ? "active" : ""} aria-current={path === BLOG_INDEX.path ? "page" : undefined}>{BLOG_INDEX.name}</AppLink>}
                <AppLink href="/how-it-works" navigate={navigate} className={path === "/how-it-works" ? "active" : ""} aria-current={path === "/how-it-works" ? "page" : undefined}>О сервисе</AppLink>
                <AppLink href="/models" navigate={navigate} className={path.startsWith("/models") ? "active" : ""} aria-current={path.startsWith("/models") ? "page" : undefined}>О моделях авто</AppLink>
                <AppLink href="/contacts" navigate={navigate} className={path === "/contacts" ? "active" : ""} aria-current={path === "/contacts" ? "page" : undefined}>Контакты</AppLink>
                {/* На узких экранах кнопке «Мои поиски» в шапке не хватает места,
                    поэтому там она живёт в этом меню; на широких — прячется, чтобы
                    не дублировать кнопку рядом с избранным. */}
                <AppLink href="/searches" navigate={navigate} className={`header-menu-searches${path === "/searches" ? " active" : ""}`} aria-current={path === "/searches" ? "page" : undefined}>
                  Мои поиски{savedSearchesCount > 0 ? ` · ${savedSearchesCount}` : ""}
                </AppLink>
              </nav>
              <ThemeSwitch mode={themeMode} setMode={setThemeMode} />
          </div>
        </div>
        <div className="header-actions header-left-controls">
          <EvQuotaButton quotas={quotas} navigate={navigate} />
          {decreeMode !== "menu" && <DecreePricingButton compact={decreeMode === "compact"} path={path} />}
          <button type="button" className="icon-label decree-pricing-button decree-measure" aria-hidden="true" inert tabIndex={-1}>
            <span className="decree-label">Указ № 140</span>
            <span className="decree-switch-track"><i /></span>
          </button>
        </div>
        <div className="header-actions header-right-controls">
          {setCurrency && <CurrencySwitch currency={currency} setCurrency={setCurrency} className="header-currency-switch" />}
          <button
            className={`icon-label searches-link${path === "/searches" ? " selected" : ""}`}
            aria-label="Мои поиски"
            aria-current={path === "/searches" ? "page" : undefined}
            onClick={() => (user ? navigate("/searches") : navigate("/register", { replace:true, preserveScroll:true }))}
          >
            <BookmarkSimple size={21} weight={savedSearchesCount ? "fill" : "bold"} />
            {savedSearchesCount > 0 && <b>{savedSearchesCount}</b>}
            {/* Подпись у кнопки убрана ради компактной шапки — что это за значок,
                говорит подсказка по наведению. */}
            <ActionTooltip text="Мои поиски" />
          </button>
          <button
            className={`icon-label favorites-link${path === "/favorites" ? " selected" : ""}`}
            aria-label="Избранное"
            aria-current={path === "/favorites" ? "page" : undefined}
            onClick={() => (user ? navigate("/favorites") : navigate("/register", { replace:true, preserveScroll:true }))}
          >
            <Heart size={21} weight={favoritesCount ? "fill" : "bold"} />
            {favoritesCount > 0 && <b>{favoritesCount}</b>}
            <ActionTooltip text="Избранное" />
          </button>
          <button
            className={`icon-label account-link${path === "/account" || path === "/login" || path === "/register" ? " selected" : ""}`}
            aria-label={user ? `Личный кабинет — ${String(user.name || "").split(" ")[0] || "Кабинет"}` : "Войти"}
            aria-current={path === "/account" ? "page" : undefined}
            onClick={() => user ? navigate("/account") : navigate("/login", { replace:true, preserveScroll:true })}
          >
            <UserCircle size={22} weight={user ? "fill" : "bold"} />
            <span>{user ? String(user.name || "").split(" ")[0] || "Кабинет" : "Войти"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function AppLoader() {
  return (
    <main className="app-loader" aria-live="polite" aria-busy="true">
      <div className="app-loader-spinner" aria-hidden="true" />
      <p>Загружаем объявления</p>
    </main>
  );
}

// Two rows of the desktop grid, which also more than fills a phone viewport.
const skeletonCards = ["a", "b", "c", "d", "e", "f"];

// Reuses the real card classes so the placeholder occupies the exact geometry the loaded
// card will, which keeps the feed from shifting once the catalog request resolves.
// Переключатель вида выдачи: списком или плиткой. Один и тот же в каталоге, в
// избранном и на главной — и в строке с сортировкой, и у заголовка подборки,
// поэтому и разметка, и подписи для чтения с экрана живут в одном месте.
function ViewToggle({ value, onChange, className = "" }) {
  return (
    <div className={className ? `result-view-toggle ${className}` : "result-view-toggle"} role="group" aria-label="Вид выдачи">
      <button
        type="button"
        className={value === "list" ? "active" : ""}
        aria-pressed={value === "list"}
        aria-label="Показать списком"
        title="Списком"
        onClick={() => onChange("list")}
      >
        <Rows size={19} />
      </button>
      <button
        type="button"
        className={value === "grid" ? "active" : ""}
        aria-pressed={value === "grid"}
        aria-label="Показать карточками"
        title="Карточками"
        onClick={() => onChange("grid")}
      >
        <SquaresFour size={19} />
      </button>
    </div>
  );
}

function CardSkeleton({ row }) {
  const body = (
    <>
      <div className="skeleton-line skeleton-line-title" />
      <div className="skeleton-line" />
      <div className="skeleton-line skeleton-line-short" />
    </>
  );
  if (row) {
    return (
      <article className="car-row skeleton-card" aria-hidden="true">
        <div className="car-row-image" />
        <div className="skeleton-body">{body}</div>
      </article>
    );
  }
  return (
    <div className="featured-card skeleton-card" aria-hidden="true">
      <div className="featured-image" />
      <div className="featured-body skeleton-body">{body}</div>
    </div>
  );
}

// `optionHref(item)` — адрес, на который ведёт выбор пункта (марка, тип двигателя,
// кузов в фильтре каталога): тогда пункт — ссылка. Нажатие работает как у обычного
// пункта, а поисковик по ссылке доходит до раздела — фильтр в коде страницы был
// кнопками, и до разделов марок и кузовов робот с каталога дойти не мог. `rel` —
// «nofollow» для адресов, у которых нет своей страницы (сочетание фильтров).
function SelectField({ label, value, options, onChange, searchable = false, multiple = false, className = "", disabled = false, formatOption = (item) => item, optionCounts, optionIcon, optionHref, icon: Icon, mobileIcon: MobileIcon, mobileActionSheet = false, brandGrid = false }) {
  // В режиме мультивыбора value — массив, а первая опция играет роль «сбросить всё».
  const allOption = multiple ? options[0] : null;
  const selectedValues = multiple ? (Array.isArray(value) ? value : value && value !== allOption ? [value] : []) : [];
  // В фильтрах первая опция означает «не выбрано». Отдельный класс даёт
  // постоянный визуальный сигнал активного фильтра, даже когда список закрыт.
  const hasSelection = multiple ? selectedValues.length > 0 : options.length > 0 && value !== options[0];
  const isChosen = (item) => (multiple ? (item === allOption ? !selectedValues.length : selectedValues.includes(item)) : item === value);
  const chosenInOrder = multiple ? options.filter((item) => item !== allOption && selectedValues.includes(item)) : [];
  const highlighted = multiple ? chosenInOrder[0] || allOption : value;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, options.indexOf(highlighted)));
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const optionsRef = useRef(null);
  const listId = useId();
  const actionSheetMode = Boolean(mobileActionSheet);
  const selectedIndex = Math.max(0, options.indexOf(highlighted));
  const filteredOptions = useMemo(() => {
    // Поиск по списку идёт тем же приведением, что и поиск по каталогу: «skoda»
    // находит «Škoda», «mercedes benz» — «Mercedes-Benz».
    // Ищем и по набранному кириллицей: «ау» — это «au», а значит Audi.
    if (searchable && query.trim()) return listSearchMatches(options, query);
    return options;
  }, [options, query, searchable]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    const closeOutside = (event) => {
      if (actionSheetMode) return;
      if (!rootRef.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [actionSheetMode]);

  useEffect(() => {
    if (disabled && open) close();
  }, [disabled, open]);

  // Меню мультивыбора не закрывается на клик, поэтому подсветку синхронизируем
  // только при открытии и смене поискового запроса, а не после каждого чекбокса.
  const syncKey = `${open}|${query}`;
  const syncedKey = useRef("");
  useEffect(() => {
    if (!open) {
      syncedKey.current = "";
      return;
    }
    if (multiple && syncedKey.current === syncKey) return;
    syncedKey.current = syncKey;
    const index = filteredOptions.indexOf(highlighted);
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, query, syncKey, highlighted, filteredOptions, multiple]);

  // Long lists (price steps, brands) scroll inside the menu, so the highlighted
  // option has to be pulled into view instead of leaving the list at the top.
  useEffect(() => {
    if (!open) return;
    const list = optionsRef.current;
    const active = list?.querySelector('[role="option"].active');
    if (!list || !active) return;
    if (brandGrid) {
      const bounds = list.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      if (item.top < bounds.top) list.scrollTop += item.top - bounds.top;
      else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
    } else active.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, brandGrid]);

  // Список привязан к краю кнопки (сортировка в выдаче — к правому) и шире её.
  // На узком экране он от этого уезжал за левый край: первые буквы пунктов
  // обрезались краем окна. Сдвигаем раскрытый список внутрь окна.
  // Геометрию берём из вёрстки (offsetLeft/offsetWidth), а не из
  // getBoundingClientRect меню: пока идёт анимация раскрытия, прямоугольник
  // меню отражает промежуточный масштаб и сдвиг вышел бы неточным.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const menu = root?.querySelector(".select-menu");
    if (!menu) return;
    menu.style.removeProperty("--select-menu-shift");
    if (!open || brandGrid) return;
    const gutter = 8;
    const left = root.getBoundingClientRect().left + menu.offsetLeft;
    const right = left + menu.offsetWidth;
    // Если список шире окна, прижимаем его к левому краю: обрезать хвост
    // названия лучше, чем начало.
    const viewport = document.documentElement.clientWidth;
    const shift = left < gutter ? gutter - left : Math.min(0, viewport - gutter - right);
    if (shift) menu.style.setProperty("--select-menu-shift", `${Math.round(shift)}px`);
  }, [open, filteredOptions.length, query, brandGrid]);

  useLayoutEffect(() => {
    if (!open || !brandGrid) return;
    const menu = rootRef.current?.querySelector(".select-menu");
    const row = rootRef.current?.closest(".unified-filter-primary");
    if (!menu || !row) return;
    const updateHeight = () => {
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      const available = Math.max(0, bottom - row.getBoundingClientRect().bottom - 8 - 12);
      menu.style.setProperty("--brand-menu-height", `${Math.floor(available)}px`);
    };
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateHeight);
    };
    // Keep the opening height while the page scrolls, so the menu moves with
    // its trigger instead of growing toward a stationary viewport edge.
    updateHeight();
    const observer = new ResizeObserver(schedule);
    observer.observe(row);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      menu.style.removeProperty("--brand-menu-height");
    };
  }, [open, brandGrid]);

  // Внутри мобильной шторки фильтров меню раскрывается вниз и может уйти за
  // нижний край; докручиваем шторку, чтобы раскрытый список был виден целиком.
  // В шторке одного фильтра список открывается вверх и виден целиком сам — крутить
  // там нечего, а вызов сдвигал бы страницу под затемнением.
  useEffect(() => {
    if (!open || !rootRef.current?.closest(".mobile-filter-sheet")) return;
    if (rootRef.current.closest(".mobile-filter-sheet--compact")) return;
    rootRef.current.querySelector(".select-menu")?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const choose = (item) => {
    if (multiple) {
      if (item === allOption) {
        onChange?.([]);
        return;
      }
      onChange?.(selectedValues.includes(item) ? selectedValues.filter((entry) => entry !== item) : [...selectedValues, item]);
      return;
    }
    onChange?.(item);
    close(true);
  };
  const moveActive = (key) => {
    if (!filteredOptions.length) return;
    if (key === "ArrowDown") setActiveIndex((index) => Math.min(filteredOptions.length - 1, index + 1));
    if (key === "ArrowUp") setActiveIndex((index) => Math.max(0, index - 1));
    if (key === "Home") setActiveIndex(0);
    if (key === "End") setActiveIndex(filteredOptions.length - 1);
  };
  const handleKeyDown = (event) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(event.key === "ArrowUp" || event.key === "End" ? options.length - 1 : selectedIndex);
        return;
      }
      moveActive(event.key);
    } else if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      if (filteredOptions[activeIndex]) choose(filteredOptions[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") close();
  };

  const handleSearchKeyDown = (event) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      moveActive(event.key);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (filteredOptions[activeIndex]) choose(filteredOptions[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") close();
  };

  // Подпись для чтения с экрана обязана содержать написанное на кнопке слово в слово,
  // иначе проверка доступности считает её несовпадающей: поэтому не «Марка», а
  // «Марка: Все марки авто».
  const triggerText = multiple
    ? (chosenInOrder.length ? `${formatOption(chosenInOrder[0])}${chosenInOrder.length > 1 ? ` +${chosenInOrder.length - 1}` : ""}` : formatOption(allOption))
    : formatOption(value);

  return (
    <div className={`select-field custom-select${brandGrid ? " brand-grid-select" : ""}${className ? ` ${className}` : ""}${MobileIcon ? " has-mobile-icon" : ""}${hasSelection ? " has-selection" : ""}${open ? " open" : ""}${disabled ? " disabled" : ""}`} ref={rootRef}>
      <button ref={triggerRef} type="button" className={`select-trigger${Icon ? " with-icon" : ""}`} aria-label={`${label}: ${triggerText}`} aria-haspopup="listbox" aria-expanded={disabled ? false : open} aria-controls={listId} disabled={disabled} onClick={() => (open ? close() : setOpen(true))} onKeyDown={handleKeyDown}>
        {Icon && <Icon className="select-trigger-icon" size={20} weight="duotone" aria-hidden="true" />}
        {MobileIcon && <MobileIcon className="select-trigger-mobile-icon" size={22} weight="bold" aria-hidden="true" />}
        <b>{triggerText}</b>
        <CaretDown size={16} weight="bold" />
      </button>
      {brandGrid && hasSelection && !disabled && (
        <button type="button" className="brand-grid-clear" aria-label="Убрать марку" onClick={() => { onChange?.(options[0]); close(true); }}>
          <span className="market-compare-search-clear" aria-hidden="true"><X size={12} weight="bold" /></span>
        </button>
      )}
      {!disabled && !actionSheetMode && (
        <div className={`select-menu${open ? " open" : ""}`} aria-hidden={!open} inert={open ? undefined : true}>
          {searchable && (
            <div className="select-search">
              <MagnifyingGlass size={16} />
              <input ref={searchRef} type="search" value={query} placeholder={`Поиск: ${label.toLocaleLowerCase("ru")}`} aria-label={`Поиск: ${label.toLocaleLowerCase("ru")}`} role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={listId} aria-activedescendant={filteredOptions[activeIndex] ? `${listId}-${activeIndex}` : undefined} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleSearchKeyDown} />
              {query && (
                <button
                  type="button"
                  className="select-search-clear"
                  aria-label="Очистить поиск"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                >
                  <X size={14} weight="bold" />
                </button>
              )}
            </div>
          )}
          <div className="select-options" id={listId} role="listbox" aria-label={label} aria-multiselectable={multiple || undefined} ref={optionsRef} style={brandGrid ? {
            "--brand-grid-rows": Math.max(1, Math.ceil(filteredOptions.length / 4)),
            "--brand-grid-rows-mid": Math.max(1, Math.ceil(filteredOptions.length / 3)),
          } : undefined}>
            {filteredOptions.length ? (
              filteredOptions.map((item, index) => {
                const optionCount = optionCounts?.get(item);
                const chosen = isChosen(item);
                const link = optionHref?.(item) || null;
                const optionProps = {
                  id: `${listId}-${index}`,
                  role: "option",
                  "aria-selected": chosen,
                  className: `${chosen ? "selected" : ""}${index === activeIndex ? " active" : ""}`,
                  onMouseEnter: () => setActiveIndex(index),
                };
                const Option = link ? "a" : "button";
                const linkProps = link
                  ? {
                      href: appHref(link.href),
                      rel: link.rel,
                      // Справочник раздела начинаем грузить уже при наведении (как у AppLink).
                      onPointerEnter: () => {
                        setActiveIndex(index);
                        prefetchCatalogMeta(link.href);
                      },
                      // Со служебной клавишей — как у обычной ссылки (новая вкладка).
                      onClick: (event) => {
                        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                        event.preventDefault();
                        choose(item);
                      },
                    }
                  : { type: "button", onClick: () => choose(item) };
                return (
                  <Option key={item} {...optionProps} {...linkProps}>
                    <span className="select-option-label">
                      {multiple && (
                        <span className={`select-option-check${chosen ? " checked" : ""}`} aria-hidden="true">
                          {chosen && <Check size={12} weight="bold" />}
                        </span>
                      )}
                      {optionIcon && (
                        <span className="select-option-icon" aria-hidden="true">
                          {optionIcon(item)}
                        </span>
                      )}
                      <span>{formatOption(item)}</span>
                      {Number.isFinite(optionCount) && <small className="select-option-count">{number(optionCount)}</small>}
                    </span>
                    {!multiple && chosen && <Check size={16} weight="bold" />}
                  </Option>
                );
              })
            ) : (
              <p className="select-empty">Ничего не найдено</p>
            )}
          </div>

        </div>
      )}
      {!disabled && actionSheetMode && open && typeof document !== "undefined" && createPortal(
        <FilterSheet title={label} onClose={() => close(true)} fill={filteredOptions.length > 8}>
          <div className="sheet-options market-select-sheet-options" id={listId} role="listbox" aria-label={label} aria-multiselectable={multiple || undefined}>
            {filteredOptions.map((item) => {
              const optionCount = optionCounts?.get(item);
              const chosen = isChosen(item);
              return (
                <button type="button" role="option" aria-selected={chosen} className={`sheet-option${chosen ? " chosen" : ""}`} key={item} onClick={() => choose(item)}>
                  {optionIcon && <span className="select-option-icon" aria-hidden="true">{optionIcon(item)}</span>}
                  <span className="sheet-option-name">{formatOption(item)}</span>
                  {Number.isFinite(optionCount) && <span className="sheet-option-count">{number(optionCount)}</span>}
                  {chosen && <Check size={18} weight="bold" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </FilterSheet>,
        document.body,
      )}
    </div>
  );
}

function HomeFaqItem({ item, open, onToggle, navigate = null }) {
  return (
    <article className={`home-faq-item${open ? " open" : ""}`}>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        <span>{item.question}</span>
        <CaretDown size={20} weight="bold" aria-hidden="true" />
      </button>
      <div className="animated-disclosure" aria-hidden={!open} inert={!open}>
        <div><p>{navigate ? renderInlineText(item.answer, navigate) : item.answer}</p></div>
      </div>
    </article>
  );
}

function HomeFaqList({ items, navigate = null, className = "home-faq-list" }) {
  const [openIndex, setOpenIndex] = useState(null);
  return (
    <div className={className}>
      {items.map((item, index) => (
        <HomeFaqItem
          key={item.question}
          item={item}
          open={openIndex === index}
          onToggle={() => setOpenIndex((current) => current === index ? null : index)}
          navigate={navigate}
        />
      ))}
    </div>
  );
}

// Какие фильтры показывать. Скрываем только то, что не имеет смысла при выбранном
// топливе: у бензиновой машины не спрашивают ёмкость батареи и запас хода на
// электротяге, у электромобиля — объём двигателя и коробку передач. Все остальные
// поля (разгон, шины, мощность, привод, состояние…) годятся любой машине и остаются
// на всех вкладках. На вкладке «Все» показываем всё сразу. Поле, у которого в отборе
// нет ни одного значения, не показывается — такой фильтр возвращал бы пустоту.
const FILTER_POWERTRAINS = {
  battery: ["Электромобили", "Гибриды"],
  range: ["Электромобили", "Гибриды"],
  engine: ["Гибриды", "Бензин"],
  gearbox: ["Гибриды", "Бензин"],
};
const filterAvailable = (availability, key, selectedType = "Все") => {
  const tabs = FILTER_POWERTRAINS[key];
  // Дизель — те же машины с двигателем, что и «Бензин»: объём и коробка у них есть.
  const tab = selectedType === DIESEL_TAB ? "Бензин" : selectedType;
  if (tabs && tab !== "Все" && !tabs.includes(tab)) return false;
  // Пустая вкладка (машин такого топлива в каталоге нет вовсе) не должна раздевать
  // панель: поля остаются на месте, просто выбирать в них нечего. А пока справочник
  // не пришёл, полей нет — появиться позже спокойнее, чем исчезнуть на глазах.
  if (!(Number(availability?.total) || 0)) return availability?.total !== undefined;
  return (Number(availability[key]) || 0) > 0;
};

// Статический режим считает те же признаки по загруженному каталогу.
const localAvailability = (cars) => ({
  total: cars.length,
  drive: cars.filter((car) => car.drive && car.drive !== "Не указан").length,
  owners: cars.filter((car) => Number(car.owners)).length,
  battery: cars.filter((car) => Number(car.battery) > 0).length,
  condition: cars.filter((car) => conditionLabels[car.conditionGrade]).length,
  range: cars.filter((car) => Number(car.electricRange || car.combinedRange || car.range) > 0).length,
  accel: cars.filter((car) => Number(car.acceleration) > 0).length,
  tire: cars.filter((car) => Number(car.tireRim) > 0).length,
  engine: cars.filter((car) => engineVolume(car) !== null).length,
  power: cars.filter((car) => enginePower(car) !== null).length,
  gearbox: cars.filter((car) => gearboxType(car)).length,
  fuel: new Set(cars.map((car) => fuelType(car)).filter(Boolean)).size,
});

// Шторка фильтра на телефоне: шапка с заголовком (и стрелкой «назад», когда шаг не
// первый), прокручиваемая середина и кнопка результата, которая всегда видна внизу.
function FilterSheet({ title, onBack = null, onClose, footer = null, fill = false, compact = false, icon = null, hideClose = false, scrollResetKey = null, children }) {
  const titleId = useId();
  const bodyRef = useRef(null);
  // Шторка марок и моделей живёт между шагами: содержимое сменилось, а прокрутка
  // осталась от прошлого списка — возвращаем её к началу.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [scrollResetKey]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      if (onBack) onBack();
      else onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onBack, onClose]);
  return (
    <div className="mobile-filter-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`mobile-filter-sheet${fill ? " mobile-filter-sheet--fill" : ""}${compact ? " mobile-filter-sheet--compact" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="mobile-filter-sheet-handle" aria-hidden="true" />
        {Boolean(icon) && <span className="mobile-filter-sheet-icon" aria-hidden="true">{icon}</span>}
        <header className="mobile-filter-sheet-header">
          {onBack ? (
            <button type="button" className="mobile-filter-sheet-back" onClick={onBack} aria-label="Назад">
              <ArrowLeft size={20} />
            </button>
          ) : (
            !hideClose && <span className="mobile-filter-sheet-back" aria-hidden="true" />
          )}
          <h2 id={titleId}>{title}</h2>
          {!hideClose && (
            <button type="button" onClick={onClose} aria-label="Закрыть фильтры">
              <X size={20} weight="bold" />
            </button>
          )}
        </header>
        <div className="mobile-filter-sheet-body" ref={bodyRef}>{children}</div>
        {Boolean(footer) && <footer className="mobile-filter-sheet-actions">{footer}</footer>}
      </section>
    </div>
  );
}

// «Все» в списке типов двигателя само по себе ничего не говорит: подписываем полем.
const powertrainLabel = (item) => (item === "Все" ? "Все типы двигателей" : item);

// Группы марок в шторке выбора: Китай — по справочнику китайских марок, Корея и
// Германия — по спискам ниже, всё незнакомое — «Другое» (с 29.09.2026 каталог
// собирается с двух рынков, и неизвестное имя больше не считается китайским).
const GERMAN_BRANDS = new Set(["Audi", "BMW", "Mercedes-Benz", "MINI", "Porsche", "Volkswagen"]);
// Корейские марки — те, что возят с корейского рынка; SsangYong с 2023 года
// называется KGM, в каталоге могут встретиться оба имени.
// Chevrolet и Renault здесь нет: они вычеркнуты из ввоза и для Кореи (config/import-policy.mjs).
const KOREAN_BRANDS = new Set(["Hyundai", "Kia", "Genesis", "KGM", "SsangYong"]);
// Спорные случаи решены так, как их ищут: MINI — марка BMW, поэтому она у немцев;
// Volvo принадлежит Geely, но остаётся шведской и стоит в «Другом»; MG числится
// китайской — марка британская, но принадлежит SAIC, а машины делают и продают
// в Китае как местные (она есть в справочнике китайских марок).
const CHINESE_BRAND_NAMES = new Set(CHINA_BRANDS.map((item) => item.brand));
const BRAND_GROUPS = ["Все", countryName("china"), countryName("korea"), "Германия", "Другое"];
const brandGroupOf = (brand) => (
  GERMAN_BRANDS.has(brand) ? "Германия"
    : KOREAN_BRANDS.has(brand) ? countryName("korea")
      : CHINESE_BRAND_NAMES.has(brand) ? countryName("china")
        : "Другое"
);

// `optionHrefs` — адреса разделов для пунктов марки, типа двигателя и кузова (каталог):
// пункт, выбор которого ведёт на другой раздел, становится ссылкой (см. SelectField).
function VehicleSearch({ constrained = false, selectedType, onTypeChange, values, actions, options, optionCounts, availability, resultCount, onSubmit, onReset, onSaveSearch, searchSaved = false, searchUpdate = false, hasActiveFilters = false, initiallyExpanded = false, onExpandedChange = null, optionHrefs = null, canReset = null }) {
  const currency = useCurrency();
  const narrow = useNarrowViewport();
  // На широком экране «Ещё фильтры» раскрывают строку прямо в панели, на телефоне
  // фильтры живут в шторках: марка и модель, «Фильтры» целиком, цена, год, пробег.
  // The viewport hook keeps the first browser render identical to the server.
  // Reading matchMedia directly here breaks mobile hydration of filtered sections.
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(() => initiallyExpanded && !narrow);
  const [sheet, setSheet] = useState(null);
  const [sheetQuery, setSheetQuery] = useState("");
  const [brandGroup, setBrandGroup] = useState("Все");
  const extraFiltersId = useId();

  // Обе границы живут в одной ячейке сетки, чтобы читались как один диапазон.
  const yearRange = (className = "") => (
    <div className={`filter-range-pair${className ? ` ${className}` : ""}`}>
      <SelectField label="Год от" value={values.yearMin} onChange={actions.yearMin} options={yearMinOptions} formatOption={(value) => yearLabel(value, ANY_YEAR_MIN)} />
      <SelectField label="Год до" value={values.yearMax} onChange={actions.yearMax} options={yearMaxChoices(values.yearMin)} formatOption={(value) => yearLabel(value, ANY_YEAR_MAX)} />
    </div>
  );

  const priceRange = (className = "") => (
    <div className={`filter-range-pair${className ? ` ${className}` : ""}`}>
      <SelectField label="Цена от" value={values.priceMin} onChange={actions.priceMin} options={priceMinOptions} formatOption={(value) => priceMinLabel(value, currency)} />
      <SelectField label="Цена до" value={values.priceMax} onChange={actions.priceMax} options={priceMaxChoices(values.priceMin)} formatOption={(value) => priceMaxLabel(value, currency)} />
    </div>
  );

  const extraFilters = (className = "") => (
    <>
      {/* Тип двигателя стоит первым среди остальных фильтров: раньше он был
          вкладками над панелью, теперь это обычное поле — и на телефоне, и на
          широком экране. */}
      <SelectField className={className} label="Тип двигателя" icon={Engine} value={selectedType} onChange={onTypeChange} options={POWERTRAIN_TABS} formatOption={powertrainLabel} optionHref={optionHrefs?.type} />
      <SelectField className={className} label="Пробег" icon={Gauge} value={values.mileage} onChange={actions.mileage} options={mileageOptions} />
      <SelectField className={className} label="Кузов" icon={CarProfile} value={values.bodyType} onChange={actions.bodyType} options={options.bodyTypes} multiple optionHref={optionHrefs?.bodyType} />
      <SelectField className={className} label="Цвет" icon={Palette} value={values.color} onChange={actions.color} options={[ANY_COLOR, ...COLOR_LABELS]} multiple />
      {filterAvailable(availability, "drive", selectedType) && <SelectField className={className} label="Привод" icon={SteeringWheel} value={values.drive} onChange={actions.drive} options={options.drives} />}
      {filterAvailable(availability, "owners", selectedType) && <SelectField className={className} label="Владельцы" icon={UsersThree} value={values.owners} onChange={actions.owners} options={ownerOptions} />}
      {filterAvailable(availability, "battery", selectedType) && <SelectField className={className} label="Батарея" icon={BatteryHigh} value={values.battery} onChange={actions.battery} options={batteryOptions} />}
      {filterAvailable(availability, "condition", selectedType) && <SelectField className={className} label="Состояние" icon={ShieldCheck} value={values.condition} onChange={actions.condition} options={conditionOptions} />}
      {filterAvailable(availability, "engine", selectedType) && <SelectField className={className} label="Объём двигателя" icon={Engine} value={values.engine || ANY_ENGINE} onChange={actions.engine} options={engineOptions} />}
      {filterAvailable(availability, "power", selectedType) && <SelectField className={className} label="Мощность" icon={Lightning} value={values.power || ANY_POWER} onChange={actions.power} options={powerOptions} />}
      {filterAvailable(availability, "gearbox", selectedType) && <SelectField className={className} label="Коробка" icon={Gear} value={values.gearbox || ANY_GEARBOX} onChange={actions.gearbox} options={gearboxOptions} />}
      {Number(availability.fuel) > 1 && <SelectField className={className} label="Топливо" icon={GasPump} value={values.fuel || ANY_FUEL} onChange={actions.fuel} options={fuelOptions} />}
      {filterAvailable(availability, "accel", selectedType) && <SelectField className={className} label="Разгон до 100 км/ч" icon={Timer} value={values.accel} onChange={actions.accel} options={accelOptions} />}
      {filterAvailable(availability, "tire", selectedType) && <SelectField className={className} label="Размер шин" icon={Tire} value={values.tire} onChange={actions.tire} options={tireOptions} />}
      {filterAvailable(availability, "range", selectedType) && <SelectField className={className} label="Запас хода" icon={RoadHorizon} value={values.range || ANY_RANGE} onChange={actions.range} options={rangeOptions} />}
    </>
  );

  // Каждый фильтр умеет открыться сам по себе: по нажатию на плашку с выбранным
  // значением и по быстрой кнопке в ленте. Здесь — заголовок шторки и само поле.
  const filterFields = {
    type: ["Тип двигателя", () => <SelectField label="Тип двигателя" icon={Engine} value={selectedType} onChange={onTypeChange} options={POWERTRAIN_TABS} formatOption={powertrainLabel} optionHref={optionHrefs?.type} />],
    price: ["Цена", () => priceRange()],
    year: ["Год выпуска", () => yearRange()],
    mileage: ["Пробег", () => <SelectField label="Пробег" icon={Gauge} value={values.mileage} onChange={actions.mileage} options={mileageOptions} />],
    bodyType: ["Кузов", () => <SelectField label="Кузов" icon={CarProfile} value={values.bodyType} onChange={actions.bodyType} options={options.bodyTypes} multiple optionHref={optionHrefs?.bodyType} />],
    color: ["Цвет", () => <SelectField label="Цвет" icon={Palette} value={values.color} onChange={actions.color} options={[ANY_COLOR, ...COLOR_LABELS]} multiple />],
    country: ["Страна", () => <SelectField label="Страна" icon={MapPin} value={values.country || ANY_COUNTRY} onChange={actions.country} options={options.countries || [ANY_COUNTRY]} />],
    drive: ["Привод", () => <SelectField label="Привод" icon={SteeringWheel} value={values.drive} onChange={actions.drive} options={options.drives} />],
    owners: ["Владельцы", () => <SelectField label="Владельцы" icon={UsersThree} value={values.owners} onChange={actions.owners} options={ownerOptions} />],
    battery: ["Батарея", () => <SelectField label="Батарея" icon={BatteryHigh} value={values.battery} onChange={actions.battery} options={batteryOptions} />],
    condition: ["Состояние", () => <SelectField label="Состояние" icon={ShieldCheck} value={values.condition} onChange={actions.condition} options={conditionOptions} />],
    engine: ["Объём двигателя", () => <SelectField label="Объём двигателя" icon={Engine} value={values.engine || ANY_ENGINE} onChange={actions.engine} options={engineOptions} />],
    power: ["Мощность", () => <SelectField label="Мощность" icon={Lightning} value={values.power || ANY_POWER} onChange={actions.power} options={powerOptions} />],
    gearbox: ["Коробка", () => <SelectField label="Коробка" icon={Gear} value={values.gearbox || ANY_GEARBOX} onChange={actions.gearbox} options={gearboxOptions} />],
    fuel: ["Топливо", () => <SelectField label="Топливо" icon={GasPump} value={values.fuel || ANY_FUEL} onChange={actions.fuel} options={fuelOptions} />],
    accel: ["Разгон до 100 км/ч", () => <SelectField label="Разгон до 100 км/ч" icon={Timer} value={values.accel} onChange={actions.accel} options={accelOptions} />],
    tire: ["Размер шин", () => <SelectField label="Размер шин" icon={Tire} value={values.tire} onChange={actions.tire} options={tireOptions} />],
    range: ["Запас хода", () => <SelectField label="Запас хода" icon={RoadHorizon} value={values.range || ANY_RANGE} onChange={actions.range} options={rangeOptions} />],
  };
  // Что выбрано в фильтрах, кроме марки, модели, цены, года и пробега: их на телефоне
  // показывают отдельные кнопки, а всё остальное — плашками с крестиком.
  const extraChips = [
    ...multiValues(values.bodyType, ANY_BODY_TYPE).map((item) => ({ key: `body-${item}`, field: "bodyType", label: item, clear: () => actions.bodyType(multiValues(values.bodyType, ANY_BODY_TYPE).filter((entry) => entry !== item)) })),
    ...multiValues(values.color, ANY_COLOR).map((item) => ({ key: `color-${item}`, field: "color", label: item, clear: () => actions.color(multiValues(values.color, ANY_COLOR).filter((entry) => entry !== item)) })),
    (values.country || ANY_COUNTRY) !== ANY_COUNTRY && { key: "country", field: "country", label: values.country, clear: () => actions.country(ANY_COUNTRY) },
    values.drive !== ANY_DRIVE && { key: "drive", field: "drive", label: values.drive, clear: () => actions.drive(ANY_DRIVE) },
    values.owners !== ANY_OWNERS && { key: "owners", field: "owners", label: values.owners, clear: () => actions.owners(ANY_OWNERS) },
    values.battery !== ANY_BATTERY && { key: "battery", field: "battery", label: values.battery, clear: () => actions.battery(ANY_BATTERY) },
    values.condition !== ANY_CONDITION && { key: "condition", field: "condition", label: values.condition, clear: () => actions.condition(ANY_CONDITION) },
    (values.engine || ANY_ENGINE) !== ANY_ENGINE && { key: "engine", field: "engine", label: values.engine, clear: () => actions.engine(ANY_ENGINE) },
    (values.power || ANY_POWER) !== ANY_POWER && { key: "power", field: "power", label: values.power, clear: () => actions.power(ANY_POWER) },
    (values.gearbox || ANY_GEARBOX) !== ANY_GEARBOX && { key: "gearbox", field: "gearbox", label: values.gearbox, clear: () => actions.gearbox(ANY_GEARBOX) },
    (values.fuel || ANY_FUEL) !== ANY_FUEL && { key: "fuel", field: "fuel", label: values.fuel, clear: () => actions.fuel(ANY_FUEL) },
    values.accel !== ANY_ACCEL && { key: "accel", field: "accel", label: values.accel, clear: () => actions.accel(ANY_ACCEL) },
    values.tire !== ANY_TIRE && { key: "tire", field: "tire", label: values.tire, clear: () => actions.tire(ANY_TIRE) },
    (values.range || ANY_RANGE) !== ANY_RANGE && { key: "range", field: "range", label: values.range, clear: () => actions.range(ANY_RANGE) },
    selectedType !== "Все" && { key: "type", field: "type", label: selectedType, clear: () => onTypeChange("Все") },
  ].filter(Boolean);

  const selectedModels = multiValues(values.model, ANY_MODEL);
  const brandChosen = values.brand !== "Все марки";
  // Крестик у кнопки марки снимает выбор по одной ступени: сначала модели, потом марку.
  const stepBack = () => (selectedModels.length ? actions.model([]) : actions.brand("Все марки"));
  const yearChip = hasYearRange(values.yearMin, values.yearMax)
    ? `${yearBound(values.yearMin, ANY_YEAR_MIN) ? `от ${values.yearMin}` : ""}${yearBound(values.yearMin, ANY_YEAR_MIN) && yearBound(values.yearMax, ANY_YEAR_MAX) ? " " : ""}${yearBound(values.yearMax, ANY_YEAR_MAX) ? `до ${values.yearMax}` : ""}`
    : "Год";
  const priceChip = hasPriceRange(values.priceMin, values.priceMax)
    ? `${priceBound(values.priceMin, ANY_PRICE_MIN) !== null ? `от ${money(Number(values.priceMin), currency)}` : ""}${priceBound(values.priceMin, ANY_PRICE_MIN) !== null && priceBound(values.priceMax, ANY_PRICE_MAX) !== null ? " " : ""}${priceBound(values.priceMax, ANY_PRICE_MAX) !== null ? `до ${money(Number(values.priceMax), currency)}` : ""}`
    : "Цена";
  const mileageChip = values.mileage !== ANY_MILEAGE ? values.mileage : "Пробег";
  // Всё выбранное одной лентой: цена, год и пробег впереди, за ними остальные поля.
  const chosenChips = [
    hasPriceRange(values.priceMin, values.priceMax) && { key: "price", field: "price", label: priceChip, clear: () => { actions.priceMin(ANY_PRICE_MIN); actions.priceMax(ANY_PRICE_MAX); } },
    hasYearRange(values.yearMin, values.yearMax) && { key: "year", field: "year", label: yearChip, clear: () => { actions.yearMin(ANY_YEAR_MIN); actions.yearMax(ANY_YEAR_MAX); } },
    values.mileage !== ANY_MILEAGE && { key: "mileage", field: "mileage", label: values.mileage, clear: () => actions.mileage(ANY_MILEAGE) },
    ...extraChips,
  ].filter(Boolean);
  const sheetFooter = (
    <button type="button" className="primary sheet-submit" onClick={() => { setSheet(null); onSubmit?.(); }}>
      {resultCount == null ? "Показать авто" : `Показать ${resultCount} авто`}
    </button>
  );
  const brandRows = options.brands.filter((item) => item !== "Все марки");
  const modelRows = options.models.filter((item) => item !== ANY_MODEL);
  // Ищем так же, как умный поиск: понимаем набранное кириллицей («ауди», «зикр»),
  // незаконченные слова («ау» — это «au», «зик» — начало «зикр»), заглавные буквы
  // с телефонной клавиатуры и текст, набранный в русской раскладке вместо латинской.
  const searchRows = (rows) => listSearchMatches(rows, sheetQuery);
  // Список марок в шторке: сначала выбранная группа, потом поиск по строке.
  const brandSheetRows = searchRows(brandGroup === "Все" ? brandRows : brandRows.filter((item) => brandGroupOf(item) === brandGroup));
  const modelSearchRows = searchRows(modelRows);

  return (
    <section className={`search-box${constrained ? " search-box--constrained" : ""}`}>
      {narrow ? (
        <>
          {/* Одна кнопка вместо двух списков: марка сверху, под ней модели или
              подсказка «Указать модель». Крестик снимает выбор по ступеням. */}
          <div className={`brand-model-field${brandChosen ? " chosen" : ""}`}>
            <button type="button" className="brand-model-open" onClick={() => setSheet(brandChosen ? "models" : "brands")}>
              <CarProfile size={22} weight="duotone" aria-hidden="true" />
              <span className="brand-model-text">
                <b>{brandChosen ? values.brand : "Марка и модель"}</b>
                {brandChosen && <small>{selectedModels.length ? selectedModels.join(", ") : "Указать модель"}</small>}
              </span>
              {!brandChosen && <CaretRight size={18} weight="bold" aria-hidden="true" />}
            </button>
            {brandChosen && (
              <button type="button" className="brand-model-clear" onClick={stepBack} aria-label={selectedModels.length ? "Убрать модели" : "Убрать марку"}>
                <span className="brand-model-clear-plate"><X size={16} weight="bold" /></span>
              </button>
            )}
          </div>
          {/* Порядок строки: «Фильтры», иконка сохранения поиска, потом всё выбранное
              плашками (нажатие снимает этот параметр), а в конце — что ещё можно задать. */}
          <div className="filter-chip-row">
            {Boolean(onSaveSearch) && (
              <button
                type="button"
                className={`filter-chip filter-chip--save${searchSaved ? " saved" : ""}${searchUpdate ? " pending" : ""}`}
                onClick={() => (hasActiveFilters ? onSaveSearch() : setSheet("save-hint"))}
                aria-label={searchSaved ? "Убрать из сохранённых" : searchUpdate ? "Обновить поиск" : "Сохранить поиск"}
                title={searchSaved ? "Поиск сохранён — нажмите, чтобы убрать" : searchUpdate ? "Записать изменения в сохранённый поиск" : "Сохранить поиск"}
              >
                <BookmarkSimple size={18} weight={searchSaved || searchUpdate ? "fill" : "bold"} />
              </button>
            )}
            <button type="button" className={`filter-chip filter-chip--filters${extraChips.length ? " active" : ""}`} onClick={() => setSheet("filters")}>
              <SlidersHorizontal size={17} weight="bold" />
              Фильтры
              {Boolean(extraChips.length) && <span className="filter-chip-badge">{extraChips.length}</span>}
            </button>
            {chosenChips.map((chip) => (
              <span className="filter-chip-pair" key={chip.key}>
                <button type="button" className="filter-chip active" onClick={() => setSheet(`field:${chip.field}`)}>
                  {chip.label}
                </button>
                <button type="button" className="filter-chip-clear" onClick={chip.clear} aria-label={`Убрать: ${chip.label}`}>
                  <span className="filter-chip-x" aria-hidden="true"><X size={12} weight="bold" /></span>
                </button>
              </span>
            ))}
            {!hasPriceRange(values.priceMin, values.priceMax) && (
              <button type="button" className="filter-chip" onClick={() => setSheet("field:price")}>Цена</button>
            )}
            {!hasYearRange(values.yearMin, values.yearMax) && (
              <button type="button" className="filter-chip" onClick={() => setSheet("field:year")}>Год</button>
            )}
            {values.mileage === ANY_MILEAGE && (
              <button type="button" className="filter-chip" onClick={() => setSheet("field:mileage")}>Пробег</button>
            )}
          </div>
        </>
      ) : (
        <div className="filter-primary-row unified-filter-primary">
          <SelectField brandGrid label="Марка" value={values.brand} onChange={actions.brand} options={options.brands} optionCounts={optionCounts?.brands} optionIcon={(brand) => (brand === "Все марки" ? <SquaresFour size={18} weight="fill" /> : <BrandMark brand={brand} />)} optionHref={optionHrefs?.brand} searchable />
          <SelectField label="Модель" value={values.model} onChange={actions.model} options={options.models} optionCounts={optionCounts?.models} searchable multiple disabled={values.brand === "Все марки"} />
          {yearRange()}
          {priceRange()}
        </div>
      )}
      {!narrow && moreFiltersOpen && (
        <div className="filter-extra-row desktop-filter-extra" id={extraFiltersId}>
          {extraFilters()}
        </div>
      )}
      {/* Марки и модели — два шага одной шторки: меняется только её содержимое.
          Раньше это были две шторки, и при переходе вторая заново выезжала
          снизу — получался блик. */}
      {narrow && (sheet === "brands" || sheet === "models") && (
        <FilterSheet
          title={sheet === "models" ? (brandChosen ? values.brand : "Модели") : "Марки"}
          onBack={sheet === "models" ? () => { setSheetQuery(""); setSheet("brands"); } : null}
          onClose={() => setSheet(null)}
          footer={sheetFooter}
          scrollResetKey={sheet}
          fill
        >
          {/* Крестик очистки — свой, как в строке поиска на главной: у браузерного
              нет ни плашки, ни отступа от края. */}
          <SearchField
            className="sheet-search"
            value={sheetQuery}
            placeholder={sheet === "models" ? "Поиск модели" : "Поиск марки"}
            ariaLabel={sheet === "models" ? "Поиск модели" : "Поиск марки"}
            inputProps={{ autoComplete:"off" }}
            onValueChange={(next) => {
              setSheetQuery(next);
              // Ищем всегда по всем маркам: на вкладке «Германия» запрос «Зикр»
              // показывал пустоту, хотя марка в каталоге есть. Начали печатать —
              // вкладка возвращается на «Все», чтобы было видно, где ищем.
              if (next.trim()) setBrandGroup("Все");
            }}
          />
          {sheet === "brands" ? (
            <>
              <div className="sheet-tabs" role="tablist" aria-label="Группы марок">
                {BRAND_GROUPS.map((group) => (
                  <button type="button" key={group} role="tab" aria-selected={brandGroup === group} className={`sheet-tab${brandGroup === group ? " chosen" : ""}`} onClick={() => setBrandGroup(group)}>
                    {group}
                  </button>
                ))}
              </div>
              <div className="sheet-options">
                {/* Строка «Все марки» есть только в общей группе и только пока
                    не ищут: под вкладкой «Германия» она сбрасывала бы выбор ко
                    всему каталогу, а в результатах поиска была бы лишней. Значок
                    лежит в такой же коробке, как знак марки, иначе названия в
                    списке начинались бы на разной ширине от края. */}
                {brandGroup === "Все" && !sheetQuery.trim() && (
                  <button type="button" className={`sheet-option${brandChosen ? "" : " chosen"}`} onClick={() => { actions.brand("Все марки"); setSheet(null); }}>
                    <span className="brand-logo" aria-hidden="true"><SquaresFour size={20} weight="fill" /></span>
                    <span className="sheet-option-name">Все марки</span>
                    <span className="sheet-option-count">{number(optionCounts?.brands?.get("Все марки") || 0)}</span>
                    <CaretRight size={16} weight="bold" aria-hidden="true" />
                  </button>
                )}
                {brandSheetRows.map((brand) => (
                  <button type="button" key={brand} className={`sheet-option${values.brand === brand ? " chosen" : ""}`} onClick={() => { actions.brand(brand); setSheetQuery(""); setSheet("models"); }}>
                    <BrandMark brand={brand} />
                    <span className="sheet-option-name">{brand}</span>
                    <span className="sheet-option-count">{number(optionCounts?.brands?.get(brand) || 0)}</span>
                    <CaretRight size={16} weight="bold" aria-hidden="true" />
                  </button>
                ))}
                {!brandSheetRows.length && <p className="select-empty">Ничего не найдено</p>}
              </div>
            </>
          ) : (
            <div className="sheet-options">
              {modelSearchRows.map((model) => {
                const checked = selectedModels.includes(model);
                return (
                  <div className={`sheet-option sheet-option--check${checked ? " chosen" : ""}`} key={model}>
                    {/* По строке — только эта модель, и шторка закрывается. По галочке —
                        набор из нескольких моделей, шторка остаётся открытой. */}
                    <button type="button" className="sheet-option-main" onClick={() => { actions.model([model]); setSheet(null); }}>
                      <span className="sheet-option-name">{model}</span>
                      <span className="sheet-option-count">{number(optionCounts?.models?.get(model) || 0)}</span>
                    </button>
                    <button
                      type="button"
                      className="sheet-option-check"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={`${model}: ${checked ? "убрать" : "добавить к выбранным"}`}
                      onClick={() => actions.model(checked ? selectedModels.filter((item) => item !== model) : [...selectedModels, model])}
                    >
                      {checked && <Check size={14} weight="bold" aria-hidden="true" />}
                    </button>
                  </div>
                );
              })}
              {!modelSearchRows.length && <p className="select-empty">{modelRows.length ? "Ничего не найдено" : "Загружаем модели…"}</p>}
            </div>
          )}
        </FilterSheet>
      )}
      {narrow && sheet === "filters" && (
        <FilterSheet title="Фильтры" onClose={() => setSheet(null)} footer={sheetFooter}>
          <div className="mobile-filter-sheet-fields">
            {yearRange()}
            {priceRange()}
            {extraFilters()}
          </div>
        </FilterSheet>
      )}
      {narrow && sheet === "save-hint" && (
        <FilterSheet
          title="Сохранить поиск"
          onClose={() => setSheet(null)}
          hideClose
          icon={<BookmarkSimple size={26} weight="bold" />}
          footer={<button type="button" className="primary sheet-submit" onClick={() => setSheet(null)}>Понятно</button>}
        >
          <p className="sheet-hint">Выберите марку или фильтр — тогда поиск будет что запомнить.</p>
        </FilterSheet>
      )}
      {narrow && String(sheet).startsWith("field:") && Boolean(filterFields[String(sheet).slice(6)]) && (
        <FilterSheet title={filterFields[String(sheet).slice(6)][0]} onClose={() => setSheet(null)} footer={sheetFooter} compact>
          <div className="mobile-filter-sheet-fields">{filterFields[String(sheet).slice(6)][1]()}</div>
        </FilterSheet>
      )}
      {hasExclusions(values) && (
        <div className="filter-exclusions">
          <span className="filter-exclusions-label">Кроме</span>
          {EXCLUDE_KEYS.flatMap((key) => exclusionValues(values, key).map((item) => (
            <button type="button" key={`${key}-${item}`} onClick={() => actions.removeExclusion?.(key, item)} aria-label={`Вернуть в выдачу: ${item}`}>
              {item}
              <X size={14} weight="bold" />
            </button>
          )))}
        </div>
      )}
      {/* Нижняя строка панели — только на широком экране: на телефоне сохранение
          поиска ушло иконкой в ленту фильтров, а результат показывает сама выдача. */}
      {!narrow && (
        <div className="filter-actions-row">
          <button
            type="button"
            className="more-filters-toggle"
            aria-expanded={moreFiltersOpen}
            aria-controls={extraFiltersId}
            onClick={() => setMoreFiltersOpen((open) => {
              onExpandedChange?.(!open);
              return !open;
            })}
          >
            <SlidersHorizontal size={17} />
            <span className="more-filters-toggle-label">{moreFiltersOpen ? "Скрыть фильтры" : "Ещё фильтры"}</span>
            <CaretDown size={15} weight="bold" />
          </button>
          {/* «Сохранить поиск» стоит у кнопки «Показать» всегда, а «Сбросить» появляется
              левее, через черточку (решение Сергея 25.09.2026): кнопка сохранения не
              прыгает, когда сброс появляется или пропадает. Сброс может жить по своему
              правилу (`canReset`): в каталоге он не трогает марку и модель. */}
          {(canReset ?? hasActiveFilters) && (
            <button type="button" className="search-reset" onClick={onReset}>
              <X size={16} weight="bold" />
              Сбросить
            </button>
          )}
          {hasActiveFilters && onSaveSearch && (canReset ?? hasActiveFilters) && <span className="filter-actions-divider" aria-hidden="true" />}
          {hasActiveFilters && onSaveSearch && (
            <button
              type="button"
              className={`search-save${searchSaved ? " saved" : ""}${searchUpdate ? " pending" : ""}`}
              onClick={onSaveSearch}
              aria-label={searchSaved ? "Поиск сохранён" : searchUpdate ? "Обновить поиск" : "Сохранить поиск"}
              title={searchSaved ? "Поиск сохранён — открыть «Мои поиски»" : searchUpdate ? "Записать изменения в сохранённый поиск" : "Сохранить поиск"}
            >
              <BookmarkSimple size={18} weight={searchSaved || searchUpdate ? "fill" : "bold"} />
              <span>{searchSaved ? "Поиск сохранён" : searchUpdate ? "Обновить поиск" : "Сохранить поиск"}</span>
            </button>
          )}
          <button type="button" className="primary search-submit" onClick={onSubmit}>
            <MagnifyingGlass size={20} weight="bold" />
            {resultCount == null ? "Показать авто" : `Показать ${resultCount} авто`}
          </button>
        </div>
      )}
    </section>
  );
}

function QuickSearch({ navigate, cars, apiMode, totalCount }) {
  const [type, setType] = useState("Все");
  const [brand, setBrand] = useState("Все марки");
  const [model, setModel] = useState([]);
  const [bodyType, setBodyType] = useState([]);
  const [color, setColor] = useState([]);
  const [yearMin, setYearMin] = useState(ANY_YEAR_MIN);
  const [yearMax, setYearMax] = useState(ANY_YEAR_MAX);
  const [mileage, setMileage] = useState(ANY_MILEAGE);
  const [priceMin, setPriceMin] = useState(ANY_PRICE_MIN);
  const [priceMax, setPriceMax] = useState(ANY_PRICE_MAX);
  const [country, setCountry] = useState(ANY_COUNTRY);
  const [drive, setDrive] = useState(ANY_DRIVE);
  const [owners, setOwners] = useState(ANY_OWNERS);
  const [battery, setBattery] = useState(ANY_BATTERY);
  const [condition, setCondition] = useState(ANY_CONDITION);
  const [accel, setAccel] = useState(ANY_ACCEL);
  const [tire, setTire] = useState(ANY_TIRE);
  const [range, setRange] = useState(ANY_RANGE);
  const [engine, setEngine] = useState(ANY_ENGINE);
  const [power, setPower] = useState(ANY_POWER);
  const [gearbox, setGearbox] = useState(ANY_GEARBOX);
  const [fuel, setFuel] = useState(ANY_FUEL);
  const [remoteMeta, setRemoteMeta] = useState(() => bootCatalogMeta(catalogMetaQuery(typeValue(type), brand, bodyType, country)) || EMPTY_CATALOG_META);
  // null — число для текущих фильтров ещё не посчитано: кнопка показывает
  // «Показать авто» без цифры вместо мгновенного «0 авто» при переключении.
  const [remoteCount, setRemoteCount] = useState(null);
  const countCacheRef = useRef(new Map());
  const normalizedType = typeValue(type);
  // Набор для признаков «есть ли что выбирать»: топливо и марка, как в справочнике
  // с сервера. Кузов сюда не входит — иначе поля прыгали бы при выборе кузова.
  const typedCars = cars.filter((car) => (normalizedType === "Все" || car.type === normalizedType) && (brand === "Все марки" || car.brand === brand));
  const brandCars = cars.filter((car) => (normalizedType === "Все" || car.type === normalizedType) && matchesMulti(car.bodyType, bodyType, ANY_BODY_TYPE));
  const modelCars = cars.filter((car) => (normalizedType === "Все" || car.type === normalizedType) && (brand === "Все марки" || car.brand === brand) && matchesMulti(car.bodyType, bodyType, ANY_BODY_TYPE));
  const brands = ["Все марки", ...(apiMode ? remoteMeta.brands.map((item) => item.brand) : uniqueSorted(cars.map((car) => car.brand)))];
  const models = ["Все модели", ...(apiMode ? remoteMeta.models.map((item) => item.model) : uniqueSorted(modelCars.map((car) => car.model)))];
  const brandEntries = apiMode ? remoteMeta.brands : [...brandCars.reduce((counts, car) => counts.set(car.brand, (counts.get(car.brand) || 0) + 1), new Map())].map(([brandName, count]) => ({ brand:brandName, count }));
  const modelEntries = apiMode ? remoteMeta.models : [...modelCars.reduce((counts, car) => counts.set(car.model, (counts.get(car.model) || 0) + 1), new Map())].map(([modelName, count]) => ({ model:modelName, count }));
  const brandOptionCounts = new Map(brandEntries.map((item) => [item.brand, Number(item.count) || 0]));
  const modelOptionCounts = new Map(modelEntries.map((item) => [item.model, Number(item.count) || 0]));
  if (brandEntries.length) brandOptionCounts.set("Все марки", brandEntries.reduce((total, item) => total + (Number(item.count) || 0), 0));
  if (modelEntries.length) modelOptionCounts.set("Все модели", modelEntries.reduce((total, item) => total + (Number(item.count) || 0), 0));
  const bodyTypes = ["Все кузова", ...(apiMode ? remoteMeta.bodyTypes.map((item) => item.body_type) : BODY_TYPES.filter((item) => cars.some((car) => car.bodyType === item)))];
  const drives = [ANY_DRIVE, ...orderDrives(apiMode ? remoteMeta.drives.map((item) => item.drive) : cars.map((car) => car.drive))];
  const countries = countryOptionsFor();
  const availability = apiMode ? remoteMeta.availability : localAvailability(typedCars);
  const resultCount = modelCars.filter((car) => matchesMulti(car.model, model, ANY_MODEL) && matchesColorLabels(car.bodyColor, multiValues(color, ANY_COLOR)) && matchesYears(car, yearMin, yearMax) && matchesMileageRange(car, mileage) && matchesPriceRange(car, priceMin, priceMax) && matchesAdvancedFilters(car, { country, drive, owners, battery, condition, accel, tire, range, engine, power, gearbox, fuel })).length;
  const hasActiveFilters = type !== "Все" || brand !== "Все марки" || multiValues(model, ANY_MODEL).length > 0 || multiValues(bodyType, ANY_BODY_TYPE).length > 0 || multiValues(color, ANY_COLOR).length > 0 || hasYearRange(yearMin, yearMax) || mileage !== ANY_MILEAGE || hasPriceRange(priceMin, priceMax) || country !== ANY_COUNTRY || drive !== ANY_DRIVE || owners !== ANY_OWNERS || battery !== ANY_BATTERY || condition !== ANY_CONDITION || accel !== ANY_ACCEL || tire !== ANY_TIRE || range !== ANY_RANGE || engine !== ANY_ENGINE || power !== ANY_POWER || gearbox !== ANY_GEARBOX || fuel !== ANY_FUEL;
  useEffect(() => {
    // Ждать загрузочный запрос незачем: справочник нужен сразу и уходит параллельно
    // с витриной. Останавливает его только выясненный статический режим.
    if (apiMode === false) return undefined;
    const metaKey = catalogMetaQuery(normalizedType, brand, bodyType, country);
    const carsQuery = new URLSearchParams({ limit: "1" });
    if (normalizedType !== "Все") carsQuery.set("type", normalizedType);
    if (brand !== "Все марки") carsQuery.set("brand", brand);
    appendMulti(carsQuery, "bodyType", bodyType, ANY_BODY_TYPE);
    appendMulti(carsQuery, "model", model, ANY_MODEL);
    colorValuesForLabels(multiValues(color, ANY_COLOR)).forEach((value) => carsQuery.append("color", value));
    appendYearRange(carsQuery, yearMin, yearMax);
    appendMileageRange(carsQuery, mileage);
    appendPriceRange(carsQuery, priceMin, priceMax);
    if (country !== ANY_COUNTRY) carsQuery.set("country", countryKey(country));
    if (drive !== ANY_DRIVE) carsQuery.set("drive", drive);
    if (owners !== ANY_OWNERS) carsQuery.set("ownersMax", String(filterNumber(owners)));
    if (battery !== ANY_BATTERY) carsQuery.set("batteryMin", String(batteryFloor(battery)));
    if (condition !== ANY_CONDITION) carsQuery.set("conditionGrade", conditionGrades[condition]);
    if (accel !== ANY_ACCEL) carsQuery.set("accelMax", String(filterNumber(accel)));
    if (tire !== ANY_TIRE) carsQuery.set("tireRimMin", String(filterNumber(tire)));
    if (range !== ANY_RANGE) carsQuery.set("rangeMin", String(filterNumber(range)));
    appendEngineRange(carsQuery, engine);
    appendPowerRange(carsQuery, power);
    if (gearbox !== ANY_GEARBOX) carsQuery.set("gearbox", gearbox);
    if (fuel !== ANY_FUEL) carsQuery.set("fuel", fuel);
    // Числа для уже виденных комбинаций фильтров помним: повторное переключение
    // показывает счётчик сразу, без мигания. Прячем цифру только на первый подсчёт —
    // чужое число (или «0») на кнопке хуже, чем секунда без числа.
    const countKey = carsQuery.toString();
    const cached = countCacheRef.current.get(countKey);
    setRemoteCount(cached ?? null);
    const controller = new AbortController();
    let cancelled = false;
    // Справочник уходит сразу и без задержки: от него зависит, какие поля вообще
    // показывать, и ждать из-за них подсчёт машин на кнопке незачем — иначе панель
    // фильтров достраивается у посетителя на глазах. Повторов не будет: запрос по
    // одной и той же строке отдаётся из общего обещания.
    requestCatalogMeta(metaKey)
      .then((meta) => {
        if (!cancelled) setRemoteMeta(meta);
      })
      .catch(() => {});
    const timer = window.setTimeout(async () => {
      try {
        // Пока ни один фильтр не выбран, кнопка показывает общее число из загрузочного
        // запроса, поэтому считать то же самое второй раз незачем.
        if (!hasActiveFilters) return;
        const catalog = await fetchCarsJson(`/api/cars?${carsQuery}`, controller.signal);
        if (cancelled) return;
        countCacheRef.current.set(countKey, catalog.total);
        setRemoteCount(catalog.total);
      } catch {}
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [apiMode, hasActiveFilters, normalizedType, brand, model, bodyType, color, yearMin, yearMax, mileage, priceMin, priceMax, drive, owners, battery, condition, accel, tire, range, engine, power, gearbox, fuel]);
  // Выбранная модель при смене типа двигателя остаётся: марку и модель посетитель
  // выбирал сам, и сбрасывать их за него нельзя. Не совпало с типом — он увидит
  // пустую выдачу и снимет лишнее сам.
  const changeType = (value) => {
    setType(value);
    // Фильтры своего топлива при смене вкладки уходят с экрана — см. POWERTRAIN_FILTER_RESET.
    setBattery(ANY_BATTERY);
    setRange(ANY_RANGE);
    setEngine(ANY_ENGINE);
    setGearbox(ANY_GEARBOX);
    setFuel(tabSelection(value).fuel);
  };
  const changeBrand = (value) => {
    setBrand(value);
    setModel([]);
  };
  const resetFilters = () => {
    setType("Все");
    setBrand("Все марки");
    setModel([]);
    setBodyType([]);
    setColor([]);
    setYearMin(ANY_YEAR_MIN);
    setYearMax(ANY_YEAR_MAX);
    setMileage(ANY_MILEAGE);
    setPriceMin(ANY_PRICE_MIN);
    setPriceMax(ANY_PRICE_MAX);
    setCountry(ANY_COUNTRY);
    setDrive(ANY_DRIVE);
    setOwners(ANY_OWNERS);
    setBattery(ANY_BATTERY);
    setCondition(ANY_CONDITION);
    setAccel(ANY_ACCEL);
    setTire(ANY_TIRE);
    setRange(ANY_RANGE);
    setEngine(ANY_ENGINE);
    setPower(ANY_POWER);
    setGearbox(ANY_GEARBOX);
    setFuel(ANY_FUEL);
  };
  return (
    <VehicleSearch
      constrained
      selectedType={tabLabel(normalizedType, fuel)}
      onTypeChange={changeType}
      values={{ brand, model, yearMin, yearMax, priceMin, priceMax, mileage, bodyType, color, country, drive, owners, battery, condition, accel, tire, range, engine, power, gearbox, fuel }}
      actions={{
        brand: changeBrand,
        model: setModel,
        yearMin: (value) => {
          setYearMin(value);
          setYearMax((current) => clampYearMax(value, current));
        },
        yearMax: setYearMax,
        priceMin: (value) => {
          setPriceMin(value);
          setPriceMax((current) => clampPriceMax(value, current));
        },
        priceMax: setPriceMax,
        mileage: setMileage,
        bodyType: setBodyType,
        color: setColor,
        country: setCountry,
        drive: setDrive,
        owners: setOwners,
        battery: setBattery,
        condition: setCondition,
        accel: setAccel,
        tire: setTire,
        range: setRange,
        engine: setEngine,
        power: setPower,
        gearbox: setGearbox,
        fuel: setFuel,
      }}
      options={{ brands, models, bodyTypes, drives, countries }}
      optionCounts={{ brands:brandOptionCounts, models:modelOptionCounts }}
      availability={availability}
      resultCount={hasActiveFilters ? (apiMode ? remoteCount : resultCount) : (totalCount || cars.length) ? formatRoundedListingCount(totalCount || cars.length) : null}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      // Адрес собираем без подписей «не выбрано». Раньше в ссылку уходил весь набор
      // списков сразу, и с главной без фильтров уезжало «?type=Все&mileage=Пробег&…» —
      // строка на две сотни символов вместо «/catalog». Выдачу это не меняло: подписи
      // и сервер, и каталог пропускают, — но такую ссылку нельзя ни отправить, ни
      // выложить. Сборка общая с сохранённым поиском, поэтому имена параметров совпадают.
      onSubmit={() => navigate(savedSearchCatalogHref({ type: normalizedType, brand, model, bodyType, color, yearMin, yearMax, mileage, priceMin, priceMax, drive, owners, battery, condition, accel, tire, range, engine, power, gearbox, fuel }))}
    />
  );
}

// Быстрый поиск на главной: словари марок, моделей, кузовов и коробок живут
// в отдельном модуле (src/search-dictionary.js) — там их проверяют тесты.
async function parseHeroSearch(query, context) {
  const parsed = await parseHeroSearchOnce(query, context);
  // Разбор по словарю важнее свободного поиска по карточкам: «pbrh» — это «зикр»
  // в латинской раскладке, а не слово, которое надо искать в характеристиках.
  if (parsed?.matched && !parsed.textOnly) return parsed;
  const swapped = swapKeyboardLayout(query);
  if (searchNormalize(swapped) === searchNormalize(query)) return parsed;
  const alt = await parseHeroSearchOnce(swapped, context);
  // Запоминаем исправленный текст — выдача покажет его рядом с запросом.
  if (alt?.matched && !alt.textOnly) return { ...alt, correctedQuery: swapped.trim() };
  return parsed;
}

async function parseHeroSearchOnce(query, { apiMode, cars, currency }) {
  // Сначала из запроса вынимаются цена, пробег и годы («от 25000 до 40000»,
  // «пробег до 50 тыс», «2021-2023»), остаток разбирается как марка и модель.
  const ranges = parseQueryRanges(rewriteQueryNames(query), { currency });
  const rawTokens = searchNormalize(ranges.rest).split(" ").filter(Boolean);
  // Страна в запросе («bmw из кореи», «корейские авто», «китайский кроссовер») — это
  // фильтр «Страна», а не слова для поиска по карточкам; предлог «из» перед ней тоже уходит.
  const countryOf = (token) => (/^(кита[йяе]|китайск\w*|china|chinese|cn)$/i.test(token) ? "china" : /^(коре[яию]|корейск\w*|korea|korean|kr)$/i.test(token) ? "korea" : null);
  let country = "";
  const tokens = rawTokens.filter((token, index) => {
    const key = countryOf(token);
    if (key) { country = countryLabel(key); return false; }
    return !(token === "из" && countryOf(rawTokens[index + 1]));
  });
  if (!tokens.length && !ranges.hasRanges && !country) return null;
  // Номер объявления (например, 59116012) — ищем эту конкретную машину.
  const idToken = tokens.find((token) => /^\d{6,}$/.test(token));
  if (idToken) return { matched: true, listingId: idToken, query: "", brand: "", models: [], yearFrom: "", yearTo: "", drive: "", bodyType: "", powertrain: "", gearbox: "", fuel: "", colors: [], priceMinUsd: null, priceMaxUsd: null, mileageMin: null, mileageMax: null, accelMax: null, batteryMin: null, rangeMin: null, engineMin: null, engineMax: null, powerMin: null, powerMax: null, ...emptyExclusions() };
  const yearFrom = ranges.yearFrom;
  const yearTo = ranges.yearTo;

  // Слова про привод, кузов, тип двигателя и цвет разбираются отдельно — и до
  // слова «кроме», и после него: то, что названо после, из выдачи убирается.
  const excludeAt = tokens.findIndex(isHeroExcludeWord);
  const wanted = collectHeroAliases(excludeAt === -1 ? tokens : tokens.slice(0, excludeAt));
  const unwanted = collectHeroAliases(excludeAt === -1 ? [] : tokens.slice(excludeAt + 1).filter((token) => !isHeroExcludeWord(token)));
  const { drive, bodyType, powertrain, gearbox, fuel, colors, words } = wanted;

  let brandEntries = [];
  let modelEntries = [];
  let metaLoaded = false;
  if (apiMode !== false) {
    try {
      const meta = await requestCatalogMeta("");
      brandEntries = meta.brands.map((item) => ({ name: item.brand, count: Number(item.count) || 0 }));
      modelEntries = meta.models.map((item) => ({ name: item.model, count: Number(item.count) || 0 }));
      metaLoaded = true;
    } catch {}
  }
  if (!metaLoaded) {
    const brandCounts = new Map();
    const modelCounts = new Map();
    for (const car of cars) {
      if (car.brand) brandCounts.set(car.brand, (brandCounts.get(car.brand) || 0) + 1);
      if (car.model) modelCounts.set(car.model, (modelCounts.get(car.model) || 0) + 1);
    }
    brandEntries = [...brandCounts].map(([name, count]) => ({ name, count }));
    modelEntries = [...modelCounts].map(([name, count]) => ({ name, count }));
  }

  // Названное после «кроме» раскладываем по тем же справочникам: сначала марка,
  // если слово похоже на марку целиком, иначе — модели (столько же, сколько нашёл
  // бы обычный поиск, чтобы «кроме 001» убирало и 001 FR).
  const exclusions = {
    ...emptyExclusions(),
    excludeBodyType: unwanted.bodyType ? [unwanted.bodyType] : [],
    excludeType: unwanted.powertrain ? [unwanted.powertrain] : [],
    excludeDrive: unwanted.drive ? [unwanted.drive] : [],
    excludeColor: unwanted.colors,
  };
  for (const segment of splitModelSegments(translateModelWords(translateBrandWords(unwanted.words)).join(" "))) {
    const brandHit = rankSearchEntries(brandEntries, segment)[0];
    if (brandHit && brandHit.rank >= 3) {
      if (!exclusions.excludeBrand.includes(brandHit.name)) exclusions.excludeBrand.push(brandHit.name);
      continue;
    }
    for (const entry of rankSearchEntries(modelEntries, segment).slice(0, 12)) {
      if (!exclusions.excludeModel.includes(entry.name)) exclusions.excludeModel.push(entry.name);
    }
  }

  const text = translateModelWords(translateBrandWords(words)).join(" ");
  const result = { matched: false, query: "", textOnly: false, brand: "", models: [], yearFrom, yearTo, drive, bodyType, powertrain, gearbox, fuel, colors, country, priceMinUsd: ranges.priceMinUsd, priceMaxUsd: ranges.priceMaxUsd, mileageMin: ranges.mileageMin, mileageMax: ranges.mileageMax, accelMax: ranges.accelMax, batteryMin: ranges.batteryMin, rangeMin: ranges.rangeMin, engineMin: ranges.engineMin, engineMax: ranges.engineMax, powerMin: ranges.powerMin, powerMax: ranges.powerMax, ...exclusions };
  if (!text) {
    result.matched = Boolean(ranges.hasRanges || drive || bodyType || powertrain || gearbox || fuel || colors.length || country || hasExclusions(exclusions));
    return result;
  }

  // Марку и модели из остатка текста разбирает отдельный модуль — там же лежат
  // словари названий, и там же этот разбор проверяют тесты.
  const found = await resolveBrandAndModels(text, {
    brandEntries,
    modelEntries,
    modelsOfBrand: async (brand) => {
      if (metaLoaded) {
        try {
          const meta = await requestCatalogMeta(new URLSearchParams({ brand }).toString());
          return meta.models.map((item) => ({ name: item.model, count: Number(item.count) || 0 }));
        } catch {
          return [];
        }
      }
      const counts = new Map();
      for (const car of cars) if (car.brand === brand && car.model) counts.set(car.model, (counts.get(car.model) || 0) + 1);
      return [...counts].map(([name, count]) => ({ name, count }));
    },
  });
  result.brand = found.brand;
  result.models = found.models;
  result.matched = found.matched;
  // Слова, не ставшие маркой или моделью, не пропадают: ими сужаем выдачу по
  // комплектации и характеристикам («byd yuan up surpass»). Когда словарь не узнал
  // вообще ничего, по карточкам ищется весь остаток строки — так находятся «lfp»,
  // «catl», «215/65 r16» и названия версий, которых нет в списке моделей.
  result.query = (found.ignored || []).join(" ");
  if (!found.matched) {
    result.query = text;
    result.textOnly = true;
    result.matched = true;
  }
  return result;
}

// Ссылка в каталог и запрос к серверу называют одни и те же фильтры по-разному:
// каталог ждёт yearFrom/body и множественное «Электромобили», сервер — yearMin/bodyType
// и единственное число. Из-за смешения этих имён год из поиска раньше терялся.
const heroCatalogHref = (parsed) => {
  const params = new URLSearchParams();
  // Не «q»: этим именем каталог называет строку, которую надо ещё разобрать, —
  // подстановка сюда разобранного текста зациклила бы страницу саму на себя.
  if (parsed.query) params.set("text", parsed.query);
  if (parsed.powertrain) params.set("type", typeLabel(parsed.powertrain));
  if (countryKey(parsed.country)) params.set("country", countryKey(parsed.country));
  if (parsed.brand) params.set("brand", parsed.brand);
  parsed.models.forEach((model) => params.append("model", model));
  if (parsed.bodyType) params.append("body", parsed.bodyType);
  if (parsed.yearFrom) params.set("yearFrom", parsed.yearFrom);
  if (parsed.yearTo) params.set("yearTo", parsed.yearTo);
  if (parsed.priceMinUsd != null) params.set("priceFrom", String(parsed.priceMinUsd));
  if (parsed.priceMaxUsd != null) params.set("priceTo", String(parsed.priceMaxUsd));
  const mileage = mileageLabel(parsed.mileageMin, parsed.mileageMax);
  if (mileage) params.set("mileage", mileage);
  (parsed.colors || []).forEach((color) => params.append("color", color));
  if (parsed.drive) params.set("drive", parsed.drive);
  if (parsed.accelMax != null) params.set("accel", `До ${parsed.accelMax} с`);
  if (parsed.batteryMin != null) params.set("battery", `От ${parsed.batteryMin} кВт·ч`);
  if (parsed.rangeMin != null) params.set("range", `От ${parsed.rangeMin} км`);
  const engine = engineLabel(parsed.engineMin, parsed.engineMax);
  if (engine) params.set("engine", engine);
  const power = powerLabel(parsed.powerMin, parsed.powerMax);
  if (power) params.set("power", power);
  if (parsed.gearbox) params.set("gearbox", parsed.gearbox);
  if (parsed.fuel) params.set("fuel", parsed.fuel);
  appendExclusions(params, parsed);
  const search = params.toString();
  return `/catalog${search ? `?${search}` : ""}`;
};
// Сохранённый поиск хранит фильтры каталога в одной и той же форме независимо от
// того, чем их заполнили: фиксированный порядок ключей делает сериализацию пригодной
// для сравнения «этот набор уже сохранён?» простым равенством строк.
const savedFilterDefaults = {
  type: "Все",
  brand: "Все марки",
  model: [],
  bodyType: [],
  color: [],
  yearMin: ANY_YEAR_MIN,
  yearMax: ANY_YEAR_MAX,
  mileage: ANY_MILEAGE,
  priceMin: ANY_PRICE_MIN,
  priceMax: ANY_PRICE_MAX,
  country: ANY_COUNTRY,
  drive: ANY_DRIVE,
  owners: ANY_OWNERS,
  battery: ANY_BATTERY,
  condition: ANY_CONDITION,
  accel: ANY_ACCEL,
  tire: ANY_TIRE,
  range: ANY_RANGE,
  engine: ANY_ENGINE,
  power: ANY_POWER,
  gearbox: ANY_GEARBOX,
  fuel: ANY_FUEL,
  ...emptyExclusions(),
  // Выбранная сортировка — часть поиска: открытый заново, он выглядит так же.
  sort: "default",
};
const savedSearchSortLabels = {
  price_asc: "сначала дешёвые",
  price_desc: "сначала дорогие",
  newest: "новые объявления",
  mileage_asc: "наименьший пробег",
  range_desc: "наибольший запас хода",
  year_desc: "новые по году",
  year_asc: "старые по году",
};
const normalizeSavedFilters = (filters = {}) => {
  const normalized = {};
  for (const [key, fallback] of Object.entries(savedFilterDefaults)) {
    const value = filters[key];
    normalized[key] = Array.isArray(fallback)
      ? multiValues(value ?? [], key === "model" ? ANY_MODEL : key === "color" ? ANY_COLOR : ANY_BODY_TYPE)
      : typeof value === "string" && value
        ? value
        : fallback;
  }
  return normalized;
};
const savedSearchKey = (filters) => JSON.stringify(normalizeSavedFilters(filters));
// Человеческое описание фильтров: из него складываются и заголовок сохранённого
// поиска, и строка-подпись на его карточке. Цены — в долларах, как они и хранятся.
const savedSearchChips = (filters) => {
  const chips = [];
  if (filters.type !== "Все") chips.push(tabLabel(filters.type, filters.fuel));
  const models = multiValues(filters.model, ANY_MODEL);
  if (filters.brand !== "Все марки") chips.push(models.length ? `${filters.brand} ${models.join(", ")}` : filters.brand);
  multiValues(filters.bodyType, ANY_BODY_TYPE).forEach((body) => chips.push(body));
  multiValues(filters.color, ANY_COLOR).forEach((color) => chips.push(color.toLowerCase()));
  const yearFrom = yearBound(filters.yearMin, ANY_YEAR_MIN);
  const yearTo = yearBound(filters.yearMax, ANY_YEAR_MAX);
  if (yearFrom !== null && yearTo !== null) chips.push(yearFrom === yearTo ? `${yearFrom} г.` : `${yearFrom}–${yearTo} г.`);
  else if (yearFrom !== null) chips.push(`от ${yearFrom} г.`);
  else if (yearTo !== null) chips.push(`до ${yearTo} г.`);
  const priceFrom = priceBound(filters.priceMin, ANY_PRICE_MIN);
  const priceTo = priceBound(filters.priceMax, ANY_PRICE_MAX);
  if (priceFrom !== null && priceTo !== null) chips.push(`$${number(priceFrom)}–$${number(priceTo)}`);
  else if (priceFrom !== null) chips.push(`от $${number(priceFrom)}`);
  else if (priceTo !== null) chips.push(`до $${number(priceTo)}`);
  if (filters.mileage !== ANY_MILEAGE) chips.push(filters.mileage);
  if (countryKey(filters.country)) chips.push(fromPhrase(countryKey(filters.country)));
  if (filters.drive !== ANY_DRIVE) chips.push(`${filters.drive} привод`);
  if (filters.owners !== ANY_OWNERS) chips.push(filters.owners.toLowerCase());
  if (filters.battery !== ANY_BATTERY) chips.push(`батарея ${filters.battery.toLowerCase()}`);
  if (filters.condition !== ANY_CONDITION) chips.push(filters.condition.toLowerCase());
  if (filters.accel && filters.accel !== ANY_ACCEL) chips.push(`разгон ${filters.accel.toLowerCase()}`);
  if (filters.tire && filters.tire !== ANY_TIRE) chips.push(`шины ${filters.tire.toLowerCase().replace("r", "R")}`);
  if (filters.range && filters.range !== ANY_RANGE) chips.push(`запас хода ${filters.range.toLowerCase()}`);
  if (filters.engine && filters.engine !== ANY_ENGINE) chips.push(`объём ${filters.engine}`);
  if (filters.power && filters.power !== ANY_POWER) chips.push(`мощность ${filters.power}`);
  if (filters.gearbox && filters.gearbox !== ANY_GEARBOX) chips.push(filters.gearbox.toLowerCase());
  if (filters.fuel && filters.fuel !== ANY_FUEL && !(filters.type === "ДВС" && FUEL_TYPES.includes(filters.fuel))) chips.push(filters.fuel.toLowerCase());
  const excluded = EXCLUDE_KEYS.flatMap((key) => exclusionValues(filters, key));
  if (excluded.length) chips.push(`кроме ${excluded.join(", ").toLowerCase()}`);
  if (savedSearchSortLabels[filters.sort]) chips.push(savedSearchSortLabels[filters.sort]);
  return chips;
};
const savedSearchTitle = (filters) => {
  const chips = savedSearchChips(filters);
  return chips.length ? chips.slice(0, 3).join(" · ") : "Все автомобили";
};
// Ссылка ведёт в каталог в том же формате, каким пользуется быстрый поиск главной:
// каталог разберёт её при монтировании и восстановит фильтры один в один.
const savedSearchCatalogHref = (filters) => {
  const params = new URLSearchParams();
  if (filters.type !== "Все") params.set("type", typeLabel(filters.type));
  if (filters.brand !== "Все марки") params.set("brand", filters.brand);
  multiValues(filters.model, ANY_MODEL).forEach((model) => params.append("model", model));
  multiValues(filters.bodyType, ANY_BODY_TYPE).forEach((body) => params.append("body", body));
  multiValues(filters.color, ANY_COLOR).forEach((color) => params.append("color", color));
  if (yearBound(filters.yearMin, ANY_YEAR_MIN) !== null) params.set("yearFrom", filters.yearMin);
  if (yearBound(filters.yearMax, ANY_YEAR_MAX) !== null) params.set("yearTo", filters.yearMax);
  if (filters.mileage !== ANY_MILEAGE) params.set("mileage", filters.mileage);
  if (priceBound(filters.priceMin, ANY_PRICE_MIN) !== null) params.set("priceFrom", filters.priceMin);
  if (priceBound(filters.priceMax, ANY_PRICE_MAX) !== null) params.set("priceTo", filters.priceMax);
  if (countryKey(filters.country)) params.set("country", countryKey(filters.country));
  if (filters.drive !== ANY_DRIVE) params.set("drive", filters.drive);
  if (filters.owners !== ANY_OWNERS) params.set("owners", filters.owners);
  if (filters.battery !== ANY_BATTERY) params.set("battery", filters.battery);
  if (filters.condition !== ANY_CONDITION) params.set("condition", filters.condition);
  if (filters.accel && filters.accel !== ANY_ACCEL) params.set("accel", filters.accel);
  if (filters.tire && filters.tire !== ANY_TIRE) params.set("tire", filters.tire);
  if (filters.range && filters.range !== ANY_RANGE) params.set("range", filters.range);
  if (filters.engine && filters.engine !== ANY_ENGINE) params.set("engine", filters.engine);
  if (filters.power && filters.power !== ANY_POWER) params.set("power", filters.power);
  if (filters.gearbox && filters.gearbox !== ANY_GEARBOX) params.set("gearbox", filters.gearbox);
  if (filters.fuel && filters.fuel !== ANY_FUEL) params.set("fuel", filters.fuel);
  appendExclusions(params, filters);
  if (filters.sort && filters.sort !== "default") params.set("sort", filters.sort);
  const search = params.toString();
  return `/catalog${search ? `?${search}` : ""}`;
};

const heroApiParams = (parsed) => {
  const params = new URLSearchParams();
  if (parsed.query) params.set("text", parsed.query);
  if (parsed.powertrain) params.set("type", parsed.powertrain);
  if (countryKey(parsed.country)) params.set("country", countryKey(parsed.country));
  if (parsed.brand) params.set("brand", parsed.brand);
  parsed.models.forEach((model) => params.append("model", model));
  if (parsed.bodyType) params.append("bodyType", parsed.bodyType);
  if (parsed.yearFrom) params.set("yearMin", parsed.yearFrom);
  if (parsed.yearTo) params.set("yearMax", parsed.yearTo);
  if (parsed.priceMinUsd != null) params.set("landedMin", String(parsed.priceMinUsd));
  if (parsed.priceMaxUsd != null) params.set("landedMax", String(parsed.priceMaxUsd));
  if (parsed.mileageMin != null) params.set("mileageMin", String(parsed.mileageMin));
  if (parsed.mileageMax != null) params.set("mileageMax", String(parsed.mileageMax));
  colorValuesForLabels(parsed.colors || []).forEach((value) => params.append("color", value));
  if (parsed.drive) params.set("drive", parsed.drive);
  if (parsed.accelMax != null) params.set("accelMax", String(parsed.accelMax));
  if (parsed.batteryMin != null) params.set("batteryMin", String(parsed.batteryMin));
  if (parsed.rangeMin != null) params.set("rangeMin", String(parsed.rangeMin));
  if (parsed.engineMin != null) params.set("engineMin", String(parsed.engineMin));
  if (parsed.engineMax != null) params.set("engineMax", String(parsed.engineMax));
  if (parsed.powerMin != null) params.set("powerMin", String(parsed.powerMin));
  if (parsed.powerMax != null) params.set("powerMax", String(parsed.powerMax));
  if (parsed.gearbox) params.set("gearbox", parsed.gearbox);
  if (parsed.fuel) params.set("fuel", parsed.fuel);
  appendExclusions(params, parsed, { api: true });
  return params;
};

// Те же варианты сортировки, что и в каталоге, — выдача поиска ведёт себя одинаково.
const HERO_SORT_OPTIONS = [
  { value: "default", label: "По умолчанию" },
  { value: "price_asc", label: "Дешёвые" },
  { value: "price_desc", label: "Дорогие" },
  { value: "newest", label: "Новые объявления" },
  { value: "mileage_asc", label: "С наименьшим пробегом" },
  { value: "range_desc", label: "С наибольшим запасом хода" },
  { value: "year_desc", label: "Новые по году" },
  { value: "year_asc", label: "Старые по году" },
];

function HeroSearch({ value, onChange, navigate }) {
  const fieldRef = useRef(null);
  // На телефоне прокрутка выдачи пальцем прячет экранную клавиатуру: снимаем
  // фокус со строки поиска. Слушаем именно касание, а не scroll — браузер сам
  // прокручивает страницу к полю при фокусе, и по scroll клавиатура закрывалась
  // бы сразу после открытия.
  useEffect(() => {
    const hideKeyboard = (event) => {
      const field = fieldRef.current;
      if (!field || field.contains(event.target)) return;
      const input = field.querySelector("input");
      if (input && document.activeElement === input) input.blur();
    };
    window.addEventListener("touchmove", hideKeyboard, { passive: true });
    return () => window.removeEventListener("touchmove", hideKeyboard);
  }, []);
  // На телефоне строка поиска стоит посреди первого экрана: с открытой клавиатурой
  // выдачи под ней просто не видно. При фокусе поднимаем строку под шапку.
  // Высоту шапки меряем на месте — она разная на телефоне и на десктопе.
  const liftFieldToTop = useCallback(() => {
    const field = fieldRef.current;
    if (!field) return;
    if (!window.matchMedia("(max-width: 900px), (pointer: coarse)").matches) return;
    const header = document.querySelector(".site-header");
    const top = Math.max(0, window.scrollY + field.getBoundingClientRect().top - ((header?.offsetHeight || 0) + 10));
    if (Math.abs(top - window.scrollY) < 2) return;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);
  // Клавиатура выезжает уже после фокуса и сама двигает страницу, поэтому
  // повторяем подъём, пока меняется видимая высота окна, — но не дольше секунды.
  const handleFocus = () => {
    liftFieldToTop();
    const viewport = window.visualViewport;
    if (!viewport) return;
    const repeat = () => liftFieldToTop();
    viewport.addEventListener("resize", repeat);
    window.setTimeout(() => viewport.removeEventListener("resize", repeat), 1000);
  };
  return (
    <div className="hero-search">
      <div className="hero-search-field" ref={fieldRef}>
        <MagnifyingGlass size={20} weight="bold" />
        <input
          type="search"
          value={value}
          placeholder="Очень умный поиск"
          aria-label="Поиск по каталогу"
          enterKeyHint="search"
          autoComplete="off"
          onFocus={handleFocus}
          onChange={(event) => onChange(event.target.value)}
        />
        {/* Пока строка пустая — кнопка фильтров, появился текст — крестик очистки. */}
        {value ? (
          <button type="button" className="hero-search-clear" aria-label="Очистить поиск" onClick={() => onChange("")}>
            <X size={18} weight="bold" />
          </button>
        ) : (
          <AppLink href="/catalog" navigate={navigate} className="hero-search-filters" aria-label="Открыть фильтры в каталоге">
            <SlidersHorizontal size={21} weight="bold" />
            <span>Фильтры</span>
          </AppLink>
        )}
      </div>
    </div>
  );
}

// Ширина экрана как состояние. Не useState с matchMedia, а useSyncExternalStore:
// главную страницу собирает и сервер, где экрана нет, — там ширина берётся из
// третьего аргумента («настольный» вариант). Браузер при оживлении готовой разметки
// сначала рисует так же, а сразу после сверки перечитывает настоящую ширину — React
// перерисовывает только компоненты с этим хуком, а не всю страницу, как было бы
// при расхождении серверной и браузерной разметки. На страницах, которые рисуются
// с нуля (каталог, карточка), хук ведёт себя как прежний useState: настоящая ширина
// известна с первого рисования.
const useMediaQuery = (query) => {
  const subscribe = useCallback(
    (notify) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
};

// Порог тот же, что в стилях: до 700 точек карточка показывает ленту фотографий,
// выше — один кадр, который меняется под курсором.
const NARROW_VIEWPORT = "(max-width: 700px)";

const useNarrowViewport = () => useMediaQuery(NARROW_VIEWPORT);

// Фото проданной машины не показываем и не храним (решение владельца 28.09.2026):
// вместо кадра — серый блок с плашкой, чтобы чистка могла удалять снимки сразу.
function SoldVehiclePhoto({ car, className = "", detail = false }) {
  return (
    <div className={`${className} sold-vehicle-photo${detail ? " gallery-panel" : " hover-image-preview"}`} role="img" aria-label={`${car.title}: продано`}>
      <strong>Продано</strong>
    </div>
  );
}

// У проданной машины карточка тоже перестаёт быть мини-галереей: серый блок
// с тем же состоянием, которое посетитель увидит на полной странице.
function HoverImagePreview(props) {
  if (props.car.available === false) return <SoldVehiclePhoto car={props.car} className={props.className} />;
  return <ActiveHoverImagePreview {...props} />;
}

function ActiveHoverImagePreview({ car, className, mobileStrip = false, onMobileOpen, badge = null }) {
  const images = (car.images?.length ? car.images : [car.image]).slice(0, 5);
  const narrow = useNarrowViewport();
  // Один размер превью для телефона и компьютера, общий с серверной копией.
  const frameWidth = IMAGE_WIDTH_CARD;
  const [active, setActive] = useState(0);
  // Отрезок кадра, который сейчас едет: пока снимка нет, он наливается прогрессом.
  const [pending, setPending] = useState(-1);
  const pendingTimer = useRef(0);
  const wantedFrame = useRef(0);
  const frameRef = useRef(null);
  const mobileStripRef = useRef(null);
  const mobileStripStart = useRef(0);
  const mobileStripMoved = useRef(false);

  const cover = images[0];
  useEffect(() => {
    const frame = frameRef.current;
    const card = frame?.closest("[data-car-id]") || frame;
    if (!card || !cover) return undefined;
    return bindPhotoIntent(card, imageSource(cover, IMAGE_ORIGINAL));
  }, [cover]);

  const previewKey = JSON.stringify(images.map(src => imageSource(src, frameWidth)));
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !window.matchMedia("(hover: hover) and (pointer: fine)").matches || typeof IntersectionObserver === "undefined") return undefined;
    const connection = navigator.connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return undefined;
    const inCatalog = Boolean(frame.closest("main.catalog"));
    const ahead = inCatalog ? Math.min(1600, Math.max(600, window.innerHeight * 1.5)) : 300;
    // В каталоге готовим и обложку следующей машины, ещё до её lazy-загрузки.
    const frames = JSON.parse(previewKey);
    const urls = (car.source === "Guazi" ? frames.slice(0, 2) : frames).slice(inCatalog ? 0 : 1);
    return observeHoverPhotos(frame, urls, { ahead });
  }, [previewKey, car.source]);
  // Карточку целиком перекрывает ссылка-подложка, поэтому до самого превью события
  // мыши не доходят: слушаем их на карточке, а кадр считаем по границам картинки.
  useEffect(() => {
    const frame = frameRef.current;
    const card = frame?.closest("[data-car-id]") || frame;
    if (!card || images.length < 2) return undefined;
    let disposed = false;
    const stopWaiting = () => { clearTimeout(pendingTimer.current); setPending(-1); };
    const reset = () => { wantedFrame.current = 0; stopWaiting(); setActive(0); };
    const urls = JSON.parse(previewKey);
    const selectByCursor = (event) => {
      const bounds = frame.getBoundingClientRect();
      const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      if (!inside) return reset();
      const progress = Math.min(0.9999, Math.max(0, (event.clientX - bounds.left) / bounds.width));
      const index = Math.floor(progress * urls.length);
      if (wantedFrame.current === index) return;
      wantedFrame.current = index;
      stopWaiting();
      if (index === 0) return setActive(0);
      // Снимок из кэша встаёт мгновенно, поэтому полоску ожидания включаем с
      // задержкой: иначе она мигала бы под курсором на каждом готовом кадре.
      pendingTimer.current = setTimeout(() => {
        if (!disposed && wantedFrame.current === index) setPending(index);
      }, 120);
      prepareHoverPhoto(urls[index], { urgent: true }).then(ready => {
        if (disposed || wantedFrame.current !== index) return;
        stopWaiting();
        // Пока выбранный снимок едет, оставляем предыдущий — без пустой рамки.
        if (ready) setActive(index);
        else wantedFrame.current = -1;
      });
    };
    reset();
    card.addEventListener("mousemove", selectByCursor);
    card.addEventListener("mouseleave", reset);
    return () => {
      disposed = true;
      clearTimeout(pendingTimer.current);
      card.removeEventListener("mousemove", selectByCursor);
      card.removeEventListener("mouseleave", reset);
    };
  }, [car.id, previewKey]);

  // Одну из двух половин рисуем, а не прячем стилями. Кадр под курсором на телефоне
  // скрыт (`display: none`), но браузер всё равно его качал: на главной это двадцать
  // невидимых снимков и почти мегабайт мимо экрана.
  const strip = mobileStrip && narrow;
  const hiddenImages = Math.max(0, (car.images?.length || 1) - images.length);

  return (
    <div className={`${className} hover-image-preview`} ref={frameRef}>
      {!strip && <img src={imageSource(images[active], frameWidth)} alt={car.title} loading="lazy" draggable="false" onError={(event) => retryWithFullImage(event, images[active])} />}
      {strip && (
        <div
          className="car-row-mobile-image-strip"
          ref={mobileStripRef}
          onPointerDown={() => {
            mobileStripStart.current = mobileStripRef.current?.scrollLeft || 0;
            mobileStripMoved.current = false;
          }}
          onScroll={() => {
            const currentScroll = mobileStripRef.current?.scrollLeft || 0;
            if (Math.abs(currentScroll - mobileStripStart.current) > 4) mobileStripMoved.current = true;
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (!mobileStripMoved.current) onMobileOpen?.();
          }}
        >
          {images.map((image, index) => {
            const frame = (
              <StripPhoto
                first={index === 0}
                src={imageSource(image, IMAGE_WIDTH_STRIP)}
                alt={index === 0 ? car.title : ""}
                draggable="false"
                onError={(event) => retryWithFullImage(event, image)}
                loading="lazy"
              />
            );
            // На последнем кадре ленты видно, что снимков больше, чем поместилось:
            // сам кадр приглушён и размыт, поверх — сколько фотографий осталось.
            if (index === images.length - 1 && hiddenImages > 0) {
              return (
                <div className="car-row-mobile-image-more" key={`${image}-mobile-${index}`}>
                  {frame}
                  <span>и ещё {hiddenImages} фото</span>
                </div>
              );
            }
            return <Fragment key={`${image}-mobile-${index}`}>{frame}</Fragment>;
          })}
        </div>
      )}
      {images.length > 1 && (
        <div className="hover-image-segments" aria-hidden="true">
          {images.map((image, index) => {
            const waiting = index === pending && index !== active;
            return (
              <i key={`${image}-${index}`} className={waiting ? "loading" : index === active ? "active" : ""}>
                {waiting && <b />}
              </i>
            );
          })}
        </div>
      )}
      <span className="hover-image-count">
        <Images size={13} weight="bold" />
        {car.images?.length || 1}
      </span>
      {badge}
    </div>
  );
}

function FeaturedCard({ car, onClick, favorite, toggleFavorite, anchorKey, hideNewBadge = false }) {
  const currency = useCurrency();
  const price = estimateLandedCost(car);
  // Карточка целиком нажимается мышью, но кнопкой не притворяется: роль кнопки на блоке
  // со ссылками и своими кнопками внутри сбивает чтение с экрана, а её имя («Открыть …»)
  // не совпадало с написанным на карточке. С клавиатуры машину открывает ссылка-заголовок.
  return (
    <article className="featured-card" data-car-id={car.id} data-feed-key={anchorKey} onClick={onClick}>
      <CardLinkOverlay car={car} open={onClick} />
      <HoverImagePreview car={car} className="featured-image" badge={hideNewBadge ? null : <NewListingBadge car={car} />} />
      {toggleFavorite && (
        <button
          type="button"
          className={`featured-favorite${favorite ? " selected" : ""}`}
          aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"}
          onClick={(event) => {
            event.stopPropagation();
            toggleFavorite(car.id);
          }}
        >
          <Heart size={20} weight={favorite ? "fill" : "regular"} />
        </button>
      )}
      <div className="featured-body">
        <h3><AppLink href={carHref(car)} navigate={onClick} onClick={(event) => event.stopPropagation()}>{car.title}</AppLink></h3>
        {/* Тип и привод — отдельной обёрткой: в узкой плитке на телефоне (две в
            ряд) для них нет места, и там строка остаётся одним пробегом. */}
        <p>
          {number(car.mileage)} км
          <span className="featured-card-specs-more"> · {powertrainName(car.type)} · {car.drive}</span>
        </p>
        <div className="featured-price">
          <TotalPrice car={car} price={price} currency={currency} />
        </div>
      </div>
    </article>
  );
}

// ── Каталожная страница модели: `/catalog/<марка>/<модель>` ─────────────────
// С 25.09.2026 у модели одна страница, и это раздел каталога — тот же компонент
// Catalog с боковыми фильтрами, что у страницы марки, только с выбранной моделью.
// Под выдачей — живые цифры, обзор (если написан) и вопросы (ModelLandingNotes).
// Сервер рисует эту же страницу заранее и встраивает в неё данные
// (window.__boot: modelCatalog, catalogValue, metaValue), браузер её оживляет.

// Модели каждой марки, которые каталог уже видел в справочнике фильтров: по ним
// адрес модели превращается в её имя без запроса — для перехода по ссылке со
// страницы марки, чтобы каталог не пропадал на время ответа.
const brandModelsCache = new Map();

/**
 * Предварительный раздел модели — без цифр, обзора и ссылок, но с именем: чтобы при
 * переходе на другую модель каталог оставался на экране и не мигал заглушками.
 * Имя берётся из обзора, из снимка фильтров в истории (смена модели плашкой) или из
 * справочника моделей марки; если взять неоткуда — null, и страница ждёт ответа.
 */
function provisionalModelLanding(path) {
  const parsed = parseModelLandingPath(path);
  if (!parsed) return null;
  const review = findModelPage(path);
  let model = review?.model || null;
  if (!model) {
    const filters = window.history.state?.catalog?.filters;
    const chosen = filters && filters.brand === parsed.brand ? multiValues(filters.model, ANY_MODEL) : [];
    if (chosen.length === 1 && modelSlug(chosen[0]) === parsed.modelSlug) model = chosen[0];
  }
  if (!model) model = modelFromSlug(brandModelsCache.get(parsed.brand) || [], parsed.modelSlug);
  if (!model) return null;
  return modelLandingObject({
    model: { brand: parsed.brand, model, name: review?.name || `${parsed.brand} ${model}`, path, brandSlug: parsed.brandSlug, modelSlug: parsed.modelSlug, inCatalog: true },
    review: review ? { slug: review.slug, path: review.path, legacyPath: review.legacyPath, name: review.name, h1: review.h1, lead: review.lead, teaser: review.teaser, tagline: review.tagline } : null,
    facts: null,
    links: { brandPath: brandLandingPath(parsed.brand), sections: [], siblings: [], similar: [], journal: [] },
  });
}

/**
 * Раздел модели по адресу: из встроенных сервером данных, иначе запросом
 * `/api/model-catalog` без списка машин (список каталог запросит сам). Пока раздел
 * не известен, страница показывает загрузку — без имени модели каталог не соберёт
 * запрос.
 */
function useModelLanding(path) {
  const parsed = parseModelLandingPath(path);
  const key = parsed ? path : null;
  const [state, setState] = useState(() => {
    const boot = window.__boot?.modelCatalog;
    return key && boot?.model?.path === key ? { key, landing: modelLandingObject(boot), failed: false } : { key: null, landing: null, failed: false };
  });
  useEffect(() => {
    if (!key || state.key === key) return undefined;
    const controller = new AbortController();
    fetch(`/api/model-catalog?brand=${encodeURIComponent(parsed.brandSlug)}&model=${encodeURIComponent(parsed.modelSlug)}&light=1`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.status === 404 ? "missing" : "unavailable"))))
      .then((data) => setState({ key, landing: modelLandingObject(data), failed: false }))
      .catch((error) => {
        if (error.name !== "AbortError") setState({ key, landing: null, failed: error.message === "missing" ? "missing" : true });
      });
    return () => controller.abort();
  }, [key]);
  if (!key) return { landing: null, provisional: null, loading: false, failed: false };
  const ready = state.key === key;
  return { landing: ready ? state.landing : null, provisional: ready ? null : provisionalModelLanding(path), loading: !ready, failed: ready ? state.failed : false };
}

const brandLogos = {
  BYD: "byd.svg",
  Zeekr: "zeekr.svg",
  "Li Auto": "li-auto.svg",
  Voyah: "voyah.svg",
  Deepal: "deepal.svg",
  Dongfeng: "dongfeng.svg",
  Avatr: "avatr.svg",
  AITO: "aito.svg",
  Luxeed: "luxeed.svg",
  Shangjie: "shangjie.svg",
  Stelato: "stelato.svg",
  Maextro: "maextro.svg",
  Xiaomi: "xiaomi.svg",
  XPeng: "xpeng.svg",
  NIO: "nio.svg",
  Denza: "denza.svg",
  BMW: "bmw.svg",
  Volkswagen: "volkswagen.svg",
  Audi: "audi.svg",
  Leapmotor: "leapmotor.svg",
  Tesla: "tesla.svg",
  "Mercedes-Benz": "mercedes-benz.svg",
  "Lynk & Co": "lynk-co.svg",
  Mazda: "mazda.svg",
  Toyota: "toyota.svg",
  AION: "aion.svg",
  ORA: "ora.svg",
  Hongqi: "hongqi.svg",
  Jaecoo: "jaecoo.svg",
  Omoda: "omoda.svg",
  "Land Rover": "land-rover.svg",
  Porsche: "porsche.svg",
  Buick: "buick.svg",
  Ford: "ford.svg",
  // После объединения Geely и Galaxy используем выбранный логотип Galaxy.
  Geely: "geely-galaxy.svg",
  Haval: "haval.svg",
  Changan: "changan.svg",
  Chevrolet: "chevrolet.svg",
  Honda: "honda.svg",
  Hyundai: "hyundai.svg",
  Nissan: "nissan.svg",
  Peugeot: "peugeot.svg",
  Lexus: "lexus.svg",
  Subaru: "subaru.svg",
  "Great Wall": "great-wall.svg",
  Maserati: "maserati.svg",
  Volvo: "volvo.svg",
  Infiniti: "infiniti.svg",
  MG: "mg.svg",
  Chery: "chery.svg",
  Jaguar: "jaguar.svg",
  MINI: "mini.svg",
  Mitsubishi: "mitsubishi.svg",
  Jeep: "jeep.svg",
  Jetour: "jetour.svg",
  Kia: "kia.svg",
  Genesis: "genesis.svg",
  KGM: "kgm.svg",
};

// Brands the importer keeps supplying, but the home page showcase leaves out.
// A showcase decision only: the import policy still allows them and their cards
// stay in the catalog, the brand filter, and search.
// Плюс вычеркнутые марки: их машины удалены из каталога (31.08.2026), и логотип с
// нулём был бы тупиком. Список берём из правил ввоза, а не переписываем руками —
// иначе он разойдётся с ними при следующей правке. Здесь он нужен и потому, что
// при сборке страницы чисел ещё нет: без него серверная разметка показала бы марку,
// а браузер убрал — и сверка разметки при запуске приложения не сошлась бы.
const showcaseHiddenBrands = new Set(["AION", "Denza", "Dongfeng", "Hongqi", "ORA", ...EXCLUDED_BRANDS]);

// Марки, которых нет в свёрнутом блоке, но которые открываются кнопкой «Показать
// все марки». Машин у них много, и по одной популярности они занимали половину
// витрины: посетитель видел обычный автосайт с немцами и корейцами вместо
// каталога китайских машин, за которым пришёл.
const showcaseDemotedBrands = new Set(["Buick", "Changan", "Chery", "Ford", "Hyundai", "Land Rover", "Nissan"]);

// Марки, которые в свёрнутом блоке стоят всегда, сколько бы машин у них ни было:
// это лицо каталога, и терять их из-за того, что у Volkswagen объявлений втрое
// больше, нельзя. Марку без машин правило всё равно не покажет — она отсеивается
// раньше, вместе с остальными пустыми.
const showcaseExpandedOnlyBrands = new Set(["Honda", "Leapmotor", "Lynk & Co", "XPeng"]);
const showcaseMobileExpandedOnlyBrands = new Set(["Honda", "Toyota", "Volkswagen"]);

const showcasePinnedBrands = new Set(["Avatr", "Deepal", "Voyah", "Xiaomi", "Zeekr"]);

// Marks whose own colours are part of the brand. The dark theme inverts logos so
// black artwork stays readable on a dark surface; applying that to these fixed-
// colour marks would repaint the brand, so they opt out.
const coloredBrandLogos = new Set([
  "BMW", "BYD", "Changan", "Chevrolet", "Denza", "Dongfeng", "Ford", "Geely",
  "Honda", "Hongqi", "Hyundai", "Nissan", "Porsche", "Tesla", "Toyota", "Voyah", "Xiaomi",
  "Great Wall", "Subaru", "Maserati", "Volvo", "Infiniti", "MG", "Mitsubishi", "Kia",
]);

// Two letters, so brands sharing an initial stay apart (Tesla/Toyota).
function brandInitials(brand) {
  const words = String(brand).split(/[\s&-]+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join("") : String(brand).slice(0, 2)).toLocaleUpperCase("en-US");
}

function BrandMark({ brand }) {
  const file = brandLogos[brand];
  if (!file) return <span className="brand-logo brand-logo-fallback" aria-hidden="true">{brandInitials(brand)}</span>;
  return (
    <span className={`brand-logo${coloredBrandLogos.has(brand) ? " brand-logo-colored" : ""}`} aria-hidden="true">
      <img src={`${import.meta.env.BASE_URL}brands/${file}`} alt="" />
    </span>
  );
}

// Главная показывает пять строк марок; остальное открывает кнопка.
// На узких экранах колонок меньше, но число строк остаётся тем же.
const BRAND_SHOWCASE_ROWS = 5;
// На кнопке «Все» блок называет себя целиком, поэтому подпись у неё длиннее.
const brandSwitchLabel = (item) => (item === "Все" ? "Все марки авто" : item);
// Переключатель на странице марки — только три настоящих типа, без пункта «Дизель».
const BRAND_SWITCH_OPTIONS = POWERTRAIN_TABS.filter((item) => item !== DIESEL_TAB).map(brandSwitchLabel);
const brandSwitchType = (label) => POWERTRAIN_TABS.find((item) => brandSwitchLabel(item) === label) || "Все";
// Раздел под выбранный тип двигателя: у каждого из трёх есть своя страница.
const powertrainLandingPath = (label) => CATALOG_LANDINGS.find((landing) => landing.kind === "powertrain" && landing.powertrain === typeValue(label))?.path || "/catalog";

// Числа у марок блок раньше рисовал дважды. Сначала он считал их по стартовой выборке
// в шестьдесят карточек — оттуда и брались «BYD 2», «Tesla 1», — а когда приходил
// настоящий ответ каталога, весь блок пересобирался: числа менялись на верные, марки
// без машин исчезали, порядок съезжал. Чтобы верные числа стояли с первой отрисовки,
// берём их с двух сторон: готовый ответ загрузочного запроса, если он успел прийти до
// запуска приложения, и числа прошлого захода, сохранённые в браузере. За ночь каталог
// меняется на сотни машин из десятков тысяч, поэтому вчерашние числа выглядят как
// сегодняшние, и подмена настоящими проходит незаметно.
const brandCountsKey = "abcars-brand-counts";
const readStoredBrandCounts = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(brandCountsKey) || "null");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    // Запись могла оставить прежняя версия сайта: берём только списки марок с именем,
    // иначе плитка марок на главной падала бы на первом кадре.
    return Object.fromEntries(Object.entries(stored)
      .filter(([, brands]) => Array.isArray(brands))
      .map(([type, brands]) => [type, brands.filter((item) => typeof item?.brand === "string")]));
  } catch {
    return {};
  }
};
const storeBrandCounts = (type, brands) => {
  try {
    window.localStorage.setItem(brandCountsKey, JSON.stringify({ ...readStoredBrandCounts(), [type]: brands }));
  } catch {
    // Приватный режим может запрещать хранилище — тогда просто ждём ответ каталога.
  }
};
const initialBrandCounts = () => {
  const boot = bootCatalogMeta("")?.brands;
  return boot ? { ...readStoredBrandCounts(), "Все": boot } : readStoredBrandCounts();
};

/* Полосы цен до Минска под плиткой марок. Главная — самая сильная страница сайта,
   а на ценовые разделы («до 20 000 $») с неё не вело ни одной ссылки: человек, который
   выбирает по бюджету, а не по марке, попадал туда только через общий каталог. */
const HomePriceBands = memo(function HomePriceBands({ navigate }) {
  // Карточка «до 40 000 $» с главной убрана 25.09.2026, сам раздел каталога остался.
  const bands = CATALOG_LANDINGS.filter((landing) => landing.kind === "price" && !landing.powertrain && landing.landedMax <= 30000);
  // Подпись карточки — самая популярная модель, у которой самая доступная машина стоит
  // между прошлой ценой и этой: у каждой карточки своя модель, а не одна Haval H6 на все
  // четыре. Модели — те же, что в «Популярных моделях» (встроены в страницу).
  const { models } = useHomeModels();
  if (!bands.length) return null;
  return (
    // С 25.09.2026 — карточки как у полосы доверия, но без картинок; заголовок «По цене
    // до Минска» убран.
    <nav className="home-price-bands page-width" aria-label="Автомобили по цене до Минска">
      {bands.map((band, index) => {
        const floor = index ? bands[index - 1].landedMax : 0;
        const example = models.find((item) => item.priceFrom > floor && item.priceFrom <= band.landedMax);
        return (
          <AppLink key={band.path} href={band.path} navigate={navigate}>
            {/* «Б/у авто» вместо «Автомобили» — той же длины, но со словами, которыми ищут
                (26.09.2026): название самого раздела каталога не меняется. */}
            <b>{band.name.replace(/^Автомобили/, "Б/у авто")}</b>
            <small>{example ? `${example.name} и другие` : "С доставкой до Минска"}</small>
          </AppLink>
        );
      })}
    </nav>
  );
});

/* Популярные модели на главной — оглавление каталога, как у IM4CAR: вкладка «Все» —
   48 моделей с наибольшим числом машин, дальше вкладка на каждую крупную марку со всеми
   её моделями. Данные считает сборка и встраивает в страницу (window.__boot.popularModels
   / brandModelTabs, scripts/prerender-home.mjs), поэтому первый кадр в браузере совпадает
   с готовой разметкой; в режиме разработки их встраивает vite.config.mjs.

   С 25.09.2026 модели идут не плашками, а карточками как в каталоге: фото одной из машин
   модели, название, годы выпуска и сколько машин. Один ряд (пять на широком экране) и
   стрелки по краям; лента начинается с самой популярной модели. Карточки
   рисуются только у открытой вкладки — у остальных в разметке лежат обычные ссылки
   (их читает поисковик), иначе главная тяжелела бы на четыре сотни карточек. */
function HomeModelCard({ item, navigate }) {
  const years = item.yearFrom && item.yearTo ? (item.yearFrom === item.yearTo ? String(item.yearFrom) : `${item.yearFrom}–${item.yearTo}`) : "";
  return (
    <AppLink href={item.path} navigate={navigate} className="featured-card home-model-card">
      <div className="featured-image">
        {item.image && <StripPhoto src={imageSource(item.image, IMAGE_WIDTH_CARD)} alt="" draggable="false" />}
      </div>
      <div className="featured-body">
        <h3>{item.name}</h3>
        <p>{years ? `${years} · ` : ""}{number(item.count)} шт.</p>
      </div>
    </AppLink>
  );
}

// Сколько карточек помещается в ряд — те же пороги, что в стилях .home-model-track.
const homeModelsPerView = () => {
  if (typeof window === "undefined" || !window.matchMedia) return 5;
  if (window.matchMedia("(max-width: 640px)").matches) return 2;
  if (window.matchMedia("(max-width: 980px)").matches) return 3;
  return 5;
};

function HomeModelSlider({ items, navigate, label, more = null }) {
  // Лента не зациклена: в начале нет стрелки назад, в конце — вперёд. Шаг — одна карточка.
  // `more` — последняя плитка «Все Audi · 3 206 авто», как «Смотреть все» в сохранённых поисках.
  const [first, setFirst] = useState(0);
  const [perView, setPerView] = useState(5);
  const touch = useRef(null);
  const count = items.length + (more ? 1 : 0);
  useEffect(() => {
    const update = () => setPerView(homeModelsPerView());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const last = Math.max(0, count - perView);
  // Экран стал шире — лента не должна остаться сдвинутой за последнюю карточку.
  const start = Math.min(first, last);
  const step = (direction) => setFirst(Math.min(last, Math.max(0, start + direction)));
  return (
    <div
      className="home-model-slider"
      role="group"
      aria-roledescription="карусель"
      aria-label={label}
      onTouchStart={(event) => { touch.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const begin = touch.current;
        touch.current = null;
        const end = event.changedTouches[0]?.clientX;
        if (begin == null || end == null || Math.abs(end - begin) < 40) return;
        step(end < begin ? 1 : -1);
      }}
    >
      <div className="home-model-viewport">
        <div className="home-model-track" style={start ? { "--home-model-shift": -start } : undefined}>
          {items.map((item) => (
            <HomeModelCard key={`${item.path}:${item.name}`} item={item} navigate={navigate} />
          ))}
          {more && (
            <AppLink href={more.path} navigate={navigate} className="home-model-more">
              <span className="home-model-more-circle" aria-hidden="true">
                <ArrowRight size={20} weight="bold" />
              </span>
              <b>{more.label}</b>
              <small>{more.note}</small>
            </AppLink>
          )}
        </div>
      </div>
      {start > 0 && (
        <button type="button" className="home-model-arrow prev" aria-label="Предыдущие модели" onClick={() => step(-1)}>
          <CaretRight size={20} weight="bold" mirrored aria-hidden="true" />
        </button>
      )}
      {start < last && (
        <button type="button" className="home-model-arrow next" aria-label="Следующие модели" onClick={() => step(1)}>
          <CaretRight size={20} weight="bold" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// Закрытая вкладка: только ссылки, без фото — их видит поисковик, а человеку они скрыты.
// Ссылка на раздел марки — там же, как последняя плитка в открытой вкладке.
function HomeModelLinks({ items, navigate, more = null }) {
  return (
    <ul className="home-model-links">
      {items.map((item) => (
        <li key={`${item.path}:${item.name}`}><AppLink href={item.path} navigate={navigate}>{item.name}</AppLink></li>
      ))}
      {more && <li><AppLink href={more.path} navigate={navigate}>{more.label} — {more.note}</AppLink></li>}
    </ul>
  );
}

// Сводка по всем моделям каталога (/api/model-facts) — один запрос на всю главную: её
// ждут и «Популярные модели» без встроенных данных, и поиск над лентой.
let homeModelFactsRequest = null;
const loadHomeModelFacts = () => {
  homeModelFactsRequest ||= fetch("/api/model-facts")
    .then((answer) => (answer.ok ? answer.json() : null))
    .then((data) => (Array.isArray(data?.models) ? data.models : null))
    .catch(() => null)
    .then((rows) => {
      if (!rows) homeModelFactsRequest = null; // сбой — следующий заход спросит снова
      return rows;
    });
  return homeModelFactsRequest;
};

/* Списки «Популярных моделей». При прямом заходе на главную они встроены в страницу
   (window.__boot) — первый кадр совпадает с готовой разметкой, её и читает поисковик.
   При переходе на главную внутри сайта (логотип, «назад») встроенных данных нет, и блок
   раньше просто не появлялся, а полосы цен теряли подписи с моделями. Тогда считаем те
   же списки тем же кодом из сводки по моделям. */
function useHomeModels() {
  const [lists, setLists] = useState(() => {
    const boot = window.__boot;
    return Array.isArray(boot?.popularModels) && boot.popularModels.length
      ? { models: boot.popularModels, brands: Array.isArray(boot.brandModelTabs) ? boot.brandModelTabs : [] }
      : null;
  });
  useEffect(() => {
    let alive = true;
    loadHomeModelFacts().then((rows) => {
      if (alive && rows) setLists(homePopularModels(rows));
    });
    return () => { alive = false; };
  }, []);
  return lists || HOME_MODELS_EMPTY;
}
const HOME_MODELS_EMPTY = Object.freeze({ models: [], brands: [] });

// Марка и модель одной строкой — по ней ищет поле над лентой.
const homeModelHaystack = (item) => `${item.brand || ""} ${item.name}`;
// В записи главной нет голого имени модели, только заголовок «Zeekr 001»: марку
// в начале срезаем, чтобы найти русские написания модели («аксела» → Mazda3).
const homeModelNames = (item) => {
  const brand = item.brand || "";
  const model = brand && item.name.startsWith(`${brand} `) ? item.name.slice(brand.length + 1) : item.name;
  return [brand, model, item.name];
};

const HomePopularModels = memo(function HomePopularModels({ navigate }) {
  const { models, brands } = useHomeModels();
  const [active, setActive] = useState("all");
  const [query, setQuery] = useState("");
  // В страницу встроены только 48 популярных моделей и модели 16 крупных марок — Zeekr
  // или Denza там нет. Весь список моделей каталога (/api/model-facts) грузим, когда
  // посетитель впервые трогает поиск, а до ответа ищем по встроенному.
  const [catalogModels, setCatalogModels] = useState(null);
  const loadingModels = useRef(false);
  const tabsId = useId();
  const loadCatalogModels = () => {
    if (catalogModels || loadingModels.current) return;
    loadingModels.current = true;
    loadHomeModelFacts()
      .then((rows) => { if (rows) setCatalogModels(homeModelEntries(rows)); })
      .finally(() => { loadingModels.current = false; });
  };
  const found = useMemo(() => {
    if (!searchNormalize(query)) return null;
    let source = catalogModels;
    if (!source) {
      const embedded = new Map();
      for (const brand of brands) for (const item of brand.models) embedded.set(item.path, { ...item, brand: brand.brand });
      for (const item of models) if (!embedded.has(item.path)) embedded.set(item.path, item);
      source = [...embedded.values()].sort((left, right) => right.count - left.count);
    }
    const all = itemsMatchingQuery(source, query, homeModelHaystack, homeModelNames);
    // Марка остаётся вкладкой, если совпало её имя (тогда в ней все её модели) или
    // хотя бы одна её модель.
    const matchedBrands = homeModelBrands(source)
      .map((brand) => {
        const whole = itemsMatchingQuery([{ brand: brand.brand, name: "" }], query, homeModelHaystack, homeModelNames).length > 0;
        return whole ? brand : { ...brand, models: all.filter((item) => item.brand === brand.brand) };
      })
      .filter((brand) => brand.models.length);
    return { all, brands: matchedBrands };
  }, [query, catalogModels, models, brands]);
  if (!models.length) return null;
  const shownBrands = found ? found.brands : brands;
  const allItems = found ? found.all : models;
  const current = active === "all" || shownBrands.some((brand) => brand.brand === active) ? active : "all";
  // В id элементов — номер вкладки, а не имя марки: в именах бывают пробелы («Li Auto»).
  const tabs = [{ key: "all", id: "all", label: "Все" }, ...shownBrands.map((brand, index) => ({ key: brand.brand, id: String(index), label: brand.brand }))];
  return (
    <section className="home-popular-models page-width" aria-labelledby={`${tabsId}-title`}>
      <div className="home-popular-heading">
        <h2 id={`${tabsId}-title`}>Популярные модели</h2>
        <SearchField
          className="home-popular-search"
          value={query}
          onValueChange={(value) => {
            setQuery(value);
            loadCatalogModels();
          }}
          placeholder="Марка или модель"
          ariaLabel="Поиск по маркам и моделям"
          inputProps={{ onFocus: loadCatalogModels }}
        />
      </div>
      {found && !found.all.length ? (
        <div className="home-popular-empty">
          {/* Невидимые марки и карточка держат высоту блока: заглушка встаёт на их место,
              и то, что ниже, не прыгает при каждой букве поиска. */}
          <div className="home-popular-empty-spacer" aria-hidden="true">
            <div className="home-popular-tabs"><button type="button" tabIndex={-1}>Все</button></div>
            <div className="home-model-slider">
              <div className="home-model-viewport">
                <div className="home-model-track">
                  <div className="featured-card home-model-card">
                    <div className="featured-image" />
                    <div className="featured-body"><h3>&nbsp;</h3><p>&nbsp;</p></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <EmptyState title="Ничего не найдено" description="Такой марки или модели нет в каталоге. Попробуйте другое написание." />
        </div>
      ) : (
        <>
          {brands.length > 0 && (
            <div className="home-popular-tabs" role="tablist" aria-label="Модели по маркам">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`${tabsId}-tab-${tab.id}`}
                  aria-controls={`${tabsId}-panel-${tab.id}`}
                  aria-selected={current === tab.key}
                  className={current === tab.key ? "active" : undefined}
                  onClick={() => setActive(tab.key)}
                >
                  {tab.key !== "all" && <BrandMark brand={tab.key} />}
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <div role="tabpanel" id={`${tabsId}-panel-all`} aria-labelledby={`${tabsId}-tab-all`} hidden={current !== "all"}>
            {current !== "all" ? (
              <HomeModelLinks items={allItems} navigate={navigate} />
            ) : (
              <HomeModelSlider key={query} items={allItems} navigate={navigate} label="Популярные модели" />
            )}
          </div>
          {shownBrands.map((brand, index) => {
            const more = { path: brand.path, label: `Все ${brand.brand}`, note: `${number(brand.total)} авто` };
            return (
              <div key={brand.brand} role="tabpanel" id={`${tabsId}-panel-${index}`} aria-labelledby={`${tabsId}-tab-${index}`} hidden={current !== brand.brand}>
                {current === brand.brand ? (
                  <HomeModelSlider key={query} items={brand.models} navigate={navigate} label={`Модели ${brand.brand}`} more={more} />
                ) : (
                  <HomeModelLinks items={brand.models} navigate={navigate} more={more} />
                )}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
});

function PopularBrands({ navigate, cars, apiMode }) {
  const [expanded, setExpanded] = useState(false);
  // Числа марок сервер встраивает в готовую главную (справочник /api/catalog/meta, см.
  // src/boot-api.js) — с ними и первый кадр: плитки сразу стоят с числами, и марки без
  // машин не исчезают после загрузки, сдвигая всё, что ниже. Без встроенного ответа
  // (запасная страница сборки) начинаем без чисел, как и она, а прошлые числа из
  // браузера ставит слой ниже — до первого кадра.
  const [remoteBrands, setRemoteBrands] = useState(() => {
    const embedded = bootCatalogMeta("")?.brands;
    return embedded ? { "Все": embedded } : {};
  });
  useLayoutEffect(() => {
    setRemoteBrands((current) => (Object.keys(current).length ? current : initialBrandCounts()));
  }, []);

  const localBrands = useMemo(() => {
    const counts = new Map();
    cars.forEach((car) => {
      counts.set(car.brand, (counts.get(car.brand) || 0) + 1);
    });
    return [...counts].map(([brand, count]) => ({ brand, count }));
  }, [cars]);

  // The home page shows counts across all powertrains; detailed filters live in the catalog.
  useEffect(() => {
    if (apiMode === false) {
      setRemoteBrands({});
      return;
    }
    if (apiMode !== true) return;
    let cancelled = false;
    requestCatalogMeta("").then((payload) => {
      if (cancelled) return;
      const brands = payload.brands || [];
      setRemoteBrands({ "Все": brands });
      storeBrandCounts("Все", brands);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [apiMode]);
  const remoteForType = apiMode === false ? localBrands : remoteBrands["Все"];
  // Пока каталог не ответил, числа по стартовой выборке не показываем: в ней шестьдесят
  // карточек на весь каталог, и марка выглядела бы как «одна машина в наличии». Лучше
  // назвать марки без чисел, чем назвать неверные.
  const availableBrands = remoteForType || (apiMode === false ? localBrands : []);
  const brandCounts = new Map(availableBrands.map((item) => [item.brand, Number(item.count) || 0]));
  // Before the catalog answers there are no counts at all, and rendering every brand as "0"
  // reads as an empty catalog rather than a pending one.
  const countsKnown = brandCounts.size > 0;
  // Марку без машин не показываем нигде, даже на вкладке «Все марки»: часть марок
  // мы перестали возить (31.08.2026), и «Ford 0» в списке — тупик, а не предложение.
  // Правило считает по числу, а не по списку имён: вычеркнули марку — она исчезла
  // сама, завезли новую — появилась. Пока каталог не ответил, чисел нет вообще
  // (`countsKnown` ложно) — тогда показываем все логотипы без чисел, иначе блок
  // выглядел бы пустым каталогом.
  const brands = [...new Set([...Object.keys(brandLogos), ...availableBrands.map((item) => item.brand)])]
    .filter((brand) => !showcaseHiddenBrands.has(brand))
    .map((brand) => ({ brand, count: brandCounts.get(brand) || 0 }))
    .filter((item) => !countsKnown || item.count > 0)
    .sort((a, b) => a.brand.localeCompare(b.brand, "en", { sensitivity: "base" }));
  // В сокращённом виде оставляем самые многочисленные марки, но показываем их всё равно
  // по алфавиту: список ищут глазами по имени, а не читают как рейтинг. Марки без машин
  // сюда не попадают даже когда свободные строки есть: «Acura 0» в популярных — это
  // тупик, а не предложение. В полном списке они остаются.
  const byName = (a, b) => a.brand.localeCompare(b.brand, "en", { sensitivity: "base" });
  const byCount = (a, b) => b.count - a.count || byName(a, b);
  // Закреплённые марки занимают свои места первыми, дальше идут остальные по числу
  // машин, а отставленные не участвуют вовсе. Ряды в блоке всегда полные: если
  // отставленных и закреплённых не хватило, недостающие места добираются из тех же
  // отставленных — пустых клеток в сетке быть не должно.
  const pickShowcase = (limit, expandedOnlyBrands) => {
    const ranked = brands.filter((item) => !expandedOnlyBrands.has(item.brand) && (!countsKnown || item.count > 0));
    const pinned = ranked.filter((item) => showcasePinnedBrands.has(item.brand)).sort(byCount);
    const usual = ranked.filter((item) => !showcasePinnedBrands.has(item.brand) && !showcaseDemotedBrands.has(item.brand)).sort(byCount);
    const demoted = ranked.filter((item) => showcaseDemotedBrands.has(item.brand)).sort(byCount);
    return new Set([...pinned, ...usual, ...demoted].slice(0, limit).map((item) => item.brand));
  };
  // Три раскладки сокращённого вида — по ширине экрана: 4 колонки × 5 рядов, 3 × 5 и на
  // телефоне 3 × 4 (там свой список отставленных марок). Раньше скрипт после загрузки
  // мерил окно и пересобирал список: сервер рисовал 20 плиток, телефон оставлял 12, и
  // всё, что ниже, прыгало вверх (сдвиг вёрстки 0,1 по замеру PageSpeed 25.09.2026).
  // Теперь в разметке сразу все плитки, нужные любой ширине, а лишние для этой
  // ширины прячет оформление (.brand-show-* в styles.css) — ещё до скриптов.
  const wide = pickShowcase(4 * BRAND_SHOWCASE_ROWS, showcaseExpandedOnlyBrands);
  const mid = pickShowcase(3 * BRAND_SHOWCASE_ROWS, showcaseExpandedOnlyBrands);
  const narrow = pickShowcase(3 * 4, showcaseMobileExpandedOnlyBrands);
  const collapsed = brands.filter((item) => wide.has(item.brand) || mid.has(item.brand) || narrow.has(item.brand)).sort(byName);
  const shown = expanded ? brands : collapsed;
  const layoutClass = (brand) => expanded ? "" : [wide.has(brand) && "brand-show-wide", mid.has(brand) && "brand-show-mid", narrow.has(brand) && "brand-show-narrow"].filter(Boolean).join(" ");

  return (
    <section className="popular-brands page-width" aria-labelledby="popular-brands-title">
      <h2 className="visually-hidden" id="popular-brands-title">Популярные марки</h2>
      <div className={`popular-brands-grid${expanded ? "" : " popular-brands-collapsed"}`}>
        {shown.map(({ brand, count }) => {
          // Ссылка ведёт на страницу марки, если она у нас есть: адрес с параметром
          // (`/catalog?brand=BYD`) для поисковика указывает на общий каталог, то есть
          // отдельной страницы под марку по такой ссылке не существует.
          const landing = brandLandingPath(brand);
          const href = landing || `/catalog?brand=${encodeURIComponent(brand)}`;
          // Подпись обязана начинаться с того, что написано на плитке: голосовое
          // управление ищет ссылку по видимому тексту («нажать Audi»), а проверка
          // доступности требует, чтобы видимый текст входил в подпись с начала.
          // Прежнее «Перейти к предложениям: Audi 8 525» это правило нарушало.
          return (
            <AppLink className={`brand-link ${layoutClass(brand)}`.trim()} key={brand} href={href} navigate={navigate}>
              <BrandMark brand={brand} />
              <span className="brand-name" title={brand}>{brand}</span>
              {" "}<span className="brand-count">{countsKnown ? number(count) : ""}</span>
            </AppLink>
          );
        })}
      </div>
      {/* У типа двигателя, до которого импорт ещё не дошёл, марок нет вовсе — пустая
          сетка выглядела бы поломкой. */}
      {!shown.length && <p className="popular-brands-empty">Машин с таким двигателем в каталоге пока нет.</p>}
      {brands.length > narrow.size && (
        <div className="popular-brands-more">
          <button type="button" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded}>
            {expanded ? "Свернуть список" : countsKnown
              ? `Показать все марки (${number(brands.length)})`
              : "Показать все марки"}
            <CaretDown size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

const HOME_SERVICES = [
  {
    id: "landed-cost",
    title: "Таможня",
    image: "services/landed-cost.png",
    href: "/catalog",
  },
  {
    id: "budget-match",
    title: "Подбор",
    image: "services/budget-match.png",
    href: "/catalog",
  },
  {
    id: "compare-cars",
    title: "Сравнить",
    image: "services/compare-cars.png",
    href: "/catalog",
  },
  {
    id: "listing-analysis",
    title: "Разбор",
    image: "services/listing-analysis.png",
    href: "/catalog",
  },
  {
    id: "charging-range",
    title: "Обслуживание",
    image: "services/charging-range.png",
    href: `/catalog?type=${encodeURIComponent("Электромобили")}`,
  },
];

function UsefulServices({ navigate }) {
  return (
    <section className="useful-services" aria-labelledby="useful-services-title">
      <h2 className="visually-hidden" id="useful-services-title">Полезные сервисы</h2>
      <div className="useful-services-layout">
        <div className="useful-services-grid">
          {HOME_SERVICES.map((service) => (
            <AppLink className="useful-service-card" href={service.href} navigate={navigate} key={service.id}>
              <span className="useful-service-art">
                <Illustration src={service.image} alt="" loading="lazy" />
              </span>
              <span className="useful-service-title">{service.title}</span>
            </AppLink>
          ))}
        </div>
        <aside className="useful-services-banner-slot" aria-label="Место для баннера" />
      </div>
    </section>
  );
}

const HomeConversionSections = memo(function HomeConversionSections({ navigate }) {
  const stepIcons = [MagnifyingGlass, ShieldCheck, ClipboardText, CarProfile];

  return (
    <div className="home-conversion page-width">
      <section className="home-order" aria-labelledby="home-order-title">
        <div className="home-order-intro">
          <h2 id="home-order-title">Пригон авто {siteFromPhrase()}: понятный путь</h2>
          <p>До каждого платежа вы понимаете, что уже проверено, сколько стоит следующий этап и какие документы получите.</p>
          <div className="home-order-actions">
            <button type="button" className="primary" onClick={() => navigate("/catalog")}>Выбрать автомобиль <ArrowRight size={18} weight="bold" /></button>
          </div>
        </div>
        <ol className="home-order-steps">
          {HOME_ORDER_STEPS.map((step, index) => {
            const StepIcon = stepIcons[index];
            return (
              <li key={step.number}>
                <div className="home-step-topline">
                  <span className="home-step-icon"><StepIcon size={21} weight="duotone" /></span>
                  <small>{step.number}</small>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="home-faq" aria-labelledby="home-faq-title">
        <div className="home-faq-intro">
          <span className="home-section-kicker">Коротко о главном</span>
          <h2 id="home-faq-title">Частые вопросы о покупке и доставке б/у авто {siteFromPhrase()}</h2>
          <p>{HOME_FAQ_LEAD}</p>
          <button type="button" className="primary home-faq-link" onClick={() => window.location.assign("/how-it-works#faq")}>Все вопросы и ответы <ArrowRight size={18} weight="bold" /></button>
        </div>
        <HomeFaqList items={HOME_FAQ} navigate={navigate} />
      </section>
    </div>
  );
});

function Home({ navigate, cars, apiMode, catalogTotal, catalogUpdatedAt, favorites, toggleFavorite, loading, loadError, onRetry }) {
  // Сумма без валюты в строке поиска читается в валюте переключателя сайта.
  const currency = useCurrency();
  const randomPool = useRef([]);
  const nextItemKey = useRef(0);
  const feedSource = useRef(cars);
  const useCatalogCards = useMediaQuery(NARROW_VIEWPORT);
  // На телефоне карточки идут в одну колонку, и двадцать штук — это очень длинная
  // страница: до блоков под каталогом посетитель просто не доходит. Поэтому там
  // порция вдвое короче, а продолжение открывает кнопка «Подгрузить ещё».
  const batchSize = useCatalogCards ? 10 : 20;
  const takeRandomBatch = (precedingCars = [], count = batchSize, offset = 0) => {
    if (!cars.length) return [];
    const needed = Math.ceil(count * HOME_PRIORITY_SHARE);
    if (randomPool.current.length < count || randomPool.current.filter(isHomePriority).length < needed) {
      const recent = new Set(precedingCars.slice(-3).map(car => car.id));
      randomPool.current = [...new Map([...randomPool.current, ...cars.filter(car => !recent.has(car.id))].map(car => [car.id, car])).values()];
    }
    const chosen = selectHomeFeed(randomPool.current, count, { preceding:precedingCars, offset });
    const ids = new Set(chosen.map(car => car.id));
    randomPool.current = randomPool.current.filter(car => !ids.has(car.id));
    return chosen.map(car => ({ car, key:`${car.id}-${nextItemKey.current++}` }));
  };
  // Витрина, собранная вместе со страницей (window.__boot.homeShowcase, её кладёт
  // scripts/prerender-home.mjs): первый кадр рисуется из неё, и поисковик видит на
  // главной машины с ценами. Пока каталог не пришёл, `cars` пуст — без неё вместо
  // машин стояли бы заготовки. Первый кадр рисуется из неё всегда, даже когда в
  // истории есть своя лента (перезагрузка после открытой машины): сервер про ту
  // ленту не знает, и иначе первый кадр разошёлся бы с готовой разметкой. Свою
  // ленту поднимаем, когда придёт каталог (эффект ниже).
  const bootShowcase = useRef(undefined);
  if (bootShowcase.current === undefined) {
    const embedded = window.__boot?.homeShowcase;
    bootShowcase.current = Array.isArray(embedded) && embedded.length ? embedded.map(normalizeImportedCar) : null;
  }
  // Лента набирается случайно при каждом визите, но возврат назад — это не новый
  // визит: без восстановления выбранная карточка оказывается в другом месте
  // списка или вообще исчезает из ленты.
  const restoreFeed = (stored) => {
    if (!stored?.length || !cars.length) return null;
    // Машины встроенной витрины могут не входить в загруженный каталог — без них
    // возврат назад терял карточку, с которой человек ушёл.
    const byId = new Map([...(bootShowcase.current || []), ...cars].map((car) => [car.id, car]));
    const restored = stored.filter((item) => byId.has(item.id)).map((item) => ({ car:byId.get(item.id), key:item.key }));
    if (!restored.length) return null;
    nextItemKey.current = restored.reduce((max, item) => Math.max(max, Number(String(item.key).split("-").pop()) || 0), 0) + 1;
    return restored;
  };
  const feedFromBoot = useRef(false);
  // После перезагрузки на другой странице от сохранённой ленты обычно выживают
  // только просмотренные машины: остальных нет в свежезагруженном списке. Пара
  // «знакомых» карточек вместо витрины выглядит как поломка, поэтому уцелевшие
  // оставляем сверху (к ним ведёт возврат прокрутки), а ленту добираем свежими.
  const buildFeed = () => {
    if (!cars.length && bootShowcase.current) {
      feedFromBoot.current = true;
      nextItemKey.current = bootShowcase.current.length;
      return bootShowcase.current.map((car, index) => ({ car, key: `${car.id}-${index}` }));
    }
    const restored = restoreFeed(window.history.state?.feed);
    if (!restored) return takeRandomBatch();
    if (restored.length >= batchSize) return restored;
    const seen = new Set(restored.map((item) => item.car.id));
    randomPool.current = shuffleCars(cars.filter((car) => !seen.has(car.id)));
    return [...restored, ...takeRandomBatch(restored.map((item) => item.car), batchSize - restored.length, restored.length)];
  };
  const [feedCars, setFeedCars] = useState(buildFeed);
  const { openQuickView, quickViewToggle, quickViewModal } = useVehicleQuickView({ apiMode:apiMode !== false, favorites, toggleFavorite, navigate });
  const openFeedCar = (item) => {
    const scrollAnchor = feedAnchorSelector(item.key);
    const node = document.querySelector(scrollAnchor);
    patchHistoryState({
      feed: feedCars.slice(0, 600).map(({ car, key }) => ({ id:car.id, key })),
      scrollAnchor,
      scrollAnchorOffset: node ? Math.round(node.getBoundingClientRect().top) : 0,
    });
    // Быстрый просмотр дополняет страницу автомобиля: со стрелки в модалке
    // уходят на неё же, поэтому позицию возврата запоминаем в любом случае.
    if (openQuickView(item.car)) return;
    navigate(carHref(item.car));
  };

  useEffect(() => {
    if (feedSource.current === cars) return;
    feedSource.current = cars;
    randomPool.current = [];
    // Каталог пришёл, а на экране встроенная витрина: сохраняем порядок карточек,
    // обновляя известные цены и характеристики. Новые машины для «Подгрузить ещё»
    // берём из каталога без уже показанных.
    if (feedFromBoot.current && cars.length && !window.history.state?.feed) {
      feedFromBoot.current = false;
      setFeedCars((current) => {
        const shown = new Set(current.map((item) => item.car.id));
        const fresh = new Map(cars.map((car) => [car.id, car]));
        randomPool.current = shuffleCars(cars.filter((car) => !shown.has(car.id)));
        return current.map((item) => fresh.has(item.car.id) ? { ...item, car: fresh.get(item.car.id) } : item);
      });
      return;
    }
    feedFromBoot.current = false;
    nextItemKey.current = 0;
    setFeedCars(buildFeed());
  }, [cars]);
  // Плашка «N дней назад» зависит от сегодняшней даты, а встроенная витрина собрана
  // в день сборки: в первом кадре плашек нет (иначе разметка разойдётся с серверной),
  // появляются они сразу после оживления. Там же телефон получает свою короткую порцию.
  const [feedHydrated, setFeedHydrated] = useState(false);
  useEffect(() => setFeedHydrated(true), []);
  // Ширина экрана известна только после оживления (первый кадр — настольный).
  useEffect(() => {
    if (feedFromBoot.current && useCatalogCards) setFeedCars((current) => (current.length > batchSize ? current.slice(0, batchSize) : current));
  }, [useCatalogCards]);

  const loadMore = () => setFeedCars((current) => [...current, ...takeRandomBatch(current.slice(-3).map((item) => item.car), batchSize, current.length)]);
  const showSkeletons = loading && !feedCars.length;

  // Поиск из шапки: пока в строке есть текст, витрина «Каталог» ниже показывает
  // не случайную подборку, а найденные машины, и блоки между ними прячутся,
  // чтобы выдача оказалась сразу под строкой поиска.
  //
  // Возврат из карточки назад: снимок выдачи (его пишет openFeedCar) поднимаем
  // из sessionStorage, чтобы показать те же результаты и ту же позицию, а не
  // искать заново. Признак возврата — heroReturn в history.state этой записи.
  const restoredHeroRef = useRef(undefined);
  if (restoredHeroRef.current === undefined) {
    restoredHeroRef.current = window.history.state?.heroReturn ? readHomeSearchReturn() : null;
  }
  const restoredHero = restoredHeroRef.current;
  // Готовый запрос можно передать адресом: /?q=джили галакси. Так открываются
  // строки из раздела «Что ищут» — сразу видно, что человек увидел в ответ.
  const [heroQuery, setHeroQuery] = useState(() => restoredHero?.query || new URLSearchParams(window.location.search).get("q") || "");
  const [heroSearch, setHeroSearch] = useState(() => (restoredHero ? {
    items: restoredHero.items,
    total: Number(restoredHero.total) || restoredHero.items.length,
    href: restoredHero.href || "/catalog",
    loading: false,
    loadingMore: false,
    // Продолжить догрузку после возврата умеем только через API-запрос;
    // без него оставшиеся результаты доступны по кнопке «В каталог».
    hasMore: Boolean(restoredHero.hasMore && restoredHero.apiQuery),
    apiQuery: restoredHero.apiQuery || null,
    all: null,
    corrected: null,
  } : null));
  // Блок фильтров под поиском по умолчанию свёрнут на всех экранах
  // и открывается иконкой в строке поиска.
  const [heroSort, setHeroSort] = useState(restoredHero?.sort || "default");
  // «По умолчанию» в выдаче поиска — тот же замес, что и в каталоге: сервер
  // раскладывает строки по зерну, а клиент разносит похожие карточки. Без этого
  // «зикр» открывался десятком одинаковых дорогих машин подряд.
  const [heroShuffleSeed] = useState(() => restoredHero?.shuffleSeed || randomShuffleSeed());
  // Вид выдачи общий с каталогом: переключили здесь — каталог откроется так же.
  // Вид выдачи — в первом кадре всегда список, выбор посетителя из хранилища браузера
  // читаем сразу после: сервер его не знает, и готовая разметка главной с поисковой
  // фразой в адресе («/?q=…») иначе разошлась бы с первым кадром.
  const [heroView, setHeroView] = useState("list");
  useLayoutEffect(() => {
    setHeroView(readCatalogView());
  }, []);
  const updateHeroView = (value) => {
    setHeroView(value);
    window.localStorage.setItem(catalogViewKey, value);
  };
  // Номер попытки поиска: догрузка при прокрутке сверяется с ним, чтобы ответ
  // на старый запрос не подмешался к свежей выдаче.
  const heroSeq = useRef(0);
  const emptyHeroResult = { items: [], total: 0, href: "/catalog", loading: false, loadingMore: false, hasMore: false, apiQuery: null, all: null, corrected: null };
  useEffect(() => {
    // После возврата из карточки не ищем заново, пока запрос и сортировка те же:
    // повторный поиск обрезал бы догруженную выдачу и сбил восстановленную позицию.
    if (restoredHeroRef.current) {
      if (heroQuery === restoredHeroRef.current.query && heroSort === (restoredHeroRef.current.sort || "default")) return undefined;
      restoredHeroRef.current = null;
    }
    heroSeq.current += 1;
    if (!searchNormalize(heroQuery)) {
      setHeroSearch(null);
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();
    // Старые результаты остаются на экране, пока считаются новые, — без мигания.
    setHeroSearch((current) => ({ ...emptyHeroResult, items: current?.items || [], total: current?.total || 0, href: current?.href || "/catalog", loading: true }));
    const timer = window.setTimeout(async () => {
      try {
        const parsed = await parseHeroSearch(heroQuery, { apiMode, cars, currency });
        if (cancelled || !parsed) return;
        if (!parsed.matched) {
          setHeroSearch({ ...emptyHeroResult });
          return;
        }
        if (parsed.listingId) {
          // Наши номера хранятся с приставкой источника: сначала пробуем che168-…,
          // затем номер как есть (вдруг вставили полный идентификатор).
          const candidates = [`che168-${parsed.listingId}`, parsed.listingId];
          let found = null;
          if (apiMode !== false) {
            for (const candidate of candidates) {
              try {
                found = normalizeImportedCar(await fetchCarsJson(`/api/cars/${encodeURIComponent(candidate)}`, controller.signal));
                break;
              } catch {}
            }
          } else {
            found = cars.find((car) => candidates.includes(String(car.id)) || String(car.id).endsWith(`-${parsed.listingId}`)) || null;
          }
          if (cancelled) return;
          setHeroSearch(found ? { ...emptyHeroResult, items: [found], total: 1, href: carHref(found), corrected: parsed.correctedQuery || null } : { ...emptyHeroResult });
          return;
        }
        const href = heroCatalogHref(parsed);
        if (apiMode !== false) {
          const apiParams = heroApiParams(parsed);
          if (heroSort === "default") {
            apiParams.set("sort", "default");
            apiParams.set("seed", heroShuffleSeed);
          } else apiParams.set("sort", heroSort);
          const apiQuery = apiParams.toString();
          const listParams = new URLSearchParams(apiQuery);
          listParams.set("limit", "24");
          const catalog = await fetchCarsJson(`/api/cars?${listParams}`, controller.signal);
          if (cancelled) return;
          const found = catalog.items.map(normalizeImportedCar);
          const ordered = heroSort === "default" ? varietyOrder(found, seededRandom(`${heroShuffleSeed}:0`)) : found;
          setHeroSearch({ ...emptyHeroResult, items: ordered, total: Number(catalog.total) || 0, href, hasMore: Boolean(catalog.hasMore), apiQuery, corrected: parsed.correctedQuery || null });
        } else {
          const modelSet = new Set(parsed.models);
          // Итог «до Минска» есть не у всех статических карточек — для фильтра
          // по цене досчитываем его так же, как это делает каталог.
          const landedUsd = (car) => Number(car.estimatedTotalUsd) || estimateLandedCost(car).totalUsd;
          // Свободный текст в запасном режиме отбирается здесь же, теми же правилами,
          // что и на сервере: каждое слово должно найтись в карточке.
          const words = searchTextWords(parsed.query);
          const pick = (chosen) => cars.filter(
            (car) =>
              matchesSearchText(car, chosen) &&
              (!parsed.brand || car.brand === parsed.brand) &&
              (!modelSet.size || modelSet.has(car.model)) &&
              (!parsed.yearFrom || Number(car.year) >= Number(parsed.yearFrom)) &&
              (!parsed.yearTo || Number(car.year) <= Number(parsed.yearTo)) &&
              (parsed.priceMinUsd == null || landedUsd(car) >= parsed.priceMinUsd) &&
              (parsed.priceMaxUsd == null || landedUsd(car) <= parsed.priceMaxUsd) &&
              (parsed.mileageMin == null || Number(car.mileage) >= parsed.mileageMin) &&
              (parsed.mileageMax == null || Number(car.mileage) <= parsed.mileageMax) &&
              matchesColorLabels(car.bodyColor, parsed.colors || []) &&
              (!parsed.drive || car.drive === parsed.drive) &&
              (!parsed.bodyType || car.bodyType === parsed.bodyType) &&
              (!parsed.powertrain || car.type === parsed.powertrain) &&
              (parsed.accelMax == null || (Number(car.acceleration) > 0 && Number(car.acceleration) <= parsed.accelMax)) &&
              (parsed.batteryMin == null || Number(car.battery) >= parsed.batteryMin) &&
              (parsed.rangeMin == null || Number(car.electricRange || car.combinedRange || car.range) >= parsed.rangeMin) &&
              matchesEngineBounds(car, parsed.engineMin != null || parsed.engineMax != null ? { min: parsed.engineMin, max: parsed.engineMax } : null) &&
              matchesPowerBounds(car, parsed.powerMin != null || parsed.powerMax != null ? { min: parsed.powerMin, max: parsed.powerMax } : null) &&
              (!parsed.gearbox || gearboxType(car) === parsed.gearbox) &&
              (!parsed.fuel || fuelType(car) === parsed.fuel) &&
              matchesExclusions(car, parsed)
          );
          let matches = pick(words);
          // Не нашлось — пробуем слова по основе, как и сервер. Слово, которого нет
          // ни в одной карточке, выдачу обнуляет: подменять его похожим нельзя.
          if (!matches.length && words.length) {
            const stems = words.map(searchWordStem);
            if (stems.some((stem, at) => stem !== words[at])) matches = pick(stems);
          }
          // Карточки из статического каталога не всегда несут готовый итог «до Минска» —
          // для сортировки по цене досчитываем его так же, как избранное.
          const sorted = heroSort === "default" ? varietyOrder(matches, seededRandom(heroShuffleSeed)) : sortCars(matches.map((car) => (Number(car.estimatedTotalUsd) ? car : { ...car, estimatedTotalUsd: estimateLandedCost(car).totalUsd })), heroSort);
          setHeroSearch({ ...emptyHeroResult, items: sorted.slice(0, 24), total: sorted.length, href, hasMore: sorted.length > 24, all: sorted, corrected: parsed.correctedQuery || null });
        }
      } catch {
        if (!cancelled) setHeroSearch({ ...emptyHeroResult });
      }
    }, 250);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [heroQuery, heroSort, apiMode, cars, currency, heroShuffleSeed]);
  const searching = heroSearch !== null;
  // Поиск работает прямо во время набора, поэтому в статистику идёт не каждая буква,
  // а «отстоявшийся» запрос: строка не менялась полторы секунды и выдача уже
  // посчитана. Записываем и число найденных машин — по нему видно запросы, на
  // которые каталогу нечего ответить. Паузу посреди набора это не ловит: если
  // человек задумался после «джили», а потом дописал «галакси», в разделе
  // останется только самая полная строка.
  const searchReported = useRef("");
  useEffect(() => {
    const query = heroQuery.trim();
    if (query.length < 2 || !heroSearch || heroSearch.loading || searchReported.current === query) return undefined;
    const timer = window.setTimeout(() => {
      searchReported.current = query;
      trackEvent("search_query", { properties:{ query, found:Number(heroSearch.total) || 0 } });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [heroQuery, heroSearch]);
  // Уйти с главной можно куда угодно (карточка, «В каталог», меню), поэтому
  // признак «сюда вернутся к поиску» и снимок выдачи поддерживаем всё время,
  // пока поиск активен. history пишем только при смене признака — часто нельзя,
  // а sessionStorage ограничений не имеет.
  const heroReturnFlag = useRef(false);
  useEffect(() => {
    if (heroReturnFlag.current !== searching) {
      heroReturnFlag.current = searching;
      patchHistoryState({ heroReturn: searching });
    }
    if (searching && !heroSearch.loading && heroSearch.items.length) {
      saveHomeSearchReturn({
        query: heroQuery,
        sort: heroSort,
        items: heroSearch.items.slice(0, 240),
        total: heroSearch.total,
        href: heroSearch.href,
        hasMore: heroSearch.hasMore,
        apiQuery: heroSearch.apiQuery,
        shuffleSeed: heroShuffleSeed,
      });
    }
  }, [searching, heroSearch, heroSort, heroQuery]);
  const searchLoading = searching && heroSearch.loading && !heroSearch.items.length;
  const displayItems = searching ? heroSearch.items.map((car) => ({ car, key: `search-${car.id}` })) : feedCars;
  const gridBusy = showSkeletons || searchLoading;
  // Запрос набран, поиск завершён, ничего не нашлось — вместо пустой сетки
  // показываем блок-заглушку с подсказкой и кнопками.
  const searchEmpty = searching && !heroSearch.loading && !heroSearch.total;
  // Выдача поиска листается бесконечно, как каталог: невидимая метка под карточками
  // попадает в экран — и подгружается следующая пачка.
  const loadMoreSearch = async () => {
    const current = heroSearch;
    if (!current || current.loading || current.loadingMore || !current.hasMore) return;
    const seq = heroSeq.current;
    setHeroSearch((state) => (state ? { ...state, loadingMore: true } : state));
    try {
      if (current.apiQuery != null) {
        const listParams = new URLSearchParams(current.apiQuery);
        listParams.set("limit", "24");
        listParams.set("offset", String(current.items.length));
        const catalog = await fetchCarsJson(`/api/cars?${listParams}`);
        if (heroSeq.current !== seq) return;
        const batch = catalog.items.map(normalizeImportedCar);
        setHeroSearch((state) => {
          if (!state) return state;
          // Выдача могла сдвинуться между страницами — повторы карточек не добавляем.
          const known = new Set(state.items.map((car) => car.id));
          const fresh = batch.filter((car) => !known.has(car.id));
          const ordered = heroSort === "default" ? varietyOrder(fresh, seededRandom(`${heroShuffleSeed}:${state.items.length}`), state.items) : fresh;
          return { ...state, items: [...state.items, ...ordered], total: Number(catalog.total) || state.total, hasMore: Boolean(catalog.hasMore), loadingMore: false };
        });
      } else {
        setHeroSearch((state) => {
          if (!state?.all) return state;
          const items = state.all.slice(0, state.items.length + 24);
          return { ...state, items, hasMore: state.all.length > items.length, loadingMore: false };
        });
      }
    } catch {
      // Догрузка не удалась — останавливаем ленту, «Все результаты» ведёт в каталог.
      if (heroSeq.current === seq) setHeroSearch((state) => (state ? { ...state, loadingMore: false, hasMore: false } : state));
    }
  };

  return (
    <main>
      <section className={searching ? "hero hero--searching" : "hero"}>
        {/* Плашка держит своё место, даже когда даты обновления ещё нет: она стоит над
            заголовком, и если появляться на готовой странице, весь первый экран
            съезжает вниз на 50 точек. Пустую плашку не видно — видно только то, что
            страница не дёргается. Тот же приём в первом экране до запуска приложения
            (server/boot-screen.mjs): там даты не существует в принципе. */}
        {Boolean(catalogUpdatedAt) && Boolean(catalogUpdatedDate(catalogUpdatedAt)) ? (
          <div className="hero-updated">
            {`Каталог обновлён ${catalogUpdatedDate(catalogUpdatedAt)}`}
          </div>
        ) : (
          <div className="hero-updated boot-invisible">&nbsp;</div>
        )}
        {/* Неразрывные пробелы стоят прямо в тексте, а не появляются типографикой
            после оживления: заголовок — главный элемент страницы для PageSpeed, и
            любая замена его текста после первого кадра считается новой отрисовкой
            и сдвигом строк — метрика готовности уезжала с 0,2 с обратно на 3+ с. */}
        <h1>{HOME_H1_PARTS.map((part, index) => part.href
          ? <AppLink key={index} className="hero-country-link" href={part.href} navigate={navigate}>{part.text}</AppLink>
          : <Fragment key={index}>{part.text}</Fragment>)}</h1>
        <ul className="hero-benefits" aria-label="Преимущества заказа">
          <li><CheckCircle size={21} weight="fill" />Без скрытых платежей</li>
          <li><CheckCircle size={21} weight="fill" />Всё по договору</li>
          <li><CheckCircle size={21} weight="fill" />Проверка авто до оплаты</li>
        </ul>
        <HeroSearch value={heroQuery} onChange={setHeroQuery} navigate={navigate} />
      </section>
      {!searching && <PopularBrands navigate={navigate} cars={cars} apiMode={apiMode} />}
      <section className={searching ? "featured featured--search page-width" : "featured page-width"}>
        {/* Во время поиска заголовок не показываем: выдача начинается сразу со
            строки с числом результатов, переключатель быстрого просмотра — там же. */}
        {!searching && (
          <div className="section-heading">
            <div className="section-heading-title">
              <h2>Каталог</h2>
              {quickViewToggle}
            </div>
            {/* Вид подборки выбирают только на телефоне: на широком экране она
                всегда идёт плиткой, и переключателя там нет. */}
            <ViewToggle className="home-feed-view-toggle" value={heroView} onChange={updateHeroView} />
            <AppLink className="section-heading-link" href="/catalog" navigate={navigate}>
              Все автомобили <ArrowRight size={18} className="section-heading-link-arrow" />
              <CaretRight size={20} weight="bold" className="section-heading-link-caret" aria-hidden="true" />
            </AppLink>
          </div>
        )}
        {/* При пустой выдаче строку не показываем вовсе: счётчик, «Быстрый
            просмотр» и сортировка не нужны, всё говорит блок-заглушка ниже. */}
        {searching && !searchEmpty && (
          <div className="search-results-bar">
            {/* Строка не исчезает на время пересчёта, иначе выдача дёргается при
                каждой букве: пока ищем, держим прежний счёт или «Ищем…». */}
            <div className="search-results-lead">
              <p className="search-results-note">
                {heroSearch.loading && !heroSearch.items.length
                  ? "Ищем…"
                  : `${number(heroSearch.total)} авто`}
              </p>
              {quickViewToggle}
            </div>
            <div className="result-controls">
              <SelectField
                className="sort-custom-select"
                label="Сортировка"
                value={(HERO_SORT_OPTIONS.find((option) => option.value === heroSort) || HERO_SORT_OPTIONS[0]).label}
                options={HERO_SORT_OPTIONS.map((option) => option.label)}
                onChange={(label) => setHeroSort(HERO_SORT_OPTIONS.find((option) => option.label === label)?.value || "default")}
              />
              <ViewToggle value={heroView} onChange={updateHeroView} />
              <AppLink className="primary search-catalog-link" href={heroSearch.href || "/catalog"} navigate={navigate} aria-label="В каталог">
                <span className="search-catalog-link-label">В каталог</span> <ArrowRight size={17} />
              </AppLink>
            </div>
          </div>
        )}
        {loadError && !searching && (
          <p className="catalog-message" role="status">
            {feedCars.length ? "Не удалось обновить каталог. Показаны сохранённые предложения. " : "Не удалось загрузить предложения. "}
            <button type="button" className="text-button" onClick={onRetry}>Попробовать снова</button>
          </p>
        )}
        {/* На широком экране подборка всегда плиткой. На телефоне (и в выдаче
            поиска на любом экране) вид выбирает посетитель: списочные карточки
            каталога или плитка — на телефоне по две карточки в ряд. */}
        {searchEmpty ? (
          <EmptyState
            className="search-empty"
            description="Попробуйте изменить запрос: марка, модель, год, цена («до 40 тыс»), пробег («до 50 тыс км»), запас хода («от 500 км»), разгон («до 5 сек»), батарея («от 70») или номер объявления. Лишнее убирает слово «кроме»: «зикр кроме 001»."
          />
        ) : (searching || useCatalogCards) && heroView === "list" ? (
          <div className="car-list home-car-list" aria-busy={gridBusy ? "true" : undefined}>
            {gridBusy
              ? skeletonCards.map((key) => <CardSkeleton key={key} row />)
              : displayItems.map(({ car, key }) => (
                  <CarRow
                    key={key}
                    anchorKey={key}
                    car={car}
                    navigate={navigate}
                    favorite={favorites.has(car.id)}
                    toggleFavorite={toggleFavorite}
                    onOpen={() => openFeedCar({ car, key })}
                  />
                ))}
          </div>
        ) : (
          <div className="featured-grid mobile-cards-grid" aria-busy={gridBusy ? "true" : undefined}>
            {gridBusy
              ? skeletonCards.map((key) => <CardSkeleton key={key} />)
              : displayItems.map(({ car, key }) => (
                  <FeaturedCard key={key} anchorKey={key} car={car} favorite={favorites.has(car.id)} toggleFavorite={toggleFavorite} onClick={() => openFeedCar({ car, key })} hideNewBadge={!feedHydrated} />
                ))}
          </div>
        )}
        {searching ? (
          <>
            {heroSearch.loadingMore && <div className="catalog-message">Загружаем объявления…</div>}
            {heroSearch.hasMore && !heroSearch.loading && !heroSearch.loadingMore && (
              <button type="button" className="load-more featured-load-more" onClick={loadMoreSearch}>
                Подгрузить ещё
              </button>
            )}
          </>
        ) : (
          !showSkeletons && !loadError && (
            <button type="button" className="load-more featured-load-more" onClick={loadMore}>
              Подгрузить ещё
            </button>
          )
        )}
      </section>
      {!searching && <HomePriceBands navigate={navigate} />}
      {!searching && <HomePopularModels navigate={navigate} />}
      {!searching && (
      <section className="trust-strip page-width">
        <div>
          <span>
            <Illustration src="/services/delivery-control.png" previewWidth={192} sizes="96px" width="512" height="341" alt="" aria-hidden="true" loading="lazy" decoding="async" />
          </span>
          <p>
            <b>Под ключ до выдачи</b>
            <small>От подбора до получения</small>
          </p>
        </div>
        <div>
          <span>
            <Illustration src="/trust-strip/vehicle-documents.png" width="100" height="100" alt="" aria-hidden="true" />
          </span>
          <p>
            <b>Проверка до оплаты</b>
            <small>История, батарея и документы</small>
          </p>
        </div>
        <div>
          <span>
            <Illustration src="/trust-strip/two-prices.png" previewWidth={192} sizes="96px" width="512" height="512" alt="" aria-hidden="true" loading="lazy" decoding="async" />
          </span>
          <p>
            <b>Показываем обе цены</b>
            <small>Цена {siteInPhrase()} — и до Минска</small>
          </p>
        </div>
        <div>
          <span>
            <Illustration src="/trust-strip/fixed-terms.png" width="100" height="100" alt="" aria-hidden="true" />
          </span>
          <p>
            <b>Заказ по договору</b>
            <small>Цена, сроки и ответственность</small>
          </p>
        </div>
      </section>
      )}
      <HomeConversionSections navigate={navigate} />
      {/* Журнал: четыре свежих материала. Пока раздел не готов, выключатель
          BLOG_ENABLED убирает блок целиком — на его месте ничего не остаётся. */}
      <HomeCollections navigate={navigate} />
      <ScrollToTopButton />
      {quickViewModal}
    </main>
  );
}

function CarRow({ car, navigate, favorite, toggleFavorite, onOpen, anchorKey }) {
  const currency = useCurrency();
  const open = () => (onOpen ? onOpen(car) : navigate(carHref(car)));
  const price = estimateLandedCost(car);
  const engineBadge = engineVolumeBadge(car);
  const aspiration = engineAspiration(car);
  const miniSpecsRef = useRef(null);
  useLayoutEffect(() => {
    const row = miniSpecsRef.current;
    if (!row) return undefined;
    let active = true;
    let cancelFit;
    const fit = () => { cancelFit?.(); cancelFit = scheduleSpecFit(row); };
    fit();
    let knownWidth = row.clientWidth;
    const resized = () => {
      const width = row.clientWidth;
      if (width === knownWidth) return;
      knownWidth = width;
      fit();
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resized);
    if (observer) observer.observe(row);
    else window.addEventListener("resize", resized);
    document.fonts?.ready.then(() => { if (active) fit(); });
    return () => {
      active = false;
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", resized);
      cancelFit?.();
    };
  }, [car.battery, engineBadge, aspiration, car.bodyType]);
  // Роли кнопки у строки каталога нет по той же причине, что и у карточки витрины:
  // внутри свои ссылки и кнопки, а с клавиатуры открывает ссылка-заголовок.
  return (
    <article className="car-row" data-car-id={car.id} data-feed-key={anchorKey} onClick={open}>
      <CardLinkOverlay car={car} open={open} />
      <div className="car-row-mobile-header">
        <div>
          {/* Название здесь — не заголовок: строка для телефона повторяет заголовок
              карточки ниже, и два заголовка на машину превращали выдачу в коде страницы
              в 96 одинаковых «глав» (48 машин × 2). Заголовок у карточки один — ниже. */}
          <p className="car-row-mobile-title"><AppLink href={carHref(car)} navigate={open} onClick={(event) => event.stopPropagation()}>{car.title}</AppLink></p>
          <TotalPrice car={car} price={price} currency={currency} />
        </div>
        <button
          type="button"
          aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"}
          className={favorite ? "selected" : ""}
          onClick={(event) => {
            event.stopPropagation();
            toggleFavorite(car.id);
          }}
        >
          <Heart size={22} weight={favorite ? "fill" : "regular"} />
        </button>
      </div>
      <HoverImagePreview car={car} className="car-row-image" mobileStrip onMobileOpen={open} badge={<NewListingBadge car={car} />} />
      <div className="car-row-info">
        <div className="row-title">
          <div>
            {/* Третий уровень: карточка машины — пункт списка внутри страницы, а не её
                раздел; разделы (обзор, вопросы, другие модели) идут вторым уровнем. */}
            <h3><AppLink href={carHref(car)} navigate={open} onClick={(event) => event.stopPropagation()}>{car.title}</AppLink></h3>
          </div>
          <div className="row-actions">
            <button
              aria-label="Добавить в избранное"
              className={favorite ? "selected" : ""}
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(car.id);
              }}
            >
              <Heart size={21} weight={favorite ? "fill" : "regular"} />
            </button>
          </div>
        </div>
        <p className="summary">
          {number(car.mileage)} км · {powertrainName(car.type)} · {car.drive} привод
        </p>
        <div className="mini-specs" ref={miniSpecsRef}>
          {car.battery && (
            <span>
              <BatteryHigh size={17} />
              {car.battery} кВт·ч
            </span>
          )}
          {/* Машине с двигателем плашки батареи не достаются, и строка оставалась
              пустой: у бензиновой и дизельной там объём и наддув. Гибриду с бензиновым
              мотором они тоже пишутся — рядом с батареей и запасом хода. */}
          {engineBadge && (
            <span>
              <Engine size={17} />
              Объём {engineBadge}
            </span>
          )}
          {aspiration && (
            <span>
              <Timer size={17} />
              {aspiration}
            </span>
          )}
          <span className="body-type-spec" title={car.bodyType}>
            <CarProfile size={17} />
            <span>{car.bodyType}</span>
          </span>
        </div>
        <div className="source-line">
          <MapPin size={15} />
          {translateCity(car.city)}
        </div>
      </div>
      <div className="car-row-price">
        <TotalPrice car={car} price={price} currency={currency} />
        <span>Под ключ</span>
        <b>{number(sourcePriceOf(car))} {sourceCurrencySymbol(car)}</b>
        <small>цена {inPhrase(carOrigin(car))}</small>
      </div>
    </article>
  );
}

// Дата в пилюле над заголовком главной — всегда с годом: «19 августа 2026».
const catalogUpdatedDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // По Минску: строку рисуют и сервер (UTC), и браузер — число обязано совпасть.
  return new Intl.DateTimeFormat("ru-RU", { day:"numeric", month:"long", year:"numeric", timeZone:"Europe/Minsk" }).format(date).replace(/\s*г\.$/, "");
};

const catalogViewKey = "navostok-catalog-view";
const readCatalogView = () => (window.localStorage.getItem(catalogViewKey) === "grid" ? "grid" : "list");
// На странице обзора машины по умолчанию идут плиткой, а не списком: это витрина
// «что есть и почём» на два ряда, а не выдача каталога. Свой выбор посетителя, если
// он его делал, страница слушается — вид у всего сайта общий.
const readModelPageView = () => (window.localStorage.getItem(catalogViewKey) === "list" ? "list" : "grid");

// Фильтры каталога из параметров адреса. Одним разбором пользуются три входа:
// обычное открытие каталога, ссылки страниц марок и разделов и умный поиск —
// он приводит запрос к такому же набору параметров.
let catalogFilterMoveTarget = null;

function catalogFiltersFromParams(params) {
  const rawType = params.get("type");
  const rawBrand = params.get("brand");
  const rawModels = params.getAll("model");
  const rawBodyTypes = params.getAll("body").flatMap((item) => item.split(","));
  const rawColors = params.getAll("color").flatMap((item) => item.split(","));
  const rawYearFrom = params.get("yearFrom");
  const rawYearTo = params.get("yearTo");
  // Старые ссылки несли одно значение вида «от 2024».
  const legacyYearFrom = String(filterNumber(params.get("year") || ""));
  const rawMileage = params.get("mileage");
  const rawPriceFrom = params.get("priceFrom");
  const rawPriceTo = params.get("priceTo");
  // Старые ссылки несли одно значение вида «до $30 000» либо «$100 000+».
  const legacyPrice = params.get("price");
  const legacyPriceAmount = legacyPrice ? String(filterNumber(legacyPrice)) : "";
  const legacyPriceFrom = legacyPrice && legacyPrice.includes("+") ? legacyPriceAmount : "";
  const legacyPriceTo = legacyPrice && !legacyPrice.includes("+") ? legacyPriceAmount : "";
  const rawCountry = params.get("country");
  const rawDrive = params.get("drive");
  const rawOwners = params.get("owners");
  const rawBattery = params.get("battery");
  const rawCondition = params.get("condition");
  const rawAccel = params.get("accel");
  const rawTire = params.get("tire");
  const rawRange = params.get("range");
  const rawEngine = params.get("engine");
  const rawPower = params.get("power");
  const rawGearbox = params.get("gearbox");
  const rawFuel = params.get("fuel");
  return {
    type: typeValue(rawType),
    brand: rawBrand && rawBrand !== "Все марки" ? rawBrand : "Все марки",
    model: multiValues(rawModels, ANY_MODEL),
    bodyType: BODY_TYPES.filter((item) => rawBodyTypes.includes(item)),
    color: COLOR_LABELS.filter((item) => rawColors.includes(item)),
    // Умный поиск приносит не только ступеньки выпадающих списков, но и свои
    // значения («2018», «до 42 000 км», произвольную сумму) — принимаем любое
    // правдоподобное, а не только из списка.
    yearMin: /^(19|20)\d{2}$/.test(rawYearFrom || legacyYearFrom) ? rawYearFrom || legacyYearFrom : ANY_YEAR_MIN,
    yearMax: /^(19|20)\d{2}$/.test(rawYearTo || "") ? rawYearTo : ANY_YEAR_MAX,
    mileage: mileageBounds(rawMileage) ? rawMileage : ANY_MILEAGE,
    priceMin: /^\d+$/.test(rawPriceFrom || legacyPriceFrom) && Number(rawPriceFrom || legacyPriceFrom) > 0 ? rawPriceFrom || legacyPriceFrom : ANY_PRICE_MIN,
    priceMax: /^\d+$/.test(rawPriceTo || legacyPriceTo) && Number(rawPriceTo || legacyPriceTo) > 0 ? rawPriceTo || legacyPriceTo : ANY_PRICE_MAX,
    country: countryLabel(originFromParam(rawCountry)),
    drive: DRIVE_TYPES.includes(rawDrive) ? rawDrive : ANY_DRIVE,
    owners: ownerOptions.includes(rawOwners) ? rawOwners : ANY_OWNERS,
    battery: batteryOptions.includes(rawBattery) || FREE_BATTERY_LABEL.test(rawBattery || "") ? rawBattery : ANY_BATTERY,
    condition: conditionOptions.includes(rawCondition) ? rawCondition : ANY_CONDITION,
    accel: accelOptions.includes(rawAccel) || FREE_ACCEL_LABEL.test(rawAccel || "") ? rawAccel : ANY_ACCEL,
    tire: tireOptions.includes(rawTire) ? rawTire : ANY_TIRE,
    // Умный поиск приносит и свои ступеньки («до 4.5 с», «от 70 кВт·ч», «от 550 км») —
    // принимаем любую подпись правильной формы, а не только из выпадающего списка.
    range: rangeOptions.includes(rawRange) || FREE_RANGE_LABEL.test(rawRange || "") ? rawRange : ANY_RANGE,
    // Объём и мощность хранятся подписью с границами: и ступенька списка, и своё
    // значение из поиска («1.4 л», «от 180 л.с.») разбираются одним разбором.
    engine: engineBounds(rawEngine) ? rawEngine : ANY_ENGINE,
    power: powerBounds(rawPower) ? rawPower : ANY_POWER,
    gearbox: GEARBOX_TYPES.includes(rawGearbox) ? rawGearbox : ANY_GEARBOX,
    fuel: FUEL_TYPES.includes(rawFuel) ? rawFuel : rawType === DIESEL_TAB ? "Дизель" : typeValue(rawType) === "ДВС" ? "Бензин" : ANY_FUEL,
    // Свободный текст из поиска на главной: комплектация и характеристики, которых
    // нет в выпадающих списках. В сохранённые поиски он не попадает — там набор
    // полей фиксирован, и лишний ключ сломал бы сравнение «такой поиск уже есть».
    text: (params.get("text") || "").trim(),
    ...exclusionsFromParams(params),
  };
}

function ConsentField({ checked, onChange, error }) {
  const consentId = useId();
  const errorId = `${consentId}-error`;
  return (
    <div className="consent-block">
      <label className="consent-field" htmlFor={consentId}>
        <input id={consentId} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-describedby={error ? errorId : undefined} />
        <span>
          Я соглашаюсь на обработку персональных данных и принимаю <a href={LEGAL_DOCUMENTS.privacy} target="_blank" rel="noopener noreferrer">политику конфиденциальности</a> и <a href={LEGAL_DOCUMENTS.terms} target="_blank" rel="noopener noreferrer">условия использования</a>.
        </span>
      </label>
      {error && <small className="consent-error" id={errorId}>{error}</small>}
    </div>
  );
}

function CustomSearchModal({ filters, onClose }) {
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("+375");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState("");
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  const submit = async (event) => {
    event.preventDefault();
    const normalizedPhone = normalizeLocalPhone(phone);
    if (description.trim().length < 10) {
      setError("Расскажите чуть подробнее, какой автомобиль вам нужен.");
      return;
    }
    if (normalizedPhone.length < 11 || normalizedPhone.length > 15) {
      setError("Проверьте номер телефона.");
      return;
    }
    if (!consent) {
      setConsentError("Подтвердите согласие, чтобы отправить заявку.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/order-drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId: null,
          contact: `+${normalizedPhone}`,
          calculation: {
            requestType: "catalog_search",
            preferences: description.trim(),
            catalogFilters: filters,
          },
        }),
      });
      if (!response.ok) throw new Error("save unavailable");
      // Телефон в аналитику не уходит: заявка уже сохранена в `order_drafts`, а второй
      // экземпляр личных данных в счётчиках событий пришлось бы охранять отдельно.
      trackEvent("custom_search_submitted");
      setSaved(true);
    } catch {
      setError("Не удалось отправить заявку. Проверьте подключение и попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="lead-modal custom-search-modal" role="dialog" aria-modal="true" aria-labelledby="custom-search-modal-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Закрыть">
          <X size={19} />
        </button>
        {!saved ? (
          <>
            <div className="modal-icon">
              <ChatCircleText size={25} weight="duotone" />
            </div>
            <span>Индивидуальный подбор</span>
            <h2 id="custom-search-modal-title">Опишите желаемое авто</h2>
            <p>Укажите марку, модель, год, бюджет и другие важные пожелания. Менеджер изучит запрос и позвонит вам.</p>
            <form onSubmit={submit}>
              <label>
                Какой автомобиль ищете
                <textarea value={description} onChange={(event) => { setDescription(event.target.value); setError(""); }} placeholder="Например: Zeekr 001 от 2024 года, полный привод, до $45 000 под ключ…" maxLength={2000} required autoFocus />
              </label>
              <label>
                Телефон
                <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => { setPhone(sanitizePhoneInput(event.target.value)); setError(""); }} placeholder="+375 29 123-45-67" maxLength={16} required />
              </label>
              <ConsentField checked={consent} onChange={(value) => { setConsent(value); if (value) setConsentError(""); }} error={consentError} />
              <button className="primary" type="submit" disabled={saving}>
                {saving ? "Отправляем…" : "Отправить запрос"}
              </button>
              {error && <small className="form-error">{error}</small>}
            </form>
          </>
        ) : (
          <div className="success-state">
            <CheckCircle size={48} weight="fill" />
            <h2 id="custom-search-modal-title">Запрос отправлен</h2>
            <p>Спасибо! Мы изучим пожелания, поищем варианты вне каталога и свяжемся с вами по телефону.</p>
            <button className="secondary" type="button" onClick={onClose}>Готово</button>
          </div>
        )}
      </section>
    </div>
  );
}

// Тело карточки автомобиля. Страница и быстрый просмотр в каталоге показывают
// одни и те же блоки, поэтому они живут отдельно от обвязки страницы: крошек,
// кнопки назад и похожих авто в быстром просмотре нет.
// Подсказка к круглым кнопкам действий: над кнопкой и по центру, а если сверху
// места нет — под ней. Координаты считаем от кнопки в координатах окна: в быстром
// просмотре строка действий стоит у самого края прокручиваемой области, и
// подсказка внутри потока обрезалась бы её границами — и сверху, и справа.
// Саму подсказку выносим в конец страницы: внутри карусели и других блоков, у
// которых есть свой сдвиг или обрезка по краям, координаты окна считались бы от
// этого блока, и подсказка уезжала за экран.
function ActionTooltip({ text, className = "", tapToOpen = false, showOnMount = false }) {
  // Подсказка рисуется порталом в body, а портал существует только в браузере:
  // сервер, собирая готовую разметку главной, на нём бы упал. Поэтому до оживления
  // страницы подсказки нет вовсе — она и так невидима, пока к кнопке не подвели
  // курсор, так что посетитель разницы не видит.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const anchorRef = useRef(null);
  const tooltipRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [box, setBox] = useState(null);
  const place = useCallback(() => {
    const tooltip = tooltipRef.current;
    const button = anchorRef.current?.parentElement;
    if (!tooltip || !button) return;
    const anchor = button.getBoundingClientRect();
    const gap = 8;
    const edge = 10;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const above = anchor.top - gap - height >= edge;
    const centered = anchor.left + anchor.width / 2 - width / 2;
    setBox({
      above,
      top: Math.round(above ? anchor.top - gap - height : anchor.bottom + gap),
      left: Math.round(Math.min(Math.max(edge, centered), Math.max(edge, window.innerWidth - width - edge))),
    });
  }, []);
  useEffect(() => {
    const button = anchorRef.current?.parentElement;
    if (!button) return undefined;
    const show = (event) => {
      // Касание может сначала вызвать mouseenter/focus: не открываем подсказку
      // до click, иначе тот же первый тап сразу закроет её.
      if (tapToOpen && event.type === "mouseenter" && window.matchMedia("(hover: none)").matches) return;
      if (tapToOpen && event.type === "focus" && !button.matches(":focus-visible")) return;
      place();
      setVisible(true);
    };
    const hide = () => setVisible(false);
    button.addEventListener("mouseenter", show);
    button.addEventListener("mouseleave", hide);
    button.addEventListener("focus", show);
    button.addEventListener("blur", hide);
    return () => {
      button.removeEventListener("mouseenter", show);
      button.removeEventListener("mouseleave", hide);
      button.removeEventListener("focus", show);
      button.removeEventListener("blur", hide);
    };
  }, [place, tapToOpen]);
  // Некоторые подсказки появляются после уже совершённого клика: их якорь
  // монтируется внутри сфокусированной кнопки, поэтому нового события focus не
  // будет. В этом случае показываем подсказку сразу после её появления в DOM.
  useEffect(() => {
    if (!mounted || !showOnMount) return;
    place();
    setVisible(true);
  }, [mounted, showOnMount, place]);
  // На телефоне наведения нет, поэтому подсказку у стрелки цены открывает касание.
  // Повторное касание по той же стрелке подсказку убирает.
  // Событие дальше не пускаем: иначе вместе с подсказкой откроется и сама карточка.
  useEffect(() => {
    if (!tapToOpen) return undefined;
    const button = anchorRef.current?.parentElement;
    if (!button) return undefined;
    const toggle = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (visible) {
        setVisible(false);
        return;
      }
      place();
      setVisible(true);
    };
    button.addEventListener("click", toggle);
    return () => button.removeEventListener("click", toggle);
  }, [tapToOpen, place, visible]);
  // Открытую касанием подсказку закрывает следующее касание в любом другом месте.
  useEffect(() => {
    if (!tapToOpen || !visible) return undefined;
    const close = (event) => {
      const button = anchorRef.current?.parentElement;
      if (button && button.contains(event.target)) return;
      setVisible(false);
    };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [tapToOpen, visible]);
  // Текст меняется на «Ссылка скопирована» — вместе с ним меняется и ширина.
  useEffect(() => {
    if (visible) place();
  }, [text, visible, place]);
  // Подсказку, открытую касанием, прокрутка закрывает: тянуть её за карточкой
  // по экрану незачем. Подсказки при наведении, наоборот, едут вместе с кнопкой.
  useEffect(() => {
    if (!visible) return undefined;
    const update = () => place();
    const onScroll = tapToOpen ? () => setVisible(false) : update;
    window.addEventListener("scroll", onScroll, { passive:true, capture:true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture:true });
      window.removeEventListener("resize", update);
    };
  }, [visible, place, tapToOpen]);
  return (
    <>
      <span ref={anchorRef} hidden />
      {mounted && createPortal(
        <span
          ref={tooltipRef}
          className={`detail-action-tooltip${className ? ` ${className}` : ""}${box?.above === false ? " is-below" : ""}${visible ? " is-visible" : ""}`}
          style={box ? { top:`${box.top}px`, left:`${box.left}px` } : undefined}
          aria-hidden="true"
        >
          {text}
        </span>,
        document.body,
      )}
    </>
  );
}

// Быстрый просмотр — только для десктопа: на узком экране модалка повторяла бы
// всю страницу автомобиля и мешала бы прокрутке выдачи.
const DESKTOP_VIEWPORT = "(min-width: 981px)";

const useDesktopViewport = () => useMediaQuery(DESKTOP_VIEWPORT);

// Выдача из API несёт карточку целиком, статическая сборка — только сводку,
// поэтому для быстрого просмотра полную карточку в этом режиме дозапрашиваем.
function useQuickViewCar(listed, apiMode) {
  const id = listed?.id || null;
  const [detail, setDetail] = useState(null);
  const [failedId, setFailedId] = useState(null);
  const detailed = detail?.id === id ? detail.car : null;
  // Из API карточка приезжает целиком, но без сравнения цены с похожими машинами:
  // его считает ответ одной машины, а не список. Ради шкалы «цена среди похожих»
  // карточку в быстром просмотре дозапрашиваем и здесь — один раз на открытие.
  const needsDetail = Boolean(id) && !detailed && failedId !== id
    && (Boolean(listed?._summary) || (apiMode && listed?.priceRating === undefined));
  useEffect(() => {
    if (!needsDetail) return undefined;
    const controller = new AbortController();
    const request = apiMode
      ? fetch(`/api/cars/${encodeURIComponent(id)}`, { signal:controller.signal }).then((response) => (response.ok ? response.json() : Promise.reject(new Error("not found"))))
      : loadStaticCar(id, controller.signal);
    request
      .then((loadedCar) => setDetail({ id, car:normalizeImportedCar(loadedCar) }))
      .catch((error) => {
        if (error.name !== "AbortError") setFailedId(id);
      });
    return () => controller.abort();
  }, [apiMode, id, needsDetail]);
  return detailed || listed;
}

// Быстрый просмотр выключен по умолчанию; свитчер рядом с выдачей
// включает его и сохраняет выбор пользователя.
const quickViewKey = "abcars-quick-view";
const readQuickViewEnabled = () => window.localStorage.getItem(quickViewKey) === "on";

function QuickViewToggle({ checked, onChange }) {
  return (
    <label className="quick-view-toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="quick-view-toggle-track" aria-hidden="true">
        <i />
      </span>
      <span className="quick-view-toggle-label">Быстрый просмотр</span>
    </label>
  );
}

// Быстрый просмотр открывается с карточек главной, каталога и похожих авто.
// В избранном его нет: там карточку открывают, чтобы работать с ней целиком.
// `orderOnScreen` — превью открыли с экрана самого заказа: зелёная кнопка там просто
// закрывает модалку, потому что заказ уже под ней.
function useVehicleQuickView({ apiMode, favorites, toggleFavorite, navigate, orderOnScreen = false }) {
  const desktop = useDesktopViewport();
  const [enabled, setEnabled] = useState(readQuickViewEnabled);
  const [listed, setListed] = useState(null);
  const car = useQuickViewCar(listed, apiMode);
  // Превью закрыли сами — метку на записи истории снимаем, иначе следующий
  // возврат на этот экран открыл бы модалку снова.
  const close = useCallback(() => {
    setListed(null);
    patchHistoryState({ quickViewCar: null });
  }, []);
  // Из превью уходят по ссылкам внутрь сайта — на страницу модели, в кабинет.
  // Запоминаем машину и адрес выдачи: «назад» вернёт этот же экран, и превью на
  // нём откроется снова.
  const navigateFromQuickView = (target, options) => {
    if (listed) {
      patchHistoryState({ quickViewCar: listed.id });
      saveQuickViewReturn({ path: `${window.location.pathname}${window.location.search}`, car: listed });
    }
    navigate(target, options);
  };
  // Вернулись назад на ту же выдачу — открываем то же превью. Метка живёт на
  // записи истории, поэтому свежий заход по такому же адресу модалку не поднимает.
  const restoreChecked = useRef(false);
  useEffect(() => {
    if (restoreChecked.current || !desktop || !enabled) return;
    restoreChecked.current = true;
    const stored = readQuickViewReturn();
    if (!stored || stored.car.id !== window.history.state?.quickViewCar) return;
    if (stored.path !== `${window.location.pathname}${window.location.search}`) return;
    setListed(stored.car);
  }, [desktop, enabled]);
  const changeEnabled = (value) => {
    setEnabled(value);
    window.localStorage.setItem(quickViewKey, value ? "on" : "off");
    if (!value) setListed(null);
  };
  // Стрелка у названия уводит на полную страницу: модалку закрываем, иначе она
  // осталась бы висеть поверх только что открытой карточки.
  // Возврат к превью здесь не нужен: карточку и так открыли целиком, и «назад»
  // со страницы машины ведёт к выдаче, а не к модалке того же автомобиля.
  const openFullView = (href) => {
    setListed(null);
    patchHistoryState({ quickViewCar: null });
    navigate(href);
  };
  // Открытое окно предпросмотра сужение окна больше не закрывает. Раньше закрывало —
  // и это ломало зум на макбуке: жест на трекпаде браузер понимает как смену масштаба
  // страницы, а при увеличении в окно помещается меньше точек, чем раньше. На каком-то
  // шаге ширина падала ниже границы «десктопа», окно предпросмотра исчезало прямо под
  // руками, а страница в тот же момент пересобиралась целиком — отсюда и белая вспышка
  // с обрывками карточек. Обратный зум окно не возвращал: машина уже забыта.
  // Закрывать его незачем: внутри та же вёрстка, что и на странице машины, а она
  // тянется по ширине. Открыть предпросмотр по-прежнему можно только на десктопе.
  // true — карточка раскрыта модалкой, переходить на страницу не нужно.
  const openQuickView = (nextCar) => {
    if (nextCar) preloadPhoto(imageSource(nextCar.images?.[0] || nextCar.image, IMAGE_ORIGINAL), true);
    if (!desktop || !enabled || !nextCar) return false;
    setListed(nextCar);
    // Модалка показывает ту же карточку машины, что и её страница, но адрес в браузере
    // не меняется — сам по себе такой просмотр Метрике не виден. Поэтому называем его
    // ей сами, адресом и заголовком страницы этой машины, и отмечаем целью.
    trackMetrikaView(appHref(carHref(nextCar)), { title:carPageTitle(nextCar) });
    trackMetrikaGoal("quick_view");
    return true;
  };
  return {
    openQuickView,
    // Свитчер нужен только там, где быстрый просмотр вообще работает.
    quickViewToggle: desktop ? <QuickViewToggle checked={enabled} onChange={changeEnabled} /> : null,
    // Сравнение цены приезжает отдельным запросом карточки: пока его нет, блок
    // стоит заготовкой и ничего под собой не сдвигает.
    quickViewModal: car ? <VehicleQuickViewModal car={car} navigate={navigateFromQuickView} favorite={favorites.has(car.id)} toggleFavorite={toggleFavorite} onOpenFull={openFullView} onClose={close} onOpenOrder={orderOnScreen ? close : null} priceRatingPending={Boolean(apiMode) && car.priceRating === undefined} /> : null,
  };
}

function TrackingPage() {
  const [vin, setVin] = useState("");
  const [message, setMessage] = useState(null);
  const normalizedVin = vin.trim().toUpperCase();

  const submit = (event) => {
    event.preventDefault();
    if (!normalizedVin) {
      setMessage({ type: "error", text: "Введите VIN автомобиля." });
      return;
    }
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalizedVin)) {
      setMessage({ type: "error", text: "Проверьте VIN: нужно 17 латинских букв и цифр без I, O и Q." });
      return;
    }
    setMessage({ type: "empty", text: "По этому VIN пока нет статуса. Проверьте номер или уточните у компании, которая везёт автомобиль, подключён ли он к отслеживанию." });
  };

  return (
    <main className="tracking-page">
      <section className="tracking-hero page-width" aria-labelledby="tracking-title">
        <div className="tracking-hero-copy">
          <Illustration className="tracking-illustration" src="/services/vehicle-tracking-container.png" width="120" height="120" alt="" aria-hidden="true" />
          <h1 id="tracking-title">Отслеживание автомобиля</h1>
          <p>Введите VIN, чтобы узнать, на каком этапе находится ваш автомобиль.</p>
        </div>
        <form className="tracking-search" onSubmit={submit} noValidate>
          <div className="tracking-search-row">
            <label className="tracking-vin-field" htmlFor="tracking-vin">
              <MagnifyingGlass size={22} aria-hidden="true" />
              <input
                id="tracking-vin"
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck="false"
                maxLength={17}
                value={vin}
                placeholder="Введите vin авто"
                aria-describedby={message ? "tracking-message" : undefined}
                aria-invalid={message?.type === "error" ? "true" : undefined}
                onChange={(event) => {
                  setVin(event.target.value.toUpperCase().replace(/[\s-]/g, "").slice(0, 17));
                  setMessage(null);
                }}
              />
            </label>
            <button className="primary" type="submit">Найти</button>
          </div>
          {message && <p className={`tracking-message ${message.type}`} id="tracking-message" role={message.type === "error" ? "alert" : "status"}>{message.text}</p>}
        </form>
      </section>

      <section className="tracking-faq page-width" aria-label="Частые вопросы">
        <HomeFaqList items={TRACKING_FAQ} />
      </section>
    </main>
  );
}

function ServiceFaqRedirect() {
  useEffect(() => { window.location.replace("/how-it-works#faq"); }, []);
  return null;
}

function ReviewsRedirect() {
  useEffect(() => {
    window.location.replace("/how-it-works#reviews");
  }, []);
  return null;
}

/* Поиск по короткому списку марок и моделей: сравнение цен и «Популярные модели» на
   главной. Понимает русские названия и раскладку (listSearchVariants) — «бмв», «зикр».
   namesOf отдаёт марку и модель записи: по их русским написаниям слово ищется с начала,
   поэтому недописанное «зик» уже находит Zeekr — словарь ждёт «зикр» целиком. */
function itemsMatchingQuery(items, query, haystackOf, namesOf) {
  const normalizedQuery = searchNormalize(query);
  if (!normalizedQuery) return items;
  const firstPass = listSearchVariants(query);
  const variants = [...new Set([...firstPass, ...firstPass.flatMap((variant) => listSearchVariants(variant))])];
  for (const variant of variants) {
    const words = searchNormalize(variant).split(/\s+/).filter(Boolean).slice(0, 6);
    if (!words.length) continue;
    const matches = items.filter((item) => {
      const haystack = searchNormalize(haystackOf(item));
      const tokens = haystack.split(/\s+/);
      const spellingWords = namesOf ? namesOf(item).flatMap((name) => nameSpellings(name)).flatMap((spelling) => spelling.split(" ")) : [];
      return words.every((word) => (word.length === 1 ? tokens.includes(word) : haystack.includes(word)) || (word.length >= 7 && haystack.includes(searchWordStem(word))) || (word.length >= 2 && spellingWords.some((spelling) => spelling.startsWith(word))));
    });
    if (matches.length) return matches;
  }
  return [];
}

function LegalPage({ kind }) {
  useEffect(() => { window.location.replace(LEGAL_DOCUMENTS[kind]); }, [kind]);
  return (
    <main className="legal-page page-width">
      <h1>{kind === "privacy" ? "Политика конфиденциальности" : "Условия использования сайта"}</h1>
      <p><a href={LEGAL_DOCUMENTS[kind]} target="_blank" rel="noopener noreferrer">Открыть документ PDF</a></p>
    </main>
  );
}

/**
 * Обложка подборки. Берём самую дорогую машину подборки: у дорогих объявлений съёмка
 * лучше — так же выбираются кадры для мозаики на странице модели.
 *
 * Запрос именно за одной машиной и с постоянной сортировкой: пока это объявление живо,
 * на главной стоит один и тот же кадр. Случайный порядок менял бы обложку при каждой
 * перезагрузке, и главная выглядела бы так, будто её подменили.
 */
function useCollectionCover(post) {
  const query = post ? String(blogApiParams(post, { sort: "price_desc", limit: 1 })) : null;
  // Обложка из заранее собранной страницы (src/boot-api.js) — для первого кадра.
  const embedded = query ? embeddedApiValue(`/api/cars?${query}`) : undefined;
  const [cover, setCover] = useState(() => ({ car: embedded?.items?.length ? normalizeImportedCar(embedded.items[0]) : null }));
  useEffect(() => {
    if (!query) return undefined;
    const controller = new AbortController();
    fetch(`/api/cars?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("collection cover unavailable"))))
      .then((catalog) => setCover({ car: catalog.items.length ? normalizeImportedCar(catalog.items[0]) : null }))
      .catch(() => {});
    return () => controller.abort();
  }, [query]);
  return cover;
}

// ── «Поделиться» на карточке материала ────────────────────────────────────────
// Три способа отдать ссылку: скопировать, отправить в Telegram, отправить в Threads.
// Своих счётчиков и кнопок соцсетей мы не подключаем: чужой скрипт на странице — это
// и лишний вес, и слежка за посетителем. Здесь только обычные ссылки на страницы
// обмена, скрипты никуда не грузятся.
const BLOG_SHARE_TARGETS = [
  { id: "telegram", name: "Telegram", Icon: TelegramLogo, href: (url, title) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
  { id: "threads", name: "Threads", Icon: ThreadsLogo, href: (url, title) => `https://www.threads.net/intent/post?text=${encodeURIComponent(`${title} ${url}`)}` },
];

function BlogShareMenu({ post, direction = "up" }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef(null);
  // Закрываем нажатием мимо и клавишей Esc — как остальные всплывающие меню сайта.
  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const shareUrl = `${window.location.origin}${appHref(post.path)}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Буфер обмена может быть закрыт настройками браузера: тогда просто оставляем
      // меню открытым — ссылку видно в адресной строке после перехода.
      setCopied(false);
    }
  };
  // Оформление выпадающего списка берём у обычного селекта сайта: те же подложка,
  // скругления, появление и — что важнее всего — уже отлаженные состояния наведения
  // в тёмной теме. Своих красок здесь нет, только положение меню.
  return (
    <div className={`blog-share blog-share-${direction}${open ? " open" : ""}`} ref={boxRef}>
      <button
        type="button"
        className="blog-share-trigger"
        aria-label="Поделиться"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {/* Значок из кружков, а не рамка со стрелкой: в маленькой круглой кнопке
            прямые углы читаются грубо. */}
        <ShareNetwork size={18} />
        {/* Пока список открыт, подсказка не нужна: она перекрывала бы сам список. */}
        {!open && <ActionTooltip text="Поделиться" />}
      </button>
      <div className="select-menu blog-share-menu" role="menu">
        <div className="select-options">
          <button type="button" role="menuitem" onClick={copyLink}>
            <span className="select-option-label">
              <LinkSimple size={17} />
              <span>{copied ? "Ссылка скопирована" : "Копировать ссылку"}</span>
            </span>
          </button>
          {BLOG_SHARE_TARGETS.map(({ id, name, Icon, href }) => (
            <ExternalLink key={id} role="menuitem" href={href(shareUrl, post.name)} onClick={() => setOpen(false)}>
              <span className="select-option-label">
                <Icon size={17} />
                <span>{name}</span>
              </span>
            </ExternalLink>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Карточка материала: обложка, метки, название, дата и «поделиться». */
function BlogCollectionCard({ post, navigate }) {
  // Своя картинка, если она подобрана под тему: тогда ни правило отбора, ни вид
  // материала уже не важны — на карточке стоит именно она.
  if (post.cover?.src) {
    return <BlogCardShell post={post} navigate={navigate} cover={<BlogCoverImage cover={post.cover} place="card" />} />;
  }
  // У сравнения нет одного правила отбора, поэтому и обложка у него своя: два кадра
  // вместо одного. Разные виды материалов различаются уже в сетке журнала.
  if (post.kind === "duel") return <BlogDuelCard post={post} navigate={navigate} />;
  // У статьи правила отбора нет вовсе, и обложку ей нужно брать из её среза для
  // фотографий. Иначе запрос уходит без единого условия и на карточку встаёт самая
  // дорогая машина всего каталога — одна и та же у всех статей, да ещё и не та, что
  // человек увидит наверху материала.
  if (post.kind === "article") return <BlogArticleCoverCard post={post} navigate={navigate} />;
  return <BlogCollectionCoverCard post={post} navigate={navigate} />;
}

/** Карточка статьи: обложка — первый же кадр, с которого начинается сам материал. */
function BlogArticleCoverCard({ post, navigate }) {
  const car = useArticlePhotos(post)[0] || null;
  const source = car?.images?.[0] || car?.image || null;
  const cover = imageSource(source, IMAGE_WIDTH_CARD);
  return (
    <BlogCardShell
      post={post}
      navigate={navigate}
      cover={cover ? <img src={cover} alt="" loading="lazy" onError={(event) => retryWithFullImage(event, source)} /> : null}
    />
  );
}

/**
 * Общая часть карточки: снимок с метками, название, дата и «поделиться». Карточка
 * сравнения такая же, как у подборки, — отличается только обложкой: два кадра вместо
 * одного. Широкую карточку на две колонки пробовали и отказались: в сетке журнала все
 * карточки одного размера.
 */
function BlogCardShell({ post, navigate, cover }) {
  const tags = blogPostTags(post);
  // На карточке дата стоит сама по себе, поэтому пишем её по-человечески: «Сегодня»,
  // «Вчера», «5 дней назад», а после недели — обычную дату. Это день выпуска
  // материала: свежесть наличия и цен написана внутри, над списком машин.
  const date = blogPostDateSentence(post);
  // Нажимается вся карточка, но внутри неё есть своя кнопка «поделиться», а кнопку
  // нельзя положить внутрь ссылки. Поэтому ссылка — отдельный прозрачный слой поверх
  // карточки, а кнопка лежит выше него.
  return (
    <article className="blog-card">
      <span className="blog-card-cover">
        {cover}
        {/* Метки лежат на снимке — так же, как цена и пробег на фотографиях машин:
            подложка размывает кадр под собой, поэтому подпись читается на любом фоне. */}
        {tags.length > 0 && (
          <span className="blog-card-tags">
            {tags.map((tag) => (
              <span key={tag.slug}>{tag.name}</span>
            ))}
          </span>
        )}
      </span>
      <span className="blog-card-body">
        <strong>{post.name}</strong>
        <span className="blog-card-foot">
          {date ? <span className="blog-card-date">{date}</span> : <span />}
          <BlogShareMenu post={post} />
        </span>
      </span>
      <AppLink className="blog-card-link" href={post.path} navigate={navigate} aria-label={post.name} />
    </article>
  );
}

/** Карточка подборки: обложка — самая дорогая машина по правилу отбора. */
function BlogCollectionCoverCard({ post, navigate }) {
  const { car } = useCollectionCover(post);
  const source = car?.images?.[0] || car?.image || null;
  const cover = imageSource(source, IMAGE_WIDTH_CARD);
  return (
    <BlogCardShell
      post={post}
      navigate={navigate}
      cover={cover ? <img src={cover} alt="" loading="lazy" onError={(event) => retryWithFullImage(event, source)} /> : null}
    />
  );
}

/** Карточка сравнения: обложка из двух кадров со значком между ними. */
function BlogDuelCard({ post, navigate }) {
  const data = useDuelSides(post, { deep: false });
  const photos = data.map((entry) => entry.hero?.images?.[0] || entry.hero?.image || null);
  return (
    <BlogCardShell
      post={post}
      navigate={navigate}
      cover={
        photos.some(Boolean) ? (
          <span className="blog-card-duel">
            {photos.map((source, index) => (
              <span key={data[index]?.side.name || index}>
                {source ? <img src={imageSource(source, IMAGE_WIDTH_CARD)} alt="" loading="lazy" onError={(event) => retryWithFullImage(event, source)} /> : null}
              </span>
            ))}
            <i aria-hidden="true">vs</i>
          </span>
        ) : null
      }
    />
  );
}

/**
 * Блок журнала на главной, между вопросами и подвалом: четыре свежих материала подряд,
 * подборки и сравнения одинаковыми карточками. Отдельный блок под сравнения пробовали
 * и отказались — главная не оглавление журнала. Пока материалов меньше четырёх, сетка
 * сжимается сама.
 */
function HomeCollections({ navigate }) {
  const posts = homeBlogPosts();
  if (!BLOG_ENABLED || !posts.length) return null;
  return (
    <section className="home-collections page-width" aria-labelledby="home-collections-title">
      <div className="section-heading">
        <div className="section-heading-title">
          <h2 id="home-collections-title">{BLOG_INDEX.name}</h2>
        </div>
        <AppLink className="section-heading-link" href={BLOG_INDEX.path} navigate={navigate}>
          Смотреть всё <ArrowRight size={18} className="section-heading-link-arrow" />
          <CaretRight size={20} weight="bold" className="section-heading-link-caret" aria-hidden="true" />
        </AppLink>
      </div>
      <div className="blog-card-grid">
        {posts.map((post) => (
          <BlogCollectionCard key={post.slug} post={post} navigate={navigate} />
        ))}
      </div>
    </section>
  );
}

// ── Сравнение двух моделей ────────────────────────────────────────────────────
// Второй вид материала журнала. У него не один список, а две стороны, и каждая живёт
// своим срезом каталога: «все Xiaomi SU7» и «все Tesla Model 3». Из этих двух срезов
// собирается вся страница — шапка с фотографиями, таблица различий и списки машин, —
// поэтому руками в сравнении не написано ни одной цифры.

const DUEL_SIDE_EMPTY = { cars: [], total: null, changedAt: null, priceFromUsd: null, hero: null };

/**
 * Живые данные сторон. По стороне три крошечных запроса: сводка по модели (сколько
 * машин, годы, лучший запас хода, батарея, мощность, момент, разгон), самая доступная
 * машина для цены и кадр для шапки. Все цифры таблицы приходят одной сводкой: тянуть
 * каждую крайнюю машину отдельным запросом значило бы два десятка запросов на страницу.
 * Для главной и карточки в журнале список машин не нужен (`deep: false`).
 */
function useDuelSides(post, { deep = true, listLimit = 5 } = {}) {
  const slug = post?.slug || null;
  const sides = useMemo(() => blogPostSides(post), [slug]);
  const queries = useMemo(
    () =>
      sides.map((side) => ({
        summary: String(blogApiParams(side)),
        // Список — самые доступные машины модели: в сравнении важно, с какой суммы
        // модель вообще начинается, а не случайная выборка из наличия.
        list: deep ? String(blogApiParams(side, { sort: "price_asc", limit: listLimit })) : null,
        cheapest: String(blogApiParams(side, { sort: "price_asc", limit: 1 })),
        // Кадр для шапки — самая дальнобойная машина модели: порядок постоянный,
        // поэтому фотография не меняется от перезагрузки к перезагрузке, а у топовых
        // версий съёмка обычно лучше.
        hero: String(blogApiParams(side, { sort: "range_desc", limit: 5 })),
      })),
    [slug, deep, listLimit],
  );
  // Ответы по стороне → строка состояния: одна и та же сборка и для ответа сервера,
  // и для данных, встроенных в заранее собранную страницу.
  const sideState = ([summary, list, cheapest, hero], index) => {
    // Каталог сортирует по записанной в базу сумме, а карточка показывает
    // пересчитанную — после смены правил расчёта они какое-то время расходятся.
    // Поэтому пять машин переставляем по той цене, которую человек и увидит,
    // и «цена от» берётся из них же: иначе в таблице стояла бы одна сумма,
    // а первой строкой списка — другая, поменьше.
    const landed = (car) => estimateLandedCost(car).totalUsd;
    const cars = [...(list?.cars || [])].sort((left, right) => landed(left) - landed(right));
    const prices = [...(cheapest?.cars || []), ...cars].map(landed).filter((value) => Number.isFinite(value) && value > 0);
    return {
      side: sides[index],
      cars,
      changedAt: summary?.changedAt || list?.changedAt || cheapest?.changedAt || null,
      priceFromUsd: prices.length ? Math.min(...prices) : null,
      // Кадр для шапки — первая машина со снимком: у части объявлений
      // фотографий нет вовсе.
      hero: (hero?.cars || []).find((car) => car.images?.length || car.image) || cars[0] || null,
      ...(summary || { total: list?.total ?? cheapest?.total ?? null }),
    };
  };
  const listAnswer = (catalog) => (catalog ? { total: catalog.total ?? null, changedAt: catalog.changedAt || null, cars: catalog.items.map(normalizeImportedCar) } : null);
  // Встроенные ответы (src/boot-api.js): берём, только если есть все до одного.
  const embeddedAnswers = (() => {
    const answers = queries.map((query) => {
      const summary = embeddedApiValue(`/api/cars/summary?${query.summary}`);
      const list = query.list ? embeddedApiValue(`/api/cars?${query.list}`) : null;
      const cheapest = embeddedApiValue(`/api/cars?${query.cheapest}`);
      const hero = embeddedApiValue(`/api/cars?${query.hero}`);
      return summary === undefined || list === undefined || cheapest === undefined || hero === undefined ? null : [summary, listAnswer(list), listAnswer(cheapest), listAnswer(hero)];
    });
    return answers.every(Boolean) ? answers : null;
  })();
  const bootQueries = useRef(embeddedAnswers ? queries : null);
  const [state, setState] = useState(() => (embeddedAnswers ? embeddedAnswers.map(sideState) : sides.map((side) => ({ side, ...DUEL_SIDE_EMPTY }))));
  useEffect(() => {
    const controller = new AbortController();
    const fromBoot = bootQueries.current === queries;
    bootQueries.current = null;
    if (!fromBoot) setState(sides.map((side) => ({ side, ...DUEL_SIDE_EMPTY })));
    const load = (query) =>
      query
        ? fetch(`/api/cars?${query}`, { signal: controller.signal })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error("duel side unavailable"))))
            .then((catalog) => ({ total: catalog.total ?? null, changedAt: catalog.changedAt || null, cars: catalog.items.map(normalizeImportedCar) }))
        : Promise.resolve(null);
    const loadSummary = (query) =>
      fetch(`/api/cars/summary?${query}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error("duel summary unavailable"))))
        .catch(() => null);
    Promise.all(queries.map((query) => Promise.all([loadSummary(query.summary), load(query.list), load(query.cheapest), load(query.hero)])))
      .then((answers) => setState(answers.map(sideState)))
      .catch(() => {});
    return () => controller.abort();
  }, [queries]);
  return state;
}

/**
 * Фотография внутри статьи. Кадр не иллюстративный, а из каталога: это настоящая
 * машина подборки, подпись показывает её пробег и итоговую цену до Минска, а сам
 * снимок кликается в объявление. Сплошной текст так разбивается тем, за чем на
 * страницу и приходят, а поисковик получает фотографию с осмысленной подписью.
 */
/**
 * Своя картинка материала — та, что Сергей подобрал под тему. Стоит в двух местах:
 * на карточке в журнале и первым кадром в самой статье, чтобы человек нажал на
 * карточку и увидел наверху то же изображение, а не другое.
 *
 * Файл на каждое место свой и нарезан заранее (scripts/blog-covers.mjs), поэтому
 * здесь только выбор нужного. Формат обычный jpeg: avif вдвое легче, но часть
 * браузеров показывала вместо него пустую рамку, а запасной вариант в <picture>
 * в этом случае не подставляется — браузер считает, что формат он поддерживает.
 */
function BlogCoverImage({ cover, place, eager = false }) {
  if (!cover?.src) return null;
  const source = appHref(`${cover.src}-${place}.jpg`);
  const retry = (event) => {
    const image = event.currentTarget;
    const attempt = Number(image.dataset.retryAttempt || 0);
    if (attempt >= 2) return;
    image.dataset.retryAttempt = String(attempt + 1);
    setTimeout(() => {
      if (image.isConnected) image.src = `${source}?retry=${attempt + 1}`;
    }, (attempt + 1) * 500);
  };
  return <img src={source} alt={cover.alt || ""} loading={eager ? "eager" : "lazy"} onError={retry} />;
}

/**
 * Фотографии машин для статьи. У статьи нет правила отбора — она ничего не отбирает,
 * — но иллюстрировать её чем-то нужно, и фотографии настоящих машин из каталога
 * лучше любого фотобанка: в фотобанках китайских моделей попросту нет.
 *
 * Срез задаётся полем `photos`, а не `filters`: это разные вещи, и путать их нельзя.
 * По `filters` подборка собирает список, который виден читателю; по `photos` берутся
 * только кадры, и на содержание статьи они не влияют.
 *
 * Порядок постоянный (перемешивание с зерном по адресу материала): иначе картинки
 * менялись бы при каждой перезагрузке, и статья выглядела бы подменённой.
 */
function useArticlePhotos(post, limit = 6) {
  const params = blogArticlePhotoParams(post, limit);
  const query = params ? String(params) : null;
  // Кадры из заранее собранной страницы (src/boot-api.js) — для первого кадра.
  const embedded = query ? embeddedApiValue(`/api/cars?${query}`) : undefined;
  const [cars, setCars] = useState(() => (embedded ? embedded.items.map(normalizeImportedCar).filter((car) => car.images?.length || car.image) : []));
  useEffect(() => {
    if (!query) return undefined;
    const controller = new AbortController();
    fetch(`/api/cars?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("article photos unavailable"))))
      .then((catalog) => setCars(catalog.items.map(normalizeImportedCar).filter((car) => car.images?.length || car.image)))
      .catch(() => {});
    return () => controller.abort();
  }, [query]);
  return cars;
}

function AppUnavailableModal({ onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="lead-modal order-removal-modal confirm-modal availability-paused-modal social-unavailable-modal app-unavailable-modal" role="dialog" aria-modal="true" aria-labelledby="app-unavailable-title" aria-describedby="app-unavailable-description">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Закрыть"><X size={22} /></button>
        <img className="app-unavailable-icon" src="/app-download/app-gear.png" width="80" height="80" alt="" aria-hidden="true" />
        <h2 id="app-unavailable-title">Приложение уже в работе</h2>
        <p id="app-unavailable-description">Мы активно работаем над приложением. Совсем скоро оно появится в App Store и Google Play.</p>
        <div className="order-removal-actions availability-paused-actions">
          <button className="primary" type="button" onClick={onClose} autoFocus>Понятно</button>
        </div>
      </section>
    </div>
  );
}

function NewsletterSubscribedModal({ onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="lead-modal order-removal-modal confirm-modal availability-paused-modal social-unavailable-modal newsletter-subscribed-modal" role="dialog" aria-modal="true" aria-labelledby="newsletter-subscribed-title" aria-describedby="newsletter-subscribed-description newsletter-subscribed-unsubscribe">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Закрыть"><X size={22} /></button>
        <Illustration className="newsletter-subscribed-icon" src="/app-download/newsletter-mailbox.png" width="80" height="80" alt="" aria-hidden="true" />
        <h2 id="newsletter-subscribed-title">Вы подписались на рассылку</h2>
        <p id="newsletter-subscribed-description">Будем присылать полезные обновления и аналитику рынка автомобилей {siteCountriesGenitive()}.</p>
        <div className="order-removal-actions availability-paused-actions">
          <button className="primary" type="button" onClick={onClose} autoFocus>Готово</button>
        </div>
        <small id="newsletter-subscribed-unsubscribe" className="newsletter-subscribed-unsubscribe">Отписаться можно в любой момент — по ссылке в письме.</small>
      </section>
    </div>
  );
}

function FooterAppDownload({ onOpen }) {
  return (
    <div className="footer-app-download">
      <span className="footer-app-download-title">Скачайте наше мобильное приложение</span>
      <div className="footer-app-download-controls">
        <button type="button" className="footer-app-qr" onClick={() => onOpen("qr")} aria-label="Скачать приложение по QR-коду">
          <img src={appHref("/app-download/qr.svg")} alt="" aria-hidden="true" />
        </button>
        <div className="footer-app-stores">
          <button type="button" onClick={() => onOpen("app_store")} aria-label="Скачать в App Store"><img className="footer-app-store-apple" src={appHref("/app-download/apple.svg")} alt="" aria-hidden="true" /></button>
          <button type="button" onClick={() => onOpen("google_play")} aria-label="Скачать в Google Play"><img src={appHref("/app-download/google-play.svg")} alt="" aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  );
}

function SiteFooter({ navigate }) {
  const [appUnavailableOpen, setAppUnavailableOpen] = useState(false);
  const [newsletterSubscribedOpen, setNewsletterSubscribedOpen] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterSaving, setNewsletterSaving] = useState(false);
  const [newsletterError, setNewsletterError] = useState("");
  // Телефон жил в шапке, 25.09.2026 переехал сюда под соцсети — та же кнопка
  // «показать номер» и то же событие в статистике.
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const togglePhone = () => {
    if (!phoneRevealed) trackEvent("contact_phone_reveal");
    setPhoneRevealed(!phoneRevealed);
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("app") === "download") {
      trackEvent("app_download_qr_deeplink_modal_open");
      setAppUnavailableOpen(true);
    }
  }, []);
  const openAppUnavailable = (source) => {
    trackEvent(`app_download_${source}_click`);
    trackEvent(`app_download_${source}_modal_open`);
    setAppUnavailableOpen(true);
  };
  const subscribeNewsletter = async (event) => {
    event.preventDefault();
    if (newsletterSaving) return;
    const email = newsletterEmail.trim().toLowerCase();
    if (!email) {
      setNewsletterError("Введите адрес электронной почты.");
      return;
    }
    if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      setNewsletterError("Проверьте адрес электронной почты.");
      return;
    }
    trackEvent("newsletter_subscribe_click");
    setNewsletterSaving(true);
    setNewsletterError("");
    try {
      const response = await fetch("/api/newsletter", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body:JSON.stringify({ email, consent:true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "subscription_failed");
      setNewsletterEmail("");
      trackEvent("newsletter_subscribe_modal_open", { properties:{ source:"footer_form" } });
      setNewsletterSubscribedOpen(true);
    } catch (error) {
      setNewsletterError(error.message === "invalid_email"
        ? "Проверьте адрес электронной почты."
        : error.message === "too_many_requests"
          ? "Слишком много попыток. Попробуйте немного позже."
          : "Не удалось сохранить email. Попробуйте ещё раз.");
    } finally {
      setNewsletterSaving(false);
    }
  };
  return (
    <>
    <footer className="site-footer">
      <div className="page-width footer-main">
        <div className="footer-brand">
          <AppLink className="wordmark footer-wordmark" href="/" navigate={navigate} aria-label="abcars.by — на главную"><SiteLogo /></AppLink>
          <p>Помогаем выбрать и купить автомобиль {siteFromPhrase()} в Беларусь.</p>
        </div>
        <FooterAppDownload onOpen={openAppUnavailable} />
        <div className="footer-column footer-navigation"><b>Навигация</b><AppLink href="/catalog" navigate={navigate}>Автомобили</AppLink><AppLink href="/how-it-works" navigate={navigate}>О сервисе</AppLink>{BLOG_ENABLED && <AppLink href={BLOG_INDEX.path} navigate={navigate}>{BLOG_INDEX.name}</AppLink>}<a href={"/how-it-works#faq"}>Вопросы и ответы</a></div>
        <div className="footer-column footer-tools"><b>Расчёты</b>{TOOL_PAGES.map((tool) => <AppLink key={tool.path} href={tool.path} navigate={navigate}>{tool.name}</AppLink>)}</div>
        <div className="footer-column footer-contacts">
          <b>Связаться</b>
          <AppLink href="/contacts" navigate={navigate}>Контакты</AppLink>
          <div className="footer-socials">
            <ExternalLink className="header-social-link is-telegram" aria-label="Telegram" href={COMPANY.telegramUrl} onClick={() => trackEvent("contact_telegram_click")}><TelegramOfficialLogo size={36} weight="fill" /></ExternalLink>
            <a className="header-social-link is-viber" aria-label="Viber" href={COMPANY.viberUrl} rel={EXTERNAL_LINK_REL} onClick={() => trackEvent("contact_viber_click")}><ViberLogo size={24} /></a>
            <ExternalLink className="header-social-link is-instagram" aria-label="Instagram" href={COMPANY.instagramUrl} onClick={() => trackEvent("contact_instagram_click")}><InstagramLogo size={25} weight="bold" /></ExternalLink>
            <ExternalLink className="header-social-link is-threads" aria-label="Threads" href={COMPANY.threadsUrl} onClick={() => trackEvent("contact_threads_click")}><ThreadsLogo size={25} /></ExternalLink>
          </div>
          <button
            type="button"
            className={`phone-reveal${phoneRevealed ? " is-revealed" : ""}`}
            aria-expanded={phoneRevealed}
            onClick={togglePhone}
          >
            <Phone size={18} weight="fill" aria-hidden="true" />
            {phoneRevealed ? COMPANY.phone : "+375 показать номер"}
          </button>
        </div>
        <form className="footer-newsletter" onSubmit={subscribeNewsletter} noValidate>
          <span className="footer-newsletter-title">
            <Illustration src="/app-download/newsletter-mailbox.png" width="64" height="64" alt="" aria-hidden="true" loading="lazy" decoding="async" />
            <strong>Подпишитесь на аналитику рынка авто {siteInPhrase()}</strong>
          </span>
          <div className="footer-newsletter-action">
            <div className="footer-newsletter-form">
              <input id="footer-newsletter-email" type="email" inputMode="email" autoComplete="email" placeholder="Введите Email" aria-label="Электронная почта" value={newsletterEmail} onChange={(event) => { setNewsletterEmail(event.target.value); setNewsletterError(""); }} aria-invalid={newsletterError ? "true" : undefined} aria-describedby={newsletterError ? "footer-newsletter-error" : undefined} maxLength={160} disabled={newsletterSaving} required />
              <button type="submit" disabled={newsletterSaving}>{newsletterSaving ? "Сохраняем…" : "Подписаться"}</button>
            </div>
            <div className={`footer-newsletter-status-reveal${newsletterError ? " is-visible" : ""}`} aria-hidden={newsletterError ? undefined : "true"}>
              <div className="footer-newsletter-status-clip">
                <small id="footer-newsletter-error" className="footer-newsletter-status is-error" role="alert">{newsletterError}</small>
              </div>
            </div>
            <div className="footer-newsletter-consent-reveal">
              <div className="footer-newsletter-consent-clip">
                <small className="footer-newsletter-consent">Нажимая «Подписаться», вы соглашаетесь получать письма и принимаете <a href={LEGAL_DOCUMENTS.privacy} target="_blank" rel="noopener noreferrer">политику конфиденциальности</a>.</small>
              </div>
            </div>
          </div>
        </form>
      </div>
      <div className="page-width footer-bottom">
        <span>© 2026</span>
        <div><a href={LEGAL_DOCUMENTS.privacy} target="_blank" rel="noopener noreferrer">Политика конфиденциальности</a><a href={LEGAL_DOCUMENTS.terms} target="_blank" rel="noopener noreferrer">Условия использования</a></div>
      </div>
    </footer>
    {appUnavailableOpen && <AppUnavailableModal onClose={() => setAppUnavailableOpen(false)} />}
    {newsletterSubscribedOpen && <NewsletterSubscribedModal onClose={() => setNewsletterSubscribedOpen(false)} />}
    </>
  );
}

function InfoCta({ navigate, title, text }) {
  return (
    <section className="info-cta page-width">
      <div>
        <span>Каталог abcars.by</span>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <button className="primary" onClick={() => navigate("/catalog")}>
        Перейти к автомобилям <ArrowRight size={18} />
      </button>
    </section>
  );
}
// Каталог не отвечает — например, база на обслуживании. Показываем не ошибку импорта,
// а спокойную заглушку по центру экрана: посетителю важно понять, что сайт живой и
// стоит зайти позже, а не что у нас не нашёлся последний импорт.
// Пробуем сами, а не просим человека нажимать. Кнопка «Обновить страницу» здесь была
// худшим, что можно предложить: чаще всего сюда приводит отказ нашей же защиты от
// наплыва, и каждая перезагрузка добавляла запросов и продлевала отказ. Ждём всё дольше
// (5, 10, 20 секунд), чтобы не долбить сервер, которому и так плохо, и после трёх попыток
// останавливаемся — дальше уже нужна кнопка.
const MAINTENANCE_RETRY_DELAYS = [5, 10, 20];
function MaintenancePage({ onRetry }) {
  const [attempt, setAttempt] = useState(0);
  const delay = MAINTENANCE_RETRY_DELAYS[attempt] ?? null;
  const [left, setLeft] = useState(delay);
  useEffect(() => {
    setLeft(delay);
    if (delay === null || !onRetry) return undefined;
    const tick = setInterval(() => setLeft((value) => (value === null ? null : value - 1)), 1000);
    const retry = setTimeout(() => {
      setAttempt((value) => value + 1);
      onRetry();
    }, delay * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(retry);
    };
  }, [attempt, delay, onRetry]);
  const manualRetry = () => {
    setAttempt((value) => value + 1);
    if (onRetry) onRetry();
    else window.location.reload();
  };
  return (
    <main className="maintenance-page" aria-live="polite">
      <div className="maintenance-card">
        <span className="maintenance-icon" aria-hidden="true">
          <Gear size={44} weight="fill" />
        </span>
        <h1>Идут технические работы</h1>
        <p>Обновляем каталог — скоро всё вернётся.</p>
        {delay === null ? (
          <p className="maintenance-countdown">Пока не отвечает. Зайдите, пожалуйста, через несколько минут.</p>
        ) : (
          <p className="maintenance-countdown">Пробуем снова{left > 0 ? ` через ${left} с` : ""}…</p>
        )}
        <button className="primary" onClick={manualRetry}>
          Попробовать сейчас
        </button>
      </div>
    </main>
  );
}

function NotFound({ navigate }) {
  return (
    <main className="simple-page page-width">
      <span>404</span>
      <h1>Такой страницы нет</h1>
      <button className="primary" onClick={() => navigate("/")}>
        Вернуться на главную
      </button>
    </main>
  );
}

const localAuthKey = "navostok-local-auth";
const localAccountsKey = "navostok-local-accounts";
const localAccountResetKey = "navostok-account-reset-2026-08-15";
const catalogTotalKey = "abcars-catalog-total";
const catalogUpdatedKey = "abcars-catalog-updated";
const guestFavoritesKey = "navostok-favorites";
const favoritesMigrationKey = "navostok-favorites-account-migration";
const accountFavoritesKey = (userId) => `navostok-account-favorites:${userId}`;
// Машина, отложенная старой кнопкой карточки: до сентября 2026 она уводила на вход, и
// заказ заводился уже в кабинете. Сейчас заявка уходит прямо со страницы, но у тех, кто
// нажал кнопку до обновления и с тех пор не заходил, отметка ещё лежит в браузере.
const pendingOrderKey = "abcars-pending-order-listing";
// Клик по «Узнать точную цену и наличие» — ключевое действие воронки и считается всегда:
// и когда человек нажал кнопку в кабинете, и когда запрос ушёл сам из карточки.
const trackAvailabilityRequest = (order, comment = "") => {
  trackEvent("availability_request_click", {
    listingId:order?.listingId,
    listingTitle:order?.car?.title,
    properties:{ withComment:comment.trim() ? "yes" : "no" },
  });
  trackMetrikaGoal("availability_request");
};
const accountOrdersKey = (userId) => `abcars-account-orders:${userId}`;
const accountSearchesKey = (userId) => `abcars-account-searches:${userId}`;
const readLocalSearches = (userId) => {
  try {
    const searches = JSON.parse(window.localStorage.getItem(accountSearchesKey(userId)) || "[]");
    return Array.isArray(searches) ? searches : [];
  } catch {
    return [];
  }
};
const storeLocalSearches = (userId, searches) => window.localStorage.setItem(accountSearchesKey(userId), JSON.stringify(searches));
const readFavorites = (key) => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
};
const storeFavorites = (key, values) => window.localStorage.setItem(key, JSON.stringify([...values]));
// Единичный сбой сервера — обрыв сети или ответ 5xx в момент выкладки — не означает,
// что API здесь нет: такие запросы повторяются с паузой. Признак отсутствия API — только 404,
// иначе сессия из-за секундного сбоя навсегда пересаживалась на пустую копию в браузере.
//
// 429 здесь же и по той же причине: так отвечает наша защита от наплыва, когда с одного
// адреса пришло слишком много запросов сразу. Это всегда на секунды, и правильный ответ —
// подождать и повторить молча. Раньше 429 проваливался до заглушки «идут технические
// работы» с кнопкой «Обновить страницу», а нажатие добавляло запросов и продлевало отказ.
const transientStatuses = new Set([429, 500, 502, 503, 504]);
// Сколько ждать перед повтором. Сервер при отказе присылает `Retry-After` — слушаем его,
// иначе ждём сами, всё дольше с каждой попыткой. Верхнюю границу держим в пять секунд:
// дольше человек смотрит на пустое место и уходит.
const retryPause = (response, attempt) => {
  const asked = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(asked) && asked > 0) return Math.min(asked * 1000, 5000);
  return Math.min(700 * attempt, 5000);
};
const fetchWithRetry = async (url, options = {}, attempts = 3) => {
  let lastError = null;
  let pause = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, pause || 700 * attempt));
    try {
      const response = await fetch(url, options);
      if (!transientStatuses.has(response.status) || attempt === attempts - 1) return response;
      pause = retryPause(response, attempt + 1);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      lastError = error;
      pause = 0;
    }
  }
  throw lastError;
};
const readLocalOrders = (userId) => {
  try {
    const orders = JSON.parse(window.localStorage.getItem(accountOrdersKey(userId)) || "[]");
    return Array.isArray(orders) ? orders : [];
  } catch {
    return [];
  }
};
const storeLocalOrders = (userId, orders) => window.localStorage.setItem(accountOrdersKey(userId), JSON.stringify(orders));
const localOrderNumber = (id, createdAt) => `EV-${new Date(createdAt).getFullYear()}-${String(id).padStart(6, "0")}`;

const createLocalOrder = (userId, car) => {
  const orders = readLocalOrders(userId);
  const existing = orders.find((order) => order.listingId === car.id);
  if (existing) return { order:existing, orders };
  const createdAt = new Date().toISOString();
  const id = Math.max(0, ...orders.map((order) => Number(order.id) || 0)) + 1;
  const estimate = estimateLandedCost(car);
  const order = {
    id,
    orderNumber:localOrderNumber(id, createdAt),
    listingId:car.id,
    availabilityStatus:"decision",
    availabilityComment:"",
    inspectionStatus:"decision",
    contractStatus:"locked",
    paymentStatus:"locked",
    createdAt,
    updatedAt:createdAt,
    car:{ id:car.id, title:car.title, brand:car.brand, model:car.model, year:car.year, type:car.type, mileage:car.mileage, city:car.city, drive:car.drive, battery:car.battery, range:car.electricRange || car.range, image:car.image, estimatedTotalUsd:estimate.totalUsd },
  };
  const next = [order,...orders];
  storeLocalOrders(userId, next);
  return { order, orders:next };
};
const updateLocalOrder = (userId, orderId, action, values = {}) => {
  const orders = readLocalOrders(userId);
  const index = orders.findIndex((order) => order.id === orderId);
  if (index < 0) throw new Error("order_not_found");
  const order = { ...orders[index], availabilityStatus:orders[index].availabilityStatus || "decision", updatedAt:new Date().toISOString() };
  if (action === "save_order_contact") {
    order.contactName = String(values.contactName || "").trim().slice(0, 80);
    order.contactPhone = String(values.contactPhone || "").trim().slice(0, 16);
    order.contactMethods = Array.isArray(values.contactMethods) ? values.contactMethods.filter((value) => ["phone","viber","telegram"].includes(value)) : [];
    order.contactSavedAt = order.updatedAt;
    order.contactConsentAt = order.updatedAt;
  }
  else if (action === "request_availability_check" && order.availabilityStatus === "decision") {
    order.availabilityStatus = "requested";
    order.availabilityComment = String(values.comment || "").trim().slice(0, 600);
    order.availabilityRequestedAt = order.updatedAt;
  }
  else if (action === "order_inspection" && order.availabilityStatus === "confirmed" && order.inspectionStatus === "decision") order.inspectionStatus = "requested";
  else if (action === "skip_inspection" && order.availabilityStatus === "confirmed" && order.inspectionStatus === "decision") { order.inspectionStatus = "skipped"; order.contractStatus = "available"; }
  else if (action === "confirm_contract" && order.contractStatus === "available") { order.contractStatus = "confirmed"; order.paymentStatus = "available"; order.contractConfirmedAt = order.updatedAt; }
  else if (action === "request_invoice" && order.paymentStatus === "available") { order.paymentStatus = "invoice_requested"; order.invoiceRequestedAt = order.updatedAt; }
  else throw new Error("order_action_unavailable");
  const next = [...orders];
  next[index] = order;
  storeLocalOrders(userId, next);
  return { order, orders:next };
};

try {
  if (!window.localStorage.getItem(localAccountResetKey)) {
    window.localStorage.removeItem(localAuthKey);
    window.localStorage.removeItem(localAccountsKey);
    window.localStorage.setItem(localAccountResetKey, "complete");
  }
} catch {}
const authMessages = {
  invalid_name: "Укажите имя — от 2 до 80 символов.",
  invalid_phone: "Проверьте номер телефона.",
  invalid_password: "Пароль должен содержать минимум 8 символов.",
  phone_already_registered: "Аккаунт с таким телефоном уже существует.",
  invalid_credentials: "Неверный телефон или пароль.",
  invalid_email: "Проверьте адрес электронной почты.",
  invalid_telegram: "Проверьте имя пользователя Telegram.",
  invalid_city: "Название города слишком длинное.",
  invalid_passport_data: "Проверьте паспортные данные.",
  email_required: "Укажите email или выберите другой способ связи.",
  telegram_required: "Укажите Telegram или выберите другой способ связи.",
  unauthorized: "Сессия завершилась. Войдите ещё раз.",
  too_many_requests: "Слишком много попыток. Подождите несколько минут и попробуйте снова.",
};

const normalizeLocalPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 9 ? `375${digits}` : digits;
};
const sanitizePhoneInput = (value) => {
  const source = String(value || "");
  const prefix = source.trimStart().startsWith("+") ? "+" : "";
  return `${prefix}${source.replace(/\D/g, "")}`;
};

const readLocalAccounts = () => {
  try {
    const value = JSON.parse(window.localStorage.getItem(localAccountsKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};
const localPasswordHash = async (password, salt) => {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const saveLocalSession = (user) => window.localStorage.setItem(localAuthKey, JSON.stringify(user));
const readLocalSession = () => {
  try {
    return JSON.parse(window.localStorage.getItem(localAuthKey) || "null");
  } catch {
    return null;
  }
};

async function localAuthenticate(mode, values) {
  const phone = normalizeLocalPhone(values.phone);
  const accounts = readLocalAccounts();
  if (mode === "register") {
    if (accounts.some((item) => item.phone === phone)) throw new Error("phone_already_registered");
    const salt = window.crypto.randomUUID();
    const account = { id:window.crypto.randomUUID(), name:values.name.trim(), phone, email:"", telegram:"", city:"", preferredContact:"phone", salt, passwordHash:await localPasswordHash(values.password, salt), createdAt:new Date().toISOString() };
    window.localStorage.setItem(localAccountsKey, JSON.stringify([...accounts, account]));
    const user = { id:account.id, name:account.name, phone:account.phone, email:account.email, telegram:account.telegram, city:account.city, preferredContact:account.preferredContact, createdAt:account.createdAt };
    saveLocalSession(user);
    return user;
  }
  const account = accounts.find((item) => item.phone === phone);
  if (!account || (await localPasswordHash(values.password, account.salt)) !== account.passwordHash) throw new Error("invalid_credentials");
  const user = { id:account.id, name:account.name, phone:account.phone, email:account.email || "", telegram:account.telegram || "", city:account.city || "", preferredContact:account.preferredContact || "phone", createdAt:account.createdAt };
  saveLocalSession(user);
  return user;
}

// Паспорт, личный номер, дата и место выдачи и адрес прописки в браузере не хранятся:
// местный режим включается при недоступном сервере, а его хранилище остаётся в чужом
// компьютере и ничем не защищено. Такие данные принимает только база — зашифрованными.
const withoutPassportData = ({ passportNumber, personalNumber, passportIssueDate, passportIssuedBy, registrationAddress, ...rest }) => rest;

function localUpdateProfile(userId, profile) {
  const accounts = readLocalAccounts();
  const index = accounts.findIndex((item) => item.id === userId);
  if (index < 0) throw new Error("unauthorized");
  accounts[index] = { ...withoutPassportData(accounts[index]), ...withoutPassportData(profile) };
  window.localStorage.setItem(localAccountsKey, JSON.stringify(accounts));
  const { salt, passwordHash, ...user } = accounts[index];
  saveLocalSession(user);
  return user;
}

async function localDeleteAccount(userId, password) {
  const accounts = readLocalAccounts();
  const account = accounts.find((item) => item.id === userId);
  if (!account || (await localPasswordHash(password, account.salt)) !== account.passwordHash) throw new Error("invalid_credentials");
  window.localStorage.setItem(localAccountsKey, JSON.stringify(accounts.filter((item) => item.id !== userId)));
  window.localStorage.removeItem(localAuthKey);
  window.localStorage.removeItem(accountFavoritesKey(userId));
  window.localStorage.removeItem(accountOrdersKey(userId));
  window.localStorage.removeItem(pendingOrderKey);
}

function PasswordField({ label, value, onChange, autoComplete, placeholder = "", required = false, disabled = false }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">
      <span>{label}</span>
      <div className="password-input">
        <input type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={onChange} placeholder={placeholder} required={required} disabled={disabled} />
        <button type="button" aria-label={visible ? "Скрыть пароль" : "Показать пароль"} aria-pressed={visible} onClick={() => setVisible((current) => !current)} disabled={disabled}>
          {visible ? <EyeSlash size={20} /> : <Eye size={20} />}
        </button>
      </div>
    </label>
  );
}

function AuthModal({ mode, navigate, onAuthenticate, pending, onClose, redirectTo = "/" }) {
  const registering = mode === "register";
  const [values, setValues] = useState({ name:"", phone:"+375", password:"", confirm:"", consent:true });
  const [error, setError] = useState("");
  // На телефоне подписи полей скрыты (styles.css), их роль играют плейсхолдеры.
  const mobileLayout = useMediaQuery(NARROW_VIEWPORT);
  const update = (field) => (event) => setValues((current) => ({ ...current, [field]:event.target.type === "checkbox" ? event.target.checked : event.target.value }));
  const updatePhone = (event) => setValues((current) => ({ ...current, phone:sanitizePhoneInput(event.target.value) }));
  const blockPhoneWhitespace = (event) => {
    if (/\s/.test(event.key)) event.preventDefault();
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const phone = normalizeLocalPhone(values.phone);
    if (registering && values.name.trim().length < 2) return setError(authMessages.invalid_name);
    if (phone.length < 11 || phone.length > 15) return setError(authMessages.invalid_phone);
    if (values.password.length < 8) return setError(authMessages.invalid_password);
    if (registering && values.password !== values.confirm) return setError("Пароли не совпадают.");
    if (registering && !values.consent) return setError("Подтвердите согласие с условиями и политикой конфиденциальности.");
    try {
      await onAuthenticate(mode, values);
      navigate(redirectTo, { replace:true, preserveScroll:true });
    } catch (authError) {
      setError(authMessages[authError.message] || "Не удалось продолжить. Попробуйте ещё раз.");
    }
  };
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, pending]);
  return (
    <div className="modal-backdrop auth-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}>
      <form className="auth-card auth-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <button className="modal-close" type="button" onClick={onClose} disabled={pending} aria-label="Закрыть"><X size={19} /></button>
        <div className="auth-modal-heading">
          <h1 id="auth-modal-title">{registering ? "Создайте аккаунт" : "С возвращением"}</h1>
        </div>
        <div className="auth-switch" role="tablist" aria-label="Тип формы">
          <button type="button" role="tab" aria-selected={!registering} className={!registering ? "active" : ""} onClick={() => navigate("/login", { replace:true })}>Вход</button>
          <button type="button" role="tab" aria-selected={registering} className={registering ? "active" : ""} onClick={() => navigate("/register", { replace:true })}>Регистрация</button>
        </div>
        <div className={`auth-registration-reveal${registering ? " open" : ""}`} aria-hidden={!registering} inert={registering ? undefined : true}>
          <div className="auth-registration-reveal-inner">
            <label className="auth-field"><span>Имя</span><input autoComplete="name" value={values.name} onChange={update("name")} placeholder={mobileLayout ? "Имя" : "Например, Алексей"} required={registering} disabled={!registering} /></label>
          </div>
        </div>
        <label className="auth-field"><span>Телефон</span><input type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={updatePhone} onKeyDown={blockPhoneWhitespace} placeholder={mobileLayout ? "Телефон" : "+375291234567"} maxLength={16} required /></label>
        <PasswordField label="Пароль" autoComplete={registering ? "new-password" : "current-password"} value={values.password} onChange={update("password")} placeholder={mobileLayout ? "Пароль" : registering ? "Минимум 8 символов" : ""} required />
        <div className={`auth-registration-reveal${registering ? " open" : ""}`} aria-hidden={!registering} inert={registering ? undefined : true}>
          <div className="auth-registration-reveal-inner">
            <PasswordField label="Повторите пароль" autoComplete="new-password" value={values.confirm} onChange={update("confirm")} placeholder={mobileLayout ? "Повторите пароль" : "Ещё раз"} required={registering} disabled={!registering} />
            <label className="auth-consent"><input type="checkbox" checked={values.consent} onChange={update("consent")} disabled={!registering} /><span>Согласен с <a href={LEGAL_DOCUMENTS.terms} target="_blank" rel="noopener noreferrer">условиями</a> и <a href={LEGAL_DOCUMENTS.privacy} target="_blank" rel="noopener noreferrer">политикой</a></span></label>
          </div>
        </div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="primary auth-submit" type="submit" disabled={pending}>{pending ? "Подождите…" : registering ? "Создать аккаунт" : "Войти"}<ArrowRight size={18} /></button>      </form>
    </div>
  );
}

async function loadStaticCatalog() {
  if (typeof DecompressionStream !== "undefined") {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/catalog.json.gz`);
      if (!response.ok || !response.body) throw new Error("compressed import unavailable");
      const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(stream).text());
    } catch {}
  }
  const response = await fetch(`${import.meta.env.BASE_URL}data/catalog.json`);
  if (!response.ok) throw new Error("import unavailable");
  return response.json();
}

async function loadStaticCar(id, signal) {
  // Файлы статической сборки названы коротким номером — тем же, что в адресе.
  const response = await fetch(`${import.meta.env.BASE_URL}data/cars/${encodeURIComponent(listingNumber(id))}.json`, { signal });
  if (!response.ok) throw new Error("car unavailable");
  return response.json();
}

// index.html starts the boot requests before this bundle is downloaded, so the network is
// already busy while React mounts. Falling back to a plain fetch keeps the app working
// wherever that inline script did not run.
// Как и в index.html, без `cache: "no-store"`: иначе запрос уходит с пометкой «не бери
// из кэша» и сеть Vercel отвечает мимо своего кэша. Ответы каталога несут `max-age=0`,
// поэтому браузер всё равно ничего не хранит у себя.
// Через повтор, а не голым `fetch`: этим запросом грузится каталог, и его неудача уводит
// приложение сначала на запасную выгрузку, а потом на заглушку «идут технические работы».
// Секундный сбой сервера или отказ защиты от наплыва (429) такого не заслуживает —
// пробуем ещё раз молча, посетитель ничего не замечает.
const fetchCarsJson = (url, signal) =>
  fetchWithRetry(url, { signal }).then((response) => (response.ok ? response.json() : Promise.reject(new Error("api unavailable"))));
// Справочник фильтров спрашивают и поиск на главной, и блок популярных марок, причём
// об одном и том же. Держим обещание по строке запроса: второй потребитель дожидается
// первого ответа вместо того, чтобы отправлять свой.
const metaRequests = new Map();
// Уже пришедшие ответы справочника — готовыми значениями, без ожидания: раздел, в который
// переходят внутри сайта, рисует кнопки моделей марки в первом же кадре, а не через
// мгновение после него (тогда ряд кнопок в семь колонок сдвигал вниз всю выдачу).
const metaResolved = new Map();
// Во время пополнения каталога число машин быстро растёт. Ответы можно повторно
// использовать при переходе между страницами, но нельзя держать до закрытия вкладки.
const CATALOG_META_CLIENT_TTL_MS = 30_000;
const resolvedCatalogMeta = (key) => {
  const entry = metaResolved.get(String(key));
  if (!entry) return null;
  if (Date.now() - entry.at < CATALOG_META_CLIENT_TTL_MS) return entry.value;
  metaResolved.delete(String(key));
  return null;
};
// До конца оживления готовой страницы пришедшие ответы не подставляем: сервер рисовал
// её по своим встроенным данным, и первый кадр обязан совпасть с ними (App снимает флаг).
let metaResolvedUsable = false;
const rememberMetaRequest = (key, request) => {
  // Запоминаем только незавершённый запрос. И успешный, и неудачный ответ должны
  // уступить место новому после короткого срока хранения.
  request.then(
    (value) => {
      metaResolved.set(key, { value, at: Date.now() });
      if (metaRequests.get(key) === request) metaRequests.delete(key);
    },
    () => { if (metaRequests.get(key) === request) metaRequests.delete(key); },
  );
  metaRequests.set(key, request);
  return request;
};
// Запрос справочника, начатый в index.html до загрузки этого файла: подхватываем его,
// чтобы не спрашивать то же самое второй раз.
if (window.__boot?.meta) rememberMetaRequest(String(window.__boot.metaQuery || ""), window.__boot.meta);
const requestCatalogMeta = (query = "") => {
  const key = String(query);
  const cached = resolvedCatalogMeta(key);
  if (cached) return Promise.resolve(cached);
  if (!metaRequests.has(key)) rememberMetaRequest(key, fetchCarsJson(`/api/catalog/meta${key ? `?${key}` : ""}`));
  return metaRequests.get(key);
};
// Тот же справочник, но уже готовым ответом: если загрузочный запрос успел ответить до
// первой отрисовки, панель фильтров показывает все поля сразу, а не достраивается.
const bootCatalogMeta = (query = "") => {
  // После первого кадра встроенный в HTML ответ уже может быть старым: при
  // внутренних переходах используем только недавно полученные данные API.
  if (metaResolvedUsable) return resolvedCatalogMeta(query);
  const preloaded = String(window.__boot?.metaQuery || "") === String(query) ? window.__boot?.metaValue : undefined;
  return initialApiValue(`/api/catalog/meta${query ? `?${query}` : ""}`, preloaded) || null;
};

/**
 * Заранее запросить справочник для раздела каталога, на который ведёт ссылка: зовётся,
 * когда на ссылку навели курсор, коснулись пальцем или перешли клавиатурой. К нажатию
 * ответ обычно уже есть, и раздел рисуется сразу с кнопками моделей (см. metaResolved).
 */
// Справочник, который спросит каталог на этой странице (та же строка, что у
// catalogMetaQuery по фильтрам раздела); null — адрес не из каталога.
const catalogMetaQueryForPath = (href) => {
  const path = String(href || "").split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (path === "/catalog") return "";
  const model = parseModelLandingPath(path);
  if (model) return new URLSearchParams({ brand: model.brand }).toString();
  const landing = findCatalogLanding(path);
  if (!landing) return null;
  const filters = catalogFiltersFromParams(landingFilterParams(landing));
  return catalogMetaQuery(filters.type, filters.brand, filters.bodyType, filters.country);
};
// Сколько переход на страницу каталога ждёт её справочник (см. navigate в useRoute).
const CATALOG_META_WAIT_MS = 800;
const prefetchCatalogMeta = (href) => {
  const query = catalogMetaQueryForPath(href);
  if (query === null || resolvedCatalogMeta(query)) return;
  requestCatalogMeta(query).catch(() => {});
};
const EMPTY_CATALOG_META = { brands: [], models: [], bodyTypes: [], drives: [], countries: [], availability: {} };
// Строка запроса справочника: те же три признака и в каталоге, и в поиске на главной.
const catalogMetaQuery = (type, brand, bodyType, country = ANY_COUNTRY) => {
  const query = new URLSearchParams();
  if (type && type !== "Все") query.set("type", type);
  if (brand && brand !== "Все марки") query.set("brand", brand);
  appendMulti(query, "bodyType", bodyType, ANY_BODY_TYPE);
  // Страна — чтобы на странице страны марки и модели считались только по ней.
  if (countryKey(country)) query.set("country", countryKey(country));
  return query.toString();
};
let catalogRequest = null;
// Same split as the inline script in index.html: the 60-card list is only read by the
// home showcase and by "похожие автомобили", so the catalog asks for a single card.
// Каталог и страницы марок/типов открывают свой запрос с фильтрами, поэтому список
// из шестидесяти карточек им не нужен: просим одну — её достаточно, чтобы узнать
// размер каталога и что база отвечает.
const bootCatalogUrl = () => (isCatalogPath(currentAppPath()) ? "/api/cars?limit=1&sort=newest" : "/api/cars?limit=60&sort=variety");
// Memoised so StrictMode's double effect invocation does not fire the request twice.
const requestBootCatalog = () => (catalogRequest ||= window.__boot?.catalog || fetchCarsJson(bootCatalogUrl()));
// Загрузившись на /catalog, приложение знает одну машину — витрину главной и блок
// похожих из такого списка не собрать: они крутили бы по кругу пару просмотренных
// карточек. Флаг помнит этот урезанный старт, а запрос мемоизирован от StrictMode.
let bootListMinimal = isCatalogPath(currentAppPath());
let showcaseListRequest = null;
const requestShowcaseList = () => (showcaseListRequest ||= fetchCarsJson("/api/cars?limit=60&sort=variety"));
// Повторная попытка после неудачи должна именно спросить заново. И запомненное обещание,
// и то, что начала страница ещё до загрузки приложения, остаются неудачными навсегда —
// без этой очистки повтор мгновенно упирался бы в тот же отказ, что и первый раз.
const forgetBootCatalog = () => {
  catalogRequest = null;
  showcaseListRequest = null;
  if (window.__boot) {
    window.__boot.catalog = null;
    window.__boot.car = null;
  }
};
const requestBootCar = (id) => (window.__boot?.carId === id && window.__boot.car) || fetchCarsJson(`/api/cars/${encodeURIComponent(id)}`);
// Машина, встроенная прямо в страницу. Сервер, собирая карточку, кладёт её данные
// в window.__boot.carValue (вместе с соседями той же модели) и рендерит разметку из
// них же: браузер при оживлении рисует первый кадр из тех же байт, ничего не ждёт
// и совпадает с серверной разметкой. На прочих страницах значения нет.
// Сравнение по номеру объявления (sameListing): в адресе номер короткий, а в данных
// полный идентификатор с приставкой источника.
const bootCarSync = (id) => (id && window.__boot?.carValue && sameListing(window.__boot.carId, id) ? window.__boot.carValue : null);
const bootRelatedSync = () => (Array.isArray(window.__boot?.relatedValue) ? window.__boot.relatedValue : []);

export function App() {
  const [user, setUser] = useState(null);
  const { path, navigate, backToCatalog } = useRoute(user);
  const [authLoading, setAuthLoading] = useState(true);
  const { authRoute, authBackgroundPath, authModalOpen, contentPath } = resolveAuthRoute(path, window.history.state?.fromPath, user, authLoading);
  // Фон модального окна и загрузка его автомобиля используют один адрес.
  const dataPath = contentPath;
  const detailId = dataPath.startsWith("/cars/") ? dataPath.split("/")[2] : null;
  const orderId = dataPath.startsWith("/orders/draft/") ? dataPath.split("/")[3] : null;
  const targetId = detailId || orderId;
  // Filled once the session is known: a signed-out visitor has no favourites.
  const [favorites, setFavorites] = useState(() => new Set());
  // True once the account's list has arrived, so a pending heart is added to it and not
  // overwritten by the load that answers right after.
  const [favoritesReady, setFavoritesReady] = useState(false);
  // The car a signed-out visitor tried to save: added as soon as the account exists.
  const [pendingFavorite, setPendingFavorite] = useState(null);
  // Сохранённые поиски устроены как избранное: список приходит после входа,
  // а поиск, сохранённый до регистрации, ждёт аккаунт в pendingSavedSearch.
  const [savedSearches, setSavedSearches] = useState([]);
  const [savedSearchesReady, setSavedSearchesReady] = useState(false);
  const [pendingSavedSearch, setPendingSavedSearch] = useState(null);
  // По умолчанию цены в белорусских рублях: сайт для покупателей в Беларуси, и
  // в рублях сумма понятнее без пересчёта в уме. Доллары остаются в переключателе,
  // и выбранная валюта запоминается в браузере.
  const [currency, setCurrency] = useState("BYN");
  const pricingState = useSyncExternalStore(subscribePricing, getPricingState, getServerPricingState);
  useLayoutEffect(() => {
    metaResolvedUsable = true;
    restorePricingChoice();
  }, []);
  const quotaPricing = useMemo(() => ({
    on: !pricingState.quotaOver,
    refund50: pricingState.refund50,
    setRefund50: chooseDecreePricing,
    available: evQuotaPricingAvailable(),
    set: chooseQuotaPricing,
  }), [pricingState]);
  // Сохранённую тему и системное оформление читаем не в первом рисовании, а слоем
  // ниже (useLayoutEffect — до первого кадра): главную собирает и сервер, где ни
  // хранилища, ни системной темы нет. Внешний вид страницы от этого не мигает —
  // цвета задаёт атрибут data-theme на html, его ставит ранний скрипт страницы;
  // от React здесь зависит только кнопка смены темы.
  const [themeMode, setThemeMode] = useState("system");
  const [systemTheme, setSystemTheme] = useState("light");
  useLayoutEffect(() => {
    const savedTheme = window.localStorage.getItem("abcars-theme");
    if (savedTheme === "light" || savedTheme === "dark") setThemeMode(savedTheme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    if (media.matches) setSystemTheme("dark");
    // Пока вкладка открыта, система может переключиться на тёмное оформление (по
    // расписанию или вручную). Слушаем это и переключаемся следом — иначе «системная»
    // тема была бы системной только в момент загрузки страницы.
    const follow = (event) => setSystemTheme(event.matches ? "dark" : "light");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);
  const theme = themeMode === "system" ? systemTheme : themeMode;
  const [cars, setCars] = useState(() => {
    // Карточка машины: данные уже в странице — рисуем сразу, не дожидаясь каталога.
    const bootCar = bootCarSync(targetId);
    return bootCar ? [bootCar, ...bootRelatedSync()].map(normalizeImportedCar) : [];
  });
  // Three states, not two: null means the boot request has not answered yet. Routes that can
  // fetch on their own must not be forced down the static-catalog path while it is pending.
  const [apiMode, setApiMode] = useState(null);
  // The total only moves when an import runs, so the last known value is a sound placeholder
  // while the catalog request is in flight and keeps the search button from reading "0+".
  // Главную сервер рисует с настоящими цифрами (window.__boot.catalogFacts,
  // server/static-page.mjs) — с ними же и первый кадр.
  const [catalogTotal, setCatalogTotal] = useState(() => Number(window.__boot?.catalogFacts?.total) || 0);
  // Дата последней актуализации каталога — как и total, последнее известное значение
  // годится как заглушка, пока ответ каталога в пути.
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState(() => String(window.__boot?.catalogFacts?.updatedAt || ""));
  // Пара «размер каталога и дата обновления» для рекламной врезки в статьях. Держим
  // её одним запомненным значением: иначе каждое рисование корня давало бы новый
  // объект и перерисовывало всё, что слушает контекст.
  const catalogFacts = useMemo(() => ({ total: catalogTotal, updatedAt: catalogUpdatedAt }), [catalogTotal, catalogUpdatedAt]);
  // Запомненные значения — валюту, размер каталога и дату обновления — читаем из
  // хранилища только после оживления страницы. Главную собирает и сервер, у которого
  // хранилища нет: прочитай мы их прямо в первом рисовании, серверная и браузерная
  // разметка разошлись бы, и React перерисовал бы всю страницу заново.
  useEffect(() => {
    const storedCurrency = window.localStorage.getItem("navostok-currency");
    if (storedCurrency === "USD" || storedCurrency === "RUB") setCurrency(storedCurrency);
    const storedTotal = Number(window.localStorage.getItem(catalogTotalKey)) || 0;
    if (storedTotal) setCatalogTotal((current) => current || storedTotal);
    const storedUpdatedAt = window.localStorage.getItem(catalogUpdatedKey) || "";
    if (storedUpdatedAt) setCatalogUpdatedAt((current) => current || storedUpdatedAt);
  }, []);
  const [loading, setLoading] = useState(true);
  const [routeLoading, setRouteLoading] = useState(() => Boolean(targetId) && !bootCarSync(targetId));
  // Машина, которую загрузить не удалось: только для неё показываем «страницы нет».
  // Без этой отметки первый кадр после перехода из каталога (загрузчик карточки
  // ещё не включился) рисовал 404, и Метрика записывала заход с этим заголовком.
  const [missingTargetId, setMissingTargetId] = useState(null);
  const [loadError, setLoadError] = useState(false);
  // Счётчик попыток загрузить каталог. Меняется — загрузчик ниже запускается заново,
  // без перезагрузки всей страницы: заглушка «идут технические работы» пробует сама.
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retryCatalog = useCallback(() => {
    forgetBootCatalog();
    setLoadError(false);
    setLoading(true);
    setLoadAttempt((value) => value + 1);
  }, []);
  const [authPending, setAuthPending] = useState(false);
  const [authBackend, setAuthBackend] = useState("server");
  // Заказы посетителя нужны не только в кабинете: на карточке уже заказанной машины
  // кнопка меняется на «Добавлено в заказ». Держим здесь список её номеров.
  const [orderedListings, setOrderedListings] = useState(EMPTY_ORDERED_LISTINGS);
  const publishOrderedListings = useCallback((orders) => setOrderedListings(orderedListingsFrom(orders)), []);
  // Запрос актуальности прямо из карточки: заводим заказ и сразу отправляем запрос,
  // не уводя человека в кабинет. Кабинет он откроет сам, когда захочет.
  const requestCarAvailability = useCallback(async (car, account = user, backend = authBackend) => {
    if (!account || !car) return false;
    trackAvailabilityRequest({ listingId:car.id, car });
    try {
      if (backend === "local") {
        const created = createLocalOrder(account.id, car);
        const orders = created.order.availabilityStatus === "decision"
          ? updateLocalOrder(account.id, created.order.id, "request_availability_check", { comment:"" }).orders
          : created.orders;
        publishOrderedListings(orders);
        return true;
      }
      const createResponse = await fetch("/api/account/orders", { method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ listingId:car.id }) });
      if (!createResponse.ok) return false;
      const created = await createResponse.json().catch(() => ({}));
      // Заказ по этой машине мог уже существовать — тогда запрос не повторяем.
      if (created.order?.id && created.order.availabilityStatus === "decision") {
        const sent = await fetch(`/api/account/orders/${created.order.id}`, {
          method:"PATCH",
          credentials:"same-origin",
          headers:{ "content-type":"application/json" },
          body:JSON.stringify({ action:"request_availability_check", comment:"" }),
        });
        if (!sent.ok) return false;
      }
      const list = await fetch("/api/account/orders", { cache:"no-store", credentials:"same-origin" });
      if (list.ok) publishOrderedListings((await list.json()).orders);
      return true;
    } catch {
      return false;
    }
  }, [authBackend, publishOrderedListings, user]);
  // Метрика засчитывает первый заход сама при запуске счётчика. Дальше страницы
  // меняются без перезагрузки, и о каждом переходе ей нужно сказать отдельно —
  // иначе весь визит выглядит как одна страница.
  const metrikaStarted = useRef(false);
  useEffect(() => {
    if (path === "/analytics") {
      stopMetrika();
      return;
    }
    trackEvent("page_view");
    if (metrikaStarted.current) trackMetrikaView(window.location.href);
    metrikaStarted.current = true;
  }, [path]);
  useEffect(() => {
    window.localStorage.setItem("navostok-currency", currency);
  }, [currency]);
  useEffect(() => {
    if (catalogTotal) window.localStorage.setItem(catalogTotalKey, String(catalogTotal));
  }, [catalogTotal]);
  useEffect(() => {
    if (catalogUpdatedAt) window.localStorage.setItem(catalogUpdatedKey, catalogUpdatedAt);
  }, [catalogUpdatedAt]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111315" : "#ffffff");
  }, [theme]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = (event) => setSystemTheme(event.matches ? "dark" : "light");
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, []);
  useEffect(() => {
    fetchWithRetry("/api/auth/me", { cache:"no-store", credentials:"same-origin" })
      .then(async (response) => {
        if (response.ok) return response.json();
        if (response.status === 401) return { user:null };
        throw new Error("api_unavailable");
      })
      .then((payload) => setUser(payload.user || null))
      .catch(() => { setAuthBackend("local"); setUser(readLocalSession()); })
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => {
    if (authLoading) return undefined;
    let cancelled = false;
    if (!user) {
      setFavorites(new Set());
      setFavoritesReady(false);
      return undefined;
    }
    const localKey = accountFavoritesKey(user.id);
    const applyFavorites = (values) => {
      if (cancelled) return;
      setFavorites(values);
      setFavoritesReady(true);
    };
    const loadLocalFavorites = () => {
      let values = readFavorites(localKey);
      try {
        if (window.localStorage.getItem(localKey) === null && !window.localStorage.getItem(favoritesMigrationKey)) {
          values = readFavorites(guestFavoritesKey);
          storeFavorites(localKey, values);
          window.localStorage.setItem(favoritesMigrationKey, user.id);
        }
      } catch {}
      applyFavorites(values);
    };
    if (authBackend === "local") {
      loadLocalFavorites();
      return () => { cancelled = true; };
    }
    fetchWithRetry("/api/account/favorites", { cache:"no-store", credentials:"same-origin" })
      .then(async (response) => {
        if (response.status === 404) throw new Error("favorites_api_missing");
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "favorites_load_failed");
        return payload;
      })
      .then((payload) => applyFavorites(new Set(Array.isArray(payload.ids) ? payload.ids : [])))
      .catch((error) => {
        if (cancelled) return;
        // Переезд на браузерную копию — только когда API нет вовсе; после временного
        // сбоя показываем сохранённую копию, но сервер остаётся основным источником.
        if (error?.message === "favorites_api_missing") setAuthBackend("local");
        loadLocalFavorites();
      });
    return () => { cancelled = true; };
  }, [authBackend, authLoading, user]);
  // Заказы спрашиваем один раз на сессию: список машин в заказе меняется только когда
  // посетитель сам заводит заказ, и тогда кабинет обновляет его через контекст.
  // Гостю показывать нечего — список пустеет вместе с выходом из аккаунта.
  useEffect(() => {
    if (authLoading) return undefined;
    if (!user) {
      setOrderedListings(EMPTY_ORDERED_LISTINGS);
      return undefined;
    }
    let cancelled = false;
    const loadLocalOrders = () => { if (!cancelled) publishOrderedListings(readLocalOrders(user.id)); };
    if (authBackend === "local") {
      loadLocalOrders();
      return () => { cancelled = true; };
    }
    fetch("/api/account/orders", { cache:"no-store", credentials:"same-origin" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("orders_load_failed"))))
      .then((payload) => { if (!cancelled) publishOrderedListings(payload.orders); })
      .catch(loadLocalOrders);
    return () => { cancelled = true; };
  }, [authBackend, authLoading, publishOrderedListings, user]);
  useEffect(() => {
    if (authLoading) return undefined;
    let cancelled = false;
    if (!user) {
      setSavedSearches([]);
      setSavedSearchesReady(false);
      return undefined;
    }
    const applySearches = (values) => {
      if (cancelled) return;
      setSavedSearches(values);
      setSavedSearchesReady(true);
    };
    if (authBackend === "local") {
      applySearches(readLocalSearches(user.id));
      return () => { cancelled = true; };
    }
    fetchWithRetry("/api/account/searches", { cache:"no-store", credentials:"same-origin" })
      .then(async (response) => {
        if (response.status === 404) throw new Error("searches_api_missing");
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "searches_load_failed");
        return payload;
      })
      .then((payload) => applySearches(Array.isArray(payload.searches) ? payload.searches : []))
      .catch((error) => {
        if (cancelled) return;
        if (error?.message === "searches_api_missing") setAuthBackend("local");
        applySearches(readLocalSearches(user.id));
      });
    return () => { cancelled = true; };
  }, [authBackend, authLoading, user]);
  useEffect(() => {
    let cancelled = false;
    const setCatalogCars = (items) => setCars((current) => {
      const detailed = current.filter((car) => !car._summary);
      return items.map((item) => {
        const normalized = normalizeImportedCar(item);
        // Общий список не должен заменять уже открытую полную карточку своей
        // короткой версией: иначе сведения пропадают до ответа /api/cars/:id.
        return normalized._summary
          ? detailed.find((car) => sameListing(car.id, normalized.id)) || normalized
          : normalized;
      });
    });
    const load = async () => {
      try {
        const payload = await requestBootCatalog();
        let initialCars = payload.items || [];
        if (targetId && !initialCars.some((car) => sameListing(car.id, targetId))) {
          // Already in flight since index.html on a deep link, so this does not queue behind the list.
          const detailCar = await requestBootCar(targetId).catch(() => null);
          if (detailCar) initialCars = [...initialCars, detailCar];
        }
        // Соседи той же модели, встроенные в страницу карточки: не даём каталогу их
        // вытеснить, иначе блок «Другие … в наличии» опустел бы через секунду после
        // загрузки. Дубли отсеиваем по номеру объявления.
        for (const embedded of bootRelatedSync()) {
          if (!initialCars.some((car) => sameListing(car.id, embedded.id))) initialCars = [...initialCars, embedded];
        }
        if (!cancelled) {
          setCatalogCars(initialCars);
          setCatalogTotal(Number(payload.total) || initialCars.length);
          if (payload.refreshedAt) setCatalogUpdatedAt(payload.refreshedAt);
          setApiMode(true);
        }
      } catch {
        try {
          const payload = await loadStaticCatalog();
          if (!payload.cars?.length) throw new Error("empty import");
          let initialCars = payload.cars;
          if (targetId) {
            try {
              const detailCar = await loadStaticCar(targetId);
              initialCars = initialCars.map((car) => (sameListing(car.id, targetId) ? detailCar : car));
            } catch {}
          }
          if (!cancelled) {
            setCatalogCars(initialCars);
            setCatalogTotal(Number(payload.count) || payload.cars.length);
            if (payload.generatedAt) setCatalogUpdatedAt(payload.generatedAt);
            setApiMode(false);
          }
        } catch {
          if (!cancelled) setLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRouteLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);
  // Первый уход со страницы каталога после урезанного старта: дозапрашиваем
  // обычный список витрины, чтобы главной и похожим было из чего собираться.
  useEffect(() => {
    if (!apiMode || !bootListMinimal || isCatalogPath(dataPath)) return;
    let cancelled = false;
    requestShowcaseList()
      .then((payload) => {
        if (cancelled) return;
        bootListMinimal = false;
        const items = (payload.items || []).map(normalizeImportedCar);
        setCars((current) => {
          const known = new Set(current.map((car) => car.id));
          return [...current, ...items.filter((car) => !known.has(car.id))];
        });
      })
      .catch(() => {
        // Не получилось — забываем запрос, чтобы следующий переход попробовал снова.
        showcaseListRequest = null;
      });
    return () => { cancelled = true; };
  }, [apiMode, dataPath]);
  useEffect(() => {
    if (loading || !targetId) {
      if (!targetId) setRouteLoading(false);
      return;
    }
    const targetCar = findCarByListing(cars, targetId);
    const needsApiDetail = apiMode && (!targetCar || targetCar._summary);
    const needsStaticDetail = !apiMode && (!targetCar || targetCar._summary);
    if (!needsApiDetail && !needsStaticDetail) return;
    const controller = new AbortController();
    setRouteLoading(true);
    const request = apiMode
      ? fetch(`/api/cars/${encodeURIComponent(targetId)}`, { signal:controller.signal }).then((response) => (response.ok ? response.json() : Promise.reject(new Error("not found"))))
      : loadStaticCar(targetId, controller.signal);
    request
      .then((car) => setCars((current) => {
        const normalized = normalizeImportedCar(car);
        return current.some((item) => item.id === car.id) ? current.map((item) => (item.id === car.id ? normalized : item)) : [...current, normalized];
      }))
      .catch(() => {
        if (!controller.signal.aborted) setMissingTargetId(targetId);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false);
      });
    return () => controller.abort();
  }, [apiMode, targetId, cars, loading]);
  const awaitingTarget = Boolean(targetId) && !findCarByListing(cars, targetId) && missingTargetId !== targetId;
  const toggleFavorite = (id) => {
    // Saving without an account would strand the list in this browser, so the
    // heart offers registration instead of storing anything — and the car is held
    // aside so signing in finishes the click the visitor already made.
    if (!user) {
      setPendingFavorite(id);
      navigate("/register", { replace:true, preserveScroll:true });
      return;
    }
    const previous = new Set(favorites);
    const adding = !favorites.has(id);
    // Новая машина встаёт в начало набора, поэтому в избранном она оказывается сверху.
    const next = adding ? new Set([id, ...favorites]) : new Set([...favorites].filter((item) => item !== id));
    setFavorites(next);
    if (adding) {
      const car = cars.find((item) => item.id === id);
      trackEvent("favorite_added", { listingId:id, listingTitle:car?.title });
    }
    const localKey = accountFavoritesKey(user.id);
    if (authBackend === "local") {
      storeFavorites(localKey, next);
      return;
    }
    fetchWithRetry(`/api/account/favorites/${encodeURIComponent(id)}`, { method:adding ? "PUT" : "DELETE", credentials:"same-origin" })
      .then(async (response) => {
        if (response.status === 404) {
          storeFavorites(localKey, next);
          setAuthBackend("local");
          return;
        }
        if (!response.ok) throw new Error("favorite_save_failed");
      })
      .catch(() => setFavorites(previous));
  };
  // The heart pressed before signing in. Waiting for the account list keeps the car from
  // being wiped by the load that answers right after registration, and the visitor lands
  // where the click promised instead of in the profile.
  useEffect(() => {
    if (!pendingFavorite || !user || !favoritesReady) return;
    const id = pendingFavorite;
    setPendingFavorite(null);
    if (!favorites.has(id)) toggleFavorite(id);
    if (path !== "/favorites") navigate("/favorites", { replace:true });
  }, [favorites, favoritesReady, path, pendingFavorite, user]);
  const saveSearch = (filters) => {
    const normalized = normalizeSavedFilters(filters);
    // Гостю сохранять некуда: как и сердце в карточке, кнопка предлагает
    // регистрацию, а сам набор фильтров ждёт аккаунт и сохраняется после входа.
    if (!user) {
      setPendingSavedSearch(normalized);
      navigate("/register", { replace:true, preserveScroll:true });
      return;
    }
    const key = savedSearchKey(normalized);
    if (savedSearches.some((item) => savedSearchKey(item.filters) === key)) return;
    const title = savedSearchTitle(normalized);
    const draft = { id:`local-${Date.now()}`, title, filters:normalized, createdAt:new Date().toISOString() };
    const previous = savedSearches;
    const next = [draft, ...savedSearches];
    setSavedSearches(next);
    trackEvent("search_saved", { properties:{ title } });
    if (authBackend === "local") {
      storeLocalSearches(user.id, next);
      return;
    }
    fetchWithRetry("/api/account/searches", { method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ title, filters:normalized }) })
      .then(async (response) => {
        if (response.status === 404) {
          storeLocalSearches(user.id, next);
          setAuthBackend("local");
          return;
        }
        const payload = await response.json();
        if (!response.ok || !payload.search) throw new Error(payload.error || "search_save_failed");
        // Временную запись подменяет серверная: у неё настоящий номер для удаления.
        setSavedSearches((current) => current.map((item) => (item.id === draft.id ? payload.search : item)));
      })
      .catch(() => setSavedSearches(previous));
  };
  // Обновление сохранённого поиска: запись меняется на месте, без второй копии.
  // На сервере это удаление старой строки и создание новой — отдельной ручки нет.
  const updateSavedSearch = (id, filters) => {
    if (!user) return;
    const existing = savedSearches.find((item) => item.id === id);
    if (!existing) {
      saveSearch(filters);
      return;
    }
    const normalized = normalizeSavedFilters(filters);
    const key = savedSearchKey(normalized);
    // Такой набор уже сохранён другим поиском — старую запись просто убираем.
    const duplicate = savedSearches.some((item) => item.id !== id && savedSearchKey(item.filters) === key);
    if (duplicate) {
      deleteSavedSearch(id);
      return;
    }
    const title = savedSearchTitle(normalized);
    const previous = savedSearches;
    const next = savedSearches.map((item) => (item.id === id ? { ...item, title, filters:normalized } : item));
    setSavedSearches(next);
    trackEvent("search_saved", { properties:{ title, updated:true } });
    if (authBackend === "local" || String(id).startsWith("local-")) {
      storeLocalSearches(user.id, next);
      return;
    }
    (async () => {
      try {
        const removal = await fetch(`/api/account/searches/${encodeURIComponent(id)}`, { method:"DELETE", credentials:"same-origin" });
        if ([404, 502, 503].includes(removal.status)) {
          storeLocalSearches(user.id, next);
          setAuthBackend("local");
          return;
        }
        if (!removal.ok) throw new Error("search_update_failed");
        const creation = await fetch("/api/account/searches", { method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ title, filters:normalized }) });
        if ([404, 502, 503].includes(creation.status)) {
          storeLocalSearches(user.id, next);
          setAuthBackend("local");
          return;
        }
        const payload = await creation.json();
        if (!creation.ok || !payload.search) throw new Error(payload.error || "search_update_failed");
        setSavedSearches((current) => current.map((item) => (item.id === id ? payload.search : item)));
      } catch {
        setSavedSearches(previous);
      }
    })();
  };
  const deleteSavedSearch = (id) => {
    if (!user) return;
    const previous = savedSearches;
    const next = savedSearches.filter((item) => item.id !== id);
    setSavedSearches(next);
    if (authBackend === "local" || String(id).startsWith("local-")) {
      storeLocalSearches(user.id, next);
      return;
    }
    fetchWithRetry(`/api/account/searches/${encodeURIComponent(id)}`, { method:"DELETE", credentials:"same-origin" })
      .then((response) => {
        if (response.status === 404) {
          storeLocalSearches(user.id, next);
          setAuthBackend("local");
          return;
        }
        if (!response.ok) throw new Error("search_delete_failed");
      })
      .catch(() => setSavedSearches(previous));
  };
  // Поиск, сохранённый до регистрации: как только список аккаунта пришёл,
  // досохраняем его и ведём посетителя в «Мои поиски» — куда и вёл клик.
  useEffect(() => {
    if (!pendingSavedSearch || !user || !savedSearchesReady) return;
    const filters = pendingSavedSearch;
    setPendingSavedSearch(null);
    saveSearch(filters);
    if (path !== "/searches") navigate("/searches", { replace:true });
  }, [path, pendingSavedSearch, savedSearches, savedSearchesReady, user]);
  const pruneUnavailableFavorites = useCallback((ids) => {
    const unavailable = ids.filter((id) => favorites.has(id));
    if (!unavailable.length) return;
    const previous = new Set(favorites);
    const next = new Set(favorites);
    unavailable.forEach((id) => next.delete(id));
    setFavorites(next);
    if (!user) {
      storeFavorites(guestFavoritesKey, next);
      return;
    }
    const localKey = accountFavoritesKey(user.id);
    if (authBackend === "local") {
      storeFavorites(localKey, next);
      return;
    }
    Promise.all(unavailable.map((id) => fetchWithRetry(`/api/account/favorites/${encodeURIComponent(id)}`, {
      method:"DELETE",
      credentials:"same-origin",
    }))).then((responses) => {
      if (responses.some((response) => response.status === 404)) {
        storeFavorites(localKey, next);
        setAuthBackend("local");
        return;
      }
      if (responses.some((response) => !response.ok)) throw new Error("favorite_prune_failed");
    }).catch(() => setFavorites(previous));
  }, [authBackend,favorites,user]);
  const authenticate = async (mode, values) => {
    setAuthPending(true);
    const complete = (authenticatedUser, source) => {
      setUser(authenticatedUser);
      // Возвращаем аккаунт наружу: после регистрации из карточки нужно сразу отправить
      // запрос актуальности, а состояние приложения к этому мгновению ещё не обновилось.
      // В аналитику уходит только факт регистрации и способ (сервер или местный режим).
      // Имя и телефон живут в таблице аккаунтов — единственном месте, откуда их берёт
      // защищённый раздел: подделать их запросом со стороны там нельзя.
      if (mode === "register") trackEvent("registration_completed", { properties:{ source } });
      return { user:authenticatedUser, backend:source === "local" ? "local" : "server" };
    };
    try {
      if (authBackend === "local") {
        const localUser = await localAuthenticate(mode, values);
        return complete(localUser, "local");
      }
      let response;
      try {
        response = await fetchWithRetry(`/api/auth/${mode === "register" ? "register" : "login"}`, { method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify(values) });
      } catch {
        setAuthBackend("local");
        const localUser = await localAuthenticate(mode, values);
        return complete(localUser, "local");
      }
      if (response.status === 404) {
        setAuthBackend("local");
        const localUser = await localAuthenticate(mode, values);
        return complete(localUser, "local");
      }
      // Сервер жив, но временно сбоит: честная ошибка вместо местного аккаунта,
      // который разошёлся бы с настоящим.
      if (transientStatuses.has(response.status)) throw new Error("auth_failed");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "auth_failed");
      return complete(payload.user, "server");
    } finally {
      setAuthPending(false);
    }
  };
  // Заявка от незарегистрированного: либо обычная заявка с именем и телефоном, либо
  // сразу аккаунт — тогда машина попадает в кабинет заказом, как у всех остальных.
  const submitAvailabilityLead = async (car, form) => {
    if (form.createAccount) {
      const session = await authenticate("register", { name:form.name, phone:form.phone, password:form.password, confirm:form.confirm, consent:true });
      const done = await requestCarAvailability(car, session?.user, session?.backend);
      if (!done) throw new Error("lead_failed");
      return true;
    }
    trackAvailabilityRequest({ listingId:car.id, car });
    const response = await fetch("/api/order-drafts", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({
        listingId:car.id,
        name:form.name,
        contact:form.phone,
        consent:true,
        // Тот же тип, что у запроса из кабинета: в разделе «Заявки» это «Запрос актуальности».
        calculation:{ requestType:"availability_check", contactMethods:["phone"] },
      }),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "lead_failed");
    return true;
  };
  const availability = { signedIn:Boolean(user), request:requestCarAvailability, submitLead:submitAvailabilityLead };
  const logout = async () => {
    setAuthPending(true);
    try {
      if (authBackend === "server") await fetch("/api/auth/logout", { method:"POST", credentials:"same-origin" }).catch(() => {});
      window.localStorage.removeItem(localAuthKey);
      setUser(null);
      navigate("/");
    } finally {
      setAuthPending(false);
    }
  };
  const saveProfile = async (profile) => {
    setAuthPending(true);
    const normalized = {
      ...profile,
      name:profile.name.trim(),
      email:profile.email.trim().toLowerCase(),
      telegram:profile.telegram.trim().replace(/^@+/, ""),
      city:profile.city.trim(),
      passportNumber:profile.passportNumber.trim(),
      personalNumber:profile.personalNumber.trim(),
      passportIssueDate:profile.passportIssueDate.trim(),
      passportIssuedBy:profile.passportIssuedBy.trim(),
      registrationAddress:profile.registrationAddress.trim(),
    };
    try {
      if (authBackend === "local") {
        setUser(localUpdateProfile(user.id, normalized));
        return;
      }
      let response;
      try {
        response = await fetchWithRetry("/api/account", { method:"PATCH", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify(normalized) });
      } catch {
        throw new Error("profile_update_failed");
      }
      if (response.status === 404) {
        setAuthBackend("local");
        setUser(localUpdateProfile(user.id, normalized));
        return;
      }
      if (transientStatuses.has(response.status)) throw new Error("profile_update_failed");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "profile_update_failed");
      setUser(payload.user);
    } finally {
      setAuthPending(false);
    }
  };
  const removeAccount = async (password) => {
    setAuthPending(true);
    try {
      if (authBackend === "local") {
        await localDeleteAccount(user.id, password);
      } else {
        let response;
        try {
          response = await fetchWithRetry("/api/account", { method:"DELETE", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ password }) });
        } catch {
          // Обрыв сети: аккаунт на сервере остался бы, поэтому не делаем вид, что удалили.
          throw new Error("account_delete_failed");
        }
        if (response.status === 404) {
          setAuthBackend("local");
          await localDeleteAccount(user.id, password);
          response = null;
        }
        if (response && transientStatuses.has(response.status)) throw new Error("account_delete_failed");
        if (response) {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "account_delete_failed");
        }
      }
      window.localStorage.removeItem(localAuthKey);
      setUser(null);
      navigate("/");
    } finally {
      setAuthPending(false);
    }
  };
  // Ключ каталога. Обычно он равен адресу — так каждый раздел создаётся заново
  // и читает свой фильтр. Но когда на раздел увёл фильтр самого каталога, ключ
  // оставляем прежним: выдача уже та, что нужна, и пересоздание только мигало бы
  // заглушками. Метку ставит каталог, а гасит её отрисовка ниже.
  // Раздел модели по адресу — из встроенных данных или запросом (см. useModelLanding).
  const modelLanding = useModelLanding(contentPath);
  // Номер страницы списка — тоже часть ключа: переход по ссылке «?page=2» должен
  // пересоздать каталог с новым отступом, а не оставить прежний список.
  const listPageParam = String(new URLSearchParams(window.location.search).get("page") || "");
  const catalogPathKey = `${contentPath}${/^[1-9]\d{0,4}$/.test(listPageParam) && listPageParam !== "1" ? `?page=${listPageParam}` : ""}`;
  // Ключ каталога живёт, пока адрес тот, для которого он выдан. Переход, который
  // сделал сам каталог (смена фильтра увела на раздел или на страницу модели),
  // ключ не меняет — и не меняет его ни один следующий рендер на том же адресе:
  // раньше ключ обновлялся уже следующим рендером, и каталог пересоздавался,
  // как только приходили сведения о новой модели.
  const catalogKeyState = useRef({ path: contentPath, pathKey: catalogPathKey, key: catalogPathKey });
  if (isCatalogPath(contentPath)) {
    const state = catalogKeyState.current;
    if (catalogFilterMoveTarget === contentPath) {
      state.path = contentPath;
      state.pathKey = catalogPathKey;
    } else if (parseModelLandingPath(state.path) && parseModelLandingPath(contentPath) && state.path !== contentPath && catalogPathKey === contentPath) {
      // С одной модели на другую (первая страница списка): тот же экземпляр каталога,
      // он сам сменит отбор (см. adoptedLandingPath в Catalog) — без мигания.
      state.path = contentPath;
      state.pathKey = catalogPathKey;
    } else if (state.path !== contentPath || state.pathKey !== catalogPathKey) {
      state.path = contentPath;
      state.pathKey = catalogPathKey;
      state.key = catalogPathKey;
    }
  }
  const catalogKey = catalogKeyState.current.key;
  useEffect(() => {
    catalogFilterMoveTarget = null;
  });
  const showAccountFromAuthRoute = authRoute && Boolean(user);
  const closeAuthModal = () => {
    setPendingFavorite(null);
    setPendingSavedSearch(null);
    navigate(authBackgroundPath, { replace:true, preserveScroll:true });
  };
  // Pages built entirely from static content must never wait on the catalog request, and the
  // home page renders its own feed skeletons instead of blocking the whole route on it.
  const staticPage =
    contentPath === "/how-it-works" ? (
      <HowItWorksPage
        navigate={navigate}
        cars={cars}
        apiMode={apiMode}
        favorites={favorites}
        toggleFavorite={toggleFavorite}
        loading={loading}
      />
    ) : contentPath === "/faq" ? (
      <ServiceFaqRedirect />
    ) : contentPath === "/tracking" ? (
      <TrackingPage />
    ) : REVIEWS_ENABLED && contentPath === "/reviews" ? (
      <ReviewsRedirect />
    ) : contentPath === "/contacts" ? (
      <ContactsPage navigate={navigate} theme={theme} />
    ) : contentPath === "/privacy" ? (
      <LegalPage navigate={navigate} kind="privacy" />
    ) : contentPath === "/terms" ? (
      <LegalPage navigate={navigate} kind="terms" />
    ) : contentPath === MODELS_INDEX.path ? (
      <ModelsIndexPage navigate={navigate} />
    ) : BLOG_ENABLED && contentPath === BLOG_INDEX.path ? (
      <BlogIndexPage navigate={navigate} />
    ) : BLOG_ENABLED && findBlogPost(contentPath) ? (
      // Подборка сама запрашивает свой срез каталога и не ждёт общего boot-запроса.
      <BlogPostPage post={findBlogPost(contentPath)} navigate={navigate} favorites={favorites} toggleFavorite={toggleFavorite} />
    ) : findToolPage(contentPath) ? (
      <ToolPage tool={findToolPage(contentPath)} navigate={navigate} />
    ) : null;
  const page =
    contentPath === "/analytics" ? (
      // Пока отдельный файл страницы едет по сети, показываем пустоту: страница
      // служебная, её открывают единицы, а ожидание — доли секунды.
      <Suspense fallback={null}>
        <AnalyticsPage />
      </Suspense>
    ) : staticPage ? (
      staticPage
    ) : !showAccountFromAuthRoute && contentPath === "/" ? (
      <Home navigate={navigate} cars={cars} apiMode={apiMode} catalogTotal={catalogTotal} catalogUpdatedAt={catalogUpdatedAt} favorites={favorites} toggleFavorite={toggleFavorite} loading={loading} loadError={loadError} onRetry={retryCatalog} />
    ) : !showAccountFromAuthRoute && parseModelLandingPath(contentPath) && !modelLanding.landing && !modelLanding.provisional ? (
      // Раздел модели ещё не известен (переход внутри сайта): без имени модели каталог
      // не соберёт запрос. Неизвестная модель — «страницы нет».
      modelLanding.failed === "missing" ? <NotFound navigate={navigate} /> : modelLanding.failed ? <MaintenancePage onRetry={retryCatalog} /> : <AppLoader />
    ) : !showAccountFromAuthRoute && isCatalogPath(contentPath) ? (
      // Catalog issues its own filtered query, so it starts at mount rather than queueing
      // behind the boot request it never reads.
      // Страница марки, типа двигателя или кузова — тот же каталог с выставленным
      // фильтром и своим заголовком: отдельной вёрстки у неё нет.
      //
      // `key` по адресу обязателен. Фильтры каталог берёт из адреса один раз, при
      // создании, а при переходе с одного раздела на другой React оставил бы тот же
      // экземпляр: заголовок менялся, а выдача оставалась от прежней марки. С разным
      // ключом каждый раздел создаётся заново и читает свой фильтр.
      <Catalog key={catalogKey} navigate={navigate} cars={cars} apiMode={apiMode} favorites={favorites} toggleFavorite={toggleFavorite} saveSearch={saveSearch} updateSavedSearch={updateSavedSearch} deleteSavedSearch={deleteSavedSearch} savedSearches={savedSearches} landing={findCatalogLanding(contentPath) || modelLanding.landing || modelLanding.provisional} />
    ) : !showAccountFromAuthRoute && detailId && findCarByListing(cars, detailId) ? (
      // Машина уже известна (встроена в страницу или успела прийти) — карточку
      // рисуем сразу, не дожидаясь остального каталога: его ждёт только блок
      // похожих, а он умеет дорисоваться. Проверка кабинета обязательна, как у
      // главной и каталога: без неё вошедший со страницы машины видел бы карточку
      // вместо личного кабинета — detailId на адресах входа берётся из фона.
      <Detail car={findCarByListing(cars, detailId)} cars={cars} apiMode={apiMode} navigate={navigate} backToCatalog={backToCatalog} favorite={hasFavoriteListing(favorites, detailId)} favorites={favorites} toggleFavorite={toggleFavorite} />
    ) : loading || routeLoading || awaitingTarget ? (
      <AppLoader />
    ) : loadError ? (
      <MaintenancePage onRetry={retryCatalog} />
    ) : showAccountFromAuthRoute ? (
      <AccountPage user={user} cars={cars} apiMode={apiMode} favorites={favorites} toggleFavorite={toggleFavorite} authBackend={authBackend} navigate={navigate} onLogout={logout} onSaveProfile={saveProfile} onDeleteAccount={removeAccount} pending={authPending} />
    ) : contentPath === "/favorites" ? (
      <Favorites navigate={navigate} cars={cars} favorites={favorites} toggleFavorite={toggleFavorite} apiMode={apiMode} onUnavailableFavorites={pruneUnavailableFavorites} saving={Boolean(pendingFavorite) || !favoritesReady} />
    ) : contentPath === "/searches" ? (
      <SavedSearchesPage navigate={navigate} searches={savedSearches} onDelete={deleteSavedSearch} saving={Boolean(pendingSavedSearch) || !savedSearchesReady} apiMode={apiMode} cars={cars} favorites={favorites} toggleFavorite={toggleFavorite} />
    ) : contentPath === "/account" ? (
      authLoading ? <main className="simple-page page-width"><span>Личный кабинет</span><h1>Проверяем аккаунт…</h1></main> : user ? <AccountPage user={user} cars={cars} apiMode={apiMode} favorites={favorites} toggleFavorite={toggleFavorite} authBackend={authBackend} navigate={navigate} onLogout={logout} onSaveProfile={saveProfile} onDeleteAccount={removeAccount} pending={authPending} /> : null
    ) : orderId ? (
      <OrderDraft car={findCarByListing(cars, orderId)} navigate={navigate} />
    ) : detailId ? (
      <Detail car={findCarByListing(cars, detailId)} cars={cars} apiMode={apiMode} navigate={navigate} backToCatalog={backToCatalog} favorite={hasFavoriteListing(favorites, detailId)} favorites={favorites} toggleFavorite={toggleFavorite} />
    ) : (
      <NotFound navigate={navigate} />
    );
  return (
    <QuotaPricingContext.Provider value={quotaPricing}>
    <CatalogFactsContext.Provider value={catalogFacts}>
    <CurrencyContext.Provider value={currency}>
     <SetCurrencyContext.Provider value={setCurrency}>
     <OrderedListingsContext.Provider value={orderedListings}>
     <SetOrderedListingsContext.Provider value={publishOrderedListings}>
     <AvailabilityContext.Provider value={availability}>
     <AuthContext.Provider value={{ user, backend:authBackend }}>
      <ClientSeo path={path} car={findCarByListing(cars, detailId)} carPending={Boolean(detailId) && (loading || routeLoading || awaitingTarget)} landing={findCatalogLanding(path) || modelLanding.landing || modelLanding.provisional} />
      <div className={`app-content${contentPath === "/how-it-works" ? " service-video-shell service-video-header-active service-dark-region-active" : ""}`} aria-hidden={authModalOpen ? "true" : undefined} inert={authModalOpen ? true : undefined}>
        <Header
          navigate={navigate}
          favoritesCount={favorites.size}
          savedSearchesCount={savedSearches.length}
          path={path}
          user={user}
          themeMode={themeMode}
          setThemeMode={(nextThemeMode) => {
            if (nextThemeMode === "system") {
              window.localStorage.removeItem("abcars-theme");
              setThemeMode("system");
              return;
            }
            window.localStorage.setItem("abcars-theme", nextThemeMode);
            setThemeMode(nextThemeMode);
          }}
        />
        {page}
        <SiteFooter navigate={navigate} />
      </div>
      {authModalOpen && (
        <AuthModal
          mode={path === "/register" || path === "/favorites" || path === "/searches" ? "register" : "login"}
          navigate={navigate}
          onAuthenticate={authenticate}
          pending={authPending}
          onClose={closeAuthModal}
          redirectTo={resolvePostAuthPath(path, authBackgroundPath, pendingFavorite, pendingSavedSearch)}
        />
      )}
     </AuthContext.Provider>
     </AvailabilityContext.Provider>
     </SetOrderedListingsContext.Provider>
     </OrderedListingsContext.Provider>
     </SetCurrencyContext.Provider>
    </CurrencyContext.Provider>
    </CatalogFactsContext.Provider>
    </QuotaPricingContext.Provider>
  );
}

// Shared controls keep the same state and contexts on every route.
export { ANY_ACCEL, ANY_BATTERY, ANY_BODY_TYPE, ANY_COLOR, ANY_CONDITION, ANY_COUNTRY, ANY_ENGINE, ANY_FUEL, ANY_GEARBOX, ANY_MILEAGE, ANY_MODEL, ANY_OWNERS, ANY_POWER, ANY_PRICE_MAX, ANY_PRICE_MIN, ANY_RANGE, ANY_TIRE, ANY_YEAR_MAX, ANY_YEAR_MIN, ActionTooltip, AppLink, ApproxSign, AuthContext, AvailabilityContext, BlogCollectionCard, BlogCoverImage, BlogShareMenu, BrandMark, CarRow, CardSkeleton, CatalogFactsContext, ConsentField, CurrencySwitch, DecreePricingButton, EMPTY_AVAILABILITY, EMPTY_CATALOG_FACTS, EMPTY_CATALOG_META, EMPTY_ORDERED_LISTINGS, EXTERNAL_LINK_REL, EvQuotaButton, ExternalLink, FeaturedCard, FilterSheet, HomeFaqList, HoverImagePreview, IMAGE_ORIGINAL, IMAGE_WIDTH_CARD, NARROW_VIEWPORT, NotFound, OrderedListingsContext, POWERTRAIN_TABS, PasswordField, ScrollToTopButton, SegmentedControl, SelectField, SetOrderedListingsContext, SiteLogo, SoldVehiclePhoto, TotalPrice, VehicleSearch, ViewToggle, appendEngineRange, appendExclusions, appendMileageRange, appendMulti, appendPowerRange, appendPriceRange, appendYearRange, authMessages, batteryFloor, bootCatalogMeta, brandModelsCache, bynify, carHref, carOrigin, catalogFiltersFromParams, catalogMetaQuery, catalogUpdatedDate, catalogViewKey, clampPriceMax, clampYearMax, conditionGrades, countryKey, countryOptionsFor, createLocalOrder, currentAppPath, displayValue, emptyExclusions, exclusionValues, fetchCarsJson, filterNumber, formatDayAgo, hasExclusions, hasPriceRange, hasYearRange, heroCatalogHref, imageSource, itemsMatchingQuery, loadStaticCar, localAvailability, matchesAdvancedFilters, matchesExclusions, matchesMileageRange, matchesMulti, matchesPriceRange, matchesYears, matchingCatalogReturn, money, multiValues, normalizeImportedCar, normalizeLocalPhone, normalizeSavedFilters, number, parseHeroSearchOnce, patchHistoryState, pendingOrderKey, pluralRu, powertrainName, randomShuffleSeed, readCatalogView, readLocalOrders, renderInlineText, replaceHistoryEntry, requestCatalogMeta, retryWithFullImage, sameListing, sanitizePhoneInput, savedSearchCatalogHref, savedSearchKey, skeletonCards, startOfDayMs, storeLocalOrders, tabLabel, tabSelection, trackAvailabilityRequest, translateCity, typeValue, uniqueSorted, updateLocalOrder, useArticlePhotos, useCollectionCover, useCurrency, useDuelSides, useMediaQuery, useNarrowViewport, useQuotaPricing, useSetCurrency, useVehicleQuickView, withApprox };
