import { Fragment, Suspense, createContext, lazy, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Article, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, ArrowsLeftRight, BatteryHigh, BookmarkSimple, Calculator, CalendarBlank, CarProfile, CaretDown, CaretRight, ChatCircleText, Check, CheckCircle, ClipboardText, Clock, Copy, CurrencyCny, DotsThreeVertical, Engine, EnvelopeSimple, Eye, EyeSlash, GasPump, Gauge, Gear, Heart, Images, Info, Lightbulb, Lightning, List, ListChecks, LinkSimple, LockKey, MagnifyingGlass, MapPin, Moon, Newspaper, Palette, RoadHorizon, Rows, Scales, ShareNetwork, ShieldCheck, SignOut, SlidersHorizontal, Sparkle, SquaresFour, SteeringWheel, Sun, TelegramLogo, ThreadsLogo, Timer, Tire, Trash, UserCircle, UsersThree, X } from "./icons.jsx";
import { matchesYearRange, sortCars } from "./car-filters.js";
import { latinVariants, mileageBounds, mileageLabel, parseQueryRanges } from "./search-query.js";
import { FUEL_TYPES, GEARBOX_TYPES, engineAspiration, engineBounds, engineLabel, enginePower, engineVolume, engineVolumeBadge, fuelType, gearboxType, matchesEngineBounds, matchesPowerBounds, powerBounds, powerLabel } from "./engine-spec.js";
import { collectHeroAliases, isHeroExcludeWord, listSearchMatches, listSearchVariants, rankSearchEntries, rewriteQueryNames, searchNormalize, splitModelSegments, swapKeyboardLayout, translateBrandWords, translateModelWords } from "./search-dictionary.js";
import { COLOR_LABELS, colorLabelForWord, colorValuesForLabels, matchesColorLabels, translateColor } from "./colors.js";
import { cityName } from "./city-names.js";
import { CATALOG_LANDINGS, CATALOG_MAX_PAGES, CATALOG_PAGE_SIZE, brandLandingPath, catalogLandingForFilters, findCatalogLanding, landingFilterParams, landingHeading, landingsForCar, relatedLandings } from "./catalog-landings.js";
import { landingFaq, landingFaqTitle } from "./landing-faq.js";
import { FEED_CANDIDATE_WINDOW, seededRandom, shuffleCars, varietyOrder, varietyScore } from "./car-variety.js";
import { estimateLandedCost, PRICING, setPricingQuotaOver, yuanToUsdAbout } from "./pricing.js";
import { EV_QUOTA, evQuotaPricingAvailable, evQuotaState, isEvQuotaPricingOn, rememberEvQuotaPricing } from "./ev-quota.js";
import { estimateDeliveryDays } from "./china-logistics.js";
import { BODY_TYPES, normalizeBodyType } from "./body-types.js";
import { ANY_DRIVE, DRIVE_TYPES, normalizeDrive, orderDrives } from "./drive-types.js";
import { carAnchorSelector, clearCatalogReturn, feedAnchorSelector, readCatalogReturn, readHomeSearchReturn, readQuickViewReturn, saveCatalogReturn, saveCatalogReturnScroll, saveHomeSearchReturn, saveQuickViewReturn } from "./catalog-return.js";
import { formatListingAge, getListingAddedAt, getSourceListedAt, isNewListing } from "./listing-age.js";
import { formatChangeDate, getPriceChange } from "./price-change.js";
import { selectSimilarCars } from "./similar-cars.js";
import { MODEL_PAGES, MODELS_INDEX, findModelPage, modelPageForCar, modelPageRedirect } from "./model-pages.js";
import { carTitle } from "./car-title.js";
import { chineseModelName } from "../config/model-names-by.mjs";
import { splitInlineLinks } from "./inline-links.js";
import { loadModelText, loadedModelText } from "./model-text-load.js";
import { buildVehicleQuickInfo } from "./vehicle-quick-info.js";
import { brandNotice } from "./brand-notice.js";
import { translateTechnicalSpecs } from "./spec-translations.js";
import { formatRoundedListingCount } from "./catalog-count.js";
import { COMPANY } from "./company-data.js";
import { LEGAL_COPY } from "./legal-copy.js";
import { ABOUT_LIMITS, ABOUT_PRINCIPLES, PURCHASE_STEPS } from "./service-copy.js";
import { TOOL_PAGES, customsExample, deliveryStages, findToolPage, toolPageStats } from "./tool-pages.js";
import { loadToolPageTexts, loadedToolPageTexts } from "./tool-page-text-load.js";
import { BLOG_ENABLED } from "./feature-flags.js";
import { BLOG_INDEX, blogApiParams, blogCatalogHref, blogDuelRows, blogDuelSpecRows, blogHighlight, blogHighlightSort, blogCarFigure, blogCarReason, blogDateLine, blogListParams, blogPostSides, blogTopCars, BLOG_TOP_POOL, blogPostStats, blogPostTags, blogPosts, blogPostsFor, blogPostsForModel, blogRelatedPosts, blogRelativeDateSentence, blogSidebarItems, blogUpdatedAt, findBlogPost, homeBlogPosts } from "./blog-posts.js";
import { loadBlogText, loadedBlogText } from "./blog-text-load.js";
import { DELIVERY_CASES, DELIVERY_STATS } from "./delivery-cases.js";
import { FAQ_GROUPS, HOME_FAQ, HOME_ORDER_STEPS, PAYMENT_STAGES, RESPONSIBILITY_ITEMS } from "./purchase-info.js";
import { trackEvent, trackMetrikaGoal, trackMetrikaView } from "./analytics.js";
// Страница аналитики — служебная, посетителям не показывается. Её код (и код её
// таблиц) не кладём в общий файл приложения, а подгружаем отдельным файлом при
// первом открытии /analytics: каждому посетителю сайта он не нужен.
const AnalyticsPage = lazy(() => import("./analytics-page.jsx").then((m) => ({ default: m.AnalyticsPage })));

const number = (value) => new Intl.NumberFormat("ru-RU").format(value);
// В адресе карточки и в подписи «ID объявления» показываем только номер объявления:
// приставка источника («che168-», «CH-») посетителю ничего не говорит. Внутри
// приложения и в базе идентификатор остаётся полным, а сервер понимает оба вида,
// поэтому старые ссылки и закладки продолжают открываться.
const listingNumber = (value) => String(value ?? "").replace(/^(che168|guazi|ch|gz)[-_]/i, "");
const carHref = (car) => `/cars/${encodeURIComponent(listingNumber(car?.id))}`;
// Заголовок страницы машины. Он же уходит в Метрику, когда карточку открывают
// быстрым просмотром: в отчётах такой просмотр должен выглядеть ровно так же,
// как открытая страница этой машины, а не как что-то отдельное.
const carPageTitle = (car) => `${car?.title || carTitle(car?.brand, car?.model, car?.year)}, ${number(car?.mileage)} км — цена до Минска | abcars.by`;
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
// Заказ хранит полный идентификатор объявления, карточка — тоже, но в адресах живёт
// короткий номер. Сравниваем по номеру, как и избранное.
const orderedListingsFrom = (orders) => new Set((orders || []).map((order) => listingNumber(order?.listingId)).filter(Boolean));
const useOrderedListings = () => useContext(OrderedListingsContext) || EMPTY_ORDERED_LISTINGS;
const toDisplayCurrency = (usd, currency) => (currency === "BYN" ? Math.round(usd * PRICING.usdByn) : usd);
const money = (usd, currency) => (currency === "BYN" ? `${number(toDisplayCurrency(usd, currency))} BYN` : `$${number(usd)}`);
const approximateMoney = (low, high, currency) => `≈ ${money(Math.round((low + high) / 2), currency)}`;

const ANY_YEAR_MIN = "Год от";
const ANY_YEAR_MAX = "До";
const ANY_PRICE_MIN = "Цена от";
const ANY_PRICE_MAX = "До";
const ANY_MILEAGE = "Пробег";
const ANY_CONDITION = "Состояние";
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
const POWERTRAIN_TABS = ["Все", "Электромобили", "Гибриды", "Бензин"];
const typeLabel = (value) => (value === "Электромобиль" ? "Электромобили" : value === "Гибрид" ? "Гибриды" : value === "ДВС" ? "Бензин" : "Все");
const typeValue = (label) => (label === "Электромобили" ? "Электромобиль" : label === "Гибриды" ? "Гибрид" : label === "Бензин" || label === "ДВС" ? "ДВС" : "Все");
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
const translateBattery = (value) =>
  ({
    磷酸铁锂: "LFP · литий-железо-фосфатная",
    三元锂: "NMC · тройная литиевая",
    "三元锂+磷酸铁锂": "NMC + LFP · комбинированная",
  })[value] || displayValue(value);
const translateSourceValue = (value) =>
  value
    ? {
        优秀: "Отлично",
        在保中: "Гарантия действует",
        非常好: "Очень хорошо",
        衰减保修: "Гарантия на деградацию",
        每车必检: "Обязательная проверка",
        终身包退: "Пожизненный возврат по условиям площадки",
      }[value] || value
    : null;
const translateClaims = (value) => {
  if (!value) return "Не указано";
  const match = String(value).match(/(\d+)\s*次理赔|理赔\s*(\d+)\s*次/);
  if (!match) return translateSourceValue(value);
  const count = Number(match[1] ?? match[2]);
  if (count === 0) return "Нет страховых случаев";
  const word = count % 10 === 1 && count % 100 !== 11 ? "случай" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "случая" : "случаев";
  return `${count} страховой ${word}`;
};
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
const matchesAdvancedFilters = (car, { drive, owners, battery = ANY_BATTERY, condition = ANY_CONDITION, accel = ANY_ACCEL, tire = ANY_TIRE, range = ANY_RANGE, engine = ANY_ENGINE, power = ANY_POWER, gearbox = ANY_GEARBOX, fuel = ANY_FUEL }) =>
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
const proxiedImageHosts = new Set(["image-public.guazistatic.com", "image-oversea.guazistatic-global.com"]);
// Фотохранилище Che168 умеет отдавать снимок любой ширины: она стоит в адресе перед
// именем файла («1400x0_c42_...»). Оригинал на 1400 точек весит около 110 КБ, а в
// карточке он показывается втрое мельче — на десятке карточек это лишние мегабайты,
// из-за которых фотографии и не догружались. Просим ту ширину, в которой показываем:
// 400 точек — это уже 12 КБ. Высоту хранилище считает само, поэтому ставим ноль.
const resizedImageHref = (url, width) => {
  if (!width || !/(^|\.)autoimg\.cn$/.test(url.hostname)) return null;
  const path =
    width === IMAGE_ORIGINAL
      ? url.pathname.replace(/\/\d+x\d+_c\d+_(?=[^/]*$)/, "/")
      : url.pathname.replace(/\/\d+x\d+_(?=[^/]*$)/, `/${width}x0_`);
  if (path === url.pathname) return null;
  const resized = new URL(url.href);
  resized.pathname = path;
  return resized.href;
};
// Фотохранилище Che168 стоит в Китае и раздаётся через чужую сеть доставки. Кадр,
// который у неё «горячий», приходит за 0,2 с, но любой снимок, которого там сейчас
// нет, заставляет ждать 0,8–1,1 с — из-за этого фотографии и «не грузились при
// первом заходе». Поэтому просим их не напрямую, а со своего адреса /photo/…:
// наш сервер один раз забирает кадр у китайцев и дальше отдаёт его с диска всем
// посетителям (0,08 с). Заодно снимки идут по уже открытому соединению с сайтом.
// Настройка кэша — в snippets/abcars-photo-location.conf на сервере.
const photoProxyHost = /(^|\.)autoimg\.cn$/;
const canProxyPhotos = () => import.meta.env.BASE_URL === "/";
const imageSource = (source, width) => {
  if (!source) return source;
  try {
    const url = new URL(source);
    // Static preview hosts do not have the image-proxy API; use the original
    // allowlisted source there so catalog images remain visible.
    if (proxiedImageHosts.has(url.hostname) && canProxyPhotos()) return `/api/image?src=${encodeURIComponent(url.href)}`;
    const resized = resizedImageHref(url, width) || source;
    if (photoProxyHost.test(url.hostname) && canProxyPhotos()) {
      try {
        return `/photo${new URL(resized).pathname}`;
      } catch {
        return resized;
      }
    }
    return resized;
  } catch {
    return source;
  }
};
// Ширины под места, где показываем фото: с запасом для экранов с двойной плотностью.
// Большое фото в карточке машины и в галерее просит настоящий оригинал — см.
// IMAGE_ORIGINAL ниже.
// Кадр карточки на широком экране занимает 250 точек, лента фото на телефоне — около
// 250: просить 800 значило качать снимок в четыре раза крупнее, чем он показан. На
// главной это была ровно половина её веса — 68 фотографий вместо 1,4 МБ дают 0,4 МБ.
const IMAGE_WIDTH_CARD = 600;
// Кадр карточки на компьютере. Показан он в 308 точек (сетка из четырёх колонок при
// ширине страницы 1280), то есть 600 — ровно двойная плотность, придираться к
// разрешению не к чему. Но хранилище жмёт webp тем сильнее, чем меньше ширина: на
// 600 выходит 0,09 байта на пиксель, на 900 — 0,07. Уменьшенный браузером кадр на
// 900 чище, и это единственная причина ширины: не разрешение, а качество сжатия.
// На телефоне остаётся 600: там карточка показана в 165 точек (две в ряд), 900 не
// даст ничего видимого, зато утяжелит страницу вдвое на мобильном интернете.
const IMAGE_WIDTH_CARD_WIDE = 900;
const IMAGE_WIDTH_STRIP = 500;
const IMAGE_WIDTH_TILE = 600;
const IMAGE_WIDTH_THUMB = 240;
// Крупные места: фотография внутри статьи (780 точек) и большой снимок в карточке
// машины. Здесь кадр показан втрое шире, чем в списке, поэтому и просить нужно шире —
// иначе снимок выглядит мыльным.
const IMAGE_WIDTH_ARTICLE = 800;
// Потолок для второго кадра. Хранилище отдаёт снимок любой ширины вплоть до оригинала
// (у разных объявлений это от 1537 до 2016 точек), но 1400 — та ширина, которая стоит
// в адресах объявлений, то есть наш кэш фотографий её уже знает. Просить больше значит
// заводить новые файлы в кэше и качать вдвое больше байт ради разницы, которой не
// видно: на снимке шириной 780 точек экран с двойной плотностью просит 1560, и 1400
// от них отличается неразличимо.
const IMAGE_WIDTH_DOUBLE_CAP = 1400;
// Особая «ширина» для больших фото: настоящий оригинал снимка. Хранилище отдаёт его
// по тому же адресу без части «1400x0_c42_» перед именем файла, и это не просто более
// широкий кадр — версия с кодом c42 сжата вдвое сильнее (0,06 байта на пиксель против
// 0,12 у оригинала) и вдобавок подрезана. Замер 28.08.2026 на 12 снимках: у половины
// объявлений исходник всего 1024 точки, у остальных 1601–2016, средний вес оригинала
// 70,7 КБ против 55 КБ у кадра 1400x0_c42. Дороже на четверть, а разрешение и чистота
// заметно выше — для снимка, показанного во всю ширину галереи, это того стоит.
const IMAGE_ORIGINAL = "original";

/**
 * Второй, вдвое более широкий кадр для экранов с двойной плотностью. На обычном экране
 * браузер скачает первый и ничего не потеряет, на retina возьмёт второй и покажет
 * резкую картинку. Так вес страницы растёт только там, где эта резкость видна.
 *
 * Хранилище отдаёт снимок любой ширины (проверено: 240, 600, 1200, 1400 — всё живое),
 * а выше 1537 возвращает оригинал, поэтому вторая ширина ограничена.
 */
const imageSourceSet = (source, width) => {
  if (!source || !width || typeof width !== "number") return undefined;
  const single = imageSource(source, width);
  const double = imageSource(source, Math.min(width * 2, IMAGE_WIDTH_DOUBLE_CAP));
  return single && double && double !== single ? `${single} 1x, ${double} 2x` : undefined;
};
// Страховка: если кадр не пришёл — уменьшенного нет в хранилище или наш кэш
// почему-то не ответил, — берём оригинал прямо из хранилища, мимо своего адреса.
// Тяжёлое фото лучше пустой рамки. Повторяем только один раз.
const retryWithFullImage = (event, source) => {
  const image = event.currentTarget;
  if (!source || image.dataset.fullSize) return;
  image.dataset.fullSize = "1";
  image.src = source;
};

function normalizeImportedCar(car) {
  const description = car.description || "";
  const legacyScore = Number(car.appearanceScore);
  const appearanceScore = legacyScore > 100 ? Number(String(legacyScore).slice(0, 2)) : legacyScore || null;
  const model = car.brand === "Deepal" ? String(car.model).replace(/^深蓝/, "") : car.brand === "Voyah" ? String(car.model).replace(/^岚图/, "") : car.model;
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
const daysRange = ([low, high]) => `${low}–${high} ${pluralRu(high, "день", "дня", "дней")}`;

const startOfDayMs = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

// «сегодня» / «вчера» / «5 дней назад», а для давних дат — число и месяц:
// «143 дня назад» посетителю ничего не говорит, «18 августа» — говорит.
function formatDayAgo(value) {
  const at = new Date(value || "");
  if (!Number.isFinite(at.getTime())) return null;
  const now = new Date();
  const days = Math.round((startOfDayMs(now) - startOfDayMs(at)) / 86400000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days <= 30) return `${days} ${pluralRu(days, "день", "дня", "дней")} назад`;
  const date = formatChangeDate(at);
  return at.getFullYear() === now.getFullYear() ? date : `${date} ${at.getFullYear()}`;
}

// Строка дат карточки: когда машина попала в наш каталог (firstSeenAt) и когда мы
// последний раз сверяли её с источником (last_checked_at, его пишет npm run refresh;
// у ни разу не сверённых карточек — дата импорта). Сверку показываем, только если она
// была позже добавления, иначе строка дважды повторяет один и тот же день.
function carDatesLine(car) {
  const addedValue = getListingAddedAt(car);
  const added = formatDayAgo(addedValue);
  const checked = formatDayAgo(car?.checkedAt);
  if (!added) return checked ? `Обновлено ${checked}` : null;
  const addedAt = new Date(addedValue);
  const checkedAt = new Date(car?.checkedAt || "");
  const updated = checked && Number.isFinite(checkedAt.getTime()) && startOfDayMs(checkedAt) > startOfDayMs(addedAt);
  return `Добавлено ${added}${updated ? ` · Обновлено ${checked}` : ""}`;
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

function useRoute() {
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
  const navigate = (next, { replace = false, preserveScroll = false, catalogState = null } = {}) => {
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
      navigate(movedModel, { replace: true, preserveScroll, catalogState });
      return;
    }
    const currentPath = appPath(window.location.pathname);
    const targetPath = appPath(target.pathname);
    const keepScrollPosition = preserveScroll || targetPath === "/login" || targetPath === "/register";
    const targetUrl = `${basePath}${target.pathname}${target.search}${target.hash}`;
    dropScrollSave();
    if (replace) {
      const currentIsAuthRoute = currentPath === "/login" || currentPath === "/register";
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
          scrollY: Number(catalogState?.scrollY) || 0,
          ...(catalogState
            ? { catalog: catalogState.catalog, scrollAnchor: catalogState.scrollAnchor || null, scrollAnchorOffset: Number(catalogState.scrollAnchorOffset) || 0 }
            : {}),
        },
        targetUrl,
      );
    }
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

const appHref = (path) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

// Страницы марок, типов двигателя и кузова — это тот же каталог с выставленным фильтром,
// поэтому всё, что каталог делает со своим адресом (сохраняет прокрутку, помнит фильтры
// при возврате из карточки, подсвечивает пункт меню), должно работать и на них.
const isCatalogPath = (path) => path === "/catalog" || Boolean(findCatalogLanding(path));

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
  return <a href={appHref(href)} onClick={handleClick} {...props}>{children}</a>;
}

// Абзацы обзоров изредка ссылаются со середины текста на соседний раздел каталога —
// разбор ссылок общий с сервером, см. src/inline-links.js.
function renderInlineText(text, navigate) {
  return splitInlineLinks(text).map((part, index) =>
    typeof part === "string" ? (
      part
    ) : (
      <AppLink key={`link-${index}`} href={part.href} navigate={navigate}>
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

// Стрелка изменения цены: вверх красная, вниз зелёная. По наведению — цена до
// переоценки и её дата. Старая цена пересчитывается тем же расчётом, что и
// текущая, поэтому в подсказке она в выбранной валюте.
function PriceChangeMark({ car }) {
  const currency = useCurrency();
  const change = getPriceChange(car);
  if (!change) return null;
  const date = formatChangeDate(change.changedAt);
  const hint = `Было ${money(change.previousTotalUsd, currency)}${date ? ` · ${date}` : ""}`;
  const tooltip = (
    <>
      <b>Было {money(change.previousTotalUsd, currency)}</b>
      {date && <i>{date}</i>}
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
// Длинная цена в рублях («≈ 1 521 424 BYN») вместе с кружком стрелки в строку не
// влезала, и стрелка съезжала под цену. По длине надписи этого не угадать: места
// разной ширины (каталог, карточка заказа, телефон), а в карточке заказа рядом стоит
// ещё и переключатель валюты. Поэтому смотрим на уже нарисованную строку: если она
// разъехалась на две — или, там где переносы запрещены, вылезла за край, — уменьшаем
// кегль ступенью и смотрим снова. Множитель кладём в переменную: на сколько это точек,
// решают стили того места, где цена нарисована.
const PRICE_FIT_STEPS = [0.92, 0.84, 0.76, 0.68];

function TotalPrice({ car, price, currency, className = "" }) {
  const boxRef = useRef(null);
  const lineRef = useRef(null);
  const text = `≈ ${money(price.totalUsd, currency)}`;
  useLayoutEffect(() => {
    const box = boxRef.current;
    const line = lineRef.current;
    if (!box || !line) return undefined;
    // Строка занимает больше одного прямоугольника — значит перенеслась.
    // Единица запаса по ширине: дробные ширины дают лишние доли пикселя.
    // Нулевая ширина — цена сейчас не показана (мобильная и обычная разметка
    // живут в одном месте, лишняя спрятана): мерить нечего, кегль не трогаем.
    const fits = () => {
      if (!box.clientWidth) return true;
      const rects = line.getClientRects();
      return rects.length === 1 && rects[0].width <= box.clientWidth + 1;
    };
    // Цены, которые и так помещаются (а это почти все), обходятся одним замером:
    // кегль им не трогаем вовсе. Замер идёт для каждой цены в выдаче, поэтому
    // лишняя работа здесь заметна.
    const fit = () => {
      box.style.removeProperty("--price-fit");
      if (fits()) return;
      for (const step of PRICE_FIT_STEPS) {
        box.style.setProperty("--price-fit", String(step));
        if (fits()) return;
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return undefined;
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
    return () => observer.disconnect();
  }, [text]);
  return (
    <strong ref={boxRef} className={className || undefined}>
      {/* Обёртка нужна только для замера: у блочного `strong` ширина всегда во всю
          колонку, а перенос виден лишь по строчному элементу вокруг самой надписи.
          Класс на ней — чтобы правила вида «любой span внутри цены — серый и мелкий»
          (а такие есть и в строке каталога, и в карточке на главной) не покрасили
          саму цену: см. .price-line в стилях. */}
      <span ref={lineRef} className="price-line">{text}<PriceChangeMark car={car} /></span>
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

// Иллюстрации отдаём в AVIF и WebP, PNG оставляем последним запасом: браузер берёт
// первый формат, который понимает, и вместо ~10 МБ картинок страницы тянут ~0,8 МБ.
// Обёртка `<picture>` из раскладки исключена через `display: contents`, поэтому все
// существующие правила размеров продолжают относиться к самой картинке.
function Illustration({ src, alt, ...props }) {
  const base = src.replace(/\.png$/, "");
  return (
    <picture className="illustration">
      <source type="image/avif" srcSet={appHref(`${base}.avif`)} />
      <source type="image/webp" srcSet={appHref(`${base}.webp`)} />
      <img src={appHref(src)} alt={alt} {...props} />
    </picture>
  );
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
  "/": ["Автомобили из Китая в Беларусь — abcars.by", "Автомобили с пробегом из Китая с проверкой, расчётом стоимости и доставкой в Минск и Беларусь."],
  "/catalog": ["Автомобили с пробегом из Китая — каталог и цены | abcars.by", "Каталог автомобилей с пробегом из Китая: бензиновые, электрические и гибридные, с характеристиками, пробегом и ориентировочной стоимостью доставки в Беларусь."],
  "/how-it-works": ["О сервисе покупки автомобилей из Китая | abcars.by", "Проверка объявления и автомобиля, договор, оплата, выкуп, доставка и выдача автомобиля из Китая в Минске."],
  "/delivered": ["Доставленные автомобили из Китая — примеры и цены | abcars.by", "Примеры автомобилей, доставленных из Китая в Беларусь: маршрут, сроки, пробег и итоговая стоимость до Минска."],
  "/payment-and-contract": ["Оплата и договор при покупке авто из Китая | abcars.by", "Этапы оплаты автомобиля из Китая, условия договора, состав стоимости, ответственность сторон и документы."],
  "/guarantees": ["Гарантии при покупке автомобиля из Китая | abcars.by", "Что проверяется и фиксируется при покупке автомобиля из Китая, за что отвечает abcars.by и какие риски обсуждаются до договора."],
  "/faq": ["Вопросы о покупке и доставке авто из Китая | abcars.by", "Ответы о проверке, стоимости, оплате, сроках доставки, таможенном оформлении и покупке автомобиля из Китая в Беларуси."],
  "/contacts": ["Контакты abcars.by — автомобили из Китая в Минске", "Контакты сервиса abcars.by в Минске. Консультация по выбору, проверке, покупке и доставке автомобиля из Китая."],
  "/privacy": ["Политика конфиденциальности | abcars.by", "Политика обработки и защиты персональных данных пользователей сайта abcars.by."],
  "/terms": ["Условия использования сайта | abcars.by", "Условия использования каталога abcars.by, предварительных расчётов и информации об автомобилях из Китая."],
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
  for (const post of blogPosts()) routeSeo[post.path] = [post.seoTitle, post.seoDescription];
}

const privateRouteSeo = {
  "/favorites": ["Избранные автомобили | abcars.by", "Сохранённые автомобили в вашем личном кабинете abcars.by."],
  "/searches": ["Мои поиски | abcars.by", "Сохранённые поиски автомобилей в вашем личном кабинете abcars.by."],
  "/login": ["Вход в личный кабинет | abcars.by", "Вход в личный кабинет клиента abcars.by."],
  "/register": ["Регистрация личного кабинета | abcars.by", "Создание личного кабинета клиента abcars.by."],
  "/account": ["Личный кабинет | abcars.by", "Заказы, избранные автомобили и личные данные клиента abcars.by."],
};

function ClientSeo({ path, car, landing }) {
  useEffect(() => {
    const privatePage = ["/favorites", "/searches", "/login", "/register", "/account", "/analytics"].includes(path) || path.startsWith("/orders/");
    const detailTitle = car?.title || (car ? carTitle(car.brand, car.model, car.year) : null);
    // Заголовок и описание страницы марки, типа двигателя или кузова лежат в её
    // описании (src/catalog-landings.js) — там же, откуда их берёт сервер, когда
    // собирает эту страницу для поисковика. Иначе два места писали бы по-разному.
    const landingSeo = landing ? [landing.seoTitle, landing.seoDescription] : null;
    const [title, description] = detailTitle
      ? [carPageTitle(car), `${detailTitle}: пробег ${number(car.mileage)} км, ${String(car.type || "автомобиль").toLowerCase()}. Проверка и предварительный расчёт цены до Минска.`]
      : landingSeo || privateRouteSeo[path] || (path.startsWith("/orders/") ? ["Заказ автомобиля | abcars.by", "Оформление и статус заказа автомобиля в личном кабинете abcars.by."] : null) || routeSeo[path] || ["Страница не найдена | abcars.by", "Запрошенная страница не найдена."];
    const canonicalRoot = document.querySelector('link[rel="canonical"]')?.href || `${window.location.origin}${import.meta.env.BASE_URL}`;
    const canonicalBase = new URL(canonicalRoot);
    canonicalBase.pathname = "/";
    canonicalBase.search = "";
    canonicalBase.hash = "";
    // Без косой черты на конце — как отвечает хостинг и как ведут внутренние ссылки.
    // С чертой первоисточник указывал на адрес, с которого посетителя перебрасывают.
    const canonicalPath = detailTitle ? carHref(car) : path === "/" ? "/" : path.replace(/\/+$/, "");
    const canonical = new URL(canonicalPath, canonicalBase).href;
    const indexingEnabled = document.documentElement.dataset.seoIndexing === "true";
    const indexable = indexingEnabled && !privatePage && Boolean(routeSeo[path] || detailTitle || landingSeo);
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
    // `null` означает «описание уже стоит в странице, менять нечем»: так помечены
    // страницы обзоров, чьи описания живут только на сервере.
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
  }, [path, car, landing]);
  return null;
}

/* Both theme variants ship in the markup and CSS reveals the matching one: the
   theme attribute is set before first paint, so swapping `src` from React state
   would only add a flash of the wrong logo on hydration. */
function CurrencySwitch({ currency, setCurrency, className = "" }) {
  return (
    <div className={`currency-switch${className ? ` ${className}` : ""}`} role="group" aria-label="Валюта цен">
      {[["USD", "$"], ["BYN", "BYN"]].map(([code, label]) => (
        <button key={code} type="button" className={currency === code ? "active" : ""} aria-pressed={currency === code} onClick={() => setCurrency(code)}>
          {label}
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

// Остаток льготной квоты на электромобили. Пока она действует, пошлина 0% —
// на этом держится вся цена «под ключ» в каталоге, поэтому цифра стоит в шапке.
// Данные обновляются скриптом npm run quota из сводок таможни.
const QUOTA_AUDIENCES = [["personal", "Физ. лица"], ["business", "Юр. лица"]];

// Переключатель режима цен. Стоит над вкладками, потому что относится ко всему
// сайту, а не к выбранной половине квоты: с ним видно цену по льготе, без него —
// с пошлиной 15%, которая включится, когда квота кончится.
function QuotaPricingToggle() {
  const pricing = useQuotaPricing();
  const available = Boolean(pricing?.available);
  const on = Boolean(pricing?.on);
  const hint = !available
    ? "Квота выбрана — пошлина 15% уже в каждой цене."
    : on
      ? "Цены по льготе: пошлина 0%. Выключите — прибавится пошлина 15%."
      : "В ценах пошлина 15%. Включите — вернутся цены по льготной квоте.";
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

function EvQuotaPanel({ quotas }) {
  const [audience, setAudience] = useState("personal");
  const quota = quotas[audience];
  const forecast = quota.exhausted
    ? `Квота выбрана${quota.exhaustedOnLabel ? ` ${quota.exhaustedOnLabel}` : ""}: к цене каждого электромобиля добавляется ввозная пошлина 15%.`
    : quota.stale || quota.overdue
      ? "Сводка устарела — свежий остаток смотрите у таможни."
      : `Расход держится около ${number(quota.perWeek)} машин в неделю. При таком темпе квота закончится примерно ${quota.runsOutLabel}, а дальше к цене добавится пошлина 15%.`;
  return (
    <div className="quota-panel">
      <QuotaPricingToggle />
      <div className="quota-panel-tabs" role="group" aria-label="Чья квота">
        {QUOTA_AUDIENCES.map(([code, label]) => (
          <button
            key={code}
            type="button"
            className={audience === code ? "active" : ""}
            aria-pressed={audience === code}
            onClick={() => setAudience(code)}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Остаток и расход по месяцам — про одно и то же, поэтому лежат в одной
          плашке: заголовок «Расход квоты» списку не нужен, месяцы говорят сами. */}
      <div className="quota-panel-figure">
        <b>Ост. {number(quota.remaining)} из {number(quota.total)}</b>
        {/* Полоса заполняется израсходованным: почти полная — значит квота на исходе. */}
        <i className="quota-panel-bar" aria-hidden="true">
          <b style={{ width: `${Math.min(100, Math.max(2, Math.round(quota.usedShare * 100)))}%` }} />
        </i>
        <small>Данные за {quota.asOfLabel}. Осталось квот:</small>
        <div className="quota-panel-months">
          <ul>
            {quota.periods.map((period) => (
              <li key={period.key} className={period.future ? "future" : undefined}>
                <span>{period.label}</span>
                <strong>{period.left == null ? "—" : number(period.left)}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="quota-panel-forecast">{forecast}</p>
    </div>
  );
}

const QUOTA_TOOLTIP = (
  <>
    <b>Что за квоты</b>
    <span>Беларусь пускает без пошлины ограниченное число электромобилей в год. Пока квота есть, машина дешевле на 15%.</span>
  </>
);

function EvQuotaButton({ quotas }) {
  // В шапке — общий остаток по стране: физлица плюс юрлица. Разбивка по каждой
  // половине лежит во вкладках карточки.
  const remaining = quotas.personal.remaining + quotas.business.remaining;
  const total = quotas.personal.total + quotas.business.total;
  const [open, setOpen] = useState(false);
  const shellRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === "Escape" || (event.type === "pointerdown" && !shellRef.current?.contains(event.target))) {
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
        type="button"
        className={`icon-label quota-link${open ? " selected" : ""}`}
        aria-expanded={open}
        aria-controls="ev-quota-panel"
        aria-label={`Осталось квот ${number(remaining)} из ${number(total)} на беспошлинный ввоз электромобилей`}
        onClick={() => setOpen((value) => !value)}
      >
        <Lightning size={20} weight="bold" />
        <span>Осталось квот</span>
        <strong>{number(remaining)}</strong>
        {/* Слово «квота» само себя не объясняет, поэтому по наведению — короткий
            рассказ о том, что это и зачем на него смотреть. Пока карточка открыта,
            подсказки нет: цифры и прогноз уже перед глазами. Своя подсказка вместо
            title у кнопки — иначе браузер показал бы рядом вторую, системную. */}
        {!open && <ActionTooltip className="quota-link-tooltip" text={QUOTA_TOOLTIP} />}
      </button>
      <div
        className={`quota-pop${open ? " open" : ""}`}
        id="ev-quota-panel"
        aria-hidden={!open}
        inert={open ? undefined : true}
      >
        <EvQuotaPanel quotas={quotas} />
      </div>
    </div>
  );
}

function Header({ navigate, favoritesCount, savedSearchesCount, path, currency, setCurrency, user, theme, toggleTheme }) {
  const catalogActive = path === "/catalog" || path.startsWith("/catalog/") || path.startsWith("/cars/") || path.startsWith("/orders/");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
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
      <div className="header-inner">
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
              <nav aria-label="Основная навигация">
                <AppLink href="/catalog" navigate={navigate} className={catalogActive ? "active" : ""} aria-current={catalogActive ? "page" : undefined}>Автомобили</AppLink>
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
              <div className="header-menu-settings">
                {/* На телефоне четвёртая кнопка в шапку не влезает, поэтому остаток
                    квоты живёт здесь же, где валюта и «Мои поиски». Валюта стоит
                    первой: карточка квоты длинная, и переключатель под ней
                    оказывался за пределами экрана. */}
                <CurrencySwitch currency={currency} setCurrency={setCurrency} className="header-menu-currency" />
                <div className="header-menu-quota">
                  <EvQuotaPanel quotas={quotas} />
                </div>
              </div>
          </div>
        </div>
        <div className="header-actions">
          <EvQuotaButton quotas={quotas} />
          <CurrencySwitch currency={currency} setCurrency={setCurrency} />
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
            title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          >
            {theme === "dark" ? <Sun size={20} weight="bold" /> : <Moon size={20} weight="bold" />}
          </button>
          <button
            className={`icon-label searches-link${path === "/searches" ? " selected" : ""}`}
            aria-label="Мои поиски"
            aria-current={path === "/searches" ? "page" : undefined}
            onClick={() => (user ? navigate("/searches") : navigate("/register", { replace:true, preserveScroll:true }))}
          >
            <BookmarkSimple size={21} weight={savedSearchesCount ? "fill" : "bold"} />
            <span>Мои поиски</span>
            {savedSearchesCount > 0 && <b>{savedSearchesCount}</b>}
          </button>
          <button
            className={`icon-label favorites-link${path === "/favorites" ? " selected" : ""}`}
            aria-label="Избранное"
            aria-current={path === "/favorites" ? "page" : undefined}
            onClick={() => (user ? navigate("/favorites") : navigate("/register", { replace:true, preserveScroll:true }))}
          >
            <Heart size={21} weight={favoritesCount ? "fill" : "bold"} />
            <span>Избранное</span>
            {favoritesCount > 0 && <b>{favoritesCount}</b>}
          </button>
          <button
            className={`icon-label account-link${path === "/account" || path === "/login" || path === "/register" ? " selected" : ""}`}
            aria-label={user ? `Личный кабинет — ${user.name.split(" ")[0]}` : "Войти"}
            aria-current={path === "/account" ? "page" : undefined}
            onClick={() => user ? navigate("/account") : navigate("/login", { replace:true, preserveScroll:true })}
          >
            <UserCircle size={22} weight={user ? "fill" : "bold"} />
            <span>{user ? user.name.split(" ")[0] : "Войти"}</span>
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

function SelectField({ label, value, options, onChange, searchable = false, multiple = false, className = "", disabled = false, formatOption = (item) => item, optionCounts, optionIcon, icon: Icon }) {
  // В режиме мультивыбора value — массив, а первая опция играет роль «сбросить всё».
  const allOption = multiple ? options[0] : null;
  const selectedValues = multiple ? (Array.isArray(value) ? value : value && value !== allOption ? [value] : []) : [];
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
  const selectedIndex = Math.max(0, options.indexOf(highlighted));
  const filteredOptions = useMemo(() => {
    // Поиск по списку идёт тем же приведением, что и поиск по каталогу: «skoda»
    // находит «Škoda», «mercedes benz» — «Mercedes-Benz».
    // Ищем и по набранному кириллицей: «ау» — это «au», а значит Audi.
    if (!searchable) return options;
    return listSearchMatches(options, query);
  }, [options, query, searchable]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

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
    optionsRef.current?.querySelector('[role="option"].active')?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

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
    <div className={`select-field custom-select${className ? ` ${className}` : ""}${open ? " open" : ""}${disabled ? " disabled" : ""}`} ref={rootRef}>
      <button ref={triggerRef} type="button" className={`select-trigger${Icon ? " with-icon" : ""}`} aria-label={`${label}: ${triggerText}`} aria-haspopup="listbox" aria-expanded={disabled ? false : open} aria-controls={listId} disabled={disabled} onClick={() => (open ? close() : setOpen(true))} onKeyDown={handleKeyDown}>
        {Icon && <Icon className="select-trigger-icon" size={20} weight="duotone" aria-hidden="true" />}
        <b>{triggerText}</b>
        <CaretDown size={16} weight="bold" />
      </button>
      {!disabled && (
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
          <div className="select-options" id={listId} role="listbox" aria-label={label} aria-multiselectable={multiple || undefined} ref={optionsRef}>
            {filteredOptions.length ? (
              filteredOptions.map((item, index) => {
                const optionCount = optionCounts?.get(item);
                const chosen = isChosen(item);
                return (
                  <button type="button" id={`${listId}-${index}`} role="option" aria-selected={chosen} className={`${chosen ? "selected" : ""}${index === activeIndex ? " active" : ""}`} key={item} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item)}>
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
                  </button>
                );
              })
            ) : (
              <p className="select-empty">Ничего не найдено</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HomeFaqItem({ item, initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <article className={`home-faq-item${open ? " open" : ""}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>{item.question}</span>
        <CaretDown size={20} weight="bold" aria-hidden="true" />
      </button>
      <div className="animated-disclosure" aria-hidden={!open}>
        <div><p>{item.answer}</p></div>
      </div>
    </article>
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
  if (tabs && selectedType !== "Все" && !tabs.includes(selectedType)) return false;
  // Пустая вкладка (машин такого топлива в каталоге нет вовсе) не должна раздевать
  // панель: поля остаются на месте, просто выбирать в них нечего. А пока справочник
  // не пришёл, полей нет — появиться позже спокойнее, чем исчезнуть на глазах.
  if (!(Number(availability?.total) || 0)) return availability?.total !== undefined;
  return (Number(availability[key]) || 0) > 0;
};
// Фильтры, привязанные к типу двигателя: при смене вкладки топлива они пропадают
// с экрана, поэтому оставленное значение сбрасывается — иначе скрытый фильтр молча
// резал бы выдачу.
const POWERTRAIN_FILTER_RESET = { battery:ANY_BATTERY, range:ANY_RANGE, engine:ANY_ENGINE, gearbox:ANY_GEARBOX, fuel:ANY_FUEL };
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

// Всплывающая подсказка внизу экрана: инверсия цветов страницы, крестик и
// самостоятельное закрытие через несколько секунд.
function Toast({ text, onClose }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const timer = window.setTimeout(() => close.current(), 4000);
    return () => window.clearTimeout(timer);
  }, [text]);
  return (
    <div className="app-toast" role="status">
      <span>{text}</span>
      <button type="button" onClick={() => close.current()} aria-label="Закрыть">
        <X size={16} weight="bold" />
      </button>
    </div>
  );
}

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

// Группы марок в шторке выбора. Перечислены не китайские марки, а иностранные:
// каталог собран на китайском рынке, местных марок там больше и они постоянно
// прибавляются — незнакомое имя почти всегда китайское, поэтому всё, чего нет в
// двух списках ниже, считается китайским.
const GERMAN_BRANDS = new Set(["Audi", "BMW", "Mercedes-Benz", "MINI", "Porsche", "Volkswagen"]);
// Спорные случаи решены так, как их ищут: MINI — марка BMW, поэтому она у немцев;
// Volvo принадлежит Geely, но остаётся шведской и стоит в «Другом»; MG числится
// китайской — марка британская, но принадлежит SAIC, а машины делают и продают
// в Китае как местные.
const FOREIGN_BRANDS = new Set([
  "Alfa Romeo", "Buick", "Cadillac", "Chevrolet", "Citroen", "Ford", "Honda", "Hyundai",
  "Infiniti", "Jaguar", "Jeep", "Kia", "Land Rover", "Lexus", "Lincoln", "Maserati",
  "Mazda", "Mitsubishi", "Nissan", "Peugeot", "Skoda", "Subaru", "Tesla", "Toyota", "Volvo",
]);
const BRAND_GROUPS = ["Все", "Китай", "Германия", "Другое"];
const brandGroupOf = (brand) => (GERMAN_BRANDS.has(brand) ? "Германия" : FOREIGN_BRANDS.has(brand) ? "Другое" : "Китай");

function VehicleSearch({ constrained = false, selectedType, onTypeChange, values, actions, options, optionCounts, availability, resultCount, onSubmit, onReset, onSaveSearch, searchSaved = false, searchUpdate = false, hasActiveFilters = false, initiallyExpanded = false, onExpandedChange = null }) {
  const currency = useCurrency();
  const narrow = useNarrowViewport();
  // На широком экране «Ещё фильтры» раскрывают строку прямо в панели, на телефоне
  // фильтры живут в шторках: марка и модель, «Фильтры» целиком, цена, год, пробег.
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(() => initiallyExpanded && !window.matchMedia("(max-width: 700px)").matches);
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
      <SelectField className={className} label="Тип двигателя" icon={Engine} value={selectedType} onChange={onTypeChange} options={POWERTRAIN_TABS} formatOption={powertrainLabel} />
      <SelectField className={className} label="Пробег" icon={Gauge} value={values.mileage} onChange={actions.mileage} options={mileageOptions} />
      <SelectField className={className} label="Кузов" icon={CarProfile} value={values.bodyType} onChange={actions.bodyType} options={options.bodyTypes} multiple />
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
    type: ["Тип двигателя", () => <SelectField label="Тип двигателя" icon={Engine} value={selectedType} onChange={onTypeChange} options={POWERTRAIN_TABS} formatOption={powertrainLabel} />],
    price: ["Цена", () => priceRange()],
    year: ["Год выпуска", () => yearRange()],
    mileage: ["Пробег", () => <SelectField label="Пробег" icon={Gauge} value={values.mileage} onChange={actions.mileage} options={mileageOptions} />],
    bodyType: ["Кузов", () => <SelectField label="Кузов" icon={CarProfile} value={values.bodyType} onChange={actions.bodyType} options={options.bodyTypes} multiple />],
    color: ["Цвет", () => <SelectField label="Цвет" icon={Palette} value={values.color} onChange={actions.color} options={[ANY_COLOR, ...COLOR_LABELS]} multiple />],
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
          <SelectField label="Марка" value={values.brand} onChange={actions.brand} options={options.brands} optionCounts={optionCounts?.brands} optionIcon={(brand) => (brand === "Все марки" ? <SquaresFour size={18} weight="fill" /> : <BrandMark brand={brand} />)} searchable />
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
          <div className="sheet-search">
            <MagnifyingGlass size={18} weight="bold" aria-hidden="true" />
            <input
              type="search"
              value={sheetQuery}
              placeholder={sheet === "models" ? "Поиск модели" : "Поиск марки"}
              aria-label={sheet === "models" ? "Поиск модели" : "Поиск марки"}
              autoComplete="off"
              onChange={(event) => {
                const next = event.target.value;
                setSheetQuery(next);
                // Ищем всегда по всем маркам: на вкладке «Германия» запрос «Зикр»
                // показывал пустоту, хотя марка в каталоге есть. Начали печатать —
                // вкладка возвращается на «Все», чтобы было видно, где ищем.
                if (next.trim()) setBrandGroup("Все");
              }}
            />
            {sheetQuery && (
              <button type="button" className="sheet-search-clear" aria-label="Очистить поиск" onClick={() => setSheetQuery("")}>
                <X size={18} weight="bold" />
              </button>
            )}
          </div>
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
          {hasActiveFilters && onSaveSearch && <span className="filter-actions-divider" aria-hidden="true" />}
          {hasActiveFilters && (
            <button type="button" className="search-reset" onClick={onReset}>
              <X size={16} weight="bold" />
              Сбросить
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
  const [remoteMeta, setRemoteMeta] = useState(() => bootCatalogMeta(catalogMetaQuery(typeValue(type), brand, bodyType)) || EMPTY_CATALOG_META);
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
  const availability = apiMode ? remoteMeta.availability : localAvailability(typedCars);
  const resultCount = modelCars.filter((car) => matchesMulti(car.model, model, ANY_MODEL) && matchesColorLabels(car.bodyColor, multiValues(color, ANY_COLOR)) && matchesYears(car, yearMin, yearMax) && matchesMileageRange(car, mileage) && matchesPriceRange(car, priceMin, priceMax) && matchesAdvancedFilters(car, { drive, owners, battery, condition, accel, tire, range, engine, power, gearbox, fuel })).length;
  const hasActiveFilters = type !== "Все" || brand !== "Все марки" || multiValues(model, ANY_MODEL).length > 0 || multiValues(bodyType, ANY_BODY_TYPE).length > 0 || multiValues(color, ANY_COLOR).length > 0 || hasYearRange(yearMin, yearMax) || mileage !== ANY_MILEAGE || hasPriceRange(priceMin, priceMax) || drive !== ANY_DRIVE || owners !== ANY_OWNERS || battery !== ANY_BATTERY || condition !== ANY_CONDITION || accel !== ANY_ACCEL || tire !== ANY_TIRE || range !== ANY_RANGE || engine !== ANY_ENGINE || power !== ANY_POWER || gearbox !== ANY_GEARBOX || fuel !== ANY_FUEL;
  useEffect(() => {
    // Ждать загрузочный запрос незачем: справочник нужен сразу и уходит параллельно
    // с витриной. Останавливает его только выясненный статический режим.
    if (apiMode === false) return undefined;
    const metaKey = catalogMetaQuery(normalizedType, brand, bodyType);
    const carsQuery = new URLSearchParams({ limit: "1" });
    if (normalizedType !== "Все") carsQuery.set("type", normalizedType);
    if (brand !== "Все марки") carsQuery.set("brand", brand);
    appendMulti(carsQuery, "bodyType", bodyType, ANY_BODY_TYPE);
    appendMulti(carsQuery, "model", model, ANY_MODEL);
    colorValuesForLabels(multiValues(color, ANY_COLOR)).forEach((value) => carsQuery.append("color", value));
    appendYearRange(carsQuery, yearMin, yearMax);
    appendMileageRange(carsQuery, mileage);
    appendPriceRange(carsQuery, priceMin, priceMax);
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
    setFuel(ANY_FUEL);
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
      selectedType={type}
      onTypeChange={changeType}
      values={{ brand, model, yearMin, yearMax, priceMin, priceMax, mileage, bodyType, color, drive, owners, battery, condition, accel, tire, range, engine, power, gearbox, fuel }}
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
      options={{ brands, models, bodyTypes, drives }}
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
  if (parsed?.matched) return parsed;
  // Ничего не нашлось — возможно, запрос набран не в той раскладке.
  const swapped = swapKeyboardLayout(query);
  if (searchNormalize(swapped) === searchNormalize(query)) return parsed;
  const alt = await parseHeroSearchOnce(swapped, context);
  // Запоминаем исправленный текст — выдача покажет его рядом с запросом.
  if (alt?.matched) return { ...alt, correctedQuery: swapped.trim() };
  return parsed;
}

async function parseHeroSearchOnce(query, { apiMode, cars, currency }) {
  // Сначала из запроса вынимаются цена, пробег и годы («от 25000 до 40000»,
  // «пробег до 50 тыс», «2021-2023»), остаток разбирается как марка и модель.
  const ranges = parseQueryRanges(rewriteQueryNames(query), { currency });
  const tokens = searchNormalize(ranges.rest).split(" ").filter(Boolean);
  if (!tokens.length && !ranges.hasRanges) return null;
  // Номер объявления (например, 59116012) — ищем эту конкретную машину.
  const idToken = tokens.find((token) => /^\d{6,}$/.test(token));
  if (idToken) return { matched: true, listingId: idToken, brand: "", models: [], yearFrom: "", yearTo: "", drive: "", bodyType: "", powertrain: "", gearbox: "", fuel: "", colors: [], priceMinUsd: null, priceMaxUsd: null, mileageMin: null, mileageMax: null, accelMax: null, batteryMin: null, rangeMin: null, engineMin: null, engineMax: null, powerMin: null, powerMax: null, ...emptyExclusions() };
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
  const result = { matched: false, brand: "", models: [], yearFrom, yearTo, drive, bodyType, powertrain, gearbox, fuel, colors, priceMinUsd: ranges.priceMinUsd, priceMaxUsd: ranges.priceMaxUsd, mileageMin: ranges.mileageMin, mileageMax: ranges.mileageMax, accelMax: ranges.accelMax, batteryMin: ranges.batteryMin, rangeMin: ranges.rangeMin, engineMin: ranges.engineMin, engineMax: ranges.engineMax, powerMin: ranges.powerMin, powerMax: ranges.powerMax, ...exclusions };
  if (!text) {
    result.matched = Boolean(ranges.hasRanges || drive || bodyType || powertrain || gearbox || fuel || colors.length || hasExclusions(exclusions));
    return result;
  }

  // Полностью введённая марка в начале запроса: остаток текста ищем среди её моделей.
  let matchedBrand = "";
  let matchedBrandNorm = "";
  let modelText = text;
  for (const entry of brandEntries) {
    const norm = searchNormalize(entry.name);
    if (!norm) continue;
    if ((text === norm || text.startsWith(`${norm} `)) && norm.length > matchedBrandNorm.length) {
      matchedBrand = entry.name;
      matchedBrandNorm = norm;
      modelText = text.slice(norm.length).trim();
    }
  }
  if (matchedBrand) {
    result.brand = matchedBrand;
    if (!modelText) {
      result.matched = true;
      return result;
    }
    let models = [];
    if (metaLoaded) {
      try {
        const meta = await requestCatalogMeta(new URLSearchParams({ brand: matchedBrand }).toString());
        models = meta.models.map((item) => ({ name: item.model, count: Number(item.count) || 0 }));
      } catch {}
    } else {
      const counts = new Map();
      for (const car of cars) if (car.brand === matchedBrand && car.model) counts.set(car.model, (counts.get(car.model) || 0) + 1);
      models = [...counts].map(([name, count]) => ({ name, count }));
    }
    const segments = splitModelSegments(modelText);
    if (!segments.length) {
      result.matched = true;
      return result;
    }
    const matchedModels = [];
    for (const segment of segments) {
      const found = rankSearchEntries(models, segment).slice(0, 12).map((entry) => entry.name);
      if (!found.length) {
        // Марку узнали, а кусок текста ни на одну её модель не похож —
        // честнее показать пустую выдачу, чем все машины марки.
        result.brand = "";
        return result;
      }
      for (const name of found) if (!matchedModels.includes(name)) matchedModels.push(name);
    }
    result.models = matchedModels.slice(0, 12);
    result.matched = true;
    return result;
  }

  // Марка целиком не совпала: недописанная марка важнее случайного совпадения модели.
  const brandMatches = rankSearchEntries(brandEntries, text);
  if (brandMatches.length && brandMatches[0].rank >= 3) {
    result.brand = brandMatches[0].name;
    result.matched = true;
    return result;
  }
  const textSegments = splitModelSegments(text);
  const modelNames = [];
  let allSegmentsMatched = textSegments.length > 0;
  for (const segment of textSegments) {
    const found = rankSearchEntries(modelEntries, segment).slice(0, 12).map((entry) => entry.name);
    if (!found.length) {
      allSegmentsMatched = false;
      break;
    }
    for (const name of found) if (!modelNames.includes(name)) modelNames.push(name);
  }
  if (allSegmentsMatched && modelNames.length) {
    result.models = modelNames.slice(0, 12);
    result.matched = true;
    return result;
  }
  if (brandMatches.length) {
    result.brand = brandMatches[0].name;
    result.matched = true;
  }
  return result;
}

// Ссылка в каталог и запрос к серверу называют одни и те же фильтры по-разному:
// каталог ждёт yearFrom/body и множественное «Электромобили», сервер — yearMin/bodyType
// и единственное число. Из-за смешения этих имён год из поиска раньше терялся.
const heroCatalogHref = (parsed) => {
  const params = new URLSearchParams();
  if (parsed.powertrain) params.set("type", typeLabel(parsed.powertrain));
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
  if (filters.type !== "Все") chips.push(typeLabel(filters.type));
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
  if (filters.fuel && filters.fuel !== ANY_FUEL) chips.push(filters.fuel.toLowerCase());
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

// ── Страница раздела и фильтры ────────────────────────────────────────────────
// Раздел каталога — это тот же каталог с выставленным фильтром, поэтому фильтр можно
// поменять прямо на нём. Пока это никак не отслеживалось, страница марки Audi после
// переключения на BMW оставалась «Автомобилями Audi» — и заголовком, и адресом,
// и текстом внизу, — хотя показывала BMW.

/**
 * Раздел, под которым уместно показывать выдачу с такими фильтрами. Разбор общий с
 * сервером: фильтры превращаются в тот же адрес каталога, который разбирает он.
 * `preferPath` — раздел, открытый сейчас: пока он остаётся правдой, никуда не уходим.
 */
const landingForFilters = (filters, preferPath = null) => catalogLandingForFilters(savedSearchCatalogHref(filters).split("?")[1] || "", preferPath);

// Запрос числа подходящих машин — те же имена параметров, что собирает каталог.
const savedSearchApiParams = (filters) => {
  const query = new URLSearchParams();
  if (filters.type !== "Все") query.set("type", filters.type);
  if (filters.brand !== "Все марки") query.set("brand", filters.brand);
  appendMulti(query, "model", filters.model, ANY_MODEL);
  appendMulti(query, "bodyType", filters.bodyType, ANY_BODY_TYPE);
  colorValuesForLabels(multiValues(filters.color, ANY_COLOR)).forEach((value) => query.append("color", value));
  if (filters.drive !== ANY_DRIVE) query.set("drive", filters.drive);
  if (filters.owners !== ANY_OWNERS) query.set("ownersMax", String(filterNumber(filters.owners)));
  if (filters.battery !== ANY_BATTERY) query.set("batteryMin", String(batteryFloor(filters.battery)));
  if (filters.condition !== ANY_CONDITION) query.set("conditionGrade", conditionGrades[filters.condition]);
  if (filters.accel && filters.accel !== ANY_ACCEL) query.set("accelMax", String(filterNumber(filters.accel)));
  if (filters.tire && filters.tire !== ANY_TIRE) query.set("tireRimMin", String(filterNumber(filters.tire)));
  if (filters.range && filters.range !== ANY_RANGE) query.set("rangeMin", String(filterNumber(filters.range)));
  appendEngineRange(query, filters.engine);
  appendPowerRange(query, filters.power);
  if (filters.gearbox && filters.gearbox !== ANY_GEARBOX) query.set("gearbox", filters.gearbox);
  if (filters.fuel && filters.fuel !== ANY_FUEL) query.set("fuel", filters.fuel);
  appendExclusions(query, filters, { api: true });
  appendYearRange(query, filters.yearMin, filters.yearMax);
  appendMileageRange(query, filters.mileage);
  appendPriceRange(query, filters.priceMin, filters.priceMax);
  if (filters.sort && filters.sort !== "default") query.set("sort", filters.sort);
  return query;
};
const matchesSavedFilters = (car, filters) =>
  matchesExclusions(car, filters) &&
  (filters.type === "Все" || car.type === filters.type) &&
  (filters.brand === "Все марки" || car.brand === filters.brand) &&
  matchesMulti(car.model, filters.model, ANY_MODEL) &&
  matchesMulti(car.bodyType, filters.bodyType, ANY_BODY_TYPE) &&
  matchesColorLabels(car.bodyColor, multiValues(filters.color, ANY_COLOR)) &&
  matchesYears(car, filters.yearMin, filters.yearMax) &&
  matchesMileageRange(car, filters.mileage) &&
  matchesPriceRange(car, filters.priceMin, filters.priceMax) &&
  matchesAdvancedFilters(car, filters);

const heroApiParams = (parsed) => {
  const params = new URLSearchParams();
  if (parsed.powertrain) params.set("type", parsed.powertrain);
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

function HeroSearch({ value, onChange, filtersOpen = false, onToggleFilters = null }) {
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
        {/* Одно «гнездо» на двоих: пока строка пустая — кнопка фильтров, появился
            текст — на её месте крестик очистки. Геометрия общая, меняются только
            иконка и цвет, поэтому строка не дёргается. */}
        {value ? (
          <button type="button" className="hero-search-clear" aria-label="Очистить поиск" onClick={() => onChange("")}>
            <X size={18} weight="bold" />
          </button>
        ) : Boolean(onToggleFilters) && (
          <button type="button" className="hero-search-filters" aria-label={filtersOpen ? "Скрыть фильтры" : "Показать фильтры"} aria-expanded={filtersOpen} onClick={onToggleFilters}>
            <SlidersHorizontal size={21} weight="bold" />
          </button>
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

function HoverImagePreview({ car, className, mobileStrip = false, onMobileOpen, badge = null }) {
  const images = (car.images?.length ? car.images : [car.image]).slice(0, 5);
  const narrow = useNarrowViewport();
  // Ширина кадра зависит от экрана: на телефоне карточка вдвое меньше, чем на
  // компьютере, и просить для неё широкий снимок значит платить весом впустую.
  const frameWidth = narrow ? IMAGE_WIDTH_CARD : IMAGE_WIDTH_CARD_WIDE;
  const [active, setActive] = useState(0);
  const preloadStarted = useRef(false);
  const frameRef = useRef(null);
  const mobileStripRef = useRef(null);
  const mobileStripStart = useRef(0);
  const mobileStripMoved = useRef(false);

  const preload = () => {
    if (preloadStarted.current || images.length < 2) return;
    preloadStarted.current = true;
    images.slice(1).forEach((src) => {
      const image = new Image();
      image.src = imageSource(src, frameWidth);
    });
  };
  // Карточку целиком перекрывает ссылка-подложка, поэтому до самого превью события
  // мыши не доходят: слушаем их на карточке, а кадр считаем по границам картинки.
  useEffect(() => {
    const frame = frameRef.current;
    const card = frame?.closest("[data-car-id]") || frame;
    if (!card || images.length < 2) return undefined;
    const selectByCursor = (event) => {
      const bounds = frame.getBoundingClientRect();
      const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      if (!inside) return setActive(0);
      preload();
      const progress = Math.min(0.9999, Math.max(0, (event.clientX - bounds.left) / bounds.width));
      setActive(Math.floor(progress * images.length));
    };
    const reset = () => setActive(0);
    card.addEventListener("mousemove", selectByCursor);
    card.addEventListener("mouseleave", reset);
    return () => {
      card.removeEventListener("mousemove", selectByCursor);
      card.removeEventListener("mouseleave", reset);
    };
  }, [car.id, images.length]);

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
              <img
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
          {images.map((image, index) => (
            <i key={`${image}-${index}`} className={index === active ? "active" : ""} />
          ))}
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

function FeaturedCard({ car, onClick, favorite, toggleFavorite, anchorKey }) {
  const currency = useCurrency();
  const price = estimateLandedCost(car);
  const listingAge = formatListingAge(getSourceListedAt(car));
  // Карточка целиком нажимается мышью, но кнопкой не притворяется: роль кнопки на блоке
  // со ссылками и своими кнопками внутри сбивает чтение с экрана, а её имя («Открыть …»)
  // не совпадало с написанным на карточке. С клавиатуры машину открывает ссылка-заголовок.
  return (
    <article className="featured-card" data-car-id={car.id} data-feed-key={anchorKey} onClick={onClick}>
      <CardLinkOverlay car={car} open={onClick} />
      <HoverImagePreview car={car} className="featured-image" badge={<NewListingBadge car={car} />} />
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
        {listingAge && (
          <div className="featured-listing-age">
            <Clock size={15} />
            {listingAge}
          </div>
        )}
        <div className="featured-price">
          <TotalPrice car={car} price={price} currency={currency} />
        </div>
      </div>
    </article>
  );
}

// Five rows of the four-column grid, matching the home page feed.
const SIMILAR_CARS_BATCH = 20;

// Другие машины той же модели. Раньше эти ссылки жили только в невидимой версии
// страницы для поисковика («Другие BMW 5 Series в наличии») — единственный путь
// робота из карточки в карточку. Теперь карточку собирает сервер из разметки самого
// приложения, и блок стал видимым: посетителю выбор из той же модели полезен не
// меньше, чем роботу. Данные кладёт сервер (соседи по модели, по цене), а после
// загрузки каталога блок живёт из общего списка машин.
function SameModelCars({ car, cars, onOpenCar }) {
  const sameModelPricingOn = useQuotaPricing()?.on;
  const sameModel = useMemo(
    () =>
      cars
        .filter((candidate) => !sameListing(candidate.id, car.id) && String(candidate.brand) === String(car.brand) && String(candidate.model) === String(car.model))
        .sort((left, right) => (Number(estimateLandedCost(left).totalUsd) || 0) - (Number(estimateLandedCost(right).totalUsd) || 0) || String(left.id).localeCompare(String(right.id)))
        .slice(0, 8),
    [car, cars, sameModelPricingOn],
  );
  if (!sameModel.length) return null;
  return (
    <section className="similar-cars" aria-labelledby="same-model-title">
      <div className="similar-cars-heading">
        <h2 id="same-model-title">Другие {carTitle(car.brand, car.model)} в наличии</h2>
      </div>
      <div className="featured-grid">
        {sameModel.map((candidate) => (
          <FeaturedCard key={candidate.id} car={candidate} onClick={() => onOpenCar(candidate)} />
        ))}
      </div>
    </section>
  );
}

function SimilarCars({ car, cars, onOpenCar }) {
  const similarPricingOn = useQuotaPricing()?.on;
  const similarCars = useMemo(() => selectSimilarCars(car, cars), [car, cars, similarPricingOn]);
  const [visibleCount, setVisibleCount] = useState(SIMILAR_CARS_BATCH);

  useEffect(() => setVisibleCount(SIMILAR_CARS_BATCH), [car.id]);

  if (!similarCars.length) return null;

  return (
    <section className="similar-cars" aria-labelledby="similar-cars-title">
      <div className="similar-cars-heading">
        <h2 id="similar-cars-title">Похожие автомобили</h2>
      </div>
      <div className="featured-grid">
        {similarCars.slice(0, visibleCount).map((candidate) => (
          <FeaturedCard key={candidate.id} car={candidate} onClick={() => onOpenCar(candidate)} />
        ))}
      </div>
      {visibleCount < similarCars.length && (
        <button
          type="button"
          className="load-more featured-load-more"
          onClick={() => setVisibleCount((current) => current + SIMILAR_CARS_BATCH)}
        >
          Подгрузить ещё
        </button>
      )}
    </section>
  );
}

// Страница модели: текст о машине плюс живой срез каталога по этой модели. Машины
// страница запрашивает сама, как каталог: при прямом заходе boot-запрос нужных
// карточек не несёт.
// Восемь машин — два ряда по четыре карточки. Пять рядов отодвигали сам обзор далеко
// вниз: срез каталога здесь не список, а показ «что есть и почём», а весь список
// открывается кнопкой под ним.
const MODEL_PAGE_CARS_LIMIT = 8;

function useModelPageCars(modelPage, { sort, priceMax, mileage }) {
  const [cars, setCars] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setCars([]);
    setTotal(null);
    setLoading(true);
    setFailed(false);
    // Сортировка и два фильтра над сеткой уходят в тот же запрос, что и в каталоге,
    // поэтому число рядом с «Каталогом» всегда считает выбранный отбор.
    const carsQuery = new URLSearchParams({ brand: modelPage.brand, model: modelPage.model, sort, limit: String(MODEL_PAGE_CARS_LIMIT), offset: "0" });
    appendPriceRange(carsQuery, ANY_PRICE_MIN, priceMax);
    appendMileageRange(carsQuery, mileage);
    fetch(`/api/cars?${carsQuery}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("model page catalog unavailable"))))
      .then((catalog) => {
        setCars(catalog.items.map(normalizeImportedCar));
        setTotal(catalog.total);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [modelPage, sort, priceMax, mileage]);
  return { cars, total, loading, failed };
}

// Переход в каталог с той же моделью и тем же отбором, что выбран над сеткой:
// в каталоге он открывается уже применённым, вместе со всеми остальными фильтрами.
const modelPageCatalogHref = (modelPage, filters = {}) => {
  const params = new URLSearchParams({ brand: modelPage.brand, model: modelPage.model });
  if (filters.mileage && filters.mileage !== ANY_MILEAGE) params.set("mileage", filters.mileage);
  if (priceBound(filters.priceMax, ANY_PRICE_MAX) !== null) params.set("priceTo", String(filters.priceMax));
  if (filters.sort && filters.sort !== "default") params.set("sort", filters.sort);
  return `/catalog?${params}`;
};

// Частые вопросы по модели: те же плашки, что на главной, плюс разметка для
// поисковика — по ней вопросы и ответы попадают прямо в выдачу.
// Частые вопросы в конце статьи — и в обзорах моделей, и на страницах расчётов.
// Кроме самого блока отдаём разметку FAQPage: по ней вопросы попадают в выдачу
// раскрывающимся списком.
function ArticleFaq({ faq, title }) {
  if (!faq?.length) return null;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <section className="model-page-faq page-width" aria-labelledby="model-page-faq-title">
      <h2 id="model-page-faq-title">{title}</h2>
      <div className="model-page-faq-list">
        {faq.map((item, index) => (
          <HomeFaqItem key={item.q} item={{ question: item.q, answer: item.a }} initiallyOpen={index === 0} />
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </section>
  );
}

// Срез каталога сеткой сразу под заголовком страницы — с переходом ко всем машинам
// модели. Люди приходят из поиска, чтобы посмотреть, что есть и почём, поэтому машины
// стоят выше статьи; своего крупного заголовка у блока нет — его роль играет
// заголовок страницы прямо над ним.
function ModelPageCatalog({ modelPage, carsState, filters, navigate, favorites, toggleFavorite, onOpenCar }) {
  const { cars, loading, failed } = carsState;
  const currency = useCurrency();
  // Сколько машин этой модели подходит под выбранный отбор — числом рядом
  // с «Каталогом»: раньше общее число стояло в кнопке над сеткой, а её убрали.
  const selectedSort = HERO_SORT_OPTIONS.find((option) => option.value === filters.sort) || HERO_SORT_OPTIONS[0];
  const narrowed = filters.priceMax !== ANY_PRICE_MAX || filters.mileage !== ANY_MILEAGE;
  const nothingFound = !failed && !loading && !cars.length;
  // Вид выдачи общий со всем сайтом: выбрали список в каталоге — обзор откроется
  // списком, и наоборот. Своей памяти у страницы модели нет намеренно, разница только
  // в том, что показать, пока выбора не было (см. readModelPageView).
  const [view, setView] = useState(readModelPageView);
  const updateView = (value) => {
    setView(value);
    window.localStorage.setItem(catalogViewKey, value);
  };
  const catalogTarget = modelPageCatalogHref(modelPage, filters);
  // Когда под выбранный отбор ничего не нашлось, жёлтая кнопка ведёт в каталог без
  // него: с ним посетитель попал бы на такую же пустую страницу.
  const allCarsTarget = nothingFound ? modelPageCatalogHref(modelPage, { sort: filters.sort }) : catalogTarget;
  return (
    <section className="model-page-catalog page-width" aria-labelledby="model-page-catalog-title">
      {/* Строка над сеткой: слева «Каталог» с числом машин, справа сортировка,
          два самых частых фильтра и переход ко всем фильтрам каталога. Остальной
          отбор живёт в каталоге — здесь только то, с чего выбор обычно начинают. */}
      {/* Ряд собран как заголовок каталога, а не как заголовок подборки на главной:
          в подборке все вложенные надписи набраны красными прописными, и списки
          отбора наследовали это оформление. */}
      <div className="catalog-heading">
        <h2 id="model-page-catalog-title">Каталог{carsState.total ? ` · ${number(carsState.total)}` : ""}</h2>
        <div className="result-controls model-page-catalog-controls">
          <SelectField
            className="sort-custom-select"
            label="Сортировка"
            value={selectedSort.label}
            options={HERO_SORT_OPTIONS.map((option) => option.label)}
            onChange={(label) => filters.onSort(HERO_SORT_OPTIONS.find((option) => option.label === label)?.value || "price_asc")}
          />
          <SelectField
            className="sort-custom-select"
            label="Цена до"
            value={filters.priceMax}
            options={priceMaxOptions}
            onChange={filters.onPriceMax}
            formatOption={(item) => (item === ANY_PRICE_MAX ? "Цена до" : `до ${money(Number(item), currency)}`)}
          />
          <SelectField
            className="sort-custom-select"
            label="Пробег до"
            value={filters.mileage}
            options={mileageOptions}
            onChange={filters.onMileage}
            formatOption={(item) => (item === ANY_MILEAGE ? "Пробег до" : item)}
          />
          <ViewToggle value={view} onChange={updateView} />
          {/* На телефоне от кнопки остаётся один значок: три списка отбора рядом
              с заголовком там не помещались, а надпись рядом со значком отнимала
              место у переключателя вида. Название остаётся для чтения вслух. */}
          <AppLink className="invert-button model-page-catalog-filters" href={catalogTarget} navigate={navigate} aria-label="Все фильтры">
            <SlidersHorizontal size={17} weight="bold" />
            <span>Все фильтры</span>
          </AppLink>
        </div>
      </div>
      {failed ? (
        <p className="catalog-message">
          Не получилось загрузить список. Обновите страницу или откройте <AppLink href={catalogTarget} navigate={navigate}>каталог</AppLink>.
        </p>
      ) : nothingFound ? (
        /* Пустая сетка выглядела поломкой: вместо неё — заглушка, которая объясняет,
           почему машин нет, и даёт вернуться к полному списку модели. */
        <div className="model-page-catalog-empty">
          <CarProfile size={26} />
          <h3>{narrowed ? "По этим параметрам ничего не найдено" : `${modelPage.name} сейчас нет в наличии`}</h3>
          <p>
            {narrowed
              ? "Попробуйте поднять цену или пробег — или сбросьте отбор и посмотрите все машины модели."
              : "Каталог пополняется каждую ночь: загляните позже или посмотрите похожие машины в каталоге."}
          </p>
          {narrowed && (
            <button type="button" onClick={filters.onReset}>
              Сбросить
            </button>
          )}
        </div>
      ) : view === "list" ? (
        <div className="car-list model-page-car-list">
          {(loading ? Array.from({ length: MODEL_PAGE_CARS_LIMIT }) : cars).map((car, index) =>
            car ? (
              <CarRow key={car.id} car={car} navigate={navigate} favorite={favorites?.has(car.id)} toggleFavorite={toggleFavorite} onOpen={onOpenCar} />
            ) : (
              <CardSkeleton key={index} row />
            ),
          )}
        </div>
      ) : (
        <div className="featured-grid mobile-cards-grid">
          {(loading ? Array.from({ length: MODEL_PAGE_CARS_LIMIT }) : cars).map((car, index) =>
            car ? (
              <FeaturedCard key={car.id} car={car} onClick={() => onOpenCar(car)} favorite={favorites?.has(car.id)} toggleFavorite={toggleFavorite} />
            ) : (
              <CardSkeleton key={index} />
            ),
          )}
        </div>
      )}
      {/* Под сеткой — переход в каталог этой модели: догружать машины прямо здесь
          незачем, дальше идёт обзор, а весь список удобнее смотреть с фильтрами. */}
      {!failed && !loading && (
        <AppLink className="primary model-page-catalog-all" href={allCarsTarget} navigate={navigate}>
          Смотреть все {modelPage.name} <ArrowRight size={18} />
        </AppLink>
      )}
    </section>
  );
}

// Раздел статьи: абзацы плюс необязательные блоки — список с выделенным началом
// строки, две карточки сравнения и врезка с заметкой. Они разбивают текст и
// вытаскивают из абзацев главное.
function ModelPageSection({ section, navigate }) {
  return (
    <section>
      <h2>{section.title}</h2>
      {section.paragraphs.map((text) => (
        <p key={text}>{renderInlineText(text, navigate)}</p>
      ))}
      {/* Подразделы: маленький заголовок и пара абзацев. Не блок с подложкой, а просто
          разбивка длинного раздела — пять абзацев подряд читать тяжело, а плашки
          и карточки внутри статьи мешают ещё больше. */}
      {section.parts?.map((part) => (
        <Fragment key={part.title}>
          <h3>{part.title}</h3>
          {part.paragraphs.map((text) => (
            <p key={text}>{renderInlineText(text, navigate)}</p>
          ))}
        </Fragment>
      ))}
      {section.list && (
        <dl className="model-page-points">
          {section.list.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {section.compare && (
        <div className="model-page-compare">
          {section.compare.map((option) => (
            <div key={option.name}>
              <strong>{option.name}</strong>
              <p>{option.text}</p>
            </div>
          ))}
        </div>
      )}
      {section.callout && (
        <aside className="model-page-callout">
          <Info size={20} weight="duotone" />
          <div>
            <strong>{section.callout.title}</strong>
            <p>{section.callout.text}</p>
          </div>
        </aside>
      )}
    </section>
  );
}

// Рекламный блок в разрыве текста: ведёт на страницу «О сервисе», иллюстрацию берём
// оттуда же.
function ModelPagePromo({ navigate }) {
  return (
    <aside className="model-page-promo page-width">
      <div className="model-page-promo-visual">
        <Illustration src="/illustrations/how-it-works-hero.png" alt="" />
      </div>
      <div className="model-page-promo-copy">
        <strong>Как заказать авто из Китая</strong>
        <p>Сначала проверка автомобиля и понятная смета, только потом решение, договор и оплата. Дальше — выкуп, доставка и выдача в Минске.</p>
        <AppLink className="primary" href="/how-it-works" navigate={navigate}>
          О сервисе <ArrowRight size={18} />
        </AppLink>
      </div>
    </aside>
  );
}

// Фото и цифры для списка обзоров каталог отдаёт одним ответом на все модели сразу:
// фото — с самой доступной машины модели, рядом число машин в наличии, крайние цены до
// Минска, лучший разгон и наибольший запас хода. По ним же работают сортировки списка,
// поэтому переключение сортировки больше ничего не догружает.
//
// Раньше страница спрашивала каталог по одной модели за раз — сто тридцать запросов
// партиями по шесть, и фотографии проявлялись сверху вниз десятки секунд. Без API
// (статическая сборка) ответа нет: список остаётся в исходном порядке и без фото.
function useModelsIndexFacts() {
  const [facts, setFacts] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/model-facts", { signal:controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("model facts unavailable"))))
      .then((data) => {
        // Ключ — марка и модель вместе: у разных марок бывают одноимённые модели.
        const byModel = new Map((data.models || []).map((row) => [`${row.brand}\u0000${row.model}`, row]));
        const next = {};
        for (const modelPage of MODEL_PAGES) {
          const row = byModel.get(`${modelPage.brand}\u0000${modelPage.model}`);
          if (!row) continue;
          next[modelPage.slug] = {
            image:imageSource(row.image || null, IMAGE_WIDTH_TILE) || null,
            // Исходный адрес держим рядом: на него подменяем кадр, если хранилище не
            // отдало уменьшенный.
            imageFull:row.image || null,
            count:Number(row.count) || 0,
            priceMin:Number(row.priceMin) || null,
            priceMax:Number(row.priceMax) || null,
            accel:Number(row.accel) || null,
            range:Number(row.range) || null,
            // Типы двигателя машин этой модели в наличии — сама модель может
            // продаваться и электромобилем, и гибридом (BYD Han и другие).
            types:new Set(row.powertrains || []),
          };
        }
        setFacts(next);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return facts;
}

// Марки для фильтра — только те, у которых есть обзор; порядок алфавитный.
const MODELS_INDEX_ALL_BRANDS = "Все марки";
const MODELS_INDEX_BRANDS = [MODELS_INDEX_ALL_BRANDS, ...Array.from(new Set(MODEL_PAGES.map((modelPage) => modelPage.brand))).sort((a, b) => a.localeCompare(b, "ru"))];

// Тип двигателя: те же варианты, что в каталоге. Модель считается электромобилем,
// гибридом или бензиновой по машинам этой модели в наличии — некоторые модели
// продаются и так, и так (BYD Han, Li Auto L7 и другие), тогда они попадают в оба
// раздела фильтра.
const MODELS_INDEX_ALL_TYPE = "Все типы";
const MODELS_INDEX_TYPES = [MODELS_INDEX_ALL_TYPE, ...POWERTRAIN_TABS.slice(1)];

// Сколько обзоров показывать сразу и на сколько увеличивать список по кнопке
// «Подгрузить ещё» — список приходит на клиент целиком, догружать с сервера нечего.
const MODELS_INDEX_BATCH = 24;

// Сортировки списка обзоров. Цена, разгон и запас хода — по самой подходящей машине
// модели в каталоге: дешёвые считаем по самой доступной, дорогие — по самой дорогой,
// разгон и запас хода — по лучшей версии в наличии. Название берём из конфига.
const MODELS_INDEX_SORTS = [
  { value: "default", label: "По умолчанию" },
  { value: "cars_desc", label: "Больше в наличии", field: "count", direction: "desc" },
  { value: "price_asc", label: "Сначала дешёвые", field: "priceMin", direction: "asc" },
  { value: "price_desc", label: "Сначала дорогие", field: "priceMax", direction: "desc" },
  { value: "accel_asc", label: "С самым быстрым разгоном", field: "accel", direction: "asc" },
  { value: "range_desc", label: "С наибольшим запасом хода", field: "range", direction: "desc" },
  { value: "name_asc", label: "По названию" },
];

// Общая страница «О моделях авто»: вступление, поиск и список обзоров. Вёрстка та же,
// что у самих обзоров, — блоки с текстом и рекламный блок сервиса между ними.
function ModelsIndexPage({ navigate }) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState(MODELS_INDEX_ALL_BRANDS);
  const [type, setType] = useState(MODELS_INDEX_ALL_TYPE);
  const [sort, setSort] = useState("default");
  const [visibleCount, setVisibleCount] = useState(MODELS_INDEX_BATCH);
  const facts = useModelsIndexFacts();
  // Ищем так же, как в списках марок: понимаем часть слова, кириллицу («ауди»)
  // и набранное не в той раскладке.
  const searchVariants = listSearchVariants(query);
  const selectedSort = MODELS_INDEX_SORTS.find((option) => option.value === sort) || MODELS_INDEX_SORTS[0];
  // Сколько обзоров у каждой марки — числом рядом с маркой в списке выбора.
  const brandCounts = useMemo(() => {
    const counts = new Map([[MODELS_INDEX_ALL_BRANDS, MODEL_PAGES.length]]);
    for (const modelPage of MODEL_PAGES) counts.set(modelPage.brand, (counts.get(modelPage.brand) || 0) + 1);
    return counts;
  }, []);
  const found = useMemo(() => {
    const wantedType = type === MODELS_INDEX_ALL_TYPE ? null : typeValue(type);
    const matches = MODEL_PAGES.filter(
      (modelPage) =>
        (brand === MODELS_INDEX_ALL_BRANDS || modelPage.brand === brand) &&
        // Модель без машин в наличии не знает своего типа — под конкретный фильтр
        // (не «Все типы») она не попадает.
        (!wantedType || facts[modelPage.slug]?.types?.has(wantedType)) &&
        (!searchVariants.length || (() => {
          const haystack = searchNormalize(`${modelPage.name} ${modelPage.brand} ${modelPage.tagline} ${modelPage.teaser}`);
          return searchVariants.some((variant) => haystack.includes(variant));
        })()),
    );
    if (sort === "default") return matches;
    if (sort === "name_asc") return [...matches].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const option = MODELS_INDEX_SORTS.find((item) => item.value === sort);
    if (!option?.field) return matches;
    // Модели, по которым каталог ещё не ответил, уходят в конец: иначе они
    // вставали бы в начало как «ноль машин» и «нулевая цена».
    const rank = (modelPage) => Number(facts[modelPage.slug]?.[option.field]) || null;
    return [...matches].sort((a, b) => {
      const left = rank(a);
      const right = rank(b);
      if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
      return option.direction === "asc" ? left - right : right - left;
    });
  }, [brand, type, searchVariants.join("|"), sort, facts]);
  // Список короче фильтра — а не наоборот — не остаётся с кнопкой «подгрузить»
  // в никуда: любая смена фильтра или поиска возвращает список к первой порции.
  useEffect(() => setVisibleCount(MODELS_INDEX_BATCH), [brand, type, searchVariants.join("|"), sort]);
  const visible = found.slice(0, visibleCount);
  return (
    <main className="model-page">
      <div className="model-page-reading">
      <div className="model-page-body page-width">
        <section className="model-page-hero">
          <div className="model-page-hero-copy">
            <h1>{MODELS_INDEX.h1}</h1>
            <p>{MODELS_INDEX.lead}</p>
          </div>
        </section>
      </div>
      <div className="model-page-body page-width">
        <article className="model-page-article">
          <section>
            <h2>{MODELS_INDEX.listTitle}</h2>
            <div className="select-search models-index-search">
              <MagnifyingGlass size={20} />
              <input
                type="search"
                value={query}
                placeholder="Поиск по моделям: Tesla, кроссовер, бензин…"
                aria-label="Поиск по обзорам моделей"
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button type="button" className="select-search-clear" aria-label="Очистить поиск" onClick={() => setQuery("")}>
                  <X size={14} weight="bold" />
                </button>
              )}
            </div>
            {/* Под поиском: тип двигателя, затем марка, справа сортировка. */}
            <div className="models-index-controls">
              <SelectField className="models-index-select" label="Тип" value={type} options={MODELS_INDEX_TYPES} onChange={setType} />
              <SelectField className="models-index-select" label="Марка" value={brand} options={MODELS_INDEX_BRANDS} onChange={setBrand} optionCounts={brandCounts} searchable />
              <SelectField
                className="models-index-select models-index-select-sort"
                label="Сортировка"
                value={selectedSort.label}
                options={MODELS_INDEX_SORTS.map((option) => option.label)}
                onChange={(label) => setSort(MODELS_INDEX_SORTS.find((option) => option.label === label)?.value || "default")}
              />
            </div>
            {found.length ? (
              <>
                <div className="models-index-list">
                  {visible.map((modelPage) => (
                    <AppLink key={modelPage.slug} href={modelPage.path} navigate={navigate}>
                      <div className="models-index-photo">
                        {facts[modelPage.slug]?.image && <img src={facts[modelPage.slug].image} alt="" loading="lazy" onError={(event) => retryWithFullImage(event, facts[modelPage.slug].imageFull)} />}
                      </div>
                      <div className="models-index-copy">
                        <strong>{modelPage.name}</strong>
                        <p>{modelPage.teaser}</p>
                      </div>
                    </AppLink>
                  ))}
                </div>
                {visibleCount < found.length && (
                  <button type="button" className="load-more featured-load-more" onClick={() => setVisibleCount((current) => current + MODELS_INDEX_BATCH)}>
                    Показать ещё
                  </button>
                )}
              </>
            ) : (
              <p className="catalog-message">Ничего не нашлось. Попробуйте другую марку, тип кузова или «бензин».</p>
            )}
          </section>
        </article>
      </div>
      {/* Общий текст о китайском рынке стоит после списка обзоров: сначала человек
          видит, что вообще есть, и только потом читает объяснения. */}
      <div className="model-page-body page-width">
        <article className="model-page-article">
          {MODELS_INDEX.sections.map((section) => (
            <ModelPageSection key={section.title} section={section} navigate={navigate} />
          ))}
        </article>
      </div>
      </div>
      <ModelPagePromo navigate={navigate} />
    </main>
  );
}

// Текст обзора лежит отдельным файлом и грузится, когда страницу открыли. По прямой
// ссылке он уже загружен (main.jsx ждёт его до запуска приложения), а при переходе
// внутри сайта появляется через мгновение — заголовок, фотографии и машины в наличии
// показываются сразу и не ждут текста.
function useModelText(slug) {
  const [text, setText] = useState(() => loadedModelText(slug));
  useEffect(() => {
    const ready = loadedModelText(slug);
    setText(ready);
    if (ready) return undefined;
    let alive = true;
    loadModelText(slug).then((loaded) => {
      if (alive) setText(loaded);
    });
    return () => {
      alive = false;
    };
  }, [slug]);
  return text;
}

function ModelPage({ modelPage, navigate, favorites, toggleFavorite }) {
  // Отбор над сеткой машин: сортировка и два самых частых фильтра. По умолчанию
  // сначала самые доступные — так страница и открывалась раньше.
  const [sort, setSort] = useState("price_asc");
  const [priceMax, setPriceMax] = useState(ANY_PRICE_MAX);
  const [mileage, setMileage] = useState(ANY_MILEAGE);
  const resetFilters = () => {
    setPriceMax(ANY_PRICE_MAX);
    setMileage(ANY_MILEAGE);
  };
  const filters = { sort, priceMax, mileage, onSort: setSort, onPriceMax: setPriceMax, onMileage: setMileage, onReset: resetFilters };
  const carsState = useModelPageCars(modelPage, { sort, priceMax, mileage });
  const text = useModelText(modelPage.slug);
  // Текст разрываем примерно посередине: между половинами встаёт рекламный блок.
  const sections = text?.sections || [];
  const splitAt = Math.ceil(sections.length / 2);
  const firstSections = sections.slice(0, splitAt);
  const restSections = sections.slice(splitAt);
  // Клик по машине раскрывает быстрый просмотр — как в каталоге и на главной. Если
  // он выключен или экран узкий, открывается полная страница автомобиля.
  const { openQuickView, quickViewModal } = useVehicleQuickView({ apiMode: true, favorites, toggleFavorite, navigate });
  const openCar = (car) => {
    if (openQuickView(car)) return;
    navigate(carHref(car));
  };
  return (
    <main className="model-page">
      {/* Обычные хлебные крошки вместо кружка «назад»: путь наверх виден словами и
          совпадает с тем, что мы отдаём поисковику разметкой. */}
      <div className="breadcrumbs model-page-crumbs page-width">
        <button onClick={() => goBackTo(navigate, "/")}>Главная</button>
        <CaretRight size={13} />
        <button onClick={() => goBackTo(navigate, MODELS_INDEX.path)}>О моделях авто</button>
        <CaretRight size={13} />
        {modelPage.name}
      </div>
      {/* Заголовок страницы без подложки и по левому краю: он относится и к сетке
          машин под ним, и ко всей странице, поэтому стоит на одной линии с ней.
          Аннотации под ним нет — сразу за заголовком идут машины. */}
      <section className="model-page-hero model-page-head page-width">
        <div className="model-page-hero-copy">
          <h1>{modelPage.h1}</h1>
        </div>
      </section>
      {/* Сетка машин сразу под заголовком: из поиска сюда приходят прежде всего
          посмотреть, что есть в наличии и почём. Обзор начинается ниже. */}
      <ModelPageCatalog modelPage={modelPage} carsState={carsState} filters={filters} navigate={navigate} favorites={favorites} toggleFavorite={toggleFavorite} onOpenCar={openCar} />
      {/* Сам обзор — ниже машин, одной колонкой. */}
      <div className="model-page-reading">
      <div className="model-page-body page-width">
        <article className="model-page-article">
          <div className="model-page-intro">
            <h2>Обзор {modelPage.name}</h2>
            {text?.intro.map((paragraph) => (
              <p key={paragraph}>{renderInlineText(paragraph, navigate)}</p>
            ))}
          </div>
          {/* Полоса главных цифр разбивает текст сразу после вступления: то, за чем
              обычно и приходят, видно не вчитываясь. */}
          {text?.stats && (
            <div className="model-page-numbers">
              {text.stats.map((stat) => (
                <div key={stat.label}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
      <div className="model-page-body page-width">
        <article className="model-page-article">
          {firstSections.map((section) => (
            <ModelPageSection key={section.title} section={section} navigate={navigate} />
          ))}
        </article>
      </div>
      {/* Реклама сервиса в разрыве текста: человек уже читает про модель, самое
          время показать, как её вообще заказывают. */}
      <ModelPagePromo navigate={navigate} />
      <div className="model-page-body page-width">
        <article className="model-page-article">
          {restSections.map((section) => (
            <ModelPageSection key={section.title} section={section} navigate={navigate} />
          ))}
          {text?.versions && (
            <section className="model-page-versions">
              <h2>{text.versions.title}</h2>
              {/* Вместо таблицы — карточки: первая ячейка строки становится
                  заголовком, остальные читаются как «свойство — значение». Цены в
                  юанях дополняем примерным пересчётом в доллары. */}
              <div className="model-page-versions-cards">
                {text.versions.rows.map((row) => (
                  <div key={row.join("-")}>
                    <strong>{row[0]}</strong>
                    <dl>
                      {text.versions.columns.slice(1).map((column, index) => {
                        const value = row[index + 1];
                        // Цену показываем только в долларах: юани для покупателя
                        // из Минска ничего не значат.
                        return (
                          <div key={column}>
                            <dt>{column}</dt>
                            <dd>{yuanToUsdAbout(value) || value}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                ))}
              </div>
              <p className="model-page-versions-note">{text.versions.note}</p>
            </section>
          )}
        </article>
      </div>
      <ArticleFaq faq={text?.faq} title={`Частые вопросы про ${modelPage.name}`} />
      </div>
      <ModelPageWays modelPage={modelPage} cars={carsState.cars} navigate={navigate} />
      <p className="model-page-disclaimer page-width">{text?.disclaimer}</p>
      {quickViewModal}
    </main>
  );
}

/* Куда идти со страницы обзора: разделы каталога, в которые попадает эта модель, и
   другие обзоры той же марки. Раньше обзор был почти тупиком — из него вела одна
   ссылка в каталог, — а это самые содержательные страницы сайта.

   Кузов и тип двигателя берём у первой загруженной машины модели: держать их руками
   в конфиге не нужно, а у модели они одни и те же. Пока список машин не пришёл,
   разделы не показываем — угадывать нечего. */
function ModelPageWays({ modelPage, cars, navigate }) {
  const car = (cars || [])[0] || null;
  const sections = car ? landingsForCar({ brand: modelPage.brand, type: car.type, bodyType: car.bodyType }).slice(0, 6) : [];
  const siblings = MODEL_PAGES.filter((item) => item.brand === modelPage.brand && item.path !== modelPage.path).slice(0, 12);
  // Материалы журнала про эту модель — сравнения с соседями. Тот, кто дочитал обзор,
  // как раз выбирает между двумя машинами, а из обзора об этом узнать было неоткуда.
  const journal = BLOG_ENABLED ? blogPostsForModel(modelPage.path) : [];
  if (!sections.length && !siblings.length && !journal.length) return null;
  return (
    <section className="model-page-ways page-width" aria-labelledby="model-page-ways-title">
      <h2 id="model-page-ways-title">Где смотреть {modelPage.name} и похожие машины</h2>
      {sections.length > 0 && (
        <div className="catalog-landing-links">
          <b>Разделы каталога</b>
          <div>
            {sections.map((landing) => (
              <AppLink key={landing.path} href={landing.path} navigate={navigate}>{landing.name}</AppLink>
            ))}
          </div>
        </div>
      )}
      {journal.length > 0 && (
        <div className="catalog-landing-links">
          <b>В журнале</b>
          <div>
            {journal.map((post) => (
              <AppLink key={post.path} href={post.path} navigate={navigate}>{post.name}</AppLink>
            ))}
          </div>
        </div>
      )}
      {siblings.length > 0 && (
        <div className="catalog-landing-links">
          <b>Другие модели {modelPage.brand}</b>
          <div>
            {siblings.map((page) => (
              <AppLink key={page.path} href={page.path} navigate={navigate}>{page.name}</AppLink>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// Блок в карточке машины: слева фото этой же машины, справа короткое превью модели
// и переход на её страницу. Превью (`teaser`) есть у каждого обзора — сам текст обзора
// сюда не тянем, иначе карточка машины грузила бы его целиком. Фото берём из
// объявления — то же, что открывает галерею выше.
function ModelIntroCard({ modelPage, car, navigate }) {
  const preview = imageSource(car.image || car.images?.[0] || null, IMAGE_WIDTH_TILE);
  // Блок ведёт на страницу модели. Если посетитель как раз оттуда и пришёл — или
  // читает карточку в быстром просмотре, не уходя со страницы модели, — предлагать
  // ему вернуться туда же незачем: блок просто не показываем.
  if (window.history.state?.fromPath === modelPage.path || currentAppPath() === modelPage.path) return null;
  return (
    <section className={`model-intro${preview ? " has-photo" : ""}`} aria-labelledby="model-intro-title">
      {preview && (
        <div className="model-intro-photo">
          <img src={preview} alt="" loading="lazy" onError={(event) => retryWithFullImage(event, car.image || car.images?.[0])} />
        </div>
      )}
      <div className="model-intro-body">
        <div className="model-intro-heading">
          <span className="info-eyebrow">О модели</span>
          <h2 id="model-intro-title">{modelPage.name}</h2>
        </div>
        <div className="model-intro-text">
          <p>{modelPage.teaser}</p>
        </div>
        <AppLink className="primary model-intro-more" href={modelPage.path} navigate={navigate} aria-label={`Подробнее о модели ${modelPage.name}`}>
          Подробнее
        </AppLink>
      </div>
    </section>
  );
}

const brandLogos = {
  BYD: "byd.svg",
  Zeekr: "zeekr.svg",
  "Li Auto": "li-auto.svg",
  Voyah: "voyah.svg",
  Deepal: "deepal.svg",
  "Geely Galaxy": "geely-galaxy.svg",
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
  "Land Rover": "land-rover.svg",
  Porsche: "porsche.svg",
  Buick: "buick.svg",
  Ford: "ford.svg",
  Geely: "geely.svg",
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
};

// Brands the importer keeps supplying, but the home page showcase leaves out.
// A showcase decision only: the import policy still allows them and their cards
// stay in the catalog, the brand filter, and search.
const showcaseHiddenBrands = new Set(["AION", "Denza", "Dongfeng", "Hongqi", "ORA"]);

// Марки, которых нет в свёрнутом блоке, но которые открываются кнопкой «Показать
// все марки». Машин у них много, и по одной популярности они занимали половину
// витрины: посетитель видел обычный автосайт с немцами и корейцами вместо
// каталога китайских машин, за которым пришёл.
const showcaseDemotedBrands = new Set(["Buick", "Changan", "Chery", "Ford", "Hyundai", "Land Rover", "Nissan"]);

// Марки, которые в свёрнутом блоке стоят всегда, сколько бы машин у них ни было:
// это лицо каталога, и терять их из-за того, что у Volkswagen объявлений втрое
// больше, нельзя. Марку без машин правило всё равно не покажет — она отсеивается
// раньше, вместе с остальными пустыми.
const showcasePinnedBrands = new Set(["Avatr", "Deepal", "Voyah", "Xiaomi", "Zeekr"]);

// Marks whose own colours are part of the brand. The dark theme inverts logos so
// black artwork stays readable on a dark surface; applying that to these fixed-
// colour marks would repaint the brand, so they opt out.
const coloredBrandLogos = new Set([
  "BMW", "BYD", "Changan", "Chevrolet", "Denza", "Dongfeng", "Ford", "Geely Galaxy",
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

// Главная показывает шесть строк марок, остальное открывает кнопка. Строк всегда
// шесть, а колонок на узких экранах меньше, поэтому и марок туда влезает меньше:
// иначе те же шесть строк на телефоне превращаются в двенадцать.
const BRAND_SHOWCASE_ROWS = 6;
// На кнопке «Все» блок называет себя целиком, поэтому подпись у неё длиннее.
const brandSwitchLabel = (item) => (item === "Все" ? "Все марки авто" : item);
const BRAND_SWITCH_OPTIONS = POWERTRAIN_TABS.map(brandSwitchLabel);
const brandSwitchType = (label) => POWERTRAIN_TABS.find((item) => brandSwitchLabel(item) === label) || "Все";
const brandShowcaseColumns = () => (window.innerWidth <= 700 ? 2 : window.innerWidth <= 980 ? 3 : 4);
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
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
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

function PopularBrands({ navigate, cars, apiMode }) {
  // Сервер отдаёт разметку в четыре колонки, поэтому и здесь начинаем с четырёх:
  // мерить ширину окна можно только после того, как страница появилась в браузере.
  const [columns, setColumns] = useState(4);
  const [type, setType] = useState("Все");
  const [expanded, setExpanded] = useState(false);
  // Начинаем без счётчиков даже когда мета уже пришла: серверная разметка главной
  // собрана без них, и первый браузерный кадр обязан совпасть с ней. Настоящие
  // значения ставит слой ниже — до первого кадра, посетитель пустых плиток не видит.
  const [remoteBrands, setRemoteBrands] = useState({});
  useLayoutEffect(() => {
    setRemoteBrands((current) => (Object.keys(current).length ? current : initialBrandCounts()));
  }, []);
  const selectedType = typeValue(type);

  const switchRef = useRef(null);
  // Белая плашка выбранного типа — отдельный слой: она переезжает к нажатой кнопке,
  // а не появляется на ней заново. Размер и место берём с самой кнопки, поэтому
  // подписи можно менять свободно.
  const [pill, setPill] = useState(null);

  // useLayoutEffect, а не useEffect: замер до первой отрисовки, иначе на телефоне
  // сначала мелькает список на четыре колонки и только потом сжимается до двух.
  useLayoutEffect(() => {
    const measure = () => {
      setColumns(brandShowcaseColumns());
      const active = switchRef.current?.querySelector("button.active");
      if (!active) return;
      // Плашку переставляем, только если она действительно съехала. Иначе каждое
      // изменение размера окна пересобирало весь блок марок заново, а при зуме на
      // трекпаде такие изменения идут подряд десятками — браузер не успевал
      // дорисовать страницу между ними.
      const next = { left: active.offsetLeft, width: active.offsetWidth };
      setPill((current) => (current && current.left === next.left && current.width === next.width ? current : next));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [type]);

  const localBrands = useMemo(() => {
    const counts = new Map();
    cars.forEach((car) => {
      if (selectedType !== "Все" && car.type !== selectedType) return;
      counts.set(car.brand, (counts.get(car.brand) || 0) + 1);
    });
    return [...counts].map(([brand, count]) => ({ brand, count }));
  }, [cars, selectedType]);

  // Раньше марки под новый тип двигателя запрашивались только по нажатию на вкладку,
  // и первое переключение в сессии ждало ответ сервера — вкладка на вид зависала.
  // Теперь, как только известно, что каталог отвечает, одним заходом спрашиваем марки
  // сразу под все четыре вкладки (справочник помнит такой же запрос, ушедший из
  // index.html, и не дублирует его). К моменту, когда посетитель нажмёт на вкладку,
  // ответ обычно уже лежит наготове, и список меняется сразу.
  const brandsPrefetched = useRef(false);
  useEffect(() => {
    if (apiMode === false) {
      setRemoteBrands({});
      return undefined;
    }
    if (apiMode !== true || brandsPrefetched.current) return undefined;
    brandsPrefetched.current = true;
    let cancelled = false;
    POWERTRAIN_TABS.forEach((item) => {
      const value = typeValue(item);
      const query = value === "Все" ? "" : new URLSearchParams({ type: value }).toString();
      requestCatalogMeta(query)
        .then((payload) => {
          if (cancelled) return;
          const brands = payload.brands || [];
          setRemoteBrands((known) => ({ ...known, [value]: brands }));
          storeBrandCounts(value, brands);
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [apiMode]);

  // Ответ по новому типу приходит не мгновенно, а стартовая выборка знает лишь горстку
  // марок: если показать её, список на миг сжимается и мигает. Поэтому до ответа
  // оставляем на экране прежний набор — он сменится один раз, уже на верный.
  const remoteForType = apiMode === false ? localBrands : remoteBrands[selectedType];
  const lastAnswer = useRef(null);
  useEffect(() => { if (remoteForType) lastAnswer.current = remoteForType; }, [remoteForType]);
  // Пока каталог не ответил, числа по стартовой выборке не показываем: в ней шестьдесят
  // карточек на весь каталог, и марка выглядела бы как «одна машина в наличии». Лучше
  // назвать марки без чисел, чем назвать неверные.
  const availableBrands = remoteForType || lastAnswer.current || (apiMode === false ? localBrands : []);
  const brandCounts = new Map(availableBrands.map((item) => [item.brand, Number(item.count) || 0]));
  // Before the catalog answers there are no counts at all, and rendering every brand as "0"
  // reads as an empty catalog rather than a pending one.
  const countsKnown = brandCounts.size > 0;
  // Every brand the catalog can show, plus the configured marks that currently
  // have no listings, so the block is the full inventory rather than a preview.
  // Под выбранный тип двигателя пустые марки убираем: раздела «электрический
  // Bentley» не существует, и вести по такой ссылке некуда.
  const brands = [...new Set([...Object.keys(brandLogos), ...availableBrands.map((item) => item.brand)])]
    .filter((brand) => !showcaseHiddenBrands.has(brand))
    .map((brand) => ({ brand, count: brandCounts.get(brand) || 0 }))
    .filter((item) => selectedType === "Все" || item.count > 0)
    .sort((a, b) => a.brand.localeCompare(b.brand, "en", { sensitivity: "base" }));
  const limit = columns * BRAND_SHOWCASE_ROWS;
  // В сокращённом виде оставляем самые многочисленные марки, но показываем их всё равно
  // по алфавиту: список ищут глазами по имени, а не читают как рейтинг. Марки без машин
  // сюда не попадают даже когда свободные строки есть: «Acura 0» в популярных — это
  // тупик, а не предложение. В полном списке они остаются.
  const ranked = countsKnown ? brands.filter((item) => item.count > 0) : brands;
  const byName = (a, b) => a.brand.localeCompare(b.brand, "en", { sensitivity: "base" });
  const byCount = (a, b) => b.count - a.count || byName(a, b);
  // Закреплённые марки занимают свои места первыми, дальше идут остальные по числу
  // машин, а отставленные не участвуют вовсе. Ряды в блоке всегда полные: если
  // отставленных и закреплённых не хватило, недостающие места добираются из тех же
  // отставленных — пустых клеток в сетке быть не должно.
  const pickShowcase = () => {
    const pinned = ranked.filter((item) => showcasePinnedBrands.has(item.brand)).sort(byCount);
    const usual = ranked.filter((item) => !showcasePinnedBrands.has(item.brand) && !showcaseDemotedBrands.has(item.brand)).sort(byCount);
    const demoted = ranked.filter((item) => showcaseDemotedBrands.has(item.brand)).sort(byCount);
    return [...pinned, ...usual, ...demoted].slice(0, limit);
  };
  const shown = expanded || brands.length <= limit ? brands : pickShowcase().sort(byName);
  const typeQuery = selectedType === "Все" ? "" : `type=${encodeURIComponent(type)}`;

  return (
    <section className="popular-brands page-width" aria-labelledby="popular-brands-title">
      <div className="popular-brands-heading">
        {/* Заголовок остаётся в разметке для поисковика и для чтения с экрана: на экране
            блок называет себя первой кнопкой переключателя. */}
        <h2 className="visually-hidden" id="popular-brands-title">Популярные марки</h2>
        {/* На телефоне четыре кнопки в строку не встают — там тот же выбор сделан
            обычным списком, как в фильтрах. Что показать, решает ширина экрана. */}
        <div className={`brand-type-switch${pill ? " brand-type-switch--measured" : ""}`} role="group" aria-label="Тип двигателя" ref={switchRef}>
          {pill && <span className="brand-type-switch-pill" aria-hidden="true" style={{ transform: `translateX(${pill.left}px)`, width: `${pill.width}px` }} />}
          {POWERTRAIN_TABS.map((item) => (
            <button type="button" key={item} className={type === item ? "active" : ""} aria-pressed={type === item} onClick={() => setType(item)}>
              {brandSwitchLabel(item)}
            </button>
          ))}
        </div>
        <SelectField className="brand-type-select" label="Тип двигателя" value={brandSwitchLabel(type)} options={BRAND_SWITCH_OPTIONS} onChange={(label) => setType(brandSwitchType(label))} />
        <AppLink className="popular-brands-all" href={selectedType === "Все" ? "/catalog" : powertrainLandingPath(type)} navigate={navigate}>
          Все предложения <CaretRight size={20} weight="bold" />
        </AppLink>
      </div>
      <div className="popular-brands-grid">
        {shown.map(({ brand, count }) => {
          // Ссылка ведёт на страницу марки, если она у нас есть: адрес с параметром
          // (`/catalog?brand=BYD`) для поисковика указывает на общий каталог, то есть
          // отдельной страницы под марку по такой ссылке не существует. Выбранный тип
          // двигателя добавляем параметром — он сужает и саму страницу марки.
          const landing = brandLandingPath(brand);
          const href = landing
            ? `${landing}${typeQuery ? `?${typeQuery}` : ""}`
            : `/catalog?brand=${encodeURIComponent(brand)}${typeQuery ? `&${typeQuery}` : ""}`;
          // Подпись обязана начинаться с того, что написано на плитке: голосовое
          // управление ищет ссылку по видимому тексту («нажать Audi»), а проверка
          // доступности требует, чтобы видимый текст входил в подпись с начала.
          // Прежнее «Перейти к предложениям: Audi 8 525» это правило нарушало.
          return (
            <AppLink className="brand-link" key={brand} href={href} navigate={navigate} aria-label={countsKnown ? `${brand} ${number(count)} объявлений` : brand}>
              <BrandMark brand={brand} />
              <span className="brand-name" title={brand}>{brand}</span>
              <span className="brand-count" aria-hidden="true">{countsKnown ? number(count) : ""}</span>
            </AppLink>
          );
        })}
      </div>
      {/* У типа двигателя, до которого импорт ещё не дошёл, марок нет вовсе — пустая
          сетка выглядела бы поломкой. */}
      {!shown.length && <p className="popular-brands-empty">Машин с таким двигателем в каталоге пока нет.</p>}
      {brands.length > limit && (
        <div className="popular-brands-more">
          <button type="button" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded}>
            {expanded ? "Свернуть список" : "Показать все марки"}
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

function HomeConversionSections({ navigate }) {
  const stepIcons = [MagnifyingGlass, ShieldCheck, ClipboardText, CarProfile];

  return (
    <div className="home-conversion page-width">
      <section className="home-order" aria-labelledby="home-order-title">
        <div className="home-order-intro">
          <h2 id="home-order-title">Понятный путь к автомобилю из Китая</h2>
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
          <h2 id="home-faq-title">Что важно знать до заказа авто из Китая</h2>
          <p>Подбор и доставка автомобиля из Китая проходят в несколько этапов. Заранее объясняем цену, проверку, сроки и ответственность.</p>
          <button type="button" className="primary home-faq-link" onClick={() => navigate("/faq")}>Все вопросы и ответы <ArrowRight size={18} weight="bold" /></button>
        </div>
        <div className="home-faq-list">
          {HOME_FAQ.map((item, index) => (
            <HomeFaqItem key={item.question} item={item} initiallyOpen={index === 0} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Home({ navigate, cars, apiMode, catalogTotal, catalogUpdatedAt, favorites, toggleFavorite, loading }) {
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
  const takeRandomBatch = (precedingCars = [], count = batchSize) => {
    const batch = [];
    if (!cars.length) return batch;
    const candidates = [];
    const refill = () => {
      while (candidates.length < FEED_CANDIDATE_WINDOW) {
        if (!randomPool.current.length) randomPool.current = shuffleCars(cars);
        candidates.push(randomPool.current.pop());
      }
    };
    while (batch.length < count) {
      refill();
      // Compare against the three cards before this slot, including the tail of
      // the previous batch so "Подгрузить ещё" does not seam two similar cards.
      const recent = [...precedingCars, ...batch.map((item) => item.car)].slice(-3);
      let bestIndex = 0;
      let bestScore = -Infinity;
      candidates.forEach((car, index) => {
        const score = varietyScore(car, recent);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });
      const [car] = candidates.splice(bestIndex, 1);
      batch.push({ car, key: `${car.id}-${nextItemKey.current}` });
      nextItemKey.current += 1;
    }
    // Candidates that lost stay available for later batches.
    randomPool.current.push(...candidates);
    return batch;
  };
  // Лента набирается случайно при каждом визите, но возврат назад — это не новый
  // визит: без восстановления выбранная карточка оказывается в другом месте
  // списка или вообще исчезает из ленты.
  const restoreFeed = (stored) => {
    if (!stored?.length || !cars.length) return null;
    const byId = new Map(cars.map((car) => [car.id, car]));
    const restored = stored.filter((item) => byId.has(item.id)).map((item) => ({ car:byId.get(item.id), key:item.key }));
    if (!restored.length) return null;
    nextItemKey.current = restored.reduce((max, item) => Math.max(max, Number(String(item.key).split("-").pop()) || 0), 0) + 1;
    return restored;
  };
  // После перезагрузки на другой странице от сохранённой ленты обычно выживают
  // только просмотренные машины: остальных нет в свежезагруженном списке. Пара
  // «знакомых» карточек вместо витрины выглядит как поломка, поэтому уцелевшие
  // оставляем сверху (к ним ведёт возврат прокрутки), а ленту добираем свежими.
  const buildFeed = () => {
    const restored = restoreFeed(window.history.state?.feed);
    if (!restored) return takeRandomBatch();
    if (restored.length >= batchSize) return restored;
    const seen = new Set(restored.map((item) => item.car.id));
    randomPool.current = shuffleCars(cars.filter((car) => !seen.has(car.id)));
    return [...restored, ...takeRandomBatch(restored.map((item) => item.car), batchSize - restored.length)];
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
    nextItemKey.current = 0;
    setFeedCars(buildFeed());
  }, [cars]);

  const loadMore = () => setFeedCars((current) => [...current, ...takeRandomBatch(current.slice(-3).map((item) => item.car))]);
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
  const [quickFiltersOpen, setQuickFiltersOpen] = useState(false);
  const [heroSort, setHeroSort] = useState(restoredHero?.sort || "default");
  // «По умолчанию» в выдаче поиска — тот же замес, что и в каталоге: сервер
  // раскладывает строки по зерну, а клиент разносит похожие карточки. Без этого
  // «зикр» открывался десятком одинаковых дорогих машин подряд.
  const [heroShuffleSeed] = useState(() => restoredHero?.shuffleSeed || randomShuffleSeed());
  // Вид выдачи общий с каталогом: переключили здесь — каталог откроется так же.
  const [heroView, setHeroView] = useState(readCatalogView);
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
          const matches = cars.filter(
            (car) =>
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
          <div className="hero-updated">Каталог авто обновлён {catalogUpdatedDate(catalogUpdatedAt)}</div>
        ) : (
          <div className="hero-updated boot-invisible">&nbsp;</div>
        )}
        {/* Неразрывные пробелы стоят прямо в тексте, а не появляются типографикой
            после оживления: заголовок — главный элемент страницы для PageSpeed, и
            любая замена его текста после первого кадра считается новой отрисовкой
            и сдвигом строк — метрика готовности уезжала с 0,2 с обратно на 3+ с. */}
        <h1>Доставим б/у авто из Китая в Беларусь</h1>
        <ul className="hero-benefits" aria-label="Преимущества заказа">
          <li><CheckCircle size={21} weight="fill" />Без скрытых платежей</li>
          <li><CheckCircle size={21} weight="fill" />Прозрачные договора</li>
          <li><CheckCircle size={21} weight="fill" />Полное сопровождение</li>
        </ul>
        <HeroSearch value={heroQuery} onChange={setHeroQuery} filtersOpen={quickFiltersOpen} onToggleFilters={() => setQuickFiltersOpen((open) => !open)} />
        {!searching && (
          <div className={quickFiltersOpen ? "hero-quick-search open" : "hero-quick-search"}>
            <QuickSearch navigate={navigate} cars={cars} apiMode={apiMode} totalCount={catalogTotal} />
          </div>
        )}
      </section>
      {!searching && <PopularBrands navigate={navigate} cars={cars} apiMode={apiMode} />}
      {!searching && (
      <section className="trust-strip page-width">
        <div>
          <span>
            <CarProfile size={22} weight="duotone" />
          </span>
          <p>
            <b>Сопровождаем до выдачи</b>
            <small>От подбора до получения в Минске</small>
          </p>
        </div>
        <div>
          <span>
            <ShieldCheck size={22} weight="duotone" />
          </span>
          <p>
            <b>Проверяем до оплаты</b>
            <small>История, батарея и документы</small>
          </p>
        </div>
        <div>
          <span>
            <CurrencyCny size={22} weight="duotone" />
          </span>
          <p>
            <b>Показываем обе цены</b>
            <small>В Китае и ориентир до Минска</small>
          </p>
        </div>
      </section>
      )}
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
        {/* На широком экране подборка всегда плиткой. На телефоне (и в выдаче
            поиска на любом экране) вид выбирает посетитель: списочные карточки
            каталога или плитка — на телефоне по две карточки в ряд. */}
        {searchEmpty ? (
          <div className="empty-state search-empty">
            <MagnifyingGlass size={26} />
            <h3>Ничего не найдено</h3>
            <p>Попробуйте изменить запрос: марка, модель, год, цена («до 40 тыс»), пробег («до 50 тыс км»), запас хода («от 500 км»), разгон («до 5 сек»), батарея («от 70») или номер объявления. Лишнее убирает слово «кроме»: «зикр кроме 001».</p>
          </div>
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
                  <FeaturedCard key={key} anchorKey={key} car={car} favorite={favorites.has(car.id)} toggleFavorite={toggleFavorite} onClick={() => openFeedCar({ car, key })} />
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
          !showSkeletons && (
            <button type="button" className="load-more featured-load-more" onClick={loadMore}>
              Подгрузить ещё
            </button>
          )
        )}
      </section>
      <HomeConversionSections navigate={navigate} />
      {/* Журнал: четыре свежих материала. Пока раздел не готов, выключатель
          BLOG_ENABLED убирает блок целиком — на его месте ничего не остаётся. */}
      <HomeCollections navigate={navigate} />
      <ScrollToTopButton />
      {quickViewModal}
    </main>
  );
}

// Выбрано ли в фильтрах хоть что-то и «чистый» набор фильтров. Ими пользуются и сама
// панель, и строка «Сохранить поиск / Сбросить» над ней в каталоге.
const catalogFiltersActive = (filters) => filters.type !== "Все" || filters.brand !== "Все марки" || multiValues(filters.model, ANY_MODEL).length > 0 || multiValues(filters.bodyType, ANY_BODY_TYPE).length > 0 || multiValues(filters.color, ANY_COLOR).length > 0 || hasYearRange(filters.yearMin, filters.yearMax) || filters.mileage !== ANY_MILEAGE || hasPriceRange(filters.priceMin, filters.priceMax) || filters.drive !== ANY_DRIVE || filters.owners !== ANY_OWNERS || filters.battery !== ANY_BATTERY || filters.condition !== ANY_CONDITION || filters.accel !== ANY_ACCEL || filters.tire !== ANY_TIRE || (filters.range || ANY_RANGE) !== ANY_RANGE || (filters.engine || ANY_ENGINE) !== ANY_ENGINE || (filters.power || ANY_POWER) !== ANY_POWER || (filters.gearbox || ANY_GEARBOX) !== ANY_GEARBOX || (filters.fuel || ANY_FUEL) !== ANY_FUEL || hasExclusions(filters);
const emptyCatalogFilters = () => ({
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
});

function FilterPanel({ filters, setFilters, resultCount, brands, models, bodyTypes, drives, optionCounts, availability, onSaveSearch, searchSaved, searchUpdate, expanded = false, onExpandedChange = null }) {
  const update = (key) => (value) => setFilters((old) => ({ ...old, [key]: value }));
  // Модель не сбрасываем: её выбирал посетитель, см. такой же changeType выше.
  const changeType = (value) => setFilters((old) => ({ ...old, type: value, ...POWERTRAIN_FILTER_RESET }));
  const changeBrand = (value) => setFilters((old) => ({ ...old, brand: value, model: [] }));
  const selectedType = typeLabel(filters.type);
  const selectType = (value) => changeType(typeValue(value));
  const hasActiveFilters = catalogFiltersActive(filters);
  const resetFilters = () => setFilters(() => ({ ...emptyCatalogFilters() }));
  return (
    <VehicleSearch
      selectedType={selectedType}
      onTypeChange={selectType}
      values={filters}
      actions={{
        brand: changeBrand,
        model: update("model"),
        yearMin: (value) => setFilters((old) => ({ ...old, yearMin: value, yearMax: clampYearMax(value, old.yearMax) })),
        yearMax: update("yearMax"),
        priceMin: (value) => setFilters((old) => ({ ...old, priceMin: value, priceMax: clampPriceMax(value, old.priceMax) })),
        priceMax: update("priceMax"),
        mileage: update("mileage"),
        bodyType: update("bodyType"),
        color: update("color"),
        drive: update("drive"),
        owners: update("owners"),
        battery: update("battery"),
        condition: update("condition"),
        accel: update("accel"),
        tire: update("tire"),
        range: update("range"),
        engine: update("engine"),
        power: update("power"),
        gearbox: update("gearbox"),
        fuel: update("fuel"),
        removeExclusion: (key, value) => setFilters((old) => ({ ...old, [key]: exclusionValues(old, key).filter((item) => item !== value) })),
      }}
      options={{ brands: ["Все марки", ...brands], models, bodyTypes, drives }}
      optionCounts={optionCounts}
      availability={availability}
      resultCount={resultCount}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      onSaveSearch={onSaveSearch}
      searchSaved={searchSaved}
      searchUpdate={searchUpdate}
      onExpandedChange={onExpandedChange}
      initiallyExpanded={expanded || filters.type !== "Все" || filters.mileage !== ANY_MILEAGE || multiValues(filters.bodyType, ANY_BODY_TYPE).length > 0 || multiValues(filters.color, ANY_COLOR).length > 0 || filters.drive !== ANY_DRIVE || filters.owners !== ANY_OWNERS || filters.battery !== ANY_BATTERY || filters.condition !== ANY_CONDITION || filters.accel !== ANY_ACCEL || filters.tire !== ANY_TIRE || (filters.range || ANY_RANGE) !== ANY_RANGE || (filters.engine || ANY_ENGINE) !== ANY_ENGINE || (filters.power || ANY_POWER) !== ANY_POWER || (filters.gearbox || ANY_GEARBOX) !== ANY_GEARBOX || (filters.fuel || ANY_FUEL) !== ANY_FUEL}
    />
  );
}

function CarRow({ car, navigate, favorite, toggleFavorite, onOpen, anchorKey }) {
  const currency = useCurrency();
  const open = () => (onOpen ? onOpen(car) : navigate(carHref(car)));
  const price = estimateLandedCost(car);
  const listingAge = formatListingAge(getSourceListedAt(car));
  // Роли кнопки у строки каталога нет по той же причине, что и у карточки витрины:
  // внутри свои ссылки и кнопки, а с клавиатуры открывает ссылка-заголовок.
  return (
    <article className="car-row" data-car-id={car.id} data-feed-key={anchorKey} onClick={open}>
      <CardLinkOverlay car={car} open={open} />
      <div className="car-row-mobile-header">
        <div>
          <h2><AppLink href={carHref(car)} navigate={open} onClick={(event) => event.stopPropagation()}>{car.title}</AppLink></h2>
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
            <h2><AppLink href={carHref(car)} navigate={open} onClick={(event) => event.stopPropagation()}>{car.title}</AppLink></h2>
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
        <div className="mini-specs">
          {car.battery && (
            <span>
              <BatteryHigh size={17} />
              {car.battery} кВт·ч
            </span>
          )}
          {/* Машине с двигателем плашки батареи не достаются, и строка оставалась
              пустой: у бензиновой и дизельной там объём и наддув. Гибриду с бензиновым
              мотором они тоже пишутся — рядом с батареей и запасом хода. */}
          {engineVolumeBadge(car) && (
            <span>
              <Engine size={17} />
              Объём {engineVolumeBadge(car)}
            </span>
          )}
          {engineAspiration(car) && (
            <span>
              <Timer size={17} />
              {engineAspiration(car)}
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
          {listingAge && (
            <>
              <span>•</span>
              <Clock size={15} />
              {listingAge}
            </>
          )}
        </div>
      </div>
      <div className="car-row-price">
        <TotalPrice car={car} price={price} currency={currency} />
        <span>Под ключ</span>
        <b>{number(car.chinaPrice)} ¥</b>
        <small>цена в Китае</small>
      </div>
    </article>
  );
}

// Карточки, догруженные для избранного, живут до перезагрузки страницы: страница
// «Избранное» размонтируется при каждом уходе, и без этой памяти каждый заход
// заново качал бы те же машины, мигая загрузчиком вместо готового списка.
const favoriteCarCache = new Map();
function useFavoriteCars(cars, favorites, apiMode, onUnavailable) {
  const [loadedCars, setLoadedCars] = useState(() => [...favoriteCarCache.values()]);
  const favoriteKey = [...favorites].sort().join("|");
  const allCars = useMemo(() => {
    const values = new Map(cars.map((car) => [car.id,car]));
    loadedCars.forEach((car) => values.set(car.id,car));
    return [...values.values()];
  }, [cars,loadedCars]);
  // Порядок берём из набора избранного, а не из каталога: свежая машина сохраняется первой и остаётся наверху.
  const favoriteCars = [...favorites].flatMap((id) => {
    const car = allCars.find((item) => item.id === id);
    return car ? [car] : [];
  });
  const knownIds = new Set(allCars.map((car) => car.id));
  const missingIds = [...favorites].filter((id) => !knownIds.has(id));
  const missingKey = missingIds.sort().join("|");

  useEffect(() => {
    // apiMode ещё не определён (null) — не знаем, куда идти за карточкой; дождёмся
    // ответа загрузки, иначе запрос в чужой слой пометил бы живую машину недоступной.
    if (!missingIds.length || apiMode === null) return undefined;
    const controller = new AbortController();
    Promise.all(missingIds.map(async (id) => {
      try {
        const url = apiMode
          ? `/api/cars/${encodeURIComponent(id)}`
          : `${import.meta.env.BASE_URL}data/cars/${encodeURIComponent(listingNumber(id))}.json`;
        const response = await fetch(url, { cache:"no-store", signal:controller.signal });
        if (response.status === 404) return { id, unavailable:true };
        if (!response.ok) throw new Error("favorite_car_load_failed");
        return { id, car:normalizeImportedCar(await response.json()) };
      } catch (error) {
        if (error?.name === "AbortError") return null;
        return { id, unavailable:false };
      }
    })).then((results) => {
      if (controller.signal.aborted) return;
      const resolved = results.flatMap((result) => result?.car ? [result.car] : []);
      const unavailable = results.flatMap((result) => result?.unavailable ? [result.id] : []);
      if (resolved.length) {
        resolved.forEach((car) => favoriteCarCache.set(car.id, car));
        setLoadedCars((current) => {
          const values = new Map(current.map((car) => [car.id,car]));
          resolved.forEach((car) => values.set(car.id,car));
          return [...values.values()];
        });
      }
      if (unavailable.length) onUnavailable(unavailable);
    });
    return () => controller.abort();
  }, [apiMode,favoriteKey,missingKey,onUnavailable]);

  return { favoriteCars, hasUnresolved:missingIds.length > 0 };
}

function Favorites({ navigate, favorites, toggleFavorite, cars, apiMode, onUnavailableFavorites, saving = false }) {
  const { favoriteCars, hasUnresolved } = useFavoriteCars(cars, favorites, apiMode, onUnavailableFavorites);
  const { openQuickView, quickViewToggle, quickViewModal } = useVehicleQuickView({ apiMode:apiMode !== false, favorites, toggleFavorite, navigate });
  const sortOptions = [
    { value: "default", label: "По добавлению" },
    { value: "price_asc", label: "Дешёвые" },
    { value: "price_desc", label: "Дорогие" },
    { value: "mileage_asc", label: "С наименьшим пробегом" },
    { value: "range_desc", label: "С наибольшим запасом хода" },
    { value: "year_desc", label: "Новые по году" },
    { value: "year_asc", label: "Старые по году" },
  ];
  const [sort, setSort] = useState("default");
  const selectedSort = sortOptions.find((option) => option.value === sort) || sortOptions[0];
  // «По добавлению» — родной порядок избранного: свежесохранённая машина сверху.
  // Карточки из API не несут готовый итог «до Минска» (каталог сортирует по нему
  // на сервере), поэтому для локальной сортировки по цене считаем его здесь.
  const sortableCars = favoriteCars.map((car) => (Number(car.estimatedTotalUsd) ? car : { ...car, estimatedTotalUsd: estimateLandedCost(car).totalUsd }));
  const sortedCars = sort === "default" ? favoriteCars : sortCars(sortableCars, sort);
  // Вид выдачи общий с каталогом: переключили здесь — каталог откроется так же.
  // На телефоне плитка идёт двумя карточками в ряд (см. .mobile-cards-grid).
  const [view, setView] = useState(readCatalogView);
  const updateView = (value) => {
    setView(value);
    window.localStorage.setItem(catalogViewKey, value);
  };
  const openCar = (car) => {
    if (openQuickView(car)) return;
    navigate(carHref(car));
  };
  // The car saved during registration lands here a moment after the page does, so the
  // empty state would be a lie for that moment.
  const awaitingCars = hasUnresolved || saving;
  return (
    <main className="catalog favorites-page page-width">
      <div className="breadcrumbs">
        <button onClick={() => navigate("/")}>Главная</button>
        <span>/</span>
        <span>Избранное</span>
      </div>
      <div className="catalog-heading">
        <div className="section-heading-title">
          <h1>Избранное · {hasUnresolved ? favorites.size : favoriteCars.length}</h1>
          {quickViewToggle}
        </div>
        {favoriteCars.length > 0 && (
          <div className="result-controls">
            <SelectField className="sort-custom-select" label="Сортировка" value={selectedSort.label} options={sortOptions.map((option) => option.label)} onChange={(label) => setSort(sortOptions.find((option) => option.label === label)?.value || "default")} />
            <ViewToggle value={view} onChange={updateView} />
          </div>
        )}
      </div>
      {sortedCars.length ? (
        view === "grid" ? (
          <div className="featured-grid catalog-card-grid mobile-cards-grid">
            {sortedCars.map((car) => (
              <FeaturedCard key={car.id} car={car} favorite toggleFavorite={toggleFavorite} onClick={() => openCar(car)} />
            ))}
          </div>
        ) : (
          <div className="car-list">
            {sortedCars.map((car) => (
              <CarRow key={car.id} car={car} navigate={navigate} favorite toggleFavorite={toggleFavorite} onOpen={openCar} />
            ))}
          </div>
        )
      ) : awaitingCars ? (
        <div className="account-section-loading" aria-live="polite">Загружаем сохранённые автомобили…</div>
      ) : (
        <div className="empty-state favorites-empty">
          <Heart size={34} />
          <h3>В избранном пока ничего нет</h3>
          <p>Нажмите на сердце в карточке автомобиля, чтобы сохранить его здесь.</p>
          <button className="primary" onClick={() => navigate("/catalog")}>Перейти в каталог</button>
        </div>
      )}
      <ScrollToTopButton />
      {quickViewModal}
    </main>
  );
}

// Дата в пилюле над заголовком главной — всегда с годом: «19 августа 2026».
const catalogUpdatedDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day:"numeric", month:"long", year:"numeric" }).format(date).replace(/\s*г\.$/, "");
};

// Дата сохранения поиска — коротко, по-русски: «12 августа» либо с годом, если он не текущий.
const savedSearchDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const options = { day:"numeric", month:"long" };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
  return new Intl.DateTimeFormat("ru-RU", options).format(date);
};

// Шесть машин, седьмая ячейка ряда — блок-стрелка «смотреть все» в каталоге.
const SAVED_SEARCH_PREVIEW_LIMIT = 6;
const savedSearchSkeletons = ["a", "b", "c", "d", "e", "f", "g"];

// Подтверждение перед удалением сохранённого поиска: восстановить его нельзя,
// поэтому случайный клик по «Удалить поиск» не должен стоить набора фильтров.
function SavedSearchRemovalModal({ search, onCancel, onConfirm }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="lead-modal order-removal-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="search-removal-title" aria-describedby="search-removal-description">
        <button className="modal-close" type="button" onClick={onCancel} aria-label="Закрыть"><X size={19} /></button>
        <h2 id="search-removal-title">Удалить поиск?</h2>
        <p id="search-removal-description"><b>{search.title}</b> исчезнет из «Моих поисков». Автомобили останутся в каталоге — удалится только сохранённый набор фильтров.</p>
        <div className="order-removal-actions">
          <button className="secondary" type="button" onClick={onCancel}>Отмена</button>
          <button className="danger-button solid" type="button" onClick={onConfirm}><Trash size={18} /> Удалить поиск</button>
        </div>
      </section>
    </div>
  );
}

function SavedSearchesPage({ navigate, searches, onDelete, saving = false, apiMode, cars, favorites, toggleFavorite }) {
  const currency = useCurrency();
  const [removing, setRemoving] = useState(null);
  const { openQuickView, quickViewToggle, quickViewModal } = useVehicleQuickView({ apiMode:apiMode !== false, favorites, toggleFavorite, navigate });
  // Под каждым поиском — число подходящих машин и до пяти первых карточек-превью:
  // в API-режиме — короткие запросы с limit=5 (сервер их кэширует), в статическом —
  // подбор по загруженному каталогу.
  const useApi = apiMode !== false;
  const [previews, setPreviews] = useState({});
  const searchesFingerprint = searches.map((item) => item.id).join("|");
  useEffect(() => {
    if (!searches.length) return undefined;
    if (!useApi) {
      setPreviews(Object.fromEntries(searches.map((item) => {
        const matching = cars.filter((car) => matchesSavedFilters(car, normalizeSavedFilters(item.filters)));
        return [item.id, { total:matching.length, items:matching.slice(0, SAVED_SEARCH_PREVIEW_LIMIT) }];
      })));
      return undefined;
    }
    const controller = new AbortController();
    Promise.all(
      searches.map(async (item) => {
        try {
          const query = savedSearchApiParams(normalizeSavedFilters(item.filters));
          query.set("limit", String(SAVED_SEARCH_PREVIEW_LIMIT));
          const response = await fetch(`/api/cars?${query}`, { signal:controller.signal });
          if (!response.ok) return null;
          const payload = await response.json();
          return [item.id, { total:Number(payload.total) || 0, items:(payload.items || []).map(normalizeImportedCar) }];
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (!controller.signal.aborted) setPreviews(Object.fromEntries(entries.filter(Boolean)));
    });
    return () => controller.abort();
  }, [useApi, searchesFingerprint]);
  const openSearch = (item) => navigate(savedSearchCatalogHref(normalizeSavedFilters(item.filters)));
  // На десктопе с включённым быстрым просмотром карточка раскрывается модалкой,
  // как в каталоге; иначе — обычный переход на страницу машины.
  const openCar = (car) => {
    if (openQuickView(car)) return;
    navigate(carHref(car));
  };
  return (
    <main className="catalog saved-searches-page page-width">
      <div className="breadcrumbs">
        <button onClick={() => navigate("/")}>Главная</button>
        <span>/</span>
        <span>Мои поиски</span>
      </div>
      <div className="catalog-heading">
        <div className="section-heading-title">
          <h1>Мои поиски · {searches.length}</h1>
          {quickViewToggle}
        </div>
      </div>
      {searches.length ? (
        <div className="saved-search-list">
          {searches.map((item) => {
            const preview = previews[item.id];
            const savedAt = savedSearchDate(item.createdAt);
            return (
              <article key={item.id} className="saved-search-card">
                <div className="saved-search-head">
                  <button type="button" className="saved-search-main" onClick={() => openSearch(item)} aria-label={`Открыть поиск «${item.title}» в каталоге`}>
                    <span className="saved-search-title-line">
                      <strong className="saved-search-title">{item.title}</strong>
                      {preview && (
                        <>
                          <span className="saved-search-dot" aria-hidden="true">·</span>
                          <b className="saved-search-count">{number(preview.total)} авто</b>
                        </>
                      )}
                      {savedAt && (
                        <>
                          <span className="saved-search-dot" aria-hidden="true">·</span>
                          <span className="saved-search-date">Сохранён {savedAt}</span>
                        </>
                      )}
                    </span>
                  </button>
                  {/* На телефоне подпись не помещается рядом с заголовком — остаётся корзинка. */}
                  <button type="button" className="saved-search-delete" onClick={() => setRemoving(item)} aria-label={`Удалить поиск «${item.title}»`} title="Удалить поиск">
                    <Trash size={18} aria-hidden="true" />
                    <span>Удалить поиск</span>
                  </button>
                </div>
                {preview ? (
                  preview.items.length > 0 && (
                    <div className="saved-search-previews">
                      {preview.items.map((car) => (
                        <article
                          key={car.id}
                          className="saved-search-preview"
                          data-car-id={car.id}
                          onClick={() => openCar(car)}
                          onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && openCar(car)}
                          tabIndex="0"
                          role="button"
                          aria-label={`Открыть ${car.title}`}
                        >
                          <HoverImagePreview car={car} className="saved-search-preview-image" />
                          <span className="saved-search-preview-price">≈ {money(estimateLandedCost(car).totalUsd, currency)}</span>
                        </article>
                      ))}
                      <button type="button" className="saved-search-more" onClick={() => openSearch(item)} aria-label={`Показать все ${number(preview.total)} авто по поиску «${item.title}»`}>
                        <span className="saved-search-more-circle" aria-hidden="true">
                          <ArrowRight size={20} weight="bold" />
                        </span>
                        <span>Смотреть все</span>
                      </button>
                    </div>
                  )
                ) : (
                  // Пока превью в пути, их место держат мерцающие заглушки той же
                  // геометрии — карточка не прыгает, когда ответ приходит.
                  <div className="saved-search-previews" aria-hidden="true">
                    {savedSearchSkeletons.map((key) => (
                      <div key={key} className="saved-search-preview skeleton-card">
                        <div className="saved-search-preview-image" />
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : saving ? (
        <div className="account-section-loading" aria-live="polite">Загружаем сохранённые поиски…</div>
      ) : (
        <div className="empty-state saved-searches-empty">
          <BookmarkSimple size={34} />
          <h3>Сохранённых поисков пока нет</h3>
          <p>Настройте фильтры в каталоге и нажмите «Сохранить поиск» — подборка будет ждать вас здесь.</p>
          <button className="primary" onClick={() => navigate("/catalog")}>Перейти в каталог</button>
        </div>
      )}
      <ScrollToTopButton />
      {quickViewModal}
      {removing && (
        <SavedSearchRemovalModal
          search={removing}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            onDelete(removing.id);
            setRemoving(null);
          }}
        />
      )}
    </main>
  );
}

const catalogViewKey = "navostok-catalog-view";
const readCatalogView = () => (window.localStorage.getItem(catalogViewKey) === "grid" ? "grid" : "list");
// На странице обзора машины по умолчанию идут плиткой, а не списком: это витрина
// «что есть и почём» на два ряда, а не выдача каталога. Свой выбор посетителя, если
// он его делал, страница слушается — вид у всего сайта общий.
const readModelPageView = () => (window.localStorage.getItem(catalogViewKey) === "list" ? "list" : "grid");

// Фильтры каталога из параметров адреса. Одним разбором пользуются три входа:
// обычное открытие каталога, ссылки страниц марок и разделов и умный поиск —
// он приводит запрос к такому же набору параметров.
// Раздел, на который увёл выбранный фильтр, — не новая страница: фильтры уже
// выставлены, и пересоздавать каталог незачем. Без этого выдача на секунду
// подменялась заглушками и «мигала». Флаг ставит сам каталог перед таким
// переходом, а гасит его отрисовка, которая этот переход показала.
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
    fuel: FUEL_TYPES.includes(rawFuel) ? rawFuel : ANY_FUEL,
    ...exclusionsFromParams(params),
  };
}

function Catalog({ navigate, favorites, toggleFavorite, cars, apiMode, saveSearch, updateSavedSearch, deleteSavedSearch, savedSearches, landing = null }) {
  // Сотня машин на страницу — то же число, по которому сервер режет список для
  // поисковика. Если развести эти числа, адрес «?page=2» из выдачи покажет человеку
  // не те машины, которые по нему проиндексированы.
  const pageSize = CATALOG_PAGE_SIZE;
  const currency = useCurrency();
  // Pending and api resolve to the same value, so the boot request answering does not
  // retrigger the query this component already issued at mount.
  const useApi = apiMode !== false;
  const sortOptions = [
    { value: "default", label: "По умолчанию" },
    { value: "price_asc", label: "Дешёвые" },
    { value: "price_desc", label: "Дорогие" },
    { value: "newest", label: "Новые объявления" },
    { value: "mileage_asc", label: "С наименьшим пробегом" },
    { value: "range_desc", label: "С наибольшим запасом хода" },
    { value: "year_desc", label: "Новые по году" },
    { value: "year_asc", label: "Старые по году" },
  ];
  // Страница марки или типа задаёт свой фильтр самим адресом. Параметры в адресе имеют
  // приоритет: с них работают ссылки из умного поиска и сохранённые поиски.
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of landingFilterParams(landing)) if (!params.has(key)) params.set(key, value);
  const initialFilters = catalogFiltersFromParams(params);
  // Поисковая строка в адресе: `/catalog?q=byd han до 25000`. Нужна двум вещам —
  // разметке «поиск по сайту», по которой Google показывает строку поиска прямо
  // в выдаче, и внешним ссылкам на готовый поиск. Разбираем ту же строку тем же
  // разбором, что и поиск на главной, и заменяем адрес на обычный набор фильтров:
  // дальше страница ведёт себя как всегда, а `?q=` в истории не остаётся.
  const searchQuery = params.get("q");
  useEffect(() => {
    if (!searchQuery) return;
    let cancelled = false;
    // Заменяем адрес честной перезагрузкой, а не переходом внутри приложения: фильтры
    // каталог читает из адреса один раз, при создании, и от смены только параметров
    // он не пересоздаётся — заголовок и адрес менялись бы, а выдача оставалась общей.
    const go = (href) => { if (!cancelled) window.location.replace(href); };
    parseHeroSearchOnce(searchQuery, { apiMode, cars, currency })
      // Не разобрали — открываем обычный каталог: строка не должна остаться в адресе,
      // иначе она попадёт в сохранённый поиск и в возврат из карточки.
      .then((parsed) => go(parsed?.matched ? heroCatalogHref(parsed) : "/catalog"))
      .catch(() => go("/catalog"));
    return () => { cancelled = true; };
  }, [searchQuery]);

  const restoredCatalog = window.history.state?.catalog || matchingCatalogReturn()?.catalog || null;
  const [filters, setFilters] = useState(() => ({
    ...initialFilters,
    ...(restoredCatalog?.filters || {}),
  }));
  const [remoteCars, setRemoteCars] = useState([]);
  const [remoteTotal, setRemoteTotal] = useState(0);
  // «Есть ли ещё» решает сервер, а не сравнение загруженного с общим числом: у API
  // есть потолок глубины листания, и без его признака бесконечная прокрутка молотила
  // бы пустые страницы и показывала ошибку загрузки на ровном месте.
  const [remoteHasMore, setRemoteHasMore] = useState(false);
  const [remoteMeta, setRemoteMeta] = useState(() => bootCatalogMeta(catalogMetaQuery(filters.type, filters.brand, filters.bodyType)) || EMPTY_CATALOG_META);
  const [remoteLoading, setRemoteLoading] = useState(useApi);
  const [remoteError, setRemoteError] = useState(false);
  const [customSearchOpen, setCustomSearchOpen] = useState(false);
  // Сортировку может нести и ссылка (например, из сохранённого поиска); снимок
  // истории при возврате важнее — он описывает то, что было на экране.
  // Адрес со страницей списка («?page=7») приходит из поисковой выдачи, а сервер режет
  // список по возрастанию цены. Оставить здесь перемешанный порядок по умолчанию значит
  // показать человеку на этой странице совсем не те машины, за которыми он пришёл.
  const urlSort = sortOptions.some((option) => option.value === params.get("sort")) ? params.get("sort") : params.get("page") ? "price_asc" : "default";
  const [sort, setSort] = useState(() => (sortOptions.some((option) => option.value === restoredCatalog?.sort) ? restoredCatalog.sort : urlSort));
  // "По умолчанию" mixes the catalog the way the home feed does. The seed keeps that
  // mix in place while paging and when a visitor comes back from a vehicle page.
  const [shuffleSeed] = useState(() => restoredCatalog?.shuffleSeed || randomShuffleSeed());
  // Первый запрос — всегда одна страница. Больше сотни машин за раз каталог не отдаёт
  // (потолок в `catalogPaging`), поэтому при возврате из карточки с двумя-тремя
  // подгруженными страницами запрос на 300 машин молча превращался в сотню: список
  // схлопывался, а прокрутка возвращалась не к той машине.
  const [loadedLimit, setLoadedLimit] = useState(pageSize);
  // Сколько страниц дозапросить при возврате, чтобы на экране снова оказалось то же,
  // что было. Счётчик убывает при каждой попытке — так дозагрузка не может зациклиться,
  // если каталог перестал отдавать машины.
  const restorePages = useRef(Math.max(0, Math.ceil(((Number(restoredCatalog?.loadedCount) || 0) - pageSize) / pageSize)));
  // Страница списка из адреса. По адресам вида `/catalog/electric?page=7` поисковик
  // обходит каталог вглубь — их отдаёт сервер, — и человек, пришедший по такому адресу
  // из выдачи, должен увидеть те же машины, а не начало каталога. Любая смена фильтров
  // или сортировки сбрасывает отступ: к другой выдаче прежний номер страницы отношения
  // не имеет.
  const [startOffset, setStartOffset] = useState(() => {
    const requested = String(params.get("page") || "");
    if (!/^[1-9]\d{0,4}$/.test(requested)) return 0;
    return Math.min(Number(requested) - 1, CATALOG_MAX_PAGES - 1) * pageSize;
  });
  const restoredOrder = useRef(restoredCatalog?.order || null);
  // Раскрытая строка «Ещё фильтры» переезжает в снимок страницы: смена типа
  // двигателя или кузова уводит на свой раздел, страница собирается заново —
  // и без этого фильтры закрывались прямо во время выбора.
  const [filtersExpanded, setFiltersExpanded] = useState(() => Boolean(restoredCatalog?.filtersExpanded));
  const [view, setView] = useState(readCatalogView);
  // На телефоне плитка идёт двумя карточками в ряд (см. .mobile-cards-grid).
  const { openQuickView, quickViewToggle, quickViewModal } = useVehicleQuickView({ apiMode:useApi, favorites, toggleFavorite, navigate });
  const loadMoreRequest = useRef(null);
  const loadingMore = useRef(false);
  const persistCatalogState = (anchor = {}) => {
    const state = window.history.state || {};
    // Запись истории могла остаться без state — тогда якорь и открытую карточку
    // берём из копии в sessionStorage, иначе первый же persist затрёт их пустыми.
    const stored = state.catalog ? null : matchingCatalogReturn();
    const pick = (key, fallback) => (anchor[key] !== undefined ? anchor[key] : state[key] ?? stored?.[key] ?? fallback);
    const scrollAnchor = pick("scrollAnchor", null);
    const scrollAnchorOffset = Number(pick("scrollAnchorOffset", 0)) || 0;
    const openedCarId = pick("openedCarId", null);
    const catalog = {
      filters,
      sort,
      shuffleSeed,
      filtersExpanded,
      loadedCount: Math.max(loadedLimit, remoteCars.length),
      order: remoteCars.slice(0, 600).map((car) => car.id),
    };
    patchHistoryState({ catalog, scrollAnchor, scrollAnchorOffset, openedCarId });
    saveCatalogReturn({ catalog, scrollAnchor, scrollAnchorOffset, openedCarId, scrollY: window.scrollY, path: currentAppPath(), search: window.location.search });
  };
  // Новая выдача — старый якорь и старый порядок уже ни на что не указывают.
  const dropScrollAnchor = () => {
    restoredOrder.current = null;
    persistCatalogState({ scrollAnchor: null, scrollAnchorOffset: 0, openedCarId: null });
  };
  const openCar = (car) => {
    // Save synchronously before leaving the catalog. The effect below is useful
    // for regular updates, but can otherwise lag behind a quick filter + click.
    // Быстрый просмотр тоже запоминает позицию: из него уходят на полную
    // страницу стрелкой, и «назад» должен вернуть к этой же карточке.
    const scrollAnchor = carAnchorSelector(car.id);
    const node = document.querySelector(scrollAnchor);
    persistCatalogState({ scrollAnchor, scrollAnchorOffset: node ? Math.round(node.getBoundingClientRect().top) : 0, openedCarId: car.id });
    // На десктопе карточка раскрывается быстрым просмотром: выдача, фильтры и
    // позиция прокрутки остаются на месте, уходить со страницы незачем.
    if (openQuickView(car)) return;
    navigate(carHref(car));
  };
  // Адрес, заголовок и текст страницы обязаны совпадать с тем, что показано. Как только
  // фильтр уводит с раздела — переходим на тот раздел, которому фильтры соответствуют,
  // а если такого нет, в общий каталог. Фильтры, сортировка и порядок перемешивания
  // переезжают снимком, поэтому выбранное не теряется.
  const landingPath = landing?.path || "/catalog";
  // Заголовок раздела и обычного каталога режется на крупную часть и мелкую подпись
  // одним правилом (src/catalog-landings.js) — тем же, что и в серверной версии страницы.
  const heading = landingHeading(landing ? landing.h1 : "Все авто с пробегом из Китая");
  useEffect(() => {
    // Раздел, который описывает выбранное точнее всего и при этом остаётся правдой:
    // на странице BYD можно выбрать модель или год, а выбрать к седанам ещё и
    // кроссоверы — уже нет, такую выдачу раздел седанов не описывает.
    const target = landingForFilters(filters, landingPath)?.path || "/catalog";
    if (target === landingPath) return undefined;
    const move = () => {
      catalogFilterMoveTarget = target;
      navigate(target, {
        replace: true,
        preserveScroll: true,
        catalogState: { catalog: { filters, sort, shuffleSeed, filtersExpanded, loadedCount: pageSize, order: [] }, scrollY: window.scrollY },
      });
    };
    // Пока открыт список фильтра или шторка на телефоне, страницу не переключаем:
    // кузова, цвета и модели выбирают галочками по нескольку штук, и переход посреди
    // выбора закрывал бы список после первой же галочки, которая уводит с раздела.
    const listOpen = () => Boolean(document.querySelector(".select-menu.open, .mobile-filter-sheet"));
    if (!listOpen()) {
      move();
      return undefined;
    }
    const waiting = setInterval(() => {
      if (listOpen()) return;
      clearInterval(waiting);
      move();
    }, 250);
    return () => clearInterval(waiting);
  }, [filters]);
  const updateFilters = (updater) => {
    loadMoreRequest.current?.abort();
    loadMoreRequest.current = null;
    loadingMore.current = false;
    setLoadedLimit(pageSize);
    setStartOffset(0);
    restorePages.current = 0;
    dropScrollAnchor();
    setFilters(updater);
  };
  const updateView = (value) => {
    setView(value);
    window.localStorage.setItem(catalogViewKey, value);
  };
  const updateSort = (value) => {
    loadMoreRequest.current?.abort();
    loadMoreRequest.current = null;
    loadingMore.current = false;
    setLoadedLimit(pageSize);
    setStartOffset(0);
    restorePages.current = 0;
    dropScrollAnchor();
    setSort(value);
  };
  const brands = useApi ? remoteMeta.brands.map((item) => item.brand) : uniqueSorted(cars.map((car) => car.brand));
  const typedCars = cars.filter((car) => (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand));
  const brandCars = cars.filter((car) => (filters.type === "Все" || car.type === filters.type) && matchesMulti(car.bodyType, filters.bodyType, ANY_BODY_TYPE));
  const modelCars = cars.filter((car) => (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand) && matchesMulti(car.bodyType, filters.bodyType, ANY_BODY_TYPE));
  const models = ["Все модели", ...(useApi ? remoteMeta.models.map((item) => item.model) : uniqueSorted(modelCars.map((car) => car.model)))];
  const brandEntries = useApi ? remoteMeta.brands : [...brandCars.reduce((counts, car) => counts.set(car.brand, (counts.get(car.brand) || 0) + 1), new Map())].map(([brandName, count]) => ({ brand:brandName, count }));
  const modelEntries = useApi ? remoteMeta.models : [...modelCars.reduce((counts, car) => counts.set(car.model, (counts.get(car.model) || 0) + 1), new Map())].map(([modelName, count]) => ({ model:modelName, count }));
  const brandOptionCounts = new Map(brandEntries.map((item) => [item.brand, Number(item.count) || 0]));
  const modelOptionCounts = new Map(modelEntries.map((item) => [item.model, Number(item.count) || 0]));
  if (brandEntries.length) brandOptionCounts.set("Все марки", brandEntries.reduce((total, item) => total + (Number(item.count) || 0), 0));
  if (modelEntries.length) modelOptionCounts.set("Все модели", modelEntries.reduce((total, item) => total + (Number(item.count) || 0), 0));
  const bodyTypes = ["Все кузова", ...(useApi ? remoteMeta.bodyTypes.map((item) => item.body_type) : BODY_TYPES.filter((item) => cars.some((car) => car.bodyType === item)))];
  const drives = [ANY_DRIVE, ...orderDrives(useApi ? remoteMeta.drives.map((item) => item.drive) : cars.map((car) => car.drive))];
  const availability = useApi ? remoteMeta.availability : localAvailability(typedCars);
  // Цена в статическом режиме считается здесь же, поэтому смена режима цен
  // (переключатель «Цены с квотами») должна пересчитать выдачу.
  const quotaPricingOn = useQuotaPricing()?.on;
  const filtered = useMemo(
    () =>
      sortCars(
        cars
          .filter((car) => (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand) && matchesMulti(car.model, filters.model, ANY_MODEL) && matchesMulti(car.bodyType, filters.bodyType, ANY_BODY_TYPE) && matchesColorLabels(car.bodyColor, multiValues(filters.color, ANY_COLOR)) && matchesYears(car, filters.yearMin, filters.yearMax) && matchesMileageRange(car, filters.mileage) && matchesPriceRange(car, filters.priceMin, filters.priceMax) && matchesAdvancedFilters(car, filters) && matchesExclusions(car, filters))
          .map((car) => ({
            ...car,
            estimatedTotalUsd: estimateLandedCost(car).totalUsd,
          })),
        sort,
        shuffleSeed,
      ),
    [filters, cars, sort, shuffleSeed, quotaPricingOn],
  );
  // The API returns the default order already shuffled, but only the client knows what
  // is on screen, so the variety pass that spaces out similar cards runs on each batch.
  // Порядок должен совпадать при повторном входе на страницу, иначе выбранная
  // карточка уезжает в другое место списка. Раньше здесь был Math.random.
  const orderRemoteBatch = (items, preceding = []) => (sort === "default" ? varietyOrder(items, seededRandom(`${shuffleSeed}:${preceding.length}`), preceding) : items);
  // При возврате порядок берём тот, что был на экране: одна выдача на N карточек
  // не повторяет склейку из нескольких страниц «Подгрузить ещё».
  const restoreRemoteOrder = (items) => {
    const order = restoredOrder.current;
    if (!order?.length) return orderRemoteBatch(items);
    const byId = new Map(items.map((item) => [item.id, item]));
    const known = order.map((id) => byId.get(id)).filter(Boolean);
    if (!known.length) return orderRemoteBatch(items);
    const seen = new Set(order);
    return [...known, ...orderRemoteBatch(items.filter((item) => !seen.has(item.id)), known)];
  };
  const requestParams = () => {
    const query = new URLSearchParams({
      limit: String(loadedLimit),
      offset: String(startOffset),
    });
    query.set("sort", sort);
    if (sort === "default") query.set("seed", shuffleSeed);
    if (filters.type !== "Все") query.set("type", filters.type);
    if (filters.brand !== "Все марки") query.set("brand", filters.brand);
    appendMulti(query, "model", filters.model, ANY_MODEL);
    appendMulti(query, "bodyType", filters.bodyType, ANY_BODY_TYPE);
    colorValuesForLabels(multiValues(filters.color, ANY_COLOR)).forEach((value) => query.append("color", value));
    if (filters.drive !== ANY_DRIVE) query.set("drive", filters.drive);
    if (filters.owners !== ANY_OWNERS) query.set("ownersMax", String(filterNumber(filters.owners)));
    if (filters.battery !== ANY_BATTERY) query.set("batteryMin", String(batteryFloor(filters.battery)));
    if (filters.condition !== ANY_CONDITION) query.set("conditionGrade", conditionGrades[filters.condition]);
    if (filters.accel !== ANY_ACCEL) query.set("accelMax", String(filterNumber(filters.accel)));
    if (filters.tire !== ANY_TIRE) query.set("tireRimMin", String(filterNumber(filters.tire)));
    if ((filters.range || ANY_RANGE) !== ANY_RANGE) query.set("rangeMin", String(filterNumber(filters.range)));
    appendEngineRange(query, filters.engine);
    appendPowerRange(query, filters.power);
    if ((filters.gearbox || ANY_GEARBOX) !== ANY_GEARBOX) query.set("gearbox", filters.gearbox);
    if ((filters.fuel || ANY_FUEL) !== ANY_FUEL) query.set("fuel", filters.fuel);
    appendExclusions(query, filters, { api: true });
    appendYearRange(query, filters.yearMin, filters.yearMax);
    appendMileageRange(query, filters.mileage);
    appendPriceRange(query, filters.priceMin, filters.priceMax);
    return query;
  };
  useEffect(() => {
    if (!useApi) return;
    const controller = new AbortController();
    setRemoteLoading(true);
    setRemoteError(false);
    const query = requestParams();
    // Справочник и список машин идут врозь: какие поля показывать, известно из
    // справочника, а он отвечает быстрее выдачи. Раньше их ждали вместе, и панель
    // фильтров достраивалась только после того, как загрузится каталог.
    requestCatalogMeta(catalogMetaQuery(filters.type, filters.brand, filters.bodyType))
      .then((meta) => {
        if (!controller.signal.aborted) setRemoteMeta(meta);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRemoteError(true);
      });
    fetch(`/api/cars?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("catalog unavailable"))))
      .then((catalog) => {
        setRemoteCars(restoreRemoteOrder(catalog.items.map(normalizeImportedCar)));
        setRemoteTotal(catalog.total);
        setRemoteHasMore(Boolean(catalog.hasMore));
      })
      .catch((error) => {
        if (error.name !== "AbortError") setRemoteError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRemoteLoading(false);
      });
    return () => controller.abort();
  }, [useApi, filters, sort]);
  useEffect(() => {
    persistCatalogState();
  }, [filters, sort, loadedLimit, remoteCars.length, startOffset]);
  useEffect(
    () => () => {
      const controller = loadMoreRequest.current;
      loadMoreRequest.current = null;
      controller?.abort();
    },
    [],
  );
  const loadMore = async () => {
    if (!useApi) {
      setLoadedLimit((current) => Math.min(current + pageSize, filtered.length - startOffset));
      return;
    }
    if (loadingMore.current || remoteLoading || !remoteHasMore) return;
    const controller = new AbortController();
    loadMoreRequest.current = controller;
    loadingMore.current = true;
    const query = requestParams();
    query.set("limit", String(pageSize));
    query.set("offset", String(startOffset + remoteCars.length));
    setRemoteLoading(true);
    setRemoteError(false);
    try {
      const response = await fetch(`/api/cars?${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error("catalog unavailable");
      const catalog = await response.json();
      setRemoteCars((current) => [...current, ...orderRemoteBatch(catalog.items.map(normalizeImportedCar), current)]);
      setLoadedLimit((current) => current + catalog.items.length);
      setRemoteTotal(catalog.total);
      setRemoteHasMore(Boolean(catalog.hasMore));
    } catch (error) {
      if (error.name !== "AbortError") setRemoteError(true);
    } finally {
      if (loadMoreRequest.current === controller) {
        loadMoreRequest.current = null;
        loadingMore.current = false;
        setRemoteLoading(false);
      }
    }
  };
  useEffect(() => {
    if (!useApi || restorePages.current <= 0 || remoteLoading || remoteError || !remoteHasMore) return;
    restorePages.current -= 1;
    loadMore();
  }, [useApi, remoteLoading, remoteError, remoteHasMore, remoteCars.length]);
  const displayed = useApi ? remoteCars : filtered.slice(startOffset, startOffset + loadedLimit);
  const resultCount = useApi ? remoteTotal : filtered.length;
  // Until the first page answers there is no count yet, and "0" reads as an empty result.
  const knownResultCount = remoteLoading && !remoteCars.length ? null : resultCount;
  // Без API считаем от начала списка, а не от показанного: при заходе по адресу со
  // страницей («?page=7») первые шестьсот машин в выдачу не попадают, и сравнение
  // «показано меньше, чем найдено» оставляло бы кнопку висеть на конце списка.
  const hasMore = useApi ? remoteHasMore : startOffset + displayed.length < resultCount;
  const selectedSort = sortOptions.find((option) => option.value === sort) || sortOptions[0];
  const selectedModels = multiValues(filters.model, ANY_MODEL);
  // Чипы моделей работают как мультивыбор без чекбоксов: клик добавляет модель,
  // повторный — убирает, а когда не осталось ни одной, снова активно «Все модели».
  const toggleModelChip = (model) => updateFilters((current) => {
    if (model === ANY_MODEL) return { ...current, model: [] };
    const chosen = multiValues(current.model, ANY_MODEL);
    return { ...current, model: chosen.includes(model) ? chosen.filter((item) => item !== model) : [...chosen, model] };
  });
  // Кнопка «Сохранить поиск» знает, что этот набор уже сохранён, и вместо второй
  // копии ведёт в «Мои поиски». У гостя список пуст, поэтому кнопка всегда активна.
  const currentSearchKey = savedSearchKey({ ...filters, sort });
  const searchSaved = (savedSearches || []).some((item) => savedSearchKey(item.filters) === currentSearchKey);
  // «База» — сохранённый поиск, с которого начался этот экран: либо каталог открыт
  // из «Моих поисков», либо поиск сохранили здесь. Изменённые фильтры тогда не
  // плодят новую запись, а обновляют её кнопкой «Обновить поиск».
  const [baseSearchKey, setBaseSearchKey] = useState(() => currentSearchKey);
  const [toast, setToast] = useState(null);
  const baseSearch = (savedSearches || []).find((item) => savedSearchKey(item.filters) === baseSearchKey) || null;
  const searchUpdate = !searchSaved && Boolean(baseSearch);
  // Нажатие на закладку: не сохранён — сохраняем, уже сохранён — убираем,
  // а если это правка ранее сохранённого поиска — записываем изменения и говорим
  // об этом всплывающей подсказкой (иначе нажатие выглядит как «ничего не было»).
  const submitSearch = () => {
    if (searchSaved) {
      const saved = (savedSearches || []).find((item) => savedSearchKey(item.filters) === currentSearchKey);
      if (saved) deleteSavedSearch?.(saved.id);
      setBaseSearchKey("");
      return;
    }
    if (baseSearch) {
      updateSavedSearch(baseSearch.id, { ...filters, sort });
      setToast("Сохранённый поиск обновлён");
    } else saveSearch({ ...filters, sort });
    setBaseSearchKey(currentSearchKey);
  };
  return (
    <main className="catalog page-width">
      <div className="breadcrumbs">
        <button onClick={() => navigate("/")}>Главная</button>
        <CaretRight size={13} />
        {landing ? (
          <>
            <button onClick={() => navigate("/catalog")}>Автомобили из Китая</button>
            <CaretRight size={13} />
            {landing.name}
          </>
        ) : (
          "Автомобили из Китая"
        )}
      </div>
      <div className="catalog-heading">
        <div>
          {/* Две половины заголовка — отдельными кусками, чтобы на телефоне каждая
              встала своей строкой (правило в стилях), а на компьютере они шли одной
              строкой через пробел. Перенос задан руками: браузер ломал строку в своём
              месте на каждой ширине, и «с пробегом из Китая» скакало от раздела
              к разделу. Для поиска текст один и тот же — слова и пробел на месте. */}
          <h1>{Boolean(heading.tail) ? <><span>{heading.title}</span> <span>{heading.tail}</span></> : heading.title}</h1>
          {Boolean(heading.subtitle) && <p>{heading.subtitle}</p>}
        </div>
      </div>
      <FilterPanel filters={filters} setFilters={updateFilters} resultCount={knownResultCount} brands={brands} models={models} bodyTypes={bodyTypes} drives={drives} optionCounts={{ brands:brandOptionCounts, models:modelOptionCounts }} availability={availability} onSaveSearch={submitSearch} searchSaved={searchSaved} searchUpdate={searchUpdate} expanded={filtersExpanded} onExpandedChange={setFiltersExpanded} />
      {filters.brand !== "Все марки" && models.length > 1 && (
        <div className="model-quick-chips" aria-label={`Быстрый выбор модели ${filters.brand}`}>
          {models.map((model) => {
            const active = model === ANY_MODEL ? !selectedModels.length : selectedModels.includes(model);
            return (
              <button
                type="button"
                key={model}
                className={active ? "active" : ""}
                aria-pressed={active}
                onClick={() => toggleModelChip(model)}
              >
                {model}
              </button>
            );
          })}
        </div>
      )}
      <div className="catalog-layout">
        <section className="results-list" aria-busy={remoteLoading && !displayed.length ? "true" : undefined}>
          <div className="result-tools">
            <div className="result-summary">
              <b>{knownResultCount == null ? "Загружаем" : `${knownResultCount} шт.`}</b>
              {quickViewToggle}
            </div>
            <div className="result-controls">
              <SelectField className="sort-custom-select" label="Сортировка" value={selectedSort.label} options={sortOptions.map((option) => option.label)} onChange={(label) => updateSort(sortOptions.find((option) => option.label === label)?.value || "default")} />
              <ViewToggle value={view} onChange={updateView} />
            </div>
          </div>
          {remoteError && <div className="catalog-message">Не удалось обновить выдачу. Попробуйте ещё раз.</div>}
          {displayed.length ? (
            view === "grid" ? (
              <div className="featured-grid catalog-card-grid mobile-cards-grid">
                {displayed.map((car) => (
                  <FeaturedCard key={car.id} car={car} favorite={favorites.has(car.id)} toggleFavorite={toggleFavorite} onClick={() => openCar(car)} />
                ))}
              </div>
            ) : (
              displayed.map((car) => <CarRow key={car.id} car={car} navigate={navigate} favorite={favorites.has(car.id)} toggleFavorite={toggleFavorite} onOpen={openCar} />)
            )
          ) : remoteLoading ? (
            view === "grid" ? (
              <div className="featured-grid catalog-card-grid mobile-cards-grid">
                {skeletonCards.map((key) => <CardSkeleton key={key} />)}
              </div>
            ) : (
              skeletonCards.map((key) => <CardSkeleton key={key} row />)
            )
          ) : (
            <CustomSearchCta variant="empty" onOpen={() => setCustomSearchOpen(true)} />
          )}
          {remoteLoading && displayed.length > 0 && <div className="catalog-message">Загружаем объявления…</div>}
          {hasMore && !remoteLoading && !remoteError && (
            <button type="button" className="load-more" onClick={loadMore}>
              Подгрузить ещё
            </button>
          )}
          {useApi && hasMore && !remoteLoading && remoteError && (
            <button className="load-more" onClick={loadMore}>
              Повторить загрузку
            </button>
          )}
          {displayed.length > 0 && !hasMore && !remoteLoading && (
            <CustomSearchCta variant="end" onOpen={() => setCustomSearchOpen(true)} />
          )}
        </section>
        <aside className="side-card">
          <div className="side-icon">
            <ShieldCheck size={26} weight="duotone" />
          </div>
          <h3>Как устроена покупка</h3>
          <p>Покажем весь путь автомобиля из Китая до выдачи в Минске — без скрытых этапов.</p>
          <ul>
            <li>
              <Check size={15} />
              Проверка автомобиля
            </li>
            <li>
              <Check size={15} />
              Доставка и оформление
            </li>
            <li>
              <Check size={15} />
              Передача в Минске
            </li>
          </ul>
          <button className="secondary" onClick={() => navigate("/how-it-works")}>
            О сервисе
          </button>
        </aside>
        {/* Текстовый блок стоит в той же колонке, что выдача: справа от него —
            карточка сервиса, и правый край блока совпадает с правым краем выдачи. */}
        {landing ? <CatalogLandingNotes landing={landing} models={models} navigate={navigate} total={knownResultCount} /> : <CatalogSectionLinks navigate={navigate} />}
      </div>
      <ScrollToTopButton />
      {Boolean(toast) && <Toast text={toast} onClose={() => setToast(null)} />}
      {customSearchOpen && <CustomSearchModal filters={filters} onClose={() => setCustomSearchOpen(false)} />}
      {quickViewModal}
    </main>
  );
}

/* Ссылки на разделы каталога под выдачей общего каталога. Раньше попасть в раздел можно
   было только с главной, где плитку марок рисует скрипт, — то есть для поисковика
   разделы были островом. Здесь те же ссылки видит и человек, и робот. */
function CatalogSectionLinks({ navigate }) {
  const groups = [
    ["Марки", CATALOG_LANDINGS.filter((item) => item.kind === "brand")],
    ["Тип двигателя", CATALOG_LANDINGS.filter((item) => item.kind === "powertrain")],
    ["Тип кузова", CATALOG_LANDINGS.filter((item) => item.kind === "bodyType")],
    ["Двигатель и кузов", CATALOG_LANDINGS.filter((item) => item.kind === "combo")],
    ["Марка и кузов", CATALOG_LANDINGS.filter((item) => item.kind === "brandBody")],
    ["По цене до Минска", CATALOG_LANDINGS.filter((item) => item.kind === "price")],
  ];
  return (
    <section className="catalog-landing-notes" aria-labelledby="catalog-sections-title">
      <h2 id="catalog-sections-title">Автомобили из Китая по маркам и типам</h2>
      {groups.map(([title, items]) => (
        <div className="catalog-landing-links" key={title}>
          <b>{title}</b>
          <div>
            {items.map((item) => (
              <AppLink key={item.path} href={item.path} navigate={navigate}>{item.name}</AppLink>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/* Текст страницы марки или типа стоит под выдачей, а не над ней: сверху человеку нужны
   машины, а не чтение. Здесь же ссылки на обзоры моделей этой марки и на соседние
   страницы каталога — по ним поисковик обходит раздел, а человек переходит к похожему. */
function CatalogLandingNotes({ landing, models, navigate, total = null }) {
  const modelPages = landing.brand ? MODEL_PAGES.filter((page) => page.brand === landing.brand) : [];
  const available = new Set((models || []).filter((model) => model !== ANY_MODEL));
  const reviews = modelPages.filter((page) => !available.size || available.has(page.model));
  // Разделы по смыслу, а не все подряд: полный список всех 55 лежит в каталоге — это его
  // естественное место. Одинаковый на всех страницах блок ссылок поисковик со временем
  // считает частью шаблона и обесценивает, а вес размазывается ровным слоем.
  const others = relatedLandings(landing);
  return (
    <section className="catalog-landing-notes catalog-landing-article" aria-labelledby="catalog-landing-notes-title">
      <h2 id="catalog-landing-notes-title">{landing.name} из Китая: что важно знать</h2>
      {landing.notes.map((text) => (
        <p key={text.slice(0, 40)}>{text}</p>
      ))}
      {reviews.length > 0 && (
        <div className="catalog-landing-links">
          <b>Обзоры моделей {landing.brand}</b>
          <div>
            {reviews.map((page) => (
              <AppLink key={page.path} href={page.path} navigate={navigate}>{page.name}</AppLink>
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div className="catalog-landing-links">
          <b>{landing.kind === "brand" ? "Другие марки" : landing.kind === "powertrain" ? "Другие типы" : "Другие кузова"}</b>
          <div>
            {others.map((item) => (
              <AppLink key={item.path} href={item.path} navigate={navigate}>{item.name}</AppLink>
            ))}
          </div>
        </div>
      )}
      <CatalogLandingFaq landing={landing} total={total} />
    </section>
  );
}

/* Частые вопросы раздела: те же плашки, что в обзорах моделей, только внутри текстового
   блока каталога — и с разметкой FAQPage, по которой вопросы попадают прямо в выдачу.
   Сами вопросы собираются из типа раздела и количества машин (src/landing-faq.js),
   поэтому у бензинового раздела спрашивают про пошлину по объёму, а у электрического —
   про квоту. Пока количество машин не пришло, первый вопрос про цену не показываем:
   выдумывать число нельзя. */
function CatalogLandingFaq({ landing, total }) {
  const faq = landingFaq(landing, { total });
  if (!faq.length) return null;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <div className="catalog-landing-faq">
      <h3>{landingFaqTitle(landing)}</h3>
      <div className="catalog-landing-faq-list">
        {faq.map((item, index) => (
          <HomeFaqItem key={item.q} item={{ question: item.q, answer: item.a }} initiallyOpen={index === 0} />
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </div>
  );
}

function GalleryModal({ car, images, initialIndex, onClose }) {
  const imageRefs = useRef([]);
  const thumbRefs = useRef([]);
  const modalRef = useRef(null);
  const scrollFrame = useRef(null);
  const navigationFrame = useRef(null);
  const navigating = useRef(false);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => imageRefs.current[initialIndex]?.scrollIntoView({ block: "start" }));
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current);
      if (navigationFrame.current) cancelAnimationFrame(navigationFrame.current);
    };
  }, [initialIndex, onClose]);
  useEffect(() => {
    const thumb = thumbRefs.current[activeIndex];
    const rail = thumb?.parentElement;
    if (!thumb || !rail) return;
    const thumbTop = thumb.offsetTop;
    const thumbBottom = thumbTop + thumb.offsetHeight;
    if (thumbTop < rail.scrollTop) rail.scrollTop = thumbTop;
    else if (thumbBottom > rail.scrollTop + rail.clientHeight) rail.scrollTop = thumbBottom - rail.clientHeight;
  }, [activeIndex]);
  const jumpTo = (index) => {
    const modal = modalRef.current;
    const targetImage = imageRefs.current[index];
    if (!modal || !targetImage) return;
    if (navigationFrame.current) cancelAnimationFrame(navigationFrame.current);
    setActiveIndex(index);
    const start = modal.scrollTop;
    const target = start + targetImage.getBoundingClientRect().top - modal.getBoundingClientRect().top - 88;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      modal.scrollTop = target;
      return;
    }
    navigating.current = true;
    const startedAt = performance.now();
    const animate = (now) => {
      const progress = Math.min(1, (now - startedAt) / 180);
      const eased = 1 - Math.pow(1 - progress, 3);
      modal.scrollTop = start + (target - start) * eased;
      if (progress < 1) navigationFrame.current = requestAnimationFrame(animate);
      else {
        navigationFrame.current = null;
        navigating.current = false;
        setActiveIndex(index);
      }
    };
    navigationFrame.current = requestAnimationFrame(animate);
  };
  const trackActiveImage = (event) => {
    if (event.target !== event.currentTarget) return;
    if (navigating.current) return;
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const marker = 96;
      let closestIndex = 0;
      let closestDistance = Infinity;
      imageRefs.current.forEach((node, index) => {
        if (!node) return;
        const distance = Math.abs(node.getBoundingClientRect().top - marker);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      setActiveIndex((current) => (current === closestIndex ? current : closestIndex));
    });
  };
  return (
    <div ref={modalRef} className="gallery-modal" role="dialog" aria-modal="true" aria-label={`Фотографии ${car.title}`} onScroll={trackActiveImage} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <header>
        <div>
          <b>{car.title}</b>
          <span>
            {activeIndex + 1} из {images.length}
          </span>
        </div>
        <button aria-label="Закрыть галерею" onClick={onClose}>
          <X size={24} />
        </button>
      </header>
      <div className="gallery-modal-content">
        <aside className="gallery-modal-rail" aria-label="Миниатюры фотографий">
          {images.map((image, index) => (
            <button
              key={`${image}-thumb-${index}`}
              ref={(node) => {
                thumbRefs.current[index] = node;
              }}
              className={activeIndex === index ? "active" : ""}
              onClick={() => jumpTo(index)}
              aria-label={`Перейти к фото ${index + 1}`}
              aria-current={activeIndex === index ? "true" : undefined}
            >
              <img src={imageSource(image, IMAGE_WIDTH_THUMB)} alt="" loading={index > 8 ? "lazy" : "eager"} onError={(event) => retryWithFullImage(event, image)} />
            </button>
          ))}
        </aside>
        <div className="gallery-modal-list">
          {images.map((image, index) => (
            <figure
              key={`${image}-${index}`}
              ref={(node) => {
                imageRefs.current[index] = node;
              }}
            >
              <img src={imageSource(image, IMAGE_ORIGINAL)} alt={`${car.title}, фото ${index + 1}`} loading={index > initialIndex + 2 ? "lazy" : "eager"} onError={(event) => retryWithFullImage(event, image)} />
              <figcaption>
                {index + 1} из {images.length}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}

function VehicleGallery({ car }) {
  const images = car.images?.length ? car.images : [car.image];
  const [active, setActive] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  // Соседние кадры ставим в ленту не сразу, а как только приехал главный снимок:
  // иначе первая загрузка страницы качала бы шесть фотографий вместо одной и
  // главный кадр — тот самый, по которому считают скорость сайта, — ждал бы в
  // очереди. Смахивание тоже включает готовность: если человек листает раньше,
  // чем доехало первое фото, соседние нужны немедленно.
  const [ready, setReady] = useState(false);
  const stripRef = useRef(null);
  const thumbsRef = useRef(null);
  // Фотографии лежат лентой в прокручиваемой полосе с прилипанием кадра. Раньше
  // смахивание тянуло единственный кадр в сторону, а за ним не было ничего —
  // отсюда пустое поле на мгновение. Теперь палец тянет ленту, и соседний снимок
  // приезжает вместе с пальцем, как в любой привычной галерее.
  // Пока лента сама плавно доезжает до кадра, событий прокрутки приходит много, и
  // на полпути номер снимка ещё старый — счётчик успевал дёрнуться туда и обратно.
  // Поэтому на время своего перехода слушаем только приезд в нужный кадр.
  const pending = useRef(null);
  const pendingTimer = useRef(0);
  const clampIndex = (index) => Math.min(images.length - 1, Math.max(0, index));
  // Ширину кадра берём у самой ленты, а не считаем как «ширина окна × номер»:
  // в сетке страницы кадр выходит дробной ширины (838,4 точки), целые 838 копили
  // ошибку, и к четвёртому снимку сбоку торчала полоска соседнего фото.
  const slideWidth = () => {
    const strip = stripRef.current;
    if (!strip) return 0;
    const first = strip.children[0];
    const second = strip.children[1];
    return second ? second.offsetLeft - first.offsetLeft : strip.clientWidth;
  };
  const scrollToIndex = (index, smooth) => {
    const strip = stripRef.current;
    const slide = strip?.children[index];
    if (!strip || !slide) return;
    pending.current = index;
    window.clearTimeout(pendingTimer.current);
    pendingTimer.current = window.setTimeout(() => {
      pending.current = null;
    }, 700);
    strip.scrollTo({ left: slide.offsetLeft, behavior: smooth ? "smooth" : "auto" });
  };
  const goTo = (index, smooth) => {
    scrollToIndex(index, smooth);
    setActive(index);
  };
  const move = (step) => {
    const next = (active + step + images.length) % images.length;
    // Плавно — только к соседнему кадру. Перескок с последнего фото на первое
    // плавной прокруткой пролетал бы через всю ленту: это долго и мельтешит.
    goTo(next, Math.abs(next - active) === 1);
  };
  const selectImage = (index) => {
    if (index === active) return;
    goTo(index, Math.abs(index - active) === 1);
  };
  const onStripScroll = () => {
    const strip = stripRef.current;
    const width = slideWidth();
    if (!strip || !width) return;
    const index = clampIndex(Math.round(strip.scrollLeft / width));
    if (pending.current !== null) {
      if (index !== pending.current) return;
      pending.current = null;
    }
    if (index !== active) setActive(index);
  };
  // Мышью ленту тоже можно тянуть за собой — на компьютере это привычный способ
  // листать фотографии, и он работал до того, как галерея стала лентой. Пальцу
  // такая помощь не нужна: прокрутку он ведёт сам, поэтому берём только мышь.
  // Прилипание кадра на время перетаскивания отключаем: с ним браузер возвращал
  // ленту к ближайшему снимку на каждое движение руки, и лента стояла на месте.
  const drag = useRef(null);
  const suppressOpen = useRef(false);
  const [freeScroll, setFreeScroll] = useState(false);
  const freeTimer = useRef(0);
  const settleRef = useRef(null);
  const stopFreeScroll = () => {
    window.clearTimeout(freeTimer.current);
    if (settleRef.current) stripRef.current?.removeEventListener("scrollend", settleRef.current);
    settleRef.current = null;
  };
  useEffect(
    () => () => {
      window.clearTimeout(pendingTimer.current);
      stopFreeScroll();
    },
    [],
  );
  const onPointerDown = (event) => {
    setReady(true);
    if (event.pointerType !== "mouse" || event.button !== 0 || images.length < 2) return;
    const strip = stripRef.current;
    if (!strip) return;
    pending.current = null;
    stopFreeScroll();
    drag.current = { id: event.pointerId, x: event.clientX, left: strip.scrollLeft, moved: false };
    setFreeScroll(true);
    // Захват указателя: если мышь уйдёт за край кадра, движение всё равно наше.
    // Браузер может отказать (указатель уже отпущен) — тогда просто работаем без.
    try {
      strip.setPointerCapture?.(event.pointerId);
    } catch {
      /* не критично */
    }
  };
  const onPointerMove = (event) => {
    const start = drag.current;
    const strip = stripRef.current;
    if (!start || start.id !== event.pointerId || !strip) return;
    const distance = event.clientX - start.x;
    if (Math.abs(distance) > 4) start.moved = true;
    strip.scrollLeft = start.left - distance;
  };
  const endDrag = (event) => {
    const start = drag.current;
    const strip = stripRef.current;
    drag.current = null;
    if (!start || !strip) {
      setFreeScroll(false);
      return;
    }
    try {
      strip.releasePointerCapture?.(event.pointerId);
    } catch {
      /* не критично */
    }
    const width = slideWidth();
    const distance = start.id === event.pointerId ? event.clientX - start.x : 0;
    const from = width ? Math.round(start.left / width) : active;
    // Порог — четверть кадра, но не больше 70 точек: короткого движения рукой
    // достаточно, чтобы перейти к следующему снимку.
    const threshold = width ? Math.min(70, width / 4) : 70;
    const step = Math.abs(distance) >= threshold ? (distance > 0 ? -1 : 1) : 0;
    // Перетаскивание не должно открывать все фотографии. Браузер всё равно пришлёт
    // клик сразу за отпусканием кнопки — он и погасит признак. Но если клика не
    // будет, признак снимаем сам следующим же тиком, иначе он проглотит
    // следующее честное нажатие.
    if (start.moved) {
      suppressOpen.current = true;
      window.setTimeout(() => {
        suppressOpen.current = false;
      }, 0);
    }
    goTo(clampIndex(from + step), true);
    // Прилипание возвращаем, когда лента уже доехала: включённым посреди плавного
    // перехода оно обрывало бы его и дёргало кадр. Ждём события «прокрутка
    // закончилась», а где браузер его не знает — сдаёмся через семь десятых
    // секунды: к этому времени переход всегда завершён.
    const settle = () => {
      stopFreeScroll();
      setFreeScroll(false);
    };
    settleRef.current = settle;
    strip.addEventListener("scrollend", settle);
    freeTimer.current = window.setTimeout(settle, 700);
  };
  const openModal = () => {
    if (suppressOpen.current) {
      suppressOpen.current = false;
      return;
    }
    setModalOpen(true);
  };
  useEffect(() => {
    const thumb = thumbsRef.current?.children[active];
    const rail = thumbsRef.current;
    if (!thumb || !rail) return;
    const thumbLeft = thumb.offsetLeft;
    const thumbRight = thumbLeft + thumb.offsetWidth;
    if (thumbLeft < rail.scrollLeft) rail.scrollTo({ left: thumbLeft, behavior: "smooth" });
    else if (thumbRight > rail.scrollLeft + rail.clientWidth)
      rail.scrollTo({
        left: thumbRight - rail.clientWidth,
        behavior: "smooth",
      });
  }, [active]);
  // Пустой лист при смахивании: браузер выбрасывает прежний кадр в тот же миг, когда
  // ему дают адрес нового, а оригинал снимка ещё едет по сети. Поэтому, во-первых, под
  // каждым большим кадром лежит облегчённая версия того же снимка (600 точек, ~30 КБ —
  // её браузер уже скачал для плитки в каталоге): она появляется почти сразу и её
  // накрывает оригинал, когда придёт. Во-вторых, соседние снимки запрашиваем заранее,
  // пока посетитель смотрит текущий, — тогда смахивание чаще всего не ждёт сети вовсе.
  const preloadKeeper = useRef([]);
  useEffect(() => {
    if (images.length < 2 || !ready) return;
    const link = navigator.connection;
    if (link?.saveData) return;
    const at = (step) => images[(active + step + images.length * 2) % images.length];
    // Кадр через один: качаем только облегчённую версию (13 КБ). Она страхует от
    // белого листа, если посетитель пролистнул дальше, чем мы успели приготовить, —
    // а тянуть вперёд по два оригинала на 70 КБ значило бы жечь мобильный трафик
    // на снимки, которых человек может и не увидеть.
    const wanted = [2, -2].map((step) => imageSource(at(step), IMAGE_WIDTH_CARD));
    const started = [];
    for (const href of new Set(wanted.filter(Boolean))) {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = href;
      started.push(image);
    }
    // Ссылки держим, чтобы сборщик мусора не оборвал запрос на полпути.
    preloadKeeper.current = [...started, ...preloadKeeper.current].slice(0, 12);
  }, [active, images, ready]);
  // Страховка к onLoad: если главный снимок уже лежал в кэше, браузер успевает
  // отметить его загруженным до того, как разметка оживёт, и события мы не увидим.
  // Тогда смотрим на признак «кадр готов» напрямую, а на совсем медленной сети
  // сдаёмся через две секунды и всё равно готовим соседей.
  useEffect(() => {
    if (stripRef.current?.querySelector(".gallery-frame-full")?.complete) {
      setReady(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setReady(true), 2000);
    return () => window.clearTimeout(timer);
  }, []);
  // Соседний кадр слева и справа держим готовым — это ровно то, что палец вытягивает
  // в поле зрения. Дальше не забегаем: у иных объявлений снимков по сотне, и каждый
  // лишний кадр — это 83 КБ мобильного трафика впустую.
  const near = ready ? 1 : 0;
  return (
    <>
      <section className="gallery-panel">
        {/* Кадры дальше двух от текущего в разметку не ставим: у иных объявлений
            снимков под сотню, и сотня рамок в ленте — это лишняя работа браузеру.
            Соседние всегда на месте, поэтому тянуть ленту не во что пустое. */}
        <div
          className={`gallery-strip${freeScroll ? " free" : ""}`}
          ref={stripRef}
          onScroll={onStripScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              className="gallery-slide"
              tabIndex={index === active ? 0 : -1}
              onClick={openModal}
              aria-label={`Фото ${index + 1} из ${images.length}: ${car.title}. Открыть все фотографии`}
            >
              {Math.abs(index - active) <= near && (
                <>
                  <img className="gallery-frame-preview" src={imageSource(image, IMAGE_WIDTH_CARD)} alt="" aria-hidden="true" draggable="false" />
                  <img
                    className="gallery-frame-full"
                    src={imageSource(image, IMAGE_ORIGINAL)}
                    alt={`${car.title}, фото ${index + 1}`}
                    fetchPriority={index === 0 ? "high" : "low"}
                    draggable="false"
                    onLoad={index === 0 ? () => setReady(true) : undefined}
                    onError={(event) => {
                      if (index === 0) setReady(true);
                      retryWithFullImage(event, image);
                    }}
                  />
                </>
              )}
            </button>
          ))}
        </div>
        <span aria-live="polite">
          <Images size={17} />
          {active + 1} из {images.length}
        </span>
        {images.length > 1 && (
          <div className="gallery-controls">
            <button aria-label="Предыдущее фото" onClick={() => move(-1)}>
              <ArrowLeft size={20} />
            </button>
            <button aria-label="Следующее фото" onClick={() => move(1)}>
              <ArrowRight size={20} />
            </button>
          </div>
        )}
        <div className="gallery-thumbs" ref={thumbsRef}>
          {images.map((image, index) => (
            <button key={`${image}-${index}`} className={active === index ? "active" : ""} onMouseEnter={() => selectImage(index)} onClick={() => selectImage(index)} aria-label={`Показать фото ${index + 1}`}>
              <img src={imageSource(image, IMAGE_WIDTH_THUMB)} alt="" loading="lazy" onError={(event) => retryWithFullImage(event, image)} />
            </button>
          ))}
        </div>
        <button className="gallery-view-all" onClick={() => setModalOpen(true)}>
          <Images size={18} />
          Все фото
        </button>
      </section>
      {modalOpen && <GalleryModal car={car} images={images} initialIndex={active} onClose={() => setModalOpen(false)} />}
    </>
  );
}

function FactList({ items }) {
  return (
    <div className="fact-list">
      {items.map(([Icon, label, value]) => (
        <div className="fact-row" key={label}>
          <Icon size={21} weight="duotone" aria-hidden="true" />
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

// Полная техническая карта источника: ~85 пунктов в 7 группах, свёрнутых по
// умолчанию, чтобы не раздавить страницу. Словарь перевода живёт в
// spec-translations.js; незнакомые значения показываются как есть.
const SPEC_GROUP_ICONS = {
  "Общие данные": ClipboardText,
  "Кузов": CarProfile,
  "Электромотор": Lightning,
  "Батарея и зарядка": BatteryHigh,
  "Двигатель": Engine,
  "Трансмиссия": Gear,
  "Шасси и рулевое управление": SteeringWheel,
  "Колёса и тормоза": Tire,
};

function TechnicalSpecs({ car }) {
  // Цвета в техкарте источника нет — она описывает модель, а не конкретную машину.
  // Подмешиваем его из объявления первой строкой «Общих данных», чтобы цвет
  // находился и глазами, и встроенным поиском по полным данным.
  const groups = useMemo(() => {
    const translated = translateTechnicalSpecs(car.technicalSpecs);
    const color = translateColor(car.bodyColor);
    if (color && translated.length) translated[0] = { ...translated[0], items: [{ name: "Цвет кузова", value: color }, ...translated[0].items] };
    return translated;
  }, [car.technicalSpecs, car.bodyColor]);
  const [query, setQuery] = useState("");
  const searchBoxRef = useRef(null);
  // Тот же умный поиск: часть слова, кириллица и набранное не в той раскладке.
  const needles = listSearchVariants(query);
  // Выдача поиска — слой поверх аккордеона: сами группы не перестраиваются,
  // поэтому страница не дёргается при наборе (ищем и по названию, и по значению).
  const found = useMemo(() => {
    if (!needles.length) return [];
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const haystack = searchNormalize(`${item.name} ${item.value}`);
          return needles.some((needle) => haystack.includes(needle));
        }),
      }))
      .filter((group) => group.items.length);
  }, [groups, needles.join("|")]);
  const searching = needles.length > 0;
  // Клик мимо панели или Escape закрывают выдачу вместе с запросом. Escape
  // перехватываем на capture-фазе, чтобы в быстром просмотре он сперва закрыл
  // выдачу, а не модалку целиком.
  useEffect(() => {
    if (!searching) return undefined;
    const onPointerDown = (event) => {
      if (!searchBoxRef.current?.contains(event.target)) setQuery("");
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setQuery("");
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [searching]);
  if (!groups.length) return null;
  return (
    <section className="detail-facts-section technical-specs">
      <h2>Полные данные</h2>
      <div className="spec-search-box" ref={searchBoxRef}>
        <div className="select-search spec-search">
          <MagnifyingGlass size={16} />
          <input type="search" value={query} placeholder="Поиск: разгон, багажник, зарядка…" aria-label="Поиск по полным данным" onChange={(event) => setQuery(event.target.value)} />
          {query && (
            <button type="button" className="select-search-clear" aria-label="Очистить поиск" onClick={() => setQuery("")}>
              <X size={14} weight="bold" />
            </button>
          )}
        </div>
        {searching && (
          <div className="spec-search-results" role="region" aria-label="Результаты поиска по полным данным">
            {found.length
              ? found.map((group) => (
                  <div className="spec-search-group" key={group.name}>
                    <p>{group.name}</p>
                    {group.items.map((item, index) => (
                      <div className="spec-row" key={`${item.name}-${index}`}>
                        <span>{item.name}</span>
                        <b>{item.value}</b>
                      </div>
                    ))}
                  </div>
                ))
              : <p className="spec-search-empty">Ничего не найдено — попробуйте другое слово.</p>}
          </div>
        )}
      </div>
      {groups.map((group) => {
        const GroupIcon = SPEC_GROUP_ICONS[group.name] || ListChecks;
        return (
        <details className="spec-group" key={group.name}>
          <summary>
            <GroupIcon size={21} weight="duotone" aria-hidden="true" />
            <span>{group.name}</span>
            <small>{group.items.length}</small>
            <CaretDown className="spec-caret" size={18} aria-hidden="true" />
          </summary>
          <div className="spec-rows">
            {group.items.map((item, index) => (
              <div className="spec-row" key={`${item.name}-${index}`}>
                <span>{item.name}</span>
                <b>{item.value}</b>
              </div>
            ))}
          </div>
        </details>
        );
      })}
    </section>
  );
}

function PriceLabel({ label, description }) {
  // Подсказка общая со служебными кнопками: координаты ставит JS с fixed-позицией,
  // иначе текст резали край окна и прокрутка (как раньше у «Удалить из избранного»).
  return (
    <div className="price-label">
      <b>{label}</b>
      <span className="price-info" tabIndex={0} aria-label={`Подробнее: ${label}`}>
        <Info size={16} />
        <ActionTooltip text={description} />
      </span>
    </div>
  );
}

function ConsentField({ checked, onChange, error }) {
  const consentId = useId();
  const errorId = `${consentId}-error`;
  return (
    <div className="consent-block">
      <label className="consent-field" htmlFor={consentId}>
        <input id={consentId} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-describedby={error ? errorId : undefined} />
        <span>
          Я соглашаюсь на обработку персональных данных и принимаю <a href={`${import.meta.env.BASE_URL}privacy`}>политику конфиденциальности</a> и <a href={`${import.meta.env.BASE_URL}terms`}>условия использования</a>.
        </span>
      </label>
      {error && <small className="consent-error" id={errorId}>{error}</small>}
    </div>
  );
}

function CustomSearchCta({ variant, onOpen }) {
  const isEmpty = variant === "empty";
  return (
    <section className={`custom-search-cta ${isEmpty ? "is-empty" : "is-end"}`} aria-labelledby={`custom-search-${variant}-title`}>
      <div className="custom-search-icon" aria-hidden="true">
        <CarProfile size={28} weight="duotone" />
      </div>
      <div className="custom-search-copy">
        <span>{isEmpty ? "По вашему запросу нет вариантов" : "Вы посмотрели все варианты"}</span>
        <h2 id={`custom-search-${variant}-title`}>{isEmpty ? "Не нашли нужный автомобиль?" : "Не увидели подходящий автомобиль?"}</h2>
        <p>Напишите, что ищете. Мы подберём автомобиль индивидуально — даже если его пока нет в каталоге.</p>
      </div>
      <button className="primary" type="button" onClick={onOpen}>
        Описать желаемое авто <ArrowRight size={18} />
      </button>
    </section>
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

function Detail({ car, cars, apiMode, navigate, backToCatalog, favorite, favorites, toggleFavorite }) {
  // Шаг назад по истории возвращает и фильтры, и позицию карточки, поэтому
  // кнопка идёт именно им. Прямой заход историей не подкреплён — тогда в каталог.
  const goBack = () => (window.history.length > 1 && window.history.state?.fromPath ? navigate(-1) : backToCatalog(car.id));
  const openFilteredCatalog = (withModel) => {
    const stored = readCatalogReturn();
    const model = withModel ? [car.model] : [];
    const target = `/catalog?brand=${encodeURIComponent(car.brand)}${withModel ? `&model=${encodeURIComponent(car.model)}` : ""}`;
    if (!stored || stored.openedCarId !== car.id) {
      navigate(target);
      return;
    }
    // Марка и модель сужают выдачу: фильтры переносим, но порядок и якорь
    // прошлого списка к новому набору уже не относятся.
    navigate(target, {
      catalogState: { ...stored, catalog: { ...stored.catalog, filters: { ...stored.catalog.filters, brand: car.brand, model }, order: [] }, scrollY: 0, scrollAnchor: null },
    });
  };
  const openBrand = () => openFilteredCatalog(false);
  const openModel = () => openFilteredCatalog(true);
  const { openQuickView, quickViewModal } = useVehicleQuickView({ apiMode:apiMode !== false, favorites, toggleFavorite, navigate });
  const openSimilarCar = (candidate) => {
    if (openQuickView(candidate)) return;
    navigate(carHref(candidate));
  };
  if (!car) return <NotFound navigate={navigate} />;
  return (
    <main className="detail page-width">
      <div className="breadcrumbs">
        <button onClick={() => navigate("/")}>Главная</button>
        <CaretRight size={13} />
        <button onClick={() => backToCatalog(car.id)}>Автомобили из Китая</button>
        <CaretRight size={13} />
        <button onClick={openBrand}>{car.brand}</button>
        <CaretRight size={13} />
        <button onClick={openModel}>{car.model}</button>
        <CaretRight size={13} />
        {car.model} {car.year}
      </div>
      <VehicleDetailBody car={car} navigate={navigate} favorite={favorite} toggleFavorite={toggleFavorite} goBack={goBack} />
      <SameModelCars car={car} cars={cars} onOpenCar={openSimilarCar} />
      <SimilarCars car={car} cars={cars} onOpenCar={openSimilarCar} />
      {quickViewModal}
    </main>
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
function ActionTooltip({ text, className = "", tapToOpen = false }) {
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
    const show = () => {
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
  }, [place]);
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
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
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

// Ссылку кладём в буфер обмена: без доступа к Clipboard API (http, отказ в
// разрешении) остаётся старый путь через скрытое поле.
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  } catch {
    return false;
  }
}

// Оранжевая плашка под карточкой цены: особенность марки, из-за которой итог
// может вырасти уже после проверки машины. Стоит после кнопки, чтобы её
// прочитали перед обращением, но не заслоняла цену.
function BrandNotice({ car }) {
  const notice = brandNotice(car?.brand);
  if (!notice) return null;
  return (
    <section className="brand-notice" aria-label={notice.title}>
      <div className="brand-notice-heading">
        <BatteryHigh size={20} weight="duotone" />
        <b>{notice.title}</b>
      </div>
      {notice.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </section>
  );
}

// Серый ряд с номером объявления под карточкой цены: по нему клиент называет
// машину менеджеру, поэтому рядом кнопка «скопировать».
function ListingIdRow({ car }) {
  const [state, setState] = useState("idle");
  useEffect(() => {
    if (state === "idle") return undefined;
    const timer = window.setTimeout(() => setState("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [state]);
  const id = listingNumber(car.sourceId || car.id);
  if (!id) return null;
  const copy = async () => setState((await copyToClipboard(String(id))) ? "copied" : "failed");
  return (
    <div className="listing-id-row">
      <span>{state === "copied" ? "ID скопирован" : state === "failed" ? "Не удалось скопировать" : `ID объявления: ${id}`}</span>
      <button type="button" aria-label="Копировать ID объявления" onClick={copy}>
        {state === "copied" ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

function CopyLinkButton({ car }) {
  const [state, setState] = useState("idle");
  useEffect(() => {
    if (state === "idle") return undefined;
    const timer = window.setTimeout(() => setState("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [state]);
  const hint = state === "copied" ? "Ссылка скопирована" : state === "failed" ? "Не удалось скопировать" : "Копировать ссылку";
  const copy = async () => {
    const link = new URL(appHref(carHref(car)), window.location.origin).href;
    setState((await copyToClipboard(link)) ? "copied" : "failed");
  };
  return (
    <button type="button" aria-label={hint} onClick={copy}>
      <LinkSimple size={21} />
      <ActionTooltip text={hint} />
    </button>
  );
}

// Китайское имя модели рядом с названием.
//
// В каталоге машины стоят под беларускими именами — так их здесь ищут: 星瑞 у нас
// Geely Preface, 缤越 — Coolray. Но покупатель сверяет карточку с китайскими
// объявлениями и обзорами, где имя другое, поэтому оно должно быть под рукой.
// Знак появляется только у переименованных моделей: где имя совпадает, показывать
// нечего (`config/model-names-by.mjs`).
function ChineseNameMark({ car }) {
  const info = chineseModelName(car?.brand, car?.model);
  if (!info) return null;
  const spoken = info.pinyin ? `${info.zh} (${info.pinyin})` : info.zh;
  const hint = `В Китае эта модель называется ${spoken}`;
  const tooltip = (
    <>
      <b>В Китае — {info.zh}</b>
      {info.pinyin && <i>{info.pinyin}</i>}
      {info.note && <i>{info.note}</i>}
    </>
  );
  // Класс стрелки на полную страницу берём как есть: знак стоит рядом с ней в строке
  // заголовка, и они должны читаться как пара — один круг, один размер значка.
  return (
    <span className="detail-back chinese-name-mark" role="img" aria-label={hint} tabIndex="0">
      <Info />
      <ActionTooltip className="chinese-name-tooltip" text={tooltip} tapToOpen />
    </span>
  );
}

function VehicleDetailBody({ car, navigate, favorite, toggleFavorite, goBack = null, openFull = null, floatingCta = true, currencySwitch = false, onOpenOrder = null }) {
  const currency = useCurrency();
  const setCurrency = useSetCurrency();
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [availabilityCtaVisible, setAvailabilityCtaVisible] = useState(false);
  const availabilityCtaRef = useRef(null);
  // По этой машине заказ уже создан — тогда кнопка не заводит второй, а ведёт в кабинет.
  const orderedListings = useOrderedListings();
  const inOrder = orderedListings.has(listingNumber(car.id));
  useEffect(() => {
    if (car) trackEvent("vehicle_view", { listingId:car.id, listingTitle:car.title });
  }, [car?.id]);
  useEffect(() => {
    const cta = availabilityCtaRef.current;
    if (!cta || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setAvailabilityCtaVisible(entry.isIntersecting);
    }, { threshold: 0.15 });
    observer.observe(cta);
    return () => observer.disconnect();
  }, [car?.id]);
  const price = estimateLandedCost(car);
  const timing = estimateDeliveryDays(car.city);
  // Кнопка заводит заказ: машину запоминаем, кабинет создаёт заказ сам.
  // Неавторизованных на /account встречает окно входа, ожидание переживает его.
  const requestAvailability = () => {
    // Машина уже в заказе — заводить второй не нужно. Обычно ведём в кабинет, но если
    // карточку и открыли из самого заказа, идти некуда: просто закрываем превью.
    if (inOrder) {
      if (onOpenOrder) onOpenOrder();
      else navigate("/account");
      return;
    }
    trackEvent("availability_click", { listingId:car.id, listingTitle:car.title });
    window.localStorage.setItem(pendingOrderKey, car.id);
    navigate("/account");
  };
  const favoriteHint = favorite ? "Удалить из избранного" : "Добавить в избранное";
  const quickInfo = buildVehicleQuickInfo(car);
  // Блок «О модели» есть только у моделей с описанной страницей; у остальных машин
  // карточка выглядит как раньше.
  const modelPage = modelPageForCar(car);
  // Цвет заполнен не у всех источников — без значения строка не показывается.
  const specs = [
    [CalendarBlank, "Год", car.year],
    [Gauge, "Пробег", `${number(car.mileage)} км`],
    [Lightning, "Тип", powertrainName(car.type)],
    [CarProfile, "Привод", car.drive],
    [BatteryHigh, "Батарея", car.battery ? `${car.battery} кВт·ч` : "Не указана"],
    [Palette, "Цвет", translateColor(car.bodyColor)],
    [CarProfile, "Кузов", car.bodyType],
  ].filter(([, , value]) => value);
  // Блок отчёта продавца заполнен только у Guazi; у Che168 все поля пусты, а тип
  // батареи и так виден в «Полных характеристиках». Пустые строки не показываем,
  // а без единой строки исчезает и весь блок — вместе с дисклеймером-заглушкой.
  const sourceClaims = translateClaims(car.claims || car.incident);
  // Когда машина появилась в каталоге и когда мы её последний раз сверяли.
  // На широком экране строка идёт в подзаголовке, на телефоне подзаголовок скрыт —
  // там та же строка стоит отдельно, между фотографиями и характеристиками.
  const datesLine = carDatesLine(car);
  const conditionFacts = [
    [CarProfile, "Владельцы в Китае", car.owners],
    [ShieldCheck, "Страховые случаи", sourceClaims === "Отчёт источника может быть неполным" ? null : sourceClaims],
    [Sparkle, "Оценка внешнего вида", car.appearanceScore ? `${car.appearanceScore}/100` : null],
    [BatteryHigh, "Тип батареи", car.technicalSpecs?.count ? null : translateBattery(car.batteryType)],
    [Gauge, "Здоровье батареи", car.batteryHealth ? `${car.batteryHealth}%` : null],
  ].filter(([, , value]) => value);
  return (
    <>
      <div className="detail-title">
        <div>
          {/* Ярлыка о новизне здесь нет: под заголовком и так стоит строка «Добавлено
              … · Обновлено …», и зелёная плашка её повторяла. */}
          <div className="detail-title-line">
            {goBack && (
              <button type="button" className="detail-back" aria-label="Назад" onClick={goBack}>
                <ArrowLeft size={20} />
                <ActionTooltip text="Назад" />
              </button>
            )}
            <h1>{car.title}</h1>
            <ChineseNameMark car={car} />
            {openFull && (
              <AppLink className="detail-back detail-open-full" href={carHref(car)} navigate={openFull} aria-label="Открыть полную страницу автомобиля">
                <ArrowUpRight size={20} />
                <ActionTooltip text="Открыть полную страницу" />
              </AppLink>
            )}
          </div>
          <TotalPrice car={car} price={price} currency={currency} className="detail-mobile-price" />
          {/* Тип, привод и пробег из подзаголовка убраны: они и так стоят
              строкой ниже, в «Характеристиках». Остались только даты. */}
          {datesLine && <p>{datesLine}</p>}
        </div>
        <div className="detail-actions">
          <CopyLinkButton car={car} />
          <button aria-label={favoriteHint} className={favorite ? "selected" : ""} onClick={() => toggleFavorite(car.id)}>
            <Heart size={21} weight={favorite ? "fill" : "regular"} />
            <ActionTooltip text={favoriteHint} />
          </button>
        </div>
      </div>
      <div className="detail-main">
        <div className="detail-content">
          <VehicleGallery car={car} />
          {datesLine && <p className="detail-dates">{datesLine}</p>}
          <section className="detail-facts-section">
            <h2>Характеристики</h2>
            <FactList items={specs} />
          </section>
          {conditionFacts.length > 0 && (
            <section className="detail-facts-section condition-card">
              <div className="detail-facts-heading">
                <h2>Что указано в объявлении</h2>
              </div>
              <FactList items={conditionFacts} />
            </section>
          )}
          <TechnicalSpecs car={car} />
          {modelPage && <ModelIntroCard modelPage={modelPage} car={car} navigate={navigate} />}
          <aside className="source-card detail-source-card">
            <small>Это сведения продавца и площадки, не наша независимая проверка. Актуальность продажи, VIN и возможность экспорта подтверждаются отдельно.</small>
          </aside>
        </div>
        <div className="detail-sidebar">
          {quickInfo.length > 0 && (
            <section className="vehicle-quick-info" aria-label="Основная информация об автомобиле">
              <span className="vehicle-quick-info-label">Основная информация</span>
              <p>{quickInfo.slice(0, 3).join(", ")}{quickInfo.length <= 3 ? "." : ""}</p>
              {quickInfo.length > 3 && <p>{quickInfo.slice(3).join(", ")}.</p>}
            </section>
          )}
          <aside className="order-card">
            <div className={`price-total${currencySwitch && setCurrency ? " price-total-with-currency" : ""}`} aria-label="Ориентировочная стоимость до Минска">
              <TotalPrice car={car} price={price} currency={currency} />
              {currencySwitch && setCurrency && <CurrencySwitch currency={currency} setCurrency={setCurrency} className="price-currency-switch" />}
            </div>
            <div className="price-breakdown">
              <div>
                <PriceLabel label="Автомобиль в Китае" description={`${number(car.chinaPrice)} ¥ · данные источника`} />
                <strong>{money(price.chinaUsd, currency)}</strong>
              </div>
              <div>
                <PriceLabel label="Выкуп и перевод денег" description="Платёжный агент и комиссии банка" />
                <strong>{approximateMoney(price.buyoutLow, price.buyoutHigh, currency)}</strong>
              </div>
              <div>
                <PriceLabel label="Логистика по Китаю" description={price.chinaLegNote} />
                <strong>{approximateMoney(price.chinaLegLow, price.chinaLegHigh, currency)}</strong>
              </div>
              <div>
                <PriceLabel label="Доставка до Минска" description={price.intlNote} />
                <strong>{approximateMoney(price.intlLow, price.intlHigh, currency)}</strong>
              </div>
              <div>
                <PriceLabel label="СВХ в Минске" description="Разгрузка и хранение до оформления" />
                <strong>{approximateMoney(price.svhLow, price.svhHigh, currency)}</strong>
              </div>
              <div>
                <PriceLabel label="Растаможка и сборы" description={price.customsHint || price.customsNote} />
                <strong>{approximateMoney(price.customsLow, price.customsHigh, currency)}</strong>
              </div>
              {price.customsAlert && <p className={`price-customs-alert${price.customsAlertTone === "warn" ? " price-customs-alert-warn" : ""}`}>{price.customsAlert}</p>}
              <div>
                <PriceLabel label="Услуги abcars.by" description="Проверка, выкуп и документы" />
                <strong>{money(price.serviceUsd, currency)}</strong>
              </div>
            </div>
            <div className="price-assumption">
              <span>Это не оферта. Курс НБРБ на {PRICING.rateDate}; цену продавца, маршрут и таможенные параметры нужно подтвердить.</span>
            </div>
            <section className={`delivery-disclosure${deliveryOpen ? " open" : ""}`}>
              <button type="button" className="delivery-card-heading" aria-expanded={deliveryOpen} onClick={() => setDeliveryOpen((open) => !open)}>
                <div className="delivery-card-icon">
                  <Clock size={23} weight="duotone" />
                </div>
                <div>
                  <span>Срок доставки до Минска</span>
                  <h2>{daysRange(timing.totalDays)}</h2>
                </div>
                <CaretDown className="disclosure-caret" size={20} weight="bold" />
              </button>
              <div className="animated-disclosure" aria-hidden={!deliveryOpen}>
                <div className="disclosure-content delivery-disclosure-content">
                <p className="delivery-intro">От договора до выдачи авто в Минске.</p>
                <div className="delivery-stages">
                  <div>
                    <b>Выкуп и экспорт</b>
                    <strong>{daysRange(timing.buyoutDays)}</strong>
                  </div>
                  <div>
                    <b>Логистика по Китаю</b>
                    <strong>{daysRange(timing.chinaDays)}</strong>
                  </div>
                  <div>
                    <b>Маршрут до Минска</b>
                    <strong>{daysRange(timing.intlDays)}</strong>
                  </div>
                  <div>
                    <b>СВХ и оформление</b>
                    <strong>{daysRange(timing.svhDays)}</strong>
                  </div>
                </div>
                <div className="price-assumption delivery-note">
                  <span>Срок зависит от очереди на границе и загрузки перевозчика.</span>
                </div>
                </div>
              </div>
            </section>
            <button ref={availabilityCtaRef} className={`primary report-order-cta${inOrder ? " ordered-cta" : ""}`} onClick={requestAvailability}>
              {inOrder ? (<><CheckCircle size={20} weight="fill" /> Перейти в заказ</>) : "Уточнить актуальность авто"}
            </button>
          </aside>
          <BrandNotice car={car} />
          <ListingIdRow car={car} />
        </div>
      </div>
      {floatingCta && (
        <div className={`detail-floating-availability${availabilityCtaVisible ? " is-hidden" : ""}`} aria-hidden={availabilityCtaVisible}>
          <button className={`primary${inOrder ? " ordered-cta" : ""}`} type="button" onClick={requestAvailability} tabIndex={availabilityCtaVisible ? -1 : 0}>
            {inOrder ? (<><CheckCircle size={20} weight="fill" /> Перейти в заказ</>) : "Уточнить актуальность авто"}
          </button>
        </div>
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
  const needsDetail = Boolean(id) && !detailed && failedId !== id && Boolean(listed?._summary);
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

function VehicleQuickViewModal({ car, navigate, favorite, toggleFavorite, onOpenFull, onClose, onOpenOrder = null }) {
  const closeRef = useRef(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      // Галерея и модалка наличия открываются поверх и закрываются сами.
      if (document.querySelector(".gallery-modal, .modal-backdrop")) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);
  return (
    <div className="quick-view-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="quick-view-modal" role="dialog" aria-modal="true" aria-label={`Быстрый просмотр: ${car.title}`}>
        <header className="quick-view-bar">
          <span>Быстрый просмотр</span>
          <button ref={closeRef} className="quick-view-close" type="button" onClick={onClose} aria-label="Закрыть быстрый просмотр">
            <X size={19} />
          </button>
        </header>
        <div className="quick-view-scroll">
          <VehicleDetailBody car={car} navigate={navigate} favorite={favorite} toggleFavorite={toggleFavorite} openFull={onOpenFull} floatingCta={false} currencySwitch onOpenOrder={onOpenOrder} />
        </div>
      </section>
    </div>
  );
}

// Быстрый просмотр включён по умолчанию, но это дополнение к странице
// автомобиля: свитчер рядом с выдачей возвращает обычный переход по клику.
const quickViewKey = "abcars-quick-view";
const readQuickViewEnabled = () => window.localStorage.getItem(quickViewKey) !== "off";

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
    quickViewModal: car ? <VehicleQuickViewModal car={car} navigate={navigateFromQuickView} favorite={favorites.has(car.id)} toggleFavorite={toggleFavorite} onOpenFull={openFullView} onClose={close} onOpenOrder={orderOnScreen ? close : null} /> : null,
  };
}

function DataTag({ type }) {
  const labels = {
    source: "Источник",
    calculated: "Расчёт",
    pending: "Нужно подтвердить",
  };
  return <span className={`data-tag ${type}`}>{labels[type]}</span>;
}

function SourceGrid({ rows }) {
  const visible = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (!visible.length) return <p className="order-empty">Источник не передал эти данные.</p>;
  return (
    <div className="order-facts">
      {visible.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

function OrderDraft({ car, navigate }) {
  const currency = useCurrency();
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [contact, setContact] = useState("");
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState("");
  if (!car) return <NotFound navigate={navigate} />;
  const price = estimateLandedCost(car);
  const sourceLink = car.sourceUrl?.replace(/\.md$/, ".html");
  const saveDraft = async (event) => {
    event.preventDefault();
    if (!consent) {
      setConsentError("Подтвердите согласие, чтобы сохранить заявку.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/order-drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId: car.id,
          contact: contact.trim(),
          calculation: {
            chinaPriceCny: car.chinaPrice,
            chinaUsd: price.chinaUsd,
            totalLow: price.totalLow,
            totalHigh: price.totalHigh,
            totalUsd: price.totalUsd,
            rateDate: PRICING.rateDate,
          },
        }),
      });
      if (!response.ok) throw new Error("save unavailable");
      setSaved(await response.json());
    } catch {
      setSaveError("Не удалось сохранить черновик. Проверьте подключение к серверу и попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };
  const vehicleRows = [
    ["Первая регистрация", car.firstRegistration],
    ["Пробег", `${number(car.mileage)} км`],
    ["Город", translateCity(car.city)],
    ["Владельцы", car.owners],
    ["Двигатель", car.engine],
    ["Коробка", car.transmission],
    ["Привод", car.drive],
    ["Цвет", translateColor(car.bodyColor)],
    ["Кузов", car.bodyType],
  ];
  const batteryRows = [
    ["Ёмкость", car.battery ? `${car.battery} кВт·ч` : null],
    ["Тип", car.batteryType ? translateBattery(car.batteryType) : null],
    ["Производитель", car.batteryBrand],
    ["Здоровье батареи", car.batteryHealth ? `${car.batteryHealth}%` : null],
    ["Запас хода на электротяге", car.electricRange ? `${car.electricRange} км` : null],
    ["Суммарный запас хода", car.combinedRange ? `${car.combinedRange} км` : null],
    ["Гарантия на силовую установку", translateSourceValue(car.warranty)],
    ["Защита батареи", translateSourceValue(car.batteryProtection)],
  ];
  const conditionRows = [
    ["Оценка источника", translateSourceValue(car.inspectionGrade || car.conditionGrade)],
    ["Внешний вид", car.appearanceScore ? `${car.appearanceScore}/100` : null],
    ["Страховые выплаты", translateClaims(car.claims || car.incident)],
    ["Силовая установка", car.powertrainInspection],
    ["Кузов", car.bodyInspection],
    ["Каркас кузова", car.structureInspection],
    ["Интерьер", car.interiorInspection],
    ["Подкапотное пространство", car.engineBayInspection],
  ];
  const assistanceRows = [
    ["Система помощи", car.driverAssistance],
    ["Уровень", car.assistanceLevel],
    ["Чип мультимедиа", car.infotainmentChip],
    ["Радары", car.radarCount ? `${car.radarCount} шт.` : null],
    ["Камеры", car.cameraCount ? `${car.cameraCount} шт.` : null],
    ["Ультразвуковые датчики", car.ultrasonicCount ? `${car.ultrasonicCount} шт.` : null],
  ];
  return (
    <main className="order-page page-width">
      <div className="breadcrumbs">
        <button onClick={() => navigate("/")}>Главная</button>
        <CaretRight size={13} />
        <button onClick={() => navigate(carHref(car))}>{car.title}</button>
        <CaretRight size={13} />
        Предварительный заказ
      </div>
      <button className="back-mobile" onClick={() => navigate(carHref(car))}>
        <ArrowLeft size={18} />
        Назад к автомобилю
      </button>
      <div className="order-heading">
        <div>
          <span>Черновик заказа · {listingNumber(car.sourceId)}</span>
          <h1>Предварительный заказ</h1>
          <p>Мы собрали всё, что уже известно, и отдельно отметили расчёты и данные, требующие подтверждения.</p>
        </div>
        <DataTag type="pending" />
      </div>
      <section className="order-car-summary">
        <img src={imageSource(car.image, IMAGE_WIDTH_TILE)} alt={car.title} onError={(event) => retryWithFullImage(event, car.image)} />
        <div>
          <h2>{car.title}</h2>
          <p>
            {number(car.mileage)} км · {powertrainName(car.type)} · {car.drive} привод
          </p>
        </div>
        <div className="order-source-price">
          <span>
            Цена в Китае <DataTag type="source" />
          </span>
          <b>{number(car.chinaPrice)} ¥</b>
          <small>≈ {money(price.chinaUsd, currency)} по расчётному курсу</small>
        </div>
      </section>
      <div className="order-layout">
        <div className="order-content">
          <section className="order-section">
            <div className="order-section-title">
              <div>
                <span>01</span>
                <h2>Предварительная стоимость</h2>
              </div>
              <DataTag type="calculated" />
            </div>
            <div className="order-cost-list">
              <div>
                <PriceLabel label="Автомобиль в Китае" description={`${number(car.chinaPrice)} ¥ · данные источника`} />
                <b>{money(price.chinaUsd, currency)}</b>
              </div>
              <div>
                <PriceLabel label="Выкуп и перевод денег" description="Платёжный агент и комиссии банка" />
                <b>{approximateMoney(price.buyoutLow, price.buyoutHigh, currency)}</b>
              </div>
              <div>
                <PriceLabel label="Логистика по Китаю" description={price.chinaLegNote} />
                <b>{approximateMoney(price.chinaLegLow, price.chinaLegHigh, currency)}</b>
              </div>
              <div>
                <PriceLabel label="Доставка до Минска" description={price.intlNote} />
                <b>{approximateMoney(price.intlLow, price.intlHigh, currency)}</b>
              </div>
              <div>
                <PriceLabel label="СВХ в Минске" description="Разгрузка и хранение до оформления" />
                <b>{approximateMoney(price.svhLow, price.svhHigh, currency)}</b>
              </div>
              <div>
                <PriceLabel label="Таможня и сборы" description={price.customsHint || price.customsNote} />
                <b>{approximateMoney(price.customsLow, price.customsHigh, currency)}</b>
              </div>
              {price.customsAlert && <p className={`price-customs-alert${price.customsAlertTone === "warn" ? " price-customs-alert-warn" : ""}`}>{price.customsAlert}</p>}
              <div>
                <PriceLabel label="Услуги abcars.by" description="Проверка, выкуп и документы" />
                <b>{money(price.serviceUsd, currency)}</b>
              </div>
            </div>
            <div className="order-grand-total">
              <PriceLabel label="Ориентировочно до Минска" description="Без постановки на учёт и страховки" />
              <b>≈ {money(price.totalUsd, currency)}</b>
            </div>
            <div className="order-disclaimer">
              <Info size={18} />
              <p>Курс НБРБ на {PRICING.rateDate}. Это предварительная модель, а не оферта. Итог меняется после подтверждения цены продавцом, VIN, маршрута и таможенных параметров.</p>
            </div>
          </section>
          <section className="order-section">
            <div className="order-section-title">
              <div>
                <span>02</span>
                <h2>Автомобиль</h2>
              </div>
              <DataTag type="source" />
            </div>
            <SourceGrid rows={vehicleRows} />
          </section>
          <section className="order-section">
            <div className="order-section-title">
              <div>
                <span>03</span>
                <h2>Батарея и запас хода</h2>
              </div>
              <DataTag type="source" />
            </div>
            <SourceGrid rows={batteryRows} />
          </section>
          <section className="order-section">
            <div className="order-section-title">
              <div>
                <span>04</span>
                <h2>Состояние по отчёту источника</h2>
              </div>
              <DataTag type="source" />
            </div>
            <SourceGrid rows={conditionRows} />
            {car.description && (
              <div className="source-description">
                <b>Комментарий из объявления</b>
                <p>{car.description}</p>
              </div>
            )}
            <p className="source-warning">
              <Info size={17} />
              Это заявление площадки и продавца, не независимая проверка abcars.by.
            </p>
          </section>
          <section className="order-section">
            <div className="order-section-title">
              <div>
                <span>05</span>
                <h2>Оснащение и ассистенты</h2>
              </div>
              <DataTag type="source" />
            </div>
            <SourceGrid rows={assistanceRows} />
          </section>
        </div>
        <aside className="order-progress">
          <div className="progress-card">
            <span>Статус заказа</span>
            <h3>Можно запускать проверку</h3>
            <ol>
              <li className="done">
                <Check size={15} />
                <p>
                  <b>Карточка источника найдена</b>
                </p>
              </li>
              <li className="done">
                <Check size={15} />
                <p>
                  <b>Данные и фото загружены</b>
                  <small>{car.images?.length || 1} оригинальных фото</small>
                </p>
              </li>
              <li>
                <span>3</span>
                <p>
                  <b>Подтверждение продавца</b>
                  <small>Наличие и актуальная цена</small>
                </p>
              </li>
              <li>
                <span>4</span>
                <p>
                  <b>VIN и экспорт</b>
                  <small>Документы и ограничения</small>
                </p>
              </li>
              <li>
                <span>5</span>
                <p>
                  <b>Независимая проверка</b>
                  <small>Кузов, батарея и диагностика</small>
                </p>
              </li>
            </ol>
            {!verificationOpen && (
              <button className="primary" onClick={() => setVerificationOpen(true)}>
                Запустить проверку <ArrowRight size={18} />
              </button>
            )}
            {verificationOpen && !saved && (
              <form className="verification-form" onSubmit={saveDraft}>
                <div className="modal-icon">
                  <ChatCircleText size={24} weight="duotone" />
                </div>
                <h4>Куда прислать результат?</h4>
                <p>Оставьте телефон или Telegram. Имя и другие данные сейчас не нужны.</p>
                <label>
                  Телефон или @username
                  <input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="+375 … или @telegram" required autoFocus />
                </label>
                <ConsentField checked={consent} onChange={(value) => { setConsent(value); if (value) setConsentError(""); }} error={consentError} />
                <button className="primary" type="submit" disabled={saving}>
                  {saving ? "Сохраняем…" : "Сохранить и продолжить"}
                </button>
                {saveError && <small className="form-error">{saveError}</small>}
                <small>Черновик и расчёт сохранятся в базе; объявление попадёт в приоритетную очередь перепроверки.</small>
              </form>
            )}
            {saved && (
              <div className="verification-saved">
                <CheckCircle size={42} weight="fill" />
                <h4>Черновик №{saved.id} сохранён</h4>
                <p>Заявка записана в базе, а актуальность объявления будет перепроверена в приоритетном порядке.</p>
              </div>
            )}
            <div className="progress-links">
              {sourceLink && (
                <a href={sourceLink} target="_blank" rel="noreferrer">
                  Оригинал объявления <ArrowRight size={16} />
                </a>
              )}
              <button onClick={() => navigate(carHref(car))}>Вернуться к автомобилю</button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

// Значки к этапам покупки; сами тексты — в src/service-copy.js, потому что теми же
// текстами заполняется страница для поисковика.
const purchaseStepIcons = [MagnifyingGlass, ChatCircleText, ShieldCheck, ListChecks, CarProfile];
const purchaseSteps = PURCHASE_STEPS.map((step, index) => ({ ...step, icon: purchaseStepIcons[index] }));

function HowItWorksPage({ navigate }) {
  const principleIcons = [ListChecks, ShieldCheck, Lightning];
  return (
    <main className="info-page">
      <section className="info-hero page-width">
        <div className="info-hero-copy">
          <button className="back-mobile" onClick={() => navigate("/")}>
            <ArrowLeft size={18} />
            На главную
          </button>
          <span className="info-eyebrow">О сервисе</span>
          <h1>Покупка авто из Китая — всё под контролем</h1>
          <p>Сначала проверка автомобиля и понятная смета. Только потом — решение о покупке, договор и оплата.</p>
          <div className="info-actions">
            <button className="primary" onClick={() => navigate("/catalog")}>
              Выбрать автомобиль <ArrowRight size={18} />
            </button>
          </div>
        </div>
        <div className="info-hero-visual">
          <Illustration src="/illustrations/how-it-works-hero.png" alt="Автомобиль из Китая с проверкой и доставкой" />
        </div>
      </section>
      <section className="info-proof page-width">
        <div>
          <ShieldCheck size={23} />
          <p>
            <b>Проверка до оплаты</b>
            <span>Сначала факты, затем решение</span>
          </p>
        </div>
        <div>
          <CurrencyCny size={23} />
          <p>
            <b>Прозрачная стоимость</b>
            <span>Разделяем цену и расчёт</span>
          </p>
        </div>
        <div>
          <MapPin size={23} />
          <p>
            <b>Сопровождение до Минска</b>
            <span>Один понятный маршрут</span>
          </p>
        </div>
      </section>
      <section className="info-section page-width" id="steps">
        <div className="info-section-heading">
          <span>Пять этапов</span>
          <h2>Что происходит после выбора автомобиля</h2>
          <p>На каждом шаге вы понимаете, что уже подтверждено, что проверяется и за что платите.</p>
        </div>
        <div className="process-list">
          {purchaseSteps.map(({ icon: Icon, title, text }, index) => (
            <article key={title}>
              <div className="process-number">{String(index + 1).padStart(2, "0")}</div>
              <div className="process-icon">
                <Icon size={24} weight="duotone" />
              </div>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="decision-section">
        <div className="page-width decision-grid">
          <div>
            <span className="info-eyebrow">До оформления</span>
            <h2>Вы принимаете решение на основе полной картины</h2>
            <p>Если автомобиль не проходит проверку или итоговые условия меняются, мы не подталкиваем к сделке — помогаем найти другой вариант.</p>
          </div>
          <div className="decision-card">
            <h3>До оплаты автомобиля вы получите</h3>
            <ul>
              <li>
                <CheckCircle size={19} weight="fill" />
                Подтверждение наличия и цены
              </li>
              <li>
                <CheckCircle size={19} weight="fill" />
                VIN и результаты проверки
              </li>
              <li>
                <CheckCircle size={19} weight="fill" />
                Итоговую смету с диапазонами
              </li>
              <li>
                <CheckCircle size={19} weight="fill" />
                Понятный план доставки
              </li>
            </ul>
          </div>
        </div>
      </section>
      {/* Наш подход и «чего мы не обещаем» переехали сюда с отдельной страницы «О нас»:
          у неё был тот же заголовок «О сервисе abcars.by», и обе страницы отвечали на
          один запрос. Тексты берём из src/service-copy.js — оттуда же их берёт разметка
          для поисковика, поэтому страница и её видимая роботу версия не разойдутся. */}
      <section className="info-section page-width">
        <div className="info-section-heading compact">
          <span>Наш подход</span>
          <h2>Прозрачность на каждом шаге</h2>
        </div>
        <div className="principles-grid">
          {ABOUT_PRINCIPLES.map(({ title, text }, index) => {
            const Icon = principleIcons[index];
            return (
              <article key={title}>
                <span>
                  <Icon size={25} weight="duotone" />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            );
          })}
        </div>
      </section>
      <section className="honesty-section page-width">
        <div>
          <span className="info-eyebrow">Важно</span>
          <h2>Чего мы не обещаем</h2>
        </div>
        <div className="honesty-list">
          {ABOUT_LIMITS.map(({ title, text }) => (
            <p key={title}>
              <X size={19} weight="bold" />
              <span>
                <b>{title}</b> {text}
              </span>
            </p>
          ))}
        </div>
      </section>
      <InfoCta navigate={navigate} title="Начните с подходящего автомобиля" text="В каталоге уже собраны объявления и предварительные расчёты до Минска." />
    </main>
  );
}

function DeliveredCarsPage({ navigate }) {
  return (
    <main className="delivered-page">
      <section className="delivered-hero page-width">
        <div>
          <button className="back-mobile" onClick={() => navigate("/")}><ArrowLeft size={18} />На главную</button>
          <span className="info-eyebrow">Доставленные автомобили</span>
          <h1>Истории, в которых виден весь путь автомобиля</h1>
          <p>Показываем не только результат, но и сроки, маршрут, итоговую стоимость и решения, принятые после проверки.</p>
          <button className="primary" onClick={() => navigate("/catalog")}>Подобрать автомобиль <ArrowRight size={18} /></button>
        </div>
        <aside className="delivered-summary" aria-label="Результаты работы компании">
          {DELIVERY_STATS.map((item) => <div key={item.label}><b>{item.value}</b><span>{item.label}</span></div>)}
        </aside>
      </section>

      <section className="delivery-cases page-width">
        <div className="delivery-cases-heading">
          <span className="info-eyebrow">Последние выдачи</span>
          <h2>От выбора объявления до ключей</h2>
          <p>Каждый кейс показывает, что было важно клиенту и как выглядел результат.</p>
        </div>
        <div className="delivery-case-list">
          {DELIVERY_CASES.map((item, index) => (
            <article className="delivery-case" key={item.id}>
              <div className="delivery-case-image">
                <Illustration src={`cars/${item.image}`} alt={item.vehicle} />
                <span>{item.delivered}</span>
              </div>
              <div className="delivery-case-content">
                <span className="delivery-case-number">Кейс {String(index + 1).padStart(2, "0")}</span>
                <h3>{item.vehicle}</h3>
                <p>{item.summary}</p>
                <div className="delivery-case-facts">
                  <div><MapPin size={19} weight="duotone" /><span>Маршрут<b>{item.route}</b></span></div>
                  <div><Clock size={19} weight="duotone" /><span>До выдачи<b>{item.duration} дня</b></span></div>
                  <div><Gauge size={19} weight="duotone" /><span>Пробег<b>{item.mileage}</b></span></div>
                  <div><CurrencyCny size={19} weight="duotone" /><span>Итого до Минска<b>{item.total}</b></span></div>
                </div>
                <blockquote>«{item.quote}»<footer>{item.client}</footer></blockquote>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="case-proof-section">
        <div className="page-width case-proof-grid">
          <div><CheckCircle size={23} weight="fill" /><span><b>Смета до договора</b><small>Расходы разбиты по этапам</small></span></div>
          <div><ShieldCheck size={23} weight="fill" /><span><b>Проверка до оплаты</b><small>Состояние, история и батарея</small></span></div>
          <div><CarProfile size={23} weight="fill" /><span><b>Выдача в Минске</b><small>Документы и сопровождение</small></span></div>
        </div>
      </section>
      <InfoCta navigate={navigate} title="Подберём автомобиль под ваш запрос" text="Начните с каталога или свяжитесь с нами — обсудим бюджет, кузов и желаемые сроки." />
    </main>
  );
}

function PaymentAndContractPage({ navigate }) {
  return (
    <main className="purchase-info-page">
      <section className="purchase-info-hero page-width">
        <div>
          <button className="back-mobile" onClick={() => navigate(-1)}><ArrowLeft size={18} />Назад</button>
          <span className="info-eyebrow">Оплата и договор</span>
          <h1>Сначала понятные условия, затем деньги</h1>
          <p>Разбиваем расчёт на этапы и отделяем стоимость автомобиля от услуг, логистики и обязательных платежей.</p>
        </div>
        <aside className="agreement-preview">
          <span><ListChecks size={25} weight="duotone" /></span>
          <small>До первой крупной оплаты</small>
          <h2>В договоре уже зафиксировано</h2>
          <ul>
            <li><Check size={17} weight="bold" />Конкретный автомобиль и VIN</li>
            <li><Check size={17} weight="bold" />Состав и стоимость услуг</li>
            <li><Check size={17} weight="bold" />Порядок платежей и отказа</li>
            <li><Check size={17} weight="bold" />Ответственность каждой стороны</li>
          </ul>
        </aside>
      </section>

      <section className="payment-stages page-width">
        <div className="purchase-section-heading">
          <span className="info-eyebrow">Четыре платежных этапа</span>
          <h2>Вы платите по мере выполнения работы</h2>
          <p>Следующий платёж появляется только после подтверждения предыдущего этапа документами и согласования с вами.</p>
        </div>
        <div className="payment-stage-list">
          {PAYMENT_STAGES.map((stage) => (
            <article key={stage.number}>
              <b className="payment-stage-number">{stage.number}</b>
              <div><h3>{stage.title}</h3><p>{stage.description}</p></div>
              <dl><div><dt>Оплата</dt><dd>{stage.payment}</dd></div><div><dt>Когда</dt><dd>{stage.timing}</dd></div></dl>
            </article>
          ))}
        </div>
      </section>

      <section className="purchase-notice-section">
        <div className="page-width purchase-notice">
          <Info size={24} weight="duotone" />
          <div><h2>Предварительный расчёт на сайте — не счёт на оплату</h2><p>Финальная смета формируется после подтверждения объявления, комплектации, маршрута и курса. Любое изменение согласуется до платежа.</p></div>
          <button className="secondary" onClick={() => navigate("/faq")}>Частые вопросы <ArrowRight size={17} /></button>
        </div>
      </section>
      <InfoCta navigate={navigate} title="Начните с предварительного расчёта" text="Выберите автомобиль — покажем структуру цены и объясним каждый платёж до договора." />
    </main>
  );
}

function GuaranteesPage({ navigate }) {
  return (
    <main className="purchase-info-page">
      <section className="guarantees-hero page-width">
        <div>
          <button className="back-mobile" onClick={() => navigate(-1)}><ArrowLeft size={18} />Назад</button>
          <span className="info-eyebrow">Гарантии и ответственность</span>
          <h1>Не обещаем невозможного. Фиксируем то, за что отвечаем</h1>
          <p>Подержанный автомобиль нельзя сделать новым обещанием. Поэтому мы разделяем проверку, риски продавца, перевозку и собственную ответственность.</p>
        </div>
        <aside className="guarantee-principle-card">
          <ShieldCheck size={34} weight="duotone" />
          <h2>Главный принцип</h2>
          <p>Если важный факт не подтверждён документом, диагностикой или договором, мы не называем его гарантией.</p>
        </aside>
      </section>

      <section className="responsibility-section page-width">
        <div className="purchase-section-heading">
          <span className="info-eyebrow">Карта ответственности</span>
          <h2>Что происходит в спорной ситуации</h2>
          <p>Заранее показываем, кто отвечает за следующий шаг и какой результат получает клиент.</p>
        </div>
        <div className="responsibility-table">
          <div className="responsibility-head"><span>Ситуация</span><span>Ответственная сторона</span><span>Что делаем</span></div>
          {RESPONSIBILITY_ITEMS.map((item) => <div className="responsibility-row" key={item.title}><b>{item.title}</b><span>{item.owner}</span><p>{item.result}</p></div>)}
        </div>
      </section>

      <section className="guarantee-boundaries">
        <div className="page-width guarantee-boundaries-grid">
          <div><CheckCircle size={24} weight="fill" /><h3>Что гарантируем</h3><p>Выполнение согласованной проверки, корректное оформление документов, прозрачность платежей и сопровождение на всём маршруте.</p></div>
          <div><X size={24} weight="bold" /><h3>Чего не обещаем</h3><p>Будущее техническое состояние подержанного автомобиля, неизменность внешних тарифов и отсутствие задержек на границе.</p></div>
        </div>
      </section>
      <InfoCta navigate={navigate} title="Обсудим риски до выбора автомобиля" text="Покажем пример проверки, договора и сметы — без обязательства оформлять заказ." />
    </main>
  );
}

function FaqPage({ navigate }) {
  const [openItem, setOpenItem] = useState("0-0");
  return (
    <main className="faq-page page-width">
      <section className="faq-hero">
        <div>
          <button className="back-mobile" onClick={() => navigate(-1)}><ArrowLeft size={18} />Назад</button>
          <span className="info-eyebrow">Вопросы и ответы</span>
          <h1>Коротко о важном до заказа</h1>
          <p>Собрали ответы о проверке, цене, оплате, доставке и ответственности.</p>
        </div>
        <aside><ChatCircleText size={28} weight="duotone" /><b>Не нашли ответ?</b><p>Напишите нам — разберём вашу ситуацию без обязательства оформлять заказ.</p><button className="secondary" onClick={() => navigate("/contacts")}>Связаться с нами</button></aside>
      </section>
      <section className="faq-groups">
        {FAQ_GROUPS.map((group, groupIndex) => (
          <div className="faq-group" key={group.title}>
            <h2>{group.title}</h2>
            <div>
              {group.items.map((item, itemIndex) => {
                const itemKey = `${groupIndex}-${itemIndex}`;
                const open = openItem === itemKey;
                return <article className={open ? "open" : ""} key={item.question}><button type="button" aria-expanded={open} onClick={() => setOpenItem(open ? null : itemKey)}><span>{item.question}</span><b aria-hidden="true">{open ? "−" : "+"}</b></button><div className="animated-disclosure" aria-hidden={!open}><div><p>{item.answer}</p></div></div></article>;
              })}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

function ContactsPage({ navigate, theme }) {
  const mapSrc = `https://yandex.ru/map-widget/v1/?ll=27.512217%2C53.922078&pt=27.512217%2C53.922078%2Cpmrdm&z=16${theme === "dark" ? "&theme=dark" : ""}`;
  return (
    <main className="contact-page">
      <section className="contact-hero page-width">
        <div className="contact-hero-copy">
          <button className="back-mobile" onClick={() => navigate("/")}>
            <ArrowLeft size={18} />
            На главную
          </button>
          <span className="info-eyebrow">Контакты</span>
          <h1>Расскажем о процессе и ответим на ваши вопросы</h1>
          <p className="contact-office-summary">
            <span>Среднее время ответа — 10 минут</span>
          </p>
          <div className="info-actions">
            <a className="primary contact-telegram-cta" href={COMPANY.telegramUrl} target="_blank" rel="noreferrer">
              Написать нам в Telegram <ArrowRight size={18} />
            </a>
          </div>
        </div>
        <div className="info-hero-visual">
          <Illustration src="/illustrations/contact-hero.png" alt="Чай, архитектура Китая и деловые принадлежности" />
        </div>
      </section>

      <section className="contact-options page-width" aria-label="Способы связи">
        <a href={COMPANY.telegramUrl} target="_blank" rel="noreferrer">
          <TelegramLogo size={24} weight="duotone" />
          <span><small>Написать в Telegram</small><b>{COMPANY.telegram}</b><em>Обычно отвечаем за 10 минут</em></span>
        </a>
        <a href={`mailto:${COMPANY.email}`}>
          <EnvelopeSimple size={24} weight="duotone" />
          <span><small>Электронная почта</small><b>{COMPANY.email}</b><em>Документы и деловые вопросы</em></span>
        </a>
      </section>

      <section className="contact-map page-width" aria-label="Офис abcars.by на карте">
        <iframe
          key={theme}
          src={mapSrc}
          title="Офис abcars.by на Яндекс Картах"
          loading="lazy"
          allowFullScreen
        />
      </section>

      <section className="company-details-section">
        <div className="page-width company-details-grid">
          <div>
            <span className="info-eyebrow">Реквизиты</span>
            <h2>Фиксируем все детали договором</h2>
            <p>Перед оплатой фиксируем выбранный автомобиль, состав услуг, порядок расчётов и ответственность сторон.</p>
          </div>
          <dl className="company-details" id="details">
            <div><dt>Юридическое лицо</dt><dd>{COMPANY.legalName}</dd></div>
            <div><dt>Юридический адрес</dt><dd>{COMPANY.address}</dd></div>
            <div><dt>Банк</dt><dd>{COMPANY.bank}</dd></div>
            <div><dt>BIC</dt><dd>{COMPANY.bic}</dd></div>
          </dl>
        </div>
      </section>
    </main>
  );
}


/* Страницы-инструменты: квота, растаможка, стоимость доставки, калькулятор. Верстка
   такая же, как у обзоров моделей, — блоки в блоках: под заголовком полоса главных
   цифр, следом живой блок с расчётом, дальше разделы с вложенными списками, врезками
   и карточками сравнения, в конце частые вопросы и переходы к остальным расчётам.
   Раньше это были простыни абзацев, как у юридических страниц.

   Тексты, разделы и живые цифры лежат в src/tool-pages.js, оттуда же их берёт
   страница для поисковика: два места писали бы по-разному. */
function ToolPage({ tool, navigate }) {
  const stats = toolPageStats(tool.kind);
  // Тексты страницы лежат отдельным файлом (см. src/tool-page-text-load.js).
  // По прямой ссылке они уже загружены до запуска приложения (src/main.jsx);
  // при переходе внутри сайта доезжают за долю секунды, и до этого страница
  // рисуется с заголовком и цифрами, но без текстовых разделов.
  const [allTexts, setAllTexts] = useState(loadedToolPageTexts);
  useEffect(() => {
    if (!allTexts) loadToolPageTexts().then(setAllTexts).catch(() => null);
  }, [allTexts]);
  const texts = allTexts?.[tool.path] || { intro: [], sections: [], faq: [], disclaimer: "" };
  // Текст разрываем примерно посередине, как в обзорах моделей: между половинами
  // встаёт блок про сервис.
  const splitAt = Math.ceil(texts.sections.length / 2);
  const firstSections = texts.sections.slice(0, splitAt);
  const restSections = texts.sections.slice(splitAt);
  // Шаг назад работает, только если на страницу пришли с другой страницы сайта. По
  // прямой ссылке из поиска возвращаться некуда — ведём на главную.
  const goBack = () => (window.history.length > 1 && window.history.state?.fromPath ? navigate(-1) : navigate("/"));
  // Пока журнал выключен, страница расчёта выглядит как прежде: текст по центру и
  // кружок «назад» слева. С журналом у неё появляется то же боковое меню, что у
  // материалов, — чтобы переход «журнал → расчёт → журнал» не терял навигацию. Кружок
  // «назад» в этом виде убран: слева от текста больше нет свободного поля, а его роль
  // берут хлебные крошки.
  const withAside = BLOG_ENABLED;
  const reading = (
      <div className="model-page-reading">
        {!withAside && (
        <div className="model-page-back-rail">
          <button type="button" className="model-page-back" aria-label="Назад" onClick={goBack}>
            <ArrowLeft size={24} />
          </button>
        </div>
        )}
        <div className="model-page-body page-width">
          <section className="model-page-hero">
            <div className="model-page-hero-copy">
              {/* Та же строка над заголовком, что у материалов журнала: название
                  раздела ссылкой назад в журнал. */}
              {withAside && (
                <span className="blog-article-meta">
                  <AppLink href={BLOG_INDEX.path} navigate={navigate}>Расчёты</AppLink>
                </span>
              )}
              <h1>{tool.h1}</h1>
              <p>{tool.lead}</p>
            </div>
          </section>
          <article className="model-page-article">
            <div className="model-page-intro">
              {texts.intro.map((text) => <p key={text.slice(0, 40)}>{text}</p>)}
            </div>
            {/* Полоса главных цифр сразу под вступлением: то, за чем приходят, видно
                не вчитываясь. У калькулятора её нет — там сразу форма. */}
            {stats.length > 0 && (
              <div className="model-page-numbers">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
        {/* Сам инструмент — отдельным блоком: за живой цифрой квоты, примером платежа
            и расчётом сюда и приходят, объяснения читают уже потом. */}
        <div className="model-page-body page-width">
          <article className="model-page-article">
            {tool.kind === "quota" && <QuotaFigures />}
            {tool.kind === "customs" && <ToolPageTable table={customsExample()} />}
            {tool.kind === "cost" && <ToolPageTable table={deliveryStages()} />}
            {tool.kind === "calculator" && <LandedCostCalculator />}
          </article>
        </div>
        <div className="model-page-body page-width">
          <article className="model-page-article">
            {firstSections.map((section) => <ModelPageSection key={section.title} section={section} navigate={navigate} />)}
          </article>
        </div>
        <ModelPagePromo navigate={navigate} />
        {restSections.length > 0 && (
          <div className="model-page-body page-width">
            <article className="model-page-article">
              {restSections.map((section) => <ModelPageSection key={section.title} section={section} navigate={navigate} />)}
            </article>
          </div>
        )}
        <ArticleFaq faq={texts.faq} title="Частые вопросы" />
      </div>
  );
  if (!withAside) {
    return (
      <main className="model-page tool-page">
        {reading}
        <ToolPageLinks tool={tool} navigate={navigate} />
        <p className="model-page-disclaimer page-width">{texts.disclaimer}</p>
      </main>
    );
  }
  return (
    <main className="model-page tool-page tool-page-aside blog-page page-width">
      {/* Крошки ведут через журнал, а не сразу на главную: расчёты — его раздел,
          и обратный путь должен это показывать. */}
      <div className="breadcrumbs">
        <button onClick={() => goBackTo(navigate, "/")}>Главная</button>
        <CaretRight size={13} />
        <button onClick={() => goBackTo(navigate, BLOG_INDEX.path)}>{BLOG_INDEX.name}</button>
        <CaretRight size={13} />
        {tool.name}
      </div>
      <BlogMasthead navigate={navigate} />
      <div className="blog-layout">
        {/* Всё содержимое страницы лежит в колонке сетки, включая переходы к другим
            расчётам и оговорку: иначе они тянулись бы во всю ширину страницы и не
            совпадали бы по краям с текстом выше. */}
        <div className="blog-main">
          {reading}
          <ToolPageLinks tool={tool} navigate={navigate} />
          <p className="model-page-disclaimer">{texts.disclaimer}</p>
        </div>
        <BlogSidebar navigate={navigate} currentPath={tool.path} />
      </div>
    </main>
  );
}

/* Таблица-карточки: первая ячейка строки становится заголовком, остальные читаются
   как «свойство — значение». Так же показаны версии в обзорах моделей: настоящая
   таблица на телефоне уезжала в боковую прокрутку. */
function ToolPageTable({ table }) {
  return (
    <section className="model-page-versions">
      <h2>{table.title}</h2>
      <div className="model-page-versions-cards">
        {table.rows.map((row) => (
          <div key={row[0]}>
            <strong>{row[0]}</strong>
            <dl>
              {table.columns.slice(1).map((column, index) => (
                <div key={column}>
                  <dt>{column}</dt>
                  <dd>{row[index + 1]}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="model-page-versions-note">{table.note}</p>
    </section>
  );
}

/* Переходы к остальным расчётам в конце страницы: человек, который считал доставку,
   почти всегда идёт потом смотреть растаможку или квоту. */
function ToolPageLinks({ tool, navigate }) {
  return (
    <section className="tool-page-links page-width" aria-labelledby="tool-page-links-title">
      <h2 id="tool-page-links-title">Другие расчёты</h2>
      <div className="tool-page-links-list">
        {TOOL_PAGES.filter((page) => page.path !== tool.path).map((page) => (
          <AppLink key={page.path} href={page.path} navigate={navigate}>
            <strong>{page.name}</strong>
            <p>{page.lead}</p>
            <span>Открыть <ArrowRight size={16} /></span>
          </AppLink>
        ))}
      </div>
    </section>
  );
}

/* Живые цифры квоты: остаток с полосой расхода, темп и прогноз, остаток по месяцам и
   история сводок таможни. Данные обновляет ежедневная задача в src/ev-quota.js —
   здесь только показ. */
function QuotaFigures() {
  const state = evQuotaState();
  const businessQuota = evQuotaState({ audience: "business" });
  const rows = [...EV_QUOTA.reports].reverse().slice(0, 12);
  const usedPercent = Math.min(100, Math.max(2, Math.round(state.usedShare * 100)));
  // Прогноз обещаем только пока он правда: на исчерпанной квоте и на устаревшей
  // сводке вместо даты стоит честное объяснение.
  const forecast = state.exhausted
    ? `Квота выбрана${state.exhaustedOnLabel ? ` ${state.exhaustedOnLabel}` : ""}: к цене каждого электромобиля добавляется ввозная пошлина 15%.`
    : state.stale || state.overdue
      ? "Свежей сводки таможни пока нет, поэтому прогноз мог сдвинуться. Цифра выше — последняя официальная."
      : `При таком темпе квота заканчивается около ${state.runsOutLabel}, а дальше к цене каждого электромобиля добавляется ввозная пошлина 15%.`;
  return (
    <section className="tool-live">
      <h2>Сколько осталось сейчас</h2>
      <div className="tool-live-figure">
        <div className="tool-live-main">
          <span>Осталось у граждан</span>
          <strong>{number(state.remaining)}</strong>
          <small>из {number(state.total)} по квоте {EV_QUOTA.year} года · сводка на {state.asOfLabel}</small>
          {/* Полоса заполняется израсходованным: почти полная — значит квота на исходе. */}
          <i className="tool-live-bar" aria-hidden="true">
            <b style={{ width: `${usedPercent}%` }} />
          </i>
          <small>Выбрано {number(state.spent)} {pluralRu(state.spent, "машина", "машины", "машин")} — это {usedPercent}% квоты для граждан</small>
        </div>
        <dl className="tool-live-side">
          <div>
            <dt>Темп расхода</dt>
            <dd>{state.perWeek ? `≈ ${number(state.perWeek)} машин в неделю` : "по сводкам не считается"}</dd>
          </div>
          <div>
            <dt>Хватит примерно до</dt>
            <dd>{state.exhausted ? "квота выбрана" : state.runsOutLabel && !state.overdue && !state.stale ? state.runsOutLabel : "нужна свежая сводка"}</dd>
          </div>
          <div>
            <dt>Квота юрлиц</dt>
            <dd>{businessQuota.exhausted ? `выбрана${businessQuota.exhaustedOnLabel ? ` ${businessQuota.exhaustedOnLabel}` : ""}` : `осталось ${number(businessQuota.remaining)}`}</dd>
          </div>
        </dl>
      </div>
      <p className="tool-live-forecast">{forecast}</p>
      <div className="tool-live-months">
        <h3>Остаток по месяцам</h3>
        <ul>
          {state.periods.map((period) => (
            <li key={period.key} className={period.future ? "future" : undefined}>
              <span>{period.label}</span>
              <strong>{period.left == null ? "—" : number(period.left)}</strong>
            </li>
          ))}
        </ul>
      </div>
      <div className="tool-live-table">
        <h3>История сводок таможни</h3>
        <table className="quota-history">
          <thead>
            <tr><th scope="col">Дата сводки</th><th scope="col">Осталось у граждан</th><th scope="col">Осталось у юрлиц</th></tr>
          </thead>
          <tbody>
            {rows.map(([date, personal, business]) => (
              <tr key={date}>
                <th scope="row">{date}</th>
                <td>{personal === null ? "не названо" : number(personal)}</td>
                <td>{business === null ? "не названо" : number(business)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tool-live-source">Источник — недельные сводки Государственного таможенного комитета.</p>
      </div>
    </section>
  );
}

// Варианты ответов калькулятора. Списки отдельно от разметки: те же значения нужны
// и в расчёте, и в подписях, а город приходит кодом, а не названием.
// Четыре типа двигателя. У гибрида с генератором (Li Auto, AITO и другие, где
// бензиновый мотор не связан с колёсами) таможня считает не по объёму двигателя,
// а от стоимости машины. Бензин и дизель считаются одинаково — по объёму и
// возрасту, поэтому отдельного пункта под дизель не нужно.
const CALC_KINDS = ["Электромобиль", "Гибрид с розеткой", "Гибрид с генератором", "Бензин или дизель"];
const CALC_YEARS = ["2026", "2025", "2024", "2023", "2022", "2021", "2020"];
// Объёмы до 4,4 л: у бензиновых машин каталога встречаются и такие моторы, а
// ставка за кубический сантиметр растёт ступенями до трёх литров и выше.
const CALC_ENGINES = ["1,0", "1,4", "1,5", "1,6", "1,8", "2,0", "2,5", "3,0", "3,5", "4,4"];
const CALC_CITIES = [["guangzhou", "Гуанчжоу"], ["shanghai", "Шанхай"], ["beijing", "Пекин"], ["chengdu", "Чэнду"], ["urumqi", "Урумчи"], ["haerbin", "Харбин"]];

/* Калькулятор: собирает из ответов «машину» и считает её тем же расчётом, что и
   карточка каталога. Отдельной механики расчёта здесь нет — иначе калькулятор и
   каталог разошлись бы в цифрах. Поля, итог и разбивка по этапам — три вложенных
   блока: итог читают первым, этапы лежат рядом.

   Списки выбора — те же, что в фильтрах каталога: свой вид у выпадающего списка на
   одной странице сразу выбивался бы из сайта. */
function LandedCostCalculator() {
  const [priceUsd, setPriceUsd] = useState("20000");
  const [kind, setKind] = useState(CALC_KINDS[0]);
  const [year, setYear] = useState("2023");
  const [engine, setEngine] = useState("1,5");
  const [sellerCity, setSellerCity] = useState(CALC_CITIES[0][1]);
  const [bigCar, setBigCar] = useState(false);
  const price = Number(priceUsd) || 0;
  const byGenerator = kind === "Гибрид с генератором";
  const type = kind === "Электромобиль" ? "Электромобиль" : kind === "Бензин или дизель" ? "ДВС" : "Гибрид";
  const city = (CALC_CITIES.find(([, label]) => label === sellerCity) || CALC_CITIES[0])[0];
  // Объём двигателя расчёт узнаёт по строке вида «1.5L»: без буквы он считал бы любую
  // машину полуторалитровой, и выбор объёма в калькуляторе ничего бы не менял.
  const engineSpec = type === "Электромобиль" || byGenerator ? "" : `${engine.replace(",", ".")}L`;
  const estimate = price > 0
    ? estimateLandedCost({ source: "Che168", usdPrice: price, chinaPrice: 0, type, sourceFuelType: byGenerator ? "Range Extender" : null, year: Number(year) || 2023, engine: engineSpec, city, curbWeight: bigCar ? 2300 : 1500 })
    : null;
  const rows = estimate
    ? [
        ["Автомобиль у продавца", estimate.chinaUsd, null],
        ["Выкуп и перевод денег", null, [estimate.buyoutLow, estimate.buyoutHigh]],
        ["Документы и плечо в Китае", null, [estimate.chinaLegLow, estimate.chinaLegHigh]],
        ["Автовоз до Минска", null, [estimate.intlLow, estimate.intlHigh]],
        ["Таможня и оформление", null, [estimate.customsLow, estimate.customsHigh]],
        ["Склад в Минске", null, [estimate.svhLow, estimate.svhHigh]],
        ["Наши услуги", estimate.serviceUsd, null],
      ]
    : [];
  return (
    <section className="cost-calculator">
      <h2>Посчитать</h2>
      <div className="cost-calculator-form">
        <label className="cost-calculator-field">
          <span>Цена у продавца, $</span>
          <input type="number" inputMode="numeric" min="1000" step="500" value={priceUsd} onChange={(event) => setPriceUsd(event.target.value)} />
        </label>
        {/* У списков подпись — обычный текст, а не <label>: нажимать в этой строке
            нечего, выбор открывает сама кнопка списка. */}
        <div className="cost-calculator-field">
          <span>Тип двигателя</span>
          <SelectField className="cost-calculator-select" label="Тип двигателя" value={kind} options={CALC_KINDS} onChange={setKind} />
        </div>
        <div className="cost-calculator-field">
          <span>Год выпуска</span>
          <SelectField className="cost-calculator-select" label="Год выпуска" value={year} options={CALC_YEARS} onChange={setYear} />
        </div>
        {type !== "Электромобиль" && !byGenerator && (
          <div className="cost-calculator-field">
            <span>Объём двигателя</span>
            <SelectField className="cost-calculator-select" label="Объём двигателя" value={engine} options={CALC_ENGINES} onChange={setEngine} formatOption={(item) => `${item} л`} />
          </div>
        )}
        <div className="cost-calculator-field">
          <span>Город продавца</span>
          <SelectField className="cost-calculator-select" label="Город продавца" value={sellerCity} options={CALC_CITIES.map(([, label]) => label)} onChange={setSellerCity} />
        </div>
        {/* Крупный кузов — такой же переключатель, как «Быстрый просмотр» и «Цены
            с квотами»: обычная галочка была единственной на сайте. */}
        <label className="quick-view-toggle cost-calculator-toggle">
          <input type="checkbox" role="switch" checked={bigCar} onChange={(event) => setBigCar(event.target.checked)} />
          <span className="quick-view-toggle-track" aria-hidden="true">
            <i />
          </span>
          <span className="quick-view-toggle-label">Крупный кузов: длиннее 4,95 м или тяжелее 2,3 т</span>
        </label>
      </div>
      {estimate ? (
        <div className="cost-calculator-result">
          <div className="cost-calculator-total">
            <span>Итого до Минска</span>
            <strong>{number(estimate.totalLow)}–{number(estimate.totalHigh)} $</strong>
            <small>Ориентир — около {number(estimate.totalUsd)} $. {estimate.customsNote}.</small>
          </div>
          <dl className="cost-calculator-rows">
            {rows.map(([label, single, range]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{single !== null ? `${number(single)} $` : `${number(range[0])}–${number(range[1])} $`}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p>Укажите цену у продавца, чтобы увидеть расчёт.</p>
      )}
    </section>
  );
}

function LegalPage({ navigate, kind }) {
  const content = LEGAL_COPY[kind];
  return (
    <main className="legal-page page-width">
      <button className="back-mobile" onClick={() => navigate(-1)}><ArrowLeft size={18} />Назад</button>
      <span className="info-eyebrow">{content.eyebrow}</span>
      <h1>{content.title}</h1>
      <p className="legal-intro">{content.intro}</p>
      <div className="legal-sections">
        {content.sections.map(([title, text]) => <section key={title}><h2>{title}</h2><p>{text}</p></section>)}
      </div>
      <p className="legal-updated">Редакция от 15 августа 2026 года</p>
    </main>
  );
}

// ── Журнал: подборки на главной, общая страница и страница материала ──────────
//
// Подборка — это статья и живой список машин по правилу отбора (см. src/blog-posts.js).
// Список и цифры в тексте берутся из каталога в момент открытия страницы, поэтому
// страница не устаревает между выкладками сайта.
//
// Весь раздел закрыт выключателем BLOG_ENABLED: пока он выключен, блока на главной
// нет, ссылки в подвале нет, а адреса /blog и /blog/… отвечают «страницы нет».

// Сколько машин показываем на странице подборки.
const BLOG_POST_CARS_LIMIT = 12;

/** Текст материала: подгружается отдельным файлом, как тексты обзоров моделей. */
function useBlogText(slug) {
  const [text, setText] = useState(() => loadedBlogText(slug));
  useEffect(() => {
    const ready = loadedBlogText(slug);
    setText(ready);
    if (ready) return undefined;
    let alive = true;
    loadBlogText(slug).then((loaded) => {
      if (alive) setText(loaded);
    });
    return () => {
      alive = false;
    };
  }, [slug]);
  return text;
}

/** Живой срез каталога по правилу отбора подборки. */
function useCollectionCars(post, { limit = BLOG_POST_CARS_LIMIT } = {}) {
  const [cars, setCars] = useState([]);
  const [total, setTotal] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const query = post ? String(blogListParams(post, limit)) : null;
  useEffect(() => {
    if (!query) return undefined;
    const controller = new AbortController();
    setCars([]);
    setTotal(null);
    setRefreshedAt(null);
    setLoading(true);
    setFailed(false);
    fetch(`/api/cars?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("collection unavailable"))))
      .then((catalog) => {
        setCars(catalog.items.map(normalizeImportedCar));
        setTotal(catalog.total);
        setRefreshedAt(catalog.refreshedAt || null);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);
  return { cars, total, refreshedAt, loading, failed };
}

/**
 * Края подборки: самая доступная машина и та, которой подборка хвалится, — самая
 * дальнобойная, самая быстрая или самая свежая. Из них берутся вторая и третья
 * цифры в полосе.
 *
 * Отдельными запросами, а не по показанному списку: список идёт «в разнобой», по одной
 * машине на модель, и края по нему посчитались бы по двенадцати случайным объявлениям.
 * Запросы крошечные — по одной строке, — и сервер отдаёт их из общего кэша.
 */
function useCollectionEdges(post) {
  const [edges, setEdges] = useState({ priceFromUsd: null, highlight: null });
  const cheapestQuery = post ? String(blogApiParams(post, { sort: "price_asc", limit: 1 })) : null;
  const highlightSort = blogHighlightSort(post);
  // Берём пять машин, а не одну: у части объявлений главная цифра не заполнена
  // (пробег стоит нулём, разгон не указан), и первая строка выборки может её не иметь.
  const highlightQuery = highlightSort ? String(blogApiParams(post, { sort: highlightSort, limit: 5 })) : null;
  useEffect(() => {
    if (!cheapestQuery) return undefined;
    const controller = new AbortController();
    setEdges({ priceFromUsd: null, highlight: null });
    const load = (query) =>
      query
        ? fetch(`/api/cars?${query}`, { signal: controller.signal })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error("collection edge unavailable"))))
            .then((catalog) => catalog.items.map(normalizeImportedCar))
        : Promise.resolve([]);
    Promise.all([load(cheapestQuery), load(highlightQuery)])
      .then(([cheapestCars, notableCars]) => {
        const cheapest = cheapestCars[0] || null;
        // Первая машина, у которой главная цифра вообще есть.
        const notable = notableCars.find((car) => blogHighlight(post, car)) || null;
        setEdges({
          priceFromUsd: cheapest ? estimateLandedCost(cheapest).totalUsd : null,
          highlight: blogHighlight(post, notable),
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [cheapestQuery, highlightQuery]);
  return edges;
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
  const [cover, setCover] = useState({ car: null, refreshedAt: null });
  const query = post ? String(blogApiParams(post, { sort: "price_desc", limit: 1 })) : null;
  useEffect(() => {
    if (!query) return undefined;
    const controller = new AbortController();
    fetch(`/api/cars?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("collection cover unavailable"))))
      // Тем же ответом приходит дата последней проверки каталога — она и стоит на
      // карточке. Отдельный запрос ради даты не нужен.
      .then((catalog) => setCover({ car: catalog.items.length ? normalizeImportedCar(catalog.items[0]) : null, refreshedAt: catalog.refreshedAt || null }))
      .catch(() => {});
    return () => controller.abort();
  }, [query]);
  return cover;
}

// ── Переход в журнал с выбранным разделом ─────────────────────────────────────
// Отдельных адресов у фильтров журнала нет намеренно (десяток почти пустых страниц
// поисковику вредит), поэтому выбранный раздел передаём не адресом, а одноразовым
// намерением: нажали «Подборки» в статье — журнал открылся уже с этим фильтром.
let blogFilterIntent = null;
const openBlogWithFilter = (navigate, filter) => {
  blogFilterIntent = filter;
  navigate(BLOG_INDEX.path);
};
/** Забирает намерение и сразу его гасит: оно действует на один переход. */
const takeBlogFilterIntent = () => {
  const filter = blogFilterIntent;
  blogFilterIntent = null;
  return filter;
};

/**
 * Переход по хлебным крошкам назад. Если на страницу пришли именно оттуда, куда ведёт
 * крошка, делаем шаг назад по истории: тогда прежняя страница открывается на том же
 * месте, где её оставили, — главная у блока подборок, журнал у той же карточки. Пришли
 * иначе (по ссылке из поиска, из мессенджера) — возвращаться некуда, обычный переход.
 */
const goBackTo = (navigate, path) => {
  if (window.history.length > 1 && window.history.state?.fromPath === path) navigate(-1);
  else navigate(path);
};

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
            <a key={id} role="menuitem" href={href(shareUrl, post.name)} target="_blank" rel="noreferrer noopener" onClick={() => setOpen(false)}>
              <span className="select-option-label">
                <Icon size={17} />
                <span>{name}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Карточка материала: обложка, метки, название, дата и «поделиться». */
function BlogCollectionCard({ post, navigate }) {
  // У сравнения нет одного правила отбора, поэтому и обложка у него своя: два кадра
  // вместо одного. Разные виды материалов различаются уже в сетке журнала.
  return post.kind === "duel" ? <BlogDuelCard post={post} navigate={navigate} /> : <BlogCollectionCoverCard post={post} navigate={navigate} />;
}

/**
 * Общая часть карточки: снимок с метками, название, дата и «поделиться». Карточка
 * сравнения такая же, как у подборки, — отличается только обложкой: два кадра вместо
 * одного. Широкую карточку на две колонки пробовали и отказались: в сетке журнала все
 * карточки одного размера.
 */
function BlogCardShell({ post, navigate, cover, refreshedAt }) {
  const tags = blogPostTags(post);
  // На карточке дата стоит сама по себе, поэтому пишем её по-человечески: «Сегодня»,
  // «Вчера», «5 дней назад», а после недели — обычную дату.
  const date = blogRelativeDateSentence(blogUpdatedAt(post, refreshedAt)?.toISOString());
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
  const { car, refreshedAt } = useCollectionCover(post);
  const source = car?.images?.[0] || car?.image || null;
  const cover = imageSource(source, IMAGE_WIDTH_CARD);
  return (
    <BlogCardShell
      post={post}
      navigate={navigate}
      refreshedAt={refreshedAt}
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
      refreshedAt={data.find((entry) => entry.refreshedAt)?.refreshedAt || null}
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

/**
 * Боковое меню журнала: два способа сузить выдачу — по типу машины и по разделу.
 * Разделы перечислены все, включая пустые: так видно, что в журнале будет дальше.
 * Пустой пункт не кликается — ссылка в никуда хуже честно серого пункта.
 *
 * На общей странице журнала пункты работают как фильтр (`onFilter`), на странице
 * материала — как ссылки в журнал. Отдельных адресов у фильтров нет намеренно:
 * десяток почти пустых страниц поисковику только вредит.
 */
// Значки страниц-расчётов. Держим их здесь, а не в описании страниц: `tool-pages.js`
// читает и сервер, а там разметки нет.
const TOOL_PAGE_ICONS = { "/ev-quota": Lightning, "/customs": ClipboardText, "/delivery-cost": RoadHorizon, "/calculator": Calculator };
// Значки пунктов бокового меню — по слугу из `src/blog-posts.js`. Значки заведены и для
// разделов, которых пока нет: их пункты появятся вместе с первым материалом.
const BLOG_FILTER_ICONS = {
  all: List,
  electric: Lightning,
  hybrid: Engine,
  petrol: GasPump,
  collections: SquaresFour,
  comparisons: ArrowsLeftRight,
  articles: Article,
  news: Newspaper,
  law: Scales,
  tips: Lightbulb,
};

/**
 * Боковое меню журнала. Сверху один список выбора — как выпадающий список сайта:
 * «Все материалы», типы машин, разделы. Выбранный пункт подсвечен, пустые видны, но
 * не нажимаются: так заранее видно, что в журнале будет дальше, и при этом нет ссылок
 * в никуда. Отдельных адресов у фильтров нет намеренно — десяток почти пустых страниц
 * поисковику только вредит.
 *
 * Ниже — переходы к расчётам. Это не фильтры журнала, поэтому они вынесены отдельным
 * блоком и выглядят обычными кнопками со значками.
 */
function BlogSidebar({ navigate, filter = null, onFilter = null, currentPath = null }) {
  const items = blogSidebarItems();
  const chosen = (item) => (filter ? filter.kind === item.kind && filter.slug === item.slug : item.kind === "all");
  // Где меню ведёт себя как обычная навигация: на главной журнала (её признак —
  // onFilter, разделы там переключаются на месте, в любом состоянии фильтра) и на
  // самих страницах расчётов (их признак — currentPath). Там расчёты и каталог
  // открываются в этой же вкладке и без стрелок: читать ещё нечего, терять нечего.
  // Со страницы материала — по-прежнему в новой вкладке, чтобы не потерять текст.
  const sameTab = Boolean(onFilter) || Boolean(currentPath);
  return (
    <aside className="blog-sidebar" aria-label="Разделы журнала">
      <nav className="blog-sidebar-filters">
        {items
          // Пустые разделы не показываем: пункт, за которым ничего нет, только сбивает.
          // Они появятся сами, как только в разделе выйдет первый материал.
          .filter((item) => item.count > 0)
          .map((item) => {
            const Icon = BLOG_FILTER_ICONS[item.slug] || List;
            const inside = (
              <>
                <Icon size={18} />
                <span>{item.name}</span>
                <small>{item.count}</small>
              </>
            );
            return onFilter ? (
              <button
                type="button"
                key={item.slug}
                className={`blog-filter-item${chosen(item) ? " current" : ""}`}
                onClick={() => onFilter(item.kind === "all" ? null : item)}
              >
                {inside}
              </button>
            ) : (
              <AppLink
                className="blog-filter-item"
                key={item.slug}
                href={BLOG_INDEX.path}
                navigate={navigate}
                onClick={() => openBlogWithFilter(navigate, item.kind === "all" ? null : item)}
              >
                {inside}
              </AppLink>
            );
          })}
      </nav>
      <nav className="blog-sidebar-tools">
        {TOOL_PAGES.map((tool) => {
          const Icon = TOOL_PAGE_ICONS[tool.path] || Calculator;
          return sameTab ? (
            <AppLink
              className={`blog-tool-button${currentPath === tool.path ? " current" : ""}`}
              key={tool.path}
              href={tool.path}
              navigate={navigate}
              aria-current={currentPath === tool.path ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{tool.name}</span>
            </AppLink>
          ) : (
            // Расчёты, как и каталог, открываются в новой вкладке: посетитель уходит
            // считать и возвращается к материалу, не теряя прочитанное. Поэтому это
            // обычные ссылки, а не переход внутри приложения.
            <a
              className={`blog-tool-button${currentPath === tool.path ? " current" : ""}`}
              key={tool.path}
              href={appHref(tool.path)}
              target="_blank"
              rel="noreferrer"
              aria-current={currentPath === tool.path ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{tool.name}</span>
              <ArrowRight size={16} weight="bold" />
            </a>
          );
        })}
        {/* Переход в каталог — главное действие сайта, поэтому кнопка жёлтая, как все
            основные кнопки. Со страницы материала открывается в новой вкладке: человек
            читает и уходит смотреть машины, не теряя прочитанное. На самой главной
            журнала терять нечего, поэтому там переход в этой же вкладке и без стрелок. */}
        {sameTab ? (
          <AppLink className="blog-tool-button accent" href="/catalog" navigate={navigate}>
            <CarProfile size={19} />
            <span>Каталог авто из Китая</span>
          </AppLink>
        ) : (
          <a className="blog-tool-button accent" href={appHref("/catalog")} target="_blank" rel="noreferrer">
            <CarProfile size={19} />
            <span>Каталог авто из Китая</span>
            <ArrowRight size={16} weight="bold" />
          </a>
        )}
      </nav>
    </aside>
  );
}

/**
 * Шапка журнала — строка «Журнал abcars.by» над содержимым. Стоит на всех страницах
 * раздела: на общей, в материале и на страницах расчётов, — чтобы переход внутри
 * журнала не выглядел уходом на другую часть сайта. На общей странице это заголовок
 * страницы, на остальных — ссылка обратно в журнал: свой заголовок там уже есть,
 * а двух главных заголовков на странице быть не должно.
 *
 * Внутри материала ссылкой стоит только слово «Журнал», а адрес сайта рядом — обычный
 * текст: подчёркнутая целиком строка «Журнал abcars.by» читается как ссылка на сайт,
 * а ведёт она в раздел. Строка при этом остаётся тем же блоком того же размера, что и
 * заголовок общей страницы, — иначе при переходе внутрь журнала содержимое прыгает.
 */
function BlogMasthead({ navigate, main = false }) {
  // Хвост строки («abcars.by») отделяется от названия раздела, чтобы имя раздела не
  // пришлось писать в шапке ещё раз: если h1 когда-нибудь перестанет начинаться со
  // слова «Журнал», ссылкой станет вся строка — как было раньше.
  const tail = BLOG_INDEX.h1.startsWith(BLOG_INDEX.name)
    ? BLOG_INDEX.h1.slice(BLOG_INDEX.name.length)
    : null;
  return (
    <div className={main ? "blog-masthead" : "blog-masthead blog-masthead-link"}>
      {main ? (
        <h1>{BLOG_INDEX.h1}</h1>
      ) : tail ? (
        <p>
          <AppLink href={BLOG_INDEX.path} navigate={navigate}>
            {BLOG_INDEX.name}
          </AppLink>
          {tail}
        </p>
      ) : (
        <AppLink href={BLOG_INDEX.path} navigate={navigate}>
          {BLOG_INDEX.h1}
        </AppLink>
      )}
    </div>
  );
}

/**
 * Общая страница журнала: материалы теми же карточками, что на главной, и меню
 * разделов сбоку. Ширина и раскладка — как у каталога: колонка выдачи и узкий столбец
 * справа, чтобы страницы сайта не расходились между собой.
 */
function BlogIndexPage({ navigate }) {
  const [filter, setFilter] = useState(takeBlogFilterIntent);
  const posts = blogPostsFor(filter);
  return (
    <main className="blog-page page-width">
      <div className="breadcrumbs">
        <button onClick={() => goBackTo(navigate, "/")}>Главная</button>
        <CaretRight size={13} />
        {BLOG_INDEX.name}
      </div>
      <BlogMasthead navigate={navigate} main />
      <div className="blog-layout">
        <div className="blog-main">
          <div className="blog-card-grid blog-card-grid-index">
            {posts.map((post) => (
              <BlogCollectionCard key={post.slug} post={post} navigate={navigate} />
            ))}
          </div>
        </div>
        <BlogSidebar navigate={navigate} filter={filter} onFilter={setFilter} />
      </div>
    </main>
  );
}

/**
 * Одна карточка списка: номер на снимке, слева фото, справа только самое нужное —
 * название, главная цифра подборки, цена под ключ и короткая причина, почему машина
 * в списке. Полный набор характеристик здесь лишний: карточка должна читаться
 * одним взглядом, а подробности есть в самом объявлении.
 */
function BlogTopCard({ car, rank = null, post = null, list = [], navigate, onOpen, reason: ownReason }) {
  const currency = useCurrency();
  const source = car.images?.[0] || car.image || null;
  const image = imageSource(source, IMAGE_WIDTH_CARD);
  const title = car.title || carTitle(car.brand, car.model, car.year);
  const figure = blogCarFigure(car, post);
  // В подборке причина считается по самому списку, а в сравнении карточки одной модели
  // стоят рядом, и «самая доступная в подборке» звучало бы странно — там строку
  // передают готовой.
  const reason = ownReason !== undefined ? ownReason : blogCarReason(car, list, post, (item) => (item ? estimateLandedCost(item).totalUsd : null));
  return (
    <AppLink
      className="blog-top-card"
      href={carHref(car)}
      navigate={navigate}
      onClick={(event) => {
        if (onOpen?.(car)) event.preventDefault();
      }}
    >
      <span className="blog-top-photo">
        {image ? <img src={image} srcSet={imageSourceSet(source, IMAGE_WIDTH_CARD)} alt={title} loading="lazy" onError={(event) => retryWithFullImage(event, source)} /> : null}
        {/* Номер только там, где список — это место в топе. В сравнении машины одной
            модели не ранжируются, и цифра на снимке вводила бы в заблуждение. */}
        {rank ? <span className="blog-top-rank">{rank}</span> : null}
      </span>
      {/* Порядок один для всех подборок: название, цена, почему машина в списке и внизу
          главная цифра — то, по чему подборка вообще собрана. Цифра акцентного цвета:
          на ней взгляд и должен остановиться, когда карточки листают одну за другой. */}
      <span className="blog-top-body">
        {/* Название и цена — одной строкой: слева машина, справа сколько она стоит
            под ключ. Оба одинакового размера, чтобы взгляд не выбирал между ними. */}
        <span className="blog-top-head">
          <strong>{title}</strong>
          {/* «Под ключ в Минске» ушло в подсказку у значка: в карточке эта строчка
              повторялась десять раз и занимала место, а объяснение нужно один раз. */}
          <span className="blog-top-price">
            ≈ {money(estimateLandedCost(car).totalUsd, currency)}
            <span className="price-info" tabIndex={0} aria-label="Из чего складывается цена">
              <Info size={16} />
              <ActionTooltip text="Итог в Минске: выкуп машины, доставка, таможня и оформление. Предварительный расчёт по открытым тарифам." />
            </span>
          </span>
        </span>
        {reason ? <span className="blog-top-reason">{reason}</span> : null}
        {figure ? (
          <span className="blog-top-figure">
            <i>{figure.label}</i>
            <b>{figure.value}</b>
          </span>
        ) : null}
      </span>
    </AppLink>
  );
}

// ── Сравнение двух моделей ────────────────────────────────────────────────────
// Второй вид материала журнала. У него не один список, а две стороны, и каждая живёт
// своим срезом каталога: «все Xiaomi SU7» и «все Tesla Model 3». Из этих двух срезов
// собирается вся страница — шапка с фотографиями, таблица различий и списки машин, —
// поэтому руками в сравнении не написано ни одной цифры.

const DUEL_SIDE_EMPTY = { cars: [], total: null, refreshedAt: null, priceFromUsd: null, hero: null };

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
  const [state, setState] = useState(() => sides.map((side) => ({ side, ...DUEL_SIDE_EMPTY })));
  useEffect(() => {
    const controller = new AbortController();
    setState(sides.map((side) => ({ side, ...DUEL_SIDE_EMPTY })));
    const load = (query) =>
      query
        ? fetch(`/api/cars?${query}`, { signal: controller.signal })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error("duel side unavailable"))))
            .then((catalog) => ({ total: catalog.total ?? null, refreshedAt: catalog.refreshedAt || null, cars: catalog.items.map(normalizeImportedCar) }))
        : Promise.resolve(null);
    const loadSummary = (query) =>
      fetch(`/api/cars/summary?${query}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error("duel summary unavailable"))))
        .catch(() => null);
    Promise.all(queries.map((query) => Promise.all([loadSummary(query.summary), load(query.list), load(query.cheapest), load(query.hero)])))
      .then((answers) => {
        setState(
          answers.map(([summary, list, cheapest, hero], index) => {
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
            refreshedAt: summary?.refreshedAt || list?.refreshedAt || cheapest?.refreshedAt || null,
            priceFromUsd: prices.length ? Math.min(...prices) : null,
            // Кадр для шапки — первая машина со снимком: у части объявлений
            // фотографий нет вовсе.
            hero: (hero?.cars || []).find((car) => car.images?.length || car.image) || cars[0] || null,
            ...(summary || { total: list?.total ?? cheapest?.total ?? null }),
            };
          }),
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [queries]);
  return state;
}

/**
 * Шапка сравнения: две настоящие машины из каталога друг против друга. Не рисунок и не
 * фотобанк — снимки живые, поэтому кадр меняется, когда объявление продают.
 */
function BlogDuelHero({ data, navigate, onOpen }) {
  const currency = useCurrency();
  if (!data.some((entry) => entry.hero)) return null;
  return (
    <div className="blog-duel-hero">
      {data.map((entry) => {
        const car = entry.hero;
        const source = car?.images?.[0] || car?.image || null;
        const image = imageSource(source, IMAGE_WIDTH_CARD);
        const open = (event) => {
          if (car && onOpen?.(car)) event.preventDefault();
        };
        return (
          <figure key={entry.side.name}>
            <AppLink href={car ? carHref(car) : entry.side.review} navigate={navigate} onClick={open} aria-label={entry.side.name}>
              {image ? <img src={image} srcSet={imageSourceSet(source, IMAGE_WIDTH_CARD)} alt={entry.side.name} loading="eager" onError={(event) => retryWithFullImage(event, source)} /> : null}
            </AppLink>
            <figcaption>
              <strong>{entry.side.name}</strong>
              <span>{entry.priceFromUsd ? `от ${money(entry.priceFromUsd, currency)} под ключ` : "цена считается"}</span>
            </figcaption>
          </figure>
        );
      })}
      {/* Значок между кадрами — единственное украшение на странице: он сразу говорит,
          что это сравнение, а не подборка из двух машин. */}
      <span className="blog-duel-versus" aria-hidden="true">vs</span>
    </div>
  );
}

/**
 * Таблица различий. Всё в ней считается из каталога: наличие, цена самой доступной
 * машины и лучшие цифры версий, которые сейчас есть. Подсвечено только настоящее
 * преимущество — при равных значениях не подсвечивается ничего.
 */
function BlogDuelTable({ post, data, navigate }) {
  const currency = useCurrency();
  const rows = blogDuelRows(data);
  // Вторая половина таблицы — паспорт модели: то, чего в каталоге нет и что от
  // объявлений не зависит. Она написана в самом материале, поэтому и оговорка под
  // таблицей своя: цифры каталога считаются сейчас, паспортные взяты у производителя.
  // Таблица одна и без перегородок: посетитель сравнивает две машины, а не изучает,
  // какая цифра откуда взялась. Что считается из каталога, а что паспортное, сказано
  // одной строкой под таблицей.
  const lines = [...rows, ...blogDuelSpecRows(blogPostSides(post))];
  if (!lines.length) return null;
  const cell = (value) => (value ? (value.money != null ? `≈ ${money(value.money, currency)}` : value.text) : "—");
  const line = (row) => (
    <tr key={row.key}>
      <th scope="row">{row.label}</th>
      {row.values.map((value, index) => {
        const side = data[index]?.side;
        // Наличие — единственная строка, из которой есть куда пойти: число машин ведёт
        // в каталог, отобранный по этой модели.
        const target = row.key === "total" && value && side ? blogCatalogHref({ filters: side.filters }) : null;
        return (
          <td key={side?.name || index} className={row.best === index ? "best" : undefined}>
            {/* Обычная ссылка в новую вкладку, а не переход внутри приложения: человек
                уходит смотреть каталог, но статья остаётся открытой — так же сделаны
                кнопки расчётов в боковом меню журнала. */}
            {target ? (
              <a href={appHref(target)} target="_blank" rel="noreferrer">{cell(value)}</a>
            ) : (
              cell(value)
            )}
          </td>
        );
      })}
    </tr>
  );
  return (
    <section className="blog-duel-table" aria-labelledby="blog-duel-title">
      {/* Заголовок стоит внутри таблицы, в пустой клетке над названиями строк: так он
          оказывается на одной строке с названиями моделей, а над таблицей не висит
          лишний ярус. */}
      <div className="blog-duel-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">
                <h2 id="blog-duel-title">В цифрах</h2>
              </th>
              {data.map((entry) => (
                <th key={entry.side.name} scope="col">
                  <a href={appHref(entry.side.review)} target="_blank" rel="noreferrer">{entry.side.name}</a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{lines.map(line)}</tbody>
        </table>
      </div>
      {/* Подписей под названиями строк нет — вместо десятка мелких пояснений одна
          строка под таблицей: откуда цифры и что стоит за ценой. */}
      <p className="blog-duel-source">Наличие, цена и характеристики версий считаются из каталога в момент открытия страницы: цена — самая доступная машина под ключ в Минске, остальное — лучшее, что есть сейчас. Габариты, багажник и гарантия — паспортные данные производителей.</p>
    </section>
  );
}

/**
 * Живые машины одной модели: пять самых доступных строками каталога — теми же, что
 * в списке на главной и в каталоге. Своя вёрстка списка тут не нужна: в сравнении
 * машины не соревнуются между собой, как в подборке, а показывают, что есть в наличии
 * и с какой суммы модель начинается.
 */
function BlogDuelSideCars({ entry, navigate, favorites, toggleFavorite, onOpen }) {
  const cars = entry.cars.slice(0, 5);
  if (!cars.length) return null;
  const catalogTarget = blogCatalogHref({ filters: entry.side.filters });
  return (
    <section className="blog-duel-cars">
      <h3>{entry.side.name} в наличии</h3>
      <div className="car-list">
        {cars.map((car) => (
          <CarRow
            key={car.id}
            car={car}
            navigate={navigate}
            favorite={favorites?.has(car.id)}
            toggleFavorite={toggleFavorite}
            // Быстрый просмотр там, где он включён и помещается; иначе обычный переход
            // на страницу машины — как в каталоге и на главной.
            onOpen={(item) => {
              if (onOpen?.(item)) return;
              navigate(carHref(item));
            }}
          />
        ))}
      </div>
      <AppLink className="blog-top-more" href={catalogTarget} navigate={navigate}>
        {entry.total ? `Все ${number(entry.total)} в каталоге` : "Смотреть в каталоге"} <ArrowRight size={17} />
      </AppLink>
    </section>
  );
}

/** Сам список с заголовком и переходом в каталог. */
function BlogTopList({ post, cars, total, navigate, onOpen }) {
  if (!cars.length) return null;
  const catalogTarget = blogCatalogHref(post);
  return (
    <section className="blog-top" aria-labelledby="blog-top-title">
      {/* Список живой: он собирается из каталога при каждом открытии страницы.
          Мелкой строкой над заголовком говорим об этом прямо — иначе подборку
          читают как написанную однажды и с тех пор устаревшую. */}
      <p className="blog-top-note">Обновляем топ автоматически из нашего каталога</p>
      <h2 id="blog-top-title">{post.name}</h2>
      <div className="blog-top-list">
        {cars.map((car, index) => (
          <BlogTopCard key={car.id} car={car} rank={index + 1} post={post} list={cars} navigate={navigate} onOpen={onOpen} />
        ))}
      </div>
      <AppLink className="blog-top-more" href={catalogTarget} navigate={navigate}>
        {total ? `Все ${number(total)} в каталоге` : "Смотреть в каталоге"} <ArrowRight size={17} />
      </AppLink>
    </section>
  );
}

/**
 * Фотография внутри статьи. Кадр не иллюстративный, а из каталога: это настоящая
 * машина подборки, подпись показывает её пробег и итоговую цену до Минска, а сам
 * снимок кликается в объявление. Сплошной текст так разбивается тем, за чем на
 * страницу и приходят, а поисковик получает фотографию с осмысленной подписью.
 */
function BlogFigure({ car, index, navigate, onOpen = null, eager = false }) {
  const currency = useCurrency();
  const gallery = car.images?.length ? car.images : [car.image].filter(Boolean);
  // У соседних снимков берём разные кадры: иначе три фотографии подряд оказываются
  // одинаковыми «три четверти спереди».
  const source = gallery[Math.min(index, gallery.length - 1)] || null;
  const image = imageSource(source, IMAGE_WIDTH_ARTICLE);
  if (!image) return null;
  const title = car.title || carTitle(car.brand, car.model, car.year);
  // Нажатие раскрывает быстрый просмотр — как в каталоге и на главной. Если посетитель
  // сам выключил его переключателем или экран узкий, `onOpen` вернёт неправду и ссылка
  // сработает обычным образом, открыв полную страницу машины.
  const open = (event) => {
    if (onOpen?.(car)) event.preventDefault();
  };
  return (
    <figure className="blog-figure">
      <AppLink href={carHref(car)} navigate={navigate} onClick={open} aria-label={`Открыть объявление: ${title}`}>
        <img src={image} srcSet={imageSourceSet(source, IMAGE_WIDTH_ARTICLE)} alt={`${title} — автомобиль из Китая в наличии`} loading={eager ? "eager" : "lazy"} onError={(event) => retryWithFullImage(event, source)} />
      </AppLink>
      <figcaption>
        <AppLink href={carHref(car)} navigate={navigate} onClick={open}>{title}</AppLink>
        <span>
          {car.mileage ? `${number(car.mileage)} км · ` : ""}≈ {money(estimateLandedCost(car).totalUsd, currency)} под ключ в Минске
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Похожие материалы под статьёй — теми же карточками, что в журнале и на главной.
 * Три в ряд: колонка статьи ровно три колонки сетки, поэтому карточки здесь той же
 * ширины, что везде.
 */
function BlogRelated({ post, navigate }) {
  const related = blogRelatedPosts(post);
  if (!related.length) return null;
  return (
    <section className="blog-related" aria-labelledby="blog-related-title">
      <h2 id="blog-related-title">Похожие статьи</h2>
      <div className="blog-card-grid blog-card-grid-index">
        {related.map((item) => (
          <BlogCollectionCard key={item.slug} post={item} navigate={navigate} />
        ))}
      </div>
    </section>
  );
}

/**
 * Общая обвязка страницы материала: крошки, шапка со строкой «раздел · дата», подложка
 * статьи, кнопка «поделиться», похожие материалы и меню сбоку. Внутрь ставится тело
 * материала — у подборки и у сравнения оно разное, а рамка одна.
 */
function BlogArticleShell({ post, navigate, dateLine, quickViewModal, children }) {
  const shown = dateLine ? { ...dateLine, date: dateLine.date.charAt(0).toUpperCase() + dateLine.date.slice(1) } : null;
  return (
    <main className="blog-page page-width">
      <div className="breadcrumbs">
        <button onClick={() => goBackTo(navigate, "/")}>Главная</button>
        <CaretRight size={13} />
        <button onClick={() => goBackTo(navigate, BLOG_INDEX.path)}>{BLOG_INDEX.name}</button>
        <CaretRight size={13} />
        {post.name}
      </div>
      <BlogMasthead navigate={navigate} />
      <div className="blog-layout">
        {/* В колонке сетки два блока: сама статья на своей подложке — так же, как обзор
            модели, — и под ней похожие материалы. */}
        <div className="blog-main">
          <article className="blog-article">
            {/* Та же кнопка «поделиться», что на карточках, — в правом верхнем углу
                подложки. Список раскрывается вниз: наверху страницы вверх ему некуда. */}
            <div className="blog-article-share">
              <BlogShareMenu post={post} direction="down" />
            </div>
            <header className="blog-head">
              {/* Строка над заголовком: раздел и дата через точку. Слова «опубликовано»
                  нет — дата и так читается как дата, а лишнее слово только удлиняет
                  строку перед заголовком. */}
              <span className="blog-article-meta">
                {/* Раздел — ссылка в журнал: из статьи логично вернуться к списку
                    материалов, а не только к главной. Вид тот же, что был у подписи. */}
                <AppLink
                  href={BLOG_INDEX.path}
                  navigate={navigate}
                  onClick={() => openBlogWithFilter(navigate, post.rubric ? { kind: "rubric", slug: post.rubric, name: post.rubricName } : null)}
                >
                  {post.rubricName || BLOG_INDEX.name}
                </AppLink>
                {shown ? <span>{shown.date}</span> : null}
              </span>
              <h1>{post.h1}</h1>
              <p>{post.lead}</p>
            </header>
            {children}
          </article>
          <BlogRelated post={post} navigate={navigate} />
        </div>
        <BlogSidebar navigate={navigate} />
      </div>
      {quickViewModal}
    </main>
  );
}

/** Страница материала: у подборки и у сравнения общая рамка и разное тело. */
function BlogPostPage({ post, navigate, favorites, toggleFavorite }) {
  return post.kind === "duel"
    ? <BlogDuelPage post={post} navigate={navigate} favorites={favorites} toggleFavorite={toggleFavorite} />
    : <BlogCollectionPage post={post} navigate={navigate} favorites={favorites} toggleFavorite={toggleFavorite} />;
}

/** Подборка: статья, полоса цифр и живой список машин по правилу отбора. */
function BlogCollectionPage({ post, navigate, favorites, toggleFavorite }) {
  const text = useBlogText(post.slug);
  // Один запрос на всю статью: из него и список машин, и снимки между разделами.
  // Берём с запасом — из шестидесяти машин набирается десяток разных марок; подборка,
  // где половина машин одной марки, подборкой не выглядит.
  const carsState = useCollectionCars(post, { limit: BLOG_TOP_POOL });
  const edges = useCollectionEdges(post);
  // Открывающий кадр — тот же, что на карточке материала: человек нажал на карточку
  // и видит наверху статьи ту же машину, а не другую.
  const { car: coverCar } = useCollectionCover(post);
  const topCars = blogTopCars(carsState.cars, post);
  // Дата обновления — когда каталог последний раз проверялся: список машин и цифры
  // в тексте живут вместе с ним, а не с датой, когда статью написали. Пока проверок
  // после выпуска не было, пишем «Опубликовано».
  const dateLine = blogDateLine(post, carsState.refreshedAt, new Date());
  const { openQuickView, quickViewModal } = useVehicleQuickView({ apiMode: true, favorites, toggleFavorite, navigate });
  // Цифры в тексте — из каталога: сколько машин подходит, от какой суммы и какой
  // запас хода у самой дальнобойной. Чего каталог не отдал, того в полосе нет.
  const stats = blogPostStats({ total: carsState.total, ...edges });
  return (
    <BlogArticleShell post={post} navigate={navigate} dateLine={dateLine} quickViewModal={quickViewModal}>
      {/* Открывающая фотография — сразу после описания, до текста: статья без
          картинки на первом экране читается как стена. */}
      {coverCar ? <BlogFigure car={coverCar} index={0} navigate={navigate} onOpen={openQuickView} eager /> : null}
      <div className="model-page-intro">
        {text?.intro.map((paragraph) => (
          <p key={paragraph}>{renderInlineText(paragraph, navigate)}</p>
        ))}
      </div>
      {stats.length > 0 && (
        <div className="model-page-numbers">
          {stats.map((stat) => (
            <div key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      )}
      {/* Сам список — сразу после полосы цифр: за ним и приходят, а разборы
          читают уже после. */}
      <BlogTopList post={post} cars={topCars} total={carsState.total} navigate={navigate} onOpen={openQuickView} />
      {/* Между разделами статьи встают фотографии машин из этой же подборки:
          сплошной текст, пусть и с врезками, читать тяжело. Последний раздел
          оставляем без снимка — дальше идут вопросы и список машин. */}
      <div className="model-page-article">
        {(text?.sections || []).map((section, index) => {
          // Ни обложку, ни машины из списка в тексте не повторяем.
          const shown = new Set([coverCar?.id, ...topCars.map((item) => item.id)]);
          const cars = carsState.cars.filter((item) => !shown.has(item.id));
          const car = index < (text?.sections?.length || 0) - 1 ? cars[index] : null;
          return (
            <Fragment key={section.title}>
              <ModelPageSection section={section} navigate={navigate} />
              {car ? <BlogFigure car={car} index={index} navigate={navigate} onOpen={openQuickView} /> : null}
            </Fragment>
          );
        })}
      </div>
      <ArticleFaq faq={text?.faq} title="Частые вопросы" />
      {text?.disclaimer ? <p className="blog-disclaimer">{text.disclaimer}</p> : null}
    </BlogArticleShell>
  );
}

/**
 * Сравнение: две машины в шапке, таблица различий, разборы текстом и живые списки
 * обеих моделей. Порядок другой, чем у подборки: сначала ответ в цифрах — за ним и
 * приходят по запросу «что выбрать», — а машины в наличии стоят под разбором, когда
 * человек уже решил, какая из двух ему ближе.
 */
function BlogDuelPage({ post, navigate, favorites, toggleFavorite }) {
  const text = useBlogText(post.slug);
  const data = useDuelSides(post);
  const dateLine = blogDateLine(post, data.find((entry) => entry.refreshedAt)?.refreshedAt || null, new Date());
  const { openQuickView, quickViewModal } = useVehicleQuickView({ apiMode: true, favorites, toggleFavorite, navigate });
  // Снимки между разделами берём у обеих сторон по очереди: иначе половина статьи
  // была бы проиллюстрирована одной моделью.
  const heroes = new Set(data.map((entry) => entry.hero?.id).filter(Boolean));
  const photoCars = [];
  for (let index = 0; index < 4; index += 1) {
    for (const entry of data) {
      const car = entry.cars.filter((item) => !heroes.has(item.id))[index];
      if (car) photoCars.push(car);
    }
  }
  return (
    <BlogArticleShell post={post} navigate={navigate} dateLine={dateLine} quickViewModal={quickViewModal}>
      <BlogDuelHero data={data} navigate={navigate} onOpen={openQuickView} />
      <div className="model-page-intro">
        {text?.intro.map((paragraph) => (
          <p key={paragraph}>{renderInlineText(paragraph, navigate)}</p>
        ))}
      </div>
      <BlogDuelTable post={post} data={data} navigate={navigate} />
      <div className="model-page-article">
        {(text?.sections || []).map((section, index) => {
          const car = index < (text?.sections?.length || 0) - 1 ? photoCars[index] : null;
          return (
            <Fragment key={section.title}>
              <ModelPageSection section={section} navigate={navigate} />
              {car ? <BlogFigure car={car} index={index} navigate={navigate} onOpen={openQuickView} /> : null}
            </Fragment>
          );
        })}
      </div>
      {data.map((entry) => (
        <BlogDuelSideCars key={entry.side.name} entry={entry} navigate={navigate} favorites={favorites} toggleFavorite={toggleFavorite} onOpen={openQuickView} />
      ))}
      <ArticleFaq faq={text?.faq} title="Частые вопросы" />
      {text?.disclaimer ? <p className="blog-disclaimer">{text.disclaimer}</p> : null}
    </BlogArticleShell>
  );
}

function SiteFooter({ navigate }) {
  return (
    <footer className="site-footer">
      <div className="page-width footer-main">
        <div className="footer-brand">
          <AppLink className="wordmark footer-wordmark" href="/" navigate={navigate} aria-label="abcars.by — на главную"><SiteLogo /></AppLink>
          <p>Помогаем выбрать, проверить и доставить автомобиль из Китая в Беларусь.</p>
          <div className="footer-socials">
            <a className="telegram-social-link" href={COMPANY.telegramUrl} target="_blank" rel="noreferrer" aria-label="Telegram"><TelegramLogo size={27} weight="fill" /></a>
            <a className="viber-social-link" href={COMPANY.viberUrl} aria-label="Viber"><ViberLogo size={25} /></a>
          </div>
        </div>
        <div className="footer-column footer-navigation"><b>Навигация</b><AppLink href="/catalog" navigate={navigate}>Автомобили</AppLink><AppLink href="/how-it-works" navigate={navigate}>О сервисе</AppLink>{BLOG_ENABLED && <AppLink href={BLOG_INDEX.path} navigate={navigate}>{BLOG_INDEX.name}</AppLink>}<AppLink href="/faq" navigate={navigate}>Вопросы и ответы</AppLink></div>
        <div className="footer-column footer-tools"><b>Расчёты</b>{TOOL_PAGES.map((tool) => <AppLink key={tool.path} href={tool.path} navigate={navigate}>{tool.name}</AppLink>)}</div>
        <div className="footer-column footer-contacts">
          <b>Связаться</b>
          <AppLink href="/contacts" navigate={navigate}>Контакты</AppLink>
          <a className="footer-contact-line" href={`mailto:${COMPANY.email}`}><EnvelopeSimple size={18} weight="duotone" /><span>{COMPANY.email}</span></a>
          <a className="footer-contact-line" href={COMPANY.telegramUrl} target="_blank" rel="noreferrer"><TelegramLogo size={18} weight="fill" /><span>{COMPANY.telegram}</span></a>
          <span className="footer-contact-address">{COMPANY.address}</span>
        </div>
      </div>
      <div className="page-width footer-bottom">
        <span>© 2026 {COMPANY.legalName}</span>
        <div><AppLink href="/privacy" navigate={navigate}>Политика конфиденциальности</AppLink><AppLink href="/terms" navigate={navigate}>Условия использования</AppLink></div>
      </div>
    </footer>
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
const pendingOrderKey = "abcars-pending-order-listing";
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
// В карточке заказа номер показываем коротко — «№000045» вместо «Заказ № EV-2026-000045».
// Приставка и год у всех заказов одинаковые и различают их только цифры в конце; полный
// номер остаётся в окне удаления и в подписи раздела для программ чтения с экрана.
const shortOrderNumber = (orderNumber) => {
  const tail = String(orderNumber || "").match(/(\d+)\s*$/);
  return tail ? `№${tail[1]}` : String(orderNumber || "");
};
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
const deleteLocalOrder = (userId, orderId) => {
  const orders = readLocalOrders(userId);
  const order = orders.find((item) => item.id === orderId);
  if (!order) throw new Error("order_not_found");
  const next = orders.filter((item) => item.id !== orderId);
  storeLocalOrders(userId, next);
  return next;
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
const formatAccountPhone = (value) => {
  const digits = normalizeLocalPhone(value);
  return digits ? `+${digits}` : "";
};
const profileFromUser = (user) => ({
  name:user.name,
  email:user.email || "",
  telegram:user.telegram || "",
  city:user.city || "",
  preferredContact:user.preferredContact || "phone",
  passportNumber:user.passportNumber || "",
  personalNumber:user.personalNumber || "",
  passportIssueDate:user.passportIssueDate || "",
  passportIssuedBy:user.passportIssuedBy || "",
  registrationAddress:user.registrationAddress || "",
});
const preferredContactOptions = [
  { value:"phone", label:"Позвонить" },
  { value:"telegram", label:"Написать в Telegram" },
  { value:"email", label:"Написать на email" },
];
const preferredContactLabels = preferredContactOptions.map((option) => option.label);
const preferredContactLabel = (value) => (preferredContactOptions.find((option) => option.value === value) || preferredContactOptions[0]).label;
const preferredContactValue = (label) => (preferredContactOptions.find((option) => option.label === label) || preferredContactOptions[0]).value;
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

function AuthModal({ mode, navigate, onAuthenticate, pending, onClose, redirectTo = "/account" }) {
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
      navigate(redirectTo, { replace:true });
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
            <label className="auth-consent"><input type="checkbox" checked={values.consent} onChange={update("consent")} disabled={!registering} /><span>Согласен с <button type="button" onClick={() => navigate("/terms")}>условиями</button> и <button type="button" onClick={() => navigate("/privacy")}>политикой</button></span></label>
          </div>
        </div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="primary auth-submit" type="submit" disabled={pending}>{pending ? "Подождите…" : registering ? "Создать аккаунт" : "Войти"}<ArrowRight size={18} /></button>      </form>
    </div>
  );
}

const activeOrderStage = (order) => {
  if (!["confirmed"].includes(order.availabilityStatus || "decision") && order.inspectionStatus === "decision") return 1;
  if (order.contractStatus === "locked") return 2;
  if (order.paymentStatus === "locked") return 3;
  return 4;
};

function OrderStageRow({ number:stageNumber, title, description, open, locked, done, fixed = false, onToggle, children }) {
  const heading = (
    <>
      <b>{done ? <Check size={23} weight="bold" /> : stageNumber}</b>
      <span><strong>{title}</strong><small>{description}</small></span>
      {!fixed ? locked ? <LockKey size={20} /> : <CaretDown size={21} className="customer-order-stage-caret" /> : null}
    </>
  );
  return (
    <section className={`customer-order-stage${open ? " open" : ""}${locked ? " locked" : ""}${done ? " done" : ""}${fixed ? " fixed" : ""}`}>
      {fixed ? <div className="customer-order-stage-heading">{heading}</div> : <button className="customer-order-stage-heading" type="button" onClick={onToggle} disabled={locked} aria-expanded={open}>{heading}</button>}
      {open && !locked && <div className="customer-order-stage-body">{children}</div>}
    </section>
  );
}

function OrderRemovalModal({ carTitle, orderNumber, saving, error, onCancel, onConfirm }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, saving]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onCancel()}>
      <section className="lead-modal order-removal-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="order-removal-title" aria-describedby="order-removal-description">
        <button className="modal-close" type="button" onClick={onCancel} disabled={saving} aria-label="Закрыть"><X size={19} /></button>
        <div className="order-removal-icon"><Trash size={25} weight="duotone" /></div>
        <h2 id="order-removal-title">Убрать автомобиль?</h2>
        <p id="order-removal-description"><b>{carTitle}</b> будет удалён из заказа № {orderNumber}. Прогресс по проверке объявления, осмотру, договору и оплате также будет удалён.</p>
        {error && <div className="auth-error order-removal-error" role="alert">{error}</div>}
        <form className="order-removal-actions" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
          <button className="secondary" type="button" onClick={onCancel} disabled={saving}>Отмена</button>
          <button className="danger-button solid" type="submit" disabled={saving}><Trash size={18} /> {saving ? "Удаляем…" : "Убрать авто"}</button>
        </form>
      </section>
    </div>
  );
}

function AccountRemovalModal({ pending, error, onCancel, onConfirm }) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, pending]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !pending && onCancel()}>
      <section className="lead-modal order-removal-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="account-removal-title" aria-describedby="account-removal-description">
        <button className="modal-close" type="button" onClick={onCancel} disabled={pending} aria-label="Закрыть"><X size={19} /></button>
        <h2 id="account-removal-title">Удалить аккаунт?</h2>
        <p id="account-removal-description">Заказ, избранные автомобили и личные данные будут удалены безвозвратно. Восстановить аккаунт после удаления нельзя.</p>
        <form className="account-removal-form" onSubmit={(event) => { event.preventDefault(); onConfirm(password); }}>
          <PasswordField label="Пароль для подтверждения" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={pending} />
          {error && <div className="auth-error order-removal-error" role="alert">{error}</div>}
          <div className="order-removal-actions">
            <button className="secondary" type="button" onClick={onCancel} disabled={pending}>Отмена</button>
            <button className="danger-button solid" type="submit" disabled={pending || !password}><Trash size={18} /> {pending ? "Удаляем…" : "Удалить аккаунт"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

// Пока не запускаем проверку объявлений: кнопка есть, но заявка никуда не уходит.
function AvailabilityPausedModal({ onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="lead-modal order-removal-modal confirm-modal availability-paused-modal" role="dialog" aria-modal="true" aria-labelledby="availability-paused-title" aria-describedby="availability-paused-description">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Закрыть"><X size={19} /></button>
        <div className="order-removal-icon availability-paused-icon"><Clock size={32} weight="duotone" /></div>
        <h2 id="availability-paused-title">Временно не принимаем заказы</h2>
        <p id="availability-paused-description">Приём заказов на авто временно приостановлен. Через несколько дней он снова станет доступен.</p>
        <div className="order-removal-actions availability-paused-actions">
          <button className="primary" type="button" onClick={onClose}>Хорошо, вернусь позже</button>
        </div>
      </section>
    </div>
  );
}

function CustomerOrdersPanel({ user, cars, apiMode, favorites, toggleFavorite, authBackend, navigate }) {
  // Цена заказа тоже слушается переключателя валюты в шапке: рубли в каталоге и
  // доллары в заказе выглядели бы разными ценами.
  const currency = useCurrency();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [localMode, setLocalMode] = useState(authBackend === "local");
  const [expandedStage, setExpandedStage] = useState(1);
  const [removalOpen, setRemovalOpen] = useState(false);
  const [removalError, setRemovalError] = useState("");
  const [availabilityComment, setAvailabilityComment] = useState("");
  // Запросы актуальности временно отключены: кнопка вместо отправки объясняет это окном.
  const [availabilityPausedOpen, setAvailabilityPausedOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  // Машин в заказе может быть несколько: показываем выбранную, по умолчанию свежую.
  const order = orders.find((item) => item.id === selectedOrderId) || orders[0] || null;
  // Заголовок карточки открывает быстрый просмотр — тот же, что в каталоге.
  const { openQuickView, quickViewModal } = useVehicleQuickView({ apiMode:apiMode !== false, favorites, toggleFavorite, navigate, orderOnScreen:true });
  // Кабинет — единственное место, где заказы заводятся и удаляются, поэтому именно он
  // сообщает остальному приложению, по каким машинам заказ уже есть.
  const publishOrderedListings = useContext(SetOrderedListingsContext);
  const [previewCar, setPreviewCar] = useState(null);
  const previewListingId = order?.listingId || null;
  // Карточку для просмотра готовим заранее: модалка показывает полную страницу
  // автомобиля, а в заказе хранится только короткая выжимка.
  useEffect(() => {
    if (!previewListingId || previewCar?.id === previewListingId) return undefined;
    const known = cars.find((item) => item.id === previewListingId);
    if (known && !known._summary) {
      setPreviewCar(known);
      return undefined;
    }
    const controller = new AbortController();
    const request = apiMode !== false
      ? fetch(`/api/cars/${encodeURIComponent(previewListingId)}`, { signal:controller.signal }).then((response) => (response.ok ? response.json() : Promise.reject(new Error("not found"))))
      : loadStaticCar(previewListingId, controller.signal);
    request
      .then((loaded) => setPreviewCar(normalizeImportedCar(loaded)))
      .catch(() => {});
    return () => controller.abort();
  }, [apiMode, cars, previewCar, previewListingId]);

  useEffect(() => {
    let cancelled = false;
    const loadLocal = () => {
      const pendingListingId = window.localStorage.getItem(pendingOrderKey);
      if (pendingListingId) {
        const car = cars.find((item) => item.id === pendingListingId);
        if (car) {
          createLocalOrder(user.id, car);
          window.localStorage.removeItem(pendingOrderKey);
        }
      }
      const values = readLocalOrders(user.id);
      if (!cancelled) {
        setLocalMode(true);
        setOrders(values);
        if (values[0]) {
          setExpandedStage(activeOrderStage(values[0]));
          setAvailabilityComment(values[0].availabilityComment || "");
        }
      }
    };
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        if (authBackend === "local") {
          loadLocal();
          return;
        }
        const pendingListingId = window.localStorage.getItem(pendingOrderKey);
        if (pendingListingId) {
          const createResponse = await fetch("/api/account/orders", { method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ listingId:pendingListingId }) });
          if (!createResponse.ok) throw new Error("order_create_failed");
          window.localStorage.removeItem(pendingOrderKey);
        }
        const response = await fetch("/api/account/orders", { cache:"no-store", credentials:"same-origin" });
        if (!response.ok) throw new Error("orders_load_failed");
        const payload = await response.json();
        const values = Array.isArray(payload.orders) ? payload.orders : [];
        if (!cancelled) {
          setOrders(values);
          if (values[0]) {
            setExpandedStage(activeOrderStage(values[0]));
            setAvailabilityComment(values[0].availabilityComment || "");
          }
        }
      } catch {
        loadLocal();
        if (!readLocalOrders(user.id).length && !cancelled) setError("Не удалось загрузить заказ. Попробуйте обновить страницу.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [authBackend, cars, user.id]);

  // Список машин в заказе держим в актуальном состоянии для всего приложения: заказ
  // могли только что создать или убрать, и кнопка на карточке обязана это отразить.
  // Пока заказы грузятся, ничего не публикуем — иначе кнопка на миг стала бы обычной.
  useEffect(() => {
    if (!loading) publishOrderedListings?.(orders);
  }, [loading, orders, publishOrderedListings]);

  const applyAction = async (action, values = {}) => {
    const current = order;
    if (!current || saving) return;
    setSaving(true);
    setError("");
    try {
      let updated;
      if (localMode) {
        updated = updateLocalOrder(user.id, current.id, action, values).order;
      } else {
        const response = await fetch(`/api/account/orders/${current.id}`, { method:"PATCH", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ action, ...values }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "order_update_failed");
        updated = payload.order;
      }
      setOrders((values) => values.map((order) => order.id === updated.id ? updated : order));
      if (action !== "save_order_contact") setExpandedStage(activeOrderStage(updated));
      return true;
    } catch {
      setError("Не удалось сохранить действие. Попробуйте ещё раз.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const removeOrder = async () => {
    const current = order;
    if (!current || saving) return;
    setSaving(true);
    setError("");
    setRemovalError("");
    try {
      if (localMode) {
        try {
          setOrders(deleteLocalOrder(user.id, current.id));
        } catch (localError) {
          if (localError.message !== "order_not_found" || authBackend === "local") throw localError;
          const response = await fetch(`/api/account/orders/${current.id}`, { method:"DELETE", credentials:"same-origin" });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "order_remove_failed");
          setLocalMode(false);
          setOrders((values) => values.filter((order) => order.id !== current.id));
        }
      } else {
        const response = await fetch(`/api/account/orders/${current.id}`, { method:"DELETE", credentials:"same-origin" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "order_remove_failed");
        setOrders((values) => values.filter((order) => order.id !== current.id));
      }
      setExpandedStage(1);
      setSelectedOrderId("");
      setRemovalOpen(false);
    } catch (removeError) {
      console.error("[customer-order] removal failed", { orderId:current.id, source:localMode ? "local" : "server", error:removeError.message });
      setRemovalError(removeError.message === "unauthorized" ? "Сессия истекла. Обновите страницу и войдите снова." : "Не удалось убрать автомиль. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };

  // Переключение машины: у каждой свой прогресс, поэтому вместе с выбором
  // подтягиваем её активный этап и комментарий.
  const chooseOrder = (next) => {
    if (!next || next.id === order?.id) return;
    setSelectedOrderId(next.id);
    setExpandedStage(activeOrderStage(next));
    setAvailabilityComment(next.availabilityComment || "");
    setError("");
  };

  if (loading) return <section className="account-order-loading" aria-live="polite">Загружаем ваш заказ…</section>;
  if (!order) return (
    <section className="account-panel account-empty">
      <div className="account-panel-title"><div><span>Мои заказы</span><h2>Начните с подходящего автомобиля</h2></div><ClipboardText size={27} weight="duotone" /></div>
      <p>{error || "Выберите автомобиль в каталоге — после этого здесь появятся проверка объявления, осмотр, договор и оплата."}</p>
      <button className="primary" onClick={() => navigate("/catalog")}>Перейти в каталог <ArrowRight size={18} /></button>
    </section>
  );

  const availabilityStatus = order.availabilityStatus || "decision";
  const availabilityRequested = availabilityStatus !== "decision";
  const availabilityConfirmed = availabilityStatus === "confirmed";
  const inspectionDone = order.inspectionStatus === "skipped";
  const inspectionUnlocked = availabilityConfirmed || order.inspectionStatus !== "decision";
  const contractUnlocked = order.contractStatus !== "locked";
  const contractDone = order.contractStatus === "confirmed";
  const paymentUnlocked = order.paymentStatus !== "locked";
  // Заявка временно никуда не уходит, но клик по этой кнопке — ключевое действие
  // воронки: она стоит ближе всего к сделке, поэтому в аналитике его считаем всегда.
  const requestAvailabilityCheck = () => {
    trackEvent("availability_request_click", {
      listingId:order.listingId,
      listingTitle:order.car.title,
      properties:{ withComment:availabilityComment.trim() ? "yes" : "no" },
    });
    trackMetrikaGoal("availability_request");
    setAvailabilityPausedOpen(true);
  };
  const requestOrderRemoval = (event) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    setRemovalError("");
    setRemovalOpen(true);
  };
  // Быстрый просмотр работает только на широком экране и при включённом свитчере;
  // в остальных случаях ссылка открывает страницу автомобиля, как раньше.
  const openCarPreview = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button) return;
    if (!previewCar || previewCar.id !== order.listingId) return;
    if (openQuickView(previewCar)) event.preventDefault();
  };
  // Одинаковые названия встречаются у разных объявлений — такие различаем номером заказа.
  const orderLabels = orders.map((item, index) => {
    const title = item.car.title || "Автомобиль";
    const twin = orders.some((other, otherIndex) => otherIndex !== index && (other.car.title || "Автомобиль") === title);
    return twin ? `${title} · ${item.orderNumber}` : title;
  });
  const widestOrderLabel = orderLabels.reduce((longest, label) => (label.length > longest.length ? label : longest), "");
  return (
    <section className="customer-order" aria-label={`Заказ ${order.orderNumber}`}>
      {orders.length > 1 && (
      <div className="customer-order-picker">
        <SelectField
          className="customer-order-select"
          label="Автомобиль в заказе"
          value={orderLabels[orders.indexOf(order)]}
          options={orderLabels}
          onChange={(label) => chooseOrder(orders[orderLabels.indexOf(label)])}
        />
        {/* Невидимая мерка: ширину списка задаёт самое длинное название, иначе
            поле дёргалось бы при каждом переключении машины. */}
        <span className="customer-order-picker-sizer" aria-hidden="true">{widestOrderLabel}</span>
      </div>
      )}
      <div className="customer-order-car">
        <img src={imageSource(order.car.image, IMAGE_WIDTH_TILE)} alt={order.car.title} onError={(event) => retryWithFullImage(event, order.car.image)} />
        <div className="customer-order-car-copy">
          <div className="customer-order-car-heading"><h2><a href={`/cars/${encodeURIComponent(listingNumber(order.listingId))}`} target="_blank" rel="noopener noreferrer" onClick={openCarPreview}>{order.car.title}</a></h2><p>{shortOrderNumber(order.orderNumber)}</p></div>
          {order.car.estimatedTotalUsd ? <div className="customer-order-car-price"><b>≈ {money(order.car.estimatedTotalUsd, currency)}</b></div> : null}
        </div>
        <div className="customer-order-card-controls">
          <details className="order-car-menu">
            <summary aria-label="Действия с автомобилем"><DotsThreeVertical size={23} weight="bold" /></summary>
            <div><button type="button" disabled={saving} onClick={requestOrderRemoval}><Trash size={17} /> Убрать автомобиль</button></div>
          </details>
        </div>
      </div>
      <div className="customer-order-stages">
        <OrderStageRow number={1} title="Проверка объявления" description="Уточним у продавца наличие, цену и готовность к сделке." open fixed done={availabilityRequested}>
          {/* После отправки запроса вёрстка этапа не меняется: поле с комментарием и
              кнопка просто перестают быть активными, а рядом с кнопкой встаёт статус. */}
          <form className="availability-check-form" onSubmit={(event) => { event.preventDefault(); requestAvailabilityCheck(); }}>
            <div className="availability-check-block">
              <p>Перед осмотром свяжемся с продавцом и подтвердим:</p>
              <ul className="availability-check-list">
                <li><CheckCircle size={20} weight="fill" /> автомобиль ещё в продаже;</li>
                <li><CheckCircle size={20} weight="fill" /> цена и комплектация не изменились;</li>
                <li><CheckCircle size={20} weight="fill" /> продавец готов к осмотру и оформлению сделки.</li>
              </ul>
            </div>
            {/* После отправки пустое поле не оставляем: показывать нечего. */}
            {(!availabilityRequested || availabilityComment.trim()) && (
              <label className="availability-comment-field">
                <textarea value={availabilityComment} onChange={(event) => setAvailabilityComment(event.target.value)} maxLength={600} disabled={availabilityRequested} aria-label="Комментарий менеджеру" placeholder="Комментарий менеджеру" />
              </label>
            )}
            <div className="availability-check-actions">
              <button className="primary" type="submit">Уточнить актуальность</button>
              {availabilityRequested && (
                <p className="availability-check-status"><CheckCircle size={20} weight="fill" />{availabilityConfirmed ? "Актуальность подтверждена." : "Запрос отправлен, скоро свяжемся."}</p>
              )}
            </div>
          </form>
        </OrderStageRow>
        <OrderStageRow number={2} title="Осмотр автомобиля" description="Проверим состояние автомобиля перед покупкой." open={expandedStage === 2} locked={!inspectionUnlocked} done={inspectionDone} onToggle={() => setExpandedStage(expandedStage === 2 ? 0 : 2)}>
          {order.inspectionStatus === "decision" ? (
            <><p>Заказать осмотр перед покупкой?</p><div className="customer-order-actions"><button className="primary" type="button" disabled={saving} onClick={() => applyAction("order_inspection")}>Заказать осмотр</button><button className="order-text-action" type="button" disabled={saving} onClick={() => applyAction("skip_inspection")}>Пропустить</button></div></>
          ) : order.inspectionStatus === "requested" ? (
            <div className="customer-order-notice"><CheckCircle size={21} weight="fill" /><p><b>Осмотр заказан.</b><span>Подтвердим стоимость и срок в выбранном вами канале связи.</span></p></div>
          ) : (
            <div className="customer-order-notice"><CheckCircle size={21} weight="fill" /><p><b>Осмотр пропущен.</b><span>Решение сохранено, можно перейти к договору.</span></p></div>
          )}
        </OrderStageRow>
        <OrderStageRow number={3} title="Договор" description="Подготовим и согласуем договор доставки." open={expandedStage === 3} locked={!contractUnlocked} done={contractDone} onToggle={() => setExpandedStage(expandedStage === 3 ? 0 : 3)}>
          {contractDone ? (
            <div className="customer-order-notice"><CheckCircle size={21} weight="fill" /><p><b>Договор согласован.</b><span>Переходим к счёту и выкупу автомобиля.</span></p></div>
          ) : (
            <><p>Данные уже заполнены из профиля. Подтвердите автомобиль и условия.</p><div className="contract-summary"><span>{user.name}</span><span>{formatAccountPhone(user.phone)}</span><span>{order.car.title}</span></div><div className="customer-order-actions"><button className="primary" type="button" disabled={saving} onClick={() => applyAction("confirm_contract")}>Согласовать договор</button><button className="order-text-action" type="button" onClick={() => navigate("/payment-and-contract")}>Посмотреть условия</button></div></>
          )}
        </OrderStageRow>
        <OrderStageRow number={4} title="Оплата и выкуп" description="Сформируем счёт и подтвердим выкуп автомобиля." open={expandedStage === 4} locked={!paymentUnlocked} done={order.paymentStatus === "invoice_requested"} onToggle={() => setExpandedStage(expandedStage === 4 ? 0 : 4)}>
          {order.paymentStatus === "invoice_requested" ? (
            <div className="customer-order-notice"><CheckCircle size={21} weight="fill" /><p><b>Запрос на счёт получен.</b><span>После проверки цены продавца счёт появится здесь.</span></p></div>
          ) : (
            <><p>Сначала подтвердим актуальную цену продавца, затем подготовим счёт.</p>{order.car.estimatedTotalUsd && <div className="order-estimate"><span>Ориентировочно до Минска</span><b>≈ {money(order.car.estimatedTotalUsd, currency)}</b></div>}<button className="primary" type="button" disabled={saving} onClick={() => applyAction("request_invoice")}>Запросить счёт</button></>
          )}
        </OrderStageRow>
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {availabilityPausedOpen && <AvailabilityPausedModal onClose={() => setAvailabilityPausedOpen(false)} />}
      {removalOpen && <OrderRemovalModal carTitle={order.car.title} orderNumber={order.orderNumber} saving={saving} error={removalError} onCancel={() => { setRemovalOpen(false); setRemovalError(""); }} onConfirm={removeOrder} />}
      {quickViewModal}
    </section>
  );
}

function AccountLogoutModal({ pending, onCancel, onConfirm }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, pending]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !pending && onCancel()}>
      <section className="lead-modal order-removal-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="account-logout-title" aria-describedby="account-logout-description">
        <button className="modal-close" type="button" onClick={onCancel} disabled={pending} aria-label="Закрыть"><X size={19} /></button>
        <h2 id="account-logout-title">Выйти из аккаунта?</h2>
        <p id="account-logout-description">Заказ и избранные автомобили сохранятся — вы вернётесь к ним при следующем входе.</p>
        <div className="order-removal-actions">
          <button className="secondary" type="button" onClick={onCancel} disabled={pending}>Отмена</button>
          <button className="invert-button" type="button" onClick={onConfirm} disabled={pending}>{pending ? "Выходим…" : "Выйти из аккаунта"}</button>
        </div>
      </section>
    </div>
  );
}

function AccountPage({ user, cars, apiMode, favorites, toggleFavorite, authBackend, navigate, onLogout, onSaveProfile, onDeleteAccount, pending }) {
  const [section, setSection] = useState("order");
  const [removalOpen, setRemovalOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [removalError, setRemovalError] = useState("");
  const [profile, setProfile] = useState(() => profileFromUser(user));
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  useEffect(() => {
    setProfile(profileFromUser(user));
  }, [user]);
  const setProfileValue = (field, value) => {
    setProfile((current) => ({ ...current, [field]:value }));
    setProfileSaved(false);
  };
  const updateProfileField = (field) => (event) => setProfileValue(field, event.target.value);
  const confirmRemoval = async (password) => {
    setRemovalError("");
    try {
      await onDeleteAccount(password);
    } catch (error) {
      setRemovalError(error.message === "invalid_credentials" ? "Неверный пароль." : authMessages[error.message] || "Не удалось удалить аккаунт.");
    }
  };
  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileSaved(false);
    if (profile.name.trim().length < 2) return setProfileError(authMessages.invalid_name);
    if (profile.preferredContact === "email" && !profile.email.trim()) return setProfileError(authMessages.email_required);
    if (profile.preferredContact === "telegram" && !profile.telegram.trim()) return setProfileError(authMessages.telegram_required);
    try {
      await onSaveProfile(profile);
      setProfileSaved(true);
    } catch (error) {
      setProfileError(authMessages[error.message] || "Не удалось сохранить данные.");
    }
  };
  return (
    <main className="account-page">
      <header className="account-heading">
        <h1>Здравствуйте, {user.name.split(" ")[0]}</h1>
        <button className="secondary account-logout" onClick={() => setLogoutOpen(true)} disabled={pending}><SignOut size={18} /> Выйти</button>
      </header>
      <div className="account-layout">
        <aside className="account-sidebar">
          <div className="account-sidebar-user">
            <b>{user.name.slice(0,1).toUpperCase()}</b>
            <div><strong>{user.name}</strong><span>{formatAccountPhone(user.phone)}</span></div>
            <button type="button" className="account-delete" onClick={() => { setRemovalError(""); setRemovalOpen(true); }} aria-label="Удалить аккаунт" title="Удалить аккаунт"><Trash size={18} /></button>
          </div>
          <nav className="account-navigation" aria-label="Разделы личного кабинета">
            <button type="button" className={section === "order" ? "active" : ""} aria-current={section === "order" ? "page" : undefined} onClick={() => setSection("order")}><ClipboardText size={21} weight="duotone" /><span>Заказ</span></button>
            <button type="button" className={section === "profile" ? "active" : ""} aria-current={section === "profile" ? "page" : undefined} onClick={() => setSection("profile")}><UserCircle size={21} weight="duotone" /><span>Личные данные</span></button>
          </nav>
        </aside>
        <div className="account-content">
        {/* Both panels stay mounted and are toggled with `hidden`: remounting the
            order panel replayed its fetch, so every switch flashed the loading
            row and the page height jumped. */}
        <div className="account-tabpanel" hidden={section !== "order"}>
          <CustomerOrdersPanel user={user} cars={cars} apiMode={apiMode} favorites={favorites} toggleFavorite={toggleFavorite} authBackend={authBackend} navigate={navigate} />
        </div>
        <div className="account-tabpanel" hidden={section !== "profile"}>
          <form className="account-section profile-editor account-profile-section" onSubmit={saveProfile}>
            <div className="account-section-heading">
              <span>Личные данные</span>
            </div>
            <div className="profile-fields">
              <label className="auth-field"><span>Имя и фамилия</span><input autoComplete="name" value={profile.name} onChange={updateProfileField("name")} maxLength={80} required /></label>
              <label className="auth-field profile-phone"><span>Телефон для входа</span><input value={formatAccountPhone(user.phone)} disabled /></label>
              <label className="auth-field"><span>Email</span><input type="email" autoComplete="email" value={profile.email} onChange={updateProfileField("email")} placeholder="name@example.com" maxLength={160} /></label>
              <label className="auth-field"><span>Telegram</span><div className="profile-input-prefix"><b>@</b><input value={profile.telegram} onChange={updateProfileField("telegram")} placeholder="username" maxLength={80} /></div></label>
              <label className="auth-field"><span>Город</span><input autoComplete="address-level2" value={profile.city} onChange={updateProfileField("city")} placeholder="Например, Минск" maxLength={120} /></label>
              <div className="auth-field"><span>Как удобнее связаться</span><SelectField className="profile-contact-select" label="Как удобнее связаться" value={preferredContactLabel(profile.preferredContact)} options={preferredContactLabels} onChange={(label) => setProfileValue("preferredContact", preferredContactValue(label))} /></div>
            </div>
            {/* В местном режиме профиль сохраняется в браузере посетителя, поэтому
                паспортных полей там нет: их место — только база под шифрованием. */}
            {authBackend !== "local" && <details className="profile-extra">
              <summary>
                <span>Дополнительные поля</span>
                <CaretDown className="profile-extra-caret" size={18} />
              </summary>
              <div className="profile-fields profile-extra-fields">
                <label className="auth-field"><span>Серия и номер паспорта</span><input value={profile.passportNumber} onChange={updateProfileField("passportNumber")} placeholder="Например, MP1234567" maxLength={20} /></label>
                <label className="auth-field"><span>Личный номер</span><input value={profile.personalNumber} onChange={updateProfileField("personalNumber")} placeholder="Например, 1234567A001PB1" maxLength={20} /></label>
                <label className="auth-field"><span>Дата выдачи</span><input type="date" value={profile.passportIssueDate} onChange={updateProfileField("passportIssueDate")} /></label>
                <label className="auth-field"><span>Кем выдан</span><input value={profile.passportIssuedBy} onChange={updateProfileField("passportIssuedBy")} placeholder="Наименование органа" maxLength={200} /></label>
                <label className="auth-field"><span>Адрес регистрации</span><input autoComplete="street-address" value={profile.registrationAddress} onChange={updateProfileField("registrationAddress")} placeholder="Населённый пункт, улица, дом, квартира" maxLength={240} /></label>
              </div>
            </details>}
            {profileError && <div className="auth-error" role="alert">{profileError}</div>}
            <div className="profile-actions"><button className="primary" type="submit" disabled={pending}>Сохранить изменения</button>{profileSaved && <p role="status"><CheckCircle size={18} weight="fill" /> Данные сохранены</p>}</div>
          </form>
        </div>
        </div>
      </div>
      {logoutOpen && <AccountLogoutModal pending={pending} onCancel={() => setLogoutOpen(false)} onConfirm={onLogout} />}
      {removalOpen && (
        <AccountRemovalModal
          pending={pending}
          error={removalError}
          onCancel={() => { setRemovalOpen(false); setRemovalError(""); }}
          onConfirm={confirmRemoval}
        />
      )}
    </main>
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
const rememberMetaRequest = (key, request) => {
  // Неудачу не запоминаем, иначе следующий выбор фильтра больше не попробует.
  request.catch(() => metaRequests.delete(key));
  metaRequests.set(key, request);
  return request;
};
// Запрос справочника, начатый в index.html до загрузки этого файла: подхватываем его,
// чтобы не спрашивать то же самое второй раз.
if (window.__boot?.meta) rememberMetaRequest(String(window.__boot.metaQuery || ""), window.__boot.meta);
const requestCatalogMeta = (query = "") => {
  const key = String(query);
  if (!metaRequests.has(key)) rememberMetaRequest(key, fetchCarsJson(`/api/catalog/meta${key ? `?${key}` : ""}`));
  return metaRequests.get(key);
};
// Тот же справочник, но уже готовым ответом: если загрузочный запрос успел ответить до
// первой отрисовки, панель фильтров показывает все поля сразу, а не достраивается.
const bootCatalogMeta = (query = "") => (window.__boot?.metaValue && String(window.__boot.metaQuery || "") === String(query) ? window.__boot.metaValue : null);
const EMPTY_CATALOG_META = { brands: [], models: [], bodyTypes: [], drives: [], availability: {} };
// Строка запроса справочника: те же три признака и в каталоге, и в поиске на главной.
const catalogMetaQuery = (type, brand, bodyType) => {
  const query = new URLSearchParams();
  if (type && type !== "Все") query.set("type", type);
  if (brand && brand !== "Все марки") query.set("brand", brand);
  appendMulti(query, "bodyType", bodyType, ANY_BODY_TYPE);
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
  const { path, navigate, backToCatalog } = useRoute();
  const authRoute = path === "/login" || path === "/register";
  const storedAuthBackground = window.history.state?.fromPath;
  const authBackgroundPath =
    typeof storedAuthBackground === "string" &&
    storedAuthBackground.startsWith("/") &&
    !["/login", "/register", "/account", "/favorites", "/searches"].includes(storedAuthBackground) &&
    !storedAuthBackground.startsWith("/orders/")
      ? storedAuthBackground
      : "/";
  const dataPath = authRoute ? authBackgroundPath : path;
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
  // Режим цен: включённый переключатель — цены по льготной квоте, выключенный —
  // с пошлиной 15%. Выбор запоминается в браузере, расчёту цен он передаётся
  // отдельно: тот держит его в модуле, чтобы не тянуть флаг через все карточки.
  const [quotaPricingOn, setQuotaPricingOn] = useState(isEvQuotaPricingOn);
  const quotaPricing = useMemo(() => ({
    on: quotaPricingOn,
    available: evQuotaPricingAvailable(),
    set: (on) => {
      rememberEvQuotaPricing(on);
      setPricingQuotaOver(!on);
      setQuotaPricingOn(on);
    },
  }), [quotaPricingOn]);
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
  const [catalogTotal, setCatalogTotal] = useState(0);
  // Дата последней актуализации каталога — как и total, последнее известное значение
  // годится как заглушка, пока ответ каталога в пути.
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState("");
  // Запомненные значения — валюту, размер каталога и дату обновления — читаем из
  // хранилища только после оживления страницы. Главную собирает и сервер, у которого
  // хранилища нет: прочитай мы их прямо в первом рисовании, серверная и браузерная
  // разметка разошлись бы, и React перерисовал бы всю страницу заново.
  useEffect(() => {
    if (window.localStorage.getItem("navostok-currency") === "USD") setCurrency("USD");
    const storedTotal = Number(window.localStorage.getItem(catalogTotalKey)) || 0;
    if (storedTotal) setCatalogTotal((current) => current || storedTotal);
    const storedUpdatedAt = window.localStorage.getItem(catalogUpdatedKey) || "";
    if (storedUpdatedAt) setCatalogUpdatedAt((current) => current || storedUpdatedAt);
  }, []);
  const [loading, setLoading] = useState(true);
  const [routeLoading, setRouteLoading] = useState(() => Boolean(targetId) && !bootCarSync(targetId));
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
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authPending, setAuthPending] = useState(false);
  const [authBackend, setAuthBackend] = useState("server");
  // Заказы посетителя нужны не только в кабинете: на карточке уже заказанной машины
  // кнопка меняется на «Добавлено в заказ». Держим здесь список её номеров.
  const [orderedListings, setOrderedListings] = useState(EMPTY_ORDERED_LISTINGS);
  const publishOrderedListings = useCallback((orders) => setOrderedListings(orderedListingsFrom(orders)), []);
  // Метрика засчитывает первый заход сама при запуске счётчика. Дальше страницы
  // меняются без перезагрузки, и о каждом переходе ей нужно сказать отдельно —
  // иначе весь визит выглядит как одна страница.
  const metrikaStarted = useRef(false);
  useEffect(() => {
    if (path !== "/analytics") trackEvent("page_view");
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
          setCars(initialCars.map(normalizeImportedCar));
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
            setCars(initialCars.map(normalizeImportedCar));
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
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false);
      });
    return () => controller.abort();
  }, [apiMode, targetId, cars, loading]);
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
      // В аналитику уходит только факт регистрации и способ (сервер или местный режим).
      // Имя и телефон живут в таблице аккаунтов — единственном месте, откуда их берёт
      // защищённый раздел: подделать их запросом со стороны там нельзя.
      if (mode === "register") trackEvent("registration_completed", { properties:{ source } });
    };
    try {
      if (authBackend === "local") {
        const localUser = await localAuthenticate(mode, values);
        complete(localUser, "local");
        return;
      }
      let response;
      try {
        response = await fetchWithRetry(`/api/auth/${mode === "register" ? "register" : "login"}`, { method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify(values) });
      } catch {
        setAuthBackend("local");
        const localUser = await localAuthenticate(mode, values);
        complete(localUser, "local");
        return;
      }
      if (response.status === 404) {
        setAuthBackend("local");
        const localUser = await localAuthenticate(mode, values);
        complete(localUser, "local");
        return;
      }
      // Сервер жив, но временно сбоит: честная ошибка вместо местного аккаунта,
      // который разошёлся бы с настоящим.
      if (transientStatuses.has(response.status)) throw new Error("auth_failed");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "auth_failed");
      complete(payload.user, "server");
    } finally {
      setAuthPending(false);
    }
  };
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
  const authModalOpen = !authLoading && !user && (authRoute || path === "/account" || path === "/favorites" || path === "/searches");
  const contentPath = authRoute || authModalOpen ? authBackgroundPath : path;
  // Ключ каталога. Обычно он равен адресу — так каждый раздел создаётся заново
  // и читает свой фильтр. Но когда на раздел увёл фильтр самого каталога, ключ
  // оставляем прежним: выдача уже та, что нужна, и пересоздание только мигало бы
  // заглушками. Метку ставит каталог, а гасит её отрисовка ниже.
  const catalogKey = useRef(contentPath);
  if (isCatalogPath(contentPath) && catalogFilterMoveTarget !== contentPath) catalogKey.current = contentPath;
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
      <HowItWorksPage navigate={navigate} />
    ) : contentPath === "/delivered" ? (
      <DeliveredCarsPage navigate={navigate} />
    ) : contentPath === "/payment-and-contract" ? (
      <PaymentAndContractPage navigate={navigate} />
    ) : contentPath === "/guarantees" ? (
      <GuaranteesPage navigate={navigate} />
    ) : contentPath === "/faq" ? (
      <FaqPage navigate={navigate} />
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
    ) : findModelPage(contentPath) ? (
      // Страница модели запрашивает свой срез каталога сама и не ждёт boot-запроса.
      <ModelPage modelPage={findModelPage(contentPath)} navigate={navigate} favorites={favorites} toggleFavorite={toggleFavorite} />
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
    ) : !showAccountFromAuthRoute && contentPath === "/" && !loadError ? (
      <Home navigate={navigate} cars={cars} apiMode={apiMode} catalogTotal={catalogTotal} catalogUpdatedAt={catalogUpdatedAt} favorites={favorites} toggleFavorite={toggleFavorite} loading={loading} />
    ) : !showAccountFromAuthRoute && isCatalogPath(contentPath) && !loadError ? (
      // Catalog issues its own filtered query, so it starts at mount rather than queueing
      // behind the boot request it never reads.
      // Страница марки, типа двигателя или кузова — тот же каталог с выставленным
      // фильтром и своим заголовком: отдельной вёрстки у неё нет.
      //
      // `key` по адресу обязателен. Фильтры каталог берёт из адреса один раз, при
      // создании, а при переходе с одного раздела на другой React оставил бы тот же
      // экземпляр: заголовок менялся, а выдача оставалась от прежней марки. С разным
      // ключом каждый раздел создаётся заново и читает свой фильтр.
      <Catalog key={catalogKey.current} navigate={navigate} cars={cars} apiMode={apiMode} favorites={favorites} toggleFavorite={toggleFavorite} saveSearch={saveSearch} updateSavedSearch={updateSavedSearch} deleteSavedSearch={deleteSavedSearch} savedSearches={savedSearches} landing={findCatalogLanding(contentPath)} />
    ) : !showAccountFromAuthRoute && detailId && findCarByListing(cars, detailId) ? (
      // Машина уже известна (встроена в страницу или успела прийти) — карточку
      // рисуем сразу, не дожидаясь остального каталога: его ждёт только блок
      // похожих, а он умеет дорисоваться. Проверка кабинета обязательна, как у
      // главной и каталога: без неё вошедший со страницы машины видел бы карточку
      // вместо личного кабинета — detailId на адресах входа берётся из фона.
      <Detail car={findCarByListing(cars, detailId)} cars={cars} apiMode={apiMode} navigate={navigate} backToCatalog={backToCatalog} favorite={hasFavoriteListing(favorites, detailId)} favorites={favorites} toggleFavorite={toggleFavorite} />
    ) : loading || routeLoading ? (
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
    <CurrencyContext.Provider value={currency}>
     <SetCurrencyContext.Provider value={setCurrency}>
     <OrderedListingsContext.Provider value={orderedListings}>
     <SetOrderedListingsContext.Provider value={publishOrderedListings}>
      <ClientSeo path={path} car={findCarByListing(cars, detailId)} landing={findCatalogLanding(path)} />
      <div className="app-content" aria-hidden={authModalOpen ? "true" : undefined} inert={authModalOpen ? true : undefined}>
        <Header
          navigate={navigate}
          favoritesCount={favorites.size}
          savedSearchesCount={savedSearches.length}
          path={path}
          currency={currency}
          setCurrency={setCurrency}
          user={user}
          theme={theme}
          toggleTheme={() => {
            const nextTheme = theme === "dark" ? "light" : "dark";
            // Если выбранное совпало с системным оформлением, запоминаем не саму тему,
            // а «как в системе»: тогда сайт снова следует за настройками устройства,
            // и вернуться к ним можно тем же переключателем, без скрытых настроек.
            if (nextTheme === systemTheme) {
              window.localStorage.removeItem("abcars-theme");
              setThemeMode("system");
              return;
            }
            window.localStorage.setItem("abcars-theme", nextTheme);
            setThemeMode(nextTheme);
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
          redirectTo={pendingFavorite || path === "/favorites" ? "/favorites" : pendingSavedSearch || path === "/searches" ? "/searches" : "/account"}
        />
      )}
     </SetOrderedListingsContext.Provider>
     </OrderedListingsContext.Provider>
     </SetCurrencyContext.Provider>
    </CurrencyContext.Provider>
    </QuotaPricingContext.Provider>
  );
}
