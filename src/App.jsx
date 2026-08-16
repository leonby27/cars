import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BatteryHigh, CalendarBlank, CarProfile, CaretDown, CaretRight, ChatCircleText, Check, CheckCircle, ClipboardText, Clock, CurrencyCny, EnvelopeSimple, Eye, EyeSlash, Gauge, Heart, Images, Info, Lightning, ListChecks, LockKey, MagnifyingGlass, MapPin, Phone, ShareNetwork, ShieldCheck, SignOut, SlidersHorizontal, Sparkle, Trash, UserCircle, WarningCircle, X } from "@phosphor-icons/react";
import { matchesMinimumYear, sortCars } from "./car-filters.js";
import { estimateLandedCost, PRICING } from "./pricing.js";
import { BODY_TYPES, normalizeBodyType } from "./body-types.js";
import { formatListingAge, getSourceListedAt } from "./listing-age.js";
import { COMPANY } from "./company-data.js";
import { DELIVERY_CASES, DELIVERY_STATS } from "./delivery-cases.js";
import { FAQ_GROUPS, HOME_FAQ, HOME_ORDER_STEPS, PAYMENT_STAGES, RESPONSIBILITY_ITEMS } from "./purchase-info.js";

const number = (value) => new Intl.NumberFormat("ru-RU").format(value);
const uniqueSorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru"));
const CurrencyContext = createContext("USD");
const toDisplayCurrency = (usd, currency) => (currency === "BYN" ? Math.round(usd * PRICING.usdByn) : usd);
const money = (usd, currency) => (currency === "BYN" ? `${number(toDisplayCurrency(usd, currency))} BYN` : `$${number(usd)}`);
const approximateMoney = (low, high, currency) => `≈ ${money(Math.round((low + high) / 2), currency)}`;
const ANY_YEAR = "Любой год";
const ANY_PRICE = "Любая цена";
const ANY_MILEAGE = "Любой пробег";
const yearOptions = [ANY_YEAR, "от 2022", "от 2023", "от 2024"];
const priceOptions = [ANY_PRICE, "до $40 000", "до $30 000", "до $25 000"];
const mileageOptions = [ANY_MILEAGE, "до 50 000 км", "до 30 000 км", "до 15 000 км"];
const priceLimitLabel = (value, currency) => (value === ANY_PRICE ? value : `до ${money(filterNumber(value), currency)}`);
const useCurrency = () => useContext(CurrencyContext);

function TelegramBrandIcon() {
  return (
    <svg className="social-brand-icon telegram-brand-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21.79 3.27 18.6 19.13c-.24 1.12-.87 1.39-1.76.87l-4.86-3.58-2.35 2.26c-.26.26-.48.48-.98.48l.35-4.95 9-8.13c.39-.35-.09-.55-.61-.2L6.26 12.89l-4.79-1.5c-1.04-.33-1.06-1.04.22-1.54L20.42 2.63c.87-.32 1.63.2 1.37.64Z" />
    </svg>
  );
}

function InstagramBrandIcon() {
  const gradientId = useId();
  return (
    <svg className="social-brand-icon instagram-brand-icon" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffdc80" />
          <stop offset="0.28" stopColor="#fcaf45" />
          <stop offset="0.52" stopColor="#f77737" />
          <stop offset="0.72" stopColor="#e1306c" />
          <stop offset="1" stopColor="#833ab4" />
        </linearGradient>
      </defs>
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="5.15" fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.15" />
      <circle cx="12" cy="12" r="4.15" fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.15" />
      <circle cx="17.35" cy="6.75" r="1.15" fill={`url(#${gradientId})`} />
    </svg>
  );
}

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
        终身包退: "Пожизненный возврат по условиям Guazi",
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
const claimCount = (car) => {
  const match = String(car.claims || car.incident || "").match(/(\d+)\s*次理赔|理赔\s*(\d+)\s*次/);
  return match ? Number(match[1] ?? match[2]) : null;
};
const filterNumber = (value) => Number(String(value).replace(/\D/g, "")) || 0;
const matchesAdvancedFilters = (car, { drive, owners, history }) => (drive === "Любой привод" || car.drive === drive) && (owners === "Любое количество" || Number(car.owners) <= filterNumber(owners)) && (history === "Любая история" || claimCount(car) === 0);
const ownerOptions = ["Любое количество", "1 владелец", "До 2 владельцев"];
const historyOptions = ["Любая история", "Без страховых случаев"];
const proxiedImageHosts = new Set(["image-public.guazistatic.com", "image-oversea.guazistatic-global.com"]);
const imageSource = (source) => {
  if (!source) return source;
  try {
    const url = new URL(source);
    return proxiedImageHosts.has(url.hostname) ? `/api/image?src=${encodeURIComponent(url.href)}` : source;
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
    appearanceScore,
    electricRange,
    combinedRange,
    batteryHealth,
    range: car.range || electricRange || combinedRange,
    checkedAt: car.checkedAt || car.importedAt,
  };
}

function useRoute() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const appPath = (pathname) => (basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname);
  const [route, setRoute] = useState({
    path: appPath(window.location.pathname),
    restoreY: null,
    key: 0,
  });
  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    const saveScroll = () => window.history.replaceState({ ...window.history.state, scrollY: window.scrollY }, "");
    let scrollFrame = null;
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        saveScroll();
      });
    };
    const onPop = (event) =>
      setRoute((current) => ({
        path: appPath(window.location.pathname),
        restoreY: Number(event.state?.scrollY) || 0,
        key: current.key + 1,
      }));
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPop);
    return () => {
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPop);
    };
  }, []);
  useEffect(() => {
    if (route.restoreY === null) return;
    const target = route.restoreY;
    const deadline = Date.now() + 4000;
    let timer = null;
    let cancelled = false;
    const restore = () => {
      if (cancelled) return;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll >= target || Date.now() >= deadline) {
        window.scrollTo({ top: Math.min(target, maxScroll), behavior: "auto" });
        return;
      }
      timer = window.setTimeout(restore, 50);
    };
    timer = window.setTimeout(restore, 0);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [route.key, route.restoreY]);
  const navigate = (next) => {
    if (next === -1) {
      window.history.back();
      return;
    }
    const target = new URL(next, window.location.origin);
    window.history.replaceState({ ...window.history.state, scrollY: window.scrollY }, "");
    window.history.pushState({ fromPath: appPath(window.location.pathname), scrollY: 0 }, "", `${basePath}${target.pathname}${target.search}${target.hash}`);
    setRoute((current) => ({
      path: target.pathname,
      restoreY: null,
      key: current.key + 1,
    }));
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const backToCatalog = () => (window.history.state?.fromPath === "/catalog" ? navigate(-1) : navigate("/catalog"));
  return { path: route.path, navigate, backToCatalog };
}

