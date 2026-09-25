import { AnalyticsVisitsChart } from "./analytics-visits-chart.jsx";
import { vehiclePhotoHref } from "./photo-source.js";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CarProfile, ChartLineUp, ChatCircleText, Desktop, DeviceMobile, InstagramLogo, MagnifyingGlass, SignOut, SquaresFour, Trash, Tray, UsersThree } from "./icons.jsx";
import { hasYandexClickId, withoutYandexClickId } from "./analytics.js";
import { formatVisitDate } from "./analytics-format.js";
import { analyticsNoCountHref } from "./analytics-links.js";
import { analyticsUpdatesUrl, sectionFreshCount, sectionTabs, watchAnalyticsExit } from "./analytics-updates.js";
import { filterLeadsByPeriod, leadPeriodNote } from "./analytics-lead-period.js";
import { socialGeneration } from "./social-generations.js";
import { carFrame, headlineSize, KINDS, resolvePlace, socialThemeQuery, socialTiles, tileHeadline } from "./social-themes.js";
import { buildSeoPositionRows } from "./seo-keywords.js";

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

function LeadCar({ car }) {
  if (!car) {
    return <div className="lead-car lead-car-empty"><span><CarProfile size={20} weight="duotone" /></span><div><strong>Без конкретного автомобиля</strong><span>Клиент описал, что ищет — смотрите комментарий ниже</span></div></div>;
  }
  const facts = [car.mileage ? `${formatNumber(car.mileage)} км` : "", formatUsd(car.estimatedTotalUsd)].filter(Boolean).join(" · ");
  return (
    <a className="lead-car" href={analyticsNoCountHref(carHref(car.id))} target="_blank" rel="nofollow noopener noreferrer">
      {car.image ? <img src={leadPhoto(car.image)} alt="" loading="lazy" width="88" height="66" /> : <span><CarProfile size={20} weight="duotone" /></span>}
      <div>
        <strong>{car.title}</strong>
        <span>{car.missing ? "Объявление больше не в каталоге" : facts || listingNumber(car.id)}</span>
      </div>
    </a>
  );
}

