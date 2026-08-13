import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BatteryHigh, CalendarBlank, CarProfile, CaretDown, CaretRight, ChatCircleText, Check, CheckCircle, Clock, CurrencyCny, Gauge, Heart, Images, Info, Lightning, ListChecks, MagnifyingGlass, MapPin, Scales, ShareNetwork, ShieldCheck, SlidersHorizontal, Sparkle, X } from "@phosphor-icons/react";
import { matchesMinimumYear } from "./car-filters.js";

const number = (value) => new Intl.NumberFormat("ru-RU").format(value);
const uniqueSorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru"));
const PRICING = { usdByn: 2.9564, cnyBynPer10: 4.4231, eurByn: 3.4105, deliveryUsd: 3500, serviceUsd: 800, evCustomsUsd: 350, rateDate: "13.08.2026" };
const round50 = (value) => Math.round(value / 50) * 50;

function estimateLandedCost(car) {
  const cnyUsd = (PRICING.cnyBynPer10 / 10) / PRICING.usdByn;
  const eurUsd = PRICING.eurByn / PRICING.usdByn;
  const chinaUsd = round50(car.chinaPrice * cnyUsd);
  const age = 2026 - car.year;
  let customsUsd = PRICING.evCustomsUsd;
  let customsNote = "Пошлина 0% по льготе; оформление и сборы";
  if (car.type !== "Электромобиль") {
    const engineCc = 1500;
    const chinaEur = chinaUsd / eurUsd;
    let dutyEur;
    if (age < 3) {
      const percent = chinaEur <= 8500 ? 0.54 : 0.48;
      const minRate = chinaEur <= 8500 ? 2.5 : chinaEur <= 16700 ? 3.5 : chinaEur <= 42300 ? 5.5 : 7.5;
      dutyEur = Math.max(chinaEur * percent, engineCc * minRate);
    } else if (age <= 5) dutyEur = engineCc * 1.7;
    else dutyEur = engineCc * 3.2;
    customsUsd = round50(dutyEur * eurUsd + 300);
    customsNote = "Оценка для физлица и ДВС 1,5 л";
  }
  return { chinaUsd, deliveryUsd: PRICING.deliveryUsd, customsUsd, customsNote, serviceUsd: PRICING.serviceUsd, totalUsd: chinaUsd + PRICING.deliveryUsd + customsUsd + PRICING.serviceUsd };
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

function QuickSearch({ navigate, cars }) {
  const [type, setType] = useState("Все"); const [brand, setBrand] = useState("Все марки"); const [model, setModel] = useState("Все модели"); const [year, setYear] = useState("от 2022"); const [mileage, setMileage] = useState("до 50 000 км"); const [priceLimit, setPriceLimit] = useState("до $40 000");
  const brands = ["Все марки", ...uniqueSorted(cars.map((car) => car.brand))];
  const normalizedType = type === "Электромобили" ? "Электромобиль" : type === "Гибриды" ? "Гибрид" : "Все";
  const modelCars = cars.filter((car) => (normalizedType === "Все" || car.type === normalizedType) && (brand === "Все марки" || car.brand === brand));
  const models = ["Все модели", ...uniqueSorted(modelCars.map((car) => car.model))];
  const mileageCap = Number(mileage.replace(/\D/g, "")); const priceCap = Number(priceLimit.replace(/\D/g, ""));
  const resultCount = modelCars.filter((car) => (model === "Все модели" || car.model === model) && matchesMinimumYear(car, year) && car.mileage <= mileageCap && estimateLandedCost(car).totalUsd <= priceCap).length;
  const changeType = (value) => { setType(value); setModel("Все модели"); };
  const changeBrand = (value) => { setBrand(value); setModel("Все модели"); };
  return <section className="search-box"><div className="type-tabs">{["Все","Электромобили","Гибриды"].map((item) => <button key={item} className={type === item ? "active" : ""} onClick={() => changeType(item)}>{item}</button>)}</div><div className="quick-fields">
    <SelectField label="Марка" value={brand} onChange={changeBrand} options={brands} searchable/><SelectField label="Модель" value={model} onChange={setModel} options={models} searchable/><SelectField label="Год выпуска" value={year} onChange={setYear} options={["от 2022","от 2023","от 2024"]}/><SelectField label="Пробег" value={mileage} onChange={setMileage} options={["до 50 000 км","до 30 000 км","до 15 000 км"]}/><SelectField label="Цена в Минске" value={priceLimit} onChange={setPriceLimit} options={["до $40 000","до $30 000","до $25 000"]}/>
    <button className="primary search-submit" onClick={() => navigate(`/catalog?type=${encodeURIComponent(type)}&brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}&mileage=${encodeURIComponent(mileage)}&price=${encodeURIComponent(priceLimit)}`)}><MagnifyingGlass size={20} weight="bold"/>Показать {resultCount} авто</button>
  </div></section>;
}

function FeaturedCard({ car, onClick }) {
  const price = estimateLandedCost(car);
  return <article className="featured-card" onClick={onClick} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()} tabIndex="0" role="button" aria-label={`Открыть ${car.title}`}><div className="featured-image"><img src={car.image} alt={car.title}/><span className={`status ${car.statusTone}`}>{car.status}</span></div><div className="featured-body"><h3>{car.title}</h3><p>{number(car.mileage)} км · {car.type} · {car.drive}</p><div><strong>≈ ${number(price.totalUsd)}</strong><span>{number(car.chinaPrice)} ¥ в Китае</span></div></div></article>;
}

