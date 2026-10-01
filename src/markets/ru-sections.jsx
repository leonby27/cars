import React from 'react';
import {siteFromPhrase} from '../origin.js';
export function RussianPriceDetails() {
 return <aside className="price-breakdown-card" aria-label="Расчёт до Москвы"><div className="price-disclosure-content"><h2>Стоимость до Москвы</h2><p>Итоговую сумму согласовывают для конкретного автомобиля: покупка, доставка, оформление и услуги исполнителя.</p><p>До заказа партнёр подтверждает наличие, состояние, маршрут и подробную смету в рублях.</p></div></aside>;
}
export function RussianServicePage({children}) {
 return <main><section className="hero"><h1>Автомобиль {siteFromPhrase()} — в Россию</h1><p className="page-width">Вы выбираете машину в каталоге ABDrive. Менеджер уточняет задачу и передаёт её партнёру; договор, проверку, оплату и доставку вы согласовываете с исполнителем.</p></section>{children}</main>;
}
export function RussianPrivacyPage() {
 const text=window.__boot?.privacyText;
 return <main className="simple-page page-width"><h1>{text?'Обработка персональных данных':'Страница не найдена'}</h1>{text&&<p style={{whiteSpace:'pre-line'}}>{text}</p>}</main>;
}
