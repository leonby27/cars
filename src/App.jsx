import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BatteryHigh, CalendarBlank, CarProfile, CaretDown, CaretRight, ChatCircleText, Check, CheckCircle, Clock, CurrencyCny, Gauge, Heart, Images, Info, Lightning, ListChecks, MagnifyingGlass, MapPin, Scales, ShareNetwork, ShieldCheck, SlidersHorizontal, Sparkle, X } from "@phosphor-icons/react";
import { matchesMinimumYear } from "./car-filters.js";
import { estimateLandedCost, PRICING } from "./pricing.js";

const number = (value) => new Intl.NumberFormat("ru-RU").format(value);
const uniqueSorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru"));
const moneyRange = (low, high) => low === high ? `$${number(low)}` : `$${number(low)}–${number(high)}`;

function formatCheckedAt(value) {
  const checked = new Date(value);
  if (!value || Number.isNaN(checked.getTime())) return "время не указано";
  const minutes = Math.max(0, Math.floor((Date.now() - checked.getTime()) / 60000));
  if (minutes < 1) return "меньше минуты назад";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return checked.toLocaleString("ru-RU", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

const displayValue = (value, fallback = "Не указано") => value === null || value === undefined || value === "" ? fallback : value;
const translateBattery = (value) => ({ "磷酸铁锂":"LFP · литий-железо-фосфатная", "三元锂":"NMC · тройная литиевая" }[value] || displayValue(value));
const translateSourceValue = (value) => value ? ({ "优秀":"Отлично", "在保中":"Гарантия действует", "非常好":"Очень хорошо", "衰减保修":"Гарантия на деградацию", "每车必检":"Обязательная проверка", "终身包退":"Пожизненный возврат по условиям Guazi" }[value] || value) : null;

function normalizeImportedCar(car) {
  const description = car.description || "";
  const legacyScore = Number(car.appearanceScore);
  const appearanceScore = legacyScore > 100 ? Number(String(legacyScore).slice(0, 2)) : legacyScore || null;
  const model = car.brand === "Deepal" ? String(car.model).replace(/^深蓝/, "") : car.brand === "Voyah" ? String(car.model).replace(/^岚图/, "") : car.model;
  const electricRange = car.electricRange ?? (Number(description.match(/纯电续航\s*(\d+)/)?.[1]) || null);
  const combinedRange = car.combinedRange ?? (Number(description.match(/综合续航\s*(\d+)/)?.[1]) || null);
  const batteryHealth = car.batteryHealth ?? (Number(description.match(/电池健康度\s*(\d+)%/)?.[1]) || null);
  return { ...car, model, title:`${car.brand} ${model} ${car.year}`, appearanceScore, electricRange, combinedRange, batteryHealth, range:car.range || electricRange || combinedRange, checkedAt:car.checkedAt || car.importedAt, status:"Карточка доступна" };
}

function useRoute() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const appPath = (pathname) => basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  const [path, setPath] = useState(appPath(window.location.pathname));
  useEffect(() => { const onPop = () => setPath(appPath(window.location.pathname)); window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  const navigate = (next) => { const target = new URL(next, window.location.origin); window.history.pushState({}, "", `${basePath}${target.pathname}${target.search}${target.hash}`); setPath(target.pathname); window.scrollTo({ top:0, behavior:"smooth" }); };
  return { path, navigate };
}

function Header({ navigate, favoritesCount, compareCount }) {
  return <header className="site-header"><div className="header-inner">
    <button className="wordmark" onClick={() => navigate("/")} aria-label="На главную">china<span>car</span><small>.by</small></button>
    <nav className="desktop-nav"><button onClick={() => navigate("/catalog")}>Автомобили</button><button onClick={() => navigate("/how-it-works")}>Как это работает</button><button onClick={() => navigate("/about")}>О сервисе</button></nav>
    <div className="header-actions"><button className="icon-label"><Scales size={21} weight="bold"/><span>Сравнение</span>{compareCount > 0 && <b>{compareCount}</b>}</button><button className="icon-label"><Heart size={21} weight={favoritesCount ? "fill" : "bold"}/><span>Избранное</span>{favoritesCount > 0 && <b>{favoritesCount}</b>}</button></div>
  </div></header>;
}

function SelectField({ label, value, options, onChange, searchable = false }) {
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
    const closeOutside = (event) => { if (!rootRef.current?.contains(event.target)) close(); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    const index = filteredOptions.indexOf(value);
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, query, value, filteredOptions]);

  useEffect(() => {
    if (open && searchable) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, searchable]);

  const choose = (item) => { onChange?.(item); close(true); };
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
      event.preventDefault(); close();
    } else if (event.key === "Tab") close();
  };

  const handleSearchKeyDown = (event) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); moveActive(event.key);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (filteredOptions[activeIndex]) choose(filteredOptions[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault(); close(true);
    } else if (event.key === "Tab") close();
  };

  return <div className={`select-field custom-select${open ? " open" : ""}`} ref={rootRef}><span>{label}</span><button ref={triggerRef} type="button" className="select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => open ? close() : setOpen(true)} onKeyDown={handleKeyDown}><b>{value}</b><CaretDown size={16} weight="bold"/></button>{open && <div className="select-menu">{searchable && <div className="select-search"><MagnifyingGlass size={16}/><input ref={searchRef} type="search" value={query} placeholder={`Поиск: ${label.toLocaleLowerCase("ru")}`} aria-label={`Поиск: ${label.toLocaleLowerCase("ru")}`} role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={listId} aria-activedescendant={filteredOptions[activeIndex] ? `${listId}-${activeIndex}` : undefined} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleSearchKeyDown}/>{query && <button type="button" className="select-search-clear" aria-label="Очистить поиск" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={14} weight="bold"/></button>}</div>}<div className="select-options" id={listId} role="listbox" aria-label={label}>{filteredOptions.length ? filteredOptions.map((item, index) => <button type="button" id={`${listId}-${index}`} role="option" aria-selected={item === value} className={`${item === value ? "selected" : ""}${index === activeIndex ? " active" : ""}`} key={item} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item)}><span>{item}</span>{item === value && <Check size={16} weight="bold"/>}</button>) : <p className="select-empty">Ничего не найдено</p>}</div></div>}</div>;
}