function Home({ navigate, cars }) {
  const brands = [...new Set(cars.map((car) => car.brand))].slice(0, 6);
  return <main><section className="hero"><div className="eyebrow"><Sparkle size={16} weight="fill"/>Автомобили из Китая под заказ</div><h1>Найдите свой автомобиль<br/>на китайском рынке</h1><p>Реальные объявления Guazi, оригинальные фотографии и ориентировочная цена с доставкой в Минск.</p><QuickSearch navigate={navigate} cars={cars}/><div className="popular-row"><span>В текущем импорте:</span>{brands.map((brand) => <button key={brand} onClick={() => navigate(`/catalog?brand=${encodeURIComponent(brand)}`)}>{brand}</button>)}</div></section>
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
  return <article className="car-row" onClick={open} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()} tabIndex="0" role="button" aria-label={`Открыть ${car.title}`}><div className="car-row-image"><img src={car.image} alt={car.title}/><span><Images size={15}/>{car.images?.length || 1}</span></div><div className="car-row-info"><div className="row-title"><div><h2>{car.title}</h2><span className={`status ${car.statusTone}`}>{car.status}</span></div><div className="row-actions"><button aria-label="Добавить в сравнение" className={compare ? "selected" : ""} onClick={(e) => {e.stopPropagation();toggleCompare(car.id);}}><Scales size={20} weight={compare ? "fill" : "regular"}/></button><button aria-label="Добавить в избранное" className={favorite ? "selected" : ""} onClick={(e) => {e.stopPropagation();toggleFavorite(car.id);}}><Heart size={21} weight={favorite ? "fill" : "regular"}/></button></div></div><p className="summary">{number(car.mileage)} км · {car.type} · {car.drive} привод</p><div className="mini-specs">{car.battery && <span><BatteryHigh size={17}/>{car.battery} кВт·ч</span>}{car.range && <span><Gauge size={17}/>{car.range} км</span>}<span><ShieldCheck size={17}/>Класс {car.conditionGrade || "—"}</span></div><div className="source-line"><MapPin size={15}/>{car.city}<span>•</span><Clock size={15}/>Обновлено {car.updated}<span>•</span>{car.source}</div></div><div className="car-row-price"><strong>≈ ${number(price.totalUsd)}</strong><span>ориентир до Минска</span><b>{number(car.chinaPrice)} ¥</b><small>цена в Китае</small><button>Подробнее <ArrowRight size={16}/></button></div></article>;
}

