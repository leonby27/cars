import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CarProfile, ChartLineUp, MagnifyingGlass, ShieldCheck, SignOut, Trash, Tray, UsersThree } from "./icons.jsx";

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
// Фотохранилище Che168 отдаёт снимок любой ширины: она стоит в адресе перед именем
// файла. В списке заявок фото размером с ноготь, полноразмерный кадр здесь ни к чему.
const leadPhoto = (source, width = 240) => {
  if (!source) return "";
  try {
    const url = new URL(source);
    if (!/(^|\.)autoimg\.cn$/.test(url.hostname)) return source;
    url.pathname = url.pathname.replace(/\/\d+x\d+_(?=[^/]*$)/, `/${width}x0_`);
    return url.href;
  } catch { return source; }
};
const eventLabels = {
  page_view:"Просмотр страницы",
  vehicle_view:"Просмотр автомобиля",
  availability_click:"Клик «Уточнить актуальность»",
  availability_request_click:"Кнопка «Уточнить актуальность» в заказе",
  registration_completed:"Регистрация",
  favorite_added:"Добавление в избранное",
  search_saved:"Сохранение поиска",
  custom_search_submitted:"Заявка на индивидуальный подбор",
  search_query:"Запрос в поиске",
};
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

function Viability({ summary }) {
  const visitors = Number(summary.visitors) || 0;
  const clicks = Number(summary.availability_clicks) || 0;
  const leads = (Number(summary.registrations) || 0) + (Number(summary.custom_searches) || 0);
  const clickRate = visitors ? clicks / visitors * 100 : 0;
  const leadRate = visitors ? leads / visitors * 100 : 0;
  let tone = "neutral";
  let title = "Данных пока мало";
  let text = `Нужно ещё ${Math.max(0, 100 - visitors)} уникальных посетителей, чтобы делать первый вывод без лишней уверенности.`;
  if (visitors >= 100 && clickRate >= 8 && leadRate >= 3) {
    tone = "positive";
    title = "MVP показывает жизнеспособный спрос";
    text = "И интерес к конкретным автомобилям, и переход к контакту выше стартовых ориентиров. Можно продолжать трафик и проверять качество лидов звонками.";
  } else if (visitors >= 100 && (clickRate >= 4 || leadRate >= 1)) {
    tone = "watch";
    title = "Есть сигнал, но гипотезу рано подтверждать";
    text = "Пользователи проявляют интерес, но одна из частей воронки проседает. Смотрите автомобили-лидеры и источник потери между просмотром и контактом.";
  } else if (visitors >= 100) {
    tone = "negative";
    title = "Спрос пока не подтверждён";
    text = "После достаточного объёма трафика намерение остаётся низким. Стоит проверить оффер, цены, качество аудитории и доверие к объявлению до масштабирования.";
  }
  return <section className={`analytics-viability ${tone}`}><div><span>Автооценка</span><h2>{title}</h2><p>{text}</p></div><dl><div><dt>Клик в интерес</dt><dd>{clickRate.toFixed(1).replace(".", ",")}%</dd><small>ориентир от 8%</small></div><div><dt>Конверсия в лид</dt><dd>{leadRate.toFixed(1).replace(".", ",")}%</dd><small>ориентир от 3%</small></div></dl></section>;
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
    <a className="lead-car" href={`/cars/${encodeURIComponent(car.id)}`} target="_blank" rel="noreferrer">
      {car.image ? <img src={leadPhoto(car.image)} alt="" loading="lazy" width="88" height="66" /> : <span><CarProfile size={20} weight="duotone" /></span>}
      <div>
        <strong>{car.title}</strong>
        <span>{car.missing ? "Объявление больше не в каталоге" : facts || car.id}</span>
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

function OverviewSection({ data }) {
  const summary = data.summary || {};
  const daily = data.daily || [];
  const maxDaily = Math.max(1, ...daily.map((item) => Number(item.visitors) || 0));
  // Заявки, регистрации и избранное берутся из самих таблиц сайта, поэтому совпадают
  // с разделом «Заявки»; просмотры и посетители — единственное, что считается по событиям.
  const cards = [
    // Роботов в число посетителей не берём, но и не скрываем: заход, на котором никто
    // не двинул мышью, не прокрутил и не нажал ни одной клавиши, считается отдельно —
    // так видно, сколько на сайт приходит машинного трафика. Просто время на странице
    // человеком не считается: его выжидает обходчик, чтобы сойти за посетителя.
    // Заход — не вкладка: человек, вернувшийся вечером, считается вторым заходом, а
    // три карточки, открытые в трёх вкладках подряд, остаются одним.
    ["Уникальные посетители", summary.visitors, `${formatNumber(summary.visits)} заходов${Number(summary.robot_visits) ? ` · ещё ${formatNumber(summary.robot_visits)} без действий` : ""}`],
    ["Просмотры автомобилей", summary.vehicle_views, `${average(summary.vehicle_views, summary.visitors)} на посетителя`],
    ["Заявки по автомобилю", summary.availability_clicks, `${percent(summary.availability_clicks, summary.vehicle_views)} от просмотров авто${summary.custom_searches ? ` · ещё ${formatNumber(summary.custom_searches)} на подбор` : ""}`],
    // Кнопка на первом этапе заказа — самый близкий к сделке шаг: пока проверка
    // объявлений выключена, заявка никуда не уходит, но нажатия считаются.
    ["Проверка объявления", summary.availability_requests, `${formatNumber(summary.availability_request_people)} человек · ${percent(summary.availability_requests, summary.availability_clicks)} от заявок`],
    ["Регистрации", summary.registrations, `${formatNumber(summary.favorites)} добавлений в избранное`],
  ];
  return (
    <>
      <section className="analytics-kpis" aria-label="Ключевые метрики">{cards.map(([label,value,note]) => <article key={label}><span>{label}</span><strong>{formatNumber(value)}</strong><p>{note}</p></article>)}</section>
      <Viability summary={summary} />
      <section className="analytics-panel analytics-trend">
        <div className="analytics-panel-heading"><div><h2>Динамика интереса</h2><p>Уникальные посетители и ключевые действия по дням</p></div></div>
        {daily.length ? <div className="analytics-bars">{daily.map((item) => {
          const actions = Number(item.availability_clicks || 0) + Number(item.availability_requests || 0) + Number(item.registrations || 0) + Number(item.custom_searches || 0);
          return <div className="analytics-bar-column" key={item.day} title={`${formatDate(item.day)}: ${item.visitors || 0} посетителей, ${actions} целевых действий`}><div className="analytics-bar-track"><i style={{ height:`${Math.max(5, Number(item.visitors || 0) / maxDaily * 100)}%` }} /><b style={{ height:`${Math.min(100, actions / maxDaily * 100)}%` }} /></div><span>{formatDate(item.day)}</span></div>;
        })}</div> : <p className="analytics-empty">За выбранный период событий ещё нет.</p>}
        <div className="analytics-legend"><span><i />Посетители</span><span><i />Целевые действия</span></div>
      </section>
    </>
  );
}

// Колонки таблицы «Интерес по автомобилям»: каждую можно поставить во главу сортировки.
const vehicleColumns = [
  { id:"title", label:"Автомобиль", text:true, value:(item) => item.listingTitle || item.listingId || "" },
  { id:"viewers", label:"Люди", value:(item) => Number(item.viewers) || 0 },
  { id:"views", label:"Просмотры", value:(item) => Number(item.views) || 0 },
  { id:"asks", label:"Уточнения", value:(item) => Number(item.availabilityClicks) || 0 },
  { id:"checks", label:"Проверка", value:(item) => Number(item.availabilityRequests) || 0 },
  { id:"favorites", label:"Избранное", value:(item) => Number(item.favorites) || 0 },
  { id:"conversion", label:"Конверсия", value:(item) => (Number(item.views) ? (Number(item.availabilityClicks) || 0) / Number(item.views) : 0) },
  { id:"lastViewed", label:"Последний просмотр", value:(item) => (item.lastViewedAt ? new Date(item.lastViewedAt).getTime() || 0 : 0) },
];

function VehiclesSection({ data }) {
  // По умолчанию сверху то, что смотрели последним: раздел открывают, чтобы увидеть
  // свежий интерес, а рейтинг за весь период собирается кликом по нужному столбцу.
  const [sort, setSort] = useState({ column:"lastViewed", desc:true });
  const rows = useMemo(() => {
    const column = vehicleColumns.find((item) => item.id === sort.column) || vehicleColumns[0];
    const direction = sort.desc ? -1 : 1;
    return [...(data.vehicles || [])].sort((left, right) => {
      const a = column.value(left);
      const b = column.value(right);
      if (column.text) return String(a).localeCompare(String(b), "ru") * direction;
      return (a === b ? 0 : a < b ? -1 : 1) * direction;
    });
  }, [data.vehicles, sort]);
  // Первый клик по столбцу ставит осмысленный порядок: у чисел и дат — от большего,
  // у названия — по алфавиту. Повторный клик переворачивает.
  const toggle = (id) => setSort((current) => (current.column === id ? { column:id, desc:!current.desc } : { column:id, desc:id !== "title" }));
  return (
    <section className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Интерес по автомобилям</h2><p>Сверху то, что открывали последним. Нажатие на заголовок столбца меняет порядок. «Люди» — сколько разных посетителей открывали карточку; «просмотры» считают каждое открытие</p></div></div>
      <div className="analytics-table-wrap"><table><thead><tr>{vehicleColumns.map((column) => <th key={column.id} aria-sort={sort.column === column.id ? (sort.desc ? "descending" : "ascending") : "none"}><button type="button" className={`analytics-sort${sort.column === column.id ? " active" : ""}`} onClick={() => toggle(column.id)}>{column.label}<span aria-hidden="true">{sort.column === column.id ? (sort.desc ? "↓" : "↑") : ""}</span></button></th>)}</tr></thead><tbody>{rows.length ? rows.map((item) => <tr key={item.listingId}><td><a href={`/cars/${encodeURIComponent(item.listingId)}`}>{item.listingTitle || item.listingId}</a></td><td>{formatNumber(item.viewers ?? 0)}</td><td>{formatNumber(item.views)}</td><td>{formatNumber(item.availabilityClicks)}</td><td>{formatNumber(item.availabilityRequests ?? 0)}</td><td>{formatNumber(item.favorites)}</td><td>{percent(item.availabilityClicks, item.views)}</td><td>{item.lastViewedAt ? formatLeadDate(item.lastViewedAt) : "—"}</td></tr>) : <tr><td colSpan={vehicleColumns.length}>Событий по автомобилям пока нет.</td></tr>}</tbody></table></div>
      <FavoritesPanel favorites={data.favorites} />
    </section>
  );
}

// Что лежит в избранном прямо сейчас, а не сколько раз нажимали сердечко: строка
// исчезает, когда машину убрали из избранного, и не зависит от выбранного периода.
function FavoritesPanel({ favorites }) {
  const rows = favorites || [];
  return (
    <div className="analytics-subpanel">
      <div className="analytics-panel-heading"><div><h2>Сейчас в избранном</h2><p>Машины, отложенные зарегистрированными посетителями. У гостя без входа в кабинет избранное остаётся в его браузере и сюда не попадает</p></div></div>
      <div className="analytics-table-wrap"><table><thead><tr><th>Автомобиль</th><th>Людей</th><th>Состояние</th><th>Отложили</th></tr></thead><tbody>{rows.length ? rows.map((item) => <tr key={item.listingId} className={item.gone || item.status === "unavailable" ? "analytics-row-warning" : undefined}><td><a href={`/cars/${encodeURIComponent(item.listingId)}`}>{item.listingTitle}</a>{item.priceUsd ? <span className="analytics-note"> · {formatUsd(item.priceUsd)}</span> : null}</td><td>{formatNumber(item.people)}</td><td>{item.gone ? "Нет в каталоге" : item.status === "unavailable" ? "Снята с продажи" : "В продаже"}</td><td>{formatLeadDate(item.addedAt)}</td></tr>) : <tr><td colSpan="4">Избранного пока нет.</td></tr>}</tbody></table></div>
    </div>
  );
}

function SearchesSection({ data }) {
  const rows = data.searches || [];
  const empty = rows.filter((item) => Number(item.found) === 0).length;
  return (
    <section className="analytics-panel">
      <div className="analytics-panel-heading"><div><h2>Что ищут</h2><p>Записывается готовый запрос, а не набор по буквам: строка попадает сюда, когда её перестали править{empty ? ` · без результата: ${empty}` : ""}</p></div></div>
      <div className="analytics-table-wrap"><table><thead><tr><th>Запрос</th><th>Искали</th><th>Людей</th><th>Нашлось</th><th>Последний раз</th></tr></thead><tbody>{rows.length ? rows.map((item) => <tr key={item.query} className={Number(item.found) === 0 ? "analytics-row-warning" : undefined}><td><a href={`/?q=${encodeURIComponent(item.query)}`}>{item.query}</a></td><td>{formatNumber(item.asked)}</td><td>{formatNumber(item.people)}</td><td>{item.found === null || item.found === undefined ? "—" : formatNumber(item.found)}</td><td>{formatDate(item.lastAskedAt, true)}</td></tr>) : <tr><td colSpan="5">В строке поиска пока ничего не набирали.</td></tr>}</tbody></table></div>
    </section>
  );
}

function CustomersSection({ data }) {
  return (
    <div className="analytics-two-column">
      <section className="analytics-panel">
        <div className="analytics-panel-heading"><div><h2>Регистрации</h2><p>Контакты доступны только в этом защищённом разделе</p></div></div>
        <div className="analytics-table-wrap"><table><thead><tr><th>Имя</th><th>Телефон</th><th>Дата</th></tr></thead><tbody>{data.registrations?.length ? data.registrations.map((item, index) => <tr key={`${item.phone}-${item.createdAt}-${index}`}><td>{item.name || "—"}</td><td>{item.phone ? <a href={`tel:${String(item.phone).replace(/[^+\d]/g, "")}`}>{item.phone}</a> : "—"}</td><td>{formatDate(item.createdAt, true)}</td></tr>) : <tr><td colSpan="3">Регистраций пока нет.</td></tr>}</tbody></table></div>
      </section>
      <section className="analytics-panel">
        <div className="analytics-panel-heading"><div><h2>Последние действия</h2><p>Быстрый контекст для проверки воронки</p></div></div>
        <ol className="analytics-activity">{data.recent?.length ? data.recent.slice(0, 12).map((item, index) => <li key={`${item.createdAt}-${index}`}><div><b>{eventLabels[item.eventName] || item.eventName}</b><span>{item.listingTitle || item.path}</span></div><time>{formatDate(item.createdAt, true)}</time></li>) : <li>Событий пока нет.</li>}</ol>
      </section>
    </div>
  );
}

// Когда сотрудник в последний раз открывал каждый пункт. Живёт в браузере:
// раздел смотрят с разных устройств, и у каждого свой «прочитано».
const seenKey = "abcars-analytics-seen";
const readSeen = () => {
  try { return JSON.parse(window.localStorage.getItem(seenKey)) || {}; } catch { return {}; }
};
const writeSeen = (value) => {
  try { window.localStorage.setItem(seenKey, JSON.stringify(value)); } catch { /* приватный режим */ }
};

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
  { id:"leads", label:"Заявки", icon:Tray, ranged:false },
  { id:"vehicles", label:"Автомобили", icon:CarProfile, ranged:true },
  { id:"searches", label:"Поиск", icon:MagnifyingGlass, ranged:true },
  { id:"customers", label:"Клиенты", icon:UsersThree, ranged:true },
];