function Header({ navigate, favoritesCount, path, currency, setCurrency, user }) {
  const catalogActive = path === "/catalog" || path.startsWith("/cars/") || path.startsWith("/orders/");
  return (
    <header className="site-header">
      <div className="header-inner">
        <button className="wordmark" onClick={() => navigate("/")} aria-label="На главную">
          Na<span>Vostok</span>
          <small>.by</small>
        </button>
        <nav className="desktop-nav" aria-label="Основная навигация">
          <button className={catalogActive ? "active" : ""} aria-current={catalogActive ? "page" : undefined} onClick={() => navigate("/catalog")}>
            Автомобили
          </button>
          <button className={path === "/how-it-works" ? "active" : ""} aria-current={path === "/how-it-works" ? "page" : undefined} onClick={() => navigate("/how-it-works")}>
            Как это работает
          </button>
          <button className={path === "/about" ? "active" : ""} aria-current={path === "/about" ? "page" : undefined} onClick={() => navigate("/about")}>
            О компании
          </button>
          <button className={path === "/contacts" ? "active" : ""} aria-current={path === "/contacts" ? "page" : undefined} onClick={() => navigate("/contacts")}>
            Контакты
          </button>
        </nav>
        <div className="header-actions">
          <div className="currency-switch" role="group" aria-label="Валюта цен">
            <button type="button" className={currency === "USD" ? "active" : ""} aria-pressed={currency === "USD"} onClick={() => setCurrency("USD")}>
              $
            </button>
            <button type="button" className={currency === "BYN" ? "active" : ""} aria-pressed={currency === "BYN"} onClick={() => setCurrency("BYN")}>
              BYN
            </button>
          </div>
          <button
            className={`icon-label${path === "/favorites" ? " selected" : ""}`}
            aria-current={path === "/favorites" ? "page" : undefined}
            onClick={() => navigate("/favorites")}
          >
            <Heart size={21} weight={favoritesCount ? "fill" : "bold"} />
            <span>Избранное</span>
            {favoritesCount > 0 && <b>{favoritesCount}</b>}
          </button>
          <button
            className={`icon-label account-link${path === "/account" || path === "/login" || path === "/register" ? " selected" : ""}`}
            aria-current={path === "/account" ? "page" : undefined}
            onClick={() => navigate(user ? "/account" : "/login")}
          >
            <UserCircle size={22} weight={user ? "fill" : "bold"} />
            <span>{user ? user.name.split(" ")[0] : "Войти"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function SelectField({ label, value, options, onChange, searchable = false, className = "", disabled = false, formatOption = (item) => item }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, options.indexOf(value)));
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.indexOf(value));
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

  useEffect(() => {
    if (!open) return;
    const index = filteredOptions.indexOf(value);
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, query, value, filteredOptions]);

  useEffect(() => {
    if (open && searchable) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, searchable]);

  const choose = (item) => {
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
      <span>{label}</span>
      <button ref={triggerRef} type="button" className="select-trigger" aria-haspopup="listbox" aria-expanded={disabled ? false : open} aria-controls={listId} disabled={disabled} onClick={() => (open ? close() : setOpen(true))} onKeyDown={handleKeyDown}>
        <b>{formatOption(value)}</b>
        <CaretDown size={16} weight="bold" />
      </button>
      {open && !disabled && (
        <div className="select-menu">
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
          <div className="select-options" id={listId} role="listbox" aria-label={label}>
            {filteredOptions.length ? (
              filteredOptions.map((item, index) => (
                <button type="button" id={`${listId}-${index}`} role="option" aria-selected={item === value} className={`${item === value ? "selected" : ""}${index === activeIndex ? " active" : ""}`} key={item} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item)}>
                  <span>{formatOption(item)}</span>
                  {item === value && <Check size={16} weight="bold" />}
                </button>
              ))
            ) : (
              <p className="select-empty">Ничего не найдено</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QuickSearch({ navigate, cars, apiMode }) {
  const currency = useCurrency();
  const [type, setType] = useState("Все");
  const [brand, setBrand] = useState("Все марки");
  const [model, setModel] = useState("Все модели");
  const [bodyType, setBodyType] = useState("Все кузова");
  const [year, setYear] = useState(ANY_YEAR);
  const [mileage, setMileage] = useState(ANY_MILEAGE);
  const [priceLimit, setPriceLimit] = useState(ANY_PRICE);
  const [drive, setDrive] = useState("Любой привод");
  const [owners, setOwners] = useState("Любое количество");
  const [history, setHistory] = useState("Любая история");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [remoteMeta, setRemoteMeta] = useState({
    brands: [],
    models: [],
    bodyTypes: [],
    drives: [],
    availability: {},
  });
  const [remoteCount, setRemoteCount] = useState(0);
  const normalizedType = type === "Электромобили" ? "Электромобиль" : type === "Гибриды" ? "Гибрид" : "Все";
  const modelCars = cars.filter((car) => (normalizedType === "Все" || car.type === normalizedType) && (brand === "Все марки" || car.brand === brand) && (bodyType === "Все кузова" || car.bodyType === bodyType));
  const brands = ["Все марки", ...(apiMode ? remoteMeta.brands.map((item) => item.brand) : uniqueSorted(cars.map((car) => car.brand)))];
  const models = ["Все модели", ...(apiMode ? remoteMeta.models.map((item) => item.model) : uniqueSorted(modelCars.map((car) => car.model)))];
  const bodyTypes = ["Все кузова", ...(apiMode ? remoteMeta.bodyTypes.map((item) => item.body_type) : BODY_TYPES.filter((item) => cars.some((car) => car.bodyType === item)))];
  const drives = ["Любой привод", ...(apiMode ? remoteMeta.drives.map((item) => item.drive) : uniqueSorted(cars.map((car) => car.drive).filter((value) => value && value !== "Не указан")))];
  const availability = apiMode
    ? remoteMeta.availability
    : {
        drive: cars.filter((car) => car.drive && car.drive !== "Не указан").length,
        owners: cars.filter((car) => Number(car.owners)).length,
        claims: cars.filter((car) => claimCount(car) !== null).length,
      };
  const mileageCap = Number(mileage.replace(/\D/g, ""));
  const priceCap = Number(priceLimit.replace(/\D/g, ""));
  const resultCount = modelCars.filter((car) => (model === "Все модели" || car.model === model) && (year === ANY_YEAR || matchesMinimumYear(car, year)) && (mileage === ANY_MILEAGE || car.mileage <= mileageCap) && (priceLimit === ANY_PRICE || estimateLandedCost(car).totalUsd <= priceCap) && matchesAdvancedFilters(car, { drive, owners, history })).length;
  useEffect(() => {
    if (!apiMode) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
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
      if (bodyType !== "Все кузова") {
        metaQuery.set("bodyType", bodyType);
        carsQuery.set("bodyType", bodyType);
      }
      if (model !== "Все модели") carsQuery.set("model", model);
      if (year !== ANY_YEAR) carsQuery.set("yearMin", year.replace(/\D/g, ""));
      if (mileage !== ANY_MILEAGE) carsQuery.set("mileageMax", String(mileageCap));
      if (priceLimit !== ANY_PRICE) carsQuery.set("landedMax", String(priceCap));
      if (drive !== "Любой привод") carsQuery.set("drive", drive);
      if (owners !== "Любое количество") carsQuery.set("ownersMax", String(filterNumber(owners)));
      if (history === "Без страховых случаев") carsQuery.set("noClaims", "1");
      try {
        const [metaResponse, carsResponse] = await Promise.all([
          fetch(`/api/catalog/meta?${metaQuery}`, {
            signal: controller.signal,
          }),
          fetch(`/api/cars?${carsQuery}`, { signal: controller.signal }),
        ]);
        if (!metaResponse.ok || !carsResponse.ok) throw new Error("search unavailable");
        const [meta, catalog] = await Promise.all([metaResponse.json(), carsResponse.json()]);
        setRemoteMeta(meta);
        setRemoteCount(catalog.total);
      } catch {}
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [apiMode, normalizedType, brand, model, bodyType, year, mileageCap, priceCap, drive, owners, history]);
  const changeType = (value) => {
    setType(value);
    setModel("Все модели");
  };
  const changeBrand = (value) => {
    setBrand(value);
    setModel("Все модели");
  };
  const submit = (
    <button className="primary search-submit" onClick={() => navigate(`/catalog?type=${encodeURIComponent(type)}&brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}&body=${encodeURIComponent(bodyType)}&year=${encodeURIComponent(year)}&mileage=${encodeURIComponent(mileage)}&price=${encodeURIComponent(priceLimit)}&drive=${encodeURIComponent(drive)}&owners=${encodeURIComponent(owners)}&history=${encodeURIComponent(history)}`)}>
      <MagnifyingGlass size={20} weight="bold" />
      Показать {apiMode ? remoteCount : resultCount} авто
    </button>
  );
  return (
    <section className="search-box">
      <div className="type-tabs">
        {["Все", "Электромобили", "Гибриды"].map((item) => (
          <button type="button" key={item} className={type === item ? "active" : ""} onClick={() => changeType(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="filter-primary-row unified-filter-primary">
        <SelectField label="Марка" value={brand} onChange={changeBrand} options={brands} searchable />
        <SelectField label="Модель" value={model} onChange={setModel} options={models} searchable disabled={brand === "Все марки"} />
        <SelectField label="Год выпуска" value={year} onChange={setYear} options={yearOptions} />
        <SelectField label="Цена до Минска" value={priceLimit} onChange={setPriceLimit} options={priceOptions} formatOption={(value) => priceLimitLabel(value, currency)} />
        <SelectField label="Пробег" value={mileage} onChange={setMileage} options={mileageOptions} />
      </div>
      {moreFiltersOpen && (
        <div className="filter-extra-row" id="quick-extra-filters">
          <SelectField
            label="Кузов"
            value={bodyType}
            onChange={(value) => {
              setBodyType(value);
              setModel("Все модели");
            }}
            options={bodyTypes}
          />
          {Number(availability.drive) > 0 && <SelectField label="Привод" value={drive} onChange={setDrive} options={drives} />} {Number(availability.owners) > 0 && <SelectField label="Владельцы" value={owners} onChange={setOwners} options={ownerOptions} />} {Number(availability.claims) > 0 && <SelectField label="История" value={history} onChange={setHistory} options={historyOptions} />}
        </div>
      )}
      <div className="filter-actions-row">
        <button type="button" className="more-filters-toggle" aria-expanded={moreFiltersOpen} aria-controls="quick-extra-filters" onClick={() => setMoreFiltersOpen((open) => !open)}>
          <SlidersHorizontal size={17} />
          {moreFiltersOpen ? "Скрыть фильтры" : "Ещё фильтры"}
          <CaretDown size={15} weight="bold" />
        </button>
        {submit}
      </div>
    </section>
  );
}

function HoverImagePreview({ car, className }) {
  const images = (car.images?.length ? car.images : [car.image]).slice(0, 5);
  const [active, setActive] = useState(0);
  const preloadStarted = useRef(false);

  const preload = () => {
    if (preloadStarted.current || images.length < 2) return;
    preloadStarted.current = true;
    images.slice(1).forEach((src) => {
      const image = new Image();
      image.src = imageSource(src);
    });
  };
  const selectByCursor = (event) => {
    if (images.length < 2) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const progress = Math.min(0.9999, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    setActive(Math.floor(progress * images.length));
  };

  return (
    <div className={`${className} hover-image-preview`} onMouseEnter={preload} onMouseMove={selectByCursor} onMouseLeave={() => setActive(0)}>
      <img src={imageSource(images[active])} alt={car.title} draggable="false" />
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

function FeaturedCard({ car, onClick }) {
  const currency = useCurrency();
  const price = estimateLandedCost(car);
  const listingAge = formatListingAge(getSourceListedAt(car));
  return (
    <article className="featured-card" onClick={onClick} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()} tabIndex="0" role="button" aria-label={`Открыть ${car.title}`}>
      <HoverImagePreview car={car} className="featured-image" />
      <div className="featured-body">
        <h3>{car.title}</h3>
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

function shuffleCars(cars) {
  const shuffled = [...cars];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
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
};

function PopularBrands({ navigate, cars, apiMode }) {
  const [remoteBrands, setRemoteBrands] = useState([]);
  const localBrands = useMemo(() => {
    const counts = new Map();
    cars.forEach((car) => counts.set(car.brand, (counts.get(car.brand) || 0) + 1));
    return [...counts].map(([brand, count]) => ({ brand, count }));
  }, [cars]);

  useEffect(() => {
    if (!apiMode) {
      setRemoteBrands([]);
      return;
    }
    const controller = new AbortController();
    fetch("/api/catalog/meta", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("brand meta unavailable"))))
      .then((payload) => setRemoteBrands(payload.brands || []))
      .catch(() => {});
    return () => controller.abort();
  }, [apiMode]);

  const availableBrands = apiMode && remoteBrands.length ? remoteBrands : localBrands;
  const brandCounts = new Map(availableBrands.map((item) => [item.brand, Number(item.count) || 0]));
  const brands = Object.keys(brandLogos)
    .map((brand) => ({ brand, count: brandCounts.get(brand) || 0 }))
    .sort((a, b) => a.brand.localeCompare(b.brand, "en", { sensitivity: "base" }));

  return (
    <section className="popular-brands page-width" aria-labelledby="popular-brands-title">
      <div className="popular-brands-heading">
        <h2 id="popular-brands-title">Популярные марки</h2>
        <button onClick={() => navigate("/catalog")}>
          Все предложения <CaretRight size={20} weight="bold" />
        </button>
      </div>
      <div className="popular-brands-grid">
        {brands.map(({ brand }) => (
          <button className="brand-link" key={brand} onClick={() => navigate(`/catalog?brand=${encodeURIComponent(brand)}`)} aria-label={`Перейти к предложениям ${brand}`}>
            <span className="brand-logo" aria-hidden="true">
              <img src={`${import.meta.env.BASE_URL}brands/${brandLogos[brand]}`} alt="" />
            </span>
            <span>{brand}</span>
          </button>
        ))}
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
          <span className="home-section-kicker">Как проходит заказ</span>
          <h2 id="home-order-title">Автомобиль из Китая — без неизвестности между заявкой и выдачей</h2>
          <p>До каждого платежа вы понимаете, что уже проверено, сколько стоит следующий этап и какие документы получите.</p>
          <div className="home-order-actions">
            <button type="button" className="primary" onClick={() => navigate("/catalog")}>Подобрать автомобиль <ArrowRight size={18} weight="bold" /></button>
            <button type="button" className="home-text-link" onClick={() => navigate("/how-it-works")}>Весь процесс <CaretRight size={17} weight="bold" /></button>
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
          <p>Подбор и доставка автомобиля из Китая в Беларусь состоят из нескольких отдельных этапов. Мы заранее объясняем цену, проверку, сроки и ответственность сторон — без обещаний, которые невозможно подтвердить.</p>
          <button type="button" className="home-text-link" onClick={() => navigate("/faq")}>Все вопросы и ответы <ArrowRight size={17} weight="bold" /></button>
        </div>
        <div className="home-faq-list">
          {HOME_FAQ.map((item, index) => (
            <details key={item.question} open={index === 0}>
              <summary>
                <span>{item.question}</span>
                <CaretDown size={20} weight="bold" aria-hidden="true" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
          <div className="home-faq-cta">
            <div>
              <b>Нужна машина, которой нет в каталоге?</b>
              <span>Опишите модель и бюджет — проверим варианты на китайском рынке.</span>
            </div>
            <button type="button" className="primary" onClick={() => navigate("/catalog")}>Начать подбор <ArrowRight size={18} weight="bold" /></button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Home({ navigate, cars, apiMode }) {
  const batchSize = 20;
  const randomPool = useRef([]);
  const nextItemKey = useRef(0);
  const feedSource = useRef(cars);
  const takeRandomBatch = () => {
    const batch = [];
    if (!cars.length) return batch;
    while (batch.length < batchSize) {
      if (!randomPool.current.length) randomPool.current = shuffleCars(cars);
      const car = randomPool.current.pop();
      batch.push({ car, key: `${car.id}-${nextItemKey.current}` });
      nextItemKey.current += 1;
    }
    return batch;
  };
  const [feedCars, setFeedCars] = useState(() => takeRandomBatch());

  useEffect(() => {
    if (feedSource.current === cars) return;
    feedSource.current = cars;
    randomPool.current = [];
    nextItemKey.current = 0;
    setFeedCars(takeRandomBatch());
  }, [cars]);

  const loadMore = () => setFeedCars((current) => [...current, ...takeRandomBatch()]);

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">
          <Sparkle size={16} weight="fill" />
          Автомобили из Китая под заказ
        </div>
        <h1>Авто из Китая с пробегом продаются здесь</h1>
        <p>Платформа для поиска Б/У авто из Китая. Тысячи актуальных объявлений</p>
        <QuickSearch navigate={navigate} cars={cars} apiMode={apiMode} />
      </section>
      <PopularBrands navigate={navigate} cars={cars} apiMode={apiMode} />
      <section className="trust-strip page-width">
        <div>
          <span>
            <ListChecks size={22} weight="duotone" />
          </span>
          <p>
            <b>Данные обновляются автоматически</b>
            <small>Цена, пробег и статус наличия</small>
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
      <section className="featured page-width">
        <div className="section-heading">
          <div>
            <h2>Свежие реальные предложения</h2>
          </div>
          <button onClick={() => navigate("/catalog")}>
            Все автомобили <ArrowRight size={18} />
          </button>
        </div>
        <div className="featured-grid">
          {feedCars.map(({ car, key }) => (
            <FeaturedCard key={key} car={car} onClick={() => navigate(`/cars/${car.id}`)} />
          ))}
        </div>
        <button type="button" className="load-more featured-load-more" onClick={loadMore}>
          Показать ещё
        </button>
      </section>
      <HomeConversionSections navigate={navigate} />
    </main>
  );
}

function FilterPanel({ filters, setFilters, resultCount, brands, models, bodyTypes, drives, availability }) {
  const currency = useCurrency();
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(filters.bodyType !== "Все кузова" || filters.mileage !== ANY_MILEAGE || filters.drive !== "Любой привод" || filters.owners !== "Любое количество" || filters.history !== "Любая история");
  const update = (key) => (value) => setFilters((old) => ({ ...old, [key]: value }));
  const changeType = (value) => setFilters((old) => ({ ...old, type: value, model: "Все модели" }));
  const changeBrand = (value) => setFilters((old) => ({ ...old, brand: value, model: "Все модели" }));
  const selectedType = filters.type === "Электромобиль" ? "Электромобили" : filters.type === "Гибрид" ? "Гибриды" : "Все";
  const selectType = (value) => changeType(value === "Электромобили" ? "Электромобиль" : value === "Гибриды" ? "Гибрид" : "Все");
  const submit = (
    <button className="primary filter-submit">
      <MagnifyingGlass size={19} weight="bold" />
      Показать {resultCount} авто
    </button>
  );
  return (
    <section className="filter-panel unified-search-panel">
      <div className="type-tabs">
        {["Все", "Электромобили", "Гибриды"].map((item) => (
          <button type="button" key={item} className={selectedType === item ? "active" : ""} onClick={() => selectType(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="filter-primary-row unified-filter-primary">
        <SelectField label="Марка" value={filters.brand} onChange={changeBrand} options={["Все марки", ...brands]} searchable />
        <SelectField label="Модель" value={filters.model} onChange={update("model")} options={models} searchable disabled={filters.brand === "Все марки"} />
        <SelectField label="Год выпуска" value={filters.year} onChange={update("year")} options={yearOptions} />
        <SelectField label="Цена до Минска" value={filters.price} onChange={update("price")} options={priceOptions} formatOption={(value) => priceLimitLabel(value, currency)} />
        <SelectField label="Пробег" value={filters.mileage} onChange={update("mileage")} options={mileageOptions} />
      </div>
      {moreFiltersOpen && (
        <div className="filter-extra-row" id="catalog-extra-filters">
          <SelectField
            label="Кузов"
            value={filters.bodyType}
            onChange={(value) =>
              setFilters((old) => ({
                ...old,
                bodyType: value,
                model: "Все модели",
              }))
            }
            options={bodyTypes}
          />
          {Number(availability.drive) > 0 && <SelectField label="Привод" value={filters.drive} onChange={update("drive")} options={drives} />} {Number(availability.owners) > 0 && <SelectField label="Владельцы" value={filters.owners} onChange={update("owners")} options={ownerOptions} />} {Number(availability.claims) > 0 && <SelectField label="История" value={filters.history} onChange={update("history")} options={historyOptions} />}
        </div>
      )}
      <div className="filter-actions-row">
        <button type="button" className="more-filters-toggle" aria-expanded={moreFiltersOpen} aria-controls="catalog-extra-filters" onClick={() => setMoreFiltersOpen((open) => !open)}>
          <SlidersHorizontal size={17} />
          {moreFiltersOpen ? "Скрыть фильтры" : "Ещё фильтры"}
          <CaretDown size={15} weight="bold" />
        </button>
        {submit}
      </div>
    </section>
  );
}

function CarRow({ car, navigate, favorite, toggleFavorite }) {
  const currency = useCurrency();
  const open = () => navigate(`/cars/${car.id}`);
  const price = estimateLandedCost(car);
  const listingAge = formatListingAge(getSourceListedAt(car));
  return (
    <article className="car-row" onClick={open} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()} tabIndex="0" role="button" aria-label={`Открыть ${car.title}`}>
      <HoverImagePreview car={car} className="car-row-image" />
      <div className="car-row-info">
        <div className="row-title">
          <div>
            <h2>{car.title}</h2>
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
          <span>
            <CarProfile size={17} />
            {car.bodyType}
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
        <button>
          Подробнее <ArrowRight size={16} />
        </button>
      </div>
    </article>
  );
}

function Favorites({ navigate, favorites, toggleFavorite, cars }) {
  const favoriteCars = cars.filter((car) => favorites.has(car.id));
  return (
    <main className="catalog favorites-page page-width">
      <div className="breadcrumbs">
        <button onClick={() => navigate("/")}>Главная</button>
        <span>/</span>
        <span>Избранное</span>
      </div>
      <div className="catalog-heading">
        <div>
          <h1>Избранное</h1>
          <p>Сохранённые автомобили для быстрого сравнения</p>
        </div>
        <span>{favoriteCars.length} авто</span>
      </div>
      {favoriteCars.length ? (
        <div className="car-list">
          {favoriteCars.map((car) => (
            <CarRow key={car.id} car={car} navigate={navigate} favorite toggleFavorite={toggleFavorite} />
          ))}
        </div>
      ) : (
        <div className="empty-state favorites-empty">
          <Heart size={34} />
          <h3>В избранном пока ничего нет</h3>
          <p>Нажмите на сердце в карточке автомобиля, чтобы сохранить его здесь.</p>
          <button className="primary" onClick={() => navigate("/catalog")}>Перейти в каталог</button>
        </div>
      )}
    </main>
  );
}

function Catalog({ navigate, favorites, toggleFavorite, cars, apiMode }) {
  const pageSize = 24;
  const sortOptions = [
    { value: "newest", label: "Сначала новые" },
    { value: "price_asc", label: "Сначала дешевле" },
    { value: "price_desc", label: "Сначала дороже" },
    { value: "mileage_asc", label: "С меньшим пробегом" },
  ];
  const params = new URLSearchParams(window.location.search);
  const rawType = params.get("type");
  const rawBrand = params.get("brand");
  const rawModel = params.get("model");
  const rawBodyType = params.get("body");
  const rawYear = params.get("year");
  const rawMileage = params.get("mileage");
  const rawPrice = params.get("price");
  const rawDrive = params.get("drive");
  const rawOwners = params.get("owners");
  const rawHistory = params.get("history");
  const initialFilters = {
    type: rawType === "Электромобили" ? "Электромобиль" : rawType === "Гибриды" ? "Гибрид" : "Все",
    brand: rawBrand && rawBrand !== "Все марки" ? rawBrand : "Все марки",
    model: rawModel && rawModel !== "Все модели" ? rawModel : "Все модели",
    bodyType: BODY_TYPES.includes(rawBodyType) ? rawBodyType : "Все кузова",
    year: yearOptions.includes(rawYear) ? rawYear : ANY_YEAR,
    mileage: mileageOptions.includes(rawMileage) ? rawMileage : ANY_MILEAGE,
    price: priceOptions.includes(rawPrice) ? rawPrice : ANY_PRICE,
    drive: ["Передний", "Задний", "Полный"].includes(rawDrive) ? rawDrive : "Любой привод",
    owners: ownerOptions.includes(rawOwners) ? rawOwners : "Любое количество",
    history: historyOptions.includes(rawHistory) ? rawHistory : "Любая история",
  };
  const restoredCatalog = window.history.state?.catalog;
  const [filters, setFilters] = useState(() => ({
    ...initialFilters,
    ...(restoredCatalog?.filters || {}),
  }));
  const [remoteCars, setRemoteCars] = useState([]);
  const [remoteTotal, setRemoteTotal] = useState(0);
  const [remoteMeta, setRemoteMeta] = useState({
    brands: [],
    models: [],
    bodyTypes: [],
    drives: [],
    availability: {},
  });
  const [remoteLoading, setRemoteLoading] = useState(apiMode);
  const [remoteError, setRemoteError] = useState(false);
  const [customSearchOpen, setCustomSearchOpen] = useState(false);
  const [sort, setSort] = useState(() => (sortOptions.some((option) => option.value === restoredCatalog?.sort) ? restoredCatalog.sort : "newest"));
  const [loadedLimit, setLoadedLimit] = useState(() => Math.max(pageSize, Number(restoredCatalog?.loadedCount) || pageSize));
  const loadMoreTarget = useRef(null);
  const loadMoreRequest = useRef(null);
  const loadingMore = useRef(false);
  const updateFilters = (updater) => {
    loadMoreRequest.current?.abort();
    loadMoreRequest.current = null;
    loadingMore.current = false;
    setLoadedLimit(pageSize);
    setFilters(updater);
  };
  const updateSort = (value) => {
    loadMoreRequest.current?.abort();
    loadMoreRequest.current = null;
    loadingMore.current = false;
    setLoadedLimit(pageSize);
    setSort(value);
  };
  const brands = apiMode ? remoteMeta.brands.map((item) => item.brand) : uniqueSorted(cars.map((car) => car.brand));
  const modelCars = cars.filter((car) => (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand) && (filters.bodyType === "Все кузова" || car.bodyType === filters.bodyType));
  const models = ["Все модели", ...(apiMode ? remoteMeta.models.map((item) => item.model) : uniqueSorted(modelCars.map((car) => car.model)))];
  const bodyTypes = ["Все кузова", ...(apiMode ? remoteMeta.bodyTypes.map((item) => item.body_type) : BODY_TYPES.filter((item) => cars.some((car) => car.bodyType === item)))];
  const drives = ["Любой привод", ...(apiMode ? remoteMeta.drives.map((item) => item.drive) : uniqueSorted(cars.map((car) => car.drive).filter((value) => value && value !== "Не указан")))];
  const availability = apiMode
    ? remoteMeta.availability
    : {
        drive: cars.filter((car) => car.drive && car.drive !== "Не указан").length,
        owners: cars.filter((car) => Number(car.owners)).length,
        claims: cars.filter((car) => claimCount(car) !== null).length,
      };
  const filtered = useMemo(
    () =>
      sortCars(
        cars
          .filter((car) => {
            const cap = Number(filters.price.replace(/\D/g, ""));
            const mileageCap = Number(filters.mileage.replace(/\D/g, ""));
            return (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand) && (filters.model === "Все модели" || car.model === filters.model) && (filters.bodyType === "Все кузова" || car.bodyType === filters.bodyType) && (filters.year === ANY_YEAR || matchesMinimumYear(car, filters.year)) && (filters.mileage === ANY_MILEAGE || car.mileage <= mileageCap) && (filters.price === ANY_PRICE || estimateLandedCost(car).totalUsd <= cap) && matchesAdvancedFilters(car, filters);
          })
          .map((car) => ({
            ...car,
            estimatedTotalUsd: estimateLandedCost(car).totalUsd,
          })),
        sort,
      ),
    [filters, cars, sort],
  );
  const requestParams = () => {
    const query = new URLSearchParams({
      limit: String(loadedLimit),
      offset: "0",
    });
    query.set("sort", sort);
    if (filters.type !== "Все") query.set("type", filters.type);
    if (filters.brand !== "Все марки") query.set("brand", filters.brand);
    if (filters.model !== "Все модели") query.set("model", filters.model);
    if (filters.bodyType !== "Все кузова") query.set("bodyType", filters.bodyType);
    if (filters.drive !== "Любой привод") query.set("drive", filters.drive);
    if (filters.owners !== "Любое количество") query.set("ownersMax", String(filterNumber(filters.owners)));
    if (filters.history === "Без страховых случаев") query.set("noClaims", "1");
    if (filters.year !== ANY_YEAR) query.set("yearMin", filters.year.replace(/\D/g, ""));
    if (filters.mileage !== ANY_MILEAGE) query.set("mileageMax", filters.mileage.replace(/\D/g, ""));
    if (filters.price !== ANY_PRICE) query.set("landedMax", filters.price.replace(/\D/g, ""));
    return query;
  };
  useEffect(() => {
    if (!apiMode) return;
    const controller = new AbortController();
    setRemoteLoading(true);
    setRemoteError(false);
    const query = requestParams();
    const metaQuery = new URLSearchParams();
    if (filters.type !== "Все") metaQuery.set("type", filters.type);
    if (filters.brand !== "Все марки") metaQuery.set("brand", filters.brand);
    if (filters.bodyType !== "Все кузова") metaQuery.set("bodyType", filters.bodyType);
    Promise.all([
      fetch(`/api/cars?${query}`, { signal: controller.signal }).then((response) => (response.ok ? response.json() : Promise.reject(new Error("catalog unavailable")))),
      fetch(`/api/catalog/meta?${metaQuery}`, {
        signal: controller.signal,
      }).then((response) => (response.ok ? response.json() : Promise.reject(new Error("catalog meta unavailable")))),
    ])
      .then(([catalog, meta]) => {
        setRemoteCars(catalog.items.map(normalizeImportedCar));
        setRemoteTotal(catalog.total);
        setRemoteMeta(meta);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setRemoteError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRemoteLoading(false);
      });
    return () => controller.abort();
  }, [apiMode, filters, sort]);
  useEffect(() => {
    window.history.replaceState(
      {
        ...window.history.state,
        catalog: {
          filters,
          sort,
          loadedCount: Math.max(loadedLimit, remoteCars.length),
        },
      },
      "",
    );
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
    if (!apiMode) {
      setLoadedLimit((current) => Math.min(current + pageSize, filtered.length));
      return;
    }
    if (loadingMore.current || remoteLoading || remoteCars.length >= remoteTotal) return;
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
      setRemoteCars((current) => [...current, ...catalog.items.map(normalizeImportedCar)]);
      setLoadedLimit((current) => current + catalog.items.length);
      setRemoteTotal(catalog.total);
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
  const displayed = apiMode ? remoteCars : filtered.slice(0, loadedLimit);
  const resultCount = apiMode ? remoteTotal : filtered.length;
  const hasMore = displayed.length < resultCount;
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
  }, [apiMode, filters, sort, displayed.length, resultCount, remoteLoading, remoteError]);
  const selectedSort = sortOptions.find((option) => option.value === sort) || sortOptions[0];
  return (
    <main className="catalog page-width">
      <div className="breadcrumbs">
        <button onClick={() => navigate("/")}>Главная</button>
        <CaretRight size={13} />
        Автомобили из Китая
      </div>
      <div className="catalog-heading">
        <h1>Автомобили из Китая</h1>
      </div>
      <FilterPanel filters={filters} setFilters={updateFilters} resultCount={resultCount} brands={brands} models={models} bodyTypes={bodyTypes} drives={drives} availability={availability} />
      <div className="catalog-layout">
        <section className="results-list">
          <div className="result-tools">
            <div className="result-summary">
              <b>Подходящие варианты</b>
              <span>{resultCount} найденных</span>
            </div>
            <SelectField className="sort-custom-select" label="Сортировка" value={selectedSort.label} options={sortOptions.map((option) => option.label)} onChange={(label) => updateSort(sortOptions.find((option) => option.label === label)?.value || "newest")} />
          </div>
          {remoteError && <div className="catalog-message">Не удалось обновить выдачу. Попробуйте ещё раз.</div>}
          {displayed.length
            ? displayed.map((car) => <CarRow key={car.id} car={car} navigate={navigate} favorite={favorites.has(car.id)} toggleFavorite={toggleFavorite} />)
            : !remoteLoading && (
                <CustomSearchCta variant="empty" onOpen={() => setCustomSearchOpen(true)} />
              )}
          {remoteLoading && <div className="catalog-message">Загружаем объявления…</div>}
          {hasMore && !remoteLoading && !remoteError && <div ref={loadMoreTarget} className="catalog-scroll-sentinel" aria-hidden="true" />}
          {apiMode && hasMore && !remoteLoading && remoteError && (
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
            Как это работает
          </button>
        </aside>
      </div>
      {customSearchOpen && <CustomSearchModal filters={filters} onClose={() => setCustomSearchOpen(false)} />}
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

function PriceLabel({ label, description }) {
  return (
    <div className="price-label">
      <b>{label}</b>
      <span className="price-info" aria-label={`Подробнее: ${label}`}>
        <Info size={16} />
        <span className="price-info-popover" role="tooltip">
          {description}
        </span>
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

function Detail({ car, navigate, backToCatalog, favorite, toggleFavorite, user, authLoading, onAuthenticate, authPending }) {
  const currency = useCurrency();
  const [registrationOpen, setRegistrationOpen] = useState(false);
  if (!car) return <NotFound navigate={navigate} />;
  const price = estimateLandedCost(car);
  const specs = [
    [CalendarBlank, "Год", car.year],
    [Gauge, "Пробег", `${number(car.mileage)} км`],
    [Lightning, "Тип", car.type],
    [CarProfile, "Привод", car.drive],
    [BatteryHigh, "Батарея", car.battery ? `${car.battery} кВт·ч` : "Не указана"],
    [CarProfile, "Кузов", car.bodyType],
  ];
  const conditionFacts = [
    [CarProfile, "Владельцы в Китае", car.owners],
    [ShieldCheck, "Страховые случаи", translateClaims(car.claims || car.incident)],
    [Sparkle, "Оценка внешнего вида", car.appearanceScore ? `${car.appearanceScore}/100` : "Не указана"],
    [BatteryHigh, "Тип батареи", translateBattery(car.batteryType)],
    [Gauge, "Здоровье батареи", car.batteryHealth ? `${car.batteryHealth}%` : "Не указано"],
  ];
  return (
    <main className="detail page-width">
      <div className="breadcrumbs">
        <button onClick={() => navigate("/")}>Главная</button>
        <CaretRight size={13} />
        <button onClick={backToCatalog}>Автомобили</button>
        <CaretRight size={13} />
        {car.title}
      </div>
      <button className="back-mobile" onClick={backToCatalog}>
        <ArrowLeft size={18} />
        Назад к каталогу
      </button>
      <div className="detail-title">
        <div>
          <h1>{car.title}</h1>
          <p>
            {car.type} · {car.drive} привод · {number(car.mileage)} км
          </p>
        </div>
        <div className="detail-actions">
          <button aria-label="Поделиться">
            <ShareNetwork size={21} />
          </button>
          <button aria-label="Добавить в избранное" className={favorite ? "selected" : ""} onClick={() => toggleFavorite(car.id)}>
            <Heart size={21} weight={favorite ? "fill" : "regular"} />
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
          <section className="detail-facts-section condition-card">
            <div className="detail-facts-heading">
              <h2>Что указано в объявлении</h2>
            </div>
            <FactList items={conditionFacts} />
          </section>
          <aside className="source-card detail-source-card">
            <h3>Источник объявления</h3>
            <p className="source-meta">ID {car.sourceId}</p>
            <small>Это сведения продавца и Guazi, не наша независимая проверка. Актуальность продажи, VIN и возможность экспорта подтверждаются отдельно.</small>
          </aside>
        </div>
        <div className="detail-sidebar">
          <aside className="order-card">
            <div className="price-card-header">
              <span>Предварительный расчёт</span>
            </div>
            <div className="price-breakdown">
              <div>
                <PriceLabel label="Автомобиль в Китае" description={`${number(car.chinaPrice)} ¥ · данные Guazi`} />
                <strong>{money(price.chinaUsd, currency)}</strong>
              </div>
              <div>
                <PriceLabel label="Расходы в Китае" description="Выкуп, банк и экспортные документы" />
                <strong>{approximateMoney(price.chinaHandlingLow, price.chinaHandlingHigh, currency)}</strong>
              </div>
              <div>
                <PriceLabel label="Доставка до Минска" description="Оценка стоимости логистики" />
                <strong>{approximateMoney(price.deliveryLow, price.deliveryHigh, currency)}</strong>
              </div>
              <div>
                <PriceLabel label="Растаможка и сборы" description={price.customsNote} />
                <strong>{approximateMoney(price.customsLow, price.customsHigh, currency)}</strong>
              </div>
              <div>
                <PriceLabel label="Услуги NaVostok" description="Проверка, выкуп и документы" />
                <strong>{money(price.serviceUsd, currency)}</strong>
              </div>
            </div>
            <div className="price-total">
              <span>Итого</span>
              <strong>{approximateMoney(price.totalLow, price.totalHigh, currency)}</strong>
            </div>
            <div className="price-assumption">
              <Info size={16} />
              <span>Это не оферта. Курс НБРБ на {PRICING.rateDate}; цену продавца, маршрут и таможенные параметры нужно подтвердить.</span>
            </div>
            <details className="delivery-disclosure">
              <summary className="delivery-card-heading">
                <div className="delivery-card-icon">
                  <Clock size={23} weight="duotone" />
                </div>
                <div>
                  <span>Срок доставки до Минска</span>
                  <h2>35–50 дней</h2>
                </div>
                <CaretDown className="disclosure-caret" size={20} weight="bold" />
              </summary>
              <div className="disclosure-content delivery-disclosure-content">
                <p className="delivery-intro">Ориентировочный срок с момента подписания договора до прибытия автомобиля в Минск.</p>
                <div className="delivery-stages">
                  <div>
                    <ListChecks size={20} />
                    <p>
                      <b>Выкуп и подготовка</b>
                      <span>Проверяем автомобиль, проводим оплату и готовим экспортные документы.</span>
                    </p>
                  </div>
                  <div>
                    <MapPin size={20} />
                    <p>
                      <b>Логистика по Китаю</b>
                      <span>Доставляем автомобиль до пункта отправки и оформляем вывоз.</span>
                    </p>
                  </div>
                  <div>
                    <CarProfile size={20} />
                    <p>
                      <b>Маршрут до Минска</b>
                      <span>Международная перевозка, прохождение границы и прибытие в Минск.</span>
                    </p>
                  </div>
                </div>
                <div className="delivery-note">
                  <Info size={16} />
                  <span>Срок зависит от города продавца, очередей на границе, маршрута и графика перевозчика.</span>
                </div>
              </div>
            </details>
            <button className="primary report-order-cta" disabled={authLoading} onClick={() => (user ? navigate("/account") : setRegistrationOpen(true))}>
              Заказать отчёт о состоянии авто
            </button>
          </aside>
        </div>
      </div>
      {registrationOpen && <RegistrationModal car={car} navigate={navigate} onAuthenticate={onAuthenticate} pending={authPending} onClose={() => setRegistrationOpen(false)} />}
    </main>
  );
}

function DataTag({ type }) {
  const labels = {
    source: "Guazi",
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
    ["Оценка Guazi", translateSourceValue(car.inspectionGrade || car.conditionGrade)],
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
                <PriceLabel label="Автомобиль в Китае" description={`${number(car.chinaPrice)} ¥ · Guazi`} />
                <b>{money(price.chinaUsd, currency)}</b>
              </div>
              <div>
                <PriceLabel label="Расходы в Китае" description="Выкуп, банк, экспортные документы" />
                <b>{approximateMoney(price.chinaHandlingLow, price.chinaHandlingHigh, currency)}</b>
              </div>
              <div>
                <PriceLabel label="Доставка до Минска" description="Оценка зависит от маршрута и перевозчика" />
                <b>{approximateMoney(price.deliveryLow, price.deliveryHigh, currency)}</b>
              </div>
              <div>
                <PriceLabel label="Таможня и сборы" description={price.customsNote} />
                <b>{approximateMoney(price.customsLow, price.customsHigh, currency)}</b>
              </div>
              <div>
                <PriceLabel label="Услуги NaVostok" description="Проверка, выкуп и документы" />
                <b>{money(price.serviceUsd, currency)}</b>
              </div>
              <div>
                <PriceLabel label="Резерв на изменение расходов" description="Курс, хранение и дополнительные сборы" />
                <b>{approximateMoney(price.reserveLow, price.reserveHigh, currency)}</b>
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
                <h2>Состояние по отчёту Guazi</h2>
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
              Это заявление площадки и продавца, не независимая проверка NaVostok.
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
                  <b>Карточка Guazi найдена</b>
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
                  Оригинал Guazi <ArrowRight size={16} />
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
    text: "Смотрите реальные объявления, сравниваете комплектации и видите предварительную цену до Минска.",
  },
  {
    icon: ChatCircleText,
    title: "Мы подтверждаем объявление",
    text: "Связываемся с продавцом, уточняем наличие, цену, VIN и возможность экспорта.",
  },
  {
    icon: ShieldCheck,
    title: "Проверяем автомобиль",
    text: "Заказываем независимую диагностику кузова, техники и батареи. Результаты показываем до решения о покупке.",
  },
  {
    icon: ListChecks,
    title: "Фиксируем смету",
    text: "Согласовываем автомобиль, логистику, таможенные платежи и услуги. Неподтверждённые суммы отмечаем отдельно.",
  },
  {
    icon: CarProfile,
    title: "Выкупаем и доставляем",
    text: "Сопровождаем оплату, экспортные документы и перевозку. Вы получаете автомобиль в Минске.",
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
          <span className="info-eyebrow">Как это работает</span>
          <h1>Покупка авто из Китая — без прыжка в неизвестность</h1>
          <p>Сначала проверка автомобиля и понятная смета. Только потом — решение о покупке, договор и оплата.</p>
          <div className="info-actions">
            <button className="primary" onClick={() => navigate("/catalog")}>
              Выбрать автомобиль <ArrowRight size={18} />
            </button>
            <a href="#steps">Посмотреть этапы</a>
          </div>
        </div>
        <aside className="journey-preview" aria-label="Краткая схема покупки">
          <span>Ваш путь</span>
          <div>
            <b>01</b>
            <p>
              <strong>Выбор</strong>
              <small>Каталог и расчёт</small>
            </p>
            <Check size={18} weight="bold" />
          </div>
          <div>
            <b>02</b>
            <p>
              <strong>Проверка</strong>
              <small>Продавец, VIN, состояние</small>
            </p>
            <Clock size={18} />
          </div>
          <div>
            <b>03</b>
            <p>
              <strong>Доставка</strong>
              <small>Документы и логистика</small>
            </p>
            <CarProfile size={18} />
          </div>
          <p className="journey-note">
            <Info size={17} /> Деньги за автомобиль не переводятся до согласования результатов проверки и итоговой сметы.
          </p>
        </aside>
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
          <h1>NaVostok помогает осознанно выбрать автомобиль из Китая</h1>
          <p>Мы собираем объявления китайского вторичного рынка, приводим данные к понятному виду и сопровождаем путь от первой проверки до доставки в Минск.</p>
          <button className="primary" onClick={() => navigate("/catalog")}>
            Открыть каталог <ArrowRight size={18} />
          </button>
        </div>
        <aside className="about-statement">
          <span>Наша роль</span>
          <blockquote>Не просто показать объявление, а дать достаточно проверяемой информации для спокойного решения.</blockquote>
          <small>Команда NaVostok.by</small>
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
                <img src={`${import.meta.env.BASE_URL}cars/${item.image}`} alt={item.vehicle} />
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
                return <article className={open ? "open" : ""} key={item.question}><button type="button" aria-expanded={open} onClick={() => setOpenItem(open ? null : itemKey)}><span>{item.question}</span><b aria-hidden="true">{open ? "−" : "+"}</b></button>{open && <p>{item.answer}</p>}</article>;
              })}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

function ContactsPage({ navigate }) {
  return (
    <main className="contact-page">
      <section className="contact-hero page-width">
        <div>
          <button className="back-mobile" onClick={() => navigate("/")}>
            <ArrowLeft size={18} />
            На главную
          </button>
          <span className="info-eyebrow">Контакты</span>
          <h1>Давайте обсудим ваш автомобиль лично</h1>
          <p>Ответим на вопросы, покажем договор и расчёт, объясним проверку и доставку. Можно написать онлайн или встретиться в офисе в Минске.</p>
        </div>
        <aside className="contact-office-card">
          <span className="contact-card-icon"><MapPin size={26} weight="duotone" /></span>
          <small>Офис в Минске</small>
          <h2>{COMPANY.address}</h2>
          <p><Clock size={18} /> {COMPANY.hours}</p>
          <a className="primary" href="https://maps.google.com/?q=Минск+улица+Тимирязева+65Б" target="_blank" rel="noreferrer">
            Открыть на карте <ArrowRight size={17} />
          </a>
        </aside>
      </section>

      <section className="contact-options page-width" aria-label="Способы связи">
        <a href={COMPANY.phoneHref}>
          <Phone size={24} weight="duotone" />
          <span><small>Позвонить</small><b>{COMPANY.phone}</b><em>Будни с 09:00 до 19:00</em></span>
        </a>
        <a href={COMPANY.telegramUrl} target="_blank" rel="noreferrer">
          <TelegramLogo size={24} weight="duotone" />
          <span><small>Написать в Telegram</small><b>{COMPANY.telegram}</b><em>Обычно отвечаем за 10 минут</em></span>
        </a>
        <a href={`mailto:${COMPANY.email}`}>
          <EnvelopeSimple size={24} weight="duotone" />
          <span><small>Электронная почта</small><b>{COMPANY.email}</b><em>Документы и деловые вопросы</em></span>
        </a>
      </section>

      <section className="company-details-section">
        <div className="page-width company-details-grid">
          <div>
            <span className="info-eyebrow">Реквизиты</span>
            <h2>Работаем по договору от белорусского юридического лица</h2>
            <p>Перед оплатой фиксируем выбранный автомобиль, состав услуг, порядок расчётов и ответственность сторон.</p>
          </div>
          <dl className="company-details" id="details">
            <div><dt>Юридическое лицо</dt><dd>{COMPANY.legalName}</dd></div>
            <div><dt>УНП</dt><dd>{COMPANY.unp}</dd></div>
            <div><dt>Юридический адрес</dt><dd>{COMPANY.address}</dd></div>
            <div><dt>Расчётный счёт</dt><dd>{COMPANY.iban}</dd></div>
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
          <button className="wordmark footer-wordmark" onClick={() => navigate("/")} aria-label="На главную">Na<span>Vostok</span><small>.by</small></button>
          <p>Помогаем выбрать, проверить и доставить автомобиль из Китая в Беларусь.</p>
          <div className="footer-socials">
            <a className="telegram-social-link" href={COMPANY.telegramUrl} target="_blank" rel="noreferrer" aria-label="Telegram"><TelegramBrandIcon /></a>
            <a className="instagram-social-link" href={COMPANY.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram"><InstagramBrandIcon /></a>
          </div>
        </div>
        <div className="footer-column"><b>Компания</b><button onClick={() => navigate("/about")}>О компании</button><button onClick={() => navigate("/delivered")}>Доставленные авто</button><button onClick={() => navigate("/contacts")}>Контакты и офис</button><button onClick={() => navigate("/contacts")}>Реквизиты</button></div>
        <div className="footer-column"><b>Покупателю</b><button onClick={() => navigate("/catalog")}>Автомобили</button><button onClick={() => navigate("/how-it-works")}>Как это работает</button><button onClick={() => navigate("/payment-and-contract")}>Оплата и договор</button><button onClick={() => navigate("/guarantees")}>Гарантии</button><button onClick={() => navigate("/faq")}>Вопросы и ответы</button></div>
        <div className="footer-column footer-contacts"><b>Связаться</b><a href={COMPANY.phoneHref}>{COMPANY.phone}</a><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a><span>{COMPANY.address}</span></div>
      </div>
      <div className="page-width footer-bottom">
        <span>© 2026 {COMPANY.legalName} · УНП {COMPANY.unp}</span>
        <div><button onClick={() => navigate("/privacy")}>Политика конфиденциальности</button><button onClick={() => navigate("/terms")}>Условия использования</button></div>
      </div>
    </footer>
  );
}

function InfoCta({ navigate, title, text }) {
  return (
    <section className="info-cta page-width">
      <div>
        <span>Каталог NaVostok.by</span>
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
const guestFavoritesKey = "navostok-favorites";
const favoritesMigrationKey = "navostok-favorites-account-migration";
const accountFavoritesKey = (userId) => `navostok-account-favorites:${userId}`;
const readFavorites = (key) => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
};
const storeFavorites = (key, values) => window.localStorage.setItem(key, JSON.stringify([...values]));
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
  email_required: "Укажите email или выберите другой способ связи.",
  telegram_required: "Укажите Telegram или выберите другой способ связи.",
  unauthorized: "Сессия завершилась. Войдите ещё раз.",
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

function localUpdateProfile(userId, profile) {
  const accounts = readLocalAccounts();
  const index = accounts.findIndex((item) => item.id === userId);
  if (index < 0) throw new Error("unauthorized");
  accounts[index] = { ...accounts[index], ...profile };
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
}

function PasswordField({ label, value, onChange, autoComplete, placeholder = "", required = false }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">
      <span>{label}</span>
      <div className="password-input">
        <input type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={onChange} placeholder={placeholder} required={required} />
        <button type="button" aria-label={visible ? "Скрыть пароль" : "Показать пароль"} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>
          {visible ? <EyeSlash size={20} /> : <Eye size={20} />}
        </button>
      </div>
    </label>
  );
}

function RegistrationModal({ car, navigate, onAuthenticate, pending, onClose }) {
  const [values, setValues] = useState({ name:"", phone:"+375", password:"", confirm:"", consent:false });
  const [error, setError] = useState("");
  const [consentError, setConsentError] = useState("");
  const update = (field) => (event) => {
    setError("");
    setValues((current) => ({ ...current, [field]:event.target.type === "checkbox" ? event.target.checked : event.target.value }));
  };
  const updatePhone = (event) => {
    setError("");
    setValues((current) => ({ ...current, phone:sanitizePhoneInput(event.target.value) }));
  };
  const blockPhoneWhitespace = (event) => {
    if (/\s/.test(event.key)) event.preventDefault();
  };
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
    setError("");
    const phone = normalizeLocalPhone(values.phone);
    if (values.name.trim().length < 2) return setError(authMessages.invalid_name);
    if (phone.length < 11 || phone.length > 15) return setError(authMessages.invalid_phone);
    if (values.password.length < 8) return setError(authMessages.invalid_password);
    if (values.password !== values.confirm) return setError("Пароли не совпадают.");
    if (!values.consent) return setConsentError("Подтвердите согласие, чтобы создать аккаунт.");
    try {
      await onAuthenticate("register", values);
      onClose();
      navigate("/account");
    } catch (authError) {
      setError(authMessages[authError.message] || "Не удалось продолжить. Попробуйте ещё раз.");
    }
  };
  const leaveModal = (path) => {
    onClose();
    navigate(path);
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="lead-modal registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-modal-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Закрыть">
          <X size={19} />
        </button>
        <div className="modal-icon">
          <LockKey size={25} weight="duotone" />
        </div>
        <span>Личный кабинет</span>
        <h2 id="registration-modal-title">Создайте аккаунт</h2>
        <p>После регистрации вы перейдёте в кабинет, где сможете заказать отчёт по {car.title}.</p>
        <form onSubmit={submit}>
          <label className="auth-field"><span>Имя</span><input autoComplete="name" value={values.name} onChange={update("name")} placeholder="Например, Алексей" required autoFocus /></label>
          <label className="auth-field"><span>Телефон</span><input type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={updatePhone} onKeyDown={blockPhoneWhitespace} placeholder="+375291234567" maxLength={16} required /></label>
          <PasswordField label="Пароль" autoComplete="new-password" value={values.password} onChange={update("password")} placeholder="Минимум 8 символов" required />
          <PasswordField label="Повторите пароль" autoComplete="new-password" value={values.confirm} onChange={update("confirm")} placeholder="Ещё раз" required />
          <ConsentField checked={values.consent} onChange={(consent) => { setValues((current) => ({ ...current, consent })); if (consent) setConsentError(""); }} error={consentError} />
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="primary auth-submit" type="submit" disabled={pending}>{pending ? "Подождите…" : "Создать аккаунт"}<ArrowRight size={18} /></button>
          <p className="auth-help">Уже есть аккаунт? <button type="button" onClick={() => leaveModal("/login")}>Войти</button></p>
        </form>
      </section>
    </div>
  );
}

function AuthPage({ mode, navigate, onAuthenticate, pending }) {
  const registering = mode === "register";
  const [values, setValues] = useState({ name:"", phone:"+375", password:"", confirm:"", consent:false });
  const [error, setError] = useState("");
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
      navigate("/account");
    } catch (authError) {
      setError(authMessages[authError.message] || "Не удалось продолжить. Попробуйте ещё раз.");
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-shell page-width">
        <div className="auth-intro">
          <span className="info-eyebrow"><LockKey size={18} weight="duotone" /> Личный кабинет</span>
          <h1>{registering ? "Создайте аккаунт" : "С возвращением"}</h1>
          <p>{registering ? "Сохраняйте автомобили, следите за заявками и общайтесь с менеджером в одном месте." : "Войдите, чтобы вернуться к избранным автомобилям и своим заявкам."}</p>
          <div className="auth-benefits">
            <p><CheckCircle size={21} weight="fill" /> Избранные автомобили всегда под рукой</p>
            <p><CheckCircle size={21} weight="fill" /> История заявок и расчётов</p>
            <p><CheckCircle size={21} weight="fill" /> Статусы доставки в следующих версиях</p>
          </div>
        </div>
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-switch" role="tablist" aria-label="Тип формы">
            <button type="button" role="tab" aria-selected={!registering} className={!registering ? "active" : ""} onClick={() => navigate("/login")}>Вход</button>
            <button type="button" role="tab" aria-selected={registering} className={registering ? "active" : ""} onClick={() => navigate("/register")}>Регистрация</button>
          </div>
          {registering && <label className="auth-field"><span>Имя</span><input autoComplete="name" value={values.name} onChange={update("name")} placeholder="Например, Алексей" required /></label>}
          <label className="auth-field"><span>Телефон</span><input type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={updatePhone} onKeyDown={blockPhoneWhitespace} placeholder="+375291234567" maxLength={16} required /></label>
          <PasswordField label="Пароль" autoComplete={registering ? "new-password" : "current-password"} value={values.password} onChange={update("password")} placeholder="Минимум 8 символов" required />
          {registering && <PasswordField label="Повторите пароль" autoComplete="new-password" value={values.confirm} onChange={update("confirm")} placeholder="Ещё раз" required />}
          {registering && <label className="auth-consent"><input type="checkbox" checked={values.consent} onChange={update("consent")} /><span>Согласен с <button type="button" onClick={() => navigate("/terms")}>условиями</button> и <button type="button" onClick={() => navigate("/privacy")}>политикой конфиденциальности</button></span></label>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="primary auth-submit" type="submit" disabled={pending}>{pending ? "Подождите…" : registering ? "Создать аккаунт" : "Войти"}<ArrowRight size={18} /></button>
          <p className="auth-help">{registering ? "Уже есть аккаунт?" : "Ещё нет аккаунта?"} <button type="button" onClick={() => navigate(registering ? "/login" : "/register")}>{registering ? "Войти" : "Зарегистрироваться"}</button></p>
        </form>
      </section>
    </main>
  );
}

function AccountPage({ user, favoritesCount, navigate, onLogout, onSaveProfile, onDeleteAccount, pending }) {
  const [profile, setProfile] = useState({ name:user.name, email:user.email || "", telegram:user.telegram || "", city:user.city || "", preferredContact:user.preferredContact || "phone" });
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => {
    setProfile({ name:user.name, email:user.email || "", telegram:user.telegram || "", city:user.city || "", preferredContact:user.preferredContact || "phone" });
  }, [user]);
  const updateProfileField = (field) => (event) => {
    setProfile((current) => ({ ...current, [field]:event.target.value }));
    setProfileSaved(false);
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
  const removeAccount = async (event) => {
    event.preventDefault();
    setDeleteError("");
    if (deletePhrase !== "УДАЛИТЬ") return setDeleteError("Введите слово «УДАЛИТЬ» заглавными буквами.");
    try {
      await onDeleteAccount(deletePassword);
    } catch (error) {
      setDeleteError(authMessages[error.message] || "Не удалось удалить аккаунт.");
    }
  };
  return (
    <main className="account-page page-width">
      <header className="account-heading">
        <div><span className="info-eyebrow">Личный кабинет</span><h1>Здравствуйте, {user.name.split(" ")[0]}</h1><p>Здесь будут собраны ваши автомобили, заявки и документы.</p></div>
        <button className="secondary account-logout" onClick={onLogout} disabled={pending}><SignOut size={18} /> Выйти</button>
      </header>
      <section className="account-summary" aria-label="Сводка">
        <article><span><Heart size={23} weight="duotone" /></span><div><strong>{favoritesCount}</strong><p>В избранном</p></div><button onClick={() => navigate("/favorites")} aria-label="Открыть избранное"><CaretRight size={20} /></button></article>
        <article><span><ClipboardText size={23} weight="duotone" /></span><div><strong>0</strong><p>Активных заявок</p></div><button disabled aria-label="Заявок пока нет"><CaretRight size={20} /></button></article>
        <article><span><CarProfile size={23} weight="duotone" /></span><div><strong>—</strong><p>Авто в доставке</p></div><button disabled aria-label="Автомобилей в доставке пока нет"><CaretRight size={20} /></button></article>
      </section>
      <div className="account-grid">
        <section className="account-panel account-empty">
          <div className="account-panel-title"><div><span>Мои заявки</span><h2>Начните с подходящего автомобиля</h2></div><ClipboardText size={27} weight="duotone" /></div>
          <p>Выберите автомобиль в каталоге и оставьте заявку на расчёт. Она появится здесь после подтверждения менеджером.</p>
          <button className="primary" onClick={() => navigate("/catalog")}>Перейти в каталог <ArrowRight size={18} /></button>
        </section>
        <aside className="account-panel account-profile">
          <div className="account-avatar">{user.name.trim().slice(0, 1).toUpperCase()}</div>
          <div><span>Профиль</span><h2>{user.name}</h2><p>{formatAccountPhone(user.phone)}</p></div>
          <div className="account-note"><ShieldCheck size={20} weight="duotone" /><p>Контактные данные видны только вам и команде NaVostok.</p></div>
        </aside>
      </div>
      <form className="account-panel profile-editor" onSubmit={saveProfile}>
        <div className="profile-editor-heading">
          <div><span>Личные данные</span><h2>Контактная информация</h2><p>Заполним эти данные автоматически при следующей заявке.</p></div>
          <UserCircle size={30} weight="duotone" />
        </div>
        <div className="profile-fields">
          <label className="auth-field"><span>Имя и фамилия</span><input autoComplete="name" value={profile.name} onChange={updateProfileField("name")} maxLength={80} required /></label>
          <label className="auth-field profile-phone"><span>Телефон для входа</span><input value={formatAccountPhone(user.phone)} disabled /><small>Смену номера добавим с подтверждением по SMS.</small></label>
          <label className="auth-field"><span>Email</span><input type="email" autoComplete="email" value={profile.email} onChange={updateProfileField("email")} placeholder="name@example.com" maxLength={160} /></label>
          <label className="auth-field"><span>Telegram</span><div className="profile-input-prefix"><b>@</b><input value={profile.telegram} onChange={updateProfileField("telegram")} placeholder="username" maxLength={80} /></div></label>
          <label className="auth-field"><span>Город</span><input autoComplete="address-level2" value={profile.city} onChange={updateProfileField("city")} placeholder="Например, Минск" maxLength={120} /></label>
          <label className="auth-field"><span>Как удобнее связаться</span><select value={profile.preferredContact} onChange={updateProfileField("preferredContact")}><option value="phone">Позвонить</option><option value="telegram">Написать в Telegram</option><option value="email">Написать на email</option></select></label>
        </div>
        {profileError && <div className="auth-error" role="alert">{profileError}</div>}
        <div className="profile-actions"><button className="primary" type="submit" disabled={pending}>Сохранить изменения</button>{profileSaved && <p role="status"><CheckCircle size={18} weight="fill" /> Данные сохранены</p>}</div>
      </form>
      <section className="account-danger">
        <div><span>Управление аккаунтом</span><h2>Удаление аккаунта</h2><p>Профиль и все активные сессии будут удалены без возможности восстановления.</p></div>
        {!deleteOpen ? <button className="danger-button" type="button" onClick={() => setDeleteOpen(true)}><Trash size={18} /> Удалить аккаунт</button> : (
          <form className="delete-account-form" onSubmit={removeAccount}>
            <div className="delete-warning"><WarningCircle size={23} weight="fill" /><p><b>Это действие необратимо.</b> Для подтверждения введите пароль и слово «УДАЛИТЬ».</p></div>
            <div className="delete-fields">
              <PasswordField label="Текущий пароль" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} required />
              <label className="auth-field"><span>Подтверждение</span><input value={deletePhrase} onChange={(event) => setDeletePhrase(event.target.value)} placeholder="УДАЛИТЬ" required /></label>
            </div>
            {deleteError && <div className="auth-error" role="alert">{deleteError}</div>}
            <div className="delete-actions"><button className="secondary" type="button" onClick={() => { setDeleteOpen(false); setDeleteError(""); }}>Отмена</button><button className="danger-button solid" type="submit" disabled={pending || !deletePassword || deletePhrase !== "УДАЛИТЬ"}><Trash size={18} /> Удалить навсегда</button></div>
          </form>
        )}
      </section>
    </main>
  );
}

async function loadStaticCatalog() {
  if (typeof DecompressionStream !== "undefined") {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/cars.json.gz`, { cache: "no-store" });
      if (!response.ok || !response.body) throw new Error("compressed import unavailable");
      const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(stream).text());
    } catch {}
  }
  const response = await fetch(`${import.meta.env.BASE_URL}data/cars.json`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("import unavailable");
  return response.json();
}

export function App() {
  const { path, navigate, backToCatalog } = useRoute();
  const detailId = path.startsWith("/cars/") ? path.split("/")[2] : null;
  const orderId = path.startsWith("/orders/draft/") ? path.split("/")[3] : null;
  const targetId = detailId || orderId;
  const [favorites, setFavorites] = useState(() => readFavorites(guestFavoritesKey));
  const [currency, setCurrency] = useState(() => (window.localStorage.getItem("navostok-currency") === "BYN" ? "BYN" : "USD"));
  const [cars, setCars] = useState([]);
  const [apiMode, setApiMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [routeLoading, setRouteLoading] = useState(Boolean(targetId));
  const [loadError, setLoadError] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authPending, setAuthPending] = useState(false);
  const [authBackend, setAuthBackend] = useState("server");
  useEffect(() => {
    window.localStorage.setItem("navostok-currency", currency);
  }, [currency]);
  useEffect(() => {
    fetch("/api/auth/me", { cache:"no-store", credentials:"same-origin" })
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
      setFavorites(readFavorites(guestFavoritesKey));
      return undefined;
    }
    const localKey = accountFavoritesKey(user.id);
    const loadLocalFavorites = () => {
      let values = readFavorites(localKey);
      try {
        if (window.localStorage.getItem(localKey) === null && !window.localStorage.getItem(favoritesMigrationKey)) {
          values = readFavorites(guestFavoritesKey);
          storeFavorites(localKey, values);
          window.localStorage.setItem(favoritesMigrationKey, user.id);
        }
      } catch {}
      if (!cancelled) setFavorites(values);
    };
    if (authBackend === "local") {
      loadLocalFavorites();
      return () => { cancelled = true; };
    }
    fetch("/api/account/favorites", { cache:"no-store", credentials:"same-origin" })
      .then(async (response) => {
        if ([404, 502, 503].includes(response.status)) throw new Error("favorites_api_unavailable");
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "favorites_load_failed");
        return payload;
      })
      .then((payload) => { if (!cancelled) setFavorites(new Set(Array.isArray(payload.ids) ? payload.ids : [])); })
      .catch(() => {
        if (cancelled) return;
        setAuthBackend("local");
        loadLocalFavorites();
      });
    return () => { cancelled = true; };
  }, [authBackend, authLoading, user]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/cars?limit=60", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("api unavailable");
        const payload = await response.json();
        let initialCars = payload.items || [];
        if (targetId && !initialCars.some((car) => car.id === targetId)) {
          const detailResponse = await fetch(`/api/cars/${encodeURIComponent(targetId)}`, { cache: "no-store" });
          if (detailResponse.ok) initialCars = [...initialCars, await detailResponse.json()];
        }
        if (!cancelled) {
          setCars(initialCars.map(normalizeImportedCar));
          setApiMode(true);
        }
      } catch {
        try {
          const payload = await loadStaticCatalog();
          if (!payload.cars?.length) throw new Error("empty import");
          if (!cancelled) {
            setCars(payload.cars.map(normalizeImportedCar));
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
  useEffect(() => {
    if (!apiMode || !targetId || cars.some((item) => item.id === targetId)) return;
    const controller = new AbortController();
    setRouteLoading(true);
    fetch(`/api/cars/${encodeURIComponent(targetId)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("not found"))))
      .then((car) => setCars((current) => [...current, normalizeImportedCar(car)]))
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false);
      });
    return () => controller.abort();
  }, [apiMode, targetId, cars]);
  const toggleFavorite = (id) => {
    const previous = new Set(favorites);
    const next = new Set(favorites);
    const adding = !next.has(id);
    adding ? next.add(id) : next.delete(id);
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
    fetch(`/api/account/favorites/${encodeURIComponent(id)}`, { method:adding ? "PUT" : "DELETE", credentials:"same-origin" })
      .then(async (response) => {
        if ([404, 502, 503].includes(response.status)) {
          storeFavorites(localKey, next);
          setAuthBackend("local");
          return;
        }
        if (!response.ok) throw new Error("favorite_save_failed");
      })
      .catch(() => setFavorites(previous));
  };
  const authenticate = async (mode, values) => {
    setAuthPending(true);
    try {
      if (authBackend === "local") {
        const localUser = await localAuthenticate(mode, values);
        setUser(localUser);
        return;
      }
      let response;
      try {
        response = await fetch(`/api/auth/${mode === "register" ? "register" : "login"}`, { method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify(values) });
      } catch {
        setAuthBackend("local");
        const localUser = await localAuthenticate(mode, values);
        setUser(localUser);
        return;
      }
      if ([404, 502, 503].includes(response.status)) {
        setAuthBackend("local");
        const localUser = await localAuthenticate(mode, values);
        setUser(localUser);
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "auth_failed");
      setUser(payload.user);
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
    const normalized = { ...profile, name:profile.name.trim(), email:profile.email.trim().toLowerCase(), telegram:profile.telegram.trim().replace(/^@+/, ""), city:profile.city.trim() };
    try {
      if (authBackend === "local") {
        setUser(localUpdateProfile(user.id, normalized));
        return;
      }
      let response;
      try {
        response = await fetch("/api/account", { method:"PATCH", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify(normalized) });
      } catch {
        setAuthBackend("local");
        setUser(localUpdateProfile(user.id, normalized));
        return;
      }
      if ([404, 502, 503].includes(response.status)) {
        setAuthBackend("local");
        setUser(localUpdateProfile(user.id, normalized));
        return;
      }
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
          response = await fetch("/api/account", { method:"DELETE", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ password }) });
        } catch {
          setAuthBackend("local");
          await localDeleteAccount(user.id, password);
          response = null;
        }
        if (response && [404, 502, 503].includes(response.status)) {
          setAuthBackend("local");
          await localDeleteAccount(user.id, password);
          response = null;
        }
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
  const page =
    loading || routeLoading ? (
      <main className="simple-page page-width">
        <span>Guazi</span>
        <h1>Загружаем реальные объявления…</h1>
      </main>
    ) : loadError ? (
      <main className="simple-page page-width">
        <span>Импорт временно недоступен</span>
        <h1>Не удалось загрузить каталог</h1>
        <p>Последний импорт не найден. Запустите синхронизацию источника повторно.</p>
      </main>
    ) : path === "/" ? (
      <Home navigate={navigate} cars={cars} apiMode={apiMode} />
    ) : path === "/catalog" ? (
      <Catalog navigate={navigate} cars={cars} apiMode={apiMode} favorites={favorites} toggleFavorite={toggleFavorite} />
    ) : path === "/favorites" ? (
      <Favorites navigate={navigate} cars={cars} favorites={favorites} toggleFavorite={toggleFavorite} />
    ) : path === "/login" || path === "/register" ? (
      authLoading ? <main className="simple-page page-width"><span>Личный кабинет</span><h1>Проверяем аккаунт…</h1></main> : user ? <AccountPage user={user} favoritesCount={favorites.size} navigate={navigate} onLogout={logout} onSaveProfile={saveProfile} onDeleteAccount={removeAccount} pending={authPending} /> : <AuthPage mode={path === "/register" ? "register" : "login"} navigate={navigate} onAuthenticate={authenticate} pending={authPending} />
    ) : path === "/account" ? (
      authLoading ? <main className="simple-page page-width"><span>Личный кабинет</span><h1>Проверяем аккаунт…</h1></main> : user ? <AccountPage user={user} favoritesCount={favorites.size} navigate={navigate} onLogout={logout} onSaveProfile={saveProfile} onDeleteAccount={removeAccount} pending={authPending} /> : <AuthPage mode="login" navigate={navigate} onAuthenticate={authenticate} pending={authPending} />
    ) : orderId ? (
      <OrderDraft car={cars.find((item) => item.id === orderId)} navigate={navigate} />
    ) : detailId ? (
      <Detail car={cars.find((item) => item.id === detailId)} navigate={navigate} backToCatalog={backToCatalog} favorite={favorites.has(detailId)} toggleFavorite={toggleFavorite} user={user} authLoading={authLoading} onAuthenticate={authenticate} authPending={authPending} />
    ) : path === "/how-it-works" ? (
      <HowItWorksPage navigate={navigate} />
    ) : path === "/about" ? (
      <AboutPage navigate={navigate} />
    ) : path === "/delivered" ? (
      <DeliveredCarsPage navigate={navigate} />
    ) : path === "/payment-and-contract" ? (
      <PaymentAndContractPage navigate={navigate} />
    ) : path === "/guarantees" ? (
      <GuaranteesPage navigate={navigate} />
    ) : path === "/faq" ? (
      <FaqPage navigate={navigate} />
    ) : path === "/contacts" ? (
      <ContactsPage navigate={navigate} />
    ) : path === "/privacy" ? (
      <LegalPage navigate={navigate} kind="privacy" />
    ) : path === "/terms" ? (
      <LegalPage navigate={navigate} kind="terms" />
    ) : (
      <NotFound navigate={navigate} />
    );
  return (
    <CurrencyContext.Provider value={currency}>
      <Header navigate={navigate} favoritesCount={favorites.size} path={path} currency={currency} setCurrency={setCurrency} user={user} />
      {page}
      <SiteFooter navigate={navigate} />
    </CurrencyContext.Provider>
  );
}
