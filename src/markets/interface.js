import {findBlogPost} from '../blog-posts.js';
import {findToolPage} from '../tool-pages.js';
import {listingNumber} from "../listing-id.js";
import {SITE} from '../site-profile.js';
import {siteFromPhrase} from '../origin.js';
import {purchaseQuestions} from '../abdrive/faq.js';
export const IS_RU = SITE.market === 'RU';
// This is a display adapter, never a Belarus calculation converted to RUB.
export const marketEstimate = car => ({totalUsd:null, offer:car?.offer || null});
export const RU_FAQ = purchaseQuestions;
export const RU_FAQ_LEAD = `ABDrive — сервис подбора и расчёта автомобилей ${siteFromPhrase()} в Россию. Коротко объясняем, как выбрать и проверить автомобиль, из чего складывается цена до Москвы и как проходит доставка.`;
export const RU_ORDER_STEPS = [
 {number:'01',title:'Уточняем задачу',description:'Под заказ: бюджет и требования.'},
 {number:'02',title:'Проверяем б/у авто',description:'Сверяем VIN и состояние.'},
 {number:'03',title:'Согласовываем смету',description:'Цена с доставкой до Москвы.'},
 {number:'04',title:'Машина едет в Москву',description:'Доставка и оформление.'},
];
export function ruPageSeo(path, {car=null, landing=null, search=''}={}) {
 const titles={'/':`Автомобили ${siteFromPhrase()} в Россию`, '/models':'Модели авто из Китая и Кореи — обзоры, версии и цены', '/catalog':`Каталог автомобилей ${siteFromPhrase()}`, '/how-it-works':'Как заказать автомобиль в Россию', '/faq':'Вопросы о покупке автомобиля', '/favorites':'Избранные автомобили','/searches':'Мои поиски','/privacy':'Обработка персональных данных','/account':'Личный кабинет','/login':'Вход','/register':'Регистрация'};
 const post=findBlogPost(path);
 if(post||path==='/blog')return {title:post?.seoTitle||'Журнал ABDrive',description:post?.seoDescription||`Всё об автомобилях ${siteFromPhrase()}: подборки, сравнения и статьи.`,canonical:SITE.origin+path,indexable:!search};
 const tool=findToolPage(path);
 if(tool) return {title:tool.seoTitle,description:tool.seoDescription,canonical:SITE.origin+path,indexable:!search};
 const label=car?.title || (landing ? [landing.brand,landing.model].filter(Boolean).join(' ') || landing.name : '') || titles[path] || 'Каталог автомобилей';
 return {title:`${label} — ABDrive`,description:`Автомобили ${siteFromPhrase()} для покупателей в России. Фотографии, характеристики и согласование условий доставки до Москвы.`, canonical:SITE.origin+(car?'/cars/'+encodeURIComponent(listingNumber(car.id)):path), indexable:Boolean(titles[path]||landing)&&!search&&!car&&!['/favorites','/searches','/privacy','/account','/login','/register'].includes(path)};
}
