import test from "node:test";
import assert from "node:assert/strict";
import { EV_DUTY_STALE_PHRASES, rewriteEvDutyCopy, rewriteEvDutyCopyDeep } from "../src/ev-duty-copy.js";
import { MODEL_PAGES, MODELS_INDEX } from "../src/model-pages.js";

const sentences = (value, found = []) => {
  if (typeof value === "string") found.push(...value.split(/(?<=[.!?])\s+/));
  else if (Array.isArray(value)) value.forEach((item) => sentences(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => sentences(item, found));
  return found;
};

test("keeps every page word for word while the quota lasts", () => {
  const pages = { MODEL_PAGES, MODELS_INDEX };
  assert.deepEqual(rewriteEvDutyCopyDeep(pages, { quotaOver:false }), pages);
});

// Главная проверка: после закрытия квоты на страницах не должно остаться ни
// обещания нулевой пошлины, ни вывода, который из неё следовал. Если в
// model-pages.js появится новая такая фраза, этот тест упадёт — значит, для неё
// нужно дописать правило в ev-duty-copy.js.
test("leaves no zero-duty promise once the quota is gone", () => {
  const after = rewriteEvDutyCopyDeep({ MODEL_PAGES, MODELS_INDEX }, { quotaOver:true });
  const stale = sentences(after).filter((sentence) => EV_DUTY_STALE_PHRASES.some((phrase) => phrase.test(sentence)));
  assert.deepEqual(stale, [], `Фразы про льготу пережили переписывание:\n${stale.slice(0, 5).join("\n")}`);
});

test("rewrites the rate and the conclusion drawn from it", () => {
  const before = "Электромобиль проходит таможню по нулевой ставке, поэтому сумма недалеко уходит от китайской цены.";
  const after = rewriteEvDutyCopy(before, { quotaOver:true });
  assert.match(after, /с пошлиной 15% от стоимости/);
  assert.doesNotMatch(after, /нулев|недалеко уходит/);
  assert.equal(rewriteEvDutyCopy(before, { quotaOver:false }), before);
});

test("keeps the hybrid rule intact — only the electric half changes", () => {
  const before = "У электрической версии пошлина нулевая, у гибрида её считают по объёму двигателя и возрасту машины.";
  const after = rewriteEvDutyCopy(before, { quotaOver:true });
  assert.equal(after, "У электрической версии пошлина 15% от стоимости, у гибрида её считают по объёму двигателя и возрасту машины.");
});