function QuickSearch({ navigate, cars, apiMode }) {
  const [type, setType] = useState("Все"); const [brand, setBrand] = useState("Все марки"); const [model, setModel] = useState("Все модели"); const [year, setYear] = useState("от 2022"); const [mileage, setMileage] = useState("до 50 000 км"); const [priceLimit, setPriceLimit] = useState("до $40 000");
  const [remoteMeta,setRemoteMeta] = useState({ brands:[], models:[] });
  const [remoteCount,setRemoteCount] = useState(0);
  const normalizedType = type === "Электромобили" ? "Электромобиль" : type === "Гибриды" ? "Гибрид" : "Все";
  const modelCars = cars.filter((car) => (normalizedType === "Все" || car.type === normalizedType) && (brand === "Все марки" || car.brand === brand));
  const brands = ["Все марки", ...(apiMode ? remoteMeta.brands.map((item) => item.brand) : uniqueSorted(cars.map((car) => car.brand)))];
  const models = ["Все модели", ...(apiMode ? remoteMeta.models.map((item) => item.model) : uniqueSorted(modelCars.map((car) => car.model)))];
  const mileageCap = Number(mileage.replace(/\D/g, "")); const priceCap = Number(priceLimit.replace(/\D/g, ""));
  const resultCount = modelCars.filter((car) => (model === "Все модели" || car.model === model) && matchesMinimumYear(car, year) && car.mileage <= mileageCap && estimateLandedCost(car).totalUsd <= priceCap).length;
  useEffect(() => {
    if (!apiMode) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const metaQuery = new URLSearchParams();
      const carsQuery = new URLSearchParams({ limit:"1", yearMin:year.replace(/\D/g,""), mileageMax:String(mileageCap), landedMax:String(priceCap) });
      if (normalizedType !== "Все") { metaQuery.set("type", normalizedType); carsQuery.set("type", normalizedType); }
      if (brand !== "Все марки") { metaQuery.set("brand", brand); carsQuery.set("brand", brand); }
      if (model !== "Все модели") carsQuery.set("model", model);
      try {
        const [metaResponse,carsResponse] = await Promise.all([fetch(`/api/catalog/meta?${metaQuery}`, { signal:controller.signal }), fetch(`/api/cars?${carsQuery}`, { signal:controller.signal })]);
        if (!metaResponse.ok || !carsResponse.ok) throw new Error("search unavailable");
        const [meta,catalog] = await Promise.all([metaResponse.json(),carsResponse.json()]); setRemoteMeta(meta); setRemoteCount(catalog.total);
      } catch {}
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [apiMode, normalizedType, brand, model, year, mileageCap, priceCap]);
  const changeType = (value) => { setType(value); setModel("Все модели"); };
  const changeBrand = (value) => { setBrand(value); setModel("Все модели"); };
  return <section className="search-box"><div className="type-tabs">{["Все","Электромобили","Гибриды"].map((item) => <button key={item} className={type === item ? "active" : ""} onClick={() => changeType(item)}>{item}</button>)}</div><div className="quick-fields">
    <SelectField label="Марка" value={brand} onChange={changeBrand} options={brands} searchable/><SelectField label="Модель" value={model} onChange={setModel} options={models} searchable/><SelectField label="Год выпуска" value={year} onChange={setYear} options={["от 2022","от 2023","от 2024"]}/><SelectField label="Пробег" value={mileage} onChange={setMileage} options={["до 50 000 км","до 30 000 км","до 15 000 км"]}/><SelectField label="Цена в Минске" value={priceLimit} onChange={setPriceLimit} options={["до $40 000","до $30 000","до $25 000"]}/>
    <button className="primary search-submit" onClick={() => navigate(`/catalog?type=${encodeURIComponent(type)}&brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}&mileage=${encodeURIComponent(mileage)}&price=${encodeURIComponent(priceLimit)}`)}><MagnifyingGlass size={20} weight="bold"/>Показать {apiMode ? remoteCount : resultCount} авто</button>
  </div></section>;
}

function FeaturedCard({ car, onClick }) {
  const price = estimateLandedCost(car);
  return <article className="featured-card" onClick={onClick} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()} tabIndex="0" role="button" aria-label={`Открыть ${car.title}`}><div className="featured-image"><img src={car.image} alt={car.title}/><span className={`status ${car.statusTone}`}>{car.status}</span></div><div className="featured-body"><h3>{car.title}</h3><p>{number(car.mileage)} км · {car.type} · {car.drive}</p><div><strong>≈ ${number(price.totalUsd)}</strong><span>{number(car.chinaPrice)} ¥ в Китае</span></div></div></article>;
}

function Home({ navigate, cars, apiMode }) {
  const brands = [...new Set(cars.map((car) => car.brand))].slice(0, 6);
  return <main><section className="hero"><div className="eyebrow"><Sparkle size={16} weight="fill"/>Автомобили из Китая под заказ</div><h1>Найдите свой автомобиль<br/>на китайском рынке</h1><p>Реальные объявления Guazi, оригинальные фотографии и ориентировочная цена с доставкой в Минск.</p><QuickSearch navigate={navigate} cars={cars} apiMode={apiMode}/><div className="popular-row"><span>В текущем импорте:</span>{brands.map((brand) => <button key={brand} onClick={() => navigate(`/catalog?brand=${encodeURIComponent(brand)}`)}>{brand}</button>)}</div></section>
    <section className="trust-strip page-width"><div><span><ListChecks size={22} weight="duotone"/></span><p><b>Данные обновляются автоматически</b><small>Цена, пробег и статус наличия</small></p></div><div><span><ShieldCheck size={22} weight="duotone"/></span><p><b>Проверяем до оплаты</b><small>История, батарея и документы</small></p></div><div><span><CurrencyCny size={22} weight="duotone"/></span><p><b>Показываем обе цены</b><small>В Китае и ориентир до Минска</small></p></div></section>
    <section className="featured page-width"><div className="section-heading"><div><span>Импортировано из Guazi</span><h2>Свежие реальные предложения</h2></div><button onClick={() => navigate("/catalog")}>Все автомобили <ArrowRight size={18}/></button></div><div className="featured-grid">{cars.slice(0, 3).map((car) => <FeaturedCard key={car.id} car={car} onClick={() => navigate(`/cars/${car.id}`)}/>)}</div></section>
  </main>;
}

