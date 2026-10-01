import React, {useRef,useState} from 'react';
import {StripPhoto} from '../strip-photo.jsx';
import {EmptyState} from '../empty-state.jsx';
import {vehiclePhotoHref} from '../photo-source.js';
import {fromPhrase,siteFromPhrase,countryName} from '../origin.js';
import {Gallery} from './Gallery.jsx';
import {purchaseQuestions} from './faq.js';
import {normalizeRussianPhone} from '../markets/contact.js';

const number=value=>new Intl.NumberFormat('ru-RU').format(value);
const mileageText=value=>value==null?'Пробег не указан':number(value)+' км';
const route=car=>'/cars/'+encodeURIComponent(car.id);
const photo=url=>vehiclePhotoHref(url,600,{mirrorOrigin:'https://abcars.by'});

function Price({offer}){
 return <div className="ab-price"><strong>{offer?.status==='estimated'?number(offer.totalAmount)+' ₽':'Стоимость по запросу'}</strong><span>С доставкой до Москвы</span></div>;
}
function CarCard({car}){
 return <article className="ab-card"><a href={route(car)} className="ab-car-link">
  {car.images?.[0]?<StripPhoto src={photo(car.images[0])} first alt={car.title}/>:<div className="ab-no-photo">Фото уточняется</div>}
  <div className="ab-card-body"><p className="ab-eyebrow">Автомобиль {fromPhrase(car.origin)}</p><h2>{car.title}</h2>
   <p className="ab-facts">{mileageText(car.mileage)} · {car.type}{car.drive?' · '+car.drive:''}</p><Price offer={car.offer}/>
  </div></a></article>;
}
function LeadForm({car,enabled}){
 const [state,setState]=useState('idle');const [error,setError]=useState('');const submission=useRef(null);
 if(!enabled)return null;
 async function submit(event){
  event.preventDefault();const form=event.currentTarget;const values=Object.fromEntries(new FormData(form));
  const phone=normalizeRussianPhone(values.phone);if(!phone){setError('Проверьте номер телефона. Например, +7 999 123-45-67.');return;}
  const payload={name:values.name,phone,comment:values.comment||'',consent:values.consent==='on',listingId:car?.id||null,destinationId:'moscow'};
  const fingerprint=JSON.stringify(payload);
  if(submission.current?.fingerprint!==fingerprint)submission.current={fingerprint,key:crypto.randomUUID()};
  setState('sending');setError('');
  try{
   const response=await fetch('/api/leads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,requestKey:submission.current.key}),signal:AbortSignal.timeout(15000)});
   const data=await response.json();
   if(!response.ok){
    const messages={listing_unavailable:'Объявление больше недоступно. Выберите другой автомобиль.',too_many_requests:'Заявок слишком много. Попробуйте позднее.',lead_intake_not_configured:'Сейчас не удалось принять заявку. Попробуйте позднее.'};
    const failure=new Error(messages[data.error]||'Не удалось отправить заявку. Проверьте данные и повторите.');failure.userMessage=true;throw failure;
   }
   setState('sent');
  }catch(problem){setState('idle');setError(problem.name==='TimeoutError'?'Ответ задерживается. Повторите отправку — повторная заявка не создастся.':problem.userMessage?problem.message:'Ошибка связи. Попробуйте ещё раз.');}
 }
 return <section className="ab-panel ab-lead" id="request"><h2>{car?'Уточнить цену и наличие':'Подобрать автомобиль'}</h2>
  {state==='sent'?<div role="status"><h3>Заявка принята</h3><p>Менеджер свяжется с вами, уточнит задачу и передаст её подходящему партнёру.</p></div>:
   <form onSubmit={submit}><p>Оставьте контакт. Наличие, итоговую стоимость и условия покупки подтвердят перед заказом.</p>
    <label>Ваше имя<input name="name" required maxLength={100} autoComplete="name"/></label>
    <label>Телефон<input name="phone" type="tel" required maxLength={24} autoComplete="tel" placeholder="+7 999 123-45-67"/></label>
    <label>Пожелания<textarea name="comment" maxLength={2000} rows={3} placeholder="Модель, бюджет, комплектация или вопрос об автомобиле"/></label>
    <label className="ab-consent"><input type="checkbox" name="consent" required/> <span>Согласен на обработку данных для ответа на заявку и её передачи партнёру на условиях <a href="/privacy">политики конфиденциальности</a>.</span></label>
    {error?<p role="alert" className="ab-error">{error}</p>:null}<button disabled={state==='sending'}>{state==='sending'?'Отправляем…':'Отправить заявку'}</button>
   </form>}
 </section>;
}
function Filters({params,brands,models}){
 return <form action="/catalog" method="get" className="ab-filters">
  <label className="ab-search">Поиск<input name="q" defaultValue={params.q||''} placeholder="Марка или модель"/></label>
  <label>Марка<select name="brand" defaultValue={params.brand||''} onChange={event=>{const form=event.currentTarget.form;form.elements.model.value='';form.requestSubmit();}}><option value="">Все марки</option>{brands.map(item=><option key={item.brand} value={item.brand}>{item.brand}</option>)}</select></label>
  <label>Модель<select name="model" defaultValue={params.model||''} disabled={!params.brand}><option value="">{params.brand?'Все модели':'Сначала выберите марку'}</option>{models.map(item=><option key={item.model} value={item.model}>{item.model}</option>)}</select></label>
  <label>Страна<select name="country" defaultValue={params.country||''}><option value="">Все страны</option><option value="china">{countryName("china")}</option><option value="korea">{countryName("korea")}</option></select></label>
  <label>Тип двигателя<select name="type" defaultValue={params.type||''}><option value="">Все типы</option>{['ДВС','Гибрид','Электромобиль'].map(type=><option key={type}>{type}</option>)}</select></label>
  <label>Год от<input name="yearMin" type="number" min="1990" max="2100" defaultValue={params.yearMin||''}/></label>
  <label>Год до<input name="yearMax" type="number" min="1990" max="2100" defaultValue={params.yearMax||''}/></label>
  <label>Пробег до, км<input name="mileageMax" type="number" min="0" max="1000000" step="1000" defaultValue={params.mileageMax||''}/></label>
  <label>Порядок<select name="sort" defaultValue={params.sort||'newest'}><option value="newest">Новые объявления</option><option value="year_desc">Свежее год выпуска</option><option value="mileage_asc">Меньше пробег</option></select></label>
  <button type="submit">Показать</button><a href="/catalog" className="ab-reset">Сбросить</a>
 </form>;
}
function Process(){
 return <section className="ab-process" id="how-it-works"><h2>От выбора до покупки</h2><div className="ab-steps">
  <article><span>01</span><h3>Выберите автомобиль</h3><p>Сравните характеристики и фотографии объявлений {siteFromPhrase()}.</p></article>
  <article><span>02</span><h3>Уточните условия</h3><p>Менеджер согласует с партнёром наличие, проверку, расчёт до Москвы и сроки.</p></article>
  <article><span>03</span><h3>Обсудите заказ с партнёром</h3><p>Договор, оплату и доставку согласовывают с исполнителем. Условия фиксируются до покупки.</p></article>
 </div></section>;
}
function Questions(){
 return <section className="ab-questions"><h2>Вопросы о покупке</h2>{purchaseQuestions.map(item=><details key={item.id} id={item.id}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>;
}
function CarPage({car,leadEnabled}){
 const facts=car.facts?.length?car.facts:[{label:'Год выпуска',value:car.year},{label:'Пробег',value:mileageText(car.mileage)},{label:'Двигатель',value:car.type}].filter(item=>item.value);
 const checkedDate=car.checkedAt?new Date(car.checkedAt):null;
 const checkedText=checkedDate&&!Number.isNaN(checkedDate.getTime())?checkedDate.toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}):null;
 return <><nav className="ab-breadcrumb"><a href="/catalog">Каталог</a> / <a href={'/catalog?'+new URLSearchParams({brand:car.brand})}>{car.brand}</a> / <a href={'/catalog?'+new URLSearchParams({brand:car.brand,model:car.model})}>{car.model}</a></nav><h1>{car.title}</h1>
  <div className="ab-car-layout"><div><Gallery images={car.images} title={car.title}/>
   <section className="ab-panel"><h2>Об автомобиле</h2><dl>{facts.map(({label,value})=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="ab-facts-note">Характеристики указаны по данным объявления. Комплектацию и состояние конкретного автомобиля нужно подтвердить перед покупкой.</p></section></div>
   <aside><section className="ab-panel"><p className="ab-eyebrow">Автомобиль {fromPhrase(car.origin)}</p><Price offer={car.offer}/><p>Цена до Москвы рассчитывается для конкретной машины. В расчёте нужно учесть покупку, доставку, оформление и услуги исполнителя.</p><p className="ab-muted">{checkedText?<>Данные обновлены <time dateTime={checkedDate.toISOString()}>{checkedText} МСК</time>. </>:null}Объявление не является подтверждением наличия. Его проверят у продавца перед заказом.</p>{leadEnabled?<a href="#request" className="ab-button">Уточнить цену и наличие</a>:null}</section><LeadForm car={car} enabled={leadEnabled}/></aside>
  </div><Process/></>;
}
export function AbdriveApp({boot}){
 const {kind='catalog',data,params={},brands=[],models=[],car,leadEnabled=false}=boot;
 const nextParams=new URLSearchParams(params);nextParams.set('page',String((data?.page||1)+1));
 const prevParams=new URLSearchParams(params);prevParams.set('page',String(Math.max(1,(data?.page||1)-1)));
 return <><header className="ab-header"><a href="/" className="ab-logo" aria-label="ABDrive — главная">AB<span>Drive</span></a><nav><a href="/catalog">Каталог</a><a href="/how-it-works">Как купить</a>{leadEnabled?<a href="/#request">Подбор</a>:null}</nav><span className="ab-destination">Доставка до Москвы · ₽</span></header>
  <main className="ab-main">{kind==='notFound'?<EmptyState title="Страница не найдена" description="Возможно, объявление больше недоступно."><a href="/catalog">Перейти в каталог</a></EmptyState>:
   kind==='car'?<CarPage car={car} leadEnabled={leadEnabled}/>:
   kind==='privacy'?<section className="ab-panel ab-document"><h1>Обработка персональных данных</h1><p>{boot.privacyText}</p></section>:
   kind==='faq'?<><h1>Покупка автомобиля в Россию: вопросы и ответы</h1><Questions/><a className="ab-button" href="/catalog">Выбрать автомобиль</a></>:
   kind==='process'?<><h1>Как заказать автомобиль через ABDrive</h1><p className="ab-intro">ABDrive помогает найти автомобиль и передать запрос партнёру, который уточнит условия покупки и доставки в Россию.</p><Process/><Questions/><LeadForm enabled={leadEnabled}/></>:
   <><section className={kind==='home'?'ab-hero':'ab-catalog-heading'}><p className="ab-eyebrow">Каталог для покупателей в России</p><h1>Автомобили {siteFromPhrase()}</h1><p>Выберите машину. Уточните стоимость и условия доставки до Москвы.</p></section>
    <Filters params={params} brands={brands} models={models}/>
    {data?<><p className="ab-results">{number(data.total)} объявлений{data.page>1?' · Страница '+data.page:''}</p>{data.cars.length?<div className="ab-grid">{data.cars.map(item=><CarCard key={item.id} car={item}/>)}</div>:<EmptyState title="По этим условиям машин нет" description="Попробуйте убрать часть фильтров."><a href="/catalog">Сбросить фильтры</a></EmptyState>}
      <nav className="ab-pagination" aria-label="Страницы каталога">{data.page>1?<a href={'/catalog?'+prevParams}>← Назад</a>:null}{data.hasMore?<a href={'/catalog?'+nextParams}>Следующая страница →</a>:null}</nav></>:
     <EmptyState title={boot.filterError?'Проверьте параметры поиска':'Каталог временно недоступен'} description={boot.filterError?'Проверьте годы и пробег или сбросьте фильтры. Поиск по цене пока недоступен.':'Не удалось загрузить объявления. Попробуйте обновить страницу.'}><a href="/catalog">{boot.filterError?'Сбросить фильтры':'Повторить'}</a></EmptyState>}
    {kind==='home'?<><Process/><Questions/><LeadForm enabled={leadEnabled}/></>:null}</>}
  </main><footer className="ab-footer"><a href="/" className="ab-logo">AB<span>Drive</span></a><p>Автомобили {siteFromPhrase()} для покупателей в России.</p><p>Москва — базовый город расчёта доставки.</p><a className="ab-faq-link" href="/faq">Вопросы о покупке</a>{leadEnabled?<a href="/privacy">Обработка персональных данных</a>:null}</footer>
 </>;
}
