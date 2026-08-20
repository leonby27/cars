import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, BatteryHigh, BookmarkSimple, CalendarBlank, CarProfile, CaretDown, CaretRight, ChatCircleText, Check, CheckCircle, ClipboardText, Clock, Copy, CurrencyCny, DotsThreeVertical, Engine, EnvelopeSimple, Eye, EyeSlash, Gauge, Gear, Heart, Images, Info, InstagramLogo, Lightning, List, ListChecks, LinkSimple, LockKey, MagnifyingGlass, MapPin, Moon, Rows, ShieldCheck, SignOut, SlidersHorizontal, Sparkle, SquaresFour, SteeringWheel, Sun, TelegramLogo, Tire, Trash, UserCircle, X } from "@phosphor-icons/react";
import { matchesYearRange, sortCars } from "./car-filters.js";
import { FEED_CANDIDATE_WINDOW, seededRandom, shuffleCars, varietyOrder, varietyScore } from "./car-variety.js";
import { estimateLandedCost, PRICING } from "./pricing.js";
import { estimateDeliveryDays } from "./china-logistics.js";
import { BODY_TYPES, normalizeBodyType } from "./body-types.js";
import { ANY_DRIVE, DRIVE_TYPES, normalizeDrive, orderDrives } from "./drive-types.js";
import { carAnchorSelector, clearCatalogReturn, feedAnchorSelector, readCatalogReturn, readHomeSearchReturn, saveCatalogReturn, saveCatalogReturnScroll, saveHomeSearchReturn } from "./catalog-return.js";
import { formatListingAge, getSourceListedAt } from "./listing-age.js";
import { selectSimilarCars } from "./similar-cars.js";
import { buildVehicleQuickInfo } from "./vehicle-quick-info.js";
import { translateTechnicalSpecs } from "./spec-translations.js";
import { formatRoundedListingCount } from "./catalog-count.js";
import { COMPANY } from "./company-data.js";
import { DELIVERY_CASES, DELIVERY_STATS } from "./delivery-cases.js";
import { FAQ_GROUPS, HOME_FAQ, HOME_ORDER_STEPS, PAYMENT_STAGES, RESPONSIBILITY_ITEMS } from "./purchase-info.js";
import { trackEvent } from "./analytics.js";
import { AnalyticsPage } from "./analytics-page.jsx";

const number = (value) => new Intl.NumberFormat("ru-RU").format(value);
const uniqueSorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru"));
const CurrencyContext = createContext("USD");
// Валюту переключают не только в шапке: в быстром просмотре шапка недоступна,
// поэтому сеттер доступен из любого места дерева.
const SetCurrencyContext = createContext(null);
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
const useSetCurrency = () => useContext(SetCurrencyContext);

