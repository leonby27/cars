// Same public guide shape as ABCars, using only Russian delivered prices.
export function russianBrandGuide(brand,rows,index,now=new Date()) {
 const source=rows.filter(row=>row.brand===brand);if(!source.length)return null;
 const stats=values=>{
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  const percentile=p=>{if(!sorted.length)return null;const n=(sorted.length-1)*p,i=Math.floor(n);return Math.round(sorted[i]+(sorted[Math.ceil(n)]-sorted[i])*(n-i));};
  return {pricedCount:sorted.length,priceMin:sorted[0]??null,priceMax:sorted.at(-1)??null,priceP25:percentile(.25),priceMedian:percentile(.5),priceP75:percentile(.75)};
 };
 const budgets=Object.fromEntries(['under25','25to35','35to50','over50'].map(key=>[key,{count:0,models:[]}]));
 const models=source.map(({ids,...row})=>{
  const prices=ids.map(id=>index.prices.get(id)).filter(Number.isFinite);
  for(const [key,min,max] of [['under25',0,2500000],['25to35',2500000,3500000],['35to50',3500000,5000000],['over50',5000000,Infinity]]){
   const count=prices.filter(price=>price>=min&&price<max).length;if(count){budgets[key].count+=count;budgets[key].models.push(row.model);}
  }
  return {...row,...stats(prices)};
 }).sort((a,b)=>b.count-a.count||a.model.localeCompare(b.model));
 return {brand,calculatedAt:now.toISOString(),total:source.reduce((n,row)=>n+row.count,0),modelCount:models.length,yearMin:Math.min(...models.map(row=>row.yearMin).filter(Boolean)),yearMax:Math.max(...models.map(row=>row.yearMax).filter(Boolean)),...stats(source.flatMap(row=>row.ids.map(id=>index.prices.get(id)))),models,budgets};
}