function FilterPanel({ filters, setFilters, resultCount, brands, models }) {
  const update = (key) => (value) => setFilters((old) => ({...old, [key]:value}));
  const changeType = (value) => setFilters((old) => ({...old, type:value, model:"Все модели"}));
  const changeBrand = (value) => setFilters((old) => ({...old, brand:value, model:"Все модели"}));
  return <section className="filter-panel"><div className="filter-title"><SlidersHorizontal size={20} weight="bold"/><b>Параметры поиска</b><button onClick={() => setFilters({type:"Все",brand:"Все марки",model:"Все модели",year:"от 2022",mileage:"до 50 000 км",price:"до $40 000"})}>Сбросить</button></div><div className="filter-grid"><SelectField label="Тип двигателя" value={filters.type} onChange={changeType} options={["Все","Электромобиль","Гибрид"]}/><SelectField label="Марка" value={filters.brand} onChange={changeBrand} options={["Все марки", ...brands]} searchable/><SelectField label="Модель" value={filters.model} onChange={update("model")} options={models} searchable/><SelectField label="Год выпуска" value={filters.year} onChange={update("year")} options={["от 2022","от 2023","от 2024"]}/><SelectField label="Пробег" value={filters.mileage} onChange={update("mileage")} options={["до 50 000 км","до 30 000 км","до 15 000 км"]}/><SelectField label="Цена до Минска" value={filters.price} onChange={update("price")} options={["до $40 000","до $30 000","до $25 000"]}/><button className="primary filter-submit"><MagnifyingGlass size={19} weight="bold"/>Показать {resultCount} авто</button></div></section>;
}

function CarRow({ car, navigate, favorite, compare, toggleFavorite, toggleCompare }) {
  const open = () => navigate(`/cars/${car.id}`);
  const price = estimateLandedCost(car);
  return <article className="car-row" onClick={open} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()} tabIndex="0" role="button" aria-label={`Открыть ${car.title}`}><div className="car-row-image"><img src={car.image} alt={car.title}/><span><Images size={15}/>{car.images?.length || 1}</span></div><div className="car-row-info"><div className="row-title"><div><h2>{car.title}</h2><span className={`status ${car.statusTone}`}>{car.status}</span></div><div className="row-actions"><button aria-label="Добавить в сравнение" className={compare ? "selected" : ""} onClick={(e) => {e.stopPropagation();toggleCompare(car.id);}}><Scales size={20} weight={compare ? "fill" : "regular"}/></button><button aria-label="Добавить в избранное" className={favorite ? "selected" : ""} onClick={(e) => {e.stopPropagation();toggleFavorite(car.id);}}><Heart size={21} weight={favorite ? "fill" : "regular"}/></button></div></div><p className="summary">{number(car.mileage)} км · {car.type} · {car.drive} привод</p><div className="mini-specs">{car.battery && <span><BatteryHigh size={17}/>{car.battery} кВт·ч</span>}{car.range && <span><Gauge size={17}/>{car.range} км</span>}<span><ShieldCheck size={17}/>Класс {car.conditionGrade || "—"}</span></div><div className="source-line"><MapPin size={15}/>{car.city}<span>•</span><Clock size={15}/>Проверено {formatCheckedAt(car.checkedAt || car.importedAt)}<span>•</span>{car.source}</div></div><div className="car-row-price"><strong>≈ ${number(price.totalUsd)}</strong><span>середина диапазона до Минска</span><b>{number(car.chinaPrice)} ¥</b><small>цена в Китае</small><button>Подробнее <ArrowRight size={16}/></button></div></article>;
}

