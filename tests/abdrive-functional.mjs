// Run against the local RU server: node tests/abdrive-functional.mjs.
// Functional DOM/network assertions only; no screenshots or appearance checks.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.ABDRIVE_TEST_URL||'http://127.0.0.1:8989';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Local test server only');
const browser=await chromium.launch({headless:true});
try {
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  const context=await browser.newContext({viewport});const page=await context.newPage();
  const errors=[],failed=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource'))errors.push(message.text());});
  page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400)failed.push(response.status()+' '+response.url());});
  await page.goto(base+'/catalog?brand=BMW',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Object.keys(document.querySelector('.favorites-link')||{}).some(key=>key.startsWith('__reactProps$')));
  assert.ok(await page.locator('.car-row').count()>0);
  assert.equal(await page.getByRole('group',{name:'Валюта цен',exact:true}).count(),0);
  const destination=page.getByRole('combobox',{name:'Город доставки',exact:true});
  assert.equal(await destination.inputValue(),'moscow');
  assert.deepEqual(await destination.locator('option').allTextContents(),['Москва']);
  await destination.selectOption('moscow');
  const firstId=await page.locator('.car-row').first().getAttribute('data-car-id');
  await page.locator('.car-row').first().getByRole('button',{name:'Добавить в избранное',exact:true}).first().dispatchEvent('click');
  await page.getByRole('button',{name:'Избранное',exact:true}).click();
  await page.waitForURL('**/favorites');await page.locator(`.car-row[data-car-id="${firstId}"]`).waitFor();
  await page.reload({waitUntil:'networkidle'});
  await page.locator(`.car-row[data-car-id="${firstId}"]`).waitFor();
  await page.goto(base+'/catalog?brand=BMW',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Сохранить поиск',exact:true}).click();
  await page.goto(base+'/searches',{waitUntil:'networkidle'});
  await page.locator('.saved-search-card').first().waitFor();
  assert.equal(await page.locator('.auth-modal').count(),0,'No pretend local account');
  await page.goto(base+'/catalog/bmw/x3',{waitUntil:'networkidle'});
  if(viewport.width>980){
   await page.getByText('Быстрый просмотр',{exact:true}).click();
   await page.locator('.car-row .card-link-overlay').first().dispatchEvent('click');
   await page.locator('.quick-view-modal').waitFor();
   const text=await page.locator('.quick-view-modal').textContent();
   assert.doesNotMatch(text,/Минск|Беларус|Указ №|BYN|НБРБ/);
   await page.getByRole('button',{name:'Закрыть быстрый просмотр'}).click();
   await page.getByText('Быстрый просмотр',{exact:true}).click();
  }
  await page.locator('.car-row .card-link-overlay').first().dispatchEvent('click');
  await page.waitForURL('**/cars/*');await page.locator('.detail-main').waitFor();
  assert.match(await page.locator('.detail-main').textContent(),/Стоимость\sдо\sМосквы/);
  await page.goto(base+'/',{waitUntil:'networkidle'});
  assert.ok(await page.locator('.featured-card').count()>0);
  assert.match(await page.locator('h1').first().textContent(),/Россию/);
  await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
  await page.getByRole('button',{name:'Тёмная тема',exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  console.log(`${viewport.width}px: catalog, favorites/reload, saved search, model, detail, home, theme passed`);
  await context.close();
 }
} finally {await browser.close();}