function Dashboard({ data, period, setPeriod, reload, logout, leads, leadsLoading, leadsError, leadsUnavailable, reloadLeads }) {
  const [section, setSection] = useState("leads");
  // Красные счётчики у пунктов: сколько нового появилось с прошлого захода сюда.
  const [updates, setUpdates] = useState({});
  const seenRef = useRef(null);
  if (seenRef.current === null) {
    const stored = readSeen();
    const now = new Date().toISOString();
    // Пункт, в который ещё ни разу не заходили, отсчитывает новое от этой минуты:
    // показать всю прошлую историю как непрочитанное — только напугать цифрой.
    for (const item of sections) if (!stored[item.id]) stored[item.id] = now;
    seenRef.current = stored;
    writeSeen(stored);
  }
  // Открытый пункт считается просмотренным всё время, пока он открыт, — как
  // непрочитанные сообщения в чате: смотришь на них, и они перестают гореть.
  const markSeen = useCallback((id) => {
    seenRef.current = { ...seenRef.current, [id]:new Date().toISOString() };
    writeSeen(seenRef.current);
    setUpdates((current) => ({ ...current, [id]:0 }));
  }, []);
  const openSection = (id) => {
    markSeen(id);
    setSection(id);
  };
  const sectionRef = useRef(section);
  sectionRef.current = section;
  const loadUpdates = useCallback(async () => {
    seenRef.current = { ...seenRef.current, [sectionRef.current]:new Date().toISOString() };
    writeSeen(seenRef.current);
    try {
      const response = await fetch(`/api/analytics/updates?${new URLSearchParams(seenRef.current)}`, { credentials:"same-origin" });
      if (response.ok) setUpdates(await response.json());
    } catch { /* счётчики — не повод ломать раздел */ }
  }, []);
  // Считаем заново при каждом обновлении среза: и при заходе, и после кнопки «обновить».
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
        <div><span>Закрытый раздел</span><h1>Аналитика и заявки</h1><p>Срез обновлён {formatDate(data.generatedAt, true)}</p></div>
        <div className="analytics-actions">
          {active.ranged && <div className="analytics-range" aria-label="Период аналитики">{analyticsPeriods.map(({ id, label }) => <button key={id} type="button" className={period === id ? "active" : ""} onClick={() => setPeriod(id)}>{label}</button>)}</div>}
          <button className="secondary analytics-logout" type="button" onClick={logout}><SignOut size={18} /> Выйти</button>
        </div>
      </header>

      <div className="analytics-layout">
        <aside className="analytics-sidebar">
          <div className="analytics-sidebar-user">
            <b><ShieldCheck size={20} weight="duotone" /></b>
            <div><strong>Аналитика MVP</strong><span>Только для сотрудников</span></div>
          </div>
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
          <div className="analytics-sidebar-footer">
            <button className="analytics-sidebar-danger" type="button" onClick={() => { setResetError(""); setResetOpen(true); }}><Trash size={17} /> Обнулить аналитику</button>
          </div>
        </aside>

        <div className="analytics-content">
          <div className="analytics-tabpanel" hidden={section !== "overview"}><OverviewSection data={data} /></div>
          <div className="analytics-tabpanel" hidden={section !== "leads"}><LeadsSection leads={leads} loading={leadsLoading} error={leadsError} unavailable={leadsUnavailable} reload={reloadLeads} /></div>
          <div className="analytics-tabpanel" hidden={section !== "vehicles"}><VehiclesSection data={data} /></div>
          <div className="analytics-tabpanel" hidden={section !== "searches"}><SearchesSection data={data} /></div>
          <div className="analytics-tabpanel" hidden={section !== "customers"}><CustomersSection data={data} /></div>
        </div>
      </div>
      {resetOpen && <ResetAnalyticsModal pending={resetting} error={resetError} onCancel={() => setResetOpen(false)} onConfirm={resetAnalytics} />}
    </main>
  );
}

export function AnalyticsPage() {
  const [period, setPeriod] = useState("today");
  const [data, setData] = useState(null);
  const [authenticated, setAuthenticated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState("");
  const [leadsUnavailable, setLeadsUnavailable] = useState(false);
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
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/analytics/dashboard?period=${encodeURIComponent(period)}`, { cache:"no-store", credentials:"same-origin" });
      if (response.status === 401) { setAuthenticated(false); setData(null); return; }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "load_failed");
      setData(payload);
      setAuthenticated(true);
    } catch (loadError) {
      setError(loadError.message === "analytics_storage_unavailable" ? "Хранилище аналитики ещё не подключено." : "Не удалось загрузить аналитику. Попробуйте ещё раз.");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [period]);
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
  return <Dashboard data={data} period={period} setPeriod={setPeriod} reload={load} logout={logout} leads={leads} leadsLoading={leadsLoading} leadsError={leadsError} leadsUnavailable={leadsUnavailable} reloadLeads={loadLeads} />;
}