function Catalog({ navigate, favorites, toggleFavorite, compares, toggleCompare, cars, apiMode }) {
  const pageSize = 24;
  const params = new URLSearchParams(window.location.search); const rawType = params.get("type"); const rawBrand = params.get("brand"); const rawModel = params.get("model"); const rawYear = params.get("year"); const rawMileage = params.get("mileage"); const rawPrice = params.get("price");
  const [filters,setFilters] = useState({type:rawType === "Электромобили" ? "Электромобиль" : rawType === "Гибриды" ? "Гибрид" : "Все",brand:rawBrand && rawBrand !== "Все марки" ? rawBrand : "Все марки",model:rawModel && rawModel !== "Все модели" ? rawModel : "Все модели",year:["от 2022","от 2023","от 2024"].includes(rawYear) ? rawYear : "от 2022",mileage:["до 50 000 км","до 30 000 км","до 15 000 км"].includes(rawMileage) ? rawMileage : "до 50 000 км",price:["до $40 000","до $30 000","до $25 000"].includes(rawPrice) ? rawPrice : "до $40 000"});
  const [remoteCars,setRemoteCars] = useState([]);
  const [remoteTotal,setRemoteTotal] = useState(0);
  const [remoteMeta,setRemoteMeta] = useState({ brands:[], models:[] });
  const [remoteLoading,setRemoteLoading] = useState(apiMode);
  const [remoteError,setRemoteError] = useState(false);
  const brands = apiMode ? remoteMeta.brands.map((item) => item.brand) : uniqueSorted(cars.map((car) => car.brand));
  const modelCars = cars.filter((car) => (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand));
  const models = ["Все модели", ...(apiMode ? remoteMeta.models.map((item) => item.model) : uniqueSorted(modelCars.map((car) => car.model)))];
  const filtered = useMemo(() => cars.filter((car) => { const cap = Number(filters.price.replace(/\D/g,"")); const mileageCap = Number(filters.mileage.replace(/\D/g,"")); return (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand) && (filters.model === "Все модели" || car.model === filters.model) && matchesMinimumYear(car, filters.year) && car.mileage <= mileageCap && estimateLandedCost(car).totalUsd <= cap; }), [filters, cars]);
  const requestParams = () => {
    const query = new URLSearchParams({ limit:String(pageSize), offset:"0" });
    if (filters.type !== "Все") query.set("type", filters.type);
    if (filters.brand !== "Все марки") query.set("brand", filters.brand);
    if (filters.model !== "Все модели") query.set("model", filters.model);
    query.set("yearMin", filters.year.replace(/\D/g,""));
    query.set("mileageMax", filters.mileage.replace(/\D/g,""));
    query.set("landedMax", filters.price.replace(/\D/g,""));
    return query;
  };
  useEffect(() => {
    if (!apiMode) return;
    const controller = new AbortController();
    setRemoteLoading(true); setRemoteError(false);
    const query = requestParams();
    const metaQuery = new URLSearchParams();
    if (filters.type !== "Все") metaQuery.set("type", filters.type);
    if (filters.brand !== "Все марки") metaQuery.set("brand", filters.brand);
    Promise.all([
      fetch(`/api/cars?${query}`, { signal:controller.signal }).then((response) => response.ok ? response.json() : Promise.reject(new Error("catalog unavailable"))),
      fetch(`/api/catalog/meta?${metaQuery}`, { signal:controller.signal }).then((response) => response.ok ? response.json() : Promise.reject(new Error("catalog meta unavailable"))),
    ]).then(([catalog,meta]) => { setRemoteCars(catalog.items.map(normalizeImportedCar)); setRemoteTotal(catalog.total); setRemoteMeta(meta); }).catch((error) => { if (error.name !== "AbortError") setRemoteError(true); }).finally(() => { if (!controller.signal.aborted) setRemoteLoading(false); });
    return () => controller.abort();
  }, [apiMode, filters]);
  const loadMore = async () => {
    const query = requestParams(); query.set("offset", String(remoteCars.length));
    setRemoteLoading(true); setRemoteError(false);
    try { const response = await fetch(`/api/cars?${query}`); if (!response.ok) throw new Error("catalog unavailable"); const catalog = await response.json(); setRemoteCars((current) => [...current, ...catalog.items.map(normalizeImportedCar)]); setRemoteTotal(catalog.total); }
    catch { setRemoteError(true); }
    finally { setRemoteLoading(false); }
  };
  const displayed = apiMode ? remoteCars : filtered;
  const resultCount = apiMode ? remoteTotal : filtered.length;
  return <main className="catalog page-width"><div className="breadcrumbs"><button onClick={() => navigate("/")}>Главная</button><CaretRight size={13}/>Автомобили из Китая</div><div className="catalog-heading"><div><h1>Автомобили из Китая</h1><p>Реальные объявления Guazi · закрытый пилот</p></div><span>{displayed.length} из {resultCount} найденных</span></div><FilterPanel filters={filters} setFilters={setFilters} resultCount={resultCount} brands={brands} models={models}/><div className="catalog-layout"><section className="results-list"><div className="result-tools"><b>Подходящие варианты</b><button>Сначала новые <CaretDown size={14}/></button></div>{remoteError && <div className="catalog-message">Не удалось обновить выдачу. Попробуйте ещё раз.</div>}{displayed.length ? displayed.map((car) => <CarRow key={car.id} car={car} navigate={navigate} favorite={favorites.has(car.id)} compare={compares.has(car.id)} toggleFavorite={toggleFavorite} toggleCompare={toggleCompare}/>) : !remoteLoading && <div className="empty-state"><MagnifyingGlass size={34}/><h3>Ничего не нашли</h3><p>Попробуйте сбросить один из фильтров.</p></div>}{remoteLoading && <div className="catalog-message">Загружаем объявления…</div>}{apiMode && displayed.length < resultCount && !remoteLoading && <button className="load-more" onClick={loadMore}>Показать ещё {Math.min(pageSize, resultCount - displayed.length)} авто</button>}</section><aside className="side-card"><div className="side-icon"><ShieldCheck size={26} weight="duotone"/></div><h3>Проверим выбранный автомобиль</h3><p>Свяжемся с продавцом, запросим оригинальный отчёт и подтвердим возможность экспорта.</p><ul><li><Check size={15}/>VIN и история</li><li><Check size={15}/>Состояние батареи</li><li><Check size={15}/>Итоговая смета</li></ul>{displayed[0] && <button className="secondary" onClick={() => navigate(`/cars/${displayed[0].id}`)}>Как выглядит проверка</button>}</aside></div></main>;
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
    requestAnimationFrame(() => imageRefs.current[initialIndex]?.scrollIntoView({ block:"start" }));
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current); if (navigationFrame.current) cancelAnimationFrame(navigationFrame.current); };
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { modal.scrollTop = target; return; }
    navigating.current = true;
    const startedAt = performance.now();
    const animate = (now) => {
      const progress = Math.min(1, (now - startedAt) / 180);
      const eased = 1 - Math.pow(1 - progress, 3);
      modal.scrollTop = start + (target - start) * eased;
      if (progress < 1) navigationFrame.current = requestAnimationFrame(animate);
      else { navigationFrame.current = null; navigating.current = false; setActiveIndex(index); }
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
        if (distance < closestDistance) { closestDistance = distance; closestIndex = index; }
      });
      setActiveIndex((current) => current === closestIndex ? current : closestIndex);
    });
  };
  return <div ref={modalRef} className="gallery-modal" role="dialog" aria-modal="true" aria-label={`Фотографии ${car.title}`} onScroll={trackActiveImage} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><header><div><b>{car.title}</b><span>{activeIndex + 1} из {images.length}</span></div><button aria-label="Закрыть галерею" onClick={onClose}><X size={24}/></button></header><div className="gallery-modal-content"><aside className="gallery-modal-rail" aria-label="Миниатюры фотографий">{images.map((image, index) => <button key={`${image}-thumb-${index}`} ref={(node) => { thumbRefs.current[index] = node; }} className={activeIndex === index ? "active" : ""} onClick={() => jumpTo(index)} aria-label={`Перейти к фото ${index + 1}`} aria-current={activeIndex === index ? "true" : undefined}><img src={image} alt="" loading={index > 8 ? "lazy" : "eager"}/></button>)}</aside><div className="gallery-modal-list">{images.map((image, index) => <figure key={`${image}-${index}`} ref={(node) => { imageRefs.current[index] = node; }}><img src={image} alt={`${car.title}, фото ${index + 1}`} loading={index > initialIndex + 2 ? "lazy" : "eager"}/><figcaption>{index + 1} из {images.length}</figcaption></figure>)}</div></div></div>;
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
  const move = (step) => { setSlideDirection(step > 0 ? "next" : "prev"); setActive((current) => (current + step + images.length) % images.length); };
  const selectImage = (index) => { if (index === active) return; setSlideDirection(index > active ? "next" : "prev"); setActive(index); };
  useEffect(() => {
    const thumb = thumbsRef.current?.children[active];
    const rail = thumbsRef.current;
    if (!thumb || !rail) return;
    const thumbLeft = thumb.offsetLeft;
    const thumbRight = thumbLeft + thumb.offsetWidth;
    if (thumbLeft < rail.scrollLeft) rail.scrollTo({ left:thumbLeft, behavior:"smooth" });
    else if (thumbRight > rail.scrollLeft + rail.clientWidth) rail.scrollTo({ left:thumbRight - rail.clientWidth, behavior:"smooth" });
  }, [active]);
  const onPointerDown = (event) => {
    if (!event.isPrimary) return;
    swipe.current = { id:event.pointerId, x:event.clientX, y:event.clientY };
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
    window.setTimeout(() => { suppressOpen.current = false; }, 0);
  };
  const openGallery = () => {
    if (suppressOpen.current) { suppressOpen.current = false; return; }
    setModalOpen(true);
  };
  const cancelSwipe = () => { swipe.current = null; setDragging(false); setDragOffset(0); };
  return <><section className="gallery-panel"><button className={`gallery-open${dragging ? " dragging" : ""}`} style={{"--gallery-drag-x":`${dragOffset}px`}} onClick={openGallery} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={cancelSwipe} aria-label={`Открыть все фотографии ${car.title}. Смахните влево или вправо, чтобы сменить фото`}><img key={`${active}-${images[active]}`} className={`gallery-slide-${slideDirection}`} src={images[active]} alt={`${car.title}, фото ${active + 1}`} draggable="false"/></button><span aria-live="polite"><Images size={17}/>{active + 1} из {images.length}</span><div className="gallery-badges"><b>Оригинал Guazi</b><b>Фото объявления</b></div>{images.length > 1 && <div className="gallery-controls"><button aria-label="Предыдущее фото" onClick={() => move(-1)}><ArrowLeft size={20}/></button><button aria-label="Следующее фото" onClick={() => move(1)}><ArrowRight size={20}/></button></div>}<div className="gallery-thumbs" ref={thumbsRef}>{images.map((image, index) => <button key={`${image}-${index}`} className={active === index ? "active" : ""} onClick={() => selectImage(index)} aria-label={`Показать фото ${index + 1}`}><img src={image} alt="" loading="lazy"/></button>)}</div><button className="gallery-view-all" onClick={() => setModalOpen(true)}><Images size={18}/>Все фото</button></section>{modalOpen && <GalleryModal car={car} images={images} initialIndex={active} onClose={() => setModalOpen(false)}/>}</>;
}