const displayValue = (value, fallback = "Не указано") => (value === null || value === undefined || value === "" ? fallback : value);
const cityNames = {
  东莞: "Дунгуань",
  中山: "Чжуншань",
  临汾: "Линьфэнь",
  乐山: "Лэшань",
  佛山: "Фошань",
  保定: "Баодин",
  包头: "Баотоу",
  北京: "Пекин",
  南京: "Нанкин",
  南宁: "Наньнин",
  合肥: "Хэфэй",
  呼和浩特: "Хух-Хото",
  哈尔滨: "Харбин",
  唐山: "Таншань",
  大连: "Далянь",
  天津: "Тяньцзинь",
  太原: "Тайюань",
  安阳: "Аньян",
  宜昌: "Ичан",
  广州: "Гуанчжоу",
  廊坊: "Ланфан",
  惠州: "Хуэйчжоу",
  成都: "Чэнду",
  昆明: "Куньмин",
  晋中: "Цзиньчжун",
  晋城: "Цзиньчэн",
  朝阳市: "Чаоян",
  柳州: "Лючжоу",
  武汉: "Ухань",
  沈阳: "Шэньян",
  沧州: "Цанчжоу",
  河源: "Хэюань",
  济南: "Цзинань",
  深圳: "Шэньчжэнь",
  温州: "Вэньчжоу",
  潍坊: "Вэйфан",
  牡丹江: "Муданьцзян",
  珠海: "Чжухай",
  盘锦: "Паньцзинь",
  眉山: "Мэйшань",
  石家庄: "Шицзячжуан",
  绵阳: "Мяньян",
  苏州: "Сучжоу",
  营口: "Инкоу",
  襄阳: "Сянъян",
  西安: "Сиань",
  贵阳: "Гуйян",
  达州: "Дачжоу",
  运城: "Юньчэн",
  邢台: "Синтай",
  邯郸: "Ханьдань",
  郑州: "Чжэнчжоу",
  重庆: "Чунцин",
  锦州: "Цзиньчжоу",
  长春: "Чанчунь",
  长沙: "Чанша",
  长治: "Чанчжи",
};
const translateCity = (value) => cityNames[value] || displayValue(value);
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
const filterNumber = (value) => Number(String(value).replace(/\D/g, "")) || 0;
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
const matchesAdvancedFilters = (car, { drive, owners, battery = ANY_BATTERY, condition = ANY_CONDITION }) => (drive === ANY_DRIVE || car.drive === drive) && (owners === ANY_OWNERS || Number(car.owners) <= filterNumber(owners)) && (battery === ANY_BATTERY || Number(car.battery) >= batteryFloor(battery)) && (condition === ANY_CONDITION || car.conditionGrade === conditionGrades[condition]);
const ownerOptions = [ANY_OWNERS, "1 владелец", "До 2 владельцев"];
// Сеед перемешивания уходит в адрес запроса каталога. Полностью случайный делал адрес
// уникальным для каждого посетителя, поэтому общий кэш по нему не срабатывал никогда.
// Дюжины вариантов достаточно, чтобы выдача не выглядела одинаковой у всех, и при этом
// адреса повторяются — ответ отдаётся из кэша, а не собирается в базе заново.
const CATALOG_SHUFFLE_SEEDS = 12;
const randomShuffleSeed = () => `s${Math.floor(Math.random() * CATALOG_SHUFFLE_SEEDS)}`;
const proxiedImageHosts = new Set(["image-public.guazistatic.com", "image-oversea.guazistatic-global.com"]);
const imageSource = (source) => {
  if (!source) return source;
  try {
    const url = new URL(source);
    // Static preview hosts do not have the image-proxy API; use the original
    // allowlisted source there so catalog images remain visible.
    return proxiedImageHosts.has(url.hostname) && import.meta.env.BASE_URL === "/" ? `/api/image?src=${encodeURIComponent(url.href)}` : source;
  } catch {
    return source;
  }
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
    title: `${car.brand} ${model} ${car.year}`,
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

// Дата последней сверки карточки с источником (npm run refresh пишет её в
// last_checked_at); у карточек, которые ещё ни разу не сверяли, — дата импорта.
function formatCheckedAgo(value) {
  const at = new Date(value || "");
  if (!Number.isFinite(at.getTime())) return null;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(at)) / 86400000);
  if (days <= 0) return "Обновлено сегодня";
  if (days === 1) return "Обновлено вчера";
  return `Обновлено ${days} ${pluralRu(days, "день", "дня", "дней")} назад`;
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
const matchingCatalogReturn = () => {
  const stored = readCatalogReturn();
  return stored && stored.search === window.location.search ? stored : null;
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
    if (appPath(window.location.pathname) === "/catalog") saveCatalogReturnScroll(window.scrollY, window.location.search);
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
      const stored = (state.catalog || path !== "/catalog") ? null : matchingCatalogReturn();
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
    const currentPath = appPath(window.location.pathname);
    const targetPath = appPath(target.pathname);
    const keepScrollPosition = preserveScroll || targetPath === "/login" || targetPath === "/register";
    const targetUrl = `${basePath}${target.pathname}${target.search}${target.hash}`;
    dropScrollSave();
    if (replace) {
      const currentIsAuthRoute = currentPath === "/login" || currentPath === "/register";
      replaceHistoryEntry(
        { ...window.history.state, fromPath: currentIsAuthRoute ? window.history.state?.fromPath || "/" : currentPath, scrollY: window.scrollY },
        targetUrl,
      );
    } else {
      patchHistoryState({ scrollY: window.scrollY });
      // Свежий заход в каталог (меню, ссылка с главной) — не возврат: прошлый
      // снимок фильтров к этому экрану уже не относится.
      if (targetPath === "/catalog" && !catalogState) clearCatalogReturn();
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
    if (window.history.state?.fromPath === "/catalog") {
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

function AppLink({ href, navigate, onClick, children, ...props }) {
  const handleClick = (event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  return <a href={appHref(href)} onClick={handleClick} {...props}>{children}</a>;
}

// Карточка должна вести себя как ссылка целиком: правый клик по любому её месту
// открывает системное меню ссылки, а не картинки, а средняя кнопка и ⌘-клик уводят
// в новую вкладку силами браузера. Обычный клик отдаём обработчику карточки — он
// успевает запомнить позицию возврата в каталог. Заголовок карточки и так ссылка,
// поэтому подложку убираем и с клавиатуры, и из скринридеров, чтобы не дублировать.
function CardLinkOverlay({ car, open }) {
  return <AppLink className="card-link-overlay" href={`/cars/${car.id}`} navigate={open} onClick={(event) => event.stopPropagation()} tabIndex={-1} aria-hidden="true" />;
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
  "/": ["Автомобили из Китая в Беларусь — evcars.by", "Автомобили с пробегом из Китая с проверкой, расчётом стоимости и доставкой в Минск и Беларусь."],
  "/catalog": ["Автомобили с пробегом из Китая — каталог и цены | evcars.by", "Каталог автомобилей с пробегом из Китая: электромобили и гибриды, характеристики, пробег и ориентировочная стоимость доставки в Беларусь."],
  "/how-it-works": ["О сервисе покупки автомобилей из Китая | evcars.by", "Проверка объявления и автомобиля, договор, оплата, выкуп, доставка и выдача автомобиля из Китая в Минске."],
  "/about": ["О сервисе доставки автомобилей из Китая | evcars.by", "evcars.by помогает выбрать, проверить, выкупить и доставить автомобиль с пробегом из Китая в Беларусь."],
  "/delivered": ["Доставленные автомобили из Китая — примеры и цены | evcars.by", "Примеры автомобилей, доставленных из Китая в Беларусь: маршрут, сроки, пробег и итоговая стоимость до Минска."],
  "/payment-and-contract": ["Оплата и договор при покупке авто из Китая | evcars.by", "Этапы оплаты автомобиля из Китая, условия договора, состав стоимости, ответственность сторон и документы."],
  "/guarantees": ["Гарантии при покупке автомобиля из Китая | evcars.by", "Что проверяется и фиксируется при покупке автомобиля из Китая, за что отвечает evcars.by и какие риски обсуждаются до договора."],
  "/faq": ["Вопросы о покупке и доставке авто из Китая | evcars.by", "Ответы о проверке, стоимости, оплате, сроках доставки, таможенном оформлении и покупке автомобиля из Китая в Беларуси."],
  "/contacts": ["Контакты evcars.by — автомобили из Китая в Минске", "Контакты сервиса evcars.by в Минске. Консультация по выбору, проверке, покупке и доставке автомобиля из Китая."],
  "/privacy": ["Политика конфиденциальности | evcars.by", "Политика обработки и защиты персональных данных пользователей сайта evcars.by."],
  "/terms": ["Условия использования сайта | evcars.by", "Условия использования каталога evcars.by, предварительных расчётов и информации об автомобилях из Китая."],
};

const privateRouteSeo = {
  "/favorites": ["Избранные автомобили | evcars.by", "Сохранённые автомобили в вашем личном кабинете evcars.by."],
  "/searches": ["Мои поиски | evcars.by", "Сохранённые поиски автомобилей в вашем личном кабинете evcars.by."],
  "/login": ["Вход в личный кабинет | evcars.by", "Вход в личный кабинет клиента evcars.by."],
  "/register": ["Регистрация личного кабинета | evcars.by", "Создание личного кабинета клиента evcars.by."],
  "/account": ["Личный кабинет | evcars.by", "Заказы, избранные автомобили и личные данные клиента evcars.by."],
};

function ClientSeo({ path, car, landing }) {
  useEffect(() => {
    const privatePage = ["/favorites", "/searches", "/login", "/register", "/account", "/analytics"].includes(path) || path.startsWith("/orders/");
    const detailTitle = car?.title || (car ? `${car.brand} ${car.model} ${car.year}` : null);
    const landingSeo = landing
      ? landing.model
        ? [`${landing.brand} ${landing.model} с пробегом из Китая — цены | evcars.by`, `${landing.count} предложений ${landing.brand} ${landing.model} с пробегом: характеристики, цены и предварительный расчёт доставки до Минска.`]
        : [`Автомобили ${landing.brand} из Китая — каталог и цены | evcars.by`, `${landing.count} автомобилей ${landing.brand} из Китая: модели, пробег, характеристики и ориентировочная стоимость доставки в Беларусь.`]
      : null;
    const [title, description] = detailTitle
      ? [`${detailTitle}, ${number(car.mileage)} км — цена до Минска | evcars.by`, `${detailTitle}: пробег ${number(car.mileage)} км, ${String(car.type || "автомобиль").toLowerCase()}. Проверка и предварительный расчёт цены до Минска.`]
      : landingSeo || privateRouteSeo[path] || (path.startsWith("/orders/") ? ["Заказ автомобиля | evcars.by", "Оформление и статус заказа автомобиля в личном кабинете evcars.by."] : null) || routeSeo[path] || ["Страница не найдена | evcars.by", "Запрошенная страница не найдена."];
    const canonicalRoot = document.querySelector('link[rel="canonical"]')?.href || `${window.location.origin}${import.meta.env.BASE_URL}`;
    const canonicalBase = new URL(canonicalRoot);
    canonicalBase.pathname = "/";
    canonicalBase.search = "";
    canonicalBase.hash = "";
    // Без косой черты на конце — как отвечает хостинг и как ведут внутренние ссылки.
    // С чертой первоисточник указывал на адрес, с которого посетителя перебрасывают.
    const canonicalPath = detailTitle ? `/cars/${encodeURIComponent(car.id)}` : path === "/" ? "/" : path.replace(/\/+$/, "");
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
    ensureMeta('meta[name="description"]', "content", description);
    ensureMeta('meta[name="robots"]', "content", indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow, noarchive");
    ensureMeta('meta[property="og:title"]', "content", title);
    ensureMeta('meta[property="og:description"]', "content", description);
    ensureMeta('meta[property="og:url"]', "content", canonical);
    ensureMeta('meta[name="twitter:title"]', "content", title);
    ensureMeta('meta[name="twitter:description"]', "content", description);
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

function SiteLogo() {
  return (
    <>
      <img className="wordmark-image wordmark-image-light" src="/logo-light.svg" width="480" height="100" alt="" aria-hidden="true" />
      <img className="wordmark-image wordmark-image-dark" src="/logo-dark.svg" width="480" height="100" alt="" aria-hidden="true" />
    </>
  );
}

function Header({ navigate, favoritesCount, savedSearchesCount, path, currency, setCurrency, user, theme, toggleTheme }) {
  const catalogActive = path === "/catalog" || path.startsWith("/catalog/") || path.startsWith("/cars/") || path.startsWith("/orders/");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

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
        <AppLink className="wordmark" href="/" navigate={navigate} onClick={playRefreshPulse} aria-label="evcars.by — на главную">
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
                <AppLink href="/contacts" navigate={navigate} className={path === "/contacts" ? "active" : ""} aria-current={path === "/contacts" ? "page" : undefined}>Контакты</AppLink>
                {/* На узких экранах кнопке «Мои поиски» в шапке не хватает места,
                    поэтому там она живёт в этом меню; на широких — прячется, чтобы
                    не дублировать кнопку рядом с избранным. */}
                <AppLink href="/searches" navigate={navigate} className={`header-menu-searches${path === "/searches" ? " active" : ""}`} aria-current={path === "/searches" ? "page" : undefined}>
                  Мои поиски{savedSearchesCount > 0 ? ` · ${savedSearchesCount}` : ""}
                </AppLink>
              </nav>
              <div className="header-menu-settings">
                <CurrencySwitch currency={currency} setCurrency={setCurrency} className="header-menu-currency" />
              </div>
          </div>
        </div>
        <div className="header-actions">
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
            aria-current={path === "/searches" ? "page" : undefined}
            onClick={() => (user ? navigate("/searches") : navigate("/register", { replace:true, preserveScroll:true }))}
          >
            <BookmarkSimple size={21} weight={savedSearchesCount ? "fill" : "bold"} />
            <span>Мои поиски</span>
            {savedSearchesCount > 0 && <b>{savedSearchesCount}</b>}
          </button>
          <button
            className={`icon-label favorites-link${path === "/favorites" ? " selected" : ""}`}
            aria-current={path === "/favorites" ? "page" : undefined}
            onClick={() => (user ? navigate("/favorites") : navigate("/register", { replace:true, preserveScroll:true }))}
          >
            <Heart size={21} weight={favoritesCount ? "fill" : "bold"} />
            <span>Избранное</span>
            {favoritesCount > 0 && <b>{favoritesCount}</b>}
          </button>
          <button
            className={`icon-label account-link${path === "/account" || path === "/login" || path === "/register" ? " selected" : ""}`}
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

function SelectField({ label, value, options, onChange, searchable = false, multiple = false, className = "", disabled = false, formatOption = (item) => item, optionCounts, optionIcon }) {
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
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    if (!searchable || !normalizedQuery) return options;
    return options.filter((item) => item.toLocaleLowerCase("ru").includes(normalizedQuery));
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

  return (
    <div className={`select-field custom-select${className ? ` ${className}` : ""}${open ? " open" : ""}${disabled ? " disabled" : ""}`} ref={rootRef}>
      <button ref={triggerRef} type="button" className="select-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={disabled ? false : open} aria-controls={listId} disabled={disabled} onClick={() => (open ? close() : setOpen(true))} onKeyDown={handleKeyDown}>
        <b>{multiple ? (chosenInOrder.length ? `${formatOption(chosenInOrder[0])}${chosenInOrder.length > 1 ? ` +${chosenInOrder.length - 1}` : ""}` : formatOption(allOption)) : formatOption(value)}</b>
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

function VehicleSearch({ constrained = false, selectedType, onTypeChange, values, actions, options, optionCounts, availability, resultCount, onSubmit, onReset, onSaveSearch, searchSaved = false, searchUpdate = false, hasActiveFilters = false, initiallyExpanded = false }) {
  const currency = useCurrency();
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(() => initiallyExpanded && !window.matchMedia("(max-width: 700px)").matches);
  const extraFiltersId = useId();
  const mobileFiltersId = useId();

  useEffect(() => {
    if (!moreFiltersOpen || !window.matchMedia("(max-width: 700px)").matches) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => event.key === "Escape" && setMoreFiltersOpen(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreFiltersOpen]);

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
      <SelectField className={className} label="Пробег" value={values.mileage} onChange={actions.mileage} options={mileageOptions} />
      <SelectField className={className} label="Кузов" value={values.bodyType} onChange={actions.bodyType} options={options.bodyTypes} multiple />
      {Number(availability.drive) > 0 && <SelectField className={className} label="Привод" value={values.drive} onChange={actions.drive} options={options.drives} />}
      {Number(availability.owners) > 0 && <SelectField className={className} label="Владельцы" value={values.owners} onChange={actions.owners} options={ownerOptions} />}
      {Number(availability.battery) > 0 && <SelectField className={className} label="Батарея" value={values.battery} onChange={actions.battery} options={batteryOptions} />}
      {Number(availability.condition) > 0 && <SelectField className={className} label="Состояние" value={values.condition} onChange={actions.condition} options={conditionOptions} />}
    </>
  );

  return (
    <section className={`search-box${constrained ? " search-box--constrained" : ""}`}>
      <div className="type-tabs">
        {["Все", "Электромобили", "Гибриды"].map((item) => (
          <button type="button" key={item} className={selectedType === item ? "active" : ""} onClick={() => onTypeChange(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="filter-primary-row unified-filter-primary">
        <SelectField label="Марка" value={values.brand} onChange={actions.brand} options={options.brands} optionCounts={optionCounts?.brands} optionIcon={(brand) => (brand === "Все марки" ? <SquaresFour size={18} weight="fill" /> : <BrandMark brand={brand} />)} searchable />
        <SelectField label="Модель" value={values.model} onChange={actions.model} options={options.models} optionCounts={optionCounts?.models} searchable multiple disabled={values.brand === "Все марки"} />
        {yearRange("mobile-sheet-filter-source")}
        {priceRange("mobile-sheet-filter-source")}
      </div>
      {moreFiltersOpen && (
        <>
          <div className="filter-extra-row desktop-filter-extra" id={extraFiltersId}>
            {extraFilters()}
          </div>
          <div className="mobile-filter-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setMoreFiltersOpen(false)}>
            <section className="mobile-filter-sheet" id={mobileFiltersId} role="dialog" aria-modal="true" aria-labelledby={`${mobileFiltersId}-title`}>
              <div className="mobile-filter-sheet-handle" aria-hidden="true" />
              <header className="mobile-filter-sheet-header">
                <h2 id={`${mobileFiltersId}-title`}>Фильтры</h2>
                <button type="button" onClick={() => setMoreFiltersOpen(false)} aria-label="Закрыть фильтры">
                  <X size={20} weight="bold" />
                </button>
              </header>
              <div className="mobile-filter-sheet-fields">
                {yearRange()}
                {priceRange()}
                {extraFilters()}
              </div>
              <footer className="mobile-filter-sheet-actions">
                {hasActiveFilters && <button type="button" className="search-reset" onClick={onReset}>Сбросить</button>}
                <button type="button" className="primary" onClick={() => setMoreFiltersOpen(false)}>Готово</button>
              </footer>
            </section>
          </div>
        </>
      )}
      <div className="filter-actions-row">
        <button type="button" className="more-filters-toggle" aria-expanded={moreFiltersOpen} aria-controls={`${extraFiltersId} ${mobileFiltersId}`} onClick={() => setMoreFiltersOpen((open) => !open)}>
          <SlidersHorizontal size={17} />
          <span className="more-filters-toggle-label">{moreFiltersOpen ? "Скрыть фильтры" : "Ещё фильтры"}</span>
          <CaretDown size={15} weight="bold" />
        </button>
        {hasActiveFilters && onSaveSearch && (
          <button
            type="button"
            className={`search-save${searchSaved ? " saved" : ""}`}
            onClick={onSaveSearch}
            aria-label={searchSaved ? "Поиск сохранён" : searchUpdate ? "Обновить поиск" : "Сохранить поиск"}
            title={searchSaved ? "Поиск сохранён — открыть «Мои поиски»" : searchUpdate ? "Записать изменения в сохранённый поиск" : "Сохранить поиск"}
          >
            <BookmarkSimple size={18} weight={searchSaved ? "fill" : "bold"} />
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
    </section>
  );
}

function QuickSearch({ navigate, cars, apiMode, totalCount }) {
  const [type, setType] = useState("Все");
  const [brand, setBrand] = useState("Все марки");
  const [model, setModel] = useState([]);
  const [bodyType, setBodyType] = useState([]);
  const [yearMin, setYearMin] = useState(ANY_YEAR_MIN);
  const [yearMax, setYearMax] = useState(ANY_YEAR_MAX);
  const [mileage, setMileage] = useState(ANY_MILEAGE);
  const [priceMin, setPriceMin] = useState(ANY_PRICE_MIN);
  const [priceMax, setPriceMax] = useState(ANY_PRICE_MAX);
  const [drive, setDrive] = useState(ANY_DRIVE);
  const [owners, setOwners] = useState(ANY_OWNERS);
  const [battery, setBattery] = useState(ANY_BATTERY);
  const [condition, setCondition] = useState(ANY_CONDITION);
  const [remoteMeta, setRemoteMeta] = useState({
    brands: [],
    models: [],
    bodyTypes: [],
    drives: [],
    availability: {},
  });
  // null — число для текущих фильтров ещё не посчитано: кнопка показывает
  // «Показать авто» без цифры вместо мгновенного «0 авто» при переключении.
  const [remoteCount, setRemoteCount] = useState(null);
  const countCacheRef = useRef(new Map());
  const normalizedType = type === "Электромобили" ? "Электромобиль" : type === "Гибриды" ? "Гибрид" : "Все";
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
  const availability = apiMode
    ? remoteMeta.availability
    : {
        drive: cars.filter((car) => car.drive && car.drive !== "Не указан").length,
        owners: cars.filter((car) => Number(car.owners)).length,
        battery: cars.filter((car) => Number(car.battery) > 0).length,
        condition: cars.filter((car) => conditionLabels[car.conditionGrade]).length,
      };
  const mileageCap = Number(mileage.replace(/\D/g, ""));
  const resultCount = modelCars.filter((car) => matchesMulti(car.model, model, ANY_MODEL) && matchesYears(car, yearMin, yearMax) && (mileage === ANY_MILEAGE || car.mileage <= mileageCap) && matchesPriceRange(car, priceMin, priceMax) && matchesAdvancedFilters(car, { drive, owners, battery, condition })).length;
  const hasActiveFilters = type !== "Все" || brand !== "Все марки" || multiValues(model, ANY_MODEL).length > 0 || multiValues(bodyType, ANY_BODY_TYPE).length > 0 || hasYearRange(yearMin, yearMax) || mileage !== ANY_MILEAGE || hasPriceRange(priceMin, priceMax) || drive !== ANY_DRIVE || owners !== ANY_OWNERS || battery !== ANY_BATTERY || condition !== ANY_CONDITION;
  useEffect(() => {
    // Ждать загрузочный запрос незачем: справочник нужен сразу и уходит параллельно
    // с витриной. Останавливает его только выясненный статический режим.
    if (apiMode === false) return undefined;
    const metaQuery = new URLSearchParams();
    const carsQuery = new URLSearchParams({ limit: "1" });
    if (normalizedType !== "Все") {
      metaQuery.set("type", normalizedType);
      carsQuery.set("type", normalizedType);
    }
    if (brand !== "Все марки") {
      metaQuery.set("brand", brand);
      carsQuery.set("brand", brand);
    }
    appendMulti(metaQuery, "bodyType", bodyType, ANY_BODY_TYPE);
    appendMulti(carsQuery, "bodyType", bodyType, ANY_BODY_TYPE);
    appendMulti(carsQuery, "model", model, ANY_MODEL);
    appendYearRange(carsQuery, yearMin, yearMax);
    if (mileage !== ANY_MILEAGE) carsQuery.set("mileageMax", String(mileageCap));
    appendPriceRange(carsQuery, priceMin, priceMax);
    if (drive !== ANY_DRIVE) carsQuery.set("drive", drive);
    if (owners !== ANY_OWNERS) carsQuery.set("ownersMax", String(filterNumber(owners)));
    if (battery !== ANY_BATTERY) carsQuery.set("batteryMin", String(batteryFloor(battery)));
    if (condition !== ANY_CONDITION) carsQuery.set("conditionGrade", conditionGrades[condition]);
    // Числа для уже виденных комбинаций фильтров помним: повторное переключение
    // показывает счётчик сразу, без мигания. Прячем цифру только на первый подсчёт —
    // чужое число (или «0») на кнопке хуже, чем секунда без числа.
    const countKey = carsQuery.toString();
    const cached = countCacheRef.current.get(countKey);
    setRemoteCount(cached ?? null);
    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        // Пока ни один фильтр не выбран, кнопка показывает общее число из загрузочного
        // запроса, поэтому считать то же самое второй раз незачем.
        const [meta, catalog] = await Promise.all([
          requestCatalogMeta(metaQuery.toString()),
          hasActiveFilters ? fetchCarsJson(`/api/cars?${carsQuery}`, controller.signal) : null,
        ]);
        if (cancelled) return;
        setRemoteMeta(meta);
        if (catalog) {
          countCacheRef.current.set(countKey, catalog.total);
          setRemoteCount(catalog.total);
        }
      } catch {}
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [apiMode, hasActiveFilters, normalizedType, brand, model, bodyType, yearMin, yearMax, mileageCap, priceMin, priceMax, drive, owners, battery, condition]);
  const changeType = (value) => {
    setType(value);
    setModel([]);
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
    setYearMin(ANY_YEAR_MIN);
    setYearMax(ANY_YEAR_MAX);
    setMileage(ANY_MILEAGE);
    setPriceMin(ANY_PRICE_MIN);
    setPriceMax(ANY_PRICE_MAX);
    setDrive(ANY_DRIVE);
    setOwners(ANY_OWNERS);
    setBattery(ANY_BATTERY);
    setCondition(ANY_CONDITION);
  };
  return (
    <VehicleSearch
      constrained
      selectedType={type}
      onTypeChange={changeType}
      values={{ brand, model, yearMin, yearMax, priceMin, priceMax, mileage, bodyType, drive, owners, battery, condition }}
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
        bodyType: (value) => {
          setBodyType(value);
          setModel([]);
        },
        drive: setDrive,
        owners: setOwners,
        battery: setBattery,
        condition: setCondition,
      }}
      options={{ brands, models, bodyTypes, drives }}
      optionCounts={{ brands:brandOptionCounts, models:modelOptionCounts }}
      availability={availability}
      resultCount={hasActiveFilters ? (apiMode ? remoteCount : resultCount) : (totalCount || cars.length) ? formatRoundedListingCount(totalCount || cars.length) : null}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      onSubmit={() => navigate(`/catalog?type=${encodeURIComponent(type)}&brand=${encodeURIComponent(brand)}${multiValues(model, ANY_MODEL).map((item) => `&model=${encodeURIComponent(item)}`).join("")}${multiValues(bodyType, ANY_BODY_TYPE).map((item) => `&body=${encodeURIComponent(item)}`).join("")}${yearBound(yearMin, ANY_YEAR_MIN) === null ? "" : `&yearFrom=${yearMin}`}${yearBound(yearMax, ANY_YEAR_MAX) === null ? "" : `&yearTo=${yearMax}`}&mileage=${encodeURIComponent(mileage)}${priceBound(priceMin, ANY_PRICE_MIN) === null ? "" : `&priceFrom=${priceMin}`}${priceBound(priceMax, ANY_PRICE_MAX) === null ? "" : `&priceTo=${priceMax}`}&drive=${encodeURIComponent(drive)}&owners=${encodeURIComponent(owners)}&battery=${encodeURIComponent(battery)}&condition=${encodeURIComponent(condition)}`)}
    />
  );
}

// Быстрый поиск на главной: строка вида «Zeekr 001 2025» разбирается на марку,
// модель и годы по тому же справочнику, которым живут выпадающие фильтры, а
// найденное сразу подменяет витрину «Каталог» ниже — сервер ничего нового не считает.
const HERO_SEARCH_YEAR_PATTERN = /^(19|20)\d{2}$/;
const searchNormalize = (value) => String(value ?? "").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^0-9a-zа-я]+/g, " ").replace(/\s+/g, " ").trim();
const searchMatchRank = (candidate, text) => {
  const norm = searchNormalize(candidate);
  const compact = norm.replace(/ /g, "");
  const textCompact = text.replace(/ /g, "");
  if (!compact || !textCompact) return 0;
  if (norm === text || compact === textCompact) return 4;
  if (norm.startsWith(text) || compact.startsWith(textCompact)) return 3;
  if (norm.includes(` ${text}`)) return 2;
  if (compact.includes(textCompact)) return 1;
  return 0;
};
const rankSearchEntries = (entries, text) =>
  entries
    .map((entry) => ({ ...entry, rank: searchMatchRank(entry.name, text) }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank || b.count - a.count);

// Словари запроса: привод, кузов и тип двигателя словами — «задний», «седан»,
// «гибрид». Сравниваем по началу слова, чтобы понимались и падежи с множественным
// числом («заднего», «седаны»). Значения совпадают с вариантами выпадающих фильтров.
const HERO_DRIVE_ALIASES = [
  ["задн", "Задний"],
  ["передн", "Передний"],
  ["полн", "Полный"],
  ["rwd", "Задний"],
  ["fwd", "Передний"],
  ["awd", "Полный"],
  ["4wd", "Полный"],
  ["4x4", "Полный"],
];
const HERO_BODY_ALIASES = [
  ["кроссовер", "SUV / кроссовер"],
  ["suv", "SUV / кроссовер"],
  ["джип", "SUV / кроссовер"],
  ["внедорожник", "SUV / кроссовер"],
  ["седан", "Седан"],
  ["лифтбек", "Лифтбек"],
  ["хэтчбек", "Хэтчбек"],
  ["хетчбек", "Хэтчбек"],
  ["универсал", "Универсал"],
  ["минивэн", "Минивэн"],
  ["минивен", "Минивэн"],
];
const HERO_TYPE_ALIASES = [
  ["электро", "Электромобиль"],
  ["гибрид", "Гибрид"],
];
const heroAliasValue = (word, aliases) => {
  for (const [alias, value] of aliases) if (word.startsWith(alias)) return value;
  return "";
};

// Соответствие клавиш латинской и русской раскладок: «яуулк» — это zeekr,
// набранный без переключения. Карта работает в обе стороны.
const LAYOUT_PAIRS = [
  ["q", "й"], ["w", "ц"], ["e", "у"], ["r", "к"], ["t", "е"], ["y", "н"], ["u", "г"], ["i", "ш"], ["o", "щ"], ["p", "з"], ["[", "х"], ["]", "ъ"],
  ["a", "ф"], ["s", "ы"], ["d", "в"], ["f", "а"], ["g", "п"], ["h", "р"], ["j", "о"], ["k", "л"], ["l", "д"], [";", "ж"], ["'", "э"],
  ["z", "я"], ["x", "ч"], ["c", "с"], ["v", "м"], ["b", "и"], ["n", "т"], ["m", "ь"], [",", "б"], [".", "ю"],
];
const LAYOUT_SWAP = new Map();
for (const [latin, cyrillic] of LAYOUT_PAIRS) {
  LAYOUT_SWAP.set(latin, cyrillic);
  LAYOUT_SWAP.set(cyrillic, latin);
}
const swapKeyboardLayout = (value) => [...String(value ?? "").toLocaleLowerCase("ru")].map((char) => LAYOUT_SWAP.get(char) || char).join("");

// Русские написания марок: каталог хранит латиницу, а посетители часто пишут
// кириллицей — «ауди», «мерс», «зикр». Многословные варианты стоят раньше
// коротких, чтобы «джили галакси» не обрывалось на «джили».
const HERO_BRAND_RU = [
  ["джили галакси", "Geely Galaxy"],
  ["ли авто", "Li Auto"],
  ["линк энд ко", "Lynk & Co"],
  ["линк ко", "Lynk & Co"],
  ["лип мотор", "Leapmotor"],
  ["аион", "AION"],
  ["эйон", "AION"],
  ["ауди", "Audi"],
  ["аватр", "Avatr"],
  ["аватар", "Avatr"],
  ["бмв", "BMW"],
  ["бид", "BYD"],
  ["дипал", "Deepal"],
  ["денза", "Denza"],
  ["дунфэн", "Dongfeng"],
  ["дунфен", "Dongfeng"],
  ["донгфенг", "Dongfeng"],
  ["джили", "Geely Galaxy"],
  ["гили", "Geely Galaxy"],
  ["хима", "HIMA"],
  ["хунци", "Hongqi"],
  ["хонгци", "Hongqi"],
  ["липмотор", "Leapmotor"],
  ["лисян", "Li Auto"],
  ["ликсян", "Li Auto"],
  ["линк", "Lynk & Co"],
  ["мазда", "Mazda"],
  ["мерседес", "Mercedes-Benz"],
  ["мерс", "Mercedes-Benz"],
  ["нио", "NIO"],
  ["ора", "ORA"],
  ["тесла", "Tesla"],
  ["тойота", "Toyota"],
  ["тоета", "Toyota"],
  ["фольксваген", "Volkswagen"],
  ["фольцваген", "Volkswagen"],
  ["воях", "Voyah"],
  ["воя", "Voyah"],
  ["икспенг", "XPeng"],
  ["сяопенг", "XPeng"],
  ["сяопэн", "XPeng"],
  ["сяоми", "Xiaomi"],
  ["ксиаоми", "Xiaomi"],
  ["шаоми", "Xiaomi"],
  ["зикр", "Zeekr"],
  ["зикер", "Zeekr"],
  ["зеекр", "Zeekr"],
];
// Заменяет русские названия марок на каталожные. Недописанное слово от четырёх
// букв тоже считается («фолькс» → Volkswagen).
const translateBrandWords = (words) => {
  const result = [];
  for (let index = 0; index < words.length; index += 1) {
    let replacement = null;
    let consumed = 1;
    for (const [alias, brandName] of HERO_BRAND_RU) {
      const aliasWords = alias.split(" ");
      const slice = words.slice(index, index + aliasWords.length);
      if (slice.length !== aliasWords.length) continue;
      const exact = aliasWords.every((part, position) => slice[position] === part);
      const prefix = aliasWords.length === 1 && slice[0].length >= 4 && aliasWords[0].startsWith(slice[0]);
      if (exact || prefix) {
        replacement = brandName;
        consumed = aliasWords.length;
        break;
      }
    }
    if (replacement) {
      result.push(...searchNormalize(replacement).split(" "));
      index += consumed - 1;
    } else {
      result.push(words[index]);
    }
  }
  return result;
};

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

async function parseHeroSearchOnce(query, { apiMode, cars }) {
  const tokens = searchNormalize(query).split(" ").filter(Boolean);
  if (!tokens.length) return null;
  // Номер объявления (например, 59116012) — ищем эту конкретную машину.
  // Год — четыре цифры, так что с ним такой номер не спутать.
  const idToken = tokens.find((token) => /^\d{6,}$/.test(token));
  if (idToken) return { matched: true, listingId: idToken, brand: "", models: [], yearFrom: "", yearTo: "", drive: "", bodyType: "", powertrain: "" };
  const yearTokens = tokens.filter((token) => HERO_SEARCH_YEAR_PATTERN.test(token)).sort();
  const rawWords = tokens.filter((token) => !HERO_SEARCH_YEAR_PATTERN.test(token));
  // Каталог фильтрует только по годам из своего списка — остальные не навязываем,
  // иначе выдача молча показала бы не то, что просили.
  const yearFrom = yearSteps.includes(yearTokens[0]) ? yearTokens[0] : "";
  const lastYear = yearTokens[yearTokens.length - 1];
  const yearTo = yearSteps.includes(lastYear) ? lastYear : "";

  // Сначала выбираем из запроса слова про привод, кузов и тип двигателя,
  // остаток текста ищем как марку и модель.
  let drive = "";
  let bodyType = "";
  let powertrain = "";
  const words = [];
  for (const word of rawWords) {
    // Само слово «привод» ничего не уточняет — направление уже назвало соседнее слово.
    if (word.startsWith("привод")) continue;
    const driveValue = heroAliasValue(word, HERO_DRIVE_ALIASES);
    if (driveValue) {
      drive = driveValue;
      continue;
    }
    const bodyValue = heroAliasValue(word, HERO_BODY_ALIASES);
    if (bodyValue) {
      bodyType = bodyValue;
      continue;
    }
    const typeValue = heroAliasValue(word, HERO_TYPE_ALIASES);
    if (typeValue) {
      powertrain = typeValue;
      continue;
    }
    words.push(word);
  }

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

  const text = translateBrandWords(words).join(" ");
  const result = { matched: false, brand: "", models: [], yearFrom, yearTo, drive, bodyType, powertrain };
  if (!text) {
    result.matched = Boolean(yearFrom || yearTo || drive || bodyType || powertrain);
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
    const matchedModels = rankSearchEntries(models, modelText).slice(0, 12).map((entry) => entry.name);
    if (!matchedModels.length) {
      // Марку узнали, а остаток текста ни на одну её модель не похож —
      // честнее показать пустую выдачу, чем все машины марки.
      result.brand = "";
      return result;
    }
    result.models = matchedModels;
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
  const modelMatches = rankSearchEntries(modelEntries, text).slice(0, 12);
  if (modelMatches.length) {
    result.models = modelMatches.map((entry) => entry.name);
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
  if (parsed.powertrain) params.set("type", parsed.powertrain === "Гибрид" ? "Гибриды" : "Электромобили");
  if (parsed.brand) params.set("brand", parsed.brand);
  parsed.models.forEach((model) => params.append("model", model));
  if (parsed.bodyType) params.append("body", parsed.bodyType);
  if (parsed.yearFrom) params.set("yearFrom", parsed.yearFrom);
  if (parsed.yearTo) params.set("yearTo", parsed.yearTo);
  if (parsed.drive) params.set("drive", parsed.drive);
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
  yearMin: ANY_YEAR_MIN,
  yearMax: ANY_YEAR_MAX,
  mileage: ANY_MILEAGE,
  priceMin: ANY_PRICE_MIN,
  priceMax: ANY_PRICE_MAX,
  drive: ANY_DRIVE,
  owners: ANY_OWNERS,
  battery: ANY_BATTERY,
  condition: ANY_CONDITION,
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
      ? multiValues(value ?? [], key === "model" ? ANY_MODEL : ANY_BODY_TYPE)
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
  if (filters.type !== "Все") chips.push(filters.type === "Электромобиль" ? "Электромобили" : "Гибриды");
  const models = multiValues(filters.model, ANY_MODEL);
  if (filters.brand !== "Все марки") chips.push(models.length ? `${filters.brand} ${models.join(", ")}` : filters.brand);
  multiValues(filters.bodyType, ANY_BODY_TYPE).forEach((body) => chips.push(body));
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
  if (filters.type !== "Все") params.set("type", filters.type === "Электромобиль" ? "Электромобили" : "Гибриды");
  if (filters.brand !== "Все марки") params.set("brand", filters.brand);
  multiValues(filters.model, ANY_MODEL).forEach((model) => params.append("model", model));
  multiValues(filters.bodyType, ANY_BODY_TYPE).forEach((body) => params.append("body", body));
  if (yearBound(filters.yearMin, ANY_YEAR_MIN) !== null) params.set("yearFrom", filters.yearMin);
  if (yearBound(filters.yearMax, ANY_YEAR_MAX) !== null) params.set("yearTo", filters.yearMax);
  if (filters.mileage !== ANY_MILEAGE) params.set("mileage", filters.mileage);
  if (priceBound(filters.priceMin, ANY_PRICE_MIN) !== null) params.set("priceFrom", filters.priceMin);
  if (priceBound(filters.priceMax, ANY_PRICE_MAX) !== null) params.set("priceTo", filters.priceMax);
  if (filters.drive !== ANY_DRIVE) params.set("drive", filters.drive);
  if (filters.owners !== ANY_OWNERS) params.set("owners", filters.owners);
  if (filters.battery !== ANY_BATTERY) params.set("battery", filters.battery);
  if (filters.condition !== ANY_CONDITION) params.set("condition", filters.condition);
  if (filters.sort && filters.sort !== "default") params.set("sort", filters.sort);
  const search = params.toString();
  return `/catalog${search ? `?${search}` : ""}`;
};
// Запрос числа подходящих машин — те же имена параметров, что собирает каталог.
const savedSearchApiParams = (filters) => {
  const query = new URLSearchParams();
  if (filters.type !== "Все") query.set("type", filters.type);
  if (filters.brand !== "Все марки") query.set("brand", filters.brand);
  appendMulti(query, "model", filters.model, ANY_MODEL);
  appendMulti(query, "bodyType", filters.bodyType, ANY_BODY_TYPE);
  if (filters.drive !== ANY_DRIVE) query.set("drive", filters.drive);
  if (filters.owners !== ANY_OWNERS) query.set("ownersMax", String(filterNumber(filters.owners)));
  if (filters.battery !== ANY_BATTERY) query.set("batteryMin", String(batteryFloor(filters.battery)));
  if (filters.condition !== ANY_CONDITION) query.set("conditionGrade", conditionGrades[filters.condition]);
  appendYearRange(query, filters.yearMin, filters.yearMax);
  if (filters.mileage !== ANY_MILEAGE) query.set("mileageMax", String(filterNumber(filters.mileage)));
  appendPriceRange(query, filters.priceMin, filters.priceMax);
  if (filters.sort && filters.sort !== "default") query.set("sort", filters.sort);
  return query;
};
const matchesSavedFilters = (car, filters) =>
  (filters.type === "Все" || car.type === filters.type) &&
  (filters.brand === "Все марки" || car.brand === filters.brand) &&
  matchesMulti(car.model, filters.model, ANY_MODEL) &&
  matchesMulti(car.bodyType, filters.bodyType, ANY_BODY_TYPE) &&
  matchesYears(car, filters.yearMin, filters.yearMax) &&
  (filters.mileage === ANY_MILEAGE || car.mileage <= filterNumber(filters.mileage)) &&
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
  if (parsed.drive) params.set("drive", parsed.drive);
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
  return (
    <div className="hero-search">
      <div className="hero-search-field" ref={fieldRef}>
        <MagnifyingGlass size={20} weight="bold" />
        <input
          type="search"
          value={value}
          placeholder="Что будем искать сегодня?"
          aria-label="Поиск по каталогу"
          enterKeyHint="search"
          autoComplete="off"
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

function HoverImagePreview({ car, className, mobileStrip = false, onMobileOpen }) {
  const images = (car.images?.length ? car.images : [car.image]).slice(0, 5);
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
      image.src = imageSource(src);
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

  return (
    <div className={`${className} hover-image-preview`} ref={frameRef}>
      <img src={imageSource(images[active])} alt={car.title} draggable="false" />
      {mobileStrip && (
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
          {images.map((image, index) => (
            <img
              src={imageSource(image)}
              alt={index === 0 ? car.title : ""}
              draggable="false"
              loading={index === 0 ? "eager" : "lazy"}
              key={`${image}-mobile-${index}`}
            />
          ))}
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
        <Images size={15} />
        {car.images?.length || 1}
      </span>
    </div>
  );
}

function FeaturedCard({ car, onClick, favorite, toggleFavorite, anchorKey }) {
  const currency = useCurrency();
  const price = estimateLandedCost(car);
  const listingAge = formatListingAge(getSourceListedAt(car));
  return (
    <article className="featured-card" data-car-id={car.id} data-feed-key={anchorKey} onClick={onClick} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()} tabIndex="0" role="button" aria-label={`Открыть ${car.title}`}>
      <CardLinkOverlay car={car} open={onClick} />
      <HoverImagePreview car={car} className="featured-image" />
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
        <h3><AppLink href={`/cars/${car.id}`} navigate={onClick} onClick={(event) => event.stopPropagation()}>{car.title}</AppLink></h3>
        <p>
          {number(car.mileage)} км · {car.type} · {car.drive}
        </p>
        {listingAge && (
          <div className="featured-listing-age">
            <Clock size={15} />
            {listingAge}
          </div>
        )}
        <div className="featured-price">
          <strong>≈ {money(price.totalUsd, currency)}</strong>
        </div>
      </div>
    </article>
  );
}

// Five rows of the four-column grid, matching the home page feed.
const SIMILAR_CARS_BATCH = 20;

function SimilarCars({ car, cars, onOpenCar }) {
  const similarCars = useMemo(() => selectSimilarCars(car, cars), [car, cars]);
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
          Показать ещё
        </button>
      )}
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
  HIMA: "hima.svg",
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
};

// Brands the importer keeps supplying, but the home page showcase leaves out.
// A showcase decision only: the import policy still allows them and their cards
// stay in the catalog, the brand filter, and search.
const showcaseHiddenBrands = new Set(["AION", "Denza", "Dongfeng", "Hongqi", "ORA"]);

// Marks whose own colours are part of the brand. The dark theme inverts logos so
// black artwork stays readable on a dark surface; running that over a red BYD or
// an orange Xiaomi would repaint the brand, so these opt out.
const coloredBrandLogos = new Set(["BMW", "BYD", "Denza", "Dongfeng", "Geely Galaxy", "Hongqi", "Tesla", "Toyota", "Voyah", "Xiaomi"]);

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

function PopularBrands({ navigate, cars, apiMode }) {
  const [remoteBrands, setRemoteBrands] = useState([]);
  const localBrands = useMemo(() => {
    const counts = new Map();
    cars.forEach((car) => counts.set(car.brand, (counts.get(car.brand) || 0) + 1));
    return [...counts].map(([brand, count]) => ({ brand, count }));
  }, [cars]);

  useEffect(() => {
    if (apiMode === false) {
      setRemoteBrands([]);
      return undefined;
    }
    let cancelled = false;
    // Тот же справочник, что запрашивает поиск на главной, поэтому запрос уходит один.
    requestCatalogMeta()
      .then((payload) => { if (!cancelled) setRemoteBrands(payload.brands || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [apiMode]);

  const availableBrands = apiMode && remoteBrands.length ? remoteBrands : localBrands;
  const brandCounts = new Map(availableBrands.map((item) => [item.brand, Number(item.count) || 0]));
  // Before the catalog answers there are no counts at all, and rendering every brand as "0"
  // reads as an empty catalog rather than a pending one.
  const countsKnown = brandCounts.size > 0;
  // Every brand the catalog can show, plus the configured marks that currently
  // have no listings, so the block is the full inventory rather than a preview.
  const brands = [...new Set([...Object.keys(brandLogos), ...availableBrands.map((item) => item.brand)])]
    .filter((brand) => !showcaseHiddenBrands.has(brand))
    .map((brand) => ({ brand, count: brandCounts.get(brand) || 0 }))
    .sort((a, b) => a.brand.localeCompare(b.brand, "en", { sensitivity: "base" }));

  return (
    <section className="popular-brands page-width" aria-labelledby="popular-brands-title">
      <div className="popular-brands-heading">
        <h2 id="popular-brands-title">Популярные марки</h2>
        <AppLink className="popular-brands-all" href="/catalog" navigate={navigate}>
          Все предложения <CaretRight size={20} weight="bold" />
        </AppLink>
      </div>
      <div className="popular-brands-grid">
        {brands.map(({ brand, count }) => (
          <AppLink className="brand-link" key={brand} href={`/catalog?brand=${encodeURIComponent(brand)}`} navigate={navigate} aria-label={countsKnown ? `Перейти к предложениям ${brand}, объявлений: ${number(count)}` : `Перейти к предложениям ${brand}`}>
            <BrandMark brand={brand} />
            <span className="brand-name" title={brand}>{brand}</span>
            <span className="brand-count" aria-hidden="true">{countsKnown ? number(count) : ""}</span>
          </AppLink>
        ))}
      </div>
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

function Home({ navigate, cars, apiMode, catalogTotal, favorites, toggleFavorite, loading }) {
  const batchSize = 20;
  const randomPool = useRef([]);
  const nextItemKey = useRef(0);
  const feedSource = useRef(cars);
  const [useCatalogCards, setUseCatalogCards] = useState(() => window.matchMedia("(max-width: 700px)").matches);
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
      // the previous batch so "Показать ещё" does not seam two similar cards.
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
    navigate(`/cars/${item.car.id}`);
  };

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const updateLayout = () => setUseCatalogCards(media.matches);
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

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
  const [heroQuery, setHeroQuery] = useState(restoredHero?.query || "");
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
        const parsed = await parseHeroSearch(heroQuery, { apiMode, cars });
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
          setHeroSearch(found ? { ...emptyHeroResult, items: [found], total: 1, href: `/cars/${found.id}`, corrected: parsed.correctedQuery || null } : { ...emptyHeroResult });
          return;
        }
        const href = heroCatalogHref(parsed);
        if (apiMode !== false) {
          const apiParams = heroApiParams(parsed);
          // «По умолчанию» — родной порядок сервера; остальное сервер сортирует сам.
          if (heroSort !== "default") apiParams.set("sort", heroSort);
          const apiQuery = apiParams.toString();
          const listParams = new URLSearchParams(apiQuery);
          listParams.set("limit", "24");
          const catalog = await fetchCarsJson(`/api/cars?${listParams}`, controller.signal);
          if (cancelled) return;
          setHeroSearch({ ...emptyHeroResult, items: catalog.items.map(normalizeImportedCar), total: Number(catalog.total) || 0, href, hasMore: Boolean(catalog.hasMore), apiQuery, corrected: parsed.correctedQuery || null });
        } else {
          const modelSet = new Set(parsed.models);
          const matches = cars.filter(
            (car) =>
              (!parsed.brand || car.brand === parsed.brand) &&
              (!modelSet.size || modelSet.has(car.model)) &&
              (!parsed.yearFrom || Number(car.year) >= Number(parsed.yearFrom)) &&
              (!parsed.yearTo || Number(car.year) <= Number(parsed.yearTo)) &&
              (!parsed.drive || car.drive === parsed.drive) &&
              (!parsed.bodyType || car.bodyType === parsed.bodyType) &&
              (!parsed.powertrain || car.type === parsed.powertrain)
          );
          // Карточки из статического каталога не всегда несут готовый итог «до Минска» —
          // для сортировки по цене досчитываем его так же, как избранное.
          const sorted = heroSort === "default" ? matches : sortCars(matches.map((car) => (Number(car.estimatedTotalUsd) ? car : { ...car, estimatedTotalUsd: estimateLandedCost(car).totalUsd })), heroSort);
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
  }, [heroQuery, heroSort, apiMode, cars]);
  const searching = heroSearch !== null;
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
      });
    }
  }, [searching, heroSearch, heroSort, heroQuery]);
  const searchLoading = searching && heroSearch.loading && !heroSearch.items.length;
  const displayItems = searching ? heroSearch.items.map((car) => ({ car, key: `search-${car.id}` })) : feedCars;
  const gridBusy = showSkeletons || searchLoading;
  // Выдача поиска листается бесконечно, как каталог: невидимая метка под карточками
  // попадает в экран — и подгружается следующая пачка.
  const searchMoreTarget = useRef(null);
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
          return { ...state, items: [...state.items, ...batch.filter((car) => !known.has(car.id))], total: Number(catalog.total) || state.total, hasMore: Boolean(catalog.hasMore), loadingMore: false };
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
  useEffect(() => {
    const target = searchMoreTarget.current;
    if (!searching || !target) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMoreSearch();
      },
      { rootMargin: "0px 0px 700px", threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [searching, heroSearch]);

  return (
    <main>
      <section className={searching ? "hero hero--searching" : "hero"}>
        <h1>Доставим б/у авто из Китая в Беларусь</h1>
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
            <AppLink className="section-heading-link" href="/catalog" navigate={navigate}>
              Все автомобили <ArrowRight size={18} />
            </AppLink>
          </div>
        )}
        {searching && (
          <div className="search-results-bar">
            {/* Строка не исчезает на время пересчёта, иначе выдача дёргается при
                каждой букве: пока ищем, держим прежний счёт или «Ищем…». */}
            <div className="search-results-lead">
              <p className="search-results-note">
                {heroSearch.loading && !heroSearch.items.length
                  ? "Ищем…"
                  : heroSearch.total || heroSearch.loading
                    ? `${number(heroSearch.total)} авто`
                    : `По запросу «${heroQuery.trim()}» ничего не нашлось. Попробуйте изменить запрос: марка, модель, год или номер объявления.`}
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
              <div className="result-view-toggle" role="group" aria-label="Вид выдачи">
                <button type="button" className={heroView === "list" ? "active" : ""} aria-pressed={heroView === "list"} aria-label="Показать списком" title="Списком" onClick={() => updateHeroView("list")}>
                  <Rows size={19} />
                </button>
                <button type="button" className={heroView === "grid" ? "active" : ""} aria-pressed={heroView === "grid"} aria-label="Показать карточками" title="Карточками" onClick={() => updateHeroView("grid")}>
                  <SquaresFour size={19} />
                </button>
              </div>
              <AppLink className="primary search-catalog-link" href={heroSearch.href || "/catalog"} navigate={navigate} aria-label="В каталог">
                <span className="search-catalog-link-label">В каталог</span> <ArrowRight size={17} />
              </AppLink>
            </div>
          </div>
        )}
        {/* На телефоне выдача всегда списочными карточками каталога (заголовок и
            цена сверху, лента фото); переключатель вида есть только на широких. */}
        {(searching ? useCatalogCards || heroView === "list" : useCatalogCards) ? (
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
          <div className="featured-grid" aria-busy={gridBusy ? "true" : undefined}>
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
            {heroSearch.hasMore && !heroSearch.loading && !heroSearch.loadingMore && <div ref={searchMoreTarget} className="catalog-scroll-sentinel" aria-hidden="true" />}
          </>
        ) : (
          !showSkeletons && (
            <button type="button" className="load-more featured-load-more" onClick={loadMore}>
              Показать ещё
            </button>
          )
        )}
      </section>
      <HomeConversionSections navigate={navigate} />
      <ScrollToTopButton />
      {quickViewModal}
    </main>
  );
}

function FilterPanel({ filters, setFilters, resultCount, brands, models, bodyTypes, drives, optionCounts, availability, onSaveSearch, searchSaved, searchUpdate }) {
  const update = (key) => (value) => setFilters((old) => ({ ...old, [key]: value }));
  const changeType = (value) => setFilters((old) => ({ ...old, type: value, model: [] }));
  const changeBrand = (value) => setFilters((old) => ({ ...old, brand: value, model: [] }));
  const selectedType = filters.type === "Электромобиль" ? "Электромобили" : filters.type === "Гибрид" ? "Гибриды" : "Все";
  const selectType = (value) => changeType(value === "Электромобили" ? "Электромобиль" : value === "Гибриды" ? "Гибрид" : "Все");
  const hasActiveFilters = filters.type !== "Все" || filters.brand !== "Все марки" || multiValues(filters.model, ANY_MODEL).length > 0 || multiValues(filters.bodyType, ANY_BODY_TYPE).length > 0 || hasYearRange(filters.yearMin, filters.yearMax) || filters.mileage !== ANY_MILEAGE || hasPriceRange(filters.priceMin, filters.priceMax) || filters.drive !== ANY_DRIVE || filters.owners !== ANY_OWNERS || filters.battery !== ANY_BATTERY || filters.condition !== ANY_CONDITION;
  const resetFilters = () => setFilters(() => ({
    type: "Все",
    brand: "Все марки",
    model: [],
    bodyType: [],
    yearMin: ANY_YEAR_MIN,
    yearMax: ANY_YEAR_MAX,
    mileage: ANY_MILEAGE,
    priceMin: ANY_PRICE_MIN,
    priceMax: ANY_PRICE_MAX,
    drive: ANY_DRIVE,
    owners: ANY_OWNERS,
    battery: ANY_BATTERY,
    condition: ANY_CONDITION,
  }));
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
        bodyType: (value) => setFilters((old) => ({ ...old, bodyType: value, model: [] })),
        drive: update("drive"),
        owners: update("owners"),
        battery: update("battery"),
        condition: update("condition"),
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
      initiallyExpanded={filters.mileage !== ANY_MILEAGE || multiValues(filters.bodyType, ANY_BODY_TYPE).length > 0 || filters.drive !== ANY_DRIVE || filters.owners !== ANY_OWNERS || filters.battery !== ANY_BATTERY || filters.condition !== ANY_CONDITION}
    />
  );
}

function CarRow({ car, navigate, favorite, toggleFavorite, onOpen, anchorKey }) {
  const currency = useCurrency();
  const open = () => (onOpen ? onOpen(car) : navigate(`/cars/${car.id}`));
  const price = estimateLandedCost(car);
  const listingAge = formatListingAge(getSourceListedAt(car));
  return (
    <article className="car-row" data-car-id={car.id} data-feed-key={anchorKey} onClick={open} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()} tabIndex="0" role="button" aria-label={`Открыть ${car.title}`}>
      <CardLinkOverlay car={car} open={open} />
      <div className="car-row-mobile-header">
        <div>
          <h2><AppLink href={`/cars/${car.id}`} navigate={open} onClick={(event) => event.stopPropagation()}>{car.title}</AppLink></h2>
          <strong>≈ {money(price.totalUsd, currency)}</strong>
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
      <HoverImagePreview car={car} className="car-row-image" mobileStrip onMobileOpen={open} />
      <div className="car-row-info">
        <div className="row-title">
          <div>
            <h2><AppLink href={`/cars/${car.id}`} navigate={open} onClick={(event) => event.stopPropagation()}>{car.title}</AppLink></h2>
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
          {number(car.mileage)} км · {car.type} · {car.drive} привод
        </p>
        <div className="mini-specs">
          {car.battery && (
            <span>
              <BatteryHigh size={17} />
              {car.battery} кВт·ч
            </span>
          )}
          {car.range && (
            <span>
              <Gauge size={17} />
              {car.range} км
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
        <strong>≈ {money(price.totalUsd, currency)}</strong>
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
          : `${import.meta.env.BASE_URL}data/cars/${encodeURIComponent(id)}.json`;
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
  // На телефоне переключателя нет и выдача всегда списочными карточками.
  const [view, setView] = useState(readCatalogView);
  const [mobileCards] = useState(() => window.matchMedia("(max-width: 700px)").matches);
  const updateView = (value) => {
    setView(value);
    window.localStorage.setItem(catalogViewKey, value);
  };
  const openCar = (car) => {
    if (openQuickView(car)) return;
    navigate(`/cars/${car.id}`);
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
            <div className="result-view-toggle" role="group" aria-label="Вид выдачи">
              <button
                type="button"
                className={view === "list" ? "active" : ""}
                aria-pressed={view === "list"}
                aria-label="Показать списком"
                title="Списком"
                onClick={() => updateView("list")}
              >
                <Rows size={19} />
              </button>
              <button
                type="button"
                className={view === "grid" ? "active" : ""}
                aria-pressed={view === "grid"}
                aria-label="Показать карточками"
                title="Карточками"
                onClick={() => updateView("grid")}
              >
                <SquaresFour size={19} />
              </button>
            </div>
          </div>
        )}
      </div>
      {sortedCars.length ? (
        !mobileCards && view === "grid" ? (
          <div className="featured-grid catalog-card-grid">
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
    navigate(`/cars/${car.id}`);
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

function Catalog({ navigate, favorites, toggleFavorite, cars, apiMode, saveSearch, updateSavedSearch, savedSearches }) {
  const pageSize = 24;
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
  const params = new URLSearchParams(window.location.search);
  const rawType = params.get("type");
  const rawBrand = params.get("brand");
  const rawModels = params.getAll("model");
  const rawBodyTypes = params.getAll("body").flatMap((item) => item.split(","));
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
  const initialFilters = {
    type: rawType === "Электромобили" ? "Электромобиль" : rawType === "Гибриды" ? "Гибрид" : "Все",
    brand: rawBrand && rawBrand !== "Все марки" ? rawBrand : "Все марки",
    model: multiValues(rawModels, ANY_MODEL),
    bodyType: BODY_TYPES.filter((item) => rawBodyTypes.includes(item)),
    yearMin: yearSteps.includes(rawYearFrom || legacyYearFrom) ? rawYearFrom || legacyYearFrom : ANY_YEAR_MIN,
    yearMax: yearSteps.includes(rawYearTo) ? rawYearTo : ANY_YEAR_MAX,
    mileage: mileageOptions.includes(rawMileage) ? rawMileage : ANY_MILEAGE,
    priceMin: priceSteps.includes(rawPriceFrom || legacyPriceFrom) ? rawPriceFrom || legacyPriceFrom : ANY_PRICE_MIN,
    priceMax: priceSteps.includes(rawPriceTo || legacyPriceTo) ? rawPriceTo || legacyPriceTo : ANY_PRICE_MAX,
    drive: DRIVE_TYPES.includes(rawDrive) ? rawDrive : ANY_DRIVE,
    owners: ownerOptions.includes(rawOwners) ? rawOwners : ANY_OWNERS,
    battery: batteryOptions.includes(rawBattery) ? rawBattery : ANY_BATTERY,
    condition: conditionOptions.includes(rawCondition) ? rawCondition : ANY_CONDITION,
  };
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
  const [remoteMeta, setRemoteMeta] = useState({
    brands: [],
    models: [],
    bodyTypes: [],
    drives: [],
    availability: {},
  });
  const [remoteLoading, setRemoteLoading] = useState(useApi);
  const [remoteError, setRemoteError] = useState(false);
  const [customSearchOpen, setCustomSearchOpen] = useState(false);
  // Сортировку может нести и ссылка (например, из сохранённого поиска); снимок
  // истории при возврате важнее — он описывает то, что было на экране.
  const urlSort = sortOptions.some((option) => option.value === params.get("sort")) ? params.get("sort") : "default";
  const [sort, setSort] = useState(() => (sortOptions.some((option) => option.value === restoredCatalog?.sort) ? restoredCatalog.sort : urlSort));
  // "По умолчанию" mixes the catalog the way the home feed does. The seed keeps that
  // mix in place while paging and when a visitor comes back from a vehicle page.
  const [shuffleSeed] = useState(() => restoredCatalog?.shuffleSeed || randomShuffleSeed());
  const [loadedLimit, setLoadedLimit] = useState(() => Math.max(pageSize, Number(restoredCatalog?.loadedCount) || pageSize));
  const restoredOrder = useRef(restoredCatalog?.order || null);
  const [view, setView] = useState(readCatalogView);
  // На телефоне переключателя вида нет и выдача всегда списочными карточками.
  const [mobileCards] = useState(() => window.matchMedia("(max-width: 700px)").matches);
  const { openQuickView, quickViewToggle, quickViewModal } = useVehicleQuickView({ apiMode:useApi, favorites, toggleFavorite, navigate });
  const loadMoreTarget = useRef(null);
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
      loadedCount: Math.max(loadedLimit, remoteCars.length),
      order: remoteCars.slice(0, 600).map((car) => car.id),
    };
    patchHistoryState({ catalog, scrollAnchor, scrollAnchorOffset, openedCarId });
    saveCatalogReturn({ catalog, scrollAnchor, scrollAnchorOffset, openedCarId, scrollY: window.scrollY, search: window.location.search });
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
    navigate(`/cars/${car.id}`);
  };
  const updateFilters = (updater) => {
    loadMoreRequest.current?.abort();
    loadMoreRequest.current = null;
    loadingMore.current = false;
    setLoadedLimit(pageSize);
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
    dropScrollAnchor();
    setSort(value);
  };
  const brands = useApi ? remoteMeta.brands.map((item) => item.brand) : uniqueSorted(cars.map((car) => car.brand));
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
  const availability = useApi
    ? remoteMeta.availability
    : {
        drive: cars.filter((car) => car.drive && car.drive !== "Не указан").length,
        owners: cars.filter((car) => Number(car.owners)).length,
        battery: cars.filter((car) => Number(car.battery) > 0).length,
        condition: cars.filter((car) => conditionLabels[car.conditionGrade]).length,
      };
  const filtered = useMemo(
    () =>
      sortCars(
        cars
          .filter((car) => {
            const mileageCap = Number(filters.mileage.replace(/\D/g, ""));
            return (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand) && matchesMulti(car.model, filters.model, ANY_MODEL) && matchesMulti(car.bodyType, filters.bodyType, ANY_BODY_TYPE) && matchesYears(car, filters.yearMin, filters.yearMax) && (filters.mileage === ANY_MILEAGE || car.mileage <= mileageCap) && matchesPriceRange(car, filters.priceMin, filters.priceMax) && matchesAdvancedFilters(car, filters);
          })
          .map((car) => ({
            ...car,
            estimatedTotalUsd: estimateLandedCost(car).totalUsd,
          })),
        sort,
        shuffleSeed,
      ),
    [filters, cars, sort, shuffleSeed],
  );
  // The API returns the default order already shuffled, but only the client knows what
  // is on screen, so the variety pass that spaces out similar cards runs on each batch.
  // Порядок должен совпадать при повторном входе на страницу, иначе выбранная
  // карточка уезжает в другое место списка. Раньше здесь был Math.random.
  const orderRemoteBatch = (items, preceding = []) => (sort === "default" ? varietyOrder(items, seededRandom(`${shuffleSeed}:${preceding.length}`), preceding) : items);
  // При возврате порядок берём тот, что был на экране: одна выдача на N карточек
  // не повторяет склейку из нескольких страниц «Показать ещё».
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
      offset: "0",
    });
    query.set("sort", sort);
    if (sort === "default") query.set("seed", shuffleSeed);
    if (filters.type !== "Все") query.set("type", filters.type);
    if (filters.brand !== "Все марки") query.set("brand", filters.brand);
    appendMulti(query, "model", filters.model, ANY_MODEL);
    appendMulti(query, "bodyType", filters.bodyType, ANY_BODY_TYPE);
    if (filters.drive !== ANY_DRIVE) query.set("drive", filters.drive);
    if (filters.owners !== ANY_OWNERS) query.set("ownersMax", String(filterNumber(filters.owners)));
    if (filters.battery !== ANY_BATTERY) query.set("batteryMin", String(batteryFloor(filters.battery)));
    if (filters.condition !== ANY_CONDITION) query.set("conditionGrade", conditionGrades[filters.condition]);
    appendYearRange(query, filters.yearMin, filters.yearMax);
    if (filters.mileage !== ANY_MILEAGE) query.set("mileageMax", filters.mileage.replace(/\D/g, ""));
    appendPriceRange(query, filters.priceMin, filters.priceMax);
    return query;
  };
  useEffect(() => {
    if (!useApi) return;
    const controller = new AbortController();
    setRemoteLoading(true);
    setRemoteError(false);
    const query = requestParams();
    const metaQuery = new URLSearchParams();
    if (filters.type !== "Все") metaQuery.set("type", filters.type);
    if (filters.brand !== "Все марки") metaQuery.set("brand", filters.brand);
    appendMulti(metaQuery, "bodyType", filters.bodyType, ANY_BODY_TYPE);
    Promise.all([
      fetch(`/api/cars?${query}`, { signal: controller.signal }).then((response) => (response.ok ? response.json() : Promise.reject(new Error("catalog unavailable")))),
      fetch(`/api/catalog/meta?${metaQuery}`, {
        signal: controller.signal,
      }).then((response) => (response.ok ? response.json() : Promise.reject(new Error("catalog meta unavailable")))),
    ])
      .then(([catalog, meta]) => {
        setRemoteCars(restoreRemoteOrder(catalog.items.map(normalizeImportedCar)));
        setRemoteTotal(catalog.total);
        setRemoteHasMore(Boolean(catalog.hasMore));
        setRemoteMeta(meta);
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
  }, [filters, sort, loadedLimit, remoteCars.length]);
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
      setLoadedLimit((current) => Math.min(current + pageSize, filtered.length));
      return;
    }
    if (loadingMore.current || remoteLoading || !remoteHasMore) return;
    const controller = new AbortController();
    loadMoreRequest.current = controller;
    loadingMore.current = true;
    const query = requestParams();
    query.set("limit", String(pageSize));
    query.set("offset", String(remoteCars.length));
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
  const displayed = useApi ? remoteCars : filtered.slice(0, loadedLimit);
  const resultCount = useApi ? remoteTotal : filtered.length;
  // Until the first page answers there is no count yet, and "0" reads as an empty result.
  const knownResultCount = remoteLoading && !remoteCars.length ? null : resultCount;
  const hasMore = useApi ? remoteHasMore : displayed.length < resultCount;
  useEffect(() => {
    const target = loadMoreTarget.current;
    if (!target || !hasMore || remoteLoading || remoteError) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "0px 0px 700px", threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [useApi, filters, sort, displayed.length, resultCount, remoteLoading, remoteError]);
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
  const baseSearch = (savedSearches || []).find((item) => savedSearchKey(item.filters) === baseSearchKey) || null;
  const searchUpdate = !searchSaved && Boolean(baseSearch);
  const submitSearch = () => {
    if (searchSaved) {
      navigate("/searches");
      return;
    }
    if (baseSearch) updateSavedSearch(baseSearch.id, { ...filters, sort });
    else saveSearch({ ...filters, sort });
    setBaseSearchKey(currentSearchKey);
  };
  return (
    <main className="catalog page-width">
      <div className="breadcrumbs">
        <button onClick={() => navigate("/")}>Главная</button>
        <CaretRight size={13} />
        Автомобили из Китая
      </div>
      <div className="catalog-heading">
        <h1>Автомобили с пробегом из Китая</h1>
      </div>
      <FilterPanel filters={filters} setFilters={updateFilters} resultCount={knownResultCount} brands={brands} models={models} bodyTypes={bodyTypes} drives={drives} optionCounts={{ brands:brandOptionCounts, models:modelOptionCounts }} availability={availability} onSaveSearch={submitSearch} searchSaved={searchSaved} searchUpdate={searchUpdate} />
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
              <div className="result-view-toggle" role="group" aria-label="Вид выдачи">
                <button
                  type="button"
                  className={view === "list" ? "active" : ""}
                  aria-pressed={view === "list"}
                  aria-label="Показать списком"
                  title="Списком"
                  onClick={() => updateView("list")}
                >
                  <Rows size={19} />
                </button>
                <button
                  type="button"
                  className={view === "grid" ? "active" : ""}
                  aria-pressed={view === "grid"}
                  aria-label="Показать карточками"
                  title="Карточками"
                  onClick={() => updateView("grid")}
                >
                  <SquaresFour size={19} />
                </button>
              </div>
            </div>
          </div>
          {remoteError && <div className="catalog-message">Не удалось обновить выдачу. Попробуйте ещё раз.</div>}
          {displayed.length ? (
            !mobileCards && view === "grid" ? (
              <div className="featured-grid catalog-card-grid">
                {displayed.map((car) => (
                  <FeaturedCard key={car.id} car={car} favorite={favorites.has(car.id)} toggleFavorite={toggleFavorite} onClick={() => openCar(car)} />
                ))}
              </div>
            ) : (
              displayed.map((car) => <CarRow key={car.id} car={car} navigate={navigate} favorite={favorites.has(car.id)} toggleFavorite={toggleFavorite} onOpen={openCar} />)
            )
          ) : remoteLoading ? (
            !mobileCards && view === "grid" ? (
              <div className="featured-grid catalog-card-grid">
                {skeletonCards.map((key) => <CardSkeleton key={key} />)}
              </div>
            ) : (
              skeletonCards.map((key) => <CardSkeleton key={key} row />)
            )
          ) : (
            <CustomSearchCta variant="empty" onOpen={() => setCustomSearchOpen(true)} />
          )}
          {remoteLoading && displayed.length > 0 && <div className="catalog-message">Загружаем объявления…</div>}
          {hasMore && !remoteLoading && !remoteError && <div ref={loadMoreTarget} className="catalog-scroll-sentinel" aria-hidden="true" />}
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
      </div>
      <ScrollToTopButton />
      {customSearchOpen && <CustomSearchModal filters={filters} onClose={() => setCustomSearchOpen(false)} />}
      {quickViewModal}
    </main>
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
              <img src={imageSource(image)} alt="" loading={index > 8 ? "lazy" : "eager"} />
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
              <img src={imageSource(image)} alt={`${car.title}, фото ${index + 1}`} loading={index > initialIndex + 2 ? "lazy" : "eager"} />
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
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [slideDirection, setSlideDirection] = useState("idle");
  const swipe = useRef(null);
  const suppressOpen = useRef(false);
  const thumbsRef = useRef(null);
  const move = (step) => {
    setSlideDirection(step > 0 ? "next" : "prev");
    setActive((current) => (current + step + images.length) % images.length);
  };
  const selectImage = (index) => {
    if (index === active) return;
    setSlideDirection(index > active ? "next" : "prev");
    setActive(index);
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
  const onPointerDown = (event) => {
    if (!event.isPrimary) return;
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setDragging(true);
    setDragOffset(0);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event) => {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    const distanceX = event.clientX - start.x;
    const distanceY = event.clientY - start.y;
    if (Math.abs(distanceX) > Math.abs(distanceY)) setDragOffset(distanceX);
  };
  const onPointerUp = (event) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const distanceX = event.clientX - start.x;
    const distanceY = event.clientY - start.y;
    setDragging(false);
    setDragOffset(0);
    if (Math.abs(distanceX) > 8) suppressOpen.current = true;
    if (Math.abs(distanceX) >= 45 && Math.abs(distanceX) > Math.abs(distanceY)) {
      move(distanceX > 0 ? -1 : 1);
    }
    window.setTimeout(() => {
      suppressOpen.current = false;
    }, 0);
  };
  const openGallery = () => {
    if (suppressOpen.current) {
      suppressOpen.current = false;
      return;
    }
    setModalOpen(true);
  };
  const cancelSwipe = () => {
    swipe.current = null;
    setDragging(false);
    setDragOffset(0);
  };
  return (
    <>
      <section className="gallery-panel">
        <button className={`gallery-open${dragging ? " dragging" : ""}`} style={{ "--gallery-drag-x": `${dragOffset}px` }} onClick={openGallery} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={cancelSwipe} aria-label={`Открыть все фотографии ${car.title}. Смахните влево или вправо, чтобы сменить фото`}>
          <img key={`${active}-${images[active]}`} className={`gallery-slide-${slideDirection}`} src={imageSource(images[active])} alt={`${car.title}, фото ${active + 1}`} draggable="false" />
        </button>
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
              <img src={imageSource(image)} alt="" loading="lazy" />
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
  const groups = useMemo(() => translateTechnicalSpecs(car.technicalSpecs), [car.technicalSpecs]);
  const [query, setQuery] = useState("");
  const searchBoxRef = useRef(null);
  const needle = query.trim().toLocaleLowerCase("ru");
  // Выдача поиска — слой поверх аккордеона: сами группы не перестраиваются,
  // поэтому страница не дёргается при наборе (ищем и по названию, и по значению).
  const found = useMemo(() => {
    if (!needle) return [];
    return groups
      .map((group) => ({ ...group, items: group.items.filter((item) => `${item.name} ${item.value}`.toLocaleLowerCase("ru").includes(needle)) }))
      .filter((group) => group.items.length);
  }, [groups, needle]);
  const searching = Boolean(needle);
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
    navigate(`/cars/${candidate.id}`);
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
      <VehicleDetailBody car={car} favorite={favorite} toggleFavorite={toggleFavorite} goBack={goBack} />
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
function ActionTooltip({ text }) {
  const tooltipRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [box, setBox] = useState(null);
  const place = useCallback(() => {
    const tooltip = tooltipRef.current;
    const button = tooltip?.parentElement;
    if (!button) return;
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
    const button = tooltipRef.current?.parentElement;
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
  // Текст меняется на «Ссылка скопирована» — вместе с ним меняется и ширина.
  useEffect(() => {
    if (visible) place();
  }, [text, visible, place]);
  useEffect(() => {
    if (!visible) return undefined;
    const update = () => place();
    window.addEventListener("scroll", update, { passive:true, capture:true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, { capture:true });
      window.removeEventListener("resize", update);
    };
  }, [visible, place]);
  return (
    <span
      ref={tooltipRef}
      className={`detail-action-tooltip${box?.above === false ? " is-below" : ""}${visible ? " is-visible" : ""}`}
      style={box ? { top:`${box.top}px`, left:`${box.left}px` } : undefined}
      aria-hidden="true"
    >
      {text}
    </span>
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

// Серый ряд с номером объявления под карточкой цены: по нему клиент называет
// машину менеджеру, поэтому рядом кнопка «скопировать».
function ListingIdRow({ car }) {
  const [state, setState] = useState("idle");
  useEffect(() => {
    if (state === "idle") return undefined;
    const timer = window.setTimeout(() => setState("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [state]);
  const id = car.sourceId || car.id;
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
    const link = new URL(appHref(`/cars/${car.id}`), window.location.origin).href;
    setState((await copyToClipboard(link)) ? "copied" : "failed");
  };
  return (
    <button type="button" aria-label={hint} onClick={copy}>
      <LinkSimple size={21} />
      <ActionTooltip text={hint} />
    </button>
  );
}

function VehicleDetailBody({ car, favorite, toggleFavorite, goBack = null, openFull = null, floatingCta = true, currencySwitch = false }) {
  const currency = useCurrency();
  const setCurrency = useSetCurrency();
  const [availabilityUnavailableOpen, setAvailabilityUnavailableOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [availabilityCtaVisible, setAvailabilityCtaVisible] = useState(false);
  const availabilityCtaRef = useRef(null);
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
  const openAvailabilityModal = () => {
    trackEvent("availability_click", { listingId:car.id, listingTitle:car.title });
    setAvailabilityUnavailableOpen(true);
  };
  const favoriteHint = favorite ? "Удалить из избранного" : "Добавить в избранное";
  const quickInfo = buildVehicleQuickInfo(car);
  const specs = [
    [CalendarBlank, "Год", car.year],
    [Gauge, "Пробег", `${number(car.mileage)} км`],
    [Lightning, "Тип", car.type],
    [CarProfile, "Привод", car.drive],
    [BatteryHigh, "Батарея", car.battery ? `${car.battery} кВт·ч` : "Не указана"],
    [CarProfile, "Кузов", car.bodyType],
  ];
  // Блок отчёта продавца заполнен только у Guazi; у Che168 все поля пусты, а тип
  // батареи и так виден в «Полных характеристиках». Пустые строки не показываем,
  // а без единой строки исчезает и весь блок — вместе с дисклеймером-заглушкой.
  const sourceClaims = translateClaims(car.claims || car.incident);
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
          <div className="detail-title-line">
            {goBack && (
              <button type="button" className="detail-back" aria-label="Назад" onClick={goBack}>
                <ArrowLeft size={20} />
                <ActionTooltip text="Назад" />
              </button>
            )}
            <h1>{car.title}</h1>
            {openFull && (
              <AppLink className="detail-back detail-open-full" href={`/cars/${car.id}`} navigate={openFull} aria-label="Открыть полную страницу автомобиля">
                <ArrowUpRight size={20} />
                <ActionTooltip text="Открыть полную страницу" />
              </AppLink>
            )}
          </div>
          <strong className="detail-mobile-price">
            {approximateMoney(price.totalLow, price.totalHigh, currency)}
          </strong>
          <p>
            {car.type} · {car.drive} привод · {number(car.mileage)} км
            {formatCheckedAgo(car.checkedAt) ? ` · ${formatCheckedAgo(car.checkedAt)}` : ""}
          </p>
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
          <aside className="source-card detail-source-card">
            <h3>Источник объявления</h3>
            {car.sourceId && <p className="source-meta">ID {car.sourceId}</p>}
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
              <strong>{approximateMoney(price.totalLow, price.totalHigh, currency)}</strong>
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
                <PriceLabel label="Растаможка и сборы" description={price.customsNote} />
                <strong>{approximateMoney(price.customsLow, price.customsHigh, currency)}</strong>
              </div>
              <div>
                <PriceLabel label="Услуги evcars.by" description="Проверка, выкуп и документы" />
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
            <button ref={availabilityCtaRef} className="primary report-order-cta" onClick={openAvailabilityModal}>
              Уточнить актуальность авто
            </button>
          </aside>
          <ListingIdRow car={car} />
        </div>
      </div>
      {floatingCta && (
        <div className={`detail-floating-availability${availabilityCtaVisible || availabilityUnavailableOpen ? " is-hidden" : ""}`} aria-hidden={availabilityCtaVisible || availabilityUnavailableOpen}>
          <button className="primary" type="button" onClick={openAvailabilityModal} tabIndex={availabilityCtaVisible || availabilityUnavailableOpen ? -1 : 0}>
            Уточнить актуальность авто
          </button>
        </div>
      )}
      {availabilityUnavailableOpen && <AvailabilityUnavailableModal onClose={() => setAvailabilityUnavailableOpen(false)} />}
    </>
  );
}

// Быстрый просмотр — только для десктопа: на узком экране модалка повторяла бы
// всю страницу автомобиля и мешала бы прокрутке выдачи.
const DESKTOP_VIEWPORT = "(min-width: 981px)";

function useDesktopViewport() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_VIEWPORT).matches);
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_VIEWPORT);
    const update = () => setDesktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return desktop;
}

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

function VehicleQuickViewModal({ car, favorite, toggleFavorite, onOpenFull, onClose }) {
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
          <VehicleDetailBody car={car} favorite={favorite} toggleFavorite={toggleFavorite} openFull={onOpenFull} floatingCta={false} currencySwitch />
        </div>
      </section>
    </div>
  );
}

// Быстрый просмотр включён по умолчанию, но это дополнение к странице
// автомобиля: свитчер рядом с выдачей возвращает обычный переход по клику.
const quickViewKey = "evcars-quick-view";
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
function useVehicleQuickView({ apiMode, favorites, toggleFavorite, navigate }) {
  const desktop = useDesktopViewport();
  const [enabled, setEnabled] = useState(readQuickViewEnabled);
  const [listed, setListed] = useState(null);
  const car = useQuickViewCar(listed, apiMode);
  const close = useCallback(() => setListed(null), []);
  const changeEnabled = (value) => {
    setEnabled(value);
    window.localStorage.setItem(quickViewKey, value ? "on" : "off");
    if (!value) setListed(null);
  };
  // Стрелка у названия уводит на полную страницу: модалку закрываем, иначе она
  // осталась бы висеть поверх только что открытой карточки.
  const openFullView = (href) => {
    setListed(null);
    navigate(href);
  };
  // Окно сузилось до мобильной раскладки — быстрый просмотр закрываем.
  useEffect(() => {
    if (!desktop) setListed(null);
  }, [desktop]);
  // true — карточка раскрыта модалкой, переходить на страницу не нужно.
  const openQuickView = (nextCar) => {
    if (!desktop || !enabled || !nextCar) return false;
    setListed(nextCar);
    return true;
  };
  return {
    openQuickView,
    // Свитчер нужен только там, где быстрый просмотр вообще работает.
    quickViewToggle: desktop ? <QuickViewToggle checked={enabled} onChange={changeEnabled} /> : null,
    quickViewModal: car ? <VehicleQuickViewModal car={car} favorite={favorites.has(car.id)} toggleFavorite={toggleFavorite} onOpenFull={openFullView} onClose={close} /> : null,
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
    ["Цвет", car.bodyColor],
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
        <button onClick={() => navigate(`/cars/${car.id}`)}>{car.title}</button>
        <CaretRight size={13} />
        Предварительный заказ
      </div>
      <button className="back-mobile" onClick={() => navigate(`/cars/${car.id}`)}>
        <ArrowLeft size={18} />
        Назад к автомобилю
      </button>
      <div className="order-heading">
        <div>
          <span>Черновик заказа · {car.sourceId}</span>
          <h1>Предварительный заказ</h1>
          <p>Мы собрали всё, что уже известно, и отдельно отметили расчёты и данные, требующие подтверждения.</p>
        </div>
        <DataTag type="pending" />
      </div>
      <section className="order-car-summary">
        <img src={imageSource(car.image)} alt={car.title} />
        <div>
          <h2>{car.title}</h2>
          <p>
            {number(car.mileage)} км · {car.type} · {car.drive} привод
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
                <PriceLabel label="Таможня и сборы" description={price.customsNote} />
                <b>{approximateMoney(price.customsLow, price.customsHigh, currency)}</b>
              </div>
              <div>
                <PriceLabel label="Услуги evcars.by" description="Проверка, выкуп и документы" />
                <b>{money(price.serviceUsd, currency)}</b>
              </div>
            </div>
            <div className="order-grand-total">
              <PriceLabel label="Ориентировочно до Минска" description="Без постановки на учёт и страховки" />
              <b>{approximateMoney(price.totalLow, price.totalHigh, currency)}</b>
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
              Это заявление площадки и продавца, не независимая проверка evcars.by.
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
              <button onClick={() => navigate(`/cars/${car.id}`)}>Вернуться к автомобилю</button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

const purchaseSteps = [
  {
    icon: MagnifyingGlass,
    title: "Вы выбираете автомобиль",
    text: "Сравниваете объявления, комплектации и предварительную цену до Минска.",
  },
  {
    icon: ChatCircleText,
    title: "Мы подтверждаем объявление",
    text: "Подтверждаем наличие, цену, VIN и возможность экспорта.",
  },
  {
    icon: ShieldCheck,
    title: "Проверяем автомобиль",
    text: "Проводим независимую диагностику кузова, техники и батареи.",
  },
  {
    icon: ListChecks,
    title: "Фиксируем смету",
    text: "Согласовываем автомобиль, логистику, платежи и услуги.",
  },
  {
    icon: CarProfile,
    title: "Выкупаем и доставляем",
    text: "Сопровождаем оплату, документы и доставку автомобиля в Минск.",
  },
];

function HowItWorksPage({ navigate }) {
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
      <InfoCta navigate={navigate} title="Начните с подходящего автомобиля" text="В каталоге уже собраны объявления и предварительные расчёты до Минска." />
    </main>
  );
}

function AboutPage({ navigate }) {
  const principles = [
    {
      icon: ListChecks,
      title: "Факты отдельно от оценки",
      text: "Показываем данные объявления, наши расчёты и то, что ещё требует подтверждения, как разные вещи.",
    },
    {
      icon: ShieldCheck,
      title: "Проверка важнее обещаний",
      text: "Не называем автомобиль проверенным, пока нет подтверждения продавца и независимой диагностики.",
    },
    {
      icon: Lightning,
      title: "Сложное — простым языком",
      text: "Переводим характеристики, документы и расходы в понятный формат без китайских обозначений и скрытых строк.",
    },
  ];
  return (
    <main className="info-page">
      <section className="about-hero page-width">
        <div>
          <button className="back-mobile" onClick={() => navigate("/")}>
            <ArrowLeft size={18} />
            На главную
          </button>
          <span className="info-eyebrow">О сервисе</span>
          <h1>evcars.by помогает осознанно выбрать автомобиль из Китая</h1>
          <p>Мы собираем объявления китайского вторичного рынка, приводим данные к понятному виду и сопровождаем путь от первой проверки до доставки в Минск.</p>
          <button className="primary" onClick={() => navigate("/catalog")}>
            Открыть каталог <ArrowRight size={18} />
          </button>
        </div>
        <aside className="about-statement">
          <span>Наша роль</span>
          <blockquote>Не просто показать объявление, а дать достаточно проверяемой информации для спокойного решения.</blockquote>
          <small>Команда evcars.by</small>
        </aside>
      </section>
      <section className="info-section page-width">
        <div className="info-section-heading compact">
          <span>Наш подход</span>
          <h2>Прозрачность на каждом шаге</h2>
        </div>
        <div className="principles-grid">
          {principles.map(({ icon: Icon, title, text }) => (
            <article key={title}>
              <span>
                <Icon size={25} weight="duotone" />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="service-scope">
        <div className="page-width service-scope-grid">
          <div>
            <span className="info-eyebrow">Что делает сервис</span>
            <h2>Из объявления — в понятную карточку</h2>
            <p>Мы структурируем параметры автомобиля, переводим данные, рассчитываем ориентир стоимости до Минска и показываем свежесть источника.</p>
          </div>
          <div className="scope-list">
            <div>
              <b>01</b>
              <p>
                <strong>Собираем</strong>
                <span>Характеристики, фото и данные продавца</span>
              </p>
            </div>
            <div>
              <b>02</b>
              <p>
                <strong>Объясняем</strong>
                <span>Состояние, комплектацию и структуру цены</span>
              </p>
            </div>
            <div>
              <b>03</b>
              <p>
                <strong>Проверяем</strong>
                <span>Наличие, VIN, экспорт и техническое состояние</span>
              </p>
            </div>
            <div>
              <b>04</b>
              <p>
                <strong>Сопровождаем</strong>
                <span>Выкуп, документы и доставку</span>
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="honesty-section page-width">
        <div>
          <span className="info-eyebrow">Важно</span>
          <h2>Чего мы не обещаем</h2>
        </div>
        <div className="honesty-list">
          <p>
            <X size={19} weight="bold" />
            <span>
              <b>Не выдаём данные продавца за независимую проверку.</b> Всё, что ещё не подтверждено, прямо так и обозначено.
            </span>
          </p>
          <p>
            <X size={19} weight="bold" />
            <span>
              <b>Не фиксируем цену раньше времени.</b> Курс, логистика и таможенные параметры уточняются перед договором.
            </span>
          </p>
          <p>
            <X size={19} weight="bold" />
            <span>
              <b>Не подбираем «любой ценой».</b> Если вариант сомнительный, честный результат — отказаться от него.
            </span>
          </p>
        </div>
      </section>
      <InfoCta navigate={navigate} title="Посмотрите, как это выглядит на реальных авто" text="Выберите объявление и изучите характеристики, источник и предварительный расчёт." />
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
            <strong>Офис в Минске</strong>
            <span>{COMPANY.address}. {COMPANY.hours}</span>
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

      <section className="contact-map page-width" aria-label="Офис evcars.by на карте">
        <iframe
          key={theme}
          src={mapSrc}
          title="Офис evcars.by на Яндекс Картах"
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

const legalContent = {
  privacy: {
    eyebrow: "Защита данных",
    title: "Политика конфиденциальности",
    intro: `${COMPANY.legalName} использует персональные данные только для ответа на обращение, подготовки расчёта и сопровождения сделки.`,
    sections: [
      ["Какие данные мы получаем", "Имя, телефон, адрес электронной почты или имя пользователя в мессенджере, а также сведения, которые вы добровольно указываете в обращении."],
      ["Зачем они нужны", "Чтобы связаться с вами, подобрать автомобиль, подготовить расчёт, оформить договор и сообщать о ходе заказа."],
      ["Передача и хранение", "Мы не продаём персональные данные. Доступ получают только сотрудники и подрядчики, которым информация необходима для оказания согласованной услуги."],
      ["Ваши права", `Вы можете уточнить, изменить или удалить свои данные, написав на ${COMPANY.email}.`],
    ],
  },
  terms: {
    eyebrow: "Правовая информация",
    title: "Условия использования сайта",
    intro: "Каталог помогает предварительно оценить варианты автомобилей и расходы. Финальные условия фиксируются только после проверки объявления и подписания договора.",
    sections: [
      ["Информация в каталоге", "Характеристики и фотографии поступают из объявлений продавцов. Мы уточняем наличие, состояние, VIN и возможность экспорта перед оформлением."],
      ["Предварительный расчёт", "Цена до Минска является ориентировочной и может измениться из-за курса валют, логистики, таможенных платежей и фактической комплектации автомобиля."],
      ["Оформление сделки", `Услуги оказывает ${COMPANY.legalName}. Состав услуг, стоимость, сроки и ответственность сторон определяются индивидуальным договором.`],
      ["Обратная связь", `Вопросы по работе сайта и условиям услуг можно направить на ${COMPANY.email}.`],
    ],
  },
};

function LegalPage({ navigate, kind }) {
  const content = legalContent[kind];
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

function SiteFooter({ navigate }) {
  return (
    <footer className="site-footer">
      <div className="page-width footer-main">
        <div className="footer-brand">
          <AppLink className="wordmark footer-wordmark" href="/" navigate={navigate} aria-label="evcars.by — на главную"><SiteLogo /></AppLink>
          <p>Помогаем выбрать, проверить и доставить автомобиль из Китая в Беларусь.</p>
          <div className="footer-socials">
            <a className="telegram-social-link" href={COMPANY.telegramUrl} target="_blank" rel="noreferrer" aria-label="Telegram"><TelegramLogo size={27} weight="fill" /></a>
            <a className="instagram-social-link" href={COMPANY.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram"><InstagramLogo size={27} weight="bold" /></a>
          </div>
        </div>
        <div className="footer-column footer-navigation"><b>Навигация</b><AppLink href="/catalog" navigate={navigate}>Автомобили</AppLink><AppLink href="/how-it-works" navigate={navigate}>О сервисе</AppLink><AppLink href="/faq" navigate={navigate}>Вопросы и ответы</AppLink></div>
        <div className="footer-column footer-contacts"><b>Связаться</b><AppLink href="/contacts" navigate={navigate}>Контакты</AppLink><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a><span>{COMPANY.address}</span></div>
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
        <span>Каталог evcars.by</span>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <button className="primary" onClick={() => navigate("/catalog")}>
        Перейти к автомобилям <ArrowRight size={18} />
      </button>
    </section>
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
const catalogTotalKey = "evcars-catalog-total";
const guestFavoritesKey = "navostok-favorites";
const favoritesMigrationKey = "navostok-favorites-account-migration";
const accountFavoritesKey = (userId) => `navostok-account-favorites:${userId}`;
const pendingOrderKey = "evcars-pending-order-listing";
const accountOrdersKey = (userId) => `evcars-account-orders:${userId}`;
const accountSearchesKey = (userId) => `evcars-account-searches:${userId}`;
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
const transientStatuses = new Set([500, 502, 503, 504]);
const fetchWithRetry = async (url, options = {}, attempts = 3) => {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    try {
      const response = await fetch(url, options);
      if (!transientStatuses.has(response.status) || attempt === attempts - 1) return response;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      lastError = error;
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
    car:{ id:car.id, title:car.title, brand:car.brand, model:car.model, year:car.year, type:car.type, mileage:car.mileage, city:car.city, drive:car.drive, battery:car.battery, range:car.electricRange || car.range, image:car.image, estimatedTotalUsd:Math.round((estimate.totalLow + estimate.totalHigh) / 2) },
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

function AvailabilityUnavailableModal({ onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="lead-modal availability-unavailable-modal" role="dialog" aria-modal="true" aria-labelledby="availability-unavailable-title" aria-describedby="availability-unavailable-description">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Закрыть">
          <X size={19} />
        </button>
        <div className="availability-unavailable-icon" aria-hidden="true">
          <CarProfile size={30} weight="duotone" />
        </div>
        <h2 id="availability-unavailable-title">Автомобиль временно недоступен</h2>
        <p id="availability-unavailable-description">Сейчас мы не можем подтвердить наличие этого автомобиля. Попробуйте вернуться к объявлению позже или выберите похожий вариант в каталоге.</p>
        <button className="primary" type="button" onClick={onClose} autoFocus>Понятно</button>
      </section>
    </div>
  );
}

function AuthModal({ mode, navigate, onAuthenticate, pending, onClose, redirectTo = "/account" }) {
  const registering = mode === "register";
  const [values, setValues] = useState({ name:"", phone:"+375", password:"", confirm:"", consent:true });
  const [error, setError] = useState("");
  // На телефоне подписи полей скрыты (styles.css), их роль играют плейсхолдеры.
  const [mobileLayout, setMobileLayout] = useState(() => window.matchMedia("(max-width: 700px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const updateLayout = () => setMobileLayout(media.matches);
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);
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
      <b>{done ? <Check size={20} weight="bold" /> : `${stageNumber}.`}</b>
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
      <section className="lead-modal order-removal-modal" role="dialog" aria-modal="true" aria-labelledby="order-removal-title" aria-describedby="order-removal-description">
        <button className="modal-close" type="button" onClick={onCancel} disabled={saving} aria-label="Закрыть"><X size={19} /></button>
        <div className="order-removal-icon"><Trash size={25} weight="duotone" /></div>
        <span>Удаление из заказа</span>
        <h2 id="order-removal-title">Убрать автомобиль?</h2>
        <p id="order-removal-description"><b>{carTitle}</b> будет удалён из заказа № {orderNumber}. Прогресс по проверке объявления, осмотру, договору и оплате также будет удалён.</p>
        {error && <div className="auth-error order-removal-error" role="alert">{error}</div>}
        <form className="order-removal-actions" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
          <button className="secondary" type="button" onClick={onCancel} disabled={saving}>Отмена</button>
          <button className="danger-button solid" type="submit" disabled={saving}><Trash size={18} /> {saving ? "Удаляем…" : "Убрать автомобиль"}</button>
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

function CustomerOrdersPanel({ user, cars, authBackend, navigate }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [localMode, setLocalMode] = useState(authBackend === "local");
  const [expandedStage, setExpandedStage] = useState(1);
  const [removalOpen, setRemovalOpen] = useState(false);
  const [removalError, setRemovalError] = useState("");
  const [availabilityComment, setAvailabilityComment] = useState("");
  const [availabilityUnavailableOpen, setAvailabilityUnavailableOpen] = useState(false);

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

  const applyAction = async (action, values = {}) => {
    const current = orders[0];
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
    const current = orders[0];
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
      setRemovalOpen(false);
    } catch (removeError) {
      console.error("[customer-order] removal failed", { orderId:current.id, source:localMode ? "local" : "server", error:removeError.message });
      setRemovalError(removeError.message === "unauthorized" ? "Сессия истекла. Обновите страницу и войдите снова." : "Не удалось убрать автомиль. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="account-order-loading" aria-live="polite">Загружаем ваш заказ…</section>;
  const order = orders[0];
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
  const responseMethods = Array.isArray(order.contactMethods) && order.contactMethods.length ? order.contactMethods : user.preferredContact === "telegram" ? ["telegram"] : ["phone"];
  const responsePhone = order.contactPhone || formatAccountPhone(user.phone);
  const responseLabels = responseMethods.map((method) => ({ phone:"по телефону", viber:"в Viber", telegram:"в Telegram" })[method]).filter(Boolean);
  const responseDestination = responseLabels.length > 1 ? `${responseLabels.slice(0,-1).join(", ")} или ${responseLabels.at(-1)}` : responseLabels[0] || "по телефону";
  const responseText = `Ответим ${responseDestination} — ${responsePhone}.`;
  const requestOrderRemoval = (event) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    setRemovalError("");
    setRemovalOpen(true);
  };
  return (
    <section className="customer-order" aria-label={`Заказ ${order.orderNumber}`}>
      <div className="customer-order-car">
        <img src={order.car.image} alt={order.car.title} />
        <div className="customer-order-car-copy">
          <div className="customer-order-car-heading"><span>Выбранный автомобиль</span><h2><a href={`/cars/${encodeURIComponent(order.listingId)}`} target="_blank" rel="noopener noreferrer">{order.car.title}</a></h2><p>Заказ № {order.orderNumber}</p></div>
          <div className="customer-order-car-meta">
            {order.car.year ? <span>{order.car.year} год</span> : null}
            {Number.isFinite(order.car.mileage) ? <span>{number(order.car.mileage)} км</span> : null}
            {order.car.type ? <span>{order.car.type}</span> : null}
          </div>
          {order.car.estimatedTotalUsd ? <div className="customer-order-car-price"><b>≈ {number(order.car.estimatedTotalUsd)} USD</b></div> : null}
        </div>
        <div className="customer-order-card-controls">
          <details className="order-car-menu">
            <summary aria-label="Действия с автомобилем"><DotsThreeVertical size={23} weight="bold" /></summary>
            <div><button type="button" disabled={saving} onClick={requestOrderRemoval}><Trash size={17} /> Убрать автомобиль</button></div>
          </details>
          <a className="customer-order-card-open" href={`/cars/${encodeURIComponent(order.listingId)}`} target="_blank" rel="noopener noreferrer" aria-label={`Открыть карточку ${order.car.title} в новой вкладке`}><span>Карточка автомобиля</span><ArrowRight size={24} /></a>
        </div>
      </div>
      <div className="customer-order-stages">
        <OrderStageRow number={1} title="Проверка объявления" description="Уточним у продавца наличие, цену и готовность к сделке." open fixed done={availabilityRequested}>
          {!availabilityRequested ? (
            <form className="availability-check-form" onSubmit={(event) => { event.preventDefault(); setAvailabilityUnavailableOpen(true); }}>
              <p>Перед осмотром свяжемся с продавцом и подтвердим:</p>
              <ul className="availability-check-list">
                <li><CheckCircle size={20} weight="fill" /> автомобиль ещё в продаже;</li>
                <li><CheckCircle size={20} weight="fill" /> цена и комплектация не изменились;</li>
                <li><CheckCircle size={20} weight="fill" /> продавец готов к осмотру и оформлению сделки.</li>
              </ul>
              <label className="availability-comment-field">
                <span>Комментарий менеджеру <small>необязательно</small></span>
                <textarea value={availabilityComment} onChange={(event) => setAvailabilityComment(event.target.value)} maxLength={600} placeholder="Например: уточнить возможность торга, состояние батареи или комплект зимних колёс" />
                <small>Можно оставить поле пустым — базовые вопросы мы зададим в любом случае.</small>
              </label>
              <button className="primary" type="submit" disabled={saving}>Уточнить актуальность</button>
            </form>
          ) : (
            <div className="availability-requested">
              <div className="customer-order-notice"><CheckCircle size={21} weight="fill" /><p><b>{availabilityConfirmed ? "Автомобиль актуален." : "Запрос отправлен."}</b><span>{availabilityConfirmed ? "Проверка завершена — теперь можно выбрать осмотр." : `Проверим объявление и сообщим результат. ${responseText}`}</span></p></div>
              {order.availabilityComment ? <p><b>Ваш комментарий:</b> {order.availabilityComment}</p> : null}
            </div>
          )}
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
            <><p>Сначала подтвердим актуальную цену продавца, затем подготовим счёт.</p>{order.car.estimatedTotalUsd && <div className="order-estimate"><span>Ориентировочно до Минска</span><b>≈ {number(order.car.estimatedTotalUsd)} USD</b></div>}<button className="primary" type="button" disabled={saving} onClick={() => applyAction("request_invoice")}>Запросить счёт</button></>
          )}
        </OrderStageRow>
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {removalOpen && <OrderRemovalModal carTitle={order.car.title} orderNumber={order.orderNumber} saving={saving} error={removalError} onCancel={() => { setRemovalOpen(false); setRemovalError(""); }} onConfirm={removeOrder} />}
      {availabilityUnavailableOpen && <AvailabilityUnavailableModal onClose={() => setAvailabilityUnavailableOpen(false)} />}
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

function AccountPage({ user, cars, authBackend, navigate, onLogout, onSaveProfile, onDeleteAccount, pending }) {
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
          <CustomerOrdersPanel user={user} cars={cars} authBackend={authBackend} navigate={navigate} />
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
  const response = await fetch(`${import.meta.env.BASE_URL}data/cars/${encodeURIComponent(id)}.json`, { signal });
  if (!response.ok) throw new Error("car unavailable");
  return response.json();
}

// index.html starts the boot requests before this bundle is downloaded, so the network is
// already busy while React mounts. Falling back to a plain fetch keeps the app working
// wherever that inline script did not run.
// Как и в index.html, без `cache: "no-store"`: иначе запрос уходит с пометкой «не бери
// из кэша» и сеть Vercel отвечает мимо своего кэша. Ответы каталога несут `max-age=0`,
// поэтому браузер всё равно ничего не хранит у себя.
const fetchCarsJson = (url, signal) => fetch(url, { signal }).then((response) => (response.ok ? response.json() : Promise.reject(new Error("api unavailable"))));
// Справочник фильтров спрашивают и поиск на главной, и блок популярных марок, причём
// об одном и том же. Держим обещание по строке запроса: второй потребитель дожидается
// первого ответа вместо того, чтобы отправлять свой.
const metaRequests = new Map();
const requestCatalogMeta = (query = "") => {
  const key = String(query);
  if (!metaRequests.has(key)) {
    const request = fetchCarsJson(`/api/catalog/meta${key ? `?${key}` : ""}`);
    // Неудачу не запоминаем, иначе следующий выбор фильтра больше не попробует.
    request.catch(() => metaRequests.delete(key));
    metaRequests.set(key, request);
  }
  return metaRequests.get(key);
};
let catalogRequest = null;
// Same split as the inline script in index.html: the 60-card list is only read by the
// home showcase and by "похожие автомобили", so the catalog asks for a single card.
const bootCatalogUrl = () => (window.location.pathname === "/catalog" ? "/api/cars?limit=1&sort=newest" : "/api/cars?limit=60&sort=variety");
// Memoised so StrictMode's double effect invocation does not fire the request twice.
const requestBootCatalog = () => (catalogRequest ||= window.__boot?.catalog || fetchCarsJson(bootCatalogUrl()));
// Загрузившись на /catalog, приложение знает одну машину — витрину главной и блок
// похожих из такого списка не собрать: они крутили бы по кругу пару просмотренных
// карточек. Флаг помнит этот урезанный старт, а запрос мемоизирован от StrictMode.
let bootListMinimal = window.location.pathname === "/catalog";
let showcaseListRequest = null;
const requestShowcaseList = () => (showcaseListRequest ||= fetchCarsJson("/api/cars?limit=60&sort=variety"));
const requestBootCar = (id) => (window.__boot?.carId === id && window.__boot.car) || fetchCarsJson(`/api/cars/${encodeURIComponent(id)}`);

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
  const [currency, setCurrency] = useState(() => (window.localStorage.getItem("navostok-currency") === "BYN" ? "BYN" : "USD"));
  const [themeMode, setThemeMode] = useState(() => {
    const savedTheme = window.localStorage.getItem("evcars-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return "system";
  });
  const [systemTheme, setSystemTheme] = useState(() => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const theme = themeMode === "system" ? systemTheme : themeMode;
  const [cars, setCars] = useState([]);
  // Three states, not two: null means the boot request has not answered yet. Routes that can
  // fetch on their own must not be forced down the static-catalog path while it is pending.
  const [apiMode, setApiMode] = useState(null);
  // The total only moves when an import runs, so the last known value is a sound placeholder
  // while the catalog request is in flight and keeps the search button from reading "0+".
  const [catalogTotal, setCatalogTotal] = useState(() => Number(window.localStorage.getItem(catalogTotalKey)) || 0);
  const [loading, setLoading] = useState(true);
  const [routeLoading, setRouteLoading] = useState(Boolean(targetId));
  const [loadError, setLoadError] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authPending, setAuthPending] = useState(false);
  const [authBackend, setAuthBackend] = useState("server");
  useEffect(() => {
    if (path !== "/analytics") trackEvent("page_view");
  }, [path]);
  useEffect(() => {
    window.localStorage.setItem("navostok-currency", currency);
  }, [currency]);
  useEffect(() => {
    if (catalogTotal) window.localStorage.setItem(catalogTotalKey, String(catalogTotal));
  }, [catalogTotal]);
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
        if (targetId && !initialCars.some((car) => car.id === targetId)) {
          // Already in flight since index.html on a deep link, so this does not queue behind the list.
          const detailCar = await requestBootCar(targetId).catch(() => null);
          if (detailCar) initialCars = [...initialCars, detailCar];
        }
        if (!cancelled) {
          setCars(initialCars.map(normalizeImportedCar));
          setCatalogTotal(Number(payload.total) || initialCars.length);
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
              initialCars = initialCars.map((car) => (car.id === targetId ? detailCar : car));
            } catch {}
          }
          if (!cancelled) {
            setCars(initialCars.map(normalizeImportedCar));
            setCatalogTotal(Number(payload.count) || payload.cars.length);
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
  }, []);
  // Первый уход со страницы каталога после урезанного старта: дозапрашиваем
  // обычный список витрины, чтобы главной и похожим было из чего собираться.
  useEffect(() => {
    if (!apiMode || !bootListMinimal || dataPath === "/catalog") return;
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
    const targetCar = cars.find((item) => item.id === targetId);
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
    ) : contentPath === "/about" ? (
      <AboutPage navigate={navigate} />
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
    ) : null;
  const page =
    contentPath === "/analytics" ? (
      <AnalyticsPage />
    ) : staticPage ? (
      staticPage
    ) : !showAccountFromAuthRoute && contentPath === "/" && !loadError ? (
      <Home navigate={navigate} cars={cars} apiMode={apiMode} catalogTotal={catalogTotal} favorites={favorites} toggleFavorite={toggleFavorite} loading={loading} />
    ) : !showAccountFromAuthRoute && contentPath === "/catalog" && !loadError ? (
      // Catalog issues its own filtered query, so it starts at mount rather than queueing
      // behind the boot request it never reads.
      <Catalog navigate={navigate} cars={cars} apiMode={apiMode} favorites={favorites} toggleFavorite={toggleFavorite} saveSearch={saveSearch} updateSavedSearch={updateSavedSearch} savedSearches={savedSearches} />
    ) : loading || routeLoading ? (
      <AppLoader />
    ) : loadError ? (
      <main className="simple-page page-width">
        <span>Импорт временно недоступен</span>
        <h1>Не удалось загрузить каталог</h1>
        <p>Последний импорт не найден. Запустите синхронизацию источника повторно.</p>
      </main>
    ) : showAccountFromAuthRoute ? (
      <AccountPage user={user} cars={cars} authBackend={authBackend} navigate={navigate} onLogout={logout} onSaveProfile={saveProfile} onDeleteAccount={removeAccount} pending={authPending} />
    ) : contentPath === "/favorites" ? (
      <Favorites navigate={navigate} cars={cars} favorites={favorites} toggleFavorite={toggleFavorite} apiMode={apiMode} onUnavailableFavorites={pruneUnavailableFavorites} saving={Boolean(pendingFavorite) || !favoritesReady} />
    ) : contentPath === "/searches" ? (
      <SavedSearchesPage navigate={navigate} searches={savedSearches} onDelete={deleteSavedSearch} saving={Boolean(pendingSavedSearch) || !savedSearchesReady} apiMode={apiMode} cars={cars} favorites={favorites} toggleFavorite={toggleFavorite} />
    ) : contentPath === "/account" ? (
      authLoading ? <main className="simple-page page-width"><span>Личный кабинет</span><h1>Проверяем аккаунт…</h1></main> : user ? <AccountPage user={user} cars={cars} authBackend={authBackend} navigate={navigate} onLogout={logout} onSaveProfile={saveProfile} onDeleteAccount={removeAccount} pending={authPending} /> : null
    ) : orderId ? (
      <OrderDraft car={cars.find((item) => item.id === orderId)} navigate={navigate} />
    ) : detailId ? (
      <Detail car={cars.find((item) => item.id === detailId)} cars={cars} apiMode={apiMode} navigate={navigate} backToCatalog={backToCatalog} favorite={favorites.has(detailId)} favorites={favorites} toggleFavorite={toggleFavorite} />
    ) : (
      <NotFound navigate={navigate} />
    );
  return (
    <CurrencyContext.Provider value={currency}>
     <SetCurrencyContext.Provider value={setCurrency}>
      <ClientSeo path={path} car={detailId ? cars.find((item) => item.id === detailId) : null} />
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
            window.localStorage.setItem("evcars-theme", nextTheme);
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
     </SetCurrencyContext.Provider>
    </CurrencyContext.Provider>
  );
}