function LeadCard({ lead, onDelete, deleting, deleteBlocked }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
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
        <div className="lead-card-actions">
          <time dateTime={lead.createdAt}>{formatLeadDate(lead.createdAt)}</time>
          {confirmDelete ? (
            <div className="lead-delete-confirm" role="group" aria-label="Подтверждение удаления заявки">
              <span>Удалить заявку?</span>
              <button type="button" onClick={() => { setConfirmDelete(false); setDeleteError(""); }} disabled={deleting}>Отмена</button>
              <button className="danger" type="button" onClick={async () => {
                setDeleteError("");
                try { await onDelete(lead.id); }
                catch { setDeleteError("Не удалось удалить заявку. Попробуйте ещё раз."); }
              }} disabled={deleting}>{deleting ? "Удаляем…" : "Удалить"}</button>
            </div>
          ) : (
            <button className="lead-delete-button" type="button" aria-label="Удалить заявку" title="Удалить заявку" onClick={() => setConfirmDelete(true)} disabled={deleteBlocked}>
              <Trash size={18} />
            </button>
          )}
        </div>
      </header>
      {deleteError && <div className="analytics-error lead-delete-error" role="alert">{deleteError}</div>}
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

function LeadsSection({ leads, loading, error, unavailable, reload, removeLead, period }) {
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState("");
  // Период берём общий, из шапки: заявки — такой же раздел аналитики, как остальные,
  // и свой переключатель тут был бы лишним.
  const periodLeads = useMemo(() => filterLeadsByPeriod(leads, period), [leads, period]);
  const counts = useMemo(() => ({
    all:periodLeads.length,
    car:periodLeads.filter((lead) => lead.car).length,
    custom_search:periodLeads.filter((lead) => lead.kind === "custom_search").length,
  }), [periodLeads]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return periodLeads.filter((lead) => {
      if (kind === "car" && !lead.car) return false;
      if (kind === "custom_search" && lead.kind !== "custom_search") return false;
      if (!needle) return true;
      const haystack = [lead.customer.name, lead.customer.phone, lead.customer.email, lead.customer.telegram, lead.car?.title, lead.car?.id, lead.comment, lead.orderNumber].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [periodLeads, kind, query]);
  const lastLead = periodLeads[0];
  const deleteLead = async (id) => {
    setDeletingId(id);
    try { await removeLead(id); }
    finally { setDeletingId(""); }
  };
  return (
    <>
      <section className="analytics-kpis" aria-label="Заявки в цифрах">
        <article><span>Заявок за период</span><strong>{formatNumber(counts.all)}</strong><p>{leadPeriodNote(period)}</p></article>
        <article><span>На конкретный автомобиль</span><strong>{formatNumber(counts.car)}</strong><p>Клиент выбрал машину в каталоге</p></article>
        <article><span>Индивидуальный подбор</span><strong>{formatNumber(counts.custom_search)}</strong><p>Описали, что ищут, своими словами</p></article>
        <article><span>Последняя заявка</span><strong className="analytics-kpi-small">{lastLead ? formatLeadDate(lastLead.createdAt) : "—"}</strong><p>{lastLead?.customer.name || (leads.length ? "За этот период заявок нет" : "Заявок пока нет")}</p></article>
      </section>
      <section className="analytics-panel">
        <div className="analytics-panel-heading">
          <div><h2>Заявки клиентов</h2><p>Автомобиль, контакты и комментарий — всё, что нужно, чтобы перезвонить</p></div>
          <button className="analytics-reset-button" type="button" onClick={() => reload()} disabled={loading}>{loading ? "Обновляем…" : "Обновить"}</button>
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
          <div className="lead-list">{filtered.map((lead) => <LeadCard key={lead.id} lead={lead} onDelete={deleteLead} deleting={deletingId === lead.id} deleteBlocked={Boolean(deletingId) && deletingId !== lead.id} />)}</div>
        ) : (
          <p className="analytics-empty">{unavailable ? "Заявки хранятся на основном сайте — на этой копии их нет." : !leads.length ? "Заявок пока не было. Как только клиент оставит контакты, они появятся здесь." : periodLeads.length ? "По этому условию заявок нет." : "За выбранный период заявок нет."}</p>
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

function AnalyticsSplitCount({ total = 0, fresh = 0, className = "" }) {
  const amount = Math.max(0, Number(total) || 0);
  const newAmount = Math.min(amount, Math.max(0, Number(fresh) || 0));
  if (!amount) return null;
  const previousAmount = amount - newAmount;
  return <span className={`analytics-split-count${newAmount ? " has-fresh" : ""}${className ? ` ${className}` : ""}`} title={newAmount ? `Было ${previousAmount}, новых ${newAmount}` : `Всего ${amount}`}>
    <span>{formatNumber(newAmount ? previousAmount : amount)}</span>
    {newAmount ? <><i aria-hidden="true">+</i><b>{newAmount > 99 ? "99+" : formatNumber(newAmount)}</b></> : null}
  </span>;
}

// Под «Заходами» цифра сама по себе ничего не говорит, поэтому подписью идёт тот же
// отрезок суток вчера и среднее за неделю до этого. У многодневных срезов сравнивать
// не с чем — там показываем, сколько заходов приходится на день внутри периода.
// График показывает либо заходы, либо просмотры карточек: рост просмотров говорит о
// том, доходят ли посетители до самих машин, а не только до статей.
// Как часто открытая страница сама перечитывает цифры. Минута — компромисс: заявка
// и так приходит в телеграм сразу, а здесь важнее, чтобы вкладка, открытая с утра, к
// вечеру не показывала утренние числа.
const ANALYTICS_REFRESH_MS = 60_000;

const trendMetrics = [["visits", "Посещения"], ["views", "Просмотры"]];
const trendMetricIds = trendMetrics.map(([id]) => id);

const visitsNote = (summary, period, days) => {
  const previous = summary.visits_previous;
  if (previous === null || previous === undefined) return `В среднем ${average(summary.visits, days)} в день`;
  const before = period === "yesterday" ? "позавчера" : "вчера";
  const when = period === "yesterday" ? "За сутки" : "В это время";
  return `${when}: ${before} — ${formatNumber(previous)}, в среднем — ${formatNumber(summary.visits_average)}`;
};

function OverviewSection({ data, period, updates = {} }) {
  const summary = data.summary || {};
  const [trendPeriod, setTrendPeriod] = usePersistedChoice("analytics:trend-period", trendPeriodIds, "90");
  const [trendData, setTrendData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState("");
  const trendCache = useRef(new Map());
  const [trendMetric, setTrendMetric] = usePersistedChoice("analytics:trend-metric", trendMetricIds, "visits");
  const [showYandex, setShowYandex] = usePersistedChoice("analytics:trend-yandex", ["0", "1"], "0");
  const [showGoogle, setShowGoogle] = usePersistedChoice("analytics:trend-google", ["0", "1"], "0");
  const daily = trendData?.daily || [];
  const enabledSources = [showYandex === "1" ? "yandex" : "", showGoogle === "1" ? "google" : ""].filter(Boolean);
  // Кроме смены периода график перезапрашивается и на каждом круге самообновления
  // страницы: `generatedAt` у свежего среза другой. Пока летит новый ответ, на экране
  // остаётся прежний график — мигания нет.
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
  }, [trendPeriod, data.generatedAt]);
  // Заявки, регистрации и избранное берутся из самих таблиц сайта, поэтому совпадают
  // с разделом «Заявки»; просмотры и посетители — единственное, что считается по событиям.
  const cards = [
    // Заход, на котором никто не двинул мышью, не прокрутил и не нажал ни одной
    // клавиши, в счёт не идёт: это машинный обход. Просто время на странице человеком
    // не считается — его выжидает обходчик, чтобы сойти за посетителя. Отдельной
    // цифрой такие заходы больше не выводим (решение владельца 18.09.2026): под
    // «Заходами» полезнее сравнение с обычным днём, чем счёт роботов.
    // Заход — не вкладка: человек, вернувшийся вечером, считается вторым заходом, а
    // три карточки, открытые в трёх вкладках подряд, остаются одним.
    ["Заходы", summary.visits, visitsNote(summary, period, data.days), updates.overview],
    ["Просмотры авто", summary.vehicle_views, `${average(summary.vehicle_views, summary.visitors)} на посетителя`, updates.vehicle_cars],
    ["Регистрации", summary.registrations, `${formatNumber(summary.favorites)} добавлений в избранное`, updates.customers],
  ];
  return (
    <>
      <section className="analytics-kpis analytics-overview-kpis" aria-label="Ключевые метрики">{cards.map(([label,value,note,fresh]) => <article key={label}><span>{label}</span><strong>{Number(fresh) ? <AnalyticsSplitCount total={value} fresh={fresh} className="analytics-kpi-split-count" /> : formatNumber(value)}</strong><p>{note}</p></article>)}</section>
      <section className="analytics-panel analytics-trend">
        <div className="analytics-trend-heading">
          <h2>График</h2>
          <div className="analytics-range analytics-trend-tabs" aria-label="Что показывать на графике">
            {trendMetrics.map(([id, label]) => <button key={id} type="button" className={trendMetric === id ? "active" : ""} onClick={() => setTrendMetric(id)}>{label}</button>)}
          </div>
          <div className="analytics-trend-controls">
            <TrendPeriodSelect value={trendPeriod} onChange={setTrendPeriod} />
            {trendMetric === "visits" && <>
              <label className="analytics-chart-source-toggle is-yandex"><input type="checkbox" checked={showYandex === "1"} onChange={(event) => setShowYandex(event.target.checked ? "1" : "0")} /><span>Яндекс</span></label>
              <label className="analytics-chart-source-toggle is-google"><input type="checkbox" checked={showGoogle === "1"} onChange={(event) => setShowGoogle(event.target.checked ? "1" : "0")} /><span>Google</span></label>
            </>}
          </div>
        </div>
        {trendLoading ? <p className="analytics-empty">Загружаем график…</p> : trendError && !daily.length ? <p className="analytics-empty">{trendError}</p> : daily.length ? <div key={`${trendData.period}-${trendData.generatedAt}`} className="analytics-chart-swap"><AnalyticsVisitsChart daily={daily} period={period} now={trendData.generatedAt || data.generatedAt} sources={enabledSources} metric={trendMetric} /></div> : <p className="analytics-empty">За выбранный период событий ещё нет.</p>}
      </section>
      <PromoSection summary={summary} />
      <VisitsSection visits={data.visits || []} total={summary.visits} unread={updates.overview} />
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

/* Разбор источника захода: из чего складывается строка «Источник» в таблице и по чему
   работает переключатель над ней.
 *
 * Раньше в коде было два разных места — короткий список для переключателя (Яндекс и
 * Google) и длинный для подписи. Из-за этого нельзя было отобрать заходы из ChatGPT
 * или телеграма, хотя в таблице они подписаны. Теперь список один, и переключатель
 * строится по нему.
 *
 * Порядок важен: сначала длинные правила (ya.ru у Яндекса), потом общие.
 */
const SOURCE_RULES = [
  ["yandex", "Яндекс", /(^|\.)yandex\.|^ya\.ru$/],
  ["google", "Google", /(^|\.)google\./],
  // ChatGPT приходит либо реферером chatgpt.com, либо меткой utm_source в адресе —
  // её подставляет сам чат-бот, и она же попадает в источник захода.
  ["chatgpt", "ChatGPT", /^chatgpt$|(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/],
  ["perplexity", "Perplexity", /^perplexity$|(^|\.)perplexity\.ai$/],
  ["bing", "Bing", /(^|\.)bing\.com$/],
  ["duckduckgo", "DuckDuckGo", /(^|\.)duckduckgo\.com$/],
  ["telegram", "Telegram", /^(t\.me|telegram)$|(^|\.)telegram\.(me|org)$/],
  ["instagram", "Instagram", /^instagram$|(^|\.)instagram\.com$/],
  ["threads", "Threads", /^threads$|(^|\.)threads\.(net|com)$/],
  ["facebook", "Facebook", /(^|\.)facebook\.com$/],
  ["x", "X (Twitter)", /^t\.co$|(^|\.)x\.com$/],
  ["vk", "ВКонтакте", /^vk$|(^|\.)vk\.com$/],
  ["av", "av.by", /(^|\.)av\.by$/],
  ["onliner", "Onliner", /(^|\.)onliner\.by$/],
];

// Значения, которые счётчик пишет вместо имени площадки.
const SOURCE_WORDS = { direct:"Прямой заход", internal:"Переход по сайту", unknown:"Неизвестный источник" };

const visitSourceKey = (value, landingPath = "") => {
  if (hasYandexClickId(landingPath)) return "yandex";
  const source = String(value || "").toLowerCase();
  if (!source) return "unknown";
  if (SOURCE_WORDS[source]) return source;
  const rule = SOURCE_RULES.find(([, , pattern]) => pattern.test(source));
  return rule ? rule[0] : "other";
};

/** Подпись ключа источника: «Яндекс», «ChatGPT», «Прямой заход». */
const sourceKeyLabel = (key) => SOURCE_WORDS[key] || SOURCE_RULES.find(([id]) => id === key)?.[1] || "";

const visitSourceLabel = (value, landingPath = "") => {
  // У старых заходов источник ещё не сохранялся, но ysclid в странице входа
  // позволяет восстановить переход из Яндекса и для уже накопленной истории.
  const sourceKey = visitSourceKey(value, landingPath);
  if (sourceKey === "unknown" && !String(value || "").trim()) return "Не определён";
  // Площадку, которой нет в списке, показываем как есть: доменом.
  return sourceKeyLabel(sourceKey) || String(value || "").toLowerCase();
};

/* Знак ChatGPT. У Google и Яндекса логотип в этой таблице — просто буква в фирменном
   цвете, а у ChatGPT узнаваема именно фигура, буквы у него нет. Рисуем её текущим
   цветом текста: в светлой теме чёрная, в тёмной белая — так знак и выглядит у самого
   ChatGPT, и подгонять два цвета руками не нужно. */
const CHATGPT_MARK = "m297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z";

function VisitSource({ visit }) {
  const sourceKey = visitSourceKey(visit.source, visit.landingPath);
  const logo = sourceKey === "google" ? "G" : sourceKey === "yandex" ? "Я" : null;
  return <span className="analytics-visit-source">
    {sourceKey === "chatgpt" && (
      <i className="analytics-source-logo is-chatgpt" aria-hidden="true">
        <svg viewBox="0 0 320 320" width="17" height="17" fill="currentColor"><path d={CHATGPT_MARK} /></svg>
      </i>
    )}
    {logo && <i className={`analytics-source-logo is-${sourceKey}`} aria-hidden="true">{logo}</i>}
    <span>{visitSourceLabel(visit.source, visit.landingPath)}</span>
  </span>;
}

// С чего зашли: телефон или компьютер, а в подсказке — сама система. У заходов,
// записанных до появления этой колонки, признака нет — в таблице у них прочерк.
const devicePlatformNames = {
  android:"Android",
  ios:"iOS",
  windows:"Windows",
  macos:"macOS",
  chromeos:"ChromeOS",
  linux:"Linux",
};

function VisitDevice({ device, platform }) {
  const anchor = useRef(null);
  const tooltip = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const known = device === "mobile" || device === "desktop";
  const mobile = device === "mobile";
  const kind = mobile ? "Телефон или планшет" : "Компьютер";
  const system = devicePlatformNames[platform] || "";
  const label = known ? `${kind} · ${system || "Система не записана"}` : system || "Тип устройства не записан";
  const Glyph = mobile ? DeviceMobile : Desktop;
  useLayoutEffect(() => {
    if (!open) return;
    const rect = anchor.current.getBoundingClientRect();
    const { width, height } = tooltip.current.getBoundingClientRect();
    setPosition({
      left:Math.max(10, Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - 10)),
      top:rect.top >= height + 18 ? rect.top - height - 8 : rect.bottom + 8,
    });
  }, [open, label]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const outside = (event) => { if (!anchor.current?.contains(event.target)) close(); };
    const escape = (event) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return <>
    <button ref={anchor} type="button" className={`analytics-visit-device is-${known ? device : "unknown"}`} aria-label={label}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}>
      {known ? <Glyph size={18} aria-hidden="true" /> : "—"}
    </button>
    {open && createPortal(<span ref={tooltip} role="tooltip" className="detail-action-tooltip is-visible"
      style={{ left:position?.left ?? 0, top:position?.top ?? 0, visibility:position ? "visible" : "hidden" }}>{label}</span>, document.body)}
  </>;
}

function VisitRow({ visit, number, unread }) {
  const landingPath = withoutYandexClickId(visit.landingPath || "/");
  const sourceUnknown = !hasYandexClickId(visit.landingPath) && (!visit.source || visit.source === "unknown");
  return <tr>
    <td><span className={`analytics-visit-number${unread ? " is-unread" : ""}`}>{number}</span></td>
    <td className={sourceUnknown ? "analytics-visit-source-unknown" : undefined}><VisitSource visit={visit} /></td>
    <td><VisitDevice device={visit.device} platform={visit.platform} /></td>
    <td><a href={analyticsNoCountHref(landingPath)} target="_blank" rel="nofollow noopener noreferrer" title={landingPath === "/" ? "Главная" : landingPath || "—"}>{landingPath === "/" ? "Главная" : landingPath || "—"}</a></td>
    <td>{formatNumber(visit.pageViews)}</td>
    <td>{formatVisitDate(visit.createdAt)}</td>
  </tr>;
}

function VisitsSection({ visits, total, unread }) {
  const [sourceFilter, setSourceFilter] = useState("all");
  // Свежие строки идут первыми, но номер — место захода во всей хронологии:
  // самый старый начинается с 1, каждый следующий получает номер больше.
  const newestNumber = Math.max(visits.length, Number(total) || 0);
  // Кнопки переключателя собираем по тем источникам, которые за выбранный период
  // правда были: список площадок длинный, и половина кнопок всегда вела бы в пустую
  // таблицу. Порядок — по числу заходов, чтобы главное стояло слева. Число прямо на
  // кнопке: иначе ради одной цифры пришлось бы щёлкать по каждому источнику.
  // Каналы, за которыми следим отдельно; всё прочее (прямые заходы, Bing, DuckDuckGo,
  // чужие сайты) собирается в «Остальное».
  //
  // Порядок задан списком, а не числом заходов: иначе кнопки переставлялись бы местами
  // при каждой смене периода и нужную приходилось бы искать глазами заново. А вот
  // пустые каналы не показываем совсем — ряд кнопок с нулями занимал всю ширину
  // панели и не давал ничего, кроме шума.
  const NAMED_SOURCES = ["yandex", "google", "chatgpt", "threads", "instagram", "telegram"];
  const sourceButtons = useMemo(() => {
    const counts = new Map();
    for (const visit of visits) {
      const key = visitSourceKey(visit.source, visit.landingPath);
      const bucket = NAMED_SOURCES.includes(key) ? key : "rest";
      counts.set(bucket, (counts.get(bucket) || 0) + 1);
    }
    const present = [...NAMED_SOURCES, "rest"]
      .map((key) => [key, key === "rest" ? "Остальное" : sourceKeyLabel(key), counts.get(key) || 0])
      .filter(([, , count]) => count > 0);
    // Один-единственный источник — выбирать не из чего, «Все» и он же дадут одну и ту
    // же таблицу. Тогда переключателя не показываем вовсе.
    return present.length > 1 ? [["all", "Все", visits.length], ...present] : [];
  }, [visits]);
  // Выбранный источник мог пропасть при смене периода — возвращаемся ко «Всем», иначе
  // таблица осталась бы пустой без видимой причины.
  useEffect(() => {
    if (sourceFilter !== "all" && !sourceButtons.some(([key]) => key === sourceFilter)) setSourceFilter("all");
  }, [sourceButtons, sourceFilter]);
  const filteredVisits = visits
    .map((visit, index) => ({ visit, index }))
    .filter(({ visit }) => {
      if (sourceFilter === "all") return true;
      const key = visitSourceKey(visit.source, visit.landingPath);
      return sourceFilter === "rest" ? !NAMED_SOURCES.includes(key) : key === sourceFilter;
    });
  return (
    <section className="analytics-panel analytics-visits-panel">
      <div className="analytics-visits-heading">
        <h2>Заходы</h2>
        <div className="analytics-visits-toolbar">
          {sourceButtons.length > 0 && <div className="analytics-range analytics-visits-filter" aria-label="Источник заходов">
            {sourceButtons.map(([id, label, count]) => (
              <button key={id} type="button" className={sourceFilter === id ? "active" : ""} onClick={() => setSourceFilter(id)}>
                {label}<b>{formatNumber(count)}</b>
              </button>
            ))}
          </div>}
        </div>
      </div>
      <div className="analytics-table-wrap analytics-visits-table"><table><thead><tr><th>Номер</th><th>Источник</th><th>Тип</th><th>Страница входа</th><th>Просмотров</th><th>Дата</th></tr></thead>
        <tbody>{filteredVisits.length ? filteredVisits.map(({ visit, index }) => <VisitRow key={`${visit.createdAt}-${visit.landingPath}-${index}`} visit={visit} number={newestNumber - index} unread={index < Number(unread || 0)} />) : <tr><td colSpan="6">{sourceFilter === "all" ? "За выбранный период заходов пока нет." : "За выбранный период таких заходов нет."}</td></tr>}</tbody></table></div>
    </section>
  );
}

const vehicleModes = [
  { id:"cars", label:"Авто" },
  { id:"catalog", label:"Каталог" },
  { id:"models", label:"Модели" },
  { id:"favorites", label:"Избранное" },
];

const modelTitle = (title) => String(title || "").replace(/\s+\d{4}\s*$/, "").trim() || title || "—";
const favoriteOwners = (item) => Array.isArray(item.owners) && item.owners.length ? item.owners.join(", ") : "Имя не указано";

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
    catalog:(data.catalogPages || []).map((item) => ({ ...item, id:item.path, title:item.path, lastViewedAt:item.lastViewedAt })),
    models,
    cars:(data.vehicles || []).map((item) => ({ ...item, id:item.listingId, title:item.listingTitle || listingNumber(item.listingId), asks:item.availabilityClicks })),
    favorites:(data.favorites || []).map((item) => ({ ...item, id:item.listingId, title:item.listingTitle || listingNumber(item.listingId), lastViewedAt:item.addedAt })),
  };
  const columns = mode === "favorites"
    ? [
      { id:"title", label:"Автомобиль", text:true, value:(item) => item.title || "" },
      { id:"owners", label:"У кого", text:true, value:favoriteOwners },
      { id:"lastViewed", label:"Просмотр", value:(item) => item.lastViewedAt ? new Date(item.lastViewedAt).getTime() || 0 : 0 },
    ]
    : [
      { id:"title", label:mode === "catalog" ? "Страница каталога" : mode === "models" ? "Модель" : "Автомобиль", text:true, value:(item) => item.title || "" },
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
  }, [mode, sources.catalog, sources.models, sources.cars, sources.favorites, columns, sort]);
  const setVehicleMode = (nextMode) => {
    setMode(nextMode); setVisible(20);
    setSort({ column:"lastViewed", desc:true });
    if (nextMode === "catalog") markViewed("vehicles");
    if (nextMode === "cars" || nextMode === "favorites") markViewed(`vehicle_${nextMode}`);
  };
  const toggleSort = (column) => setSort((current) => current.column === column.id ? { column:column.id, desc:!current.desc } : { column:column.id, desc:!column.text });
  return <section className="analytics-panel" aria-label="Каталог">
    <div className="analytics-panel-heading analytics-vehicles-heading"><div className="analytics-range" aria-label="Представление каталога">
      {vehicleModes.map((item) => {
        const fresh = item.id === "catalog" ? Number(updates.vehicles) || 0 : item.id === "models" ? 0 : Number(updates[`vehicle_${item.id}`]) || 0;
        return <button type="button" key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setVehicleMode(item.id)}>{item.label}{fresh ? <b className="analytics-tab-count" title={`Нового с прошлого просмотра: ${fresh}`}>{fresh > 99 ? "99+" : fresh}</b> : null}</button>;
      })}
    </div></div>
    <div className="analytics-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.id} aria-sort={sort.column === column.id ? (sort.desc ? "descending" : "ascending") : "none"}><button type="button" className={`analytics-sort${sort.column === column.id ? " active" : ""}`} onClick={() => toggleSort(column)}>{column.label}<span aria-hidden="true">{sort.column === column.id ? (sort.desc ? "↓" : "↑") : "↕"}</span></button></th>)}</tr></thead>
      <tbody>{rows.length ? rows.slice(0, visible).map((item) => <tr key={item.id} className={mode === "favorites" && (item.gone || item.status === "unavailable") ? "analytics-row-warning" : undefined}>
        <td>{mode === "models" ? item.title : mode === "catalog" ? <a href={analyticsNoCountHref(item.path)} target="_blank" rel="nofollow noopener noreferrer">{item.title}</a> : <a href={analyticsNoCountHref(carHref(item.listingId))}>{item.title}</a>}</td>
        {mode === "favorites" ? <><td>{favoriteOwners(item)}</td><td>{item.lastViewedAt ? formatVisitDate(item.lastViewedAt) : "—"}</td></> : <><td>{formatNumber(item.viewers)}</td><td>{formatNumber(item.views)}</td>{mode === "cars" && <td>{formatNumber(item.asks)}</td>}<td>{item.lastViewedAt ? formatVisitDate(item.lastViewedAt) : "—"}</td></>}
      </tr>) : <tr><td colSpan={columns.length}>{mode === "catalog" ? "Страницы каталога пока не просматривали." : mode === "favorites" ? "Избранного пока нет." : "Событий по автомобилям пока нет."}</td></tr>}</tbody></table></div>
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
  if (path.startsWith('/')) return <a href={analyticsNoCountHref(path)} target="_blank" rel="nofollow noopener noreferrer">{path}</a>;
  try {
    const url = new URL(path);
    if (['http:', 'https:'].includes(url.protocol)) return <a href={analyticsNoCountHref(url.href)} target="_blank" rel="nofollow noopener noreferrer">{url.pathname}{url.search}</a>;
  } catch { /* Missing or invalid upstream URL is plain text. */ }
  return path || 'Страница не определена';
}

const searchTrafficReportCache = new Map();
const searchTrafficReportRequests = new Map();

function requestSearchTrafficReport(period) {
  if (searchTrafficReportCache.has(period)) return Promise.resolve(searchTrafficReportCache.get(period));
  if (searchTrafficReportRequests.has(period)) return searchTrafficReportRequests.get(period);
  const request = fetch(`/api/analytics/search-traffic?period=${encodeURIComponent(period)}`, { credentials:'same-origin', cache:'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? 'Время входа истекло. Обновите страницу и войдите снова.' : 'Не удалось загрузить сводку. Попробуйте ещё раз.');
      const report = await response.json();
      searchTrafficReportCache.set(period, report);
      return report;
    })
    .finally(() => searchTrafficReportRequests.delete(period));
  searchTrafficReportRequests.set(period, request);
  return request;
}

function useSearchTrafficReport(period) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const cached = searchTrafficReportCache.get(period);
    if (cached) setReport(cached);
    setLoading(!cached && !report);
    setError('');
    requestSearchTrafficReport(period).then((result) => { if (active) setReport(result); }).catch((failure) => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period]);
  return { report, loading, error };
}

