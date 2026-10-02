import {findBlogPost} from '../blog-posts.js';
import {findToolPage} from '../tool-pages.js';
import {listingNumber} from "../listing-id.js";
import {SITE} from '../site-profile.js';
import {siteFromPhrase} from '../origin.js';
import {purchaseQuestions} from '../abdrive/faq.js';
import {RU_SERVICE_FAQ_GROUPS} from './ru-service-copy.js';
export const IS_RU = SITE.market === 'RU';
// This is a display adapter, never a Belarus calculation converted to RUB.
export const marketEstimate = car => ({totalUsd:null, offer:car?.offer || null});
export const RU_FAQ = purchaseQuestions;
export const RU_FAQ_LEAD = `ABDrive — сервис подбора и расчёта автомобилей ${siteFromPhrase()} в Россию. Коротко объясняем, как выбрать и проверить автомобиль, из чего складывается цена до Москвы и как проходит доставка.`;
export const RU_ORDER_STEPS = [
 {number:'01',title:'Опишите задачу',description:'Бюджет, тип машины и обязательные опции.'},
 {number:'02',title:'Выберите объявление',description:'Сравните комплектацию и исходные данные.'},
 {number:'03',title:'Получите расчёт',description:'Проверьте состав расходов до Москвы.'},
 {number:'04',title:'Согласуйте заказ',description:'Исполнитель, договор и график платежей.'},
];
export const RU_FAQ_GROUPS = RU_SERVICE_FAQ_GROUPS;
export function ruPageSeo(path, {car=null, landing=null, search=''}={}) {
 const titles={'/':`Автомобили ${siteFromPhrase()} в Россию`, '/models':'Модели авто в каталоге ABDrive — комплектации и цены', '/catalog':`Каталог автомобилей ${siteFromPhrase()}`, '/how-it-works':'Порядок заказа автомобиля в ABDrive', '/faq':'Вопросы перед заказом автомобиля', '/tracking':'Статус доставки автомобиля до Москвы','/contacts':'Контакты ABDrive','/favorites':'Избранные автомобили','/searches':'Мои поиски','/privacy':'Обработка персональных данных','/account':'Личный кабинет','/login':'Вход','/register':'Регистрация','/analytics':'Аналитика'};
 const post=findBlogPost(path);
 if(post||path==='/blog')return {title:post?.seoTitle||'Журнал ABDrive',description:post?.seoDescription||`Всё об автомобилях ${siteFromPhrase()}: подборки, сравнения и статьи.`,canonical:SITE.origin+path,indexable:!search};
 const tool=findToolPage(path);
 if(tool) return {title:tool.seoTitle,description:tool.seoDescription,canonical:SITE.origin+path,indexable:!search};
 if(landing?.kind==='model')return {title:landing.seoTitle||`${landing.brand} ${landing.model} — ABDrive`,description:landing.seoDescription||`Предложения ${landing.brand} ${landing.model} с предварительным расчётом до Москвы.`,canonical:SITE.origin+landing.path,indexable:!search&&Boolean(landing.inCatalog)};
 const label=car?.title || (landing ? [landing.brand,landing.model].filter(Boolean).join(' ') || landing.name : '') || titles[path] || 'Каталог автомобилей';
 const description=path==='/how-it-works'
  ? 'От выбранного объявления до получения в Москве: проверка исходных данных, согласование расчёта и условий, затем выкуп и перевозка партнёром.'
  : path==='/models'
   ? 'Сравнивайте модели по комплектациям и предложениям в каталоге. Итоговую стоимость до Москвы проверяйте по данным конкретного автомобиля.'
   : path==='/faq'
    ? 'Ответы ABDrive о проверке объявления, расчёте расходов, договоре и доставке автомобиля в Россию.'
    : `Сравните объявления ${siteFromPhrase()}, проверьте характеристики выбранного автомобиля и запросите подтверждение цены и условий доставки до Москвы.`;
 return {title:`${label} — ABDrive`,description, canonical:SITE.origin+(car?'/cars/'+encodeURIComponent(listingNumber(car.id)):path), indexable:Boolean(titles[path]||landing)&&!search&&!car&&!['/favorites','/searches','/privacy','/account','/login','/register','/analytics'].includes(path)};
}
