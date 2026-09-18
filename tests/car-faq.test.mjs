import assert from "node:assert/strict";
import test from "node:test";
import { carFaq, carFaqTitle } from "../src/car-faq.js";
import { estimateLandedCost } from "../src/pricing.js";
import { isEvQuotaExhausted } from "../src/ev-quota.js";
import { createSeoRenderer } from "../server/seo-render.mjs";

const shell = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
const render = () => createSeoRenderer({ shell, siteUrl: "https://abcars.by", allowIndexing: true });

const EV = { id: "che168-1", brand: "Audi", model: "Q2L e-tron", year: 2022, type: "Электромобиль", mileage: 80000, chinaPrice: 59800, battery: 44.1, city: "shanghai" };
const ICE = { id: "che168-2", brand: "Toyota", model: "Camry", year: 2021, type: "ДВС", mileage: 60000, chinaPrice: 130000, engineVolume: 2, owners: 2, city: "shanghai" };

const faqOf = (car) => carFaq(car, estimateLandedCost(car));

test("вопросы карточки считаются по самой машине, а не по шаблону", () => {
  const ev = faqOf(EV);
  const ice = faqOf(ICE);
  assert.ok(ev.length >= 3);
  // Название машины стоит в вопросах — иначе на десятках тысяч карточек был бы
  // один и тот же текст, а это для поиска штамповка.
  assert.match(ev[0].q, /Audi Q2L e-tron 2022/);
  assert.match(carFaqTitle(EV), /Audi Q2L e-tron 2022/);
  assert.notEqual(ev[0].a, ice[0].a);
  // Итоговая сумма в ответе — та же, что в расчёте под ценой.
  const total = estimateLandedCost(EV).totalUsd;
  assert.match(ev[0].a, new RegExp(String(total).replace(/\B(?=(\d{3})+(?!\d))/g, "[\\s\\u00a0]")));
});

test("ответ про таможню зависит от типа двигателя и возраста", () => {
  const ev = faqOf(EV).find((item) => /таможне/.test(item.q));
  const ice = faqOf(ICE).find((item) => /таможне/.test(item.q));
  assert.match(
    ev.a,
    isEvQuotaExhausted() ? /выбрана, поэтому начисляется пошлина 15%/ : /Пока действует квота[^.]*пошлины у электромобиля нет/,
  );
  // Машине младше пяти лет НДС не начисляют — и это должно быть сказано прямо.
  assert.match(ev.a, /меньше пяти лет[^.]*НДС при ввозе нулевой/);
  // У бензиновой пошлина считается по объёму двигателя, а не процентом от цены.
  assert.match(ice.a, /по объёму двигателя и возрасту/);
  assert.doesNotMatch(ice.a, /квот/i);
});

test("на странице машины есть блок вопросов и разметка FAQPage, у проданной — нет", () => {
  const { html } = render().carPage({ car: { ...EV, image: "https://example.com/a.jpg" } });
  assert.match(html, /"@type":"FAQPage"/);
  assert.equal((html.match(/"@type":"Question"/g) || []).length, faqOf(EV).length);
  assert.match(html, /<h2>Частые вопросы: Audi Q2L e-tron 2022 из Китая<\/h2>/);

  // Проданная машина: страница живёт только ради прямых ссылок и избранного,
  // отвечать на «сколько стоит доставка» в ней нечего.
  const sold = render().carPage({ car: { ...EV, available: false } }).html;
  assert.doesNotMatch(sold, /FAQPage/);
});
