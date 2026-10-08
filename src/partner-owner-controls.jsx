import { useCallback, useEffect, useRef, useState } from "react";
import { PasswordField } from "./password-field.jsx";
import { CompactSelect as SelectField } from "./compact-select.jsx";
import { PARTNER_STATUSES, partnerPhoneLabel } from "./partner-model.js";
async function ownerApi(url, options = {}) {
  const response = await fetch(url, { credentials:"same-origin", cache:"no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error === "login_exists" ? "Этот логин уже занят." : data.error === "invalid_partner_credentials" ? "Проверьте данные: логин от 3 символов, пароль от 8 символов." : response.status === 401 ? "Войдите в аналитику заново." : "Не удалось сохранить. Попробуйте ещё раз.");
  return data;
}
export function usePartnerDirectory(refreshKey) {
  const [directory, setDirectory] = useState({ partners:[], assignments:[], registrationRequests:[] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const reload = useCallback(async (signal) => {
    const request = ++latest.current;
    setLoading(true);
    try { const data = await ownerApi("/api/analytics/partners", { signal }); if (!signal?.aborted && request === latest.current) { setDirectory(data); setError(""); } }
    catch (error) { if (!signal?.aborted && request === latest.current) setError("Не удалось загрузить партнёров."); }
    finally { if (!signal?.aborted && request === latest.current) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); reload(controller.signal); return () => controller.abort(); }, [reload, refreshKey]);
  const onAssigned = (leadKey, assignment) => setDirectory((current) => ({ ...current, assignments:[...current.assignments.filter((item) => item.lead_key !== leadKey), ...(assignment ? [assignment] : [])] }));
  return { ...directory, error, loading, reload, onAssigned };
}
export function PartnerAccessControl({ partners, error, reload }) {
  const [login, setLogin] = useState(""); const [name, setName] = useState(""); const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const [formError, setFormError] = useState("");
  const create = async (event) => {
    event.preventDefault(); setPending(true); setMessage(""); setFormError("");
    try { await ownerApi("/api/analytics/partners", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({login,name,password}) }); setMessage(`Доступ создан: ${login.trim().toLowerCase()}. Передайте партнёру выбранный пароль.`); setPassword(""); setLogin(""); setName(""); await reload(); }
    catch (error) { setFormError(error.message); } finally { setPending(false); }
  };
  return <details className="partner-access-control"><summary>Доступ для партнёров <span>{partners.length}</span></summary><p>Создавайте доступ и передавайте логин с паролем лично. Партнёр видит только назначенные ему заявки.</p>{error && <div role="alert">{error}<button type="button" onClick={() => reload()}>Обновить</button></div>}{partners.length > 0 && <ul>{partners.map((partner) => <li key={partner.id}><strong>{partner.name}</strong><span>{partner.login}</span></li>)}</ul>}<form onSubmit={create}><label className="auth-field"><span>Название партнёра</span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} disabled={pending} placeholder="Компания или имя" /></label><label className="auth-field"><span>Логин</span><input value={login} onChange={(e) => setLogin(e.target.value)} required pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}" maxLength={64} autoComplete="off" disabled={pending} placeholder="Например, partner1" /></label><PasswordField label="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required disabled={pending} />{formError && <p role="alert">{formError}</p>}<button type="submit" className="analytics-reset-button" disabled={pending || password.length < 8}>{pending ? "Создаём…" : "Выдать доступ"}</button><p role="status">{message}</p></form></details>;
}
export function PartnerRegistrationRequests({ directory, onViewed }) {
  const acknowledged = useRef(new Set());
  const [viewError, setViewError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (directory.loading || directory.error) return;
    const requests = directory.registrationRequests.filter((item) => !item.seenAt && !acknowledged.current.has(`${item.id}:${item.updatedAt}`));
    if (!requests.length) return;
    const controller = new AbortController();
    const acknowledge = async () => {
      for (let start = 0; start < requests.length; start += 100) {
        await ownerApi("/api/analytics/partner-registration-requests/seen", {
          method:"POST", signal:controller.signal, headers:{ "content-type":"application/json" },
          body:JSON.stringify({ requests:requests.slice(start, start + 100).map(({ id, updatedAt }) => ({ id, updatedAt })) }),
        });
      }
    };
    acknowledge().then(() => {
      requests.forEach((item) => acknowledged.current.add(`${item.id}:${item.updatedAt}`));
      if (!controller.signal.aborted) { setViewError(""); onViewed(); }
    }).catch(() => { if (!controller.signal.aborted) setViewError("Не удалось отметить заявки просмотренными."); });
    return () => controller.abort();
  }, [directory.registrationRequests, directory.loading, directory.error, onViewed, retry]);
  return <section className="analytics-panel analytics-partnership-panel" aria-busy={directory.loading}>
    <div className="analytics-panel-heading"><div><h2>Заявки на партнёрство</h2><p>Контакты желающих присоединиться к партнёрской программе</p></div><button className="analytics-reset-button" type="button" disabled={directory.loading} onClick={() => directory.reload()}>{directory.loading ? "Обновляем…" : "Обновить"}</button></div>
    {directory.error && <div className="analytics-error" role="alert">{directory.error}<button type="button" onClick={() => directory.reload()}>Повторить</button></div>}
    {viewError && <div className="analytics-error" role="alert">{viewError}<button type="button" onClick={() => setRetry((value) => value + 1)}>Повторить</button></div>}
    {directory.registrationRequests.length ? <div className="analytics-partnership-list">{directory.registrationRequests.map((request) => <article className="analytics-partnership-card" key={request.id}>
      <header><strong>{request.name}</strong><time dateTime={request.createdAt}>{new Intl.DateTimeFormat("ru-RU", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }).format(new Date(request.createdAt))}</time></header>
      <a href={`tel:${request.phone}`}>{partnerPhoneLabel(request.phone)}</a>
    </article>)}</div> : !directory.loading && !directory.error ? <p className="analytics-empty">Заявок на партнёрство пока нет. Они появятся здесь после отправки формы регистрации.</p> : directory.loading ? <div className="analytics-partnership-loading" role="status" aria-label="Загрузка заявок"><span className="app-loader-spinner" aria-hidden="true" /></div> : null}
    <PartnerAccessControl partners={directory.partners} error={directory.error} reload={directory.reload} />
  </section>;
}
export function PartnerAssignmentControl({ lead, partners, assignment, onAssigned }) {
  const [partnerId, setPartnerId] = useState(assignment?.partner_id || "");
  const [note, setNote] = useState(assignment?.owner_note || "");
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { setPartnerId(assignment?.partner_id || ""); setNote(assignment?.owner_note || ""); }, [assignment?.partner_id,assignment?.owner_note]);
  const save = async (event) => {
    event.preventDefault(); setPending(true); setError(""); setMessage("");
    try { const data = await ownerApi("/api/analytics/partner-assignments", { method:partnerId ? "POST" : "DELETE", headers:{"content-type":"application/json"}, body:JSON.stringify({leadId:lead.id,partnerId,note}) }); onAssigned(lead.id,data.assignment || null); setMessage(partnerId ? "Заявка передана партнёру" : "Доступ к заявке снят"); }
    catch (error) { setError(error.message); } finally { setPending(false); }
  };
  return <details className="partner-assignment"><summary>{assignment ? `Партнёр: ${partners.find((p) => p.id === assignment.partner_id)?.name || "назначен"} · ${PARTNER_STATUSES[assignment.status]}` : "Передать партнёру"}</summary>{partners.length ? <form onSubmit={save}><SelectField label="Партнёр" value={partnerId} options={["",...partners.map((p) => p.id)]} formatOption={(id) => id ? partners.find((p) => p.id === id)?.name || "Партнёр" : "Без партнёра"} onChange={setPartnerId} disabled={pending} /><label className="partner-owner-note"><span>Задача для партнёра</span><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} disabled={pending} placeholder="Что проверить или уточнить" /></label><p>Партнёру будут доступны автомобиль и контакты этого клиента.</p>{assignment?.partner_note && <blockquote><b>Ответ партнёра:</b> {assignment.partner_note}</blockquote>}{error && <p role="alert">{error}</p>}<button className="analytics-reset-button" type="submit" disabled={pending || (!partnerId && !assignment)}>{pending ? "Сохраняем…" : partnerId ? "Передать заявку" : "Снять назначение"}</button><span role="status">{message}</span></form> : <p>Сначала создайте доступ в блоке «Доступ для партнёров» выше.</p>}</details>;
}
