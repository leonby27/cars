import { AnalyticsVisitsChart } from "./analytics-visits-chart.jsx";
import { vehiclePhotoHref } from "./photo-source.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CarProfile, ChartLineUp, MagnifyingGlass, SignOut, Trash, Tray, UsersThree } from "./icons.jsx";
import { hasYandexClickId, withoutYandexClickId } from "./analytics.js";
import { formatVisitDate } from "./analytics-format.js";
import { analyticsNoCountHref } from "./analytics-links.js";
import { analyticsUpdatesUrl } from "./analytics-updates.js";

// В базе объявление хранится с приставкой источника («che168-59355862»), а адрес
// карточки на сайте — только с номером. Ссылки этого раздела ведут на сайт, поэтому
// приставку снимаем: иначе из кабинета уходит и попадает в переписку адрес,
// которого у нас на сайте быть не должно (страница по нему открывается, но
// каноническим считается короткий).
const listingNumber = (value) => String(value ?? "").replace(/^(che168|guazi|ch|gz)[-_]/i, "");
const carHref = (id) => `/cars/${encodeURIComponent(listingNumber(id))}`;
const formatNumber = (value) => new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
const formatDate = (value, withTime = false) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", withTime ? { dateStyle:"short", timeStyle:"short" } : { day:"2-digit", month:"short" }).format(date);
};
// В списке заявок дата важнее всего, поэтому у свежих показываем «сегодня» и время:
// менеджеру нужно с одного взгляда понять, звонить прямо сейчас или это старая заявка.
const formatLeadDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = new Intl.DateTimeFormat("ru-RU", { hour:"2-digit", minute:"2-digit" }).format(date);
  const today = new Date();
  const sameDay = (left, right) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (sameDay(date, today)) return `Сегодня, ${time}`;
  if (sameDay(date, yesterday)) return `Вчера, ${time}`;
  const withYear = date.getFullYear() !== today.getFullYear();
  return `${new Intl.DateTimeFormat("ru-RU", { day:"2-digit", month:"long", ...(withYear ? { year:"numeric" } : {}) }).format(date)}, ${time}`;
};
const percent = (part, total) => total ? `${(Number(part || 0) / Number(total) * 100).toFixed(1).replace(".", ",")}%` : "0%";
const average = (part, total) => total ? (Number(part || 0) / Number(total)).toFixed(1).replace(".", ",") : "0";
const formatUsd = (value) => (Number(value) ? `$${new Intl.NumberFormat("ru-RU").format(Math.round(Number(value)))}` : "");
const usePersistedChoice = (key, choices, fallback) => {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") return fallback;
    try {
      const stored = window.localStorage.getItem(key);
      return choices.includes(stored) ? stored : fallback;
    } catch { return fallback; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, value); } catch { /* приватный режим может запретить хранилище */ }
  }, [key, value]);
  return [value, setValue];
};
// Фотохранилище Che168 отдаёт снимок любой ширины: она стоит в адресе перед именем
// файла. В списке заявок фото размером с ноготь, полноразмерный кадр здесь ни к чему.
const leadPhoto = (source, width = 240) => vehiclePhotoHref(source, width) || "";
const leadKindLabels = {
  availability:"Запрос актуальности",
  order_started:"Автомобиль отложен",
  listing_draft:"Заявка с карточки",
  custom_search:"Индивидуальный подбор",
};
const leadSourceLabels = { account:"Личный кабинет", site:"Форма на сайте" };
const contactMethodLabels = { phone:"Телефон", viber:"Viber", telegram:"Telegram" };
const stageLabels = {
  availability:{ decision:"Актуальность не запрошена", requested:"Ждёт проверки актуальности", confirmed:"Актуальность подтверждена" },
  inspection:{ decision:"Осмотр не выбран", requested:"Заказан осмотр", skipped:"Без осмотра" },
  contract:{ locked:"", available:"Договор доступен", confirmed:"Договор подтверждён" },
  payment:{ locked:"", available:"Оплата доступна", invoice_requested:"Запрошен счёт" },
};
// Заявку, где клиент уже что-то попросил, надо разбирать первой — красим её акцентом,
// а просто отложенный автомобиль оставляем спокойным.
const stageTone = (lead) => {
  if (lead.kind === "order_started") return "quiet";
  if (lead.stages?.payment === "invoice_requested" || lead.stages?.contract === "confirmed") return "hot";
  return "new";
};
const filterLabels = {
  type:"Тип", brand:"Марка", model:"Модель", bodyType:"Кузов", color:"Цвет",
  yearMin:"Год от", yearMax:"Год до", mileage:"Пробег", priceMin:"Цена от", priceMax:"Цена до",
  drive:"Привод", owners:"Владельцы", battery:"Батарея", condition:"Состояние",
  accel:"Разгон", tire:"Шины", torque:"Момент", sort:"Сортировка",
};

function Login({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/analytics/login", { method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ password }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "login_failed");
      onSuccess();
    } catch (loginError) {
      if (loginError.message === "analytics_not_configured") setError("Пароль аналитики ещё не настроен на сервере.");
      else if (loginError.message === "too_many_requests") setError("Слишком много попыток входа. Подождите и попробуйте позже.");
      else setError("Неверный пароль.");
    } finally { setPending(false); }
  };
  return (
    <main className="analytics-login page-width">
      <section className="analytics-login-card" aria-label="Вход в аналитику">
        <form onSubmit={submit}>
          <label><span>Пароль</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required /></label>
          {error && <div className="analytics-error" role="alert">{error}</div>}
          <button className="primary" type="submit" disabled={pending || !password}>{pending ? "Проверяем…" : "Войти"}</button>
        </form>
      </section>
    </main>
  );
}

function ResetAnalyticsModal({ pending, error, onCancel, onConfirm }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, pending]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !pending && onCancel()}>
      <section className="analytics-reset-modal" role="dialog" aria-modal="true" aria-labelledby="analytics-reset-title">
        <h2 id="analytics-reset-title">Обнулить всю аналитику?</h2>
        <p>Будут безвозвратно удалены просмотры, клики, регистрации и заявки из аналитики. Аккаунты пользователей, заказы и каталог останутся без изменений.</p>
        {error && <div className="analytics-error" role="alert">{error}</div>}
        <div><button className="secondary" type="button" onClick={onCancel} disabled={pending}>Отмена</button><button className="analytics-reset-confirm" type="button" onClick={onConfirm} disabled={pending}>{pending ? "Обнуляем…" : "Да, обнулить"}</button></div>
      </section>
    </div>
  );
}