function SearchTrafficSection({ period }) {
  const { report, loading, error } = useSearchTrafficReport(period);
  const [queryEngine, setQueryEngine] = useState('google');
  const [pageEngine, setPageEngine] = useState('all');
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

function SeoPositionValue({ row, status }) {
  if (status !== 'ready' || row?.position == null) return <span className="analytics-seo-position-empty">—</span>;
  const change = row.positionChange;
  const roundedChange = change == null ? null : Math.round(change);
  const changeClass = roundedChange == null || roundedChange === 0 ? '' : roundedChange > 0 ? ' is-improved' : ' is-worsened';
  const changeLabel = roundedChange === 0 ? 'без изменений' : `${roundedChange > 0 ? '↑' : '↓'} ${Math.abs(roundedChange).toLocaleString('ru-RU')}`;
  return <div className="analytics-seo-position">
    <strong>{Math.round(row.position).toLocaleString('ru-RU')}</strong>
    {roundedChange != null && <span className={`analytics-position-change${changeClass}`} title={`Ранее: ${Math.round(row.previousPosition).toLocaleString('ru-RU')}`}>{changeLabel}</span>}
  </div>;
}

const SEO_POSITION_REPORT_PERIOD = '30';
const seoPositionColumns = [
  { id:'query', label:'Запрос', value:(row) => row.query, desc:false },
  { id:'wordstatMonthly', label:'Wordstat / мес.', value:(row) => row.wordstatMonthly, desc:true },
  { id:'yandex', label:'Яндекс', value:(row) => row.yandex?.position, desc:false },
  { id:'google', label:'Google', value:(row) => row.google?.position, desc:false },
];

function SeoPositionsSection() {
  const { report, loading, error } = useSearchTrafficReport(SEO_POSITION_REPORT_PERIOD);
  const rows = useMemo(() => buildSeoPositionRows(report), [report]);
  const [grouped, setGrouped] = useState(false);
  const [onlyRanked, setOnlyRanked] = useState(true);
  const [sort, setSort] = useState({ id:'wordstatMonthly', desc:true });
  const selectSort = (id) => {
    const column = seoPositionColumns.find((item) => item.id === id) || seoPositionColumns[0];
    setSort((current) => current.id === id ? { id, desc:!current.desc } : { id, desc:column.desc });
  };
  const chooseSortColumn = (id) => {
    const column = seoPositionColumns.find((item) => item.id === id) || seoPositionColumns[0];
    setSort({ id:column.id, desc:column.desc });
  };
  const visibleRows = useMemo(() => {
    const filtered = onlyRanked ? rows.filter((row) => row.yandex?.position != null || row.google?.position != null) : rows;
    const column = seoPositionColumns.find((item) => item.id === sort.id) || seoPositionColumns[0];
    const groupOrder = new Map(rows.map((row) => row.group).filter((group, index, groups) => groups.indexOf(group) === index).map((group, index) => [group, index]));
    return [...filtered].sort((left, right) => {
      if (grouped && left.group !== right.group) return groupOrder.get(left.group) - groupOrder.get(right.group);
      const a = column.value(left); const b = column.value(right);
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      const compared = typeof a === 'string' ? a.localeCompare(String(b), 'ru') : Number(a) - Number(b);
      return compared * (sort.desc ? -1 : 1);
    });
  }, [rows, grouped, onlyRanked, sort]);
  return <div className="analytics-search-traffic analytics-seo-positions" aria-busy={loading}>
    <section className="analytics-panel">
      <div className="analytics-panel-heading analytics-seo-heading">
        <h2>Семантическое ядро</h2>
        <div className="analytics-seo-switches">
          <label className="analytics-switch"><span>Делить по категориям</span><input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} /></label>
          <label className="analytics-switch"><span>Только с позициями</span><input type="checkbox" checked={onlyRanked} onChange={(event) => setOnlyRanked(event.target.checked)} /></label>
        </div>
      </div>
      {!report && <p className="analytics-empty" role={error ? "alert" : "status"}>{error || 'Загружаем SEO-позиции…'}</p>}
      {report && <><div className="analytics-seo-mobile-sort"><label>Сортировка<select value={sort.id} onChange={(event) => chooseSortColumn(event.target.value)}>{seoPositionColumns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label><button type="button" onClick={() => setSort((current) => ({ ...current, desc:!current.desc }))}>{sort.desc ? 'По убыванию ↓' : 'По возрастанию ↑'}</button></div><div className="analytics-table-wrap"><table className="analytics-seo-table"><thead><tr>{seoPositionColumns.map((column) => <th key={column.id} aria-sort={sort.id === column.id ? (sort.desc ? 'descending' : 'ascending') : 'none'}><button type="button" className={`analytics-sort${sort.id === column.id ? ' active' : ''}`} onClick={() => selectSort(column.id)}>{column.label}<span aria-hidden="true">{sort.id === column.id ? (sort.desc ? '↓' : '↑') : '↕'}</span></button></th>)}</tr></thead><tbody>
        {visibleRows.map((row, index) => <Fragment key={`${row.group}-${row.query}-${index}`}>
          {grouped && (index === 0 || visibleRows[index - 1].group !== row.group) && <tr className="analytics-seo-group"><th colSpan="4">{row.group}</th></tr>}
          <tr><td>{row.query}</td><td>{formatNumber(row.wordstatMonthly)}</td><td><SeoPositionValue row={row.yandex} status={report.yandex?.status} /></td><td><SeoPositionValue row={row.google} status={report.google?.status} /></td></tr>
        </Fragment>)}
        {!visibleRows.length && <tr><td colSpan="4">Актуальных позиций по запросам ядра пока нет.</td></tr>}
      </tbody></table></div></>}
    </section>
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

function ContactInterestSection({ data, fresh = {} }) {
  const summary = data.summary || {};
  const cards = [
    ["Просмотр телефона", "contact_phone_views", "Номер раскрыли"],
    ["Клик по TG", "contact_telegram_clicks", "Нажали Telegram"],
    ["Клик по Viber", "contact_viber_clicks", "Нажали Viber"],
    ["Клик по Instagram", "contact_instagram_clicks", "Нажали Instagram"],
    ["Клик по Threads", "contact_threads_clicks", "Нажали Threads"],
    ["О сервисе — задать вопрос", "service_contact_question_clicks", "Нажали главную кнопку в блоке связи"],
    ["О сервисе — Viber", "service_contact_sales_clicks", "Выбрали карточку Viber"],
    ["О сервисе — Telegram", "service_contact_telegram_clicks", "Выбрали карточку Telegram"],
    ["О сервисе — почта", "service_contact_email_clicks", "Выбрали карточку электронной почты"],
    ["Интерес к приложению — QR", "app_download_qr_modal_opens", "Открыли QR или перешли по нему"],
    ["Интерес к App Store", "app_download_app_store_modal_opens", "Нажали кнопку App Store"],
    ["Интерес к Google Play", "app_download_google_play_modal_opens", "Нажали кнопку Google Play"],
    ["Интерес к подписке", "newsletter_subscribe_modal_opens", "Нажали «Подписаться»"],
    ["Открытие страницы «Контакты»", "contact_page_views", "Из любого раздела сайта"],
    ["Открытие страницы «О сервисе»", "about_page_views", "Из любого раздела сайта"],
  ];
  return (
    <section className="analytics-kpis analytics-contact-kpis" aria-label="Интерес к контактам">
      {cards.map(([label, key, note]) => {
        const value = Number(summary[key]) || 0;
        const newAmount = Math.max(0, Number(fresh[key]) || 0);
        return <article key={key} className={value ? undefined : 'analytics-kpi-zero'}><span>{label}</span><strong className="analytics-contact-value">{formatNumber(value)}{newAmount ? <b className="analytics-contact-fresh" title={`Нового с прошлого просмотра (независимо от выбранного периода): ${formatNumber(newAmount)}`}>+{formatNumber(newAmount)}</b> : null}</strong><p>{note}</p></article>;
      })}
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
  { id:"overview", label:"Обзор", icon:SquaresFour, ranged:true },
  { id:"seo-positions", label:"SEO позиции", icon:ChartLineUp, ranged:false },
  { id:"vehicles", label:"Каталог", icon:CarProfile, ranged:true },
  { id:"leads", label:"Заявки", icon:Tray, ranged:true },
  { id:"searches", label:"Умный поиск", icon:MagnifyingGlass, ranged:true },
  { id:"customers", label:"Клиенты", icon:UsersThree, ranged:true },
  { id:"contact_interest", label:"Интерес к контактам", icon:ChatCircleText, ranged:true },
];

// Витрина стиля соцсетей — не цифры, а заготовки записей, поэтому в боковой
// колонке она стоит отдельной кнопкой под остальными, а не в общем списке разделов.
// Периода у неё нет: кадры не зависят от того, какой отрезок времени выбран.
const socialSection = { id:"social", label:"Посты соц сетей", icon:InstagramLogo, ranged:false };

function AnalyticsNavigationItems({ section, updates, onChoose, mobile = false }) {
  return sections.map((item) => {
    const Icon = item.icon;
    const fresh = sectionFreshCount(updates, item.id);
    return (
      <button key={item.id} type="button" role={mobile ? "menuitem" : undefined} className={section === item.id ? "active" : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => onChoose(item.id)}>
        <Icon size={21} weight="duotone" />
        <span>{item.label}</span>
        {fresh ? <b className="analytics-navigation-fresh" title={`Нового с прошлого захода: ${fresh}`}>{fresh > 99 ? "99+" : fresh}</b> : null}
      </button>
    );
  });
}

function MobileAnalyticsPeriodSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const selected = analyticsPeriods.find((item) => item.id === value) || analyticsPeriods[0];
  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
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
    const index = analyticsPeriods.findIndex((item) => item.id === value);
    const step = event.key === "ArrowDown" ? 1 : -1;
    choose(analyticsPeriods[(index + step + analyticsPeriods.length) % analyticsPeriods.length].id);
  };
  return <div className={`analytics-mobile-period-select${open ? " open" : ""}`} ref={rootRef}>
    <button ref={triggerRef} className="analytics-mobile-period-trigger" type="button" aria-label={`Период аналитики: ${selected.label}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((state) => !state)} onKeyDown={handleKeyDown}>
      <span>{selected.label}</span><b aria-hidden="true" />
    </button>
    {open && <div className="analytics-mobile-period-menu" role="listbox" aria-label="Период аналитики">
      {analyticsPeriods.map((item) => <button key={item.id} type="button" role="option" aria-selected={item.id === value} className={item.id === value ? "selected" : ""} onClick={() => choose(item.id)}>{item.label}</button>)}
    </div>}
  </div>;
}

function MobileAnalyticsNavigation({ active, section, period, setPeriod, updates, onSection, logout }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const ActiveIcon = active.icon;
  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeWithEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);
  const chooseSection = (id) => {
    onSection(id);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const chooseAction = (action) => {
    setOpen(false);
    action();
  };
  return <div className="analytics-mobile-navigation">
    <div className={`analytics-mobile-section-select${open ? " open" : ""}`} ref={rootRef}>
      <button ref={triggerRef} className="analytics-mobile-section-trigger" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <ActiveIcon size={20} weight="duotone" />
        <span>{active.label}</span>
        <b aria-hidden="true" />
      </button>
      {open && <div className="analytics-mobile-section-menu" role="menu" aria-label="Разделы аналитики">
        <AnalyticsNavigationItems section={section} updates={updates} onChoose={chooseSection} mobile />
        <div className="analytics-mobile-menu-divider" role="separator" />
        <button type="button" role="menuitem" className={section === "social" ? "active" : ""} aria-current={section === "social" ? "page" : undefined} onClick={() => chooseSection("social")}><InstagramLogo size={19} /> <span>{socialSection.label}</span></button>
        <button type="button" role="menuitem" onClick={() => chooseAction(logout)}><SignOut size={19} /> <span>Выйти</span></button>
      </div>}
    </div>
    {active.ranged && <MobileAnalyticsPeriodSelect value={period} onChange={setPeriod} />}
  </div>;
}

// Витрина стиля соцсетей: по каждой теме из плана — картинка так, как она встанет
// в ленту, и каждая тема по три захода с разными машинами и ракурсами. На одной
// плитке не видно, во что это складывается стеной, а ради стены раздел и сделан.
//
// Квадрат, обрезка по бокам и тёмная подложка здесь не «дизайн кабинета», а
// повторение того, что делает подготовка кадров к публикации
// (scripts/photo-to-social.py): увиденное в этой сетке и есть будущая запись.
// Поэтому у сравнения двух моделей плитка из двух кадров со значком «vs» — такую
// обложку собирает scripts/blog-duel-cover.py, — а у материала журнала стоит
// собственная картинка статьи.
//
// Переключатель убирает подписи: без них видна чистая сетка с теми же отступами,
// что в ленте, и сразу понятно, как записи смотрятся рядом друг с другом.

// Разметка надписи на кадре: первое слово в отдельном элементе — его красит
// .social-title > b в analytics.css, — остальной текст обычным текстовым узлом.
function SocialHeadline({ text }) {
  const breakAt = text.search(/\s/);
  const lead = breakAt === -1 ? text : text.slice(0, breakAt);
  const rest = breakAt === -1 ? "" : text.slice(breakAt);
  return <><b>{lead}</b>{rest}</>;
}

// Слово в надписи не переносится никогда (это разобрали 17.09.2026: перенос
// посередине слова недопустим ни при каких условиях). Значит, если слово шире
// своей области, единственный способ вернуть его в кадр — уменьшить масштаб, а
// готового числа для этого нет: реальная ширина зависит от шрифта и браузера.
// headlineSize (src/social-themes.js) даёт только стартовую точку.
//
// Поэтому кегль меряется по-настоящему: без переноса слово не сжимается в свою
// строку, а раздвигает элемент вширь — это видно по scrollWidth (истинная ширина
// содержимого) против clientWidth (ширина, ограниченная max-width в CSS). Пока
// первое больше второго, шаг за шагом понижаем множитель --social-title-scale,
// на который эти же правила умножают кегль.
function SocialTitle({ className, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.removeProperty("--social-title-scale");
    let scale = 1;
    while (el.scrollWidth > el.clientWidth + 1 && scale > 0.5) {
      scale -= 0.05;
      el.style.setProperty("--social-title-scale", scale.toFixed(2));
    }
  });
  return <span ref={ref} className={className}>{children}</span>;
}

function SocialPostsSection({ active }) {
  // «Исходник» и «Генерация» используют одну сетку, но разные готовые изображения:
  // так композиции можно сравнивать попарно без скачков раскладки.
  const [version, setVersion] = useState("source");
  const [cars, setCars] = useState({});
  const [state, setState] = useState("idle");
  const tiles = useMemo(() => socialTiles(), []);
  // Каждому запросу свой номер, и в состояние попадает только ответ последнего.
  // Отменять запрос уборкой эффекта здесь нельзя: в отладочном режиме React
  // проводит эффект дважды, уборка после первого прохода погасила бы и ответ —
  // сетка так и оставалась висеть на «загружается».
  const requestRef = useRef(0);
  // Картинки грузятся, только когда раздел открыли: запросы к каталогу незачем
  // делать всем, кто зашёл посмотреть цифры.
  useEffect(() => {
    if (!active) return undefined;
    const request = requestRef.current + 1;
    requestRef.current = request;
    setState("loading");
    const askCatalog = async (query) => {
      try {
        const response = await fetch(socialThemeQuery(query));
        if (!response.ok) return null;
        const payload = await response.json();
        return payload?.items?.[0] || null;
      } catch { return null; }
    };
    Promise.all(tiles.map(async ({ key, theme, pick }) => {
      if (theme.kind === KINDS.cover) return [key, null];
      if (theme.kind === KINDS.duel) return [key, await Promise.all(pick.sides.map((side) => askCatalog(side.query)))];
      return [key, await askCatalog(pick.query)];
    })).then((pairs) => {
      if (requestRef.current !== request) return;
      setCars(Object.fromEntries(pairs));
      setState("ready");
    });
    return undefined;
  }, [active, tiles]);
  const frame = (car, angle) => (car ? vehiclePhotoHref(carFrame(car, angle), 1080) : "");
  return (
    <section className="analytics-panel">
      <div className="analytics-panel-heading">
        <div>
          <h2>Посты соц сетей</h2>
          <p>Так записи встанут в ленте. Пока это только картинки — на них отрабатывается оформление, которое потом наложит автопостинг</p>
        </div>
        <div className="analytics-range" aria-label="Версия постов">
          <button type="button" className={version === "source" ? "active" : ""} onClick={() => setVersion("source")}>Исходник</button>
          <button type="button" className={version === "generation" ? "active" : ""} onClick={() => setVersion("generation")}>Генерация</button>
        </div>
      </div>
      <div className="social-grid bare" data-version={version}>
        {tiles.map(({ key, theme, pick, round }) => {
          const loaded = cars[key];
          const generation = socialGeneration(key);
          const preparedImage = version === "generation" ? generation?.image : generation?.source;
          const waiting = state === "ready" ? "картинки нет" : "загружается";
          // На кадре — первая строка будущей записи, а не название темы: витрина
          // показывает то, что увидит читатель ленты. У темы с постоянным текстом
          // формулировка своя на каждый круг: одна и та же фраза из круга в круг
          // превращает ленту в бланк.
          const headline = tileHeadline(theme, pick, loaded, round);
          // Место надписи закреплено за темой, кегль — длиной строки: длинная тем
          // же размером расползлась бы. Центр — исключение: надпись в три строки и
          // больше центром не читается (рвано с обеих сторон), поэтому такая уходит
          // к левому краю, даже если у темы места «по центру».
          const titleClass = `social-title at-${resolvePlace(theme.place, headline)} size-${headlineSize(headline)}`;
          // Тень под текстом ложится с той стороны кадра, где стоит сама надпись —
          // сверху или снизу, в зависимости от места темы. Все плитки всегда
          // вертикальные 4:5 — это единственный формат этого раздела.
          const frameClass = `social-frame edge-${theme.place.startsWith("top") ? "top" : "bottom"}`;
          return (
            <figure className="social-tile" key={key}>
              {preparedImage ? (
                <div className="social-frame social-frame-generated">
                  <img src={preparedImage} alt="" loading="lazy" />
                </div>
              ) : theme.kind === KINDS.duel ? (
                <div className={`${frameClass} is-duel`}>
                  {headline ? <SocialTitle className={titleClass}><SocialHeadline text={headline} /></SocialTitle> : null}
                  {(loaded || [null, null]).map((car, index) => (
                    <span key={index}>{car ? <img src={frame(car, pick.sides[index].angle)} alt={car.title} loading="lazy" /> : null}</span>
                  ))}
                  <span className="social-duel-divider" aria-hidden="true" />
                </div>
              ) : (
                <div className={frameClass}>
                  {headline ? <SocialTitle className={titleClass}><SocialHeadline text={headline} /></SocialTitle> : null}
                  {theme.kind === KINDS.cover
                    ? <img src={pick.cover} alt={theme.title} loading="lazy" />
                    : loaded ? <img src={frame(loaded, pick.angle)} alt={loaded.title} loading="lazy" /> : <span className="social-frame-empty">{waiting}</span>}
                </div>
              )}
            </figure>
          );
        })}
      </div>
    </section>
  );
}

function Dashboard({ data, period, setPeriod, reload, logout, leads, leadsLoading, leadsError, leadsUnavailable, reloadLeads, removeLead }) {
  const [section, setSection] = useState("overview");
  // Красные счётчики у пунктов: сколько нового появилось с прошлого захода сюда.
  // Отметки «просмотрено» держит сервер — иначе просмотр с телефона не гасил бы
  // цифры на компьютере.
  const [updates, setUpdates] = useState({});
  const [contactFresh, setContactFresh] = useState({});
  const viewedSections = useRef(new Set());
  useEffect(() => watchAnalyticsExit(() => viewedSections.current), []);
  const loadUpdates = useCallback(async (viewing = "") => {
    try {
      const response = await fetch(analyticsUpdatesUrl(viewing), { credentials:"same-origin" });
      if (response.ok) {
        setUpdates(await response.json());
        for (const item of [viewing].flat()) viewedSections.current.add(item || "overview");
      }
    } catch { /* счётчики — не повод ломать раздел */ }
  }, []);
  // Автоматически открытый «Обзор» ещё не означает, что пользователь успел
  // заметить новое. Сохраняем его при закрытии страницы или явном нажатии.
  const openSection = (id) => {
    if (id === "contact_interest") setContactFresh(updates.contact_interest_details || {});
    // Search Console и Вебмастер публикуют статистику с задержкой, поэтому
    // «сегодня» и «вчера» почти всегда выглядят пустыми. При первом переходе в
    // поисковые отчёты открываем устойчивый 30-дневный срез; выбранные вручную
    // 7/30/90 дней дальше не переопределяем.
    if (id === "search-traffic" && (period === "today" || period === "yesterday")) setPeriod("30");
    setSection(id);
    // «Каталог» гасит все свои вкладки и при входе, и при выходе из него:
    // пока он был открыт, могло набежать новое, и уносить его цифрой в меню незачем.
    const viewedIds = [...new Set([...sectionTabs(id), ...(section === "vehicles" && id !== "vehicles" ? sectionTabs("vehicles") : [])])];
    // Цифру гасим сразу, не дожидаясь ответа сервера.
    setUpdates((current) => ({ ...current, ...Object.fromEntries(viewedIds.map((key) => [key, 0])), ...(id === "contact_interest" ? { contact_interest_details:{} } : {}) }));
    loadUpdates(viewedIds);
  };
  const markViewed = (id) => {
    setUpdates((current) => ({ ...current, [id]:0 }));
    loadUpdates(id);
  };
  // При входе и обновлении только получаем цифры, не отмечая открытый по умолчанию
  // «Обзор» прочитанным.
  useEffect(() => { loadUpdates(); }, [data, leads, loadUpdates]);
  const active = [...sections, socialSection].find((item) => item.id === section) || sections[0];
  return (
    <main className="analytics-page">
      <header className="analytics-heading">
        <div><h1>Аналитика и заявки</h1><p>Срез обновлён {formatDate(data.generatedAt, true)}</p></div>
        <div className="analytics-actions">
          {active.ranged && <div className="analytics-range" aria-label="Период аналитики">{analyticsPeriods.map(({ id, label }) => <button key={id} type="button" className={period === id ? "active" : ""} onClick={() => setPeriod(id)}>{label}</button>)}</div>}
          <button className="secondary analytics-logout" type="button" onClick={logout}><SignOut size={18} /> Выйти</button>
        </div>
      </header>

      <MobileAnalyticsNavigation active={active} section={section} period={period} setPeriod={setPeriod} updates={updates} onSection={openSection} logout={logout} />

      <div className="analytics-layout">
        <div className="analytics-side-rail">
        <aside className="analytics-sidebar">
          <nav className="analytics-navigation" aria-label="Разделы аналитики">
            <AnalyticsNavigationItems section={section} updates={updates} onChoose={openSection} />
          </nav>
        </aside>
        <div className="analytics-sidebar-extra">
          <button className={`analytics-sidebar-social${section === "social" ? " active" : ""}`} type="button" aria-current={section === "social" ? "page" : undefined} onClick={() => openSection("social")}><InstagramLogo size={17} /> {socialSection.label}</button>
        </div>
        </div>

        <div className="analytics-content">
          <div className="analytics-tabpanel" hidden={section !== "overview"}><OverviewSection data={data} period={period} updates={updates} /></div>
          <div className="analytics-tabpanel" hidden={section !== "leads"}><LeadsSection leads={leads} loading={leadsLoading} error={leadsError} unavailable={leadsUnavailable} reload={reloadLeads} removeLead={removeLead} period={period} /></div>
          <div className="analytics-tabpanel" hidden={section !== "vehicles"}>{section === "vehicles" ? <VehiclesSection data={data} updates={updates} markViewed={markViewed} /> : null}</div>
          <div className="analytics-tabpanel" hidden={section !== "searches"}><SearchesSection data={data} /></div>
          <div className="analytics-tabpanel" hidden={section !== "search-traffic"}><SearchTrafficSection period={period} /></div>
          <div className="analytics-tabpanel" hidden={section !== "seo-positions"}><SeoPositionsSection /></div>
          <div className="analytics-tabpanel" hidden={section !== "customers"}><CustomersSection data={data} /></div>
          <div className="analytics-tabpanel" hidden={section !== "contact_interest"}><ContactInterestSection data={data} fresh={contactFresh} /></div>
          <div className="analytics-tabpanel" hidden={section !== "social"}><SocialPostsSection active={section === "social"} /></div>
        </div>
      </div>
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
  const loadLeads = async ({ silent = false } = {}) => {
    if (!silent) { setLeadsLoading(true); setLeadsError(""); }
    try {
      const response = await fetch("/api/analytics/leads", { cache:"no-store", credentials:"same-origin" });
      if (response.status === 401) { setAuthenticated(false); return; }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "load_failed");
      setLeads(Array.isArray(payload.leads) ? payload.leads : []);
      setLeadsUnavailable(payload.unavailable === true);
      setLeadsError("");
    } catch {
      // Круг самообновления молчит о неудаче: список на экране остаётся прежним, а
      // следующая попытка через минуту заберёт те же заявки.
      if (!silent) setLeadsError("Не удалось загрузить заявки. Попробуйте обновить список.");
    } finally { if (!silent) setLeadsLoading(false); }
  };
  const load = async (requestedPeriod = period, { silent = false } = {}) => {
    const targetPeriod = typeof requestedPeriod === "string" ? requestedPeriod : period;
    const request = ++dashboardRequest.current;
    const cached = dashboardCache.current.get(targetPeriod);
    if (cached && periodRef.current === targetPeriod) setData(cached);
    if (!silent) {
      setLoading(!cached && !data);
      setError("");
    }
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
      if (!silent && request === dashboardRequest.current) setError(loadError.message === "analytics_storage_unavailable" ? "Хранилище аналитики ещё не подключено." : "Не удалось загрузить аналитику. Попробуйте ещё раз.");
    } finally { if (!silent && request === dashboardRequest.current) setLoading(false); }
  };
  useEffect(() => { load(); }, [period]);
  // Цифры на открытой странице устаревали: страница брала их один раз при заходе, и
  // новая заявка, просмотр или регистрация появлялись только после обновления руками.
  // Раз в минуту перечитываем весь срез молча — карточки, таблицы, график, заявки и
  // красные счётчики разделов (их пересчитывает сам раздел, как только приходит новый
  // срез). Ни полос загрузки, ни сообщений об ошибке: пропущенный круг ничего не
  // ломает, следующий заберёт те же цифры.
  const refresh = useRef(() => {});
  refresh.current = () => {
    load(periodRef.current, { silent:true });
    loadLeads({ silent:true });
  };
  useEffect(() => {
    if (!authenticated) return undefined;
    // В фоновой вкладке не ходим на сервер вовсе: смысла в этом нет, а браузер всё
    // равно растягивает таймеры. Возвращение к вкладке — повод обновиться сразу, не
    // дожидаясь своей минуты: за время в фоне цифры могли уйти далеко.
    const tick = () => { if (document.visibilityState === "visible") refresh.current(); };
    const timer = window.setInterval(tick, ANALYTICS_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [authenticated]);
  const selectPeriod = (nextPeriod) => {
    const cached = dashboardCache.current.get(nextPeriod);
    if (cached) setData(cached);
    setPeriod(nextPeriod);
  };
  const removeLead = async (leadId) => {
    const response = await fetch(`/api/analytics/leads/${encodeURIComponent(leadId)}`, { method:"DELETE", credentials:"same-origin" });
    if (response.status === 401) {
      setAuthenticated(false);
      throw new Error("unauthorized");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "delete_failed");
    setLeads((current) => current.filter((lead) => lead.id !== leadId));
    // Удаление меняет показатели заявок в текущем срезе. Старый кэш больше нельзя
    // показывать при переключении периода — перечитываем цифры с сервера.
    dashboardCache.current.clear();
    await load(periodRef.current, { silent:true });
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
  return <Dashboard data={data} period={period} setPeriod={selectPeriod} reload={load} logout={logout} leads={leads} leadsLoading={leadsLoading} leadsError={leadsError} leadsUnavailable={leadsUnavailable} reloadLeads={loadLeads} removeLead={removeLead} />;
}