function Detail({ car, navigate, favorite, toggleFavorite }) {
  if (!car) return <NotFound navigate={navigate}/>;
  const price = estimateLandedCost(car);
  const specs = [[CalendarBlank,"Год",car.year],[Gauge,"Пробег",`${number(car.mileage)} км`],[Lightning,"Тип",car.type],[CarProfile,"Привод",car.drive],[BatteryHigh,"Батарея",car.battery ? `${car.battery} кВт·ч` : "Не указана"],[ShieldCheck,"Класс Guazi",car.conditionGrade || "Не указан"]];
  return <main className="detail page-width"><div className="breadcrumbs"><button onClick={() => navigate("/")}>Главная</button><CaretRight size={13}/><button onClick={() => navigate("/catalog")}>Автомобили</button><CaretRight size={13}/>{car.title}</div><button className="back-mobile" onClick={() => navigate("/catalog")}><ArrowLeft size={18}/>Назад к каталогу</button><div className="detail-title"><div><div className="detail-kicker"><span className={`status ${car.statusTone}`}>{car.status}</span><span>Проверено {formatCheckedAt(car.checkedAt || car.importedAt)}</span></div><h1>{car.title}</h1><p>{car.type} · {car.drive} привод · {number(car.mileage)} км</p></div><div className="detail-actions"><button aria-label="Поделиться"><ShareNetwork size={21}/></button><button aria-label="Добавить в избранное" className={favorite ? "selected" : ""} onClick={() => toggleFavorite(car.id)}><Heart size={21} weight={favorite ? "fill" : "regular"}/></button></div></div>
    <div className="detail-main"><VehicleGallery car={car}/><aside className="order-card"><div className="price-card-header"><span>Предварительный расчёт</span><b>До Минска</b></div><div className="price-breakdown"><div><p><b>Автомобиль в Китае</b><small>{number(car.chinaPrice)} ¥ · данные Guazi</small></p><strong>${number(price.chinaUsd)}</strong></div><div><p><b>Расходы в Китае</b><small>Выкуп, банк и экспортные документы</small></p><strong>{moneyRange(price.chinaHandlingLow, price.chinaHandlingHigh)}</strong></div><div><p><b>Доставка до Минска</b><small>Предварительный диапазон логистики</small></p><strong>{moneyRange(price.deliveryLow, price.deliveryHigh)}</strong></div><div><p><b>Растаможка и сборы</b><small>{price.customsNote}</small></p><strong>{moneyRange(price.customsLow, price.customsHigh)}</strong></div><div><p><b>Услуги ChinaCar</b><small>Проверка, выкуп и документы</small></p><strong>${number(price.serviceUsd)}</strong></div></div><div className="price-total"><span>Диапазон до Минска</span><strong>{moneyRange(price.totalLow, price.totalHigh)}</strong><small>включая резерв, без постановки на учёт и страховки</small></div><div className="price-assumption"><Info size={16}/><span>Это не оферта. Курс НБРБ на {PRICING.rateDate}; цену продавца, маршрут и таможенные параметры нужно подтвердить.</span></div><button className="primary" onClick={() => navigate(`/orders/draft/${car.id}`)}>Рассчитать заказ</button><div className="order-note"><CheckCircle size={19} weight="fill"/><p><b>Сначала видите весь черновик</b><span>Контакт понадобится только при запуске проверки</span></p></div></aside></div>
    <section className="spec-section"><h2>Характеристики</h2><div className="spec-grid">{specs.map(([Icon,label,value]) => <div key={label}><Icon size={21} weight="duotone"/><p><span>{label}</span><b>{value}</b></p></div>)}</div></section>
    <div className="detail-columns"><section className="condition-card"><div className="section-heading small"><div><span>Состояние автомобиля</span><h2>Что указано в объявлении</h2></div><b className="report-badge"><ShieldCheck size={18}/>Данные Guazi</b></div><div className="condition-list"><div><span>Владельцы в Китае</span><b>{car.owners}</b></div><div><span>Страховые случаи</span><b>{car.claims || car.incident}</b></div><div><span>Класс состояния</span><b>{car.conditionGrade || "Не указан"}</b></div><div><span>Оценка внешнего вида</span><b>{car.appearanceScore ? `${car.appearanceScore}/100` : "Не указана"}</b></div><div><span>Тип батареи</span><b>{translateBattery(car.batteryType)}</b></div><div><span>Здоровье батареи</span><b>{car.batteryHealth ? `${car.batteryHealth}%` : "Не указано"}</b></div></div>{car.sourceUrl && <a className="text-button" href={car.sourceUrl.replace(/\.md$/, ".html")} target="_blank" rel="noreferrer">Открыть оригинал Guazi <ArrowRight size={17}/></a>}</section><aside className="source-card"><h3>Источник объявления</h3><p><b>{car.source}</b><span>ID {car.sourceId}</span></p><div><Clock size={18}/><span>Последняя синхронизация<br/><b>{formatCheckedAt(car.checkedAt || car.importedAt)}</b></span></div><div><CheckCircle size={18}/><span>Статус источника<br/><b>Карточка доступна</b></span></div><small>Это сведения продавца и Guazi, не наша независимая проверка. Актуальность продажи, VIN и возможность экспорта подтверждаются отдельно.</small></aside></div>
  </main>;
}

