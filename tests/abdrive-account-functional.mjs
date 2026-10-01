// Functional form/network checks only. No screenshots or appearance review.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.ABDRIVE_TEST_URL||'http://127.0.0.1:8989';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const browser=await chromium.launch({headless:true});
try {
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport});const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Avoid external media in form tests; vehicle facts and every site API stay real.
  await page.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
  const password='local-functional-test-password';
  const phone='+7999'+String(Date.now()).slice(-7);
  try{
   await page.goto(base+'/cars/59371787',{waitUntil:'domcontentloaded'});
   await page.waitForResponse(response=>response.url().endsWith('/api/auth/me')&&response.ok());
   const card=page.locator('.detail-sidebar');
   assert.equal(await card.locator('.price-breakdown .facts-row').count(),7);
   assert.equal(await card.locator('.market-cost-rows').count(),0);
   await card.getByRole('button',{name:/Срок доставки до Москвы/}).click();
   assert.equal(await card.locator('.delivery-card-heading').getAttribute('aria-expanded'),'true');
   assert.match(await card.locator('.delivery-stages').textContent(),/Маршрут\sдо\sМосквы/);
   await card.locator('.report-order-cta').click();
   const form=page.locator('.availability-lead-modal');await form.waitFor();
   await form.getByLabel('Имя',{exact:true}).fill('Проверка кабинета');
   await form.getByLabel('Телефон',{exact:true}).fill(phone);
   await form.getByLabel('Заодно создать аккаунт').check();
   await form.getByLabel('Пароль',{exact:true}).fill(password);
   await form.getByLabel('Ещё раз пароль',{exact:true}).fill(password);
   await form.getByRole('checkbox',{name:/Согласен на обработку данных/}).check();
   await form.getByRole('button',{name:'Получить точную цену'}).click();
   await card.locator('.report-order-cta.ordered-cta').waitFor();
   const accepted=await context.request.get(base+'/api/account/orders');
   const order=(await accepted.json()).orders[0];assert.equal(order.availabilityStatus,'requested');assert.match(order.orderNumber,/^AD-/);
   // Close success message before opening account.
   const close=page.getByRole('button',{name:'Закрыть',exact:true});if(await close.count())await close.last().click();
   await card.locator('.report-order-cta.ordered-cta').click();
   await page.waitForURL('**/account');await page.locator('.customer-order').waitFor();
   assert.match(await page.locator('.customer-order-car-price').textContent(),/₽|млн/);
   assert.doesNotMatch(await page.locator('.account-page').textContent(),/Минск|Беларус|BYN/);
   await page.reload({waitUntil:'domcontentloaded'});await page.locator('.customer-order').waitFor();
   await page.getByRole('button',{name:'Личные данные',exact:true}).click();
   await page.getByLabel('Город',{exact:true}).fill('Москва');
   await page.getByRole('button',{name:'Сохранить изменения'}).click();
   await page.getByText('Данные сохранены',{exact:true}).waitFor();
   assert.equal((await (await context.request.get(base+'/api/auth/me')).json()).user.city,'Москва');
   await page.goto(base+'/cars/59371787',{waitUntil:'domcontentloaded'});
   await page.waitForResponse(response=>response.url().endsWith('/api/account/favorites')&&response.ok());
   await page.locator('.detail-actions').getByRole('button',{name:'Добавить в избранное',exact:true}).click();
   await page.getByRole('button',{name:'Избранное',exact:true}).click();
   await page.waitForURL('**/favorites');await page.locator('.car-row').first().waitFor();
   await page.goto(base+'/catalog?brand=BMW',{waitUntil:'domcontentloaded'});
   await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/account/searches')&&response.request().method()==='POST'&&response.ok()),page.getByRole('button',{name:'Сохранить поиск',exact:true}).click()]);
   await page.goto(base+'/searches',{waitUntil:'domcontentloaded'});await page.locator('.saved-search-card').first().waitFor();
   assert.deepEqual(errors,[]);
   console.log(viewport.width+'px: card rows, delivery, registration from CTA, order, session reload, profile, favorites and saved search passed');
  }finally{
   // Synthetic local account and its requests are removed even after an assertion fails.
   await context.request.delete(base+'/api/account',{headers:{origin:base},data:{password}});
   await context.close();
  }
 }
}finally{await browser.close();}
