import { useCallback, useEffect, useRef, useState } from "react";
import { PasswordField } from "./password-field.jsx";
import { PartnerRegistrationModal } from "./partner-registration-modal.jsx";
import { CompactSelect as SelectField } from "./compact-select.jsx";
import { SegmentedControl } from "./segmented-control.jsx";
import { analyticsNoCountHref } from "./analytics-links.js";
import { CarProfile, CheckCircle, Clock, ClipboardText, LockKey, SignOut } from "./icons.jsx";
import { SearchField } from "./search-field.jsx";
import { COMPANY } from "./company-data.js";
import { PARTNER_STATUSES, partnerCounts, partnerPhoneLabel, partnerSourceUrl } from "./partner-model.js";
import { listingNumber } from "./listing-id.js";
import { vehiclePhotoHref } from "./photo-source.js";
const date = (value) => new Intl.DateTimeFormat("ru-RU", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }).format(new Date(value));
const statusOptions = Object.keys(PARTNER_STATUSES);
const filterOptions = ["all", "active", ...statusOptions];
const sectionOptions = [{ value:"overview", label:"Обзор" }, { value:"requests", label:"Заявки" }, { value:"profile", label:"Профиль и помощь" }];
const carPath = (id) => `/cars/${encodeURIComponent(listingNumber(id))}`;
async function api(url, options = {}) {
  const response = await fetch(url, { credentials:"same-origin", cache:"no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 429 ? "Слишком много попыток. Попробуйте позже." : response.status === 401 ? "Неверный логин или пароль." : "Не удалось выполнить запрос. Попробуйте ещё раз.";
    const error = new Error(message); error.status = response.status; throw error;
  }
  return body;
}
export function PartnerPage({ navigate, section = "overview", setSection, CountrySelect }) {
  const [partner, setPartner] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const controller = useRef(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const next = new AbortController(); controller.current = next;
    setLoading(true); setError("");
    try {
      const data = await api("/api/partner/dashboard", { signal:next.signal });
      if (!next.signal.aborted) { setPartner(data.partner); setRequests(data.requests); }
    } catch (error) {
      if (next.signal.aborted) return;
      if (error.status === 401) { setPartner(null); setRequests([]); setSection("overview"); }
      else setError("Не удалось загрузить кабинет. Проверьте соединение и попробуйте ещё раз.");
    } finally { if (!next.signal.aborted) setLoading(false); }
  }, [setSection]);
  useEffect(() => { refresh(); return () => controller.current?.abort(); }, [refresh]);
  const logout = async () => {
    setError("");
    try { await api("/api/partner/logout", { method:"POST" }); setPartner(null); setRequests([]); setSection("overview"); }
    catch (error) { setError(error.message); }
  };
  const saveRequest = async (id, values) => {
    try {
      const data = await api(`/api/partner/requests/${id}`, { method:"PATCH", headers:{ "content-type":"application/json" }, body:JSON.stringify(values) });
      setRequests((items) => items.map((item) => item.id === id ? data.request : item));
    } catch (error) {
      if (error.status === 401) { setPartner(null); setRequests([]); setSection("overview"); throw new Error("Сессия закончилась. Войдите снова."); }
      throw error;
    }
  };
  if (loading && !partner) return <main className="partner-loading" role="status" aria-label="Загрузка кабинета"><span className="app-loader-spinner" aria-hidden="true" /></main>;
  if (!partner) return <PartnerLogin onLogin={refresh} error={error} onRetry={refresh} CountrySelect={CountrySelect} />;
  const counts = partnerCounts(requests);
  const needle = query.trim().toLowerCase();
  const filtered = requests.filter((item) => (filter === "all" || (filter === "active" ? ["in_progress","waiting"].includes(item.status) : item.status === filter)) && [item.car?.title,item.customer.name,item.customer.phone,item.comment,item.ownerNote].filter(Boolean).join(" ").toLowerCase().includes(needle));
  const urgent = [...requests].sort((a,b) => Number(b.status === "new") - Number(a.status === "new")).slice(0,3);
  const visible = section === "overview" ? urgent : filtered;
  return <main className="partner-page page-width">
    <div className="partner-heading"><h1>Кабинет партнёра</h1><div className="partner-heading-actions"><button className="partner-logout" type="button" onClick={logout}><SignOut size={20} aria-hidden="true" />Выйти</button></div></div>
    {error && <p className="partner-error" role="alert">{error}</p>}
    <div className="partner-layout">
      <aside className="partner-sidebar"><div className="partner-identity"><span aria-hidden="true">{partner.name.trim().slice(0,1).toUpperCase()}</span><div><strong>{partner.name}</strong><small>{partner.login}</small></div></div>
        <nav aria-label="Разделы кабинета партнёра"><SegmentedControl className="partner-section-switch" label="Раздел кабинета" options={sectionOptions} value={section} onChange={setSection} renderOption={(option) => <><span>{option.label}</span>{option.value === "requests" && counts.new > 0 && <b>{counts.new}</b>}</>} /></nav>
        <p className="partner-sidebar-note"><LockKey size={16} aria-hidden="true" />Доступ только к переданным вам заявкам</p>
      </aside>
      <div className="partner-main" aria-busy={loading}>
        {section === "profile" ? <PartnerHelp partner={partner} /> : <>
          {section === "overview" && <section className="partner-kpis" aria-label="Сводка заявок">{[["new","Новые",ClipboardText],["active","В работе",Clock],["completed","Завершены",CheckCircle]].map(([key,label,Icon]) => <button key={key} type="button" onClick={() => { setFilter(key); setSection("requests"); }}><Icon size={23} weight="duotone" aria-hidden="true" /><span>{label}</span><strong>{counts[key]}</strong></button>)}</section>}
          <section className="partner-inbox"><div className="partner-section-heading"><h2>{section === "overview" ? "Последние заявки" : "Заявки"}</h2>{section === "overview" && requests.length > 3 && <button type="button" onClick={() => { setSection("requests"); setFilter("all"); }}>Все заявки</button>}</div>
            {section === "requests" && <div className="partner-request-filters"><SearchField value={query} onValueChange={setQuery} placeholder="Клиент или автомобиль" ariaLabel="Поиск по заявкам" /><SelectField label="Статус заявки" value={filter} options={filterOptions} formatOption={(value) => value === "all" ? "Все статусы" : value === "active" ? "В работе и ждём ответа" : PARTNER_STATUSES[value]} onChange={setFilter} /></div>}
            {visible.length ? <div className="partner-request-list">{visible.map((item) => <PartnerRequestCard key={item.id} item={item} navigate={navigate} onSave={saveRequest} />)}</div> : <div className="partner-empty"><ClipboardText size={36} weight="duotone" aria-hidden="true" /><h3>{requests.length ? "Ничего не найдено" : "Новых заявок пока нет"}</h3><p>{requests.length ? "Измените поиск или статус заявки." : "Когда команда передаст вам заявку, здесь появятся автомобиль, контакты клиента и задача."}</p></div>}
          </section>
        </>}
      </div>
    </div>
  </main>;
}
function PartnerLogin({ onLogin, error, onRetry, CountrySelect }) {
  const [login, setLogin] = useState(""); const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false); const [loginError, setLoginError] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const registrationTrigger = useRef(null);
  const closeRegistration = useCallback(() => setRegistrationOpen(false), []);
  const submit = async (event) => {
    event.preventDefault(); setPending(true); setLoginError("");
    try { await api("/api/partner/login", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({login,password}) }); setPassword(""); await onLogin(); }
    catch (error) { setLoginError(error.message); }
    finally { setPending(false); }
  };
  return <><main className="partner-login page-width" aria-hidden={registrationOpen ? true : undefined} inert={registrationOpen ? true : undefined}><section className="partner-login-intro"><h1>Работа с заявками.<br /><span>В одном месте.</span></h1><p>Автомобили, контакты клиентов и статусы — в вашем личном кабинете.</p></section>
    <section className="partner-login-card"><h2>Вход для партнёров</h2><form onSubmit={submit}><label className="auth-field"><span>Логин</span><input name="username" autoComplete="username" value={login} onChange={(event) => setLogin(event.target.value)} maxLength={64} required disabled={pending} autoCapitalize="none" spellCheck={false} autoFocus /></label><PasswordField label="Пароль" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={pending} />{loginError && <p className="partner-error" role="alert">{loginError}</p>}<button className="primary" type="submit" disabled={pending}>{pending ? "Входим…" : "Войти в кабинет"}</button></form><button ref={registrationTrigger} className="partner-register-link" type="button" onClick={() => setRegistrationOpen(true)}>Зарегистрироваться</button>{error && <div className="partner-error" role="alert">{error}<button type="button" onClick={onRetry}>Повторить</button></div>}</section>
  </main>{registrationOpen && <PartnerRegistrationModal onClose={closeRegistration} restoreFocusRef={registrationTrigger} CountrySelect={CountrySelect} />}</>;
}
export function PartnerRequestCard({ item, navigate, onSave }) {
  const [failedImage, setFailedImage] = useState("");
  const photo = vehiclePhotoHref(item.car?.image || "", 240);
  const sourceUrl = partnerSourceUrl(item.car?.sourceUrl);
  const carHref = item.car?.id ? analyticsNoCountHref(carPath(item.car.id)) : "";
  const comment = item.ownerNote || item.comment;
  const openCar = (event) => {
    if (navigate && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); navigate(carHref);
    }
  };
  const [expanded, setExpanded] = useState(false); const [status, setStatus] = useState(item.status); const [note, setNote] = useState(item.note || "");
  const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  useEffect(() => { setStatus(item.status); setNote(item.note || ""); }, [item.status,item.note]);
  const save = async (event) => { event.preventDefault(); setPending(true); setError(""); setMessage(""); try { await onSave(item.id,{status,note}); setMessage("Изменения сохранены"); } catch (error) { setError(error.message); } finally { setPending(false); } };
  const phone = /^\+?[\d\s().-]{7,30}$/.test(item.customer.phone || "") ? `tel:${item.customer.phone.replace(/[^+\d]/g,"")}` : "";
  return <article className={`partner-request-card status-${item.status}`}><div className="partner-request-meta"><span className="partner-status">{PARTNER_STATUSES[item.status]}</span><time dateTime={item.assignedAt}>{date(item.assignedAt)}</time>{item.demo && <span className="partner-demo">Демонстрационная заявка</span>}</div><div className="partner-request-title"><span className={`partner-request-icon${photo && failedImage !== photo ? " partner-request-photo" : ""}`}>{photo && failedImage !== photo ? <img src={photo} alt={item.car?.title || "Автомобиль из заявки"} width={120} height={90} loading="lazy" onError={() => setFailedImage(photo)} /> : <CarProfile size={27} weight="duotone" aria-hidden="true" />}</span><div><h3>{carHref ? <a href={carHref} onClick={openCar}>{item.car.title}</a> : item.car?.title || "Индивидуальный подбор"}</h3>{sourceUrl && <a className="partner-source-link" href={sourceUrl} target="_blank" rel="nofollow noopener noreferrer">Объявление на {new URL(sourceUrl).hostname.replace(/^www\./,"")}</a>}</div></div>{comment && <p className="partner-request-comment">{comment}</p>}<div className="partner-request-bottom"><button className="partner-details-button" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Свернуть" : "Подробнее"}</button></div>
    {expanded && <div className="partner-request-detail"><dl><div><dt>Клиент</dt><dd>{item.customer.name || "Имя не указано"}</dd></div>{item.customer.city && <div><dt>Город</dt><dd>{item.customer.city}</dd></div>}{item.customer.phone && <div><dt>Контакт</dt><dd>{phone ? <a className="partner-customer-contact" href={phone}>{partnerPhoneLabel(item.customer.phone)}</a> : item.customer.phone}</dd></div>}{item.customer.email && <div><dt>Email</dt><dd><a href={`mailto:${item.customer.email}`}>{item.customer.email}</a></dd></div>}{item.customer.telegram && <div><dt>Telegram</dt><dd>@{item.customer.telegram.replace(/^@/,"")}</dd></div>}{item.car?.id && <div><dt>Автомобиль</dt><dd><a href={carHref} onClick={openCar}>Открыть в каталоге</a></dd></div>}{item.comment && <div><dt>Пожелания клиента</dt><dd>{item.comment}</dd></div>}{item.filters && <div><dt>Параметры подбора</dt><dd>{Object.values(item.filters).filter((v) => typeof v === "string" && !["any","all",""].includes(v)).join(" · ") || "Уточните у клиента"}</dd></div>}</dl>
      <form onSubmit={save}><SelectField label="Статус работы" value={status} options={statusOptions} formatOption={(value) => PARTNER_STATUSES[value]} onChange={(value) => { setStatus(value); setMessage(""); }} disabled={pending} /><label className="partner-note-field"><span>Комментарий для команды abcars.by</span><textarea value={note} onChange={(event) => { setNote(event.target.value); setMessage(""); }} maxLength={2000} rows={3} placeholder="Что удалось выяснить и какой следующий шаг" disabled={pending} /></label>{error && <p className="partner-error" role="alert">{error}</p>}<div className="partner-save-row"><button className="primary" type="submit" disabled={pending || (status === item.status && note.trim() === (item.note || ""))}>{pending ? "Сохраняем…" : "Сохранить"}</button><span role="status">{message}</span></div></form>
    </div>}
  </article>;
}
function PartnerHelp({ partner }) {
  return <section className="partner-help"><h2>Профиль и помощь</h2><dl><div><dt>Партнёр</dt><dd>{partner.name}</dd></div><div><dt>Логин</dt><dd>{partner.login}</dd></div></dl><h3>Как работать с заявками</h3><ol><li>Откройте новую заявку и свяжитесь с клиентом.</li><li>Поставьте статус «В работе». Если ждёте ответ или информацию — «Ждём ответа».</li><li>Добавьте комментарий с результатом и следующим шагом. Команда увидит его в аналитике.</li><li>После выполнения задачи выберите «Завершена». Если заявка не подходит — укажите причину и выберите «Не подходит».</li></ol><h3>Нужна помощь?</h3><p>По вопросам заявки и доступа обратитесь к команде abcars.by. Логины и пароли выдаются вручную.</p>{COMPANY.phone && <a className="secondary" href={COMPANY.phoneHref || `tel:${COMPANY.phone.replace(/[^+\d]/g,"")}`}>{COMPANY.phone}</a>}</section>;
}