function DataTag({ type }) {
  const labels = { source:"Guazi", calculated:"Расчёт", pending:"Нужно подтвердить" };
  return <span className={`data-tag ${type}`}>{labels[type]}</span>;
}

function SourceGrid({ rows }) {
  const visible = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (!visible.length) return <p className="order-empty">Источник не передал эти данные.</p>;
  return <div className="order-facts">{visible.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>;
}

function OrderDraft({ car, navigate }) {
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [contact, setContact] = useState("");
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  if (!car) return <NotFound navigate={navigate}/>;
  const price = estimateLandedCost(car);
  const sourceLink = car.sourceUrl?.replace(/\.md$/, ".html");
  const saveDraft = async (event) => {
    event.preventDefault();
    setSaving(true); setSaveError("");
    try {
      const response = await fetch("/api/order-drafts", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ listingId:car.id, contact:contact.trim(), calculation:{ chinaPriceCny:car.chinaPrice, chinaUsd:price.chinaUsd, totalLow:price.totalLow, totalHigh:price.totalHigh, totalUsd:price.totalUsd, rateDate:PRICING.rateDate } }) });
      if (!response.ok) throw new Error("save unavailable");
      setSaved(await response.json());
    } catch { setSaveError("Не удалось сохранить черновик. Проверьте подключение к серверу и попробуйте ещё раз."); }
    finally { setSaving(false); }
  };
  const vehicleRows = [
    ["Первая регистрация", car.firstRegistration], ["Пробег", `${number(car.mileage)} км`], ["Город", car.city],
    ["Владельцы", car.owners], ["Двигатель", car.engine], ["Коробка", car.transmission],
    ["Привод", car.drive], ["Цвет", car.bodyColor], ["Класс", car.vehicleClass],
  ];
  const batteryRows = [
    ["Ёмкость", car.battery ? `${car.battery} кВт·ч` : null], ["Тип", car.batteryType ? translateBattery(car.batteryType) : null],
    ["Производитель", car.batteryBrand], ["Здоровье батареи", car.batteryHealth ? `${car.batteryHealth}%` : null],
    ["Запас хода на электротяге", car.electricRange ? `${car.electricRange} км` : null], ["Суммарный запас хода", car.combinedRange ? `${car.combinedRange} км` : null],
    ["Гарантия на силовую установку", translateSourceValue(car.warranty)], ["Защита батареи", translateSourceValue(car.batteryProtection)],
  ];
  const conditionRows = [
    ["Оценка Guazi", translateSourceValue(car.inspectionGrade || car.conditionGrade)], ["Внешний вид", car.appearanceScore ? `${car.appearanceScore}/100` : null],
    ["Страховые выплаты", car.claims || car.incident], ["Силовая установка", car.powertrainInspection],
    ["Кузов", car.bodyInspection], ["Каркас кузова", car.structureInspection], ["Интерьер", car.interiorInspection], ["Подкапотное пространство", car.engineBayInspection],
  ];
  const assistanceRows = [
    ["Система помощи", car.driverAssistance], ["Уровень", car.assistanceLevel], ["Чип мультимедиа", car.infotainmentChip],
    ["Радары", car.radarCount ? `${car.radarCount} шт.` : null], ["Камеры", car.cameraCount ? `${car.cameraCount} шт.` : null], ["Ультразвуковые датчики", car.ultrasonicCount ? `${car.ultrasonicCount} шт.` : null],
  ];
  return <main className="order-page page-width">
    <div className="breadcrumbs"><button onClick={() => navigate("/")}>Главная</button><CaretRight size={13}/><button onClick={() => navigate(`/cars/${car.id}`)}>{car.title}</button><CaretRight size={13}/>Предварительный заказ</div>
    <button className="back-mobile" onClick={() => navigate(`/cars/${car.id}`)}><ArrowLeft size={18}/>Назад к автомобилю</button>
    <div className="order-heading"><div><span>Черновик заказа · {car.sourceId}</span><h1>Предварительный заказ</h1><p>Мы собрали всё, что уже известно, и отдельно отметили расчёты и данные, требующие подтверждения.</p></div><DataTag type="pending"/></div>
    <section className="order-car-summary"><img src={car.image} alt={car.title}/><div><span className={`status ${car.statusTone}`}>{car.status}</span><h2>{car.title}</h2><p>{number(car.mileage)} км · {car.type} · {car.drive} привод</p><small>Источник проверен {formatCheckedAt(car.checkedAt || car.importedAt)}</small></div><div className="order-source-price"><span>Цена в Китае <DataTag type="source"/></span><b>{number(car.chinaPrice)} ¥</b><small>≈ ${number(price.chinaUsd)} по расчётному курсу</small></div></section>
    <div className="order-layout"><div className="order-content">
      <section className="order-section"><div className="order-section-title"><div><span>01</span><h2>Предварительная стоимость</h2></div><DataTag type="calculated"/></div><div className="order-cost-list"><div><span>Автомобиль в Китае<small>{number(car.chinaPrice)} ¥ · Guazi</small></span><b>${number(price.chinaUsd)}</b></div><div><span>Расходы в Китае<small>Выкуп, банк, экспортные документы</small></span><b>{moneyRange(price.chinaHandlingLow, price.chinaHandlingHigh)}</b></div><div><span>Доставка до Минска<small>Диапазон зависит от маршрута и перевозчика</small></span><b>{moneyRange(price.deliveryLow, price.deliveryHigh)}</b></div><div><span>Таможня и сборы<small>{price.customsNote}</small></span><b>{moneyRange(price.customsLow, price.customsHigh)}</b></div><div><span>Услуги ChinaCar<small>Проверка, выкуп и документы</small></span><b>${number(price.serviceUsd)}</b></div><div><span>Резерв на изменение расходов<small>Курс, хранение и дополнительные сборы</small></span><b>{moneyRange(price.reserveLow, price.reserveHigh)}</b></div></div><div className="order-grand-total"><span>Ожидаемый диапазон до Минска<small>без постановки на учёт и страховки</small></span><b>{moneyRange(price.totalLow, price.totalHigh)}</b></div><div className="order-disclaimer"><Info size={18}/><p>Курс НБРБ на {PRICING.rateDate}. Это предварительная модель, а не оферта. Итог меняется после подтверждения цены продавцом, VIN, маршрута и таможенных параметров.</p></div></section>
      <section className="order-section"><div className="order-section-title"><div><span>02</span><h2>Автомобиль</h2></div><DataTag type="source"/></div><SourceGrid rows={vehicleRows}/></section>
      <section className="order-section"><div className="order-section-title"><div><span>03</span><h2>Батарея и запас хода</h2></div><DataTag type="source"/></div><SourceGrid rows={batteryRows}/></section>
      <section className="order-section"><div className="order-section-title"><div><span>04</span><h2>Состояние по отчёту Guazi</h2></div><DataTag type="source"/></div><SourceGrid rows={conditionRows}/>{car.description && <div className="source-description"><b>Комментарий из объявления</b><p>{car.description}</p></div>}<p className="source-warning"><Info size={17}/>Это заявление площадки и продавца, не независимая проверка ChinaCar.</p></section>
      <section className="order-section"><div className="order-section-title"><div><span>05</span><h2>Оснащение и ассистенты</h2></div><DataTag type="source"/></div><SourceGrid rows={assistanceRows}/></section>
    </div><aside className="order-progress"><div className="progress-card"><span>Статус заказа</span><h3>Можно запускать проверку</h3><ol><li className="done"><Check size={15}/><p><b>Карточка Guazi найдена</b><small>{formatCheckedAt(car.checkedAt || car.importedAt)}</small></p></li><li className="done"><Check size={15}/><p><b>Данные и фото загружены</b><small>{car.images?.length || 1} оригинальных фото</small></p></li><li><span>3</span><p><b>Подтверждение продавца</b><small>Наличие и актуальная цена</small></p></li><li><span>4</span><p><b>VIN и экспорт</b><small>Документы и ограничения</small></p></li><li><span>5</span><p><b>Независимая проверка</b><small>Кузов, батарея и диагностика</small></p></li></ol>{!verificationOpen && <button className="primary" onClick={() => setVerificationOpen(true)}>Запустить проверку <ArrowRight size={18}/></button>}{verificationOpen && !saved && <form className="verification-form" onSubmit={saveDraft}><div className="modal-icon"><ChatCircleText size={24} weight="duotone"/></div><h4>Куда прислать результат?</h4><p>Оставьте телефон или Telegram. Имя и другие данные сейчас не нужны.</p><label>Телефон или @username<input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="+375 … или @telegram" required autoFocus/></label><button className="primary" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить и продолжить"}</button>{saveError && <small className="form-error">{saveError}</small>}<small>Черновик и расчёт сохранятся в базе; объявление попадёт в приоритетную очередь перепроверки.</small></form>}{saved && <div className="verification-saved"><CheckCircle size={42} weight="fill"/><h4>Черновик №{saved.id} сохранён</h4><p>Заявка записана в базе, а актуальность объявления будет перепроверена в приоритетном порядке.</p></div>}<div className="progress-links">{sourceLink && <a href={sourceLink} target="_blank" rel="noreferrer">Оригинал Guazi <ArrowRight size={16}/></a>}<button onClick={() => navigate(`/cars/${car.id}`)}>Вернуться к автомобилю</button></div></div></aside></div>
  </main>;
}

