// Блок «Цена среди похожих» в карточке машины: шкала, слово о цене и две-три строки
// с числами. Слова и числа считает price-rating.js, набор для сравнения — сервер.
//
// Пока сравнение не приехало, блок стоит заготовкой той же высоты. Иначе он появлялся
// бы через мгновение после открытия карточки и сдвигал бы всё под собой — тот самый
// микрорывок, который видно глазом.
import {
  PRICE_RATING_STEPS,
  priceRatingAssessment,
  priceRatingBasisNote,
  priceRatingBatteryNote,
  priceRatingLimits,
  priceRatingMileageNote,
  priceRatingPriceNote,
} from "./price-rating.js";

const PriceRatingCard = ({ children, className = "", title }) => (
  <section className={`price-rating${className ? ` ${className}` : ""}`} aria-label="Цена среди похожих машин" title={title}>
    {children}
  </section>
);

const PriceRatingSkeleton = () => (
  <PriceRatingCard className="is-loading">
    <div className="price-rating-heading">
      <span className="price-rating-label">Цена среди похожих</span>
    </div>
    <div className="price-rating-track" aria-hidden="true">
      {Array.from({ length:PRICE_RATING_STEPS }, (unused, step) => <i key={step} />)}
    </div>
    <p className="price-rating-note price-rating-stub" aria-hidden="true" />
    <p className="price-rating-note price-rating-stub" aria-hidden="true" />
    <p className="price-rating-note price-rating-stub is-short" aria-hidden="true" />
  </PriceRatingCard>
);

/**
 * `priceUsd` — та же цена до Минска, что показана крупно в карточке, поэтому шкала и
 * цена всегда говорят об одном и том же, включая режим цен с квотой.
 */
export function PriceRatingScale({ rating, priceUsd, mileage, battery, quotaPricingOn = true, formatMoney, loading = false }) {
  if (!rating) return loading ? <PriceRatingSkeleton /> : null;
  const mode = quotaPricingOn ? rating.quotaOn : rating.quotaOff;
  const assessment = priceRatingAssessment(rating, mode, priceUsd, mileage);
  if (!assessment) return null;
  const { position, verdict } = assessment;
  const priceNote = priceRatingPriceNote(rating, mode, priceUsd, formatMoney, mileage);
  const mileageNote = priceRatingMileageNote(rating, mileage);
  const batteryNote = priceRatingBatteryNote(rating, battery);
  // Всё, что можно сказать про цену, — одним абзацем. С кем сравнивали и чего в
  // наборе не хватило, ушло в подсказку при наведении: рамка сравнения нужна, но
  // отдельной строкой в блоке она только мешала читать ответ.
  const text = [priceNote?.text, batteryNote?.text, mileageNote?.text].filter(Boolean).join(" ");
  const hint = [priceRatingBasisNote(rating), priceRatingLimits(rating)].filter(Boolean).join(" ");
  return (
    <PriceRatingCard className={`is-${verdict.tone}`} title={hint || undefined}>
      <div className="price-rating-heading">
        <span className="price-rating-label">Цена среди похожих</span>
        <strong className="price-rating-verdict">{verdict.label}</strong>
      </div>
      <div className="price-rating-track" role="img" aria-label={`Цена ${verdict.label} среди похожих машин. ${text}`}>
        <span className="price-rating-marker" style={{ left:`${(position * 100).toFixed(1)}%` }} aria-hidden="true" />
        {Array.from({ length:PRICE_RATING_STEPS }, (unused, step) => (
          <i key={step} className={`price-rating-step-${step}${step === verdict.step ? " is-active" : ""}`} aria-hidden="true" />
        ))}
      </div>
      {text && <p className="price-rating-note">{text}</p>}
    </PriceRatingCard>
  );
}
