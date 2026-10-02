import {originForSource,inPhrase} from '../origin.js';
import {russianMoneyRange} from './ru-price-format.js';

// Group Russian payments into the same seven rows used by the shared vehicle card.
// Preserve every payment in the total; detailed amounts remain in its info tooltip.
export function russianPriceRows(car) {
 const offer=car?.offer;
 if(offer?.status!=='estimated')return [];
 const groups=[
  {ids:['purchase'],label:offer.rows.find(row=>row.id==='purchase')?.label},
  {ids:['payment'],label:'Выкуп и перевод',note:'Платёжный агент и комиссии банка. Ориентир 2%.'},
  {ids:['origin'],label:`Логистика ${inPhrase(car.origin||originForSource(car.source))}`},
  {ids:['sea','delivery'],label:'Доставка до Москвы'},
  {ids:['clearance'],label:'СВХ и оформление',note:'Брокер, СВХ, СБКТС и ЭПТС. Ориентировочная стоимость.'},
  {ids:['duty','excise','vat','customsFee','utilization'],label:'Растаможка и сборы',customs:true},
  {ids:['service'],label:'Подбор и сопровождение',note:'Ориентировочно. Точную сумму подтвердят для выбранного автомобиля.'},
 ];
 return groups.flatMap(group=>{
  const rows=offer.rows.filter(row=>group.ids.includes(row.id));
  if(!rows.length)return [];
  const min=rows.reduce((sum,row)=>sum+(row.minAmount??row.amount),0),max=rows.reduce((sum,row)=>sum+row.amount,0);
  const detail=rows.map(row=>`${row.label}: ${russianMoneyRange(row.minAmount??row.amount,row.amount)}.`).join(' ');
  return [{id:group.ids[0],label:group.label,value:`${group.ids[0]==='purchase'?'':'≈ '}${russianMoneyRange(min,max,{compact:true})}`,
   description:[group.note||detail,...(group.customs?['Для личного ввоза. Возраст, объём двигателя и мощность подтверждаются по документам.',...(offer.inputs?.icePower?.minKw<offer.inputs?.icePower?.maxKw?['Мощность ДВС — по подходящим модификациям.']:[]),...(offer.inputs?.motorPower?.method==='reference'?['Мощность электромоторов — по справочнику модификаций.']:(offer.range&&offer.inputs?.motorPower?.method==='unknown'?['Диапазон зависит от 30-минутной мощности электромоторов.']:[]))]:[])].join(' ')}];
 });
}
export function russianPriceNote(offer) {
 if(offer?.status==='estimated')return `Это не оферта. Курс ЦБ на ${offer.ratesDate.split('-').reverse().join('.')}; цену продавца, маршрут и таможенные параметры нужно подтвердить.`;
 return 'Для расчёта нужно уточнить данные автомобиля. Точную цену и наличие можно запросить ниже.';
}
