import test from "node:test";
import assert from "node:assert/strict";
import { leadMessage } from "../server/lead-notify.mjs";

test("заявка с карточки называет клиента, телефон и машину со ссылкой", () => {
  const text = leadMessage({
    kind:"availability",
    source:"site",
    name:"Алексей",
    contact:"+375291234567",
    methods:["phone","telegram"],
    car:{ id:"che168-59370942", title:"BYD Song Plus 2023", mileage:23400, price:18900, sourceUrl:"https://global.che168.com/en/detail/59370942" },
  });
  assert.match(text, /Запрос актуальности/);
  assert.match(text, /Клиент: Алексей/);
  assert.match(text, /Телефон: \+375291234567/);
  assert.match(text, /Связь: Телефон, Telegram/);
  assert.match(text, /BYD Song Plus 2023/);
  // Ссылка ведёт на короткий номер объявления — тот же адрес, что у карточки на сайте.
  assert.match(text, /\/cars\/59370942$/m);
  // И сразу объявление у источника — менеджер проверяет машину на Che168 без поиска.
  assert.match(text, /^Che168: https:\/\/global\.che168\.com\/en\/detail\/59370942$/m);
  assert.match(text, /\/analytics$/m);
});

test("подбор без машины показывает описание и выбранные фильтры", () => {
  const text = leadMessage({
    kind:"custom_search",
    source:"site",
    name:"Ирина",
    contact:"375295553632",
    comment:"Нужен семейный кроссовер до 30 тысяч",
    filters:{ brand:"BYD", bodyType:"any", model:["Song","Tang"], sort:"" },
  });
  assert.match(text, /Индивидуальный подбор/);
  // Телефон без плюса из базы всё равно показываем в привычном виде.
  assert.match(text, /Телефон: \+375295553632/);
  assert.match(text, /Что ищет: Нужен семейный кроссовер до 30 тысяч/);
  assert.match(text, /Фильтры: Марка: BYD; Модель: Song, Tang/);
  assert.doesNotMatch(text, /Кузов/);
  assert.doesNotMatch(text, /Машина:/);
});

test("снятое объявление не оставляет заявку без машины, а имя может отсутствовать", () => {
  const text = leadMessage({ kind:"availability", source:"account", orderNumber:"EV-2026-000058", contact:"+375291112233", listingId:"che168-59370942" });
  assert.match(text, /Заказ EV-2026-000058/);
  assert.match(text, /Клиент: имя не указано/);
  assert.match(text, /59370942 \(объявления уже нет в каталоге\)/);
  assert.match(text, /Источник: личный кабинет/);
});
