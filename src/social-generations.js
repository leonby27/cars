// Исходник для генератора — готовая карточка целиком: фотография, заголовок,
// переносы, цвет первого слова, тени и итоговая вертикальная композиция. Такие
// кадры сохраняются в /social/source, а результаты — отдельно в
// /social/generated. Сгенерированный вариант подключается к той же плитке по её
// стабильному ключу из socialTiles(): core-0, optimal-0 и так далее.
// prompt — номер случайно выбранного пользовательского промта (1, 2 или 3), чтобы
// после прогона было видно, какой именно вариант породил изображение. Для новых
// карточек доли распределены как 50% / 25% / 25%.
//
export const SOCIAL_GENERATIONS = Object.freeze({
  "core-0": { image:"/social/generated/core-0.png", prompt:1 },
  "optimal-0": { image:"/social/generated/optimal-0.png", prompt:1 },
  "price_question-0": { image:"/social/generated/price_question-0.png", prompt:3 },
  "price_drops-0": { image:"/social/generated/price_drops-0.png", prompt:1 },
  "fresh-0": { image:"/social/generated/fresh-0.png", prompt:3 },
  "budget-0": { image:"/social/generated/budget-0.png", prompt:3 },
  "duel-0": { image:"/social/generated/duel-0.png", prompt:2 },
  "blog-0": { image:"/social/generated/blog-0.png", prompt:1 },
  "core-1": { image:"/social/generated/core-1.png", prompt:1 },
  "optimal-1": { image:"/social/generated/optimal-1.png", prompt:3 },
  "price_question-1": { image:"/social/generated/price_question-1.png", prompt:1 },
  "price_drops-1": { image:"/social/generated/price_drops-1.png", prompt:2 },
  "fresh-1": { image:"/social/generated/fresh-1.png", prompt:3 },
  "budget-1": { image:"/social/generated/budget-1.png", prompt:1 },
  "duel-1": { image:"/social/generated/duel-1.png", prompt:2 },
  "blog-1": { image:"/social/generated/blog-1.png", prompt:1 },
  "core-2": { image:"/social/generated/core-2.png", prompt:2 },
  "optimal-2": { image:"/social/generated/optimal-2.png", prompt:2 },
  "price_question-2": { image:"/social/generated/price_question-2.png", prompt:3 },
  "price_drops-2": { image:"/social/generated/price_drops-2.png", prompt:2 },
  "fresh-2": { image:"/social/generated/fresh-2.png", prompt:1 },
  "budget-2": { image:"/social/generated/budget-2.png", prompt:2 },
  "duel-2": { image:"/social/generated/duel-2.png", prompt:1 },
  "blog-2": { image:"/social/generated/blog-2.png", prompt:3 },
});

export const socialGeneration = (key) => {
  const generation = SOCIAL_GENERATIONS[key];
  return generation ? { ...generation, source:`/social/source/${key}.png` } : null;
};
