import { useEffect, useState } from "react";

const formatNumber = (value) => new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
const formatDate = (value, withTime = false) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", withTime ? { dateStyle:"short", timeStyle:"short" } : { day:"2-digit", month:"short" }).format(date);
};
const percent = (part, total) => total ? `${(Number(part || 0) / Number(total) * 100).toFixed(1).replace(".", ",")}%` : "0%";
const average = (part, total) => total ? (Number(part || 0) / Number(total)).toFixed(1).replace(".", ",") : "0";
const eventLabels = {
  page_view:"Просмотр страницы",
  vehicle_view:"Просмотр автомобиля",
  availability_click:"Клик «Уточнить актуальность»",
  registration_completed:"Регистрация",
  favorite_added:"Добавление в избранное",
  custom_search_submitted:"Заявка на индивидуальный подбор",
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

function Dashboard({ data, days, setDays, reload, logout }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const summary = data.summary || {};
  const daily = data.daily || [];
  const maxDaily = Math.max(1, ...daily.map((item) => Number(item.visitors) || 0));
  const leads = (Number(summary.registrations) || 0) + (Number(summary.custom_searches) || 0);
  const cards = [
    ["Уникальные посетители", summary.visitors, `${formatNumber(summary.sessions)} сессий`],
    ["Просмотры автомобилей", summary.vehicle_views, `${average(summary.vehicle_views, summary.visitors)} на посетителя`],
    ["Уточнения актуальности", summary.availability_clicks, `${percent(summary.availability_clicks, summary.vehicle_views)} от просмотров авто`],
    ["Регистрации и заявки", leads, `${summary.registrations || 0} регистраций · ${summary.custom_searches || 0} заявок`],
  ];
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
    <main className="analytics-page page-width">
      <header className="analytics-heading">
        <div><span>Закрытый раздел</span><h1>Аналитика MVP</h1><p>Срез обновлён {formatDate(data.generatedAt, true)}</p></div>
        <div className="analytics-actions"><div className="analytics-range" aria-label="Период аналитики">{[7,30,90].map((value) => <button key={value} type="button" className={days === value ? "active" : ""} onClick={() => setDays(value)}>{value} дней</button>)}</div><button className="analytics-reset-button" type="button" onClick={() => { setResetError(""); setResetOpen(true); }}>Обнулить данные</button><button className="analytics-logout" type="button" onClick={logout}>Выйти</button></div>
      </header>

      <section className="analytics-kpis" aria-label="Ключевые метрики">{cards.map(([label,value,note]) => <article key={label}><span>{label}</span><strong>{formatNumber(value)}</strong><p>{note}</p></article>)}</section>
      <Viability summary={summary} />

      <section className="analytics-panel analytics-trend">
        <div className="analytics-panel-heading"><div><h2>Динамика интереса</h2><p>Уникальные посетители и ключевые действия по дням</p></div></div>
        {daily.length ? <div className="analytics-bars">{daily.map((item) => {
          const actions = Number(item.availability_clicks || 0) + Number(item.registrations || 0) + Number(item.custom_searches || 0);
          return <div className="analytics-bar-column" key={item.day} title={`${formatDate(item.day)}: ${item.visitors || 0} посетителей, ${actions} целевых действий`}><div className="analytics-bar-track"><i style={{ height:`${Math.max(5, Number(item.visitors || 0) / maxDaily * 100)}%` }} /><b style={{ height:`${Math.min(100, actions / maxDaily * 100)}%` }} /></div><span>{formatDate(item.day)}</span></div>;
        })}</div> : <p className="analytics-empty">За выбранный период событий ещё нет.</p>}
        <div className="analytics-legend"><span><i />Посетители</span><span><i />Целевые действия</span></div>
      </section>

      <section className="analytics-panel">
        <div className="analytics-panel-heading"><div><h2>Интерес по автомобилям</h2><p>Показывает, какие объявления вызывают не просто просмотры, а намерение связаться</p></div></div>
        <div className="analytics-table-wrap"><table><thead><tr><th>Автомобиль</th><th>Просмотры</th><th>Уточнения</th><th>Избранное</th><th>Конверсия</th></tr></thead><tbody>{data.vehicles?.length ? data.vehicles.map((item) => <tr key={item.listingId}><td><a href={`/cars/${encodeURIComponent(item.listingId)}`}>{item.listingTitle || item.listingId}</a></td><td>{formatNumber(item.views)}</td><td>{formatNumber(item.availabilityClicks)}</td><td>{formatNumber(item.favorites)}</td><td>{percent(item.availabilityClicks, item.views)}</td></tr>) : <tr><td colSpan="5">Событий по автомобилям пока нет.</td></tr>}</tbody></table></div>
      </section>

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
      {resetOpen && <ResetAnalyticsModal pending={resetting} error={resetError} onCancel={() => setResetOpen(false)} onConfirm={resetAnalytics} />}
    </main>
  );
}

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [authenticated, setAuthenticated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/analytics/dashboard?days=${days}`, { cache:"no-store", credentials:"same-origin" });
      if (response.status === 401) { setAuthenticated(false); setData(null); return; }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "load_failed");
      setData(payload);
      setAuthenticated(true);
    } catch (loadError) {
      setError(loadError.message === "analytics_storage_unavailable" ? "Хранилище аналитики ещё не подключено." : "Не удалось загрузить аналитику. Попробуйте ещё раз.");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [days]);
  const logout = async () => {
    await fetch("/api/analytics/logout", { method:"POST", credentials:"same-origin" }).catch(() => {});
    setAuthenticated(false);
    setData(null);
  };
  if (authenticated === false) return <Login onSuccess={load} />;
  if (error && !data) return <main className="analytics-login page-width"><section className="analytics-login-card"><h1>Аналитика недоступна</h1><p>{error}</p><button className="primary" type="button" onClick={load}>Повторить</button></section></main>;
  if (!data) return <main className="analytics-login page-width"><section className="analytics-login-card"><h1>Загружаем аналитику…</h1></section></main>;
  return <Dashboard data={data} days={days} setDays={setDays} reload={load} logout={logout} />;
}
