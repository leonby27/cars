import React from 'react';
import {siteFromPhrase} from '../origin.js';
export function RussianPriceDetails({car}) {
 const offer=car?.offer, estimated=offer?.status==='estimated';
 const rub=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(value)+' ₽';
 const missing={powertrain_documents_needed:'Для электромобилей и гибридов нужны тип силовой установки и мощность по документам. Пиковая мощность из объявления не заменяет эти данные при расчёте утильсбора.',engine_specs_missing:'В объявлении не хватает объёма или мощности двигателя для расчёта российских платежей.',source_price_missing:'В источнике не хватает цены автомобиля.',fob_quote_missing:'Нужно уточнить цену FOB и пункт передачи автомобиля.',rates_need_update:'Обновляем курс для расчёта в рублях.',rules_need_update:'Обновляем ставки российских платежей.',year_missing:'Нужно уточнить год выпуска автомобиля.'};
 return <aside className="price-breakdown-card" aria-label="Расчёт до Москвы"><div className="price-disclosure-content">
  <h2>Стоимость до Москвы</h2>
  {estimated?<>
   <p>Предварительно ≈ {rub(offer.totalAmount)}. Доставка и сопровождение рассчитаны по ориентировочным ставкам.</p>
   <dl className="market-cost-rows">{offer.rows.map(row=><div key={row.id}><dt>{row.label}</dt><dd>{rub(row.amount)}</dd></div>)}</dl>
   <p className="market-price-note">Курсы ЦБ на {offer.ratesDate.split('-').reverse().join('.')}. Итог округлён вверх до 10 000 ₽.</p>
   <details className="market-price-assumptions"><summary>Что учтено в расчёте</summary>{offer.assumptions.map(text=><p key={text}>{text}</p>)}</details>
  </>:<p>{missing[offer?.reason]||'Уточняем исходные данные для расчёта покупки, доставки и оформления в России.'}</p>}
  <p>До заказа партнёр подтверждает наличие, состояние, маршрут и подробную смету в рублях.</p>
 </div></aside>;
}
export function RussianServicePage({children}) {
 return <main><section className="hero"><h1>Автомобиль {siteFromPhrase()} — в Россию</h1><p className="page-width">Вы выбираете машину в каталоге ABDrive. Менеджер уточняет задачу и передаёт её партнёру; договор, проверку, оплату и доставку вы согласовываете с исполнителем.</p></section>{children}</main>;
}
export function RussianPrivacyPage() {
 const text=window.__boot?.privacyText;
 return <main className="simple-page page-width"><h1>{text?'Обработка персональных данных':'Страница не найдена'}</h1>{text&&<p style={{whiteSpace:'pre-line'}}>{text}</p>}</main>;
}
