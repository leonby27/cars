import {useEffect,useRef,useState} from 'react';
import {SquaresFour,ChartLineUp,CarProfile,Tray,MagnifyingGlass,UsersThree,ChatCircleText,InstagramLogo,SignOut} from '@phosphor-icons/react';
import {AnalyticsVisitsChart} from './analytics-visits-chart.jsx';
import './analytics.css';

const sections=[['Обзор',SquaresFour],['SEO позиции',ChartLineUp],['Каталог',CarProfile],['Заявки',Tray],['Умный поиск',MagnifyingGlass],['Клиенты',UsersThree],['Интерес к контактам',ChatCircleText],['Посты соц сетей',InstagramLogo]];
const format=value=>new Intl.NumberFormat('ru-RU').format(value);
function Login({onSuccess}){
 const [password,setPassword]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');
 const submit=async event=>{
  event.preventDefault();setPending(true);setError('');
  try{
   const response=await fetch('/api/analytics/login',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
   const body=await response.json();
   if(!response.ok){setError(body.error==='too_many_requests'?'Слишком много попыток. Попробуйте позже.':body.error==='analytics_not_configured'?'Вход в аналитику ещё не настроен.':'Неверный пароль.');return;}
   onSuccess();
  }catch{setError('Не удалось войти. Попробуйте ещё раз.');}finally{setPending(false);}
 };
 return <main className="analytics-login page-width"><section className="analytics-login-card"><form onSubmit={submit}><label><span>Пароль</span><input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required autoFocus /></label>{error&&<p className="analytics-error" role="alert">{error}</p>}<button className="primary" disabled={pending||!password}>{pending?'Проверяем…':'Войти'}</button></form></section></main>;
}
export default function AbdriveAnalyticsPage(){
 const requestId=useRef(0);
 const [period,setPeriod]=useState('30'),[data,setData]=useState(null),[auth,setAuth]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[sources,setSources]=useState(['yandex','google']);
 useEffect(()=>{
  const controller=new AbortController();const id=++requestId.current;setError('');
  fetch(`/api/analytics/trend?period=${period}`,{credentials:'same-origin',cache:'no-store',signal:controller.signal}).then(async response=>{
   if(id!==requestId.current)return;
   if(response.status===401){setAuth(false);setData(null);return;}
   if(!response.ok)throw new Error('load_failed');
   const body=await response.json();if(id!==requestId.current)return;setData(body);setAuth(true);
  }).catch(e=>{if(e.name!=='AbortError'&&id===requestId.current)setError('Не удалось загрузить посещения. Попробуйте ещё раз.');});
  return ()=>controller.abort();
 },[period,refresh]);
 useEffect(()=>{
  if(!auth)return;
  const tick=()=>{if(document.visibilityState==='visible')setRefresh(value=>value+1);};
  const timer=setInterval(tick,60000);document.addEventListener('visibilitychange',tick);
  return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
 },[auth]);
 const logout=async()=>{
  ++requestId.current;
  try{const response=await fetch('/api/analytics/logout',{method:'POST',credentials:'same-origin'});if(!response.ok)throw new Error();setAuth(false);setData(null);}catch{setError('Не удалось выйти. Попробуйте ещё раз.');}
 };
 if(auth===false)return <Login onSuccess={()=>setRefresh(value=>value+1)}/>;
 const current=data?.period===period?data:null;
 const total=(current?.daily||[]).reduce((sum,day)=>sum+day.visits,0);
 return <main className="analytics-page abdrive-analytics"><header className="analytics-heading"><div><h1>Аналитика</h1><p>Посещения сайта ABDrive</p></div>{auth&&<button className="secondary analytics-logout" onClick={logout}><SignOut size={18}/> Выйти</button>}</header><div className="analytics-layout"><aside className="analytics-sidebar"><nav className="analytics-navigation" aria-label="Разделы аналитики">{sections.map(([label,Icon],index)=><button key={label} type="button" className={index===0?'active':''} aria-current={index===0?'page':undefined} disabled={index!==0} title={index!==0?'Пока недоступно':undefined}><Icon size={21} weight="duotone"/><span>{label}</span></button>)}</nav></aside><div className="analytics-content"><section className="analytics-panel analytics-trend"><div className="analytics-trend-heading"><h2>Посещения</h2><label className="abdrive-trend-period"><select aria-label="Период графика" value={period} onChange={event=>setPeriod(event.target.value)}>{['7','30','90'].map(days=><option key={days} value={days}>За {days} дней</option>)}</select></label><div className="analytics-trend-controls">{[['yandex','Яндекс'],['google','Google'],['chatgpt','ChatGPT']].map(([id,label])=><label key={id} className={`analytics-chart-source-toggle is-${id}`}><input type="checkbox" checked={sources.includes(id)} onChange={event=>setSources(value=>event.target.checked?[...value,id]:value.filter(item=>item!==id))}/><span>{label}</span></label>)}</div></div>{error?<p className="analytics-error" role="alert">{error} <button className="analytics-reset-button" onClick={()=>setRefresh(value=>value+1)}>Повторить</button></p>:current?<><p className="abdrive-visits-total"><strong>{format(total)}</strong> посещений за {period} дней</p><AnalyticsVisitsChart daily={current.daily} period={period} now={current.generatedAt} sources={sources}/>{total===0&&<p className="analytics-empty">Посещений пока нет. График заполнится по мере появления посетителей.</p>}</>:<p className="analytics-empty" role="status">Загружаем график…</p>}</section></div></div></main>;
}