function LeadCar({ car }) {
  if (!car) {
    return <div className="lead-car lead-car-empty"><span><CarProfile size={20} weight="duotone" /></span><div><strong>Без конкретного автомобиля</strong><span>Клиент описал, что ищет — смотрите комментарий ниже</span></div></div>;
  }
  const facts = [car.mileage ? `${formatNumber(car.mileage)} км` : "", formatUsd(car.estimatedTotalUsd)].filter(Boolean).join(" · ");
  return (
    <a className="lead-car" href={analyticsNoCountHref(carHref(car.id))} target="_blank" rel="noreferrer">
      {car.image ? <img src={leadPhoto(car.image)} alt="" loading="lazy" width="88" height="66" /> : <span><CarProfile size={20} weight="duotone" /></span>}
      <div>
        <strong>{car.title}</strong>
        <span>{car.missing ? "Объявление больше не в каталоге" : facts || listingNumber(car.id)}</span>
      </div>
    </a>
  );
}

function LeadCard({ lead }) {
  const phoneHref = lead.customer.phone ? `tel:${lead.customer.phone.replace(/[^+\d]/g, "")}` : "";
  const methods = (lead.customer.methods || []).map((method) => contactMethodLabels[method] || method).join(", ");
  const stages = lead.stages
    ? Object.entries(lead.stages).map(([key, value]) => stageLabels[key]?.[value]).filter(Boolean)
    : [];
  const filters = lead.filters ? Object.entries(lead.filters).filter(([, value]) => (Array.isArray(value) ? value.length : value && value !== "any" && value !== "all")) : [];
  return (
    <article className={`lead-card tone-${stageTone(lead)}`}>
      <header className="lead-card-head">
        <span className={`lead-kind kind-${lead.kind}`}>{leadKindLabels[lead.kind] || "Заявка"}</span>
        <time dateTime={lead.createdAt}>{formatLeadDate(lead.createdAt)}</time>
      </header>
      <LeadCar car={lead.car} />
      <dl className="lead-facts">
        <div><dt>Клиент</dt><dd>{lead.customer.name || "Имя не указано"}</dd></div>
        <div><dt>Телефон</dt><dd>{phoneHref ? <a href={phoneHref}>{lead.customer.phone}</a> : (lead.customer.contact || "—")}</dd></div>
        {methods && <div><dt>Как связаться</dt><dd>{methods}</dd></div>}
        {lead.customer.telegram && <div><dt>Telegram</dt><dd>@{lead.customer.telegram.replace(/^@/, "")}</dd></div>}
        {lead.customer.email && <div><dt>Email</dt><dd><a href={`mailto:${lead.customer.email}`}>{lead.customer.email}</a></dd></div>}
        {lead.customer.city && <div><dt>Город</dt><dd>{lead.customer.city}</dd></div>}
        <div><dt>Источник</dt><dd>{leadSourceLabels[lead.source]}{lead.orderNumber ? ` · ${lead.orderNumber}` : ""}</dd></div>
      </dl>
      {lead.comment && <blockquote className="lead-comment">{lead.comment}</blockquote>}
      {!!filters.length && (
        <div className="lead-filters">
          {filters.map(([key, value]) => <span key={key}><b>{filterLabels[key] || key}:</b> {Array.isArray(value) ? value.join(", ") : value}</span>)}
        </div>
      )}
      {!!stages.length && <div className="lead-stages">{stages.map((stage) => <span key={stage}>{stage}</span>)}</div>}
    </article>
  );
}

function LeadsSection({ leads, loading, error, unavailable, reload }) {
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const counts = useMemo(() => ({
    all:leads.length,
    car:leads.filter((lead) => lead.car).length,
    custom_search:leads.filter((lead) => lead.kind === "custom_search").length,
  }), [leads]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (kind === "car" && !lead.car) return false;
      if (kind === "custom_search" && lead.kind !== "custom_search") return false;
      if (!needle) return true;
      const haystack = [lead.customer.name, lead.customer.phone, lead.customer.email, lead.customer.telegram, lead.car?.title, lead.car?.id, lead.comment, lead.orderNumber].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [leads, kind, query]);
  const lastLead = leads[0];
  return (
    <>
      <section className="analytics-kpis" aria-label="Заявки в цифрах">
        <article><span>Всего заявок</span><strong>{formatNumber(counts.all)}</strong><p>За всё время работы</p></article>
        <article><span>На конкретный автомобиль</span><strong>{formatNumber(counts.car)}</strong><p>Клиент выбрал машину в каталоге</p></article>
        <article><span>Индивидуальный подбор</span><strong>{formatNumber(counts.custom_search)}</strong><p>Описали, что ищут, своими словами</p></article>
        <article><span>Последняя заявка</span><strong className="analytics-kpi-small">{lastLead ? formatLeadDate(lastLead.createdAt) : "—"}</strong><p>{lastLead?.customer.name || "Заявок пока нет"}</p></article>
      </section>
      <section className="analytics-panel">
        <div className="analytics-panel-heading">
          <div><h2>Заявки клиентов</h2><p>Автомобиль, контакты и комментарий — всё, что нужно, чтобы перезвонить</p></div>
          <button className="analytics-reset-button" type="button" onClick={reload} disabled={loading}>{loading ? "Обновляем…" : "Обновить"}</button>
        </div>
        <div className="lead-toolbar">
          <div className="analytics-range" aria-label="Тип заявки">
            {[["all", `Все · ${counts.all}`], ["car", `По автомобилю · ${counts.car}`], ["custom_search", `Подбор · ${counts.custom_search}`]].map(([value, label]) => (
              <button key={value} type="button" className={kind === value ? "active" : ""} onClick={() => setKind(value)}>{label}</button>
            ))}
          </div>
          <input className="lead-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, телефон, автомобиль" aria-label="Поиск по заявкам" />
        </div>
        {error && <div className="analytics-error" role="alert">{error}</div>}
        {filtered.length ? (
          <div className="lead-list">{filtered.map((lead) => <LeadCard key={lead.id} lead={lead} />)}</div>
        ) : (
          <p className="analytics-empty">{unavailable ? "Заявки хранятся на основном сайте — на этой копии их нет." : leads.length ? "По этому условию заявок нет." : "Заявок пока не было. Как только клиент оставит контакты, они появятся здесь."}</p>
        )}
      </section>
    </>
  );
}

