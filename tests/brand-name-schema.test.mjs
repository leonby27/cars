import assert from "node:assert/strict";
import test from "node:test";
import { createSeoRenderer } from "../server/seo-render.mjs";
import { COMPANY } from "../src/company-data.js";
import { FAQ_GROUPS, HOME_FAQ, HOME_FAQ_LEAD } from "../src/purchase-info.js";

const shell = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
const render = () => createSeoRenderer({ shell, siteUrl: "https://abcars.by", allowIndexing: true });

// По запросу «абкарс» Google показывал первой страницу контактов: только там имя
// компании стояло словами. Эти проверки стерегут то, что связывает название с
// главной, — имя организации в разметке и живой текст на самой странице.
test("разметка организации знает имя компании кириллицей и латиницей", () => {
  const organization = render().organizationSchema();
  assert.equal(organization.name, "ABCars");
  assert.ok(organization.alternateName.includes("Абкарс"));
  assert.ok(organization.alternateName.includes("abcars.by"));
  assert.equal("legalName" in organization, false);
  assert.equal(organization.address.addressLocality, COMPANY.city);
  // Карточка сайта ссылается на ту же организацию, а не заводит вторую.
  assert.equal(render().webSiteSchema().publisher["@id"], organization["@id"]);
  assert.ok(render().webSiteSchema().alternateName.includes("Абкарс"));
});

test("имя компании встречается в текстах главной и в вопросах ответах", () => {
  assert.match(HOME_FAQ_LEAD, /Абкарс/);
  assert.match(HOME_FAQ_LEAD, /ABCars/);
  const homeMentions = HOME_FAQ.filter((item) => item.answer.includes("Абкарс")).length;
  assert.ok(homeMentions >= 3, `на главной упоминаний: ${homeMentions}`);
  const faqMentions = FAQ_GROUPS.flatMap((group) => group.items).filter((item) => item.answer.includes("Абкарс")).length;
  assert.ok(faqMentions >= 3, `в вопросах и ответах упоминаний: ${faqMentions}`);
});

// Логотип организации — квадратный знак, а не картинка для соцсетей 1200×659:
// поисковики ждут в этом поле квадрат не меньше 112 точек (исправлено 25.09.2026).
test("логотип в разметке организации — квадратный знак", () => {
  assert.equal(render().organizationSchema().logo, "https://abcars.by/icon-512.png");
});
