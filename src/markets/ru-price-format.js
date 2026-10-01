const rub = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:0});
const millions = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:2});
export function russianMoneyRange(min,max,{compact=false}={}) {
 if(min===max)return `${rub.format(max)} ₽`;
 if(compact&&min>=1000000)return `${millions.format(min/1000000)}–${millions.format(max/1000000)} млн ₽`;
 return `${rub.format(min)}–${rub.format(max)} ₽`;
}
export function russianOfferPrice(offer,{compact=true}={}) {
 if(offer?.status!=='estimated')return 'Расчёт уточняется';
 return `≈ ${offer.range?russianMoneyRange(offer.range.min,offer.range.max,{compact}):russianMoneyRange(offer.totalAmount,offer.totalAmount)}`;
}
