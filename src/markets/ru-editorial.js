// Only destination/brand wording. Legal, prices and local service claims are edited
// explicitly in each Russian article; never convert Belarus amounts by replacing a currency.
export function russianWording(value) {
 if(typeof value==='string') return value.replaceAll('abcars.by','abdrive.ru').replaceAll('ABCars','ABDrive').replaceAll('Абкарс','ABDrive')
  .replaceAll('до Минска','до Москвы').replaceAll('в Минске','в Москве').replaceAll('в Минск','в Москву')
  .replaceAll('по Беларуси','по России').replaceAll('Из Минска','Из Москвы').replaceAll('из Минска','из Москвы').replaceAll('В Минске','В Москве').replaceAll('из Беларуси','из России').replaceAll('в Беларуси','в России').replaceAll('в Беларусь','в Россию').replaceAll('на Беларусь','на Россию').replaceAll('с Беларусью','с Россией');
 if(Array.isArray(value))return value.map(russianWording);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,russianWording(item)]));
 return value;
}
export const RU_BLOG_SLUGS=['range-cycles','home-charging','ev-tyres-suspension','electric-suv-600','which-china-suv','ev-winter-belarus','long-wheelbase-china','used-ev-worth-it','xiaomi-su7-vs-tesla-model-3','audi-from-china','volkswagen-from-china','bmw-from-china','mercedes-from-china','almost-new','acceleration-under-4','electric-range-700','suv-under-20000','paying-to-china','petrol-duty-age','electric-vs-petrol','transport-tax','util-fee','charging-belarus','registration-belarus'];
export function russianPost(post) {
 const result=russianWording(post);
 if(post.slug==='ev-winter-belarus')Object.assign(result,{slug:'ev-winter',name:'Электромобиль зимой в России',h1:'Электромобиль зимой в России',seoTitle:'Электромобиль зимой в России: запас хода и зарядка | ABDrive',seoDescription:'Как мороз влияет на запас хода и зарядку электромобиля: батареи, отопление, прогрев и расчёт дальности для своей температуры.',lead:'Что происходит с запасом хода на морозе и как сохранить зимние километры.'});
 if(post.slug==='registration-belarus')Object.assign(result,{slug:'registration-russia',name:'Постановка на учёт машины из Китая в России',h1:'Постановка на учёт машины из Китая в России',seoTitle:'Регистрация автомобиля из Китая в России | ABDrive',seoDescription:'Документы, ЭПТС, осмотр и порядок постановки ввезённого автомобиля на учёт в России.'});
 if(post.slug==='charging-belarus')Object.assign(result,{slug:'charging-russia',name:'Где заряжаться в России',h1:'Где заряжать электромобиль в России',seoTitle:'Зарядные станции в России: поиск, разъёмы и поездки | ABDrive',seoDescription:'Как найти подходящую зарядку в России, проверить разъём и спланировать дальнюю поездку.'});
 if(post.slug==='suv-under-20000')Object.assign(result,{slug:'suv-under-2000000-rub',name:'Топ 10 кроссоверов до 2 000 000 ₽',h1:'Топ 10 кроссоверов из Китая и Кореи до 2 000 000 ₽',seoTitle:'Кроссоверы до 2 млн рублей с доставкой до Москвы | ABDrive',seoDescription:'Реальные автомобили из каталога с предварительной ценой до Москвы в пределах 2 млн рублей.',lead:'Кроссоверы в бюджете до двух миллионов рублей с доставкой и оформлением.',filters:{...post.filters,landedMax:2000000}});
 return {...result,sourceSlug:post.slug};
}

export const RU_BLOG_REDIRECTS=Object.freeze({'/blog/ev-winter-belarus':'/blog/ev-winter','/blog/registration-belarus':'/blog/registration-russia','/blog/charging-belarus':'/blog/charging-russia','/blog/suv-under-20000':'/blog/suv-under-2000000-rub'});
export function russianArticleLinks(value){
 if(typeof value==='string'){for(const [from,to] of Object.entries(RU_BLOG_REDIRECTS))value=value.replaceAll(']('+from+')',']('+to+')');return value;}
 if(Array.isArray(value))return value.map(russianArticleLinks);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,russianArticleLinks(item)]));return value;
}