function InfoPage({ navigate, type }) { const how = type === "how"; return <main className="simple-page page-width"><button className="back-mobile" onClick={() => navigate("/")}><ArrowLeft size={18}/>На главную</button><span>{how ? "Путь автомобиля" : "О проекте"}</span><h1>{how ? "От объявления в Китае до выдачи в Минске" : "Понятный способ выбрать авто из Китая"}</h1><p>{how ? "Мы проверяем актуальность объявления, запрашиваем отчёт, согласовываем итоговую смету и только после этого оформляем заказ." : "ChinaCar.by собирает предложения китайского вторичного рынка в привычном для белорусов формате. Это демонстрационный MVP продукта."}</p><button className="primary" onClick={() => navigate("/catalog")}>Перейти в каталог <ArrowRight size={18}/></button></main>; }
function NotFound({ navigate }) { return <main className="simple-page page-width"><span>404</span><h1>Такой страницы нет</h1><button className="primary" onClick={() => navigate("/")}>Вернуться на главную</button></main>; }

export function App() {
  const {path,navigate}=useRoute();
  const detailId=path.startsWith("/cars/")?path.split("/")[2]:null; const orderId=path.startsWith("/orders/draft/")?path.split("/")[3]:null; const targetId=detailId || orderId;
  const [favorites,setFavorites]=useState(new Set()); const [compares,setCompares]=useState(new Set()); const [cars,setCars]=useState([]); const [catalogTotal,setCatalogTotal]=useState(0); const [importedAt,setImportedAt]=useState(null); const [apiMode,setApiMode]=useState(false); const [loading,setLoading]=useState(true); const [routeLoading,setRouteLoading]=useState(Boolean(targetId)); const [loadError,setLoadError]=useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/cars?limit=60", { cache:"no-store" });
        if (!response.ok) throw new Error("api unavailable");
        const payload = await response.json();
        let initialCars = payload.items || [];
        if (targetId && !initialCars.some((car) => car.id === targetId)) { const detailResponse = await fetch(`/api/cars/${encodeURIComponent(targetId)}`, { cache:"no-store" }); if (detailResponse.ok) initialCars = [...initialCars, await detailResponse.json()]; }
        if (!cancelled) { setCars(initialCars.map(normalizeImportedCar)); setCatalogTotal(payload.total); setImportedAt(initialCars[0]?.checkedAt || new Date().toISOString()); setApiMode(true); }
      } catch {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}data/cars.json`, { cache:"no-store" });
          if (!response.ok) throw new Error("import unavailable");
          const payload = await response.json();
          if (!payload.cars?.length) throw new Error("empty import");
          if (!cancelled) { setCars(payload.cars.map(normalizeImportedCar)); setCatalogTotal(payload.cars.length); setImportedAt(payload.generatedAt); setApiMode(false); }
        } catch { if (!cancelled) setLoadError(true); }
      } finally { if (!cancelled) { setLoading(false); setRouteLoading(false); } }
    };
    load(); return () => { cancelled=true; };
  }, []);
  useEffect(() => {
    if (!apiMode || !targetId || cars.some((item) => item.id === targetId)) return;
    const controller = new AbortController(); setRouteLoading(true);
    fetch(`/api/cars/${encodeURIComponent(targetId)}`, { signal:controller.signal }).then((response) => response.ok ? response.json() : Promise.reject(new Error("not found"))).then((car) => setCars((current) => [...current, normalizeImportedCar(car)])).catch(() => {}).finally(() => { if (!controller.signal.aborted) setRouteLoading(false); });
    return () => controller.abort();
  }, [apiMode, targetId, cars]);
  const toggleSet=(setter)=>(id)=>setter((current)=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});
  const page=loading || routeLoading?<main className="simple-page page-width"><span>Guazi</span><h1>Загружаем реальные объявления…</h1></main>:loadError?<main className="simple-page page-width"><span>Импорт временно недоступен</span><h1>Не удалось загрузить каталог</h1><p>Последний импорт не найден. Запустите синхронизацию источника повторно.</p></main>:path==="/"?<Home navigate={navigate} cars={cars} apiMode={apiMode}/>:path==="/catalog"?<Catalog navigate={navigate} cars={cars} apiMode={apiMode} favorites={favorites} toggleFavorite={toggleSet(setFavorites)} compares={compares} toggleCompare={toggleSet(setCompares)}/>:orderId?<OrderDraft car={cars.find((item)=>item.id===orderId)} navigate={navigate}/>:detailId?<Detail car={cars.find((item)=>item.id===detailId)} navigate={navigate} favorite={favorites.has(detailId)} toggleFavorite={toggleSet(setFavorites)}/>:path==="/how-it-works"?<InfoPage navigate={navigate} type="how"/>:path==="/about"?<InfoPage navigate={navigate} type="about"/>:<NotFound navigate={navigate}/>;
  return <><Header navigate={navigate} favoritesCount={favorites.size} compareCount={compares.size}/>{page}<footer><div className="page-width"><b>chinacar.by</b><span>{importedAt ? `Guazi · ${catalogTotal} реальных объявлений · проверка ${new Date(importedAt).toLocaleString("ru-RU")}` : "Загружаем актуальные объявления"}</span></div></footer></>;
}
