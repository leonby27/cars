import {listingNumber} from "../listing-id.js";
import {SITE} from '../site-profile.js';
import {siteFromPhrase} from '../origin.js';
import {purchaseQuestions} from '../abdrive/faq.js';
export const IS_RU = SITE.market === 'RU';
// This is a display adapter, never a Belarus calculation converted to RUB.
export const marketEstimate = car => ({totalUsd:null, offer:car?.offer || null});
export const RU_FAQ = purchaseQuestions;
export const RU_FAQ_LEAD = `ABDrive — каталог автомобилей ${siteFromPhrase()} для покупателей в России. Помогаем выбрать машину и согласовать условия покупки с партнёром. Базовый город доставки — Москва.`;
export const RU_ORDER_STEPS = [
 {number:'01',title:'Выбираете автомобиль',description:'Характеристики, фотографии и требования к машине.'},
 {number:'02',title:'Уточняем условия',description:'Партнёр подтверждает наличие и порядок проверки.'},
 {number:'03',title:'Согласовываете смету',description:'Расчёт до Москвы и условия договора с исполнителем.'},
 {number:'04',title:'Получаете автомобиль',description:'Покупка, доставка и оформление по согласованным условиям.'},
];
export function ruPageSeo(path, {car=null, landing=null, search=''}={}) {
 const titles={'/':`Автомобили ${siteFromPhrase()} в Россию`, '/catalog':`Каталог автомобилей ${siteFromPhrase()}`, '/how-it-works':'Как заказать автомобиль в Россию', '/faq':'Вопросы о покупке автомобиля', '/favorites':'Избранные автомобили','/searches':'Мои поиски','/privacy':'Обработка персональных данных'};
 const label=car?.title || (landing ? [landing.brand,landing.model].filter(Boolean).join(' ') || landing.name : '') || titles[path] || 'Каталог автомобилей';
 return {title:`${label} — ABDrive`,description:`Автомобили ${siteFromPhrase()} для покупателей в России. Фотографии, характеристики и согласование условий доставки до Москвы.`, canonical:SITE.origin+(car?'/cars/'+encodeURIComponent(listingNumber(car.id)):path), indexable:Boolean(titles[path]||landing)&&!search&&!car&&!['/favorites','/searches','/privacy'].includes(path)};
}
