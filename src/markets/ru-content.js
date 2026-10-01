// Russian editorial adaptation. Technical material stays shared; statements about
// import cost, registration, warranty and Belarus-only benefits are replaced.
import {russianWording} from './ru-editorial.js';
const duty='При личном ввозе автомобиля с ДВС младше трёх лет пошлина зависит от стоимости и объёма двигателя; для машин от трёх до пяти лет и старше пяти лет действуют разные ставки за кубический сантиметр. Дополнительно уплачиваются таможенный и российский утилизационный сборы.';
const electricDuty='Для электромобилей и последовательных гибридов в России учитываются пошлина 15%, акциз, НДС 22%, таможенный и утилизационный сборы. Для гибридов с приводом колёс от ДВС действуют ставки автомобилей с ДВС.';
const delivery='Маршрут и ориентировочный срок до Москвы указаны в карточке автомобиля; срок подтверждают после проверки продавца, документов и перевозчика.';
const price='Актуальная предварительная цена до Москвы и её состав показаны в карточке автомобиля.';
const service='Возможность обслуживания и поставки запчастей нужно проверить для китайской комплектации. Условия гарантии продавца и исполнителя фиксируют в договоре; наличие дилера марки в России само по себе не означает гарантию на параллельно ввезённый автомобиль.';
export function russianEditorialText(value) {
 if(typeof value==='string') {
  const prepared=value
   .replace(/В Беларуси таких станций (?:мало|немного), (?:поэтому|но)/g,'На станции меньшей мощности')
   .replace('На станции меньшей мощности большую часть времени машина заряжается как любой другой электромобиль.','На станции меньшей мощности скорость зарядки ограничена возможностями оборудования.')
   .replace('На станции меньшей мощности на обычной быстрой зарядке','На обычной быстрой зарядке')
   .replace(/В Беларуси (?:модель|машину|его) (?:продают|продаётся) официально (?:как |под именем |под этим же именем, )/g,'Модель известна под именем ')
   .replace('В Беларуси модель знакома по официальным продажам.','')
   .replace('В Беларуси первое поколение известно как','Первое поколение известно как')
   .replace('Имя знакомо и белорусским дорогам: прежние поколения здесь собирались и продавались.','')
   .replace('Модель хорошо знакома белорусским покупателям по машинам с других рынков.','Версии для разных рынков могут отличаться комплектацией.')
   .replace('Для Беларуси схема удобная:','Схема удобна при домашней зарядке:');
  const sentences=prepared.replace(' — то есть машина из этого раздела не подорожает при оформлении вдвое','').split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z])/u).map(sentence=>{
   if(/\/catalog\/(?:petrol-)?under-/.test(sentence))return 'Сравните доступные автомобили по полной стоимости до Москвы в [каталоге](/catalog).';
   if(/нулев.*(?:ставк|пошлин)|(?:ставк|пошлин).*нулев|без пошлин|беспошлин|НДС\s*20|38\s*%|квот|указ\s*№?\s*140|льгот.*ввоз|(?:гибрид|электромобил).*льгот.*(?:не получает|нет)/i.test(sentence))return /электромоб|генератор|последовательн|НДС/i.test(sentence)?electricDuty:duty;
   if(/(?:Минск|Беларус)/i.test(sentence)&&/(?:доллар|\$|евро|€|тысяч|около \d)/i.test(sentence))return price;
   if(/(?:достав|выкуп|выдач|в пути|привоз|Из Кореи)/i.test(sentence)&&/\d+\s*[–—-]\s*\d+\s*дн|через Казахстан и Россию/i.test(sentence))return delivery;
   if(/(?:Беларус|белорус|Минск)/i.test(sentence)&&/гарант|дилер|сервис|обслуживан/i.test(sentence))return service;
   return russianWording(sentence).replaceAll('по Беларуси','по России').replaceAll('белорусским','российским').replaceAll('белорусских','российских').replaceAll('белорусский','российский').replaceAll('белорусской','российской');
  });
  return [...new Set(sentences)].join(' ');
 }
 if(Array.isArray(value))return value.map(russianEditorialText);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['q','title'].includes(key)&&typeof item==='string'?russianWording(item).replaceAll('для Беларуси','для России').replaceAll('белорусской зимы','зимней езды'):russianEditorialText(item)]));
 return value;
}
export function russianModelText(source) {
 const result=russianEditorialText(source);
 // Preserve the source's section structure, but remove duplicate adapted sentences
 // within each paragraph group instead of adding another boilerplate block.
 for(const section of result.sections||[])if(section.paragraphs)section.paragraphs=[...new Set(section.paragraphs)];
 return result;
}