const trendPeriods = [
  { id:"90", label:"За 90 дней" },
  { id:"30", label:"За 30 дней" },
  { id:"7", label:"За 7 дней" },
];
const trendPeriodIds = trendPeriods.map(({ id }) => id);

function TrendPeriodSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const selected = trendPeriods.find((item) => item.id === value) || trendPeriods[0];
  useEffect(() => {
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  const choose = (id) => {
    onChange(id);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const handleKeyDown = (event) => {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!open) { setOpen(true); return; }
    const index = trendPeriods.findIndex((item) => item.id === value);
    const step = event.key === "ArrowDown" ? 1 : -1;
    choose(trendPeriods[(index + step + trendPeriods.length) % trendPeriods.length].id);
  };
  return <div className={`analytics-trend-period${open ? " open" : ""}`} ref={rootRef}>
    <button ref={triggerRef} className="analytics-trend-period-trigger" type="button" aria-label={`Период графика посещений: ${selected.label}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((state) => !state)} onKeyDown={handleKeyDown}>
      <span>{selected.label}</span><b aria-hidden="true" />
    </button>
    {open && <div className="analytics-trend-period-menu" role="listbox" aria-label="Период графика посещений">
      {trendPeriods.map((item) => <button key={item.id} type="button" role="option" aria-selected={item.id === value} className={item.id === value ? "selected" : ""} onClick={() => choose(item.id)}>{item.label}</button>)}
    </div>}
  </div>;
}

function OverviewSection({ data, period, unreadVisits = 0 }) {
  const summary = data.summary || {};
  const [trendPeriod, setTrendPeriod] = usePersistedChoice("analytics:trend-period", trendPeriodIds, "90");
  const [trendData, setTrendData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState("");
  const trendCache = useRef(new Map());
  const [showYandex, setShowYandex] = usePersistedChoice("analytics:trend-yandex", ["0", "1"], "0");
  const [showGoogle, setShowGoogle] = usePersistedChoice("analytics:trend-google", ["0", "1"], "0");
  const daily = trendData?.daily || [];
  const enabledSources = [showYandex === "1" ? "yandex" : "", showGoogle === "1" ? "google" : ""].filter(Boolean);
  useEffect(() => {
    const controller = new AbortController();
    const cached = trendCache.current.get(trendPeriod);
    if (cached) setTrendData(cached);
    setTrendLoading(!cached && !trendData);
    setTrendError("");
    fetch(`/api/analytics/trend?period=${encodeURIComponent(trendPeriod)}`, { cache:"no-store", credentials:"same-origin", signal:controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "load_failed");
        trendCache.current.set(trendPeriod, payload);
        setTrendData(payload);
      })
      .catch((error) => { if (error.name !== "AbortError") setTrendError("Не удалось загрузить график."); })
      .finally(() => { if (!controller.signal.aborted) setTrendLoading(false); });
    return () => controller.abort();
  }, [trendPeriod]);
  // Заявки, регистрации и избранное берутся из самих таблиц сайта, поэтому совпадают
  // с разделом «Заявки»; просмотры и посетители — единственное, что считается по событиям.
  const cards = [
    // Роботов в число посетителей не берём, но и не скрываем: заход, на котором никто
    // не двинул мышью, не прокрутил и не нажал ни одной клавиши, считается отдельно —
    // так видно, сколько на сайт приходит машинного трафика. Просто время на странице
    // человеком не считается: его выжидает обходчик, чтобы сойти за посетителя.
    // Заход — не вкладка: человек, вернувшийся вечером, считается вторым заходом, а
    // три карточки, открытые в трёх вкладках подряд, остаются одним.
    ["Заходы", summary.visits, `${formatNumber(summary.visitors)} уник.${Number(summary.robot_visits) ? ` +${formatNumber(summary.robot_visits)} без действий` : ""}`],
    ["Просмотры авто", summary.vehicle_views, `${average(summary.vehicle_views, summary.visitors)} на посетителя`],
    // Машины, добавленные в кабинет: человек нажал в карточке «Уточнить актуальность»,
    // вошёл в кабинет и там завёлся заказ. Считаем по самим заказам, а не по нажатию:
    // нажатие бывает и у тех, кто ушёл на входе. Рядом мелким — заявки, оставленные
    // формой, минуя кабинет. Кнопка «Уточнить актуальность» внутри самого заказа
    // отдельной цифрой больше не выводится (решение владельца 06.09.2026): пока
    // проверка объявлений приостановлена, эта цифра ничего не решала.
    ["Машины в кабинете", summary.cabinet_orders, `${percent(summary.cabinet_orders, summary.vehicle_views)} от просмотров авто${summary.form_requests ? ` · ещё ${formatNumber(summary.form_requests)} заявок с форм` : ""}${summary.custom_searches ? ` · ${formatNumber(summary.custom_searches)} на подбор` : ""}`],
    ["Регистрации", summary.registrations, `${formatNumber(summary.favorites)} добавлений в избранное`],
  ];
  return (
    <>
      <section className="analytics-kpis" aria-label="Ключевые метрики">{cards.map(([label,value,note]) => <article key={label}><span>{label}</span><strong>{formatNumber(value)}</strong><p>{note}</p></article>)}</section>
      <section className="analytics-panel analytics-trend">
        <div className="analytics-trend-heading">
          <h2>График посещений</h2>
          <div className="analytics-trend-controls">
            <TrendPeriodSelect value={trendPeriod} onChange={setTrendPeriod} />
            <label className="analytics-chart-source-toggle is-yandex"><input type="checkbox" checked={showYandex === "1"} onChange={(event) => setShowYandex(event.target.checked ? "1" : "0")} /><span>Яндекс</span></label>
            <label className="analytics-chart-source-toggle is-google"><input type="checkbox" checked={showGoogle === "1"} onChange={(event) => setShowGoogle(event.target.checked ? "1" : "0")} /><span>Google</span></label>
          </div>
        </div>
        {trendLoading ? <p className="analytics-empty">Загружаем график…</p> : trendError && !daily.length ? <p className="analytics-empty">{trendError}</p> : daily.length ? <div key={`${trendData.period}-${trendData.generatedAt}`} className="analytics-chart-swap"><AnalyticsVisitsChart daily={daily} period={period} now={trendData.generatedAt || data.generatedAt} sources={enabledSources} /></div> : <p className="analytics-empty">За выбранный период событий ещё нет.</p>}
      </section>
      <PromoSection summary={summary} />
      <VisitsSection visits={data.visits || []} total={summary.visits} unread={unreadVisits} />
    </>
  );
}

/**
 * Рекламная врезка в материалах журнала: сколько раз её довели до экрана, сколько раз
 * по ней нажали и какая доля. Показ отмечается не открытием статьи, а появлением
 * врезки на экране — иначе доля нажатий говорила бы о том, доскроллили ли до неё, а
 * не о самой врезке.
 */
function PromoSection({ summary }) {
  const shown = Number(summary.promo_shown) || 0;
  const clicks = Number(summary.promo_clicks) || 0;
  const [open, setOpen] = useState(false);
  return (
    <section className={`analytics-panel analytics-disclosure ${open ? "" : "is-collapsed"}`}>
      <button className="analytics-collapse-trigger" type="button" aria-label={open ? "Свернуть баннер в статьях" : "Развернуть баннер в статьях"} aria-expanded={open} onClick={() => setOpen((value) => !value)}><span><h2>Баннер в статьях</h2></span><b className="analytics-chevron" aria-hidden="true" /></button>
      {open && <dl className="analytics-figures">
        <div><dt>Показы</dt><dd>{formatNumber(shown)}</dd></div>
        <div><dt>Нажатия</dt><dd>{formatNumber(clicks)}</dd></div>
        <div><dt>Доля нажатий</dt><dd>{percent(clicks, shown)}</dd></div>
      </dl>}
    </section>
  );
}

const visitSourceKey = (value, landingPath = "") => {
  if (hasYandexClickId(landingPath)) return "yandex";
  const source = String(value || "").toLowerCase();
  if (/(^|\.)google\./.test(source)) return "google";
  if (/(^|\.)yandex\./.test(source)) return "yandex";
  return "other";
};

const visitSourceLabel = (value, landingPath = "") => {
  // У старых заходов источник ещё не сохранялся, но ysclid в странице входа
  // позволяет восстановить переход из Яндекса и для уже накопленной истории.
  const sourceKey = visitSourceKey(value, landingPath);
  if (sourceKey === "yandex") return "Яндекс";
  if (sourceKey === "google") return "Google";
  const source = String(value || "").toLowerCase();
  if (!source) return "Не определён";
  if (source === "direct") return "Прямой заход";
  if (source === "internal") return "Переход по сайту";
  if (source === "unknown") return "Неизвестный источник";
  if (/(^|\.)bing\.com$/.test(source)) return "Bing";
  if (/(^|\.)duckduckgo\.com$/.test(source)) return "DuckDuckGo";
  if (/(^|\.)instagram\.com$/.test(source)) return "Instagram";
  if (/(^|\.)facebook\.com$/.test(source)) return "Facebook";
  if (source === "t.co" || /(^|\.)x\.com$/.test(source)) return "X (Twitter)";
  if (/(^|\.)vk\.com$/.test(source)) return "ВКонтакте";
  if (source === "t.me" || /(^|\.)telegram\.(me|org)$/.test(source)) return "Telegram";
  return source;
};

function VisitSource({ visit }) {
  const sourceKey = visitSourceKey(visit.source, visit.landingPath);
  return <span className="analytics-visit-source">
    {sourceKey !== "other" && <i className={`analytics-source-logo is-${sourceKey}`} aria-hidden="true">{sourceKey === "google" ? "G" : "Я"}</i>}
    <span>{visitSourceLabel(visit.source, visit.landingPath)}</span>
  </span>;
}

function VisitRow({ visit, number, unread }) {
  const landingPath = withoutYandexClickId(visit.landingPath || "/");
  const sourceUnknown = !hasYandexClickId(visit.landingPath) && (!visit.source || visit.source === "unknown");
  return <tr>
    <td><span className={`analytics-visit-number${unread ? " is-unread" : ""}`}>{number}</span></td>
    <td className={sourceUnknown ? "analytics-visit-source-unknown" : undefined}><VisitSource visit={visit} /></td>
    <td><a href={analyticsNoCountHref(landingPath)} target="_blank" rel="noreferrer" title={landingPath === "/" ? "Главная" : landingPath || "—"}>{landingPath === "/" ? "Главная" : landingPath || "—"}</a></td>
    <td>{formatNumber(visit.pageViews)}</td>
    <td>{formatVisitDate(visit.createdAt)}</td>
  </tr>;
}

function VisitsSection({ visits, total, unread }) {
  const [sourceFilter, setSourceFilter] = useState("all");
  // Свежие строки идут первыми, но номер — место захода во всей хронологии:
  // самый старый начинается с 1, каждый следующий получает номер больше.
  const newestNumber = Math.max(visits.length, Number(total) || 0);
  const filteredVisits = visits
    .map((visit, index) => ({ visit, index }))
    .filter(({ visit }) => sourceFilter === "all" || visitSourceKey(visit.source, visit.landingPath) === sourceFilter);
  return (
    <section className="analytics-panel analytics-visits-panel">
      <div className="analytics-visits-heading">
        <h2>Заходы</h2>
        <div className="analytics-visits-toolbar">
          <div className="analytics-range analytics-visits-filter" aria-label="Источник заходов">
            {[["all", "Все"], ["yandex", "Яндекс"], ["google", "Google"]].map(([id, label]) => <button key={id} type="button" className={sourceFilter === id ? "active" : ""} onClick={() => setSourceFilter(id)}>{label}</button>)}
          </div>
          {sourceFilter !== "all" && <span className="analytics-visits-filter-count" title="Заходов по выбранному источнику">{formatNumber(filteredVisits.length)}</span>}
        </div>
      </div>
      <div className="analytics-table-wrap analytics-visits-table"><table><thead><tr><th>Номер</th><th>Источник</th><th>Страница входа</th><th>Просмотров</th><th>Дата</th></tr></thead>
        <tbody>{filteredVisits.length ? filteredVisits.map(({ visit, index }) => <VisitRow key={`${visit.createdAt}-${visit.landingPath}-${index}`} visit={visit} number={newestNumber - index} unread={index < Number(unread || 0)} />) : <tr><td colSpan="5">{sourceFilter === "all" ? "За выбранный период заходов пока нет." : "За выбранный период таких заходов нет."}</td></tr>}</tbody></table></div>
    </section>
  );
}

const vehicleModes = [
  { id:"cars", label:"Авто" },
  { id:"models", label:"Модели" },
  { id:"favorites", label:"Избранное" },
];

const modelTitle = (title) => String(title || "").replace(/\s+\d{4}\s*$/, "").trim() || title || "—";

function VehiclesSection({ data, updates, markViewed }) {
  const [mode, setMode] = useState("cars");
  // Во всех представлениях сначала показываем то, что смотрели последним.
  const [sort, setSort] = useState({ column:"lastViewed", desc:true });
  const [visible, setVisible] = useState(20);
  const models = useMemo(() => Object.values((data.vehicles || []).reduce((grouped, item) => {
    const title = modelTitle(item.listingTitle);
    const row = grouped[title] || { id:title, title, viewers:0, views:0, lastViewedAt:null };
    row.viewers += Number(item.viewers) || 0;
    row.views += Number(item.views) || 0;
    if (!row.lastViewedAt || new Date(item.lastViewedAt).getTime() > new Date(row.lastViewedAt).getTime()) row.lastViewedAt = item.lastViewedAt;
    grouped[title] = row;
    return grouped;
  }, {})), [data.vehicles]);
  const sources = {
    models,
    cars:(data.vehicles || []).map((item) => ({ ...item, id:item.listingId, title:item.listingTitle || listingNumber(item.listingId), asks:item.availabilityClicks })),
    favorites:(data.favorites || []).map((item) => ({ ...item, id:item.listingId, title:item.listingTitle || listingNumber(item.listingId), lastViewedAt:item.addedAt })),
  };
  const columns = mode === "favorites"
    ? [
      { id:"title", label:"Автомобиль", text:true, value:(item) => item.title || "" },
      { id:"people", label:"Люди", value:(item) => Number(item.people) || 0 },
      { id:"status", label:"Статус", text:true, value:(item) => item.gone ? "Нет в каталоге" : item.status === "unavailable" ? "Снята с продажи" : "В продаже" },
      { id:"lastViewed", label:"Просмотр", value:(item) => item.lastViewedAt ? new Date(item.lastViewedAt).getTime() || 0 : 0 },
    ]
    : [
      { id:"title", label:mode === "models" ? "Модель" : "Автомобиль", text:true, value:(item) => item.title || "" },
      { id:"viewers", label:"Люди", value:(item) => Number(item.viewers) || 0 },
      { id:"views", label:"Просмотры", value:(item) => Number(item.views) || 0 },
      ...(mode === "cars" ? [{ id:"asks", label:"Уточнения", value:(item) => Number(item.asks) || 0 }] : []),
      { id:"lastViewed", label:"Просмотр", value:(item) => item.lastViewedAt ? new Date(item.lastViewedAt).getTime() || 0 : 0 },
    ];
  const rows = useMemo(() => {
    const column = columns.find((item) => item.id === sort.column) || columns[0];
    const direction = sort.desc ? -1 : 1;
    return [...sources[mode]].sort((left, right) => {
      const a = column.value(left); const b = column.value(right);
      return (column.text ? String(a).localeCompare(String(b), "ru") : (a === b ? 0 : a < b ? -1 : 1)) * direction;
    });
  }, [mode, sources.models, sources.cars, sources.favorites, columns, sort]);
  const setVehicleMode = (nextMode) => {
    setMode(nextMode); setVisible(20);
    setSort({ column:"lastViewed", desc:true });
    if (nextMode === "cars" || nextMode === "favorites") markViewed(`vehicle_${nextMode}`);
  };
  const toggleSort = (column) => setSort((current) => current.column === column.id ? { column:column.id, desc:!current.desc } : { column:column.id, desc:!column.text });
  return <section className="analytics-panel" aria-label="Автомобили">
    <div className="analytics-panel-heading analytics-vehicles-heading"><div className="analytics-range" aria-label="Представление автомобилей">
      {vehicleModes.map((item) => {
        const fresh = item.id === "models" ? 0 : Number(updates[`vehicle_${item.id}`]) || 0;
        return <button type="button" key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setVehicleMode(item.id)}>{item.label}{fresh ? <b className="analytics-tab-count" title={`Нового с прошлого просмотра: ${fresh}`}>{fresh > 99 ? "99+" : fresh}</b> : null}</button>;
      })}
    </div></div>
    <div className="analytics-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.id} aria-sort={sort.column === column.id ? (sort.desc ? "descending" : "ascending") : "none"}><button type="button" className={`analytics-sort${sort.column === column.id ? " active" : ""}`} onClick={() => toggleSort(column)}>{column.label}<span aria-hidden="true">{sort.column === column.id ? (sort.desc ? "↓" : "↑") : "↕"}</span></button></th>)}</tr></thead>
      <tbody>{rows.length ? rows.slice(0, visible).map((item) => <tr key={item.id} className={mode === "favorites" && (item.gone || item.status === "unavailable") ? "analytics-row-warning" : undefined}>
        <td>{mode === "models" ? item.title : <a href={analyticsNoCountHref(carHref(item.listingId))}>{item.title}</a>}</td>
        {mode === "favorites" ? <><td>{formatNumber(item.people)}</td><td>{item.gone ? "Нет в каталоге" : item.status === "unavailable" ? "Снята с продажи" : "В продаже"}</td><td>{item.lastViewedAt ? formatVisitDate(item.lastViewedAt) : "—"}</td></> : <><td>{formatNumber(item.viewers)}</td><td>{formatNumber(item.views)}</td>{mode === "cars" && <td>{formatNumber(item.asks)}</td>}<td>{item.lastViewedAt ? formatVisitDate(item.lastViewedAt) : "—"}</td></>}
      </tr>) : <tr><td colSpan={columns.length}>{mode === "favorites" ? "Избранного пока нет." : "Событий по автомобилям пока нет."}</td></tr>}</tbody></table></div>
    {visible < rows.length && <button className="analytics-show-more" type="button" onClick={() => setVisible((count) => count + 20)}>Показать ещё</button>}
  </section>;
}

function SearchesSection({ data }) {
  const rows = data.searches || [];
  const empty = rows.filter((item) => Number(item.found) === 0).length;
  return (
    <section className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Что ищут</h2><p>Записывается готовый запрос, а не набор по буквам: строка попадает сюда, когда её перестали править{empty ? ` · без результата: ${empty}` : ""}</p></div></div>
      <div className="analytics-table-wrap"><table><thead><tr><th>Запрос</th><th>Искали</th><th>Людей</th><th>Нашлось</th><th>Последний раз</th></tr></thead><tbody>{rows.length ? rows.map((item) => <tr key={item.query} className={Number(item.found) === 0 ? "analytics-row-warning" : undefined}><td><a href={analyticsNoCountHref(`/?q=${encodeURIComponent(item.query)}`)}>{item.query}</a></td><td>{formatNumber(item.asked)}</td><td>{formatNumber(item.people)}</td><td>{item.found === null || item.found === undefined ? "—" : formatNumber(item.found)}</td><td>{formatDate(item.lastAskedAt, true)}</td></tr>) : <tr><td colSpan="5">В строке поиска пока ничего не набирали.</td></tr>}</tbody></table></div>
    </section>
  );
}


function SearchTrafficTable({ title, rows, status, availableTo, source, pages = false }) {
  const [withClicks, setWithClicks] = useState(false);
  const [sort, setSort] = useState({ id:'count', desc:true });
  const [visible, setVisible] = useState(20);
  useEffect(() => { setVisible(20); }, [rows, withClicks, sort]);
  const columns = [
    { id:'value', label:pages ? 'Страница входа' : 'Поисковый запрос', value:(row) => String(row.value || '') },
    ...(pages ? [{ id:'engine', label:'Поисковик', value:(row) => row.engine || '' }] : []),
    { id:'count', label:'Клики', value:(row) => Number(row.count) || 0 },
    { id:'impressions', label:'Показы', value:(row) => Number(row.impressions) || 0 },
    { id:'position', label:'Средняя позиция', value:(row) => row.position == null ? -Infinity : Number(row.position) },
    { id:'positionChange', label:'Позиция', value:(row) => row.positionChange == null ? -Infinity : Number(row.positionChange) },
  ];
  const sortedRows = useMemo(() => (rows || []).filter((row) => !withClicks || Number(row.count) > 0).sort((left, right) => {
    const column = columns.find((item) => item.id === sort.id) || columns[0];
    const a = column.value(left); const b = column.value(right);
    const compared = typeof a === 'string' ? a.localeCompare(String(b), 'ru') : a - b;
    return compared * (sort.desc ? -1 : 1);
  }), [rows, withClicks, sort]);
  const toggleSort = (id) => setSort((current) => current.id === id ? { id, desc:!current.desc } : { id, desc:id !== 'value' && id !== 'engine' });
  return <section className="analytics-panel">
    <div className="analytics-panel-heading"><div><h2>{title}</h2>{availableTo && <p>{source} · последние данные по {formatDate(availableTo)}</p>}</div><div className="analytics-range" aria-label={`Фильтр ${title}`}><button type="button" className={!withClicks ? 'active' : ''} onClick={() => setWithClicks(false)}>Все</button><button type="button" className={withClicks ? 'active' : ''} onClick={() => setWithClicks(true)}>С кликами</button></div></div>
    {status !== 'ready' ? <p role="status">{status === 'not_connected' ? 'Источник ещё не подключён.' : status === 'pending' ? 'За этот период данные ещё не накоплены.' : 'Хранилище отчётов пока недоступно.'}</p>
      : <><div className="analytics-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.id}><button type="button" className={`analytics-sort ${sort.id === column.id ? 'active' : ''}`} onClick={() => toggleSort(column.id)}>{column.label}<span aria-hidden="true">{sort.id === column.id ? (sort.desc ? '↓' : '↑') : '↕'}</span></button></th>)}</tr></thead>
        <tbody>{sortedRows.length ? sortedRows.slice(0, visible).map((row, index) => <tr key={`${row.engine}-${row.value}-${index}`}>
          <td>{pages ? <SearchLandingLink value={row.value} /> : row.value || 'Запрос скрыт'}</td>
          {pages && <td>{row.engine === 'google' ? 'Google' : row.engine === 'yandex' ? 'Яндекс' : 'Другие'}</td>}
          <td>{formatNumber(row.count)}</td>
          <td>{row.impressions == null ? '—' : formatNumber(row.impressions)}</td>
          <td>{row.position == null ? '—' : row.position.toLocaleString('ru-RU', { maximumFractionDigits:1 })}</td>
          <td className={`analytics-position-change${row.positionChange == null || Math.abs(row.positionChange) < 0.05 ? '' : row.positionChange > 0 ? ' is-improved' : ' is-worsened'}`} title={row.positionChange == null ? 'Недостаточно сопоставимых данных за оба периода' : `Ранее: ${row.previousPosition.toLocaleString('ru-RU', { maximumFractionDigits:1 })}`}>
            {row.positionChange == null ? '—' : Math.abs(row.positionChange) < 0.05 ? '0' : `${row.positionChange > 0 ? '↑' : '↓'} ${Math.abs(row.positionChange).toLocaleString('ru-RU', { maximumFractionDigits:1 })}`}
          </td>
        </tr>) : <tr><td colSpan={columns.length}>За этот период доступных данных пока нет.</td></tr>}</tbody></table></div>{visible < sortedRows.length && <button className="analytics-show-more" type="button" onClick={() => setVisible((count) => count + 20)}>Показать ещё</button>}</>}
  </section>;
}

function SearchLandingLink({ value }) {
  const path = String(value || '').trim();
  if (path.startsWith('/')) return <a href={analyticsNoCountHref(path)} target="_blank" rel="noopener noreferrer">{path}</a>;
  try {
    const url = new URL(path);
    if (['http:', 'https:'].includes(url.protocol)) return <a href={analyticsNoCountHref(url.href)} target="_blank" rel="noopener noreferrer">{url.pathname}{url.search}</a>;
  } catch { /* Missing or invalid upstream URL is plain text. */ }
  return path || 'Страница не определена';
}

function SearchTrafficSection({ period }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reportCache = useRef(new Map());
  const [queryEngine, setQueryEngine] = useState('google');
  const [pageEngine, setPageEngine] = useState('all');
  useEffect(() => {
    const controller = new AbortController();
    const cached = reportCache.current.get(period);
    if (cached) setReport(cached);
    setLoading(!cached && !report);
    setError('');
    (async () => {
      try {
        const response = await fetch(`/api/analytics/search-traffic?period=${encodeURIComponent(period)}`, { credentials:'same-origin', cache:'no-store', signal:controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? 'Время входа истекло. Обновите страницу и войдите снова.' : 'Не удалось загрузить сводку. Попробуйте ещё раз.');
        const result = await response.json();
        if (!controller.signal.aborted) {
          reportCache.current.set(period, result);
          setReport(result);
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [period]);
  const google = report?.google;
  const yandex = report?.yandex;
  const pages = [google, yandex].flatMap((source, index) => (source?.pages || []).map((row) => ({ ...row, engine:index === 0 ? 'google' : 'yandex' }))).sort((a, b) => b.count - a.count);
  const pageRows = pages.filter((row) => pageEngine === 'all' || row.engine === pageEngine);
  return <div className="analytics-search-traffic" aria-busy={loading}>
    {!report && <section className="analytics-panel"><p className="analytics-empty" role={error ? "alert" : "status"}>{error || 'Загружаем запросы и позиции…'}</p></section>}
    {report && <>
      <div className="analytics-search-tables">
        <div className="analytics-range" aria-label="Поисковик для запросов">{[['google', 'Google'], ['yandex', 'Яндекс']].map(([key, label]) => <button type="button" key={key} className={queryEngine === key ? 'active' : ''} onClick={() => setQueryEngine(key)}>{label}</button>)}</div>
        <SearchTrafficTable title={`Запросы ${queryEngine === 'google' ? 'Google' : 'Яндекса'}`} rows={report[queryEngine]?.queries?.slice(0, 1000)} status={report[queryEngine]?.status} availableTo={report[queryEngine]?.latestAvailableTo} source={queryEngine === 'google' ? 'Search Console' : 'Вебмастер'} />
      </div>
      <div className="analytics-range" aria-label="Поисковик для страниц входа">{[['all', 'Все'], ['google', 'Google'], ['yandex', 'Яндекс']].map(([key, label]) => <button type="button" key={key} className={pageEngine === key ? 'active' : ''} onClick={() => setPageEngine(key)}>{label}</button>)}</div>
      <SearchTrafficTable title="Страницы входа из поиска" rows={pageRows.slice(0, 1000)} status={pageEngine === 'all' ? (google?.status === 'ready' || yandex?.status === 'ready' ? 'ready' : google?.status) : report[pageEngine]?.status} pages />
    </>}
  </div>;
}


function CustomersSection({ data }) {
  return (
    <section className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Регистрации</h2></div></div>
      <div className="analytics-table-wrap"><table><thead><tr><th>Имя</th><th>Телефон</th><th>Дата</th></tr></thead><tbody>{data.registrations?.length ? data.registrations.map((item, index) => <tr key={`${item.phone}-${item.createdAt}-${index}`}><td>{item.name || "—"}</td><td>{item.phone ? <a href={`tel:${String(item.phone).replace(/[^+\d]/g, "")}`}>{item.phone}</a> : "—"}</td><td>{formatDate(item.createdAt, true)}</td></tr>) : <tr><td colSpan="3">Регистраций пока нет.</td></tr>}</tbody></table></div>
    </section>
  );
}

// «Сегодня» и «вчера» — это календарные сутки по Минску, остальное — скользящее окно.
const analyticsPeriods = [
  { id:"today", label:"Сегодня" },
  { id:"yesterday", label:"Вчера" },
  { id:"7", label:"7 дней" },
  { id:"30", label:"30 дней" },
  { id:"90", label:"90 дней" },
];

const sections = [
  { id:"overview", label:"Обзор", icon:ChartLineUp, ranged:true },
  { id:"search-traffic", label:"Запросы и позиции", icon:MagnifyingGlass, ranged:true },
  { id:"vehicles", label:"Автомобили", icon:CarProfile, ranged:true },
  { id:"leads", label:"Заявки", icon:Tray, ranged:false },
  { id:"searches", label:"Поиск", icon:MagnifyingGlass, ranged:true },
  { id:"customers", label:"Клиенты", icon:UsersThree, ranged:true },
];

function Dashboard({ data, period, setPeriod, reload, logout, leads, leadsLoading, leadsError, leadsUnavailable, reloadLeads }) {
  const [section, setSection] = useState("overview");
  // Красные счётчики у пунктов: сколько нового появилось с прошлого захода сюда.
  // Отметки «просмотрено» держит сервер — иначе просмотр с телефона не гасил бы
  // цифры на компьютере.
  const [updates, setUpdates] = useState({});
  const loadUpdates = useCallback(async (viewing = "") => {
    try {
      const response = await fetch(analyticsUpdatesUrl(viewing), { credentials:"same-origin" });
      if (response.ok) setUpdates(await response.json());
    } catch { /* счётчики — не повод ломать раздел */ }
  }, []);
  // Автоматически открытый «Обзор» ещё не означает, что пользователь успел
  // заметить новое. Прочитанным раздел становится только после явного нажатия.
  const openSection = (id) => {
    setSection(id);
    // Цифру гасим сразу, не дожидаясь ответа сервера.
    setUpdates((current) => ({ ...current, [id]:0 }));
    loadUpdates(id);
  };
  const markViewed = (id) => {
    setUpdates((current) => ({ ...current, [id]:0 }));
    loadUpdates(id);
  };
  // При входе и обновлении только получаем цифры, не отмечая открытый по умолчанию
  // «Обзор» прочитанным.
  useEffect(() => { loadUpdates(); }, [data, leads, loadUpdates]);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const active = sections.find((item) => item.id === section) || sections[0];
  const resetAnalytics = async () => {
    setResetting(true);
    setResetError("");
    try {
      const response = await fetch("/api/analytics/events", { method:"DELETE", credentials:"same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "reset_failed");
      setResetOpen(false);
      await reload();
    } catch {
      setResetError("Не удалось обнулить данные. Обновите страницу и попробуйте снова.");
    } finally { setResetting(false); }
  };
  return (
    <main className="analytics-page">
      <header className="analytics-heading">
        <div><h1>Аналитика и заявки</h1><p>Срез обновлён {formatDate(data.generatedAt, true)}</p></div>
        <div className="analytics-actions">
          {active.ranged && <div className="analytics-range" aria-label="Период аналитики">{analyticsPeriods.map(({ id, label }) => <button key={id} type="button" className={period === id ? "active" : ""} onClick={() => setPeriod(id)}>{label}</button>)}</div>}
          <button className="secondary analytics-logout" type="button" onClick={logout}><SignOut size={18} /> Выйти</button>
        </div>
      </header>

      <div className="analytics-layout">
        <div className="analytics-side-rail">
        <aside className="analytics-sidebar">
          <nav className="analytics-navigation" aria-label="Разделы аналитики">
            {sections.map((item) => {
              const Icon = item.icon;
              const fresh = Number(updates[item.id]) || 0;
              return (
                <button key={item.id} type="button" className={section === item.id ? "active" : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => openSection(item.id)}>
                  <Icon size={21} weight="duotone" />
                  <span>{item.label}</span>
                  {fresh ? <b title={`Нового с прошлого захода: ${fresh}`}>{fresh > 99 ? "99+" : fresh}</b>
                    : item.id === "leads" && leads.length ? <b className="analytics-badge-total" title="Всего заявок">{leads.length}</b> : null}
                </button>
              );
            })}
          </nav>
        </aside>
        <div className="analytics-sidebar-reset">
          <button className="analytics-sidebar-danger" type="button" onClick={() => { setResetError(""); setResetOpen(true); }}><Trash size={17} /> Обнулить аналитику</button>
        </div>
        </div>

        <div className="analytics-content">
          <div className="analytics-tabpanel" hidden={section !== "overview"}><OverviewSection data={data} period={period} unreadVisits={updates.overview} /></div>
          <div className="analytics-tabpanel" hidden={section !== "leads"}><LeadsSection leads={leads} loading={leadsLoading} error={leadsError} unavailable={leadsUnavailable} reload={reloadLeads} /></div>
          <div className="analytics-tabpanel" hidden={section !== "vehicles"}><VehiclesSection data={data} updates={updates} markViewed={markViewed} /></div>
          <div className="analytics-tabpanel" hidden={section !== "searches"}><SearchesSection data={data} /></div>
          <div className="analytics-tabpanel" hidden={section !== "search-traffic"}><SearchTrafficSection period={period} /></div>
          <div className="analytics-tabpanel" hidden={section !== "customers"}><CustomersSection data={data} /></div>
        </div>
      </div>
      {resetOpen && <ResetAnalyticsModal pending={resetting} error={resetError} onCancel={() => setResetOpen(false)} onConfirm={resetAnalytics} />}
    </main>
  );
}

export function AnalyticsPage() {
  // Оперативные цифры открываются на сегодняшнем срезе. История у графика обзора
  // выбирается отдельно и не меняет карточки, таблицы и остальные разделы.
  const [period, setPeriod] = useState("today");
  const [data, setData] = useState(null);
  const [authenticated, setAuthenticated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState("");
  const [leadsUnavailable, setLeadsUnavailable] = useState(false);
  const dashboardCache = useRef(new Map());
  const dashboardRequest = useRef(0);
  const periodRef = useRef(period);
  periodRef.current = period;
  const loadLeads = async () => {
    setLeadsLoading(true);
    setLeadsError("");
    try {
      const response = await fetch("/api/analytics/leads", { cache:"no-store", credentials:"same-origin" });
      if (response.status === 401) { setAuthenticated(false); return; }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "load_failed");
      setLeads(Array.isArray(payload.leads) ? payload.leads : []);
      setLeadsUnavailable(payload.unavailable === true);
    } catch {
      setLeadsError("Не удалось загрузить заявки. Попробуйте обновить список.");
    } finally { setLeadsLoading(false); }
  };
  const load = async (requestedPeriod = period) => {
    const targetPeriod = typeof requestedPeriod === "string" ? requestedPeriod : period;
    const request = ++dashboardRequest.current;
    const cached = dashboardCache.current.get(targetPeriod);
    if (cached && periodRef.current === targetPeriod) setData(cached);
    setLoading(!cached && !data);
    setError("");
    try {
      const response = await fetch(`/api/analytics/dashboard?period=${encodeURIComponent(targetPeriod)}`, { cache:"no-store", credentials:"same-origin" });
      if (response.status === 401) {
        if (request === dashboardRequest.current) { setAuthenticated(false); setData(null); }
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "load_failed");
      dashboardCache.current.set(targetPeriod, payload);
      if (request === dashboardRequest.current && periodRef.current === targetPeriod) {
        setData(payload);
        setAuthenticated(true);
      }
    } catch (loadError) {
      if (request === dashboardRequest.current) setError(loadError.message === "analytics_storage_unavailable" ? "Хранилище аналитики ещё не подключено." : "Не удалось загрузить аналитику. Попробуйте ещё раз.");
    } finally { if (request === dashboardRequest.current) setLoading(false); }
  };
  useEffect(() => { load(); }, [period]);
  const selectPeriod = (nextPeriod) => {
    const cached = dashboardCache.current.get(nextPeriod);
    if (cached) setData(cached);
    setPeriod(nextPeriod);
  };
  // Заявки живут отдельно от счётчиков: они не зависят от выбранного периода, поэтому
  // переключение периода их не перезапрашивает.
  useEffect(() => { if (authenticated) loadLeads(); }, [authenticated]);
  const logout = async () => {
    await fetch("/api/analytics/logout", { method:"POST", credentials:"same-origin" }).catch(() => {});
    setAuthenticated(false);
    setData(null);
    setLeads([]);
  };
  if (authenticated === false) return <Login onSuccess={load} />;
  if (error && !data) return <main className="analytics-login page-width"><section className="analytics-login-card"><h1>Аналитика недоступна</h1><p>{error}</p><button className="primary" type="button" onClick={load}>Повторить</button></section></main>;
  if (!data) return <main className="analytics-login page-width"><section className="analytics-login-card"><h1>Загружаем аналитику…</h1></section></main>;
  return <Dashboard data={data} period={period} setPeriod={selectPeriod} reload={load} logout={logout} leads={leads} leadsLoading={leadsLoading} leadsError={leadsError} leadsUnavailable={leadsUnavailable} reloadLeads={loadLeads} />;
}