function Catalog({ navigate, favorites, toggleFavorite, compares, toggleCompare, cars }) {
  const params = new URLSearchParams(window.location.search); const rawType = params.get("type"); const rawBrand = params.get("brand"); const rawModel = params.get("model"); const rawYear = params.get("year"); const rawMileage = params.get("mileage"); const rawPrice = params.get("price");
  const [filters,setFilters] = useState({type:rawType === "Электромобили" ? "Электромобиль" : rawType === "Гибриды" ? "Гибрид" : "Все",brand:rawBrand && rawBrand !== "Все марки" ? rawBrand : "Все марки",model:rawModel && rawModel !== "Все модели" ? rawModel : "Все модели",year:["от 2022","от 2023","от 2024"].includes(rawYear) ? rawYear : "от 2022",mileage:["до 50 000 км","до 30 000 км","до 15 000 км"].includes(rawMileage) ? rawMileage : "до 50 000 км",price:["до $40 000","до $30 000","до $25 000"].includes(rawPrice) ? rawPrice : "до $40 000"});
  const brands = uniqueSorted(cars.map((car) => car.brand));
  const modelCars = cars.filter((car) => (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand));
  const models = ["Все модели", ...uniqueSorted(modelCars.map((car) => car.model))];
  const filtered = useMemo(() => cars.filter((car) => { const cap = Number(filters.price.replace(/\D/g,"")); const mileageCap = Number(filters.mileage.replace(/\D/g,"")); return (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand) && (filters.model === "Все модели" || car.model === filters.model) && matchesMinimumYear(car, filters.year) && car.mileage <= mileageCap && estimateLandedCost(car).totalUsd <= cap; }), [filters, cars]);
  return <main className="catalog page-width"><div className="breadcrumbs"><button onClick={() => navigate("/")}>Главная</button><CaretRight size={13}/>Автомобили из Китая</div><div className="catalog-heading"><div><h1>Автомобили из Китая</h1><p>Реальные объявления Guazi · закрытый пилот</p></div><span>{filtered.length} из {cars.length} импортированных</span></div><FilterPanel filters={filters} setFilters={setFilters} resultCount={filtered.length} brands={brands} models={models}/><div className="catalog-layout"><section className="results-list"><div className="result-tools"><b>Подходящие варианты</b><button>Сначала новые <CaretDown size={14}/></button></div>{filtered.length ? filtered.map((car) => <CarRow key={car.id} car={car} navigate={navigate} favorite={favorites.has(car.id)} compare={compares.has(car.id)} toggleFavorite={toggleFavorite} toggleCompare={toggleCompare}/>) : <div className="empty-state"><MagnifyingGlass size={34}/><h3>Ничего не нашли</h3><p>Попробуйте сбросить один из фильтров.</p></div>}</section><aside className="side-card"><div className="side-icon"><ShieldCheck size={26} weight="duotone"/></div><h3>Проверим выбранный автомобиль</h3><p>Свяжемся с продавцом, запросим оригинальный отчёт и подтвердим возможность экспорта.</p><ul><li><Check size={15}/>VIN и история</li><li><Check size={15}/>Состояние батареи</li><li><Check size={15}/>Итоговая смета</li></ul>{cars[0] && <button className="secondary" onClick={() => navigate(`/cars/${cars[0].id}`)}>Как выглядит проверка</button>}</aside></div></main>;
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

function Detail({ car, navigate, favorite, toggleFavorite, onOrder }) {
  if (!car) return <NotFound navigate={navigate}/>;
  const price = estimateLandedCost(car);
  const specs = [[CalendarBlank,"Год",car.year],[Gauge,"Пробег",`${number(car.mileage)} км`],[Lightning,"Тип",car.type],[CarProfile,"Привод",car.drive],[BatteryHigh,"Батарея",car.battery ? `${car.battery} кВт·ч` : "Не указана"],[ShieldCheck,"Класс Guazi",car.conditionGrade || "Не указан"]];
  return <main className="detail page-width"><div className="breadcrumbs"><button onClick={() => navigate("/")}>Главная</button><CaretRight size={13}/><button onClick={() => navigate("/catalog")}>Автомобили</button><CaretRight size={13}/>{car.title}</div><button className="back-mobile" onClick={() => navigate("/catalog")}><ArrowLeft size={18}/>Назад к каталогу</button><div className="detail-title"><div><div className="detail-kicker"><span className={`status ${car.statusTone}`}>{car.status}</span><span>Обновлено {car.updated}</span></div><h1>{car.title}</h1><p>{car.type} · {car.drive} привод · {number(car.mileage)} км</p></div><div className="detail-actions"><button aria-label="Поделиться"><ShareNetwork size={21}/></button><button aria-label="Добавить в избранное" className={favorite ? "selected" : ""} onClick={() => toggleFavorite(car.id)}><Heart size={21} weight={favorite ? "fill" : "regular"}/></button></div></div>
    <div className="detail-main"><VehicleGallery car={car}/><aside className="order-card"><div className="price-card-header"><span>Расчёт стоимости</span><b>До Минска</b></div><div className="price-breakdown"><div><p><b>Автомобиль в Китае</b><small>{number(car.chinaPrice)} ¥ по курсу НБРБ</small></p><strong>${number(price.chinaUsd)}</strong></div><div><p><b>Доставка до Минска</b><small>Автовоз, маршрут через Хоргос</small></p><strong>${number(price.deliveryUsd)}</strong></div><div><p><b>Растаможка и сборы</b><small>{price.customsNote}</small></p><strong>≈ ${number(price.customsUsd)}</strong></div><div><p><b>Услуги ChinaCar</b><small>Проверка, выкуп и документы</small></p><strong>${number(price.serviceUsd)}</strong></div></div><div className="price-total"><span>Итого до Минска</span><strong>≈ ${number(price.totalUsd)}</strong><small>без постановки на учёт и страховки</small></div><div className="price-assumption"><Info size={16}/><span>Расчёт предварительный. Курс НБРБ на {PRICING.rateDate}; точную сумму подтвердим после проверки инвойса и документов.</span></div><button className="primary" onClick={() => onOrder(car)}>Получить точный расчёт</button><button className="secondary" onClick={() => onOrder(car)}>Проверить автомобиль</button><div className="order-note"><CheckCircle size={19} weight="fill"/><p><b>Сначала проверка — потом оплата</b><span>Зафиксируем все расходы в договоре</span></p></div></aside></div>
    <section className="spec-section"><h2>Характеристики</h2><div className="spec-grid">{specs.map(([Icon,label,value]) => <div key={label}><Icon size={21} weight="duotone"/><p><span>{label}</span><b>{value}</b></p></div>)}</div></section>
    <div className="detail-columns"><section className="condition-card"><div className="section-heading small"><div><span>Состояние автомобиля</span><h2>Что известно из объявления</h2></div><b className="report-badge"><ShieldCheck size={18}/>Отчёт Guazi</b></div><div className="condition-list"><div><span>Владельцы в Китае</span><b>{car.owners}</b></div><div><span>Страховые случаи</span><b>{car.claims || car.incident}</b></div><div><span>Класс состояния</span><b>{car.conditionGrade || "Не указан"}</b></div><div><span>Оценка внешнего вида</span><b>{car.appearanceScore ? `${car.appearanceScore}/100` : "Не указана"}</b></div><div><span>Тип батареи</span><b>{car.batteryType || "Не указан"}</b></div></div>{car.sourceUrl && <a className="text-button" href={car.sourceUrl.replace(/\.md$/, ".html")} target="_blank" rel="noreferrer">Открыть оригинал Guazi <ArrowRight size={17}/></a>}</section><aside className="source-card"><h3>Источник объявления</h3><p><b>{car.source}</b><span>ID {car.sourceId}</span></p><div><Clock size={18}/><span>Последняя синхронизация<br/><b>{car.updated}</b></span></div><div><CheckCircle size={18}/><span>Статус источника<br/><b>Карточка доступна</b></span></div><small>Перевод и цена до Минска расчётные. Перед заказом менеджер повторно проверит автомобиль.</small></aside></div>
  </main>;
}

function InfoPage({ navigate, type }) { const how = type === "how"; return <main className="simple-page page-width"><button className="back-mobile" onClick={() => navigate("/")}><ArrowLeft size={18}/>На главную</button><span>{how ? "Путь автомобиля" : "О проекте"}</span><h1>{how ? "От объявления в Китае до выдачи в Минске" : "Понятный способ выбрать авто из Китая"}</h1><p>{how ? "Мы проверяем актуальность объявления, запрашиваем отчёт, согласовываем итоговую смету и только после этого оформляем заказ." : "ChinaCar.by собирает предложения китайского вторичного рынка в привычном для белорусов формате. Это демонстрационный MVP продукта."}</p><button className="primary" onClick={() => navigate("/catalog")}>Перейти в каталог <ArrowRight size={18}/></button></main>; }
function NotFound({ navigate }) { return <main className="simple-page page-width"><span>404</span><h1>Такой страницы нет</h1><button className="primary" onClick={() => navigate("/")}>Вернуться на главную</button></main>; }

function LeadModal({ car, onClose }) {
  const [sent,setSent] = useState(false); const [name,setName] = useState(""); const [phone,setPhone] = useState("");
  useEffect(() => { const onKey=(e) => e.key === "Escape" && onClose(); window.addEventListener("keydown",onKey); return () => window.removeEventListener("keydown",onKey); },[onClose]);
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="lead-modal" role="dialog" aria-modal="true"><button className="modal-close" aria-label="Закрыть" onClick={onClose}><X size={22}/></button>{!sent ? <><div className="modal-icon"><ChatCircleText size={28} weight="duotone"/></div><span>Бесплатная проверка наличия</span><h2>{car.title}</h2><p>Оставьте контакт — уточним статус у продавца и вернёмся с ответом и ориентировочной сметой.</p><form onSubmit={(e) => {e.preventDefault();if(name && phone)setSent(true);}}><label>Как к вам обращаться<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ваше имя" required autoFocus/></label><label>Номер телефона<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+375 29 000-00-00" required/></label><button className="primary" type="submit">Отправить заявку</button></form><small>Нажимая кнопку, вы соглашаетесь на обработку контактных данных.</small></> : <div className="success-state"><CheckCircle size={54} weight="fill"/><h2>Заявка отправлена</h2><p>Мы проверим {car.title} и свяжемся с вами в рабочее время.</p><button className="secondary" onClick={onClose}>Готово</button></div>}</div></div>;
}

export function App() {
  const {path,navigate}=useRoute(); const [favorites,setFavorites]=useState(new Set()); const [compares,setCompares]=useState(new Set()); const [leadCar,setLeadCar]=useState(null); const [cars,setCars]=useState([]); const [importedAt,setImportedAt]=useState(null); const [loading,setLoading]=useState(true); const [loadError,setLoadError]=useState(false);
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}data/cars.json`, { cache:"no-store" }).then((response) => { if (!response.ok) throw new Error("import unavailable"); return response.json(); }).then((payload) => { if (!payload.cars?.length) throw new Error("empty import"); setCars(payload.cars); setImportedAt(payload.generatedAt); }).catch(() => setLoadError(true)).finally(() => setLoading(false)); }, []);
  const toggleSet=(setter)=>(id)=>setter((current)=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;}); const detailId=path.startsWith("/cars/")?path.split("/")[2]:null;
  const page=loading?<main className="simple-page page-width"><span>Guazi</span><h1>Загружаем реальные объявления…</h1></main>:loadError?<main className="simple-page page-width"><span>Импорт временно недоступен</span><h1>Не удалось загрузить каталог</h1><p>Последний импорт не найден. Запустите синхронизацию источника повторно.</p></main>:path==="/"?<Home navigate={navigate} cars={cars}/>:path==="/catalog"?<Catalog navigate={navigate} cars={cars} favorites={favorites} toggleFavorite={toggleSet(setFavorites)} compares={compares} toggleCompare={toggleSet(setCompares)}/>:detailId?<Detail car={cars.find((item)=>item.id===detailId)} navigate={navigate} favorite={favorites.has(detailId)} toggleFavorite={toggleSet(setFavorites)} onOrder={setLeadCar}/>:path==="/how-it-works"?<InfoPage navigate={navigate} type="how"/>:path==="/about"?<InfoPage navigate={navigate} type="about"/>:<NotFound navigate={navigate}/>;
  return <><Header navigate={navigate} favoritesCount={favorites.size} compareCount={compares.size}/>{page}<footer><div className="page-width"><b>chinacar.by</b><span>{importedAt ? `Guazi · ${cars.length} реальных объявлений · импорт ${new Date(importedAt).toLocaleString("ru-RU")}` : "Загружаем актуальные объявления"}</span></div></footer>{leadCar&&<LeadModal car={leadCar} onClose={()=>setLeadCar(null)}/>}</>;
}
