import { prepareServiceVideo } from "./service-video-loading.js";
import { readCatalogFallback } from "./catalog-fallback.js";
import { withoutTrackingParams } from "./tracking-params.js";
import { Phone, SortAscending, Star } from "@phosphor-icons/react";
import { Fragment, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { appHref } from "./app-href.js";
import { holdAnchor } from "./anchor-scroll.js";
import { bindModalViewport } from "./modal-viewport.js";
import { PhoneField } from "./phone-field.jsx";
import { completePhoneNumber } from "./phone-mask.js";
import { Illustration } from "./illustration.jsx";
import { SearchField } from "./search-field.jsx";
import { EmptyState } from "./empty-state.jsx";
import { Article, ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, ArrowsLeftRight, BatteryHigh, BookmarkSimple, Calculator, CalendarBlank, CarProfile, CaretDown, CaretRight, ChatCircleText, Check, CheckCircle, ClipboardText, Clock, Copy, CurrencyDollar, Desktop, DotsThreeVertical, Engine, Eye, GasPump, Gauge, Gear, Heart, Images, Info, InstagramLogo, Lightbulb, Lightning, List, ListChecks, LinkSimple, LockKey, MagnifyingGlass, Newspaper, Palette, RoadHorizon, Ruler, Scales, ShieldCheck, SignOut, SlidersHorizontal, Sparkle, SquaresFour, SteeringWheel, TelegramOfficialLogo, ThreadsLogo, Timer, Tire, Trash, UserCircle, UsersThree, X } from "./icons.jsx";
import { sortCars } from "./car-filters.js";
import { matchesSearchText, searchTextWords } from "./car-search-text.js";
import { listSearchMatches, listSearchVariants, searchNormalize } from "./search-dictionary.js";
import { colorValuesForLabels, matchesColorLabels, translateColor } from "./colors.js";
import { CITY_NAMES } from "./city-names.js";
import { CATALOG_INDEX_SEO, CATALOG_LANDINGS, CATALOG_MAX_PAGES, CATALOG_PAGE_SIZE, brandLandingPath, catalogLandingForFilters, landingFilterParams, landingHeading, landingsForCar, modelLandingPath, modelLandingRedirect, priceBandsForCar, priceBandsForLanding, relatedLandings } from "./catalog-landings.js";
import { modelAutoText, modelFaq, modelFaqTitle } from "./model-landing.js";
import { landingFaq, landingFaqTitle } from "./landing-faq.js";
import { carFaq, carFaqTitle } from "./car-faq.js";
import { brandGuideConfig, guideBudgetTitle, guideDate, guideNumber, guidePlural, guidePowertrains, guidePrice, guideYears, isBrandGuide, isBrandGuideLanding, ZEEKR_BUDGETS } from "./brand-guide.js";
import { seededRandom, varietyOrder } from "./car-variety.js";
import { carAgeYears, customsPayment, estimateLandedCost, PRICING, yuanToUsdAbout, sourcePriceOf, sourceCurrencySymbol } from "./pricing.js";
import { evQuotaState } from "./ev-quota.js";
import { estimateDeliveryDays } from "./china-logistics.js";
import { BODY_TYPES } from "./body-types.js";
import { ANY_DRIVE, orderDrives } from "./drive-types.js";
import { carAnchorSelector, readCatalogReturn, saveCatalogReturn } from "./catalog-return.js";
import { getListingAddedAt } from "./listing-age.js";
import { selectSimilarCars } from "./similar-cars.js";
import { MODEL_PAGES, MODELS_INDEX, modelPageForCar } from "./model-pages.js";
import { carTitle } from "./car-title.js";
import { chineseModelName } from "../config/model-names-by.mjs";
import { plainInlineText } from "./inline-links.js";
import { loadModelText, loadedModelText } from "./model-text-load.js";
import { buildVehicleQuickFacts } from "./vehicle-quick-info.js";
import { createVehicleMarketLoader, vehicleMarketComparisonUrl, vehicleMarketSavings, vehicleMarketChoice } from "./vehicle-market-savings.js";
import { PriceRatingScale, priceRatingVerdictFor } from "./price-rating-scale.jsx";
import { brandNotice } from "./brand-notice.js";
import { translateSpecGroup, translateTechnicalSpecs } from "./spec-translations.js";
import { conditionGradeMeta, worstConditionGrade } from "./condition-grade.js";
import { formatRoundedListingCount } from "./catalog-count.js";
import { COMPANY } from "./company-data.js";
import { LEGAL_DOCUMENTS } from "./legal-documents.js";
import { ABOUT_PRINCIPLES, PURCHASE_FLOW_STEPS, SERVICE_PROOF, SERVICE_REPORT_EXAMPLE } from "./service-copy.js";
import { InspectionReport } from "./inspection-report.jsx";
import { CALC_CURRENCIES, CALC_KINDS, TOOL_PAGES, calcShareSearch, calcStateFromSearch, calcYears, customsExample, deliveryStages, deliveryStagesKorea, dutyRateTables, toolPageStats, toolUpdatedLabel } from "./tool-pages.js";
import { loadToolPageTexts, loadedToolPageTexts } from "./tool-page-text-load.js";
import { REBUILT_HINT, aggregateComparisonPrices, bestComparisonYear, collapseSameModelCards, comparisonCatalogHref, comparisonOwnPrices, hasEnoughComparisonSample, hasEnoughMarketSample, hasRebuiltHint } from "./market-compare.js";
import { BRAND_POWERTRAINS, CHINA_BRANDS, CHINA_MADE_FOREIGN } from "./china-brands.js";
import { ACTIVE_ORIGINS, countryName, fromPhrase, inPhrase, originOf, siteCountriesGenitive, siteFromPhrase } from "./origin.js";
import { BRAND_PRICE_SEGMENTS, brandMatchesPriceSegment } from "./brand-directory-filters.js";
import { RANGE_CHEMISTRY, RANGE_CYCLES, RANGE_MODES, rangeShareSearch, rangeStateFromSearch, rangeTable, realRange } from "./range-estimate.js";
import { deliveryBodyClass, deliveryModelSize, deliveryPrecisionPrompt, estimateDeliveryCip } from "./delivery-estimate.js";
import { BLOG_ENABLED, REVIEWS_ENABLED, GUAZI_PREVIEW_ENABLED } from "./feature-flags.js";
import { SAMPLE_REPORT, indexChartSvg, percent } from "./blog-report.js";
import { blogFigureHtml } from "./blog-figures.js";
import { BLOG_INDEX, blogApiParams, blogCatalogHref, blogDuelRows, blogDuelSpecRows, blogHighlight, blogHighlightSort, blogCarFigure, blogCarReason, blogListParams, blogPostSides, blogTopCars, BLOG_TOP_POOL, blogPostStats, blogPostsFor, blogPostsForModel, blogRelatedPosts, blogFreshnessLabel, blogPostDateSentence, blogSidebarItems } from "./blog-posts.js";
import { loadBlogText, loadedBlogText } from "./blog-text-load.js";
import { embeddedApiValue } from "./boot-api.js";
import { FAQ_GROUPS } from "./purchase-info.js";
import { trackEvent, trackYandexGoal } from "./analytics.js";
import { missingFavoriteIsExpired } from "./favorite-cars.js";
import { listingNumber } from "./listing-id.js";
import { ANY_ACCEL, ANY_BATTERY, ANY_BODY_TYPE, ANY_COLOR, ANY_CONDITION, ANY_COUNTRY, ANY_ENGINE, ANY_FUEL, ANY_GEARBOX, ANY_MILEAGE, ANY_MODEL, ANY_OWNERS, ANY_POWER, ANY_PRICE_MAX, ANY_PRICE_MIN, ANY_RANGE, ANY_TIRE, ANY_YEAR_MAX, ANY_YEAR_MIN, ActionTooltip, AppLink, ApproxSign, AuthContext, AvailabilityContext, BlogCollectionCard, BlogCoverImage, BlogShareMenu, BrandMark, CarRow, CardSkeleton, CatalogFactsContext, ConsentField, CurrencySwitch, DecreePricingButton, EMPTY_AVAILABILITY, EMPTY_CATALOG_FACTS, EMPTY_CATALOG_META, EMPTY_ORDERED_LISTINGS, EXTERNAL_LINK_REL, EvQuotaButton, ExternalLink, FeaturedCard, FilterSheet, HomeFaqList, HoverImagePreview, IMAGE_ORIGINAL, IMAGE_WIDTH_CARD, NARROW_VIEWPORT, NotFound, OrderedListingsContext, POWERTRAIN_TABS, PasswordField, ScrollToTopButton, SegmentedControl, SelectField, SetOrderedListingsContext, SiteLogo, SoldVehiclePhoto, TotalPrice, VehicleSearch, ViewToggle, appendEngineRange, appendExclusions, appendMileageRange, appendMulti, appendPowerRange, appendPriceRange, appendYearRange, authMessages, batteryFloor, bootCatalogMeta, brandModelsCache, bynify, carHref, carOrigin, catalogFiltersFromParams, catalogMetaQuery, catalogUpdatedDate, catalogViewKey, clampPriceMax, clampYearMax, conditionGrades, countryKey, countryOptionsFor, createLocalOrder, currentAppPath, displayValue, emptyExclusions, exclusionValues, fetchCarsJson, filterNumber, formatDayAgo, hasExclusions, hasPriceRange, hasYearRange, heroCatalogHref, imageSource, itemsMatchingQuery, loadStaticCar, localAvailability, matchesAdvancedFilters, matchesExclusions, matchesMileageRange, matchesMulti, matchesPriceRange, matchesYears, matchingCatalogReturn, money, multiValues, normalizeImportedCar, normalizeLocalPhone, normalizeSavedFilters, number, parseHeroSearchOnce, patchHistoryState, pendingOrderKey, pluralRu, powertrainName, randomShuffleSeed, readCatalogView, readLocalOrders, renderInlineText, replaceHistoryEntry, requestCatalogMeta, retryWithFullImage, sameListing, sanitizePhoneInput, savedSearchCatalogHref, savedSearchKey, skeletonCards, startOfDayMs, storeLocalOrders, tabLabel, tabSelection, trackAvailabilityRequest, translateCity, typeValue, uniqueSorted, updateLocalOrder, useArticlePhotos, useCollectionCover, useCurrency, useDuelSides, useMediaQuery, useNarrowViewport, useQuotaPricing, useSetCurrency, useVehicleQuickView, withApprox } from "./App.jsx";

function ModelQuickLabel({ model }) {
  const labelRef = useRef(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const label = labelRef.current;
    if (!label) return undefined;
    const update = () => setTruncated(label.scrollWidth > label.clientWidth + 1);
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(label);
    return () => observer.disconnect();
  }, [model]);

  return (
    <>
      <span ref={labelRef}>{model}</span>
      {truncated && <ActionTooltip text={model} />}
    </>
  );
}

const useCatalogFacts = () => useContext(CatalogFactsContext) || EMPTY_CATALOG_FACTS;

const SERVICE_PROOF_ARTWORK = Object.freeze([
  { src: "/services/budget-wallet.png", className: "wallet", width: 256, height: 213 },
  { src: "/services/prepayment-check.png", className: "prepayment", width: 512, height: 512 },
  { src: "/services/independent-diagnostics.png", className: "diagnostics", width: 512, height: 512 },
  { src: "/services/battery-check.png", className: "battery", width: 512, height: 512 },
  { src: "/services/full-estimate.png", className: "estimate", width: 512, height: 512 },
  { src: "/services/staged-payment.png", className: "payment", width: 512, height: 512 },
  { src: "/services/delivery-control.png", className: "delivery", width: 512, height: 341 },
  { src: "/services/customs-documents.png", className: "customs", width: 512, height: 341 },
]);

const useOrderedListings = () => useContext(OrderedListingsContext) || EMPTY_ORDERED_LISTINGS;

const useAvailability = () => useContext(AvailabilityContext) || EMPTY_AVAILABILITY;

const approximateMoney = (low, high, currency) => `≈ ${money(Math.round((low + high) / 2), currency)}`;

// Суммы в блоке «Цена среди похожих» — крупным шагом (сотня рублей, полсотни
// долларов): это оценка, а не смета, и точность до рубля обещала бы больше, чем
// расчёт может дать.
const roughMoney = (usd, currency) => {
  const step = currency === "BYN" ? 100 / PRICING.usdByn : currency === "RUB" ? 1000 * (PRICING.rubBynPer100 / 100) / PRICING.usdByn : 50;
  return money(Math.round(usd / step) * step, currency);
};

const translateBattery = (value) =>
  ({
    磷酸铁锂: "LFP · литий-железо-фосфатная",
    三元锂: "NMC · тройная литиевая",
    "三元锂+磷酸铁锂": "NMC + LFP · комбинированная",
  })[value] || displayValue(value);

const translateSourceValue = (value) =>
  value
    ? {
        优秀: "Отлично",
        在保中: "Гарантия действует",
        非常好: "Очень хорошо",
        衰减保修: "Гарантия на деградацию",
        每车必检: "Обязательная проверка",
        终身包退: "Пожизненный возврат по условиям площадки",
      }[value] || value
    : null;

const translateClaims = (value) => {
  if (!value) return "Не указано";
  const match = String(value).match(/(\d+)\s*次理赔|理赔\s*(\d+)\s*次/);
  if (!match) return translateSourceValue(value);
  const count = Number(match[1] ?? match[2]);
  if (count === 0) return "Нет страховых случаев";
  const word = count % 10 === 1 && count % 100 !== 11 ? "случай" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "случая" : "случаев";
  return `${count} страховой ${word}`;
};

const IMAGE_WIDTH_TILE = 600;

// Миниатюры используют сохранённые 600px, без отдельного запроса в Китай за 240px.
const IMAGE_WIDTH_THUMB = IMAGE_WIDTH_CARD;

// Крупные места: фотография внутри статьи (780 точек) и большой снимок в карточке
// машины. Здесь кадр показан втрое шире, чем в списке, поэтому и просить нужно шире —
// иначе снимок выглядит мыльным.
const IMAGE_WIDTH_ARTICLE = 800;

// Потолок для второго кадра. Хранилище отдаёт снимок любой ширины вплоть до оригинала
// (у разных объявлений это от 1537 до 2016 точек), но 1400 — та ширина, которая стоит
// в адресах объявлений, то есть наш кэш фотографий её уже знает. Просить больше значит
// заводить новые файлы в кэше и качать вдвое больше байт ради разницы, которой не
// видно: на снимке шириной 780 точек экран с двойной плотностью просит 1560, и 1400
// от них отличается неразличимо.
const IMAGE_WIDTH_DOUBLE_CAP = 1400;

const GALLERY_ZOOM = 1.4;

/**
 * Второй, вдвое более широкий кадр для экранов с двойной плотностью. На обычном экране
 * браузер скачает первый и ничего не потеряет, на retina возьмёт второй и покажет
 * резкую картинку. Так вес страницы растёт только там, где эта резкость видна.
 *
 * Хранилище отдаёт снимок любой ширины (проверено: 240, 600, 1200, 1400 — всё живое),
 * а выше 1537 возвращает оригинал, поэтому вторая ширина ограничена.
 */
const imageSourceSet = (source, width) => {
  if (!source || !width || typeof width !== "number") return undefined;
  const single = imageSource(source, width);
  const double = imageSource(source, Math.min(width * 2, IMAGE_WIDTH_DOUBLE_CAP));
  return single && double && double !== single ? `${single} 1x, ${double} 2x` : undefined;
};

const daysFrom = ([low]) => `от ${low} ${pluralRu(low, "дня", "дней", "дней")}`;

// Строка дат карточки: когда машина попала в наш каталог (firstSeenAt) и когда мы
// последний раз сверяли её с источником (last_checked_at, его пишет npm run refresh;
// у ни разу не сверённых карточек — дата импорта). Сверку показываем, только если она
// была позже добавления, иначе строка дважды повторяет один и тот же день.
function carDatesLine(car) {
  const addedValue = getListingAddedAt(car);
  const added = formatDayAgo(addedValue);
  const checked = formatDayAgo(car?.checkedAt);
  if (!added) return checked ? `Обновлено ${checked}` : null;
  const addedAt = new Date(addedValue);
  const checkedAt = new Date(car?.checkedAt || "");
  const updated = checked && Number.isFinite(checkedAt.getTime()) && startOfDayMs(checkedAt) > startOfDayMs(addedAt);
  return `Добавлено ${added}${updated ? ` · Обновлено ${checked}` : ""}`;
}

function Breadcrumbs({ children }) {
  const trailRef = useRef(null);

  useLayoutEffect(() => {
    const trail = trailRef.current;
    const mobile = window.matchMedia("(max-width: 700px)");
    let previousWidth = -1;
    let previousScrollWidth = -1;
    const scrollToEnd = () => {
      if (mobile.matches) trail.scrollLeft = trail.scrollWidth;
    };
    const resize = () => {
      if (trail.clientWidth === previousWidth && trail.scrollWidth === previousScrollWidth) return;
      previousWidth = trail.clientWidth;
      previousScrollWidth = trail.scrollWidth;
      scrollToEnd();
    };
    // Start at the current page; keep manual swipes until the trail itself changes.
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(trail);
    const contentObserver = new MutationObserver(scrollToEnd);
    contentObserver.observe(trail, { childList: true, characterData: true, subtree: true });
    mobile.addEventListener("change", scrollToEnd);
    return () => {
      observer.disconnect();
      contentObserver.disconnect();
      mobile.removeEventListener("change", scrollToEnd);
    };
  }, []);

  return <div className="breadcrumbs" ref={trailRef}>{children}</div>;
}

// Хлебная крошка — настоящая ссылка: поисковик видит по ней путь вверх по разделам,
// посетитель может открыть его в новой вкладке. Обычное нажатие делает то же, что
// делала кнопка на этом месте (шаг назад по истории, возврат в каталог с прежними
// фильтрами), поэтому это не AppLink: у него переход всегда ровно по адресу.
function CrumbLink({ href, onOpen, children }) {
  const handleClick = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen();
  };
  return <a href={appHref(href)} onClick={handleClick}>{children}</a>;
}

// Остаток льготной квоты на электромобили. Пока она действует, пошлина 0% —
// на этом держится вся цена «под ключ» в каталоге, поэтому цифра стоит в шапке.
// Данные обновляются скриптом npm run quota из сводок таможни.
const QUOTA_AUDIENCES = [["personal", "Физ. лица"], ["business", "Юр. лица"]];

const quotaForecast = (quota) => quota.exhausted
  ? `Квота исчерпана${quota.exhaustedOnLabel ? ` ${quota.exhaustedOnLabel}` : ""}. Льготное оформление по ставке 0% больше недоступно: при ввозе электромобиля применяется пошлина 15%. Остаток за выбранный месяц — историческое значение из официальной сводки, а не доступная квота на сегодня.`
  : quota.stale || quota.overdue
    ? "Сводка устарела — свежий остаток смотрите у таможни."
    : `Расход держится около ${number(quota.perWeek)} машин в неделю. При таком темпе квота закончится примерно ${quota.runsOutLabel}, а дальше к цене добавится пошлина 15%.`;

function QuotaAudienceTabs({ audience, onChange }) {
  return (
    <div className="quota-panel-tabs" role="group" aria-label="Чья квота">
      {QUOTA_AUDIENCES.map(([code, label]) => (
        <button
          key={code}
          type="button"
          className={audience === code ? "active" : ""}
          aria-pressed={audience === code}
          onClick={() => onChange(code)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function QuotaMonthValue({ quota, period }) {
  return (
    <>
      <span className="quota-page-month-share">
        {period.left > 0 ? `${Math.round((period.left / quota.total) * 100)}%` : ""}
      </span>
      <strong>{period.left == null ? "Нет данных" : number(period.left)}</strong>
    </>
  );
}

function QuotaMonthPicker({ quota, selectedKey, onSelect }) {
  return (
    <div className="quota-page-months" aria-label="Остаток квоты по месяцам">
      <ul>
        {quota.periods.map((period) => {
          const selected = period.key === selectedKey;
          return (
            <li key={period.key} className={period.left == null ? "unavailable" : undefined}>
              <button
                type="button"
                className={selected ? "active" : ""}
                aria-pressed={selected}
                onClick={() => onSelect(period.key)}
              >
                <span className="quota-page-month-label">{period.label}</span>
                <QuotaMonthValue quota={quota} period={period} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const QUOTA_DIGITS = Array.from({ length: 10 }, (_, digit) => digit);

function AnimatedQuotaValue({ hasData, maxDigits, value }) {
  if (!hasData) {
    return (
      <b className="quota-page-animated-value" aria-live="polite" aria-atomic="true">
        <span className="quota-page-value-empty">Нет данных</span>
      </b>
    );
  }

  const label = number(value);
  const paddedDigits = String(value).padStart(maxDigits, "0").split("");
  const firstNonZero = paddedDigits.findIndex((digit) => digit !== "0");
  const firstVisible = firstNonZero < 0 ? paddedDigits.length - 1 : firstNonZero;
  return (
    <b className="quota-page-animated-value" aria-live="polite" aria-atomic="true" aria-label={label}>
      <span className="quota-page-value-digits" aria-hidden="true">
        {paddedDigits.map((digit, index) => {
          const separatorBefore = index > 0 && (paddedDigits.length - index) % 3 === 0;
          const separatorVisible = separatorBefore && firstVisible < index;
          return (
            <Fragment key={`quota-digit-${index}`}>
              {separatorBefore && (
                <span className={`quota-page-value-separator${separatorVisible ? "" : " is-hidden"}`}>&nbsp;</span>
              )}
              <span className={`quota-page-value-reel${index < firstVisible ? " is-leading" : ""}`}>
                <span className="quota-page-value-track" style={{ "--quota-digit": Number(digit) }}>
                  {QUOTA_DIGITS.map((trackDigit) => (
                    <span key={trackDigit}>{trackDigit}</span>
                  ))}
                </span>
              </span>
            </Fragment>
          );
        })}
      </span>
    </b>
  );
}

function QuotaPeriodResult({ quota, period }) {
  const hasData = period?.left != null;
  const remainingShare = hasData && quota.total ? period.left / quota.total : 0;
  return (
    <div className="quota-panel-result quota-page-period-result">
      <div className={`quota-panel-figure${hasData ? "" : " unavailable"}`}>
        <small className="quota-page-selected-month">{period?.label || "Выбранный месяц"}</small>
        <AnimatedQuotaValue hasData={hasData} maxDigits={String(quota.total).length} value={period?.left} />
        <i className="quota-panel-bar" aria-hidden="true">
          <b style={{ width: `${hasData ? Math.min(100, Math.max(3, Math.round(remainingShare * 100))) : 0}%` }} />
        </i>
        <small>
          {hasData
            ? `${Math.round(remainingShare * 100)}% от первоначального объёма квоты.`
            : `Официальной сводки за ${period?.label || "этот месяц"} нет.`}
        </small>
      </div>
      <p className="quota-panel-forecast">{quotaForecast(quota)}</p>
    </div>
  );
}

/* Поле и поиск здесь один контрол, а не кнопка с отдельным поиском внутри меню.
   Это важно для калькулятора доставки: модель или город проще начать печатать,
   чем сначала открывать список из нескольких сотен вариантов. */
function ComboboxField({ label, value, options, onChange, placeholder }) {
  const rootRef = useRef(null);
  const optionsRef = useRef(null);
  const centerActiveOnOpenRef = useRef(false);
  const openRef = useRef(false);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value?.label || "");
  const [activeIndex, setActiveIndex] = useState(0);
  const labels = useMemo(() => options.map((item) => item.label), [options]);
  const filteredOptions = useMemo(() => {
    if (!query.trim() || (query === value?.label && !value?.custom)) return options;
    const matches = new Set(listSearchMatches(labels, query));
    return options.filter((item) => matches.has(item.label));
  }, [labels, options, query, value?.custom, value?.label]);
  const changeOpen = (next) => {
    openRef.current = next;
    setOpen(next);
  };

  useEffect(() => setQuery(value?.label || ""), [value?.label]);
  useEffect(() => {
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) changeOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const menu = optionsRef.current;
    const active = optionsRef.current?.querySelector('[role="option"].active');
    if (!menu || !active) return;
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (centerActiveOnOpenRef.current) {
      menu.scrollTop = Math.max(0, top - (menu.clientHeight - active.offsetHeight) / 2);
    } else if (top < menu.scrollTop) {
      menu.scrollTop = top;
    } else if (bottom > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = bottom - menu.clientHeight;
    }
    centerActiveOnOpenRef.current = false;
  }, [open, activeIndex]);

  const openAtSelection = () => {
    // Первый клик по полю приходит двумя событиями: focus, затем click. После focus
    // список уже открыт и отцентрирован; повторная подготовка на click оставляла
    // флаг центрирования до следующего hover, из-за чего активный пункт прыгал.
    if (openRef.current) return;
    const selectedIndex = filteredOptions.findIndex((item) => item.value === value?.value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    centerActiveOnOpenRef.current = selectedIndex >= 0;
    changeOpen(true);
  };
  const choose = (item) => {
    onChange(item);
    setQuery(item.label);
    changeOpen(false);
  };
  const move = (delta) => {
    if (!filteredOptions.length) return;
    setActiveIndex((index) => Math.max(0, Math.min(filteredOptions.length - 1, index + delta)));
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openAtSelection();
      else move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && open && filteredOptions[activeIndex]) {
      event.preventDefault();
      choose(filteredOptions[activeIndex]);
    } else if (event.key === "Escape") {
      changeOpen(false);
    } else if (event.key === "Tab") {
      changeOpen(false);
    }
  };

  return (
    <div className={`tool-combobox${open ? " open" : ""}`} ref={rootRef}>
      <label className="tool-calc-main">
        <span className="tool-calc-label">{label}</span>
        <input
          className="tool-calc-input"
          type="text"
          value={query}
          placeholder={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && filteredOptions[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          onFocus={openAtSelection}
          onClick={openAtSelection}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setActiveIndex(0);
            changeOpen(true);
            onChange(next ? { value: next, label: next, custom: true } : null);
          }}
          onKeyDown={onKeyDown}
        />
      </label>
      <CaretDown className="tool-combobox-caret" size={16} weight="bold" aria-hidden="true" />
      {open && (
        <div className="tool-combobox-menu" id={listId} role="listbox" aria-label={label} ref={optionsRef}>
          {filteredOptions.length ? filteredOptions.map((item, index) => (
            <button
              type="button"
              id={`${listId}-${index}`}
              role="option"
              aria-selected={item.value === value?.value}
              className={`${item.value === value?.value ? "selected " : ""}${index === activeIndex ? "active" : ""}`}
              key={item.value}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(item)}
            >
              <span>{item.label}</span>
              {item.value === value?.value && <Check size={16} weight="bold" aria-hidden="true" />}
            </button>
          )) : <p>Ничего не найдено</p>}
        </div>
      )}
    </div>
  );
}

/* Раскрывающиеся пункты с любым содержимым внутри, а не только абзацем ответа.
   Нужны странице растаможки: за ней приходят посчитать, а не читать, поэтому всё,
   кроме калькулятора, свёрнуто. Текст при этом остаётся в разметке страницы —
   поисковик его видит, просто человек не листает через него до формы. */
function ToolDisclosures({ title, titleId, items, faq = null }) {
  const [openIndex, setOpenIndex] = useState(null);
  if (!items.length) return null;
  return (
    <section className="model-page-faq page-width" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      <div className="model-page-faq-list">
        {items.map((item, index) => (
          <article key={item.title} className={`home-faq-item${openIndex === index ? " open" : ""}`}>
            <button type="button" aria-expanded={openIndex === index} onClick={() => setOpenIndex((current) => (current === index ? null : index))}>
              <span>{item.title}</span>
              <CaretDown size={20} weight="bold" aria-hidden="true" />
            </button>
            {/* Три слоя, а не два: поля содержимого обязаны лежать на внутреннем
                блоке. На том, который схлопывается, они остаются видимыми даже при
                нулевой высоте — под каждым закрытым пунктом висела лишняя полоска. */}
            <div className="animated-disclosure" aria-hidden={openIndex !== index} inert={openIndex !== index}>
              <div>
                <div className="tool-disclosure-body">{item.content}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
      {/* Когда в пунктах есть настоящие вопросы, отдаём поисковику их разметку —
          ту же, что у обычного блока «Частые вопросы». */}
      {faq?.length ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema(faq)) }} /> : null}
    </section>
  );
}

// Фильтры, привязанные к типу двигателя: при смене вкладки топлива они пропадают
// с экрана, поэтому оставленное значение сбрасывается — иначе скрытый фильтр молча
// резал бы выдачу.
const POWERTRAIN_FILTER_RESET = { battery:ANY_BATTERY, range:ANY_RANGE, engine:ANY_ENGINE, gearbox:ANY_GEARBOX, fuel:ANY_FUEL };

// Всплывающая подсказка внизу экрана: инверсия цветов страницы, крестик и
// самостоятельное закрытие через несколько секунд.
function Toast({ text, onClose }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const timer = window.setTimeout(() => close.current(), 4000);
    return () => window.clearTimeout(timer);
  }, [text]);
  return (
    <div className="app-toast" role="status">
      <span>{text}</span>
      <button type="button" onClick={() => close.current()} aria-label="Закрыть">
        <X size={16} weight="bold" />
      </button>
    </div>
  );
}

// ── Страница раздела и фильтры ────────────────────────────────────────────────
// Раздел каталога — это тот же каталог с выставленным фильтром, поэтому фильтр можно
// поменять прямо на нём. Пока это никак не отслеживалось, страница марки Audi после
// переключения на BMW оставалась «Автомобилями Audi» — и заголовком, и адресом,
// и текстом внизу, — хотя показывала BMW.

/**
 * Раздел, под которым уместно показывать выдачу с такими фильтрами. Разбор общий с
 * сервером: фильтры превращаются в тот же адрес каталога, который разбирает он.
 * `preferPath` — раздел, открытый сейчас: пока он остаётся правдой, никуда не уходим.
 */
const landingForFilters = (filters, preferPath = null) => catalogLandingForFilters(savedSearchCatalogHref(filters).split("?")[1] || "", preferPath);

// Запрос числа подходящих машин — те же имена параметров, что собирает каталог.
const savedSearchApiParams = (filters) => {
  const query = new URLSearchParams();
  if (filters.type !== "Все") query.set("type", filters.type);
  if (filters.brand !== "Все марки") query.set("brand", filters.brand);
  appendMulti(query, "model", filters.model, ANY_MODEL);
  appendMulti(query, "bodyType", filters.bodyType, ANY_BODY_TYPE);
  colorValuesForLabels(multiValues(filters.color, ANY_COLOR)).forEach((value) => query.append("color", value));
  if (countryKey(filters.country)) query.set("country", countryKey(filters.country));
    if (filters.drive !== ANY_DRIVE) query.set("drive", filters.drive);
  if (filters.owners !== ANY_OWNERS) query.set("ownersMax", String(filterNumber(filters.owners)));
  if (filters.battery !== ANY_BATTERY) query.set("batteryMin", String(batteryFloor(filters.battery)));
  if (filters.condition !== ANY_CONDITION) query.set("conditionGrade", conditionGrades[filters.condition]);
  if (filters.accel && filters.accel !== ANY_ACCEL) query.set("accelMax", String(filterNumber(filters.accel)));
  if (filters.tire && filters.tire !== ANY_TIRE) query.set("tireRimMin", String(filterNumber(filters.tire)));
  if (filters.range && filters.range !== ANY_RANGE) query.set("rangeMin", String(filterNumber(filters.range)));
  appendEngineRange(query, filters.engine);
  appendPowerRange(query, filters.power);
  if (filters.gearbox && filters.gearbox !== ANY_GEARBOX) query.set("gearbox", filters.gearbox);
  if (filters.fuel && filters.fuel !== ANY_FUEL) query.set("fuel", filters.fuel);
  appendExclusions(query, filters, { api: true });
  appendYearRange(query, filters.yearMin, filters.yearMax);
  appendMileageRange(query, filters.mileage);
  appendPriceRange(query, filters.priceMin, filters.priceMax);
  if (filters.sort && filters.sort !== "default") query.set("sort", filters.sort);
  return query;
};

const matchesSavedFilters = (car, filters) =>
  matchesExclusions(car, filters) &&
  (filters.type === "Все" || car.type === filters.type) &&
  (filters.brand === "Все марки" || car.brand === filters.brand) &&
  matchesMulti(car.model, filters.model, ANY_MODEL) &&
  matchesMulti(car.bodyType, filters.bodyType, ANY_BODY_TYPE) &&
  matchesColorLabels(car.bodyColor, multiValues(filters.color, ANY_COLOR)) &&
  matchesYears(car, filters.yearMin, filters.yearMax) &&
  matchesMileageRange(car, filters.mileage) &&
  matchesPriceRange(car, filters.priceMin, filters.priceMax) &&
  matchesAdvancedFilters(car, filters);

// Five rows of the four-column grid, matching the home page feed.
const SIMILAR_CARS_BATCH = 20;

// Сколько машин той же модели просим у сервера за один раз. Список в странице
// (соседи по модели, встроенные сервером) даёт всего десяток, а первая порция
// каталога подобрана «для разнообразия» — своей модели в ней почти нет, поэтому
// в режиме «Эта модель» спрашиваем каталог отдельным запросом.
const SAME_MODEL_PAGE = 40;

// Машины той же модели: сначала те, что уже есть на руках (встроенные в страницу
// соседи и загруженный каталог) — они показываются мгновенно, — а затем ответ
// каталога, который их заменяет. Запрос уходит только когда переключатель стоит
// на «Эта модель»: на обычном показе похожих он не нужен.
function useSameModelCars(car, active) {
  const [fetched, setFetched] = useState(null);
  const [total, setTotal] = useState(null);
  const [requested, setRequested] = useState(SAME_MODEL_PAGE);
  useEffect(() => {
    setFetched(null);
    setTotal(null);
    setRequested(SAME_MODEL_PAGE);
  }, [car.id]);
  useEffect(() => {
    if (!active || !car.brand || !car.model) return undefined;
    const controller = new AbortController();
    const query = new URLSearchParams({ brand: car.brand, model: car.model, sort: "price_asc", limit: String(requested + 1), offset: "0" });
    fetch(`/api/cars?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("same model catalog unavailable"))))
      .then((catalog) => {
        const items = (catalog.items || []).map(normalizeImportedCar).filter((item) => !sameListing(item.id, car.id));
        setFetched(items.slice(0, requested));
        // Сама машина тоже стоит в этом наборе, поэтому в счёте её не считаем.
        setTotal(Math.max(0, (Number(catalog.total) || items.length) - 1));
      })
      // Каталога по адресу нет (статический показ) или запрос отменён — остаёмся
      // с тем, что уже загружено: блок не пустеет.
      .catch(() => {});
    return () => controller.abort();
  }, [active, car.id, car.brand, car.model, requested]);
  const loadMore = () => setRequested((current) => current + SAME_MODEL_PAGE);
  return { cars: fetched, total, loadMore };
}

// Похожие машины с переключателем: весь подбор или только та же модель. Раньше
// машины той же модели стояли отдельным блоком над похожими; двух почти одинаковых
// сеток подряд слишком много, поэтому теперь это два состояния одного блока.
function SimilarCars({ car, cars, onOpenCar }) {
  const similarPricingOn = useQuotaPricing();
  const similarCars = useMemo(() => selectSimilarCars(car, cars), [car, cars, similarPricingOn]);
  // Карточку, открытую по прямой ссылке, сервер рисует с соседями той же модели
  // (server/car-page.mjs), а подбор «Все» их исключает — до загрузки каталога сетка
  // была пустой, и робот не видел из карточки ни одной ссылки на другие машины.
  // Поэтому, пока других похожих нет, блок открывается на «Этой модели»: сервер и
  // браузер при оживлении получают одно и то же, и после загрузки каталога вид не
  // перескакивает.
  const [sameModelOnly, setSameModelOnly] = useState(() => !similarCars.length);
  const sameModelLoaded = useMemo(
    () =>
      cars
        .filter((candidate) => !sameListing(candidate.id, car.id) && String(candidate.brand) === String(car.brand) && String(candidate.model) === String(car.model))
        .sort((left, right) => (Number(estimateLandedCost(left).totalUsd) || 0) - (Number(estimateLandedCost(right).totalUsd) || 0) || String(left.id).localeCompare(String(right.id))),
    [car, cars, similarPricingOn],
  );
  const sameModelFromCatalog = useSameModelCars(car, sameModelOnly);
  // Порядок один и тот же в обоих случаях — по цене под ключ, той самой, что стоит
  // на карточке: у сервера цена посчитана без выбранного режима цен с квотой.
  const sameModel = useMemo(
    () =>
      (sameModelFromCatalog.cars || sameModelLoaded)
        .slice()
        .sort((left, right) => (Number(estimateLandedCost(left).totalUsd) || 0) - (Number(estimateLandedCost(right).totalUsd) || 0) || String(left.id).localeCompare(String(right.id))),
    [sameModelFromCatalog.cars, sameModelLoaded, similarPricingOn],
  );
  // Переключателя нет, когда машина в каталоге одна такая: кнопка «Эта модель»
  // открывала бы пустую сетку.
  const sameModelReachable = Boolean(car.brand && car.model && (sameModelLoaded.length || sameModelFromCatalog.cars?.length));
  // Открылись на «Этой модели», а таких машин не нашлось, зато подъехали похожие, —
  // показываем их: переключателя в этом случае нет, и вернуться было бы нечем.
  const sameModelView = sameModelOnly && (sameModelReachable || !similarCars.length);
  const shown = sameModelView ? sameModel : similarCars;
  const [visibleCount, setVisibleCount] = useState(SIMILAR_CARS_BATCH);

  useEffect(() => setVisibleCount(SIMILAR_CARS_BATCH), [car.id, sameModelView]);

  if (!similarCars.length && !sameModelReachable) return null;
  // Ещё не загруженные машины той же модели: кнопка «Подгрузить ещё» должна остаться
  // и когда всё загруженное уже показано, а в каталоге таких машин больше.
  const more = sameModelView ? Math.max(shown.length, Number(sameModelFromCatalog.total) || 0) : shown.length;

  return (
    <section className="similar-cars" aria-labelledby="similar-cars-title">
      <div className="similar-cars-heading">
        <h2 id="similar-cars-title">Похожие автомобили {fromPhrase(carOrigin(car))}</h2>
        {sameModelReachable && (
          <div className="brand-type-switch similar-mode-switch" role="group" aria-label="Какие машины показывать">
            <button type="button" className={sameModelView ? "" : "active"} aria-pressed={!sameModelView} onClick={() => setSameModelOnly(false)}>
              Все
            </button>
            <button type="button" className={sameModelView ? "active" : ""} aria-pressed={sameModelView} onClick={() => setSameModelOnly(true)}>
              Эта модель
            </button>
          </div>
        )}
      </div>
      <div className="featured-grid mobile-cards-grid">
        {shown.slice(0, visibleCount).map((candidate) => (
          <FeaturedCard key={candidate.id} car={candidate} onClick={() => onOpenCar(candidate)} />
        ))}
      </div>
      {visibleCount < more && (
        <button
          type="button"
          className="load-more featured-load-more"
          onClick={() => {
            const next = visibleCount + SIMILAR_CARS_BATCH;
            setVisibleCount(next);
            if (sameModelView && next > shown.length) sameModelFromCatalog.loadMore();
          }}
        >
          Подгрузить ещё
        </button>
      )}
    </section>
  );
}

// Частые вопросы по модели: те же плашки, что на главной, плюс разметка для
// поисковика — по ней вопросы и ответы попадают прямо в выдачу.
// Частые вопросы в конце статьи — и в обзорах моделей, и на страницах расчётов.
// Кроме самого блока отдаём разметку FAQPage: по ней вопросы попадают в выдачу
// раскрывающимся списком.
/**
 * Первоисточники внизу материала: откуда взяты ставки, сроки и нормы. Показывается
 * только там, где список заполнен, — выдумывать ссылки под каждый текст нельзя.
 *
 * Ссылки наружу: в новой вкладке (прочитанное не должно закрываться) и с
 * `rel="nofollow"` — вес чужому сайту не передаём. Тот же блок собирает страницу
 * для поисковика, `blogSources` в scripts/generate-seo-pages.mjs.
 */
function ArticleSources({ sources }) {
  if (!sources?.length) return null;
  return (
    <section className="article-sources">
      <h2>Источники</h2>
      <ul>
        {sources.map((source) => (
          <li key={source.url}>
            <ExternalLink href={source.url}>{source.name}</ExternalLink>
            {source.note ? <span> — {source.note}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Разметка вопросов-ответов для поисковика. Её собирают оба блока с пунктами:
   обычный «Частые вопросы» и тот, в котором вопросы идут вперемешку с разделами
   страницы расчёта. */
const faqPageSchema = (faq) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((item) => ({
    "@type": "Question",
    name: item.q,
    // В разметке — чистый текст: поисковик показывает его как есть, и
    // «[калькулятор](/customs)» выглядел бы в выдаче ошибкой.
    acceptedAnswer: { "@type": "Answer", text: plainInlineText(item.a) },
  })),
});

function ArticleFaq({ faq, title, navigate = null }) {
  if (!faq?.length) return null;
  const schema = faqPageSchema(faq);
  return (
    <section className="model-page-faq page-width" aria-labelledby="model-page-faq-title">
      <h2 id="model-page-faq-title">{title}</h2>
      <HomeFaqList
        className="model-page-faq-list"
        items={faq.map((item) => ({ question: item.q, answer: item.a }))}
        navigate={navigate}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </section>
  );
}

// Раздел статьи: абзацы плюс необязательные блоки — список с выделенным началом
// строки, две карточки сравнения и врезка с заметкой. Они разбивают текст и
// вытаскивают из абзацев главное.
function ModelPageSection({ section, navigate }) {
  return (
    <section>
      {/* Заголовка может не быть: внутри раскрывающегося пункта его роль играет
          кнопка самого пункта, и второй такой же заголовок был бы повтором. */}
      {section.title ? <h2>{section.title}</h2> : null}
      {section.paragraphs.map((text) => (
        <p key={text}>{renderInlineText(text, navigate)}</p>
      ))}
      {/* Подразделы: маленький заголовок и пара абзацев. Не блок с подложкой, а просто
          разбивка длинного раздела — пять абзацев подряд читать тяжело, а плашки
          и карточки внутри статьи мешают ещё больше. */}
      {section.parts?.map((part) => (
        <Fragment key={part.title}>
          <h3>{part.title}</h3>
          {part.paragraphs.map((text) => (
            <p key={text}>{renderInlineText(text, navigate)}</p>
          ))}
        </Fragment>
      ))}
      {section.list && (
        <dl className="model-page-points">
          {section.list.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              {/* Ссылки внутри списков и врезок разбираются так же, как в абзацах:
                  в статьях журнала половина полезных переходов в каталог живёт
                  именно в списках, а раньше там оставалась голая разметка. */}
              <dd>{renderInlineText(item.text, navigate)}</dd>
            </div>
          ))}
        </dl>
      )}
      {section.compare && (
        <div className="model-page-compare">
          {section.compare.map((option) => (
            <div key={option.name}>
              <strong>{option.name}</strong>
              <p>{renderInlineText(option.text, navigate)}</p>
            </div>
          ))}
        </div>
      )}
      {/* Нумерованные шаги: порядок действий, где номер несёт смысл — сначала
          документы, потом осмотр, потом расчёт. Обычный список тут врал бы,
          изображая набор равноправных пунктов. */}
      {section.steps && (
        <ol className="article-steps">
          {section.steps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{renderInlineText(step.text, navigate)}</span>
            </li>
          ))}
        </ol>
      )}
      {section.table && (
        <figure className="article-table">
          <div className="article-table-scroll">
            <table>
              <thead>
                <tr>{section.table.head.map((cell) => <th key={cell}>{cell}</th>)}</tr>
              </thead>
              <tbody>
                {section.table.rows.map((row) => (
                  <tr key={row.join("|")}>{row.map((cell, index) => (index ? <td key={cell + index}>{withApprox(cell)}</td> : <th key={cell} scope="row">{cell}</th>))}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {section.table.caption ? <figcaption>{section.table.caption}</figcaption> : null}
        </figure>
      )}
      {/* Свой график: разметку строит общий код, поэтому в приложении и в версии
          для поисковика он один и тот же. */}
      {section.figure && blogFigureHtml(section.figure) ? (
        <div className="article-figure" dangerouslySetInnerHTML={{ __html: blogFigureHtml(section.figure) }} />
      ) : null}
      {section.callout && (
        <aside className="model-page-callout">
          <Info size={20} weight="duotone" />
          <div>
            <strong>{section.callout.title}</strong>
            <p>{renderInlineText(section.callout.text, navigate)}</p>
          </div>
        </aside>
      )}
    </section>
  );
}

// Рекламный блок в разрыве текста: ведёт на страницу «О сервисе», иллюстрацию берём
// оттуда же.
function ModelPagePromo({ navigate }) {
  return (
    <aside className="model-page-promo page-width">
      <div className="model-page-promo-visual">
        <Illustration src="/illustrations/how-it-works-hero.png" alt="" />
      </div>
      <div className="model-page-promo-copy">
        <strong>Как заказать авто {siteFromPhrase()}</strong>
        <p>Сначала подбор, проверка автомобиля и понятная смета, только потом решение, договор и оплата. Дальше машину выкупают, доставляют и выдают в Минске.</p>
        <AppLink className="primary" href="/how-it-works" navigate={navigate}>
          О сервисе <ArrowRight size={18} />
        </AppLink>
      </div>
    </aside>
  );
}

// Фото и цифры для списка обзоров каталог отдаёт одним ответом на все модели сразу:
// фото — с самой доступной машины модели, рядом число машин в наличии, крайние цены до
// Минска, лучший разгон и наибольший запас хода. По ним же работают сортировки списка,
// поэтому переключение сортировки больше ничего не догружает.
//
// Раньше страница спрашивала каталог по одной модели за раз — сто тридцать запросов
// партиями по шесть, и фотографии проявлялись сверху вниз десятки секунд. Без API
// (статическая сборка) ответа нет: список остаётся в исходном порядке и без фото.
// Цифры моделей для указателя обзоров: карточки модели по ответу /api/model-facts.
function modelsIndexFactsFrom(data) {
  // Ключ — марка и модель вместе: у разных марок бывают одноимённые модели.
  const byModel = new Map((data.models || []).map((row) => [`${row.brand}\u0000${row.model}`, row]));
  const next = {};
  for (const modelPage of MODEL_PAGES) {
    const row = byModel.get(`${modelPage.brand}\u0000${modelPage.model}`);
    if (!row) continue;
    next[modelPage.slug] = {
      image:imageSource(row.image || null, IMAGE_WIDTH_TILE) || null,
      // Исходный адрес держим рядом: на него подменяем кадр, если хранилище не
      // отдало уменьшенный.
      imageFull:row.image || null,
      count:Number(row.count) || 0,
      priceMin:Number(row.priceMin) || null,
      priceMax:Number(row.priceMax) || null,
      accel:Number(row.accel) || null,
      range:Number(row.range) || null,
      // Типы двигателя машин этой модели в наличии — сама модель может
      // продаваться и электромобилем, и гибридом (BYD Han и другие).
      types:new Set(row.powertrains || []),
    };
  }
  return next;
}

function useModelsIndexFacts() {
  // Ответ из заранее собранной страницы (src/boot-api.js) — для первого кадра.
  const [facts, setFacts] = useState(() => {
    const embedded = embeddedApiValue("/api/model-facts");
    return embedded ? modelsIndexFactsFrom(embedded) : {};
  });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/model-facts", { signal:controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("model facts unavailable"))))
      .then((data) => setFacts(modelsIndexFactsFrom(data)))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return facts;
}

// Марки для фильтра — только те, у которых есть обзор; порядок алфавитный.
const MODELS_INDEX_ALL_BRANDS = "Все марки";

const MODELS_INDEX_BRANDS = [MODELS_INDEX_ALL_BRANDS, ...Array.from(new Set(MODEL_PAGES.map((modelPage) => modelPage.brand))).sort((a, b) => a.localeCompare(b, "ru"))];

// Тип двигателя: те же варианты, что в каталоге. Модель считается электромобилем,
// гибридом или бензиновой по машинам этой модели в наличии — некоторые модели
// продаются и так, и так (BYD Han, Li Auto L7 и другие), тогда они попадают в оба
// раздела фильтра.
const MODELS_INDEX_ALL_TYPE = "Все типы";

const MODELS_INDEX_TYPES = [MODELS_INDEX_ALL_TYPE, ...POWERTRAIN_TABS.slice(1)];

// Сколько обзоров показывать сразу и на сколько увеличивать список по кнопке
// «Подгрузить ещё» — список приходит на клиент целиком, догружать с сервера нечего.
const MODELS_INDEX_BATCH = 24;

// Сортировки списка обзоров. Цена, разгон и запас хода — по самой подходящей машине
// модели в каталоге: дешёвые считаем по самой доступной, дорогие — по самой дорогой,
// разгон и запас хода — по лучшей версии в наличии. Название берём из конфига.
const MODELS_INDEX_SORTS = [
  { value: "default", label: "По умолчанию" },
  { value: "cars_desc", label: "Больше в наличии", field: "count", direction: "desc" },
  { value: "price_asc", label: "Сначала дешёвые", field: "priceMin", direction: "asc" },
  { value: "price_desc", label: "Сначала дорогие", field: "priceMax", direction: "desc" },
  { value: "accel_asc", label: "С самым быстрым разгоном", field: "accel", direction: "asc" },
  { value: "range_desc", label: "С наибольшим запасом хода", field: "range", direction: "desc" },
  { value: "name_asc", label: "По названию" },
];

// Общая страница «О моделях авто»: вступление, поиск и список обзоров. Вёрстка та же,
// что у самих обзоров, — блоки с текстом и рекламный блок сервиса между ними.
function ModelsIndexPage({ navigate }) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState(MODELS_INDEX_ALL_BRANDS);
  const [type, setType] = useState(MODELS_INDEX_ALL_TYPE);
  const [sort, setSort] = useState("default");
  const [visibleCount, setVisibleCount] = useState(MODELS_INDEX_BATCH);
  const facts = useModelsIndexFacts();
  // Ищем так же, как в списках марок: понимаем часть слова, кириллицу («ауди»)
  // и набранное не в той раскладке.
  const searchVariants = listSearchVariants(query);
  const selectedSort = MODELS_INDEX_SORTS.find((option) => option.value === sort) || MODELS_INDEX_SORTS[0];
  // Сколько обзоров у каждой марки — числом рядом с маркой в списке выбора.
  const brandCounts = useMemo(() => {
    const counts = new Map([[MODELS_INDEX_ALL_BRANDS, MODEL_PAGES.length]]);
    for (const modelPage of MODEL_PAGES) counts.set(modelPage.brand, (counts.get(modelPage.brand) || 0) + 1);
    return counts;
  }, []);
  const found = useMemo(() => {
    const wantedType = type === MODELS_INDEX_ALL_TYPE ? null : typeValue(type);
    const matches = MODEL_PAGES.filter(
      (modelPage) =>
        (brand === MODELS_INDEX_ALL_BRANDS || modelPage.brand === brand) &&
        // Модель без машин в наличии не знает своего типа — под конкретный фильтр
        // (не «Все типы») она не попадает.
        (!wantedType || facts[modelPage.slug]?.types?.has(wantedType)) &&
        (!searchVariants.length || (() => {
          const haystack = searchNormalize(`${modelPage.name} ${modelPage.brand} ${modelPage.tagline} ${modelPage.teaser}`);
          return searchVariants.some((variant) => haystack.includes(variant));
        })()),
    );
    if (sort === "default") return matches;
    if (sort === "name_asc") return [...matches].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const option = MODELS_INDEX_SORTS.find((item) => item.value === sort);
    if (!option?.field) return matches;
    // Модели, по которым каталог ещё не ответил, уходят в конец: иначе они
    // вставали бы в начало как «ноль машин» и «нулевая цена».
    const rank = (modelPage) => Number(facts[modelPage.slug]?.[option.field]) || null;
    return [...matches].sort((a, b) => {
      const left = rank(a);
      const right = rank(b);
      if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
      return option.direction === "asc" ? left - right : right - left;
    });
  }, [brand, type, searchVariants.join("|"), sort, facts]);
  // Список короче фильтра — а не наоборот — не остаётся с кнопкой «подгрузить»
  // в никуда: любая смена фильтра или поиска возвращает список к первой порции.
  useEffect(() => setVisibleCount(MODELS_INDEX_BATCH), [brand, type, searchVariants.join("|"), sort]);
  const visible = found.slice(0, visibleCount);
  return (
    <main className="model-page">
      <div className="model-page-reading">
      <div className="model-page-body page-width">
        <section className="model-page-hero">
          <div className="model-page-hero-copy">
            <h1>{MODELS_INDEX.h1}</h1>
            <p>{MODELS_INDEX.lead}</p>
          </div>
        </section>
      </div>
      <div className="model-page-body page-width">
        <article className="model-page-article">
          <section>
            <h2>{MODELS_INDEX.listTitle}</h2>
            <SearchField
              className="models-index-search"
              value={query}
              placeholder="Поиск по моделям: Tesla, кроссовер, бензин…"
              ariaLabel="Поиск по обзорам моделей"
              onValueChange={setQuery}
            />
            {/* Под поиском: тип двигателя, затем марка, справа сортировка. */}
            <div className="models-index-controls">
              <SelectField className="models-index-select" label="Тип" value={type} options={MODELS_INDEX_TYPES} onChange={setType} />
              <SelectField className="models-index-select" label="Марка" value={brand} options={MODELS_INDEX_BRANDS} onChange={setBrand} optionCounts={brandCounts} searchable />
              <SelectField
                className="models-index-select models-index-select-sort"
                label="Сортировка"
                value={selectedSort.label}
                options={MODELS_INDEX_SORTS.map((option) => option.label)}
                onChange={(label) => setSort(MODELS_INDEX_SORTS.find((option) => option.label === label)?.value || "default")}
              />
            </div>
            {found.length ? (
              <>
                <div className="models-index-list">
                  {visible.map((modelPage) => (
                    <AppLink key={modelPage.slug} href={modelPage.path} navigate={navigate}>
                      <div className="models-index-photo">
                        {facts[modelPage.slug]?.image && <img src={facts[modelPage.slug].image} alt="" loading="lazy" onError={(event) => retryWithFullImage(event, facts[modelPage.slug].imageFull)} />}
                      </div>
                      <div className="models-index-copy">
                        <strong>{modelPage.name}</strong>
                        <p>{modelPage.teaser}</p>
                      </div>
                    </AppLink>
                  ))}
                </div>
                {visibleCount < found.length && (
                  <button type="button" className="load-more featured-load-more" onClick={() => setVisibleCount((current) => current + MODELS_INDEX_BATCH)}>
                    Показать ещё
                  </button>
                )}
              </>
            ) : (
              <p className="catalog-message">Ничего не нашлось. Попробуйте другую марку, тип кузова или «бензин».</p>
            )}
          </section>
        </article>
      </div>
      {/* Общий текст о китайском рынке стоит после списка обзоров: сначала человек
          видит, что вообще есть, и только потом читает объяснения. */}
      <div className="model-page-body page-width">
        <article className="model-page-article">
          {MODELS_INDEX.sections.map((section) => (
            <ModelPageSection key={section.title} section={section} navigate={navigate} />
          ))}
        </article>
      </div>
      {/* Все модели списком по маркам — ссылками, одним блоком. Сетка выше показывает
          по 24 карточки за раз; до 26.09.2026 полный перечень видел только робот в
          отдельной копии страницы, теперь он общий для всех. */}
      <div className="model-page-body page-width">
        <section className="catalog-landing-notes" aria-labelledby="models-index-all-title">
          <h2 id="models-index-all-title">Все модели по маркам</h2>
          {MODELS_INDEX_BRANDS.filter((name) => name !== MODELS_INDEX_ALL_BRANDS).map((name) => (
            <div className="catalog-landing-links" key={name}>
              <b>{name}</b>
              <div>
                {MODEL_PAGES.filter((modelPage) => modelPage.brand === name).map((modelPage) => (
                  <AppLink key={modelPage.slug} href={modelPage.path} navigate={navigate}>{modelPage.name}</AppLink>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
      </div>
      <ModelPagePromo navigate={navigate} />
    </main>
  );
}

// Текст обзора лежит отдельным файлом и грузится, когда страницу открыли. По прямой
// ссылке он уже загружен (main.jsx ждёт его до запуска приложения), а при переходе
// внутри сайта появляется через мгновение — заголовок, фотографии и машины в наличии
// показываются сразу и не ждут текста.
function useModelText(slug) {
  const [text, setText] = useState(() => loadedModelText(slug));
  useEffect(() => {
    const ready = loadedModelText(slug);
    setText(ready);
    if (ready) return undefined;
    let alive = true;
    // Файл не пришёл (сеть) — страница остаётся без текста, следующий заход попробует снова.
    loadModelText(slug).then((loaded) => {
      if (alive) setText(loaded);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug]);
  return text;
}

/* Под выдачей на странице модели: сводка по живым цифрам, обзор (если написан),
   вопросы и ссылки. Только на первой странице списка — дальше только ссылки. */
function ModelLandingNotes({ landing, page, navigate }) {
  const { facts, review, links, name } = landing;
  const text = useModelText(review?.slug || null);
  // Цифры ещё едут (переход на другую модель): блок появится вместе с ними.
  if (!facts) return null;
  if (page > 1) return <ModelPageWays model={landing} links={links} navigate={navigate} className="model-page-ways" />;
  const autoText = modelAutoText({ name, facts });
  const faq = modelFaq({ name, facts, review: text ? { faq: text.faq } : null });
  const sections = text?.sections || [];
  return (
    <section className="catalog-landing-notes catalog-landing-article model-landing-notes" aria-labelledby="model-landing-notes-title">
      <div className="model-page-article">
        <div className="model-page-intro model-page-summary">
          <h2 id="model-landing-notes-title">{name} в каталоге: что есть и почём</h2>
          {autoText.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        {text && (
          <div className="model-page-intro">
            <h2>Обзор {name}</h2>
            {text.intro.map((paragraph) => (
              <p key={paragraph}>{renderInlineText(paragraph, navigate)}</p>
            ))}
          </div>
        )}
        {text?.stats && (
          <div className="model-page-numbers">
            {text.stats.map((stat) => (
              <div key={stat.label}>
                <strong>{withApprox(stat.value)}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        )}
        {sections.map((section) => (
          <ModelPageSection key={section.title} section={section} navigate={navigate} />
        ))}
        {text?.versions && (
          <section className="model-page-versions">
            <h2>{text.versions.title}</h2>
            <div className="model-page-versions-cards">
              {text.versions.rows.map((row) => (
                <div key={row.join("-")}>
                  <strong>{row[0]}</strong>
                  <dl>
                    {text.versions.columns.slice(1).map((column, index) => {
                      const value = row[index + 1];
                      return (
                        <div key={column}>
                          <dt>{column}</dt>
                          <dd>{yuanToUsdAbout(value) || value}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              ))}
            </div>
            <p className="model-page-versions-note">{text.versions.note}</p>
          </section>
        )}
      </div>
      {faq.length > 0 && (
        <div className="catalog-landing-faq">
          <h3>{modelFaqTitle(name)}</h3>
          <HomeFaqList className="model-page-faq-list" items={faq.map((item) => ({ question: item.q, answer: item.a }))} navigate={navigate} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema(faq)) }} />
        </div>
      )}
      <ModelPageWays model={landing} links={links} navigate={navigate} className="model-page-ways" />
      {text?.disclaimer && <p className="model-page-disclaimer">{text.disclaimer}</p>}
    </section>
  );
}

/* Куда идти со страницы модели: раздел марки, разделы каталога и ценовая полоса,
   другие модели марки, материалы журнала. Списки приходят с сервера вместе с данными
   страницы — одни и те же у готовой разметки и у оживлённой. */
function ModelPageWays({ model, links, navigate, className = "model-page-ways page-width" }) {
  const sections = links?.sections || [];
  const siblings = links?.siblings || [];
  const similar = links?.similar || [];
  const journal = links?.journal || [];
  if (!sections.length && !siblings.length && !similar.length && !journal.length && !links?.brandPath) return null;
  return (
    <section className={className} aria-labelledby="model-page-ways-title">
      <h2 id="model-page-ways-title">Где смотреть {model.name} и похожие машины</h2>
      {(sections.length > 0 || links?.brandPath) && (
        <div className="catalog-landing-links">
          <b>Разделы каталога</b>
          <div>
            {links?.brandPath && <AppLink href={links.brandPath} navigate={navigate}>Все {model.brand} {siteFromPhrase()}</AppLink>}
            {sections.map((landing) => (
              <AppLink key={landing.path} href={landing.path} navigate={navigate}>{landing.name}</AppLink>
            ))}
          </div>
        </div>
      )}
      {journal.length > 0 && (
        <div className="catalog-landing-links">
          <b>В журнале</b>
          <div>
            {journal.map((post) => (
              <AppLink key={post.path} href={post.path} navigate={navigate}>{post.name}</AppLink>
            ))}
          </div>
        </div>
      )}
      {siblings.length > 0 && (
        <div className="catalog-landing-links">
          <b>Другие модели {model.brand}</b>
          <div>
            {siblings.map((page) => (
              <AppLink key={page.path} href={page.path} navigate={navigate}>{page.name}</AppLink>
            ))}
          </div>
        </div>
      )}
      {similar.length > 0 && (
        <div className="catalog-landing-links">
          <b>Похожие модели других марок</b>
          <div>
            {similar.map((page) => (
              <AppLink key={page.path} href={page.path} navigate={navigate}>{page.name}</AppLink>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// Выбрано ли в фильтрах хоть что-то и «чистый» набор фильтров. Ими пользуются и сама
// панель, и строка «Сохранить поиск / Сбросить» над ней в каталоге.
const catalogFiltersActive = (filters) => filters.type !== "Все" || filters.brand !== "Все марки" || multiValues(filters.model, ANY_MODEL).length > 0 || multiValues(filters.bodyType, ANY_BODY_TYPE).length > 0 || multiValues(filters.color, ANY_COLOR).length > 0 || hasYearRange(filters.yearMin, filters.yearMax) || filters.mileage !== ANY_MILEAGE || hasPriceRange(filters.priceMin, filters.priceMax) || (filters.country || ANY_COUNTRY) !== ANY_COUNTRY || filters.drive !== ANY_DRIVE || filters.owners !== ANY_OWNERS || filters.battery !== ANY_BATTERY || filters.condition !== ANY_CONDITION || filters.accel !== ANY_ACCEL || filters.tire !== ANY_TIRE || (filters.range || ANY_RANGE) !== ANY_RANGE || (filters.engine || ANY_ENGINE) !== ANY_ENGINE || (filters.power || ANY_POWER) !== ANY_POWER || (filters.gearbox || ANY_GEARBOX) !== ANY_GEARBOX || (filters.fuel || ANY_FUEL) !== ANY_FUEL || hasExclusions(filters);

const emptyCatalogFilters = () => ({
  type: "Все",
  brand: "Все марки",
  model: [],
  bodyType: [],
  color: [],
  yearMin: ANY_YEAR_MIN,
  yearMax: ANY_YEAR_MAX,
  mileage: ANY_MILEAGE,
  priceMin: ANY_PRICE_MIN,
  priceMax: ANY_PRICE_MAX,
  country: ANY_COUNTRY,
  drive: ANY_DRIVE,
  owners: ANY_OWNERS,
  battery: ANY_BATTERY,
  condition: ANY_CONDITION,
  accel: ANY_ACCEL,
  tire: ANY_TIRE,
  range: ANY_RANGE,
  engine: ANY_ENGINE,
  power: ANY_POWER,
  gearbox: ANY_GEARBOX,
  fuel: ANY_FUEL,
  text: "",
  ...emptyExclusions(),
});

function FilterPanel({ filters, setFilters, resultCount, brands, models, bodyTypes, drives, countries = [ANY_COUNTRY], optionCounts, availability, onSaveSearch, searchSaved, searchUpdate, expanded = false, onExpandedChange = null, currentPath = null, currentLanding = null }) {
  const update = (key) => (value) => setFilters((old) => ({ ...old, [key]: value }));
  // Модель не сбрасываем: её выбирал посетитель, см. такой же changeType выше.
  const changeType = (value) => setFilters((old) => ({ ...old, type: value, ...POWERTRAIN_FILTER_RESET }));
  const changeBrand = (value) => setFilters((old) => ({ ...old, brand: value, model: [] }));
  const selectedType = tabLabel(filters.type, filters.fuel);
  const selectType = (value) => setFilters((old) => ({ ...old, ...POWERTRAIN_FILTER_RESET, ...tabSelection(value) }));
  const hasActiveFilters = catalogFiltersActive(filters);
  // «Сбросить» очищает всё, кроме марки и модели (решение Сергея 25.09.2026): человек
  // пришёл на страницу Audi или Audi A6 и сбрасывает год, цену, пробег — а не уходит
  // в общий каталог. Нечего сбрасывать, кроме марки и модели, — кнопки нет.
  const resetFilters = () => setFilters((old) => ({ ...emptyCatalogFilters(), brand: old.brand, model: old.model }));
  const canReset = catalogFiltersActive({ ...filters, brand: "Все марки", model: [] });
  // Куда приведёт выбор пункта — тем же правилом, по которому каталог переходит на
  // раздел после смены фильтров (landingForFilters в эффекте Catalog). Ссылкой пункт
  // становится, только если это другой уже существующий раздел: сочетания без своей
  // страницы и выбор, оставляющий на месте, остаются кнопками — новых адресов для
  // поисковика фильтр не порождает. Просчёт 25.09.2026: по всем 155 страницам ссылки
  // ведут только на 154 существующих раздела, и до каждого из них можно дойти.
  const hrefFor = (next) => {
    // На странице модели каталог остаётся на ней, пока выбраны её марка и она сама
    // (то же правило в эффекте Catalog): кузов или тип двигателя её не отменяют.
    if (currentLanding?.kind === "model") {
      const models = multiValues(next.model, ANY_MODEL);
      if (next.brand === currentLanding.brand && models.length === 1 && models[0] === currentLanding.model) return null;
    }
    const path = currentPath ? landingForFilters(next, currentPath)?.path : null;
    return path && path !== currentPath ? { href: path } : null;
  };
  const optionHrefs = currentPath ? {
    brand: (value) => hrefFor({ ...filters, brand: value, model: [] }),
    type: (label) => hrefFor({ ...filters, ...POWERTRAIN_FILTER_RESET, ...tabSelection(label) }),
    bodyType: (value) => {
      const chosen = multiValues(filters.bodyType, ANY_BODY_TYPE);
      const next = value === ANY_BODY_TYPE ? [] : chosen.includes(value) ? chosen.filter((item) => item !== value) : [...chosen, value];
      return hrefFor({ ...filters, bodyType: next });
    },
  } : null;
  return (
    <VehicleSearch
      optionHrefs={optionHrefs}
      canReset={canReset}
      selectedType={selectedType}
      onTypeChange={selectType}
      values={filters}
      actions={{
        brand: changeBrand,
        model: update("model"),
        yearMin: (value) => setFilters((old) => ({ ...old, yearMin: value, yearMax: clampYearMax(value, old.yearMax) })),
        yearMax: update("yearMax"),
        priceMin: (value) => setFilters((old) => ({ ...old, priceMin: value, priceMax: clampPriceMax(value, old.priceMax) })),
        priceMax: update("priceMax"),
        mileage: update("mileage"),
        bodyType: update("bodyType"),
        color: update("color"),
        country: update("country"),
        drive: update("drive"),
        owners: update("owners"),
        battery: update("battery"),
        condition: update("condition"),
        accel: update("accel"),
        tire: update("tire"),
        range: update("range"),
        engine: update("engine"),
        power: update("power"),
        gearbox: update("gearbox"),
        fuel: update("fuel"),
        removeExclusion: (key, value) => setFilters((old) => ({ ...old, [key]: exclusionValues(old, key).filter((item) => item !== value) })),
      }}
      options={{ brands: ["Все марки", ...brands], models, bodyTypes, drives, countries }}
      optionCounts={optionCounts}
      availability={availability}
      resultCount={resultCount}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      onSaveSearch={onSaveSearch}
      searchSaved={searchSaved}
      searchUpdate={searchUpdate}
      onExpandedChange={onExpandedChange}
      initiallyExpanded={expanded || filters.type !== "Все" || filters.mileage !== ANY_MILEAGE || multiValues(filters.bodyType, ANY_BODY_TYPE).length > 0 || multiValues(filters.color, ANY_COLOR).length > 0 || filters.drive !== ANY_DRIVE || filters.owners !== ANY_OWNERS || filters.battery !== ANY_BATTERY || filters.condition !== ANY_CONDITION || filters.accel !== ANY_ACCEL || filters.tire !== ANY_TIRE || (filters.range || ANY_RANGE) !== ANY_RANGE || (filters.engine || ANY_ENGINE) !== ANY_ENGINE || (filters.power || ANY_POWER) !== ANY_POWER || (filters.gearbox || ANY_GEARBOX) !== ANY_GEARBOX || (filters.fuel || ANY_FUEL) !== ANY_FUEL}
    />
  );
}

// Карточки, догруженные для избранного, живут до перезагрузки страницы: страница
// «Избранное» размонтируется при каждом уходе, и без этой памяти каждый заход
// заново качал бы те же машины, мигая загрузчиком вместо готового списка.
const favoriteCarCache = new Map();

function useFavoriteCars(cars, favorites, apiMode, onUnavailable) {
  const [loadedCars, setLoadedCars] = useState(() => [...favoriteCarCache.values()]);
  const favoriteKey = [...favorites].sort().join("|");
  const allCars = useMemo(() => {
    const values = new Map(cars.map((car) => [car.id,car]));
    loadedCars.forEach((car) => values.set(car.id,car));
    return [...values.values()];
  }, [cars,loadedCars]);
  // Порядок берём из набора избранного, а не из каталога: свежая машина сохраняется первой и остаётся наверху.
  const favoriteCars = [...favorites].flatMap((id) => {
    const car = allCars.find((item) => item.id === id);
    return car ? [car] : [];
  });
  const knownIds = new Set(allCars.map((car) => car.id));
  const missingIds = [...favorites].filter((id) => !knownIds.has(id));
  const missingKey = missingIds.sort().join("|");

  useEffect(() => {
    // apiMode ещё не определён (null) — не знаем, куда идти за карточкой; дождёмся
    // ответа загрузки, иначе запрос в чужой слой пометил бы живую машину недоступной.
    if (!missingIds.length || apiMode === null) return undefined;
    const controller = new AbortController();
    Promise.all(missingIds.map(async (id) => {
      try {
        const url = apiMode
          ? `/api/cars/${encodeURIComponent(id)}`
          : `${import.meta.env.BASE_URL}data/cars/${encodeURIComponent(listingNumber(id))}.json`;
        const response = await fetch(url, { cache:"no-store", signal:controller.signal });
        if (response.status === 404) return { id, unavailable:missingFavoriteIsExpired(apiMode, response.status) };
        if (!response.ok) throw new Error("favorite_car_load_failed");
        return { id, car:normalizeImportedCar(await response.json()) };
      } catch (error) {
        if (error?.name === "AbortError") return null;
        return { id, unavailable:false };
      }
    })).then((results) => {
      if (controller.signal.aborted) return;
      const resolved = results.flatMap((result) => result?.car ? [result.car] : []);
      const unavailable = results.flatMap((result) => result?.unavailable ? [result.id] : []);
      if (resolved.length) {
        resolved.forEach((car) => favoriteCarCache.set(car.id, car));
        setLoadedCars((current) => {
          const values = new Map(current.map((car) => [car.id,car]));
          resolved.forEach((car) => values.set(car.id,car));
          return [...values.values()];
        });
      }
      if (unavailable.length) onUnavailable(unavailable);
    });
    return () => controller.abort();
  }, [apiMode,favoriteKey,missingKey,onUnavailable]);

  return { favoriteCars, hasUnresolved:missingIds.length > 0 };
}

function Favorites({ navigate, favorites, toggleFavorite, cars, apiMode, onUnavailableFavorites, saving = false }) {
  const { favoriteCars, hasUnresolved } = useFavoriteCars(cars, favorites, apiMode, onUnavailableFavorites);
  const { openQuickView, quickViewToggle, quickViewModal } = useVehicleQuickView({ apiMode:apiMode !== false, favorites, toggleFavorite, navigate });
  const sortOptions = [
    { value: "default", label: "По добавлению" },
    { value: "price_asc", label: "Дешёвые" },
    { value: "price_desc", label: "Дорогие" },
    { value: "mileage_asc", label: "С наименьшим пробегом" },
    { value: "range_desc", label: "С наибольшим запасом хода" },
    { value: "year_desc", label: "Новые по году" },
    { value: "year_asc", label: "Старые по году" },
  ];
  const [sort, setSort] = useState("default");
  const selectedSort = sortOptions.find((option) => option.value === sort) || sortOptions[0];
  // «По добавлению» — родной порядок избранного: свежесохранённая машина сверху.
  // Карточки из API не несут готовый итог «до Минска» (каталог сортирует по нему
  // на сервере), поэтому для локальной сортировки по цене считаем его здесь.
  const sortableCars = favoriteCars.map((car) => (Number(car.estimatedTotalUsd) ? car : { ...car, estimatedTotalUsd: estimateLandedCost(car).totalUsd }));
  const sortedCars = sort === "default" ? favoriteCars : sortCars(sortableCars, sort);
  // Вид выдачи общий с каталогом: переключили здесь — каталог откроется так же.
  // На телефоне плитка идёт двумя карточками в ряд (см. .mobile-cards-grid).
  const [view, setView] = useState(readCatalogView);
  const updateView = (value) => {
    setView(value);
    window.localStorage.setItem(catalogViewKey, value);
  };
  const openCar = (car) => {
    if (openQuickView(car)) return;
    navigate(carHref(car));
  };
  // The car saved during registration lands here a moment after the page does, so the
  // empty state would be a lie for that moment.
  const awaitingCars = hasUnresolved || saving;
  return (
    <main className="catalog favorites-page page-width">
      <Breadcrumbs>
        <CrumbLink href="/" onOpen={() => navigate("/")}>Главная</CrumbLink>
        <span>/</span>
        <span>Избранное</span>
      </Breadcrumbs>
      <div className="catalog-heading">
        <div className="section-heading-title">
          <h1>Избранное · {hasUnresolved ? favorites.size : favoriteCars.length}</h1>
          {quickViewToggle}
        </div>
        {favoriteCars.length > 0 && (
          <div className="result-controls">
            <SelectField className="sort-custom-select" label="Сортировка" value={selectedSort.label} options={sortOptions.map((option) => option.label)} onChange={(label) => setSort(sortOptions.find((option) => option.label === label)?.value || "default")} />
            <ViewToggle value={view} onChange={updateView} />
          </div>
        )}
      </div>
      {sortedCars.length ? (
        view === "grid" ? (
          <div className="featured-grid catalog-card-grid mobile-cards-grid">
            {sortedCars.map((car) => (
              <FeaturedCard key={car.id} car={car} favorite toggleFavorite={toggleFavorite} onClick={() => openCar(car)} />
            ))}
          </div>
        ) : (
          <div className="car-list">
            {sortedCars.map((car) => (
              <CarRow key={car.id} car={car} navigate={navigate} favorite toggleFavorite={toggleFavorite} onOpen={openCar} />
            ))}
          </div>
        )
      ) : awaitingCars ? (
        <div className="account-section-loading" aria-live="polite">Загружаем сохранённые автомобили…</div>
      ) : (
        <EmptyState
          className="favorites-empty"
          icon={Heart}
          iconSize={34}
          title="В избранном пока ничего нет"
          description="Нажмите на сердце в карточке автомобиля, чтобы сохранить его здесь."
        >
          <button className="primary" onClick={() => navigate("/catalog")}>Перейти в каталог</button>
        </EmptyState>
      )}
      <ScrollToTopButton />
      {quickViewModal}
    </main>
  );
}

// Дата сохранения поиска — коротко, по-русски: «12 августа» либо с годом, если он не текущий.
const savedSearchDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const options = { day:"numeric", month:"long" };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
  return new Intl.DateTimeFormat("ru-RU", options).format(date);
};

// Шесть машин, седьмая ячейка ряда — блок-стрелка «смотреть все» в каталоге.
const SAVED_SEARCH_PREVIEW_LIMIT = 6;

const savedSearchSkeletons = ["a", "b", "c", "d", "e", "f", "g"];

// Подтверждение перед удалением сохранённого поиска: восстановить его нельзя,
// поэтому случайный клик по «Удалить поиск» не должен стоить набора фильтров.
function SavedSearchRemovalModal({ search, onCancel, onConfirm }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="lead-modal order-removal-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="search-removal-title" aria-describedby="search-removal-description">
        <button className="modal-close" type="button" onClick={onCancel} aria-label="Закрыть"><X size={19} /></button>
        <h2 id="search-removal-title">Удалить поиск?</h2>
        <p id="search-removal-description"><b>{search.title}</b> исчезнет из «Моих поисков». Автомобили останутся в каталоге — удалится только сохранённый набор фильтров.</p>
        <div className="order-removal-actions">
          <button className="secondary" type="button" onClick={onCancel}>Отмена</button>
          <button className="danger-button solid" type="button" onClick={onConfirm}><Trash size={18} /> Удалить поиск</button>
        </div>
      </section>
    </div>
  );
}

function SavedSearchesPage({ navigate, searches, onDelete, saving = false, apiMode, cars, favorites, toggleFavorite }) {
  const currency = useCurrency();
  const [removing, setRemoving] = useState(null);
  const { openQuickView, quickViewToggle, quickViewModal } = useVehicleQuickView({ apiMode:apiMode !== false, favorites, toggleFavorite, navigate });
  // Под каждым поиском — число подходящих машин и до пяти первых карточек-превью:
  // в API-режиме — короткие запросы с limit=5 (сервер их кэширует), в статическом —
  // подбор по загруженному каталогу.
  const useApi = apiMode !== false;
  const [previews, setPreviews] = useState({});
  const searchesFingerprint = searches.map((item) => item.id).join("|");
  useEffect(() => {
    if (!searches.length) return undefined;
    if (!useApi) {
      setPreviews(Object.fromEntries(searches.map((item) => {
        const matching = cars.filter((car) => matchesSavedFilters(car, normalizeSavedFilters(item.filters)));
        return [item.id, { total:matching.length, items:matching.slice(0, SAVED_SEARCH_PREVIEW_LIMIT) }];
      })));
      return undefined;
    }
    const controller = new AbortController();
    Promise.all(
      searches.map(async (item) => {
        try {
          const query = savedSearchApiParams(normalizeSavedFilters(item.filters));
          query.set("limit", String(SAVED_SEARCH_PREVIEW_LIMIT));
          const response = await fetch(`/api/cars?${query}`, { signal:controller.signal });
          if (!response.ok) return null;
          const payload = await response.json();
          return [item.id, { total:Number(payload.total) || 0, items:(payload.items || []).map(normalizeImportedCar) }];
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (!controller.signal.aborted) setPreviews(Object.fromEntries(entries.filter(Boolean)));
    });
    return () => controller.abort();
  }, [useApi, searchesFingerprint]);
  const openSearch = (item) => navigate(savedSearchCatalogHref(normalizeSavedFilters(item.filters)));
  // На десктопе с включённым быстрым просмотром карточка раскрывается модалкой,
  // как в каталоге; иначе — обычный переход на страницу машины.
  const openCar = (car) => {
    if (openQuickView(car)) return;
    navigate(carHref(car));
  };
  return (
    <main className="catalog saved-searches-page page-width">
      <Breadcrumbs>
        <CrumbLink href="/" onOpen={() => navigate("/")}>Главная</CrumbLink>
        <span>/</span>
        <span>Мои поиски</span>
      </Breadcrumbs>
      <div className="catalog-heading">
        <div className="section-heading-title">
          <h1>Мои поиски · {searches.length}</h1>
          {quickViewToggle}
        </div>
      </div>
      {searches.length ? (
        <div className="saved-search-list">
          {searches.map((item) => {
            const preview = previews[item.id];
            const savedAt = savedSearchDate(item.createdAt);
            return (
              <article key={item.id} className="saved-search-card">
                <div className="saved-search-head">
                  <button type="button" className="saved-search-main" onClick={() => openSearch(item)} aria-label={`Открыть поиск «${item.title}» в каталоге`}>
                    <span className="saved-search-title-line">
                      <strong className="saved-search-title">{item.title}</strong>
                      {preview && (
                        <>
                          <span className="saved-search-dot" aria-hidden="true">·</span>
                          <b className="saved-search-count">{number(preview.total)} авто</b>
                        </>
                      )}
                      {savedAt && (
                        <>
                          <span className="saved-search-dot" aria-hidden="true">·</span>
                          <span className="saved-search-date">Сохранён {savedAt}</span>
                        </>
                      )}
                    </span>
                  </button>
                  {/* На телефоне подпись не помещается рядом с заголовком — остаётся корзинка. */}
                  <button type="button" className="saved-search-delete" onClick={() => setRemoving(item)} aria-label={`Удалить поиск «${item.title}»`} title="Удалить поиск">
                    <Trash size={18} aria-hidden="true" />
                    <span>Удалить поиск</span>
                  </button>
                </div>
                {preview ? (
                  preview.items.length > 0 && (
                    <div className="saved-search-previews">
                      {preview.items.map((car) => (
                        <article
                          key={car.id}
                          className="saved-search-preview"
                          data-car-id={car.id}
                          onClick={() => openCar(car)}
                          onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && openCar(car)}
                          tabIndex="0"
                          role="button"
                          aria-label={`Открыть ${car.title}`}
                        >
                          <HoverImagePreview car={car} className="saved-search-preview-image" />
                          <span className="saved-search-preview-price"><ApproxSign /> {bynify(money(estimateLandedCost(car).totalUsd, currency))}</span>
                        </article>
                      ))}
                      <button type="button" className="saved-search-more" onClick={() => openSearch(item)} aria-label={`Показать все ${number(preview.total)} авто по поиску «${item.title}»`}>
                        <span className="saved-search-more-circle" aria-hidden="true">
                          <ArrowRight size={20} weight="bold" />
                        </span>
                        <span>Смотреть все</span>
                      </button>
                    </div>
                  )
                ) : (
                  // Пока превью в пути, их место держат мерцающие заглушки той же
                  // геометрии — карточка не прыгает, когда ответ приходит.
                  <div className="saved-search-previews" aria-hidden="true">
                    {savedSearchSkeletons.map((key) => (
                      <div key={key} className="saved-search-preview skeleton-card">
                        <div className="saved-search-preview-image" />
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : saving ? (
        <div className="account-section-loading" aria-live="polite">Загружаем сохранённые поиски…</div>
      ) : (
        <EmptyState
          className="saved-searches-empty"
          icon={BookmarkSimple}
          iconSize={34}
          title="Сохранённых поисков пока нет"
          description="Настройте фильтры в каталоге и нажмите «Сохранить поиск» — подборка будет ждать вас здесь."
        >
          <button className="primary" onClick={() => navigate("/catalog")}>Перейти в каталог</button>
        </EmptyState>
      )}
      <ScrollToTopButton />
      {quickViewModal}
      {removing && (
        <SavedSearchRemovalModal
          search={removing}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            onDelete(removing.id);
            setRemoving(null);
          }}
        />
      )}
    </main>
  );
}

function Catalog({ navigate, favorites, toggleFavorite, cars, apiMode, saveSearch, updateSavedSearch, deleteSavedSearch, savedSearches, landing = null }) {
  // Сотня машин на страницу — то же число, по которому сервер режет список для
  // поисковика. Если развести эти числа, адрес «?page=2» из выдачи покажет человеку
  // не те машины, которые по нему проиндексированы.
  const pageSize = CATALOG_PAGE_SIZE;
  const currency = useCurrency();
  // Pending and api resolve to the same value, so the boot request answering does not
  // retrigger the query this component already issued at mount.
  const useApi = apiMode !== false;
  const sortOptions = [
    { value: "default", label: "По умолчанию" },
    { value: "price_asc", label: "Дешёвые" },
    { value: "price_desc", label: "Дорогие" },
    { value: "newest", label: "Новые объявления" },
    { value: "mileage_asc", label: "С наименьшим пробегом" },
    { value: "range_desc", label: "С наибольшим запасом хода" },
    { value: "year_desc", label: "Новые по году" },
    { value: "year_asc", label: "Старые по году" },
  ];
  // Страница марки или типа задаёт свой фильтр самим адресом. Параметры в адресе имеют
  // приоритет: с них работают ссылки из умного поиска и сохранённые поиски.
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of landingFilterParams(landing)) if (!params.has(key)) params.set(key, value);
  const initialFilters = catalogFiltersFromParams(params);
  // Поисковая строка в адресе: `/catalog?q=byd han до 25000`. Нужна двум вещам —
  // разметке «поиск по сайту», по которой Google показывает строку поиска прямо
  // в выдаче, и внешним ссылкам на готовый поиск. Разбираем ту же строку тем же
  // разбором, что и поиск на главной, и заменяем адрес на обычный набор фильтров:
  // дальше страница ведёт себя как всегда, а `?q=` в истории не остаётся.
  const searchQuery = params.get("q");
  useEffect(() => {
    if (!searchQuery) return;
    let cancelled = false;
    // Заменяем адрес честной перезагрузкой, а не переходом внутри приложения: фильтры
    // каталог читает из адреса один раз, при создании, и от смены только параметров
    // он не пересоздаётся — заголовок и адрес менялись бы, а выдача оставалась общей.
    const go = (href) => { if (!cancelled) window.location.replace(href); };
    parseHeroSearchOnce(searchQuery, { apiMode, cars, currency })
      // Не разобрали — открываем обычный каталог: строка не должна остаться в адресе,
      // иначе она попадёт в сохранённый поиск и в возврат из карточки.
      .then((parsed) => go(parsed?.matched ? heroCatalogHref(parsed) : "/catalog"))
      .catch(() => go("/catalog"));
    return () => { cancelled = true; };
  }, [searchQuery]);

  // Снимок прошлой выдачи: из записи истории (возврат «Назад») или из памяти вкладки.
  // Когда сервер уже встроил в страницу готовый список, память вкладки не берём:
  // иначе первый кадр разошёлся бы с готовой разметкой (ошибка оживления), а страница
  // по свежей ссылке показала бы чужую глубину прокрутки.
  // Адрес, для которого сервер встроил список: у раздела — его адрес, у общего
  // каталога — «/catalog» (раздела у него нет).
  const listPath = landing?.path || "/catalog";
  const serverListHere = Boolean(window.__boot?.catalogValue && window.__boot.catalogPath === listPath);
  const restoredCatalog = window.history.state?.catalog || (serverListHere ? null : matchingCatalogReturn()?.catalog) || null;
  const [filters, setFilters] = useState(() => ({
    ...initialFilters,
    ...(restoredCatalog?.filters || {}),
  }));
  // Первая страница выдачи, встроенная сервером в готовую страницу (каталог, разделы,
  // страницы моделей): берём её, если она про этот адрес и этот отбор, и ничего не
  // восстанавливаем из истории. Тогда первый кадр совпадает с серверным, а первый
  // запрос не нужен.
  const bootList = (() => {
    const boot = window.__boot;
    if (!boot?.catalogValue || boot.catalogPath !== listPath || restoredCatalog) return null;
    // Метки переходов (utm, yclid, nocount) не считаются: сервер отбросил их так же.
    return String(boot.catalogSearch || "") === withoutTrackingParams(window.location.search).toString() ? boot.catalogValue : null;
  })();
  // Порядок «по умолчанию» перемешан по ключу. Для встроенного списка ключ выбрал
  // сервер (один на сутки): со случайным ключом браузер переставил бы машины, и
  // готовая разметка разошлась бы с первым кадром.
  const bootSeed = bootList && /^s\d{1,2}$/.test(String(window.__boot.catalogSeed || "")) ? window.__boot.catalogSeed : null;
  const bootListUsed = useRef(Boolean(bootList));
  const [remoteCars, setRemoteCars] = useState(() => {
    if (!bootList) return [];
    const items = (bootList.items || []).map(normalizeImportedCar);
    // Тот же разбор, что у ответа на первый запрос (orderRemoteBatch ниже).
    return bootSeed ? varietyOrder(items, seededRandom(`${bootSeed}:0`), []) : items;
  });
  const [remoteReceived, setRemoteReceived] = useState(Boolean(bootList));
  const [remoteTotal, setRemoteTotal] = useState(bootList ? Number(bootList.total) || 0 : 0);
  // «Есть ли ещё» решает сервер, а не сравнение загруженного с общим числом: у API
  // есть потолок глубины листания, и без его признака бесконечная прокрутка молотила
  // бы пустые страницы и показывала ошибку загрузки на ровном месте.
  const [remoteHasMore, setRemoteHasMore] = useState(Boolean(bootList?.hasMore));
  const [remoteMeta, setRemoteMeta] = useState(() => bootCatalogMeta(catalogMetaQuery(filters.type, filters.brand, filters.bodyType, filters.country)) || EMPTY_CATALOG_META);
  const [remoteLoading, setRemoteLoading] = useState(useApi && !bootList);
  const [remoteError, setRemoteError] = useState(false);
  // Сортировку может нести и ссылка (например, из сохранённого поиска); снимок
  // истории при возврате важнее — он описывает то, что было на экране.
  // Адрес со страницей списка («?page=7») приходит из поисковой выдачи, а сервер режет
  // список по возрастанию цены. Оставить здесь перемешанный порядок по умолчанию значит
  // показать человеку на этой странице совсем не те машины, за которыми он пришёл.
  // На странице модели порядок по умолчанию — по цене: так же режет список сервер,
  // и готовая разметка совпадает с первым кадром.
  const urlSort = sortOptions.some((option) => option.value === params.get("sort")) ? params.get("sort") : params.get("page") || landing?.kind === "model" ? "price_asc" : "default";
  const [sort, setSort] = useState(() => (sortOptions.some((option) => option.value === restoredCatalog?.sort) ? restoredCatalog.sort : urlSort));
  const fallbackFilters = useRef(savedSearchKey({ ...initialFilters, sort: urlSort }));
  // "По умолчанию" mixes the catalog the way the home feed does. The seed keeps that
  // mix in place while paging and when a visitor comes back from a vehicle page.
  const [shuffleSeed] = useState(() => restoredCatalog?.shuffleSeed || bootSeed || randomShuffleSeed());
  // Первый запрос — всегда одна страница. Больше сотни машин за раз каталог не отдаёт
  // (потолок в `catalogPaging`), поэтому при возврате из карточки с двумя-тремя
  // подгруженными страницами запрос на 300 машин молча превращался в сотню: список
  // схлопывался, а прокрутка возвращалась не к той машине.
  const [loadedLimit, setLoadedLimit] = useState(pageSize);
  // Сколько страниц дозапросить при возврате, чтобы на экране снова оказалось то же,
  // что было. Счётчик убывает при каждой попытке — так дозагрузка не может зациклиться,
  // если каталог перестал отдавать машины.
  const restorePages = useRef(Math.max(0, Math.ceil(((Number(restoredCatalog?.loadedCount) || 0) - pageSize) / pageSize)));
  // Страница списка из адреса. По адресам вида `/catalog/electric?page=7` поисковик
  // обходит каталог вглубь — их отдаёт сервер, — и человек, пришедший по такому адресу
  // из выдачи, должен увидеть те же машины, а не начало каталога. Любая смена фильтров
  // или сортировки сбрасывает отступ: к другой выдаче прежний номер страницы отношения
  // не имеет.
  const [startOffset, setStartOffset] = useState(() => {
    const requested = String(params.get("page") || "");
    if (!/^[1-9]\d{0,4}$/.test(requested)) return 0;
    return Math.min(Number(requested) - 1, CATALOG_MAX_PAGES - 1) * pageSize;
  });
  const restoredOrder = useRef(restoredCatalog?.order || null);
  // Раскрытая строка «Ещё фильтры» переезжает в снимок страницы: смена типа
  // двигателя или кузова уводит на свой раздел, страница собирается заново —
  // и без этого фильтры закрывались прямо во время выбора.
  const [filtersExpanded, setFiltersExpanded] = useState(() => Boolean(restoredCatalog?.filtersExpanded));
  // Вид выдачи — в первом кадре всегда список: хранилище браузера читаем после него,
  // иначе готовая разметка со сервера не совпала бы с первым кадром.
  const [view, setView] = useState("list");
  useLayoutEffect(() => {
    setView(readCatalogView());
  }, []);
  // На телефоне плитка идёт двумя карточками в ряд (см. .mobile-cards-grid).
  const { openQuickView, quickViewToggle, quickViewModal } = useVehicleQuickView({ apiMode:useApi, favorites, toggleFavorite, navigate });
  const loadMoreRequest = useRef(null);
  const loadingMore = useRef(false);
  const persistCatalogState = (anchor = {}) => {
    const state = window.history.state || {};
    // Запись истории могла остаться без state — тогда якорь и открытую карточку
    // берём из копии в sessionStorage, иначе первый же persist затрёт их пустыми.
    const stored = state.catalog ? null : matchingCatalogReturn();
    const pick = (key, fallback) => (anchor[key] !== undefined ? anchor[key] : state[key] ?? stored?.[key] ?? fallback);
    const scrollAnchor = pick("scrollAnchor", null);
    const scrollAnchorOffset = Number(pick("scrollAnchorOffset", 0)) || 0;
    const openedCarId = pick("openedCarId", null);
    const catalog = {
      filters,
      sort,
      shuffleSeed,
      filtersExpanded,
      loadedCount: Math.max(loadedLimit, remoteCars.length),
      order: remoteCars.slice(0, 600).map((car) => car.id),
    };
    patchHistoryState({ catalog, scrollAnchor, scrollAnchorOffset, openedCarId });
    saveCatalogReturn({ catalog, scrollAnchor, scrollAnchorOffset, openedCarId, scrollY: window.scrollY, path: currentAppPath(), search: window.location.search });
  };
  // Новая выдача — старый якорь и старый порядок уже ни на что не указывают.
  const dropScrollAnchor = () => {
    restoredOrder.current = null;
    persistCatalogState({ scrollAnchor: null, scrollAnchorOffset: 0, openedCarId: null });
  };
  const openCar = (car) => {
    // Save synchronously before leaving the catalog. The effect below is useful
    // for regular updates, but can otherwise lag behind a quick filter + click.
    // Быстрый просмотр тоже запоминает позицию: из него уходят на полную
    // страницу стрелкой, и «назад» должен вернуть к этой же карточке.
    const scrollAnchor = carAnchorSelector(car.id);
    const node = document.querySelector(scrollAnchor);
    persistCatalogState({ scrollAnchor, scrollAnchorOffset: node ? Math.round(node.getBoundingClientRect().top) : 0, openedCarId: car.id });
    // На десктопе карточка раскрывается быстрым просмотром: выдача, фильтры и
    // позиция прокрутки остаются на месте, уходить со страницы незачем.
    if (openQuickView(car)) return;
    navigate(carHref(car));
  };
  // Адрес, заголовок и текст страницы обязаны совпадать с тем, что показано. Как только
  // фильтр уводит с раздела — переходим на тот раздел, которому фильтры соответствуют,
  // а если такого нет, в общий каталог. Фильтры, сортировка и порядок перемешивания
  // переезжают снимком, поэтому выбранное не теряется.
  const landingPath = landing?.path || "/catalog";
  // Заголовок раздела и обычного каталога режется на крупную часть и мелкую подпись
  // одним правилом (src/catalog-landings.js) — тем же, что и в серверной версии страницы.
  const heading = landingHeading(landing ? landing.h1 : CATALOG_INDEX_SEO.h1, landing);
  // При создании каталог никуда не уводим: ссылка «Все фильтры» со страницы модели
  // открывает каталог с этой же моделью, и без этой проверки он тут же вернул бы
  // человека обратно на страницу модели.
  const mountedForMove = useRef(false);
  useEffect(() => {
    // Раздел, который описывает выбранное точнее всего и при этом остаётся правдой:
    // на странице BYD можно выбрать модель или год, а выбрать к седанам ещё и
    // кроссоверы — уже нет, такую выдачу раздел седанов не описывает.
    const firstRun = !mountedForMove.current;
    mountedForMove.current = true;
    // На странице модели остаёмся, пока выбраны её марка и она сама: остальные
    // фильтры (год, пробег, цена) её не отменяют — как у марки кузов или год.
    const chosenModels = multiValues(filters.model, ANY_MODEL);
    if (landing?.kind === "model" && filters.brand === landing.brand && chosenModels.length === 1 && chosenModels[0] === landing.model) return undefined;
    // Выбраны марка и модель, и больше ничего — это каталожная страница модели.
    const modelTarget = modelLandingRedirect(landing?.kind === "model" ? null : landing, savedSearchCatalogHref(filters).split("?")[1] || "");
    const target = (modelTarget && !firstRun ? modelTarget.split("?")[0] : null) || landingForFilters(filters, landingPath)?.path || "/catalog";
    if (target === landingPath) return undefined;
    const move = () => {
      navigate(target, {
        replace: true,
        preserveScroll: true,
        preserveCatalog: true,
        catalogState: { catalog: { filters, sort, shuffleSeed, filtersExpanded, loadedCount: pageSize, order: [] }, scrollY: window.scrollY },
      });
    };
    // Пока открыт список фильтра или шторка на телефоне, страницу не переключаем:
    // кузова, цвета и модели выбирают галочками по нескольку штук, и переход посреди
    // выбора закрывал бы список после первой же галочки, которая уводит с раздела.
    const listOpen = () => Boolean(document.querySelector(".select-menu.open, .mobile-filter-sheet"));
    if (!listOpen()) {
      move();
      return undefined;
    }
    const waiting = setInterval(() => {
      if (listOpen()) return;
      clearInterval(waiting);
      move();
    }, 250);
    return () => clearInterval(waiting);
  }, [filters]);
  const updateFilters = (updater) => {
    loadMoreRequest.current?.abort();
    loadMoreRequest.current = null;
    loadingMore.current = false;
    setLoadedLimit(pageSize);
    setStartOffset(0);
    restorePages.current = 0;
    dropScrollAnchor();
    setFilters(updater);
  };
  const updateView = (value) => {
    setView(value);
    window.localStorage.setItem(catalogViewKey, value);
  };
  // Переход с одной модели на другую ссылкой (блок «Другие модели», похожие модели):
  // каталог остаётся на месте и просто берёт отбор новой модели — прежний список
  // стоит на экране, пока не придёт новый, без заглушек и пересоздания страницы.
  const adoptedLandingPath = useRef(landing?.path || null);
  useEffect(() => {
    const path = landing?.path || null;
    if (adoptedLandingPath.current === path) return;
    adoptedLandingPath.current = path;
    if (landing?.kind !== "model") return;
    const chosen = multiValues(filters.model, ANY_MODEL);
    // Отбор уже про эту модель — сюда увёл сам каталог (плашка модели).
    if (filters.brand === landing.brand && chosen.length === 1 && chosen[0] === landing.model) return;
    loadMoreRequest.current?.abort();
    loadMoreRequest.current = null;
    loadingMore.current = false;
    setLoadedLimit(pageSize);
    setStartOffset(0);
    restorePages.current = 0;
    restoredOrder.current = null;
    setSort("price_asc");
    setFilters(catalogFiltersFromParams(landingFilterParams(landing)));
  }, [landing?.path]);
  const updateSort = (value) => {
    loadMoreRequest.current?.abort();
    loadMoreRequest.current = null;
    loadingMore.current = false;
    setLoadedLimit(pageSize);
    setStartOffset(0);
    restorePages.current = 0;
    dropScrollAnchor();
    setSort(value);
  };
  const brands = useApi ? remoteMeta.brands.map((item) => item.brand) : uniqueSorted(cars.map((car) => car.brand));
  const typedCars = cars.filter((car) => (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand));
  const brandCars = cars.filter((car) => (filters.type === "Все" || car.type === filters.type) && matchesMulti(car.bodyType, filters.bodyType, ANY_BODY_TYPE));
  const modelCars = cars.filter((car) => (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand) && matchesMulti(car.bodyType, filters.bodyType, ANY_BODY_TYPE));
  const models = ["Все модели", ...(useApi ? remoteMeta.models.map((item) => item.model) : uniqueSorted(modelCars.map((car) => car.model)))];
  // Запоминаем модели марки: по ним переход на страницу модели обходится без ожидания.
  if (useApi && filters.brand !== "Все марки" && remoteMeta.models.length) brandModelsCache.set(filters.brand, remoteMeta.models.map((item) => item.model));
  const brandEntries = useApi ? remoteMeta.brands : [...brandCars.reduce((counts, car) => counts.set(car.brand, (counts.get(car.brand) || 0) + 1), new Map())].map(([brandName, count]) => ({ brand:brandName, count }));
  const modelEntries = useApi ? remoteMeta.models : [...modelCars.reduce((counts, car) => counts.set(car.model, (counts.get(car.model) || 0) + 1), new Map())].map(([modelName, count]) => ({ model:modelName, count }));
  const brandOptionCounts = new Map(brandEntries.map((item) => [item.brand, Number(item.count) || 0]));
  const modelOptionCounts = new Map(modelEntries.map((item) => [item.model, Number(item.count) || 0]));
  if (brandEntries.length) brandOptionCounts.set("Все марки", brandEntries.reduce((total, item) => total + (Number(item.count) || 0), 0));
  if (modelEntries.length) modelOptionCounts.set("Все модели", modelEntries.reduce((total, item) => total + (Number(item.count) || 0), 0));
  const bodyTypes = ["Все кузова", ...(useApi ? remoteMeta.bodyTypes.map((item) => item.body_type) : BODY_TYPES.filter((item) => cars.some((car) => car.bodyType === item)))];
  const drives = [ANY_DRIVE, ...orderDrives(useApi ? remoteMeta.drives.map((item) => item.drive) : cars.map((car) => car.drive))];
  const countries = countryOptionsFor();
  const availability = useApi ? remoteMeta.availability : localAvailability(typedCars);
  // Цена в статическом режиме считается здесь же, поэтому смена режима цен
  // (переключатель «Цены с квотами») должна пересчитать выдачу.
  const quotaPricingOn = useQuotaPricing();
  const filtered = useMemo(
    () =>
      sortCars(
        cars
          .filter((car) => matchesSearchText(car, searchTextWords(filters.text)) && (filters.type === "Все" || car.type === filters.type) && (filters.brand === "Все марки" || car.brand === filters.brand) && matchesMulti(car.model, filters.model, ANY_MODEL) && matchesMulti(car.bodyType, filters.bodyType, ANY_BODY_TYPE) && matchesColorLabels(car.bodyColor, multiValues(filters.color, ANY_COLOR)) && matchesYears(car, filters.yearMin, filters.yearMax) && matchesMileageRange(car, filters.mileage) && matchesPriceRange(car, filters.priceMin, filters.priceMax) && matchesAdvancedFilters(car, filters) && matchesExclusions(car, filters))
          .map((car) => ({
            ...car,
            estimatedTotalUsd: estimateLandedCost(car).totalUsd,
          })),
        sort,
        shuffleSeed,
      ),
    [filters, cars, sort, shuffleSeed, quotaPricingOn],
  );
  // The API returns the default order already shuffled, but only the client knows what
  // is on screen, so the variety pass that spaces out similar cards runs on each batch.
  // Порядок должен совпадать при повторном входе на страницу, иначе выбранная
  // карточка уезжает в другое место списка. Раньше здесь был Math.random.
  const orderRemoteBatch = (items, preceding = []) => (sort === "default" ? varietyOrder(items, seededRandom(`${shuffleSeed}:${preceding.length}`), preceding) : items);
  // При возврате порядок берём тот, что был на экране: одна выдача на N карточек
  // не повторяет склейку из нескольких страниц «Подгрузить ещё».
  const restoreRemoteOrder = (items) => {
    const order = restoredOrder.current;
    if (!order?.length) return orderRemoteBatch(items);
    const byId = new Map(items.map((item) => [item.id, item]));
    const known = order.map((id) => byId.get(id)).filter(Boolean);
    if (!known.length) return orderRemoteBatch(items);
    const seen = new Set(order);
    return [...known, ...orderRemoteBatch(items.filter((item) => !seen.has(item.id)), known)];
  };
  const requestParams = () => {
    const query = new URLSearchParams({
      limit: String(loadedLimit),
      offset: String(startOffset),
    });
    query.set("sort", sort);
    if (sort === "default") query.set("seed", shuffleSeed);
    if (filters.type !== "Все") query.set("type", filters.type);
    if (filters.brand !== "Все марки") query.set("brand", filters.brand);
    appendMulti(query, "model", filters.model, ANY_MODEL);
    appendMulti(query, "bodyType", filters.bodyType, ANY_BODY_TYPE);
    colorValuesForLabels(multiValues(filters.color, ANY_COLOR)).forEach((value) => query.append("color", value));
    if (countryKey(filters.country)) query.set("country", countryKey(filters.country));
    if (filters.drive !== ANY_DRIVE) query.set("drive", filters.drive);
    if (filters.owners !== ANY_OWNERS) query.set("ownersMax", String(filterNumber(filters.owners)));
    if (filters.battery !== ANY_BATTERY) query.set("batteryMin", String(batteryFloor(filters.battery)));
    if (filters.condition !== ANY_CONDITION) query.set("conditionGrade", conditionGrades[filters.condition]);
    if (filters.accel !== ANY_ACCEL) query.set("accelMax", String(filterNumber(filters.accel)));
    if (filters.tire !== ANY_TIRE) query.set("tireRimMin", String(filterNumber(filters.tire)));
    if ((filters.range || ANY_RANGE) !== ANY_RANGE) query.set("rangeMin", String(filterNumber(filters.range)));
    appendEngineRange(query, filters.engine);
    appendPowerRange(query, filters.power);
    if ((filters.gearbox || ANY_GEARBOX) !== ANY_GEARBOX) query.set("gearbox", filters.gearbox);
    if ((filters.fuel || ANY_FUEL) !== ANY_FUEL) query.set("fuel", filters.fuel);
    if (filters.text) query.set("text", filters.text);
    appendExclusions(query, filters, { api: true });
    appendYearRange(query, filters.yearMin, filters.yearMax);
    appendMileageRange(query, filters.mileage);
    appendPriceRange(query, filters.priceMin, filters.priceMax);
    return query;
  };
  useEffect(() => {
    if (!useApi) return;
    const controller = new AbortController();
    // Даже если список уже встроен в HTML, его справочник мог быть собран раньше:
    // проверяем марки и модели заново после оживления страницы.
    requestCatalogMeta(catalogMetaQuery(filters.type, filters.brand, filters.bodyType, filters.country))
      .then((meta) => {
        if (!controller.signal.aborted) setRemoteMeta(meta);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRemoteError(true);
      });
    // Первая страница уже встроена сервером — первый запрос пропускаем. Встроенный
    // список одноразовый: при следующем заходе на этот адрес внутри сайта он был бы
    // уже устаревшим.
    if (bootListUsed.current) {
      bootListUsed.current = false;
      if (window.__boot) window.__boot.catalogValue = null;
      return () => controller.abort();
    }
    setRemoteLoading(true);
    setRemoteError(false);
    const query = requestParams();
    // Справочник и список машин идут врозь: какие поля показывать, известно из
    // справочника, а он отвечает быстрее выдачи. Раньше их ждали вместе, и панель
    // фильтров достраивалась только после того, как загрузится каталог.
    fetch(`/api/cars?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("catalog unavailable"))))
      .then((catalog) => {
        setRemoteCars(restoreRemoteOrder(catalog.items.map(normalizeImportedCar)));
        setRemoteReceived(true);
        setRemoteTotal(catalog.total);
        setRemoteHasMore(Boolean(catalog.hasMore));
      })
      .catch((error) => {
        if (error.name !== "AbortError") setRemoteError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRemoteLoading(false);
      });
    return () => controller.abort();
  }, [useApi, filters, sort]);
  useEffect(() => {
    persistCatalogState();
  }, [filters, sort, loadedLimit, remoteCars.length, startOffset]);
  useEffect(
    () => () => {
      const controller = loadMoreRequest.current;
      loadMoreRequest.current = null;
      controller?.abort();
    },
    [],
  );
  const loadMore = async () => {
    if (!useApi) {
      setLoadedLimit((current) => Math.min(current + pageSize, filtered.length - startOffset));
      return;
    }
    if (loadingMore.current || remoteLoading || !remoteHasMore) return;
    const controller = new AbortController();
    loadMoreRequest.current = controller;
    loadingMore.current = true;
    const query = requestParams();
    query.set("limit", String(pageSize));
    query.set("offset", String(startOffset + remoteCars.length));
    setRemoteLoading(true);
    setRemoteError(false);
    try {
      const response = await fetch(`/api/cars?${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error("catalog unavailable");
      const catalog = await response.json();
      setRemoteCars((current) => [...current, ...orderRemoteBatch(catalog.items.map(normalizeImportedCar), current)]);
      setLoadedLimit((current) => current + catalog.items.length);
      setRemoteTotal(catalog.total);
      setRemoteHasMore(Boolean(catalog.hasMore));
    } catch (error) {
      if (error.name !== "AbortError") setRemoteError(true);
    } finally {
      if (loadMoreRequest.current === controller) {
        loadMoreRequest.current = null;
        loadingMore.current = false;
        setRemoteLoading(false);
      }
    }
  };
  useEffect(() => {
    if (!useApi || restorePages.current <= 0 || remoteLoading || remoteError || !remoteHasMore) return;
    restorePages.current -= 1;
    loadMore();
  }, [useApi, remoteLoading, remoteError, remoteHasMore, remoteCars.length]);
  const displayed = useApi ? remoteCars : filtered.slice(startOffset, startOffset + loadedLimit);
  const resultCount = useApi ? remoteTotal : filtered.length;
  // Until the first page answers there is no count yet, and "0" reads as an empty result.
  const knownResultCount = remoteLoading && !remoteCars.length ? null : resultCount;
  // Без API считаем от начала списка, а не от показанного: при заходе по адресу со
  // страницей («?page=7») первые шестьсот машин в выдачу не попадают, и сравнение
  // «показано меньше, чем найдено» оставляло бы кнопку висеть на конце списка.
  const hasMore = useApi ? remoteHasMore : startOffset + displayed.length < resultCount;
  // Страницы списка: номер текущей, сколько всего и адрес любой из них — с теми же
  // параметрами, что в адресной строке (порядок, фильтры), только с другим номером.
  const currentPage = Math.floor(startOffset / pageSize) + 1;
  const nextPage = Math.floor((startOffset + displayed.length) / pageSize) + 1;
  const pageHref = (n) => {
    // Без меток переходов: ссылка на следующую страницу не должна разносить utm по
    // сайту, и сервер рисует её по адресу без меток — иначе разметка разошлась бы.
    const query = withoutTrackingParams(window.location.search);
    if (n > 1) query.set("page", String(n));
    else query.delete("page");
    const tail = query.toString();
    return `${landingPath}${tail ? `?${tail}` : ""}`;
  };
  const selectedSort = sortOptions.find((option) => option.value === sort) || sortOptions[0];
  const selectedModels = multiValues(filters.model, ANY_MODEL);
  const quickModels = [
    ANY_MODEL,
    ...models
      .filter((model) => model !== ANY_MODEL)
      .sort((left, right) => left.localeCompare(right, "ru", { numeric: true, sensitivity: "base" })),
  ];
  // Быстрый список работает как переключатель: в нём выбирают ровно одну модель.
  // Мультивыбор остаётся в полном списке фильтра, где он явно показан чекбоксами.
  const selectQuickModel = (model) => updateFilters((current) => ({
    ...current,
    model: model === ANY_MODEL ? [] : [model],
  }));
  // Кнопка «Сохранить поиск» знает, что этот набор уже сохранён, и вместо второй
  // копии ведёт в «Мои поиски». У гостя список пуст, поэтому кнопка всегда активна.
  const currentSearchKey = savedSearchKey({ ...filters, sort });
  const searchSaved = (savedSearches || []).some((item) => savedSearchKey(item.filters) === currentSearchKey);
  // «База» — сохранённый поиск, с которого начался этот экран: либо каталог открыт
  // из «Моих поисков», либо поиск сохранили здесь. Изменённые фильтры тогда не
  // плодят новую запись, а обновляют её кнопкой «Обновить поиск».
  const [baseSearchKey, setBaseSearchKey] = useState(() => currentSearchKey);
  const [toast, setToast] = useState(null);
  const baseSearch = (savedSearches || []).find((item) => savedSearchKey(item.filters) === baseSearchKey) || null;
  const searchUpdate = !searchSaved && Boolean(baseSearch);
  // Нажатие на закладку: не сохранён — сохраняем, уже сохранён — убираем,
  // а если это правка ранее сохранённого поиска — записываем изменения и говорим
  // об этом всплывающей подсказкой (иначе нажатие выглядит как «ничего не было»).
  const submitSearch = () => {
    if (searchSaved) {
      const saved = (savedSearches || []).find((item) => savedSearchKey(item.filters) === currentSearchKey);
      if (saved) deleteSavedSearch?.(saved.id);
      setBaseSearchKey("");
      return;
    }
    if (baseSearch) {
      updateSavedSearch(baseSearch.id, { ...filters, sort });
      setToast("Сохранённый поиск обновлён");
    } else saveSearch({ ...filters, sort });
    setBaseSearchKey(currentSearchKey);
  };
  // Keep the HTML's links and pagination while loading, including when the API
  // fails. A successful empty response is authoritative; changed filters must
  // never receive the original page's unfiltered offers.
  const fallbackHtml = readCatalogFallback(window.location.href);
  if (useApi && !remoteReceived && !remoteCars.length && (remoteLoading || remoteError) && fallbackHtml
      && savedSearchKey({ ...filters, sort }) === fallbackFilters.current) {
    return <main className="page-width seo-prerender" data-catalog-fallback="true">
      {remoteError && <p role="status">Не удалось обновить каталог. Показаны предложения на момент загрузки страницы. <a href={window.location.href}>Попробовать снова</a></p>}
      <div dangerouslySetInnerHTML={{ __html: fallbackHtml }} />
    </main>;
  }
  return (
    <main className="catalog page-width">
      <Breadcrumbs>
        <CrumbLink href="/" onOpen={() => navigate("/")}>Главная</CrumbLink>
        <CaretRight size={13} />
        {landing ? (
          <>
            <CrumbLink href="/catalog" onOpen={() => navigate("/catalog")}>Каталог авто {siteFromPhrase()}</CrumbLink>
            <CaretRight size={13} />
            {landing.kind === "model" && landing.links?.brandPath && (
              <>
                <CrumbLink href={landing.links.brandPath} onOpen={() => navigate(landing.links.brandPath)}>{landing.brand}</CrumbLink>
                <CaretRight size={13} />
              </>
            )}
            {landing.name}
          </>
        ) : (
          `Каталог авто ${siteFromPhrase()}`
        )}
      </Breadcrumbs>
      <div className="catalog-heading">
        <div>
          {/* Две половины заголовка — отдельными кусками, чтобы на телефоне каждая
              встала своей строкой (правило в стилях), а на компьютере они шли одной
              строкой через пробел. Перенос задан руками: браузер ломал строку в своём
              месте на каждой ширине, и «с пробегом из Китая» скакало от раздела
              к разделу. Для поиска текст один и тот же — слова и пробел на месте. */}
          {/* Под заголовком строки нет (решение Сергея 25.09.2026): подзаголовок
              разделов был одной фразой на все 155 страниц, а строка наличия модели
              повторяла заголовок вкладки и блок «что есть и почём» под выдачей. К тому
              же ни то ни другое не менялось от фильтров. Число машин — над выдачей. */}
          <h1>{Boolean(heading.tail) ? <><span>{heading.title}</span> <HeadingCountryMenu tail={heading.tail} value={filters.country} onChange={(country) => updateFilters((current) => ({ ...current, country }))} /></> : heading.title}</h1>
        </div>
      </div>
      <FilterPanel filters={filters} setFilters={updateFilters} resultCount={knownResultCount} brands={brands} models={models} bodyTypes={bodyTypes} drives={drives} countries={countries} optionCounts={{ brands:brandOptionCounts, models:modelOptionCounts }} availability={availability} onSaveSearch={submitSearch} searchSaved={searchSaved} searchUpdate={searchUpdate} expanded={filtersExpanded} onExpandedChange={setFiltersExpanded} currentPath={landingPath} currentLanding={landing} />
      {filters.brand !== "Все марки" && models.length > 1 && (
        <div className="model-quick-chips" aria-label={`Быстрый выбор модели ${filters.brand}`}>
          {quickModels.map((model) => {
            const active = model === ANY_MODEL ? !selectedModels.length : selectedModels.includes(model);
            const count = modelOptionCounts.get(model);
            const content = (
              <>
                <ModelQuickLabel model={model} />
                {Number.isFinite(count) && <small>{number(count)}</small>}
              </>
            );
            const label = Number.isFinite(count) ? `${model}: ${number(count)} авто` : model;
            // Кнопка модели — ссылка на её каталожную страницу (туда нажатие и ведёт,
            // см. эффект перехода выше), «Все модели» — на раздел марки. Так со страницы
            // марки к моделям ведут ссылки прямо из этого ряда, и отдельный список
            // «Модели … в каталоге» под выдачей больше не нужен.
            const target = model === ANY_MODEL ? brandLandingPath(filters.brand) : modelLandingPath(filters.brand, model);
            if (target && target !== landingPath) {
              return (
                <a
                  key={model}
                  href={appHref(target)}
                  className={active ? "active" : ""}
                  aria-label={label}
                  onClick={(event) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    selectQuickModel(model);
                  }}
                >
                  {content}
                </a>
              );
            }
            return (
              <button type="button" key={model} className={active ? "active" : ""} aria-pressed={active} aria-label={label} onClick={() => selectQuickModel(model)}>
                {content}
              </button>
            );
          })}
        </div>
      )}
      <div className="catalog-layout">
        <section className="results-list" aria-busy={remoteLoading && !displayed.length ? "true" : undefined}>
          <div className="result-tools">
            <div className="result-summary">
              <b>{knownResultCount == null ? "Загружаем" : `${knownResultCount} шт.`}</b>
              {/* Слова из поиска, которых нет в выпадающих списках (комплектация,
                  химия батареи, размер шин). Без этой пометки выдача была бы уже
                  общей, а объяснения этому на странице не нашлось бы. */}
              {Boolean(filters.text) && (
                <button type="button" className="catalog-text-chip" onClick={() => updateFilters((old) => ({ ...old, text: "" }))} aria-label={`Убрать из отбора слова «${filters.text}»`}>
                  «{filters.text}» <X size={14} />
                </button>
              )}
              {quickViewToggle}
            </div>
            <div className="result-controls">
              <SelectField className="sort-custom-select" label="Сортировка" value={selectedSort.label} options={sortOptions.map((option) => option.label)} onChange={(label) => updateSort(sortOptions.find((option) => option.label === label)?.value || "default")} />
              <ViewToggle value={view} onChange={updateView} />
            </div>
          </div>
          {remoteError && <div className="catalog-message">Не удалось обновить выдачу. Попробуйте ещё раз.</div>}
          {displayed.length ? (
            view === "grid" ? (
              <div className="featured-grid catalog-card-grid mobile-cards-grid">
                {displayed.map((car) => (
                  <FeaturedCard key={car.id} car={car} favorite={favorites.has(car.id)} toggleFavorite={toggleFavorite} onClick={() => openCar(car)} />
                ))}
              </div>
            ) : (
              displayed.map((car) => <CarRow key={car.id} car={car} navigate={navigate} favorite={favorites.has(car.id)} toggleFavorite={toggleFavorite} onOpen={openCar} />)
            )
          ) : remoteLoading ? (
            view === "grid" ? (
              <div className="featured-grid catalog-card-grid mobile-cards-grid">
                {skeletonCards.map((key) => <CardSkeleton key={key} />)}
              </div>
            ) : (
              skeletonCards.map((key) => <CardSkeleton key={key} row />)
            )
          ) : (
            <CustomSearchCta variant="empty" />
          )}
          {remoteLoading && displayed.length > 0 && <div className="catalog-message">Загружаем объявления…</div>}
          {/* Кнопка — настоящая ссылка на следующую страницу списка: человек нажимает
              и получает продолжение на месте, робот идёт по адресу. Номеров страниц
              нет (решение Сергея 25.09.2026): по цепочке «дальше» поисковик доходит до
              любой страницы, а сами машины перечислены в карте сайта. */}
          {hasMore && !remoteLoading && !remoteError && (
            <a
              className="load-more"
              href={appHref(pageHref(nextPage))}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                loadMore();
              }}
            >
              Подгрузить ещё
            </a>
          )}
          {useApi && hasMore && !remoteLoading && remoteError && (
            <button className="load-more" onClick={loadMore}>
              Повторить загрузку
            </button>
          )}
          {displayed.length > 0 && !hasMore && !remoteLoading && (
            <CustomSearchCta variant="end" navigate={navigate} />
          )}
        </section>
        <aside className="side-card">
          <Illustration
            className="side-card-icon"
            src="/illustrations/catalog-service-shield.png"
            width="80"
            height="80"
            alt=""
            aria-hidden="true"
          />
          <h3>Как устроена покупка</h3>
          <p>Весь путь автомобиля {siteFromPhrase()} до выдачи в Минске — без скрытых этапов.</p>
          <ul>
            <li>
              <Check size={15} />
              Проверка автомобиля
            </li>
            <li>
              <Check size={15} />
              Доставка и оформление
            </li>
            <li>
              <Check size={15} />
              Передача в Минске
            </li>
          </ul>
          <button className="secondary" onClick={() => navigate("/how-it-works")}>
            О сервисе
          </button>
        </aside>
        {/* Текстовый блок стоит в той же колонке, что выдача: справа от него —
            карточка сервиса, и правый край блока совпадает с правым краем выдачи. */}
        {landing?.kind === "model" ? (
          <ModelLandingNotes landing={landing} page={currentPage} navigate={navigate} />
        ) : landing ? (
          <CatalogLandingNotes landing={landing} navigate={navigate} total={knownResultCount} />
        ) : (
          <CatalogSectionLinks navigate={navigate} />
        )}
      </div>
      <ScrollToTopButton />
      {Boolean(toast) && <Toast text={toast} onClose={() => setToast(null)} />}
      {quickViewModal}
    </main>
  );
}

/* Ценовые полосы под страницей раздела: «до 15 000 $», «до 20 000 $» и дальше.
   Они собраны из всего каталога, и до 25.09.2026 на них вели ссылки только с общего
   каталога и указателя моделей — с разделов марок, кузовов и типов не было ни одной. */
function PriceBandLinks({ landing, navigate, heading = "По цене до Минска" }) {
  const bands = priceBandsForLanding(landing);
  if (!bands.length) return null;
  return (
    <div className="catalog-landing-links">
      <b>{heading}</b>
      <div>
        {bands.map((band) => (
          <AppLink key={band.path} href={band.path} navigate={navigate}>{band.name}</AppLink>
        ))}
      </div>
    </div>
  );
}

/* Ссылки на разделы каталога под выдачей общего каталога. Раньше попасть в раздел можно
   было только с главной, где плитку марок рисует скрипт, — то есть для поисковика
   разделы были островом. Здесь те же ссылки видит и человек, и робот. */
function CatalogSectionLinks({ navigate }) {
  // Марки, типы двигателя и кузова отсюда убраны 25.09.2026: они ссылками стоят в самом
  // фильтре над выдачей (optionHrefs в FilterPanel). Здесь остаётся то, чего фильтр
  // ссылкой не даёт: ценовые полосы (в фильтре это поле «от–до») и сочетания двух
  // фильтров — они свёрнуты, чтобы не было склада из сотни плашек.
  const prices = CATALOG_LANDINGS.filter((item) => item.kind === "price");
  const combos = [
    // Страницы стран (29.09.2026): фильтр «Страна» ссылкой их не даёт.
    ["Страна", CATALOG_LANDINGS.filter((item) => item.kind === "origin")],
    ["Двигатель и кузов", CATALOG_LANDINGS.filter((item) => item.kind === "combo")],
    ["Марка и кузов", CATALOG_LANDINGS.filter((item) => item.kind === "brandBody")],
  ];
  const links = (items) => (
    <div>
      {items.map((item) => (
        <AppLink key={item.path} href={item.path} navigate={navigate}>{item.name}</AppLink>
      ))}
    </div>
  );
  return (
    <section className="catalog-landing-notes" aria-labelledby="catalog-sections-title">
      <h2 id="catalog-sections-title">Автомобили {siteFromPhrase()} по цене и кузову</h2>
      <div className="catalog-landing-links">
        <b>По цене до Минска</b>
        {links(prices)}
      </div>
      <details className="catalog-landing-more">
        <summary>Все сочетания двигателя, марки и кузова</summary>
        {combos.map(([title, items]) => (
          <div className="catalog-landing-links" key={title}>
            <b>{title}</b>
            {links(items)}
          </div>
        ))}
      </details>
    </section>
  );
}

/* Текст страницы марки или типа стоит под выдачей, а не над ней: сверху человеку нужны
   машины, а не чтение. Здесь же ссылки на обзоры моделей этой марки и на соседние
   страницы каталога — по ним поисковик обходит раздел, а человек переходит к похожему. */
function CatalogLandingNotes({ landing, navigate, total = null }) {
  // Сводку по марке сервер встраивает в готовую страницу раздела (window.__boot.
  // brandGuideValue): без неё первый кадр — «Загружаем сводку…», а у готовой
  // разметки — цифры, и они бы разошлись.
  const bootGuide = () => (window.__boot?.brandGuideValue && window.__boot.brandGuideBrand === landing.brand ? window.__boot.brandGuideValue : null);
  const [guide, setGuide] = useState(bootGuide);
  useEffect(() => {
    if (!isBrandGuideLanding(landing)) return undefined;
    const embedded = bootGuide();
    if (embedded) {
      setGuide(embedded);
      return undefined;
    }
    const controller = new AbortController();
    fetch(`/api/brand-guide?brand=${encodeURIComponent(landing.brand)}&version=3`, { signal:controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("brand guide unavailable")))
      .then(setGuide)
      .catch(() => {});
    return () => controller.abort();
  }, [landing.brand]);
  const modelPages = landing.brand ? MODEL_PAGES.filter((page) => page.brand === landing.brand) : [];
  // Списка «Модели … в каталоге» здесь нет с 25.09.2026: те же модели и те же адреса —
  // ссылками в ряду моделей над выдачей.
  // Разделы по смыслу, а не все подряд: полный список всех 55 лежит в каталоге — это его
  // естественное место. Одинаковый на всех страницах блок ссылок поисковик со временем
  // считает частью шаблона и обесценивает, а вес размазывается ровным слоем.
  const others = relatedLandings(landing);
  if (isBrandGuideLanding(landing)) return (
    <BrandCatalogGuide landing={landing} guide={guide} modelPages={modelPages} navigate={navigate} total={total} />
  );
  return (
    <section className="catalog-landing-notes catalog-landing-article" aria-labelledby="catalog-landing-notes-title">
      <h2 id="catalog-landing-notes-title">{landing.kind === "origin" ? landing.name : `${landing.name} ${siteFromPhrase()}`}: что важно знать</h2>
      {landing.notes.map((text) => (
        <p key={text.slice(0, 40)}>{text}</p>
      ))}
      {others.length > 0 && (
        <div className="catalog-landing-links">
          <b>{landing.kind === "brand" ? "Другие марки" : landing.kind === "powertrain" ? "Другие типы" : "Другие кузова"}</b>
          <div>
            {others.map((item) => (
              <AppLink key={item.path} href={item.path} navigate={navigate}>{item.name}</AppLink>
            ))}
          </div>
        </div>
      )}
      <PriceBandLinks landing={landing} navigate={navigate} />
      <CatalogLandingFaq landing={landing} total={total} navigate={navigate} />
    </section>
  );
}

function BrandCatalogGuide({ landing, guide, modelPages, navigate, total }) {
  const currency = useCurrency();
  const setCurrency = useSetCurrency();
  const complete = isBrandGuide(landing, guide);
  const brand = landing.brand;
  const config = brandGuideConfig(brand, landing.notes);
  const aboutNotes = config.aboutNotes ?? landing.notes;
  const idPrefix = landing.path.split("/").filter(Boolean).at(-1) || brand.toLowerCase().replaceAll(" ", "-");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedBudget, setSelectedBudget] = useState(ZEEKR_BUDGETS[0].key);
  const changedDate = guideDate(guide?.changedAt);
  const selectedPriceData = selectedModel
    ? guide?.models?.find((item) => item.model === selectedModel) || guide
    : guide;
  const selectedCount = selectedModel ? selectedPriceData?.count : guide?.total;
  const priceSpan = Number(selectedPriceData?.priceMax) - Number(selectedPriceData?.priceMin);
  const medianPosition = priceSpan > 0
    ? Math.min(100, Math.max(0, ((Number(selectedPriceData?.priceMedian) - Number(selectedPriceData?.priceMin)) / priceSpan) * 100))
    : 50;
  const medianAlignment = medianPosition < 12 ? " is-start" : medianPosition > 88 ? " is-end" : "";
  const guideModels = new Map((guide?.models || []).map((row) => [row.model, row]));
  const activeBudget = ZEEKR_BUDGETS.find((band) => band.key === selectedBudget) || ZEEKR_BUDGETS[0];
  const activeBudgetData = guide?.budgets?.[activeBudget.key];
  // У каждой модели своя каталожная страница — на неё и ведём, обзор есть или нет.
  const modelHref = (model) => modelLandingPath(landing.brand, model) || `${landing.path}?model=${encodeURIComponent(model)}`;
  const alternatives = config.alternatives.map((item) => ({ ...item, href:brandLandingPath(item.brand) })).filter((item) => item.href);
  return (
    <section className="catalog-landing-notes catalog-landing-article brand-guide" aria-labelledby="catalog-landing-notes-title">
      <h2 id="catalog-landing-notes-title">{brand} {siteFromPhrase()}: цены и выбор по данным каталога</h2>
      <p>{config.intro}</p>
      {!complete ? (
        <p className="brand-guide-loading">Загружаем актуальную сводку по марке…</p>
      ) : (
        <>
          <div className="brand-guide-market" aria-label={`Цены на автомобили ${brand}`}>
            <div className="brand-guide-model-control">
              <SelectField
                className="brand-guide-select"
                label={`Модель ${brand}`}
                value={selectedModel}
                options={["", ...guide.models.map((row) => row.model)]}
                onChange={setSelectedModel}
                formatOption={(model) => model ? `${brand} ${model}` : "Все модели"}
              />
              <span>{guideNumber(selectedCount)} {guidePlural(selectedCount, "автомобиль", "автомобиля", "автомобилей")}{selectedModel ? " этой модели" : " в каталоге"}</span>
              {setCurrency && <CurrencySwitch currency={currency} setCurrency={setCurrency} className="price-currency-switch brand-guide-currency-switch" />}
            </div>
            <div className="brand-guide-price-range" style={{ "--brand-guide-median":`${medianPosition}%` }}>
              <div className="brand-guide-price-range-inner">
                <div className="brand-guide-price-track" role="img" aria-label={`Медианная цена ${guidePrice(selectedPriceData?.priceMedian, currency)} в диапазоне от ${guidePrice(selectedPriceData?.priceMin, currency)} до ${guidePrice(selectedPriceData?.priceMax, currency)}`}>
                  <span aria-hidden="true" />
                </div>
                <div className="brand-guide-price-labels">
                  <span className="brand-guide-price-min"><small>Минимальная</small><strong>{guidePrice(selectedPriceData?.priceMin, currency)}</strong></span>
                  <span className={`brand-guide-price-median${medianAlignment}`}><small>Медианная</small><strong>{guidePrice(selectedPriceData?.priceMedian, currency)}</strong></span>
                  <span className="brand-guide-price-max"><small>Максимальная</small><strong>{guidePrice(selectedPriceData?.priceMax, currency)}</strong></span>
                </div>
              </div>
            </div>
          </div>
          <section className="brand-guide-section" aria-labelledby={`${idPrefix}-models-title`}>
            <div className="brand-guide-heading">
              <h3 id={`${idPrefix}-models-title`}>Модели {brand} в каталоге</h3>
              <span>{guideYears(guide)} годы выпуска</span>
            </div>
            <div className="brand-guide-table-wrap">
              <table className="brand-guide-table">
                <thead><tr><th>Модель</th><th>Годы</th><th>Тип</th><th>Цена от</th><th>Медиана</th></tr></thead>
                <tbody>{guide.models.map((row) => (
                  <tr className="brand-guide-model-row" key={row.model}>
                    <th scope="row"><AppLink className="brand-guide-model-link" href={modelHref(row.model)} navigate={navigate} aria-label={`Открыть ${brand} ${row.model}`}>
                      <span className="brand-guide-model-thumb">{row.image ? <img src={imageSource(row.image, IMAGE_WIDTH_TILE)} alt="" loading="lazy" onError={(event) => retryWithFullImage(event, row.image)} /> : <CarProfile size={20} weight="duotone" aria-hidden="true" />}</span>
                      <span className="brand-guide-model-copy"><strong>{brand} {row.model}</strong><small>В наличии {guideNumber(row.count)} шт.</small></span>
                    </AppLink></th>
                    <td data-label={row.yearMin && row.yearMin === row.yearMax ? "Год" : "Годы"}>{guideYears(row)}</td>
                    <td data-label="Тип"><BrandGuidePowertrain values={row.powertrains} /></td>
                    <td data-label="Цена от">{guidePrice(row.priceMin, currency)}</td>
                    <td data-label="Медиана">{guidePrice(row.priceMedian, currency)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
          <section className="brand-guide-section" aria-labelledby={`${idPrefix}-budget-title`}>
            <div className="brand-guide-heading">
              <h3 id={`${idPrefix}-budget-title`}>Что можно выбрать по бюджету</h3>
            </div>
            <div className="brand-guide-budget-tabs" role="group" aria-label="Диапазон цены">
              {ZEEKR_BUDGETS.map((band) => {
                const active = selectedBudget === band.key;
                return <button type="button" className={active ? "active" : ""} aria-pressed={active} key={band.key} onClick={() => setSelectedBudget(band.key)}>
                  <strong>{guideBudgetTitle(band, currency)}</strong>
                </button>;
              })}
            </div>
            <SelectField
              className="brand-guide-budget-select"
              label="Диапазон цены"
              value={selectedBudget}
              options={ZEEKR_BUDGETS.map((band) => band.key)}
              onChange={setSelectedBudget}
              formatOption={(key) => guideBudgetTitle(ZEEKR_BUDGETS.find((band) => band.key === key) || ZEEKR_BUDGETS[0], currency)}
            />
            <div className="brand-guide-budget-models" aria-live="polite">
              {activeBudgetData?.models?.length ? activeBudgetData.models.slice(0, 5).map((model) => {
                const row = guideModels.get(model);
                return <AppLink key={model} href={modelHref(model)} navigate={navigate}>
                  <span className="brand-guide-budget-thumb">{row?.image ? <img src={imageSource(row.image, IMAGE_WIDTH_TILE)} alt="" loading="lazy" onError={(event) => retryWithFullImage(event, row.image)} /> : <CarProfile size={28} weight="duotone" aria-hidden="true" />}</span>
                  <strong>{brand} {model}</strong>
                </AppLink>;
              }) : <p>{activeBudget.text}</p>}
            </div>
          </section>
          <p className="brand-guide-method">Статистика рассчитана {guideDate(guide.calculatedAt)} по {guideNumber(guide.total)} активным объявлениям abcars.by{changedDate ? <>; последнее изменение состава или содержания этого раздела — {changedDate}</> : null}. Ценовые показатели используют {guideNumber(guide.pricedCount)} объявлений, для которых уже рассчитана итоговая стоимость: автомобиль, доставка и предварительные платежи до Минска. Медиана делит эти предложения пополам и меньше зависит от единичных дорогих версий, чем среднее значение. Перед договором цену продавца, курс и логистику подтверждаем заново.</p>
        </>
      )}
      {aboutNotes.length > 0 && (
        <section className="brand-guide-section brand-guide-about" aria-labelledby={`${idPrefix}-about-title`}>
          <h3 id={`${idPrefix}-about-title`}>Что важно знать о {brand}</h3>
          {aboutNotes.map((text) => <p key={text.slice(0, 40)}>{text}</p>)}
        </section>
      )}
      {modelPages.length > 0 && (
        <div className="catalog-landing-links">
          <b>Подробные обзоры моделей</b>
          <div>{modelPages.map((page) => <AppLink key={page.path} href={page.path} navigate={navigate}>{page.name}</AppLink>)}</div>
        </div>
      )}
      <PriceBandLinks landing={landing} navigate={navigate} />
      {alternatives.length > 0 && (
        <section className="brand-guide-section" aria-labelledby={`${idPrefix}-compare-title`}>
          <h3 id={`${idPrefix}-compare-title`}>С чем сравнить {brand}</h3>
          <div className="brand-guide-alternatives">{alternatives.map((item) => (
            <AppLink key={item.brand} href={item.href} navigate={navigate}>
              <BrandMark brand={item.brand} />
              <span className="brand-guide-alternative-copy"><strong>{item.brand}</strong><span>{item.note}</span></span>
            </AppLink>
          ))}</div>
        </section>
      )}
      <CatalogLandingFaq landing={landing} total={complete ? guide.total : total} guide={guide} navigate={navigate} />
    </section>
  );
}

function BrandGuidePowertrain({ values = [] }) {
  const label = guidePowertrains(values);
  const normalized = values.join(" ").toLowerCase();
  const Icon = normalized.includes("гибрид")
    ? ArrowsLeftRight
    : normalized.includes("двс") || normalized.includes("бензин")
      ? GasPump
      : normalized.includes("элект")
        ? Lightning
        : Engine;
  return (
    <span className="brand-guide-powertrain" role="img" tabIndex={0} aria-label={label}>
      <Icon size={20} weight="duotone" aria-hidden="true" />
      <span className="brand-guide-powertrain-label" aria-hidden="true">{label}</span>
      <ActionTooltip text={label} />
    </span>
  );
}

/* Частые вопросы раздела: те же плашки, что в обзорах моделей, только внутри текстового
   блока каталога — и с разметкой FAQPage, по которой вопросы попадают прямо в выдачу.
   Сами вопросы собираются из типа раздела и количества машин (src/landing-faq.js),
   поэтому у бензинового раздела спрашивают про пошлину по объёму, а у электрического —
   про квоту. Пока количество машин не пришло, первый вопрос про цену не показываем:
   выдумывать число нельзя. */
function CatalogLandingFaq({ landing, total, guide = null, navigate }) {
  const currency = useCurrency();
  const faq = landingFaq(landing, { total, guide, currency });
  if (!faq.length) return null;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      // В разметке — чистый текст: поисковик показывает его как есть, и
      // «[калькулятор](/customs)» выглядел бы в выдаче ошибкой.
      acceptedAnswer: { "@type": "Answer", text: plainInlineText(item.a) },
    })),
  };
  return (
    <div className="catalog-landing-faq">
      <h3>{landingFaqTitle(landing)}</h3>
      <HomeFaqList
        className="catalog-landing-faq-list"
        items={faq.map((item) => ({ question: item.q, answer: item.a }))}
        navigate={navigate}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </div>
  );
}

/* Частые вопросы в карточке машины. Те же плашки, что у разделов каталога и обзоров,
   но ответы считаются по этой машине: итог до Минска с разбивкой, платежи на таможне
   по её типу двигателя и возрасту, что смотрят при проверке (src/car-faq.js). Блок
   стоит в конце левой колонки — после характеристик, перед ссылками в
   каталог: человек к этому месту уже прочитал карточку, и дальше у него остаются
   ровно эти вопросы. У проданной машины блока нет, его отсекает сам carFaq. */
function VehicleFaq({ car, navigate }) {
  const faq = carFaq(car, estimateLandedCost(car));
  if (!faq.length) return null;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: plainInlineText(item.a) },
    })),
  };
  return (
    <div className="catalog-landing-faq detail-faq">
      <h3>{carFaqTitle(car)}</h3>
      <HomeFaqList
        className="catalog-landing-faq-list"
        items={faq.map((item) => ({ question: item.q, answer: item.a }))}
        navigate={navigate}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </div>
  );
}

function GalleryModal({ car, images, initialIndex, onClose }) {
  const imageRefs = useRef([]);
  const thumbRefs = useRef([]);
  const modalRef = useRef(null);
  const scrollFrame = useRef(null);
  const navigationFrame = useRef(null);
  const navigating = useRef(false);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [loadedImages, setLoadedImages] = useState(() => new Set());
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => imageRefs.current[initialIndex]?.scrollIntoView({ block: "start" }));
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current);
      if (navigationFrame.current) cancelAnimationFrame(navigationFrame.current);
    };
  }, [initialIndex, onClose]);
  useEffect(() => {
    const thumb = thumbRefs.current[activeIndex];
    const rail = thumb?.parentElement;
    if (!thumb || !rail) return;
    const thumbTop = thumb.offsetTop;
    const thumbBottom = thumbTop + thumb.offsetHeight;
    if (thumbTop < rail.scrollTop) rail.scrollTop = thumbTop;
    else if (thumbBottom > rail.scrollTop + rail.clientHeight) rail.scrollTop = thumbBottom - rail.clientHeight;
  }, [activeIndex]);
  const jumpTo = (index) => {
    const modal = modalRef.current;
    const targetImage = imageRefs.current[index];
    if (!modal || !targetImage) return;
    if (navigationFrame.current) cancelAnimationFrame(navigationFrame.current);
    setActiveIndex(index);
    const start = modal.scrollTop;
    const target = start + targetImage.getBoundingClientRect().top - modal.getBoundingClientRect().top - 88;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      modal.scrollTop = target;
      return;
    }
    navigating.current = true;
    const startedAt = performance.now();
    const animate = (now) => {
      const progress = Math.min(1, (now - startedAt) / 180);
      const eased = 1 - Math.pow(1 - progress, 3);
      modal.scrollTop = start + (target - start) * eased;
      if (progress < 1) navigationFrame.current = requestAnimationFrame(animate);
      else {
        navigationFrame.current = null;
        navigating.current = false;
        setActiveIndex(index);
      }
    };
    navigationFrame.current = requestAnimationFrame(animate);
  };
  const trackActiveImage = (event) => {
    if (event.target !== event.currentTarget) return;
    if (navigating.current) return;
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const marker = 96;
      let closestIndex = 0;
      let closestDistance = Infinity;
      imageRefs.current.forEach((node, index) => {
        if (!node) return;
        const distance = Math.abs(node.getBoundingClientRect().top - marker);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      setActiveIndex((current) => (current === closestIndex ? current : closestIndex));
    });
  };
  const markImageLoaded = (index) => {
    setLoadedImages((current) => {
      if (current.has(index)) return current;
      const next = new Set(current);
      next.add(index);
      return next;
    });
  };
  return (
    <div ref={modalRef} className="gallery-modal" role="dialog" aria-modal="true" aria-label={`Фотографии ${car.title}`} onScroll={trackActiveImage} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <header>
        <div>
          <b>{car.title}</b>
          <span>
            {activeIndex + 1} из {images.length}
          </span>
        </div>
        <button aria-label="Закрыть галерею" onClick={onClose}>
          <X size={24} />
        </button>
      </header>
      <div className="gallery-modal-content">
        <aside className="gallery-modal-rail" aria-label="Миниатюры фотографий">
          {images.map((image, index) => (
            <button
              key={`${image}-thumb-${index}`}
              ref={(node) => {
                thumbRefs.current[index] = node;
              }}
              className={activeIndex === index ? "active" : ""}
              onClick={() => jumpTo(index)}
              aria-label={`Перейти к фото ${index + 1}`}
              aria-current={activeIndex === index ? "true" : undefined}
            >
              <img src={imageSource(image, IMAGE_WIDTH_THUMB)} alt="" loading="lazy" fetchPriority="low" decoding="async" onError={(event) => retryWithFullImage(event, image)} />
            </button>
          ))}
        </aside>
        <div className="gallery-modal-list">
          {images.map((image, index) => (
            <figure
              key={`${image}-${index}`}
              ref={(node) => {
                imageRefs.current[index] = node;
              }}
            >
              {!loadedImages.has(index) && <span className="gallery-modal-loading" aria-hidden="true">Загружаем фото…</span>}
              <img src={imageSource(image, IMAGE_ORIGINAL)} alt={`${car.title} ${fromPhrase(carOrigin(car))}, фото ${index + 1}`} loading={index === initialIndex ? "eager" : "lazy"} fetchPriority={index === initialIndex ? "high" : "low"} decoding="async" onLoad={() => markImageLoaded(index)} onError={(event) => retryWithFullImage(event, image)} />
              <figcaption>
                {index + 1} из {images.length}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}

function VehicleGallery({ car }) {
  if (car.available === false) return <SoldVehiclePhoto car={car} detail />;
  // Ключ по машине: при переходе с машины на машину карточка остаётся той же, и
  // без него галерея держала номер снимка прежней машины («16 из 5», пустой кадр).
  return <ActiveVehicleGallery key={car.id} car={car} />;
}

function ActiveVehicleGallery({ car }) {
  const images = car.images?.length ? car.images : [car.image];
  const [active, setActive] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [zoomVisible, setZoomVisible] = useState(false);
  const activeZoomSource = imageSource(images[active], IMAGE_ORIGINAL);
  const [loadedZoomSource, setLoadedZoomSource] = useState("");
  const zoomReady = loadedZoomSource === activeZoomSource;
  // Соседние кадры ставим в ленту не сразу, а как только приехал главный снимок:
  // иначе первая загрузка страницы качала бы шесть фотографий вместо одной и
  // главный кадр — тот самый, по которому считают скорость сайта, — ждал бы в
  // очереди. Смахивание тоже включает готовность: если человек листает раньше,
  // чем доехало первое фото, соседние нужны немедленно.
  const [ready, setReady] = useState(false);
  const stripRef = useRef(null);
  const thumbsRef = useRef(null);
  const zoomImageRef = useRef(null);
  const zoomLensRef = useRef(null);
  const zoomFrame = useRef(0);
  const zoomPointer = useRef(null);
  // Фотографии лежат лентой в прокручиваемой полосе с прилипанием кадра. Раньше
  // смахивание тянуло единственный кадр в сторону, а за ним не было ничего —
  // отсюда пустое поле на мгновение. Теперь палец тянет ленту, и соседний снимок
  // приезжает вместе с пальцем, как в любой привычной галерее.
  // Пока лента сама плавно доезжает до кадра, событий прокрутки приходит много, и
  // на полпути номер снимка ещё старый — счётчик успевал дёрнуться туда и обратно.
  // Поэтому на время своего перехода слушаем только приезд в нужный кадр.
  const pending = useRef(null);
  const pendingTimer = useRef(0);
  const clampIndex = (index) => Math.min(images.length - 1, Math.max(0, index));
  // Ширину кадра берём у самой ленты, а не считаем как «ширина окна × номер»:
  // в сетке страницы кадр выходит дробной ширины (838,4 точки), целые 838 копили
  // ошибку, и к четвёртому снимку сбоку торчала полоска соседнего фото.
  const slideWidth = () => {
    const strip = stripRef.current;
    if (!strip) return 0;
    const first = strip.children[0];
    const second = strip.children[1];
    return second ? second.offsetLeft - first.offsetLeft : strip.clientWidth;
  };
  // Прилипание кадра снимаем не классом, а прямым свойством: класс приезжает
  // только со следующей отрисовкой, а к тому времени браузер уже успевает вернуть
  // ленту к ближайшему снимку, и свой переход рвётся на первом же кадре.
  const snapOff = (off) => {
    const strip = stripRef.current;
    if (strip) strip.style.scrollSnapType = off ? "none" : "";
  };
  const glide = useRef(0);
  const targetLeft = (index) => stripRef.current?.children[index]?.offsetLeft ?? null;
  const stopGlide = () => {
    window.cancelAnimationFrame(glide.current);
    glide.current = 0;
  };
  const holdPending = (index) => {
    pending.current = index;
    window.clearTimeout(pendingTimer.current);
    pendingTimer.current = window.setTimeout(() => {
      pending.current = null;
    }, 700);
  };
  // Мгновенный переход — для прыжков через несколько кадров: по миниатюре или с
  // последнего снимка на первый. Анимировать пролёт через десять фотографий
  // бессмысленно, а под курсором, который скользит по миниатюрам, любая анимация
  // отстаёт и выглядит рваной.
  const jumpTo = (index) => {
    const strip = stripRef.current;
    const left = targetLeft(index);
    if (!strip || left === null) return;
    stopGlide();
    snapOff(false);
    holdPending(index);
    strip.scrollLeft = left;
  };
  // Переход к соседнему кадру — своей анимацией на 0,17 с. Родная плавная прокрутка
  // браузера для этого слишком долгая (около трети секунды) и на новом наведении
  // мыши обрывается рывком; свою мы обрываем чисто и начинаем с текущего места.
  const glideTo = (index) => {
    const strip = stripRef.current;
    const to = targetLeft(index);
    if (!strip || to === null) return;
    const from = strip.scrollLeft;
    stopGlide();
    if (Math.abs(to - from) < 1) {
      jumpTo(index);
      return;
    }
    holdPending(index);
    snapOff(true);
    const started = performance.now();
    const step = (now) => {
      const part = Math.min(1, (now - started) / 170);
      const eased = 1 - (1 - part) ** 3;
      strip.scrollLeft = from + (to - from) * eased;
      if (part < 1) {
        glide.current = window.requestAnimationFrame(step);
        return;
      }
      glide.current = 0;
      strip.scrollLeft = to;
      snapOff(false);
    };
    glide.current = window.requestAnimationFrame(step);
  };
  const goTo = (index, animated) => {
    if (animated) glideTo(index);
    else jumpTo(index);
    setActive(index);
  };
  const move = (step) => {
    const next = (active + step + images.length) % images.length;
    goTo(next, Math.abs(next - active) === 1);
  };
  const selectImage = (index) => {
    if (index === active) return;
    goTo(index, Math.abs(index - active) === 1);
  };
  const onStripScroll = () => {
    const strip = stripRef.current;
    const width = slideWidth();
    if (!strip || !width) return;
    const index = clampIndex(Math.round(strip.scrollLeft / width));
    if (pending.current !== null) {
      if (index !== pending.current) return;
      pending.current = null;
    }
    if (index !== active) setActive(index);
  };
  // Мышью ленту тоже можно тянуть за собой — на компьютере это привычный способ
  // листать фотографии, и он работал до того, как галерея стала лентой. Пальцу
  // такая помощь не нужна: прокрутку он ведёт сам, поэтому берём только мышь.
  // Прилипание кадра на время перетаскивания отключаем: с ним браузер возвращал
  // ленту к ближайшему снимку на каждое движение руки, и лента стояла на месте.
  const drag = useRef(null);
  const suppressOpen = useRef(false);
  const [freeScroll, setFreeScroll] = useState(false);
  useEffect(
    () => () => {
      window.clearTimeout(pendingTimer.current);
      stopGlide();
      window.cancelAnimationFrame(zoomFrame.current);
    },
    [],
  );
  const onPointerDown = (event) => {
    setReady(true);
    // Любое касание ленты прерывает свой переход: дальше человек ведёт её сам.
    // Пальцу при этом возвращаем прилипание — прокрутку он ведёт средствами
    // браузера, и без прилипания лента остановилась бы между кадрами.
    stopGlide();
    const strip = stripRef.current;
    if (!strip || event.pointerType !== "mouse" || event.button !== 0 || images.length < 2) {
      snapOff(false);
      return;
    }
    pending.current = null;
    snapOff(true);
    drag.current = { id: event.pointerId, x: event.clientX, left: strip.scrollLeft, moved: false };
    setFreeScroll(true);
  };
  const dragGallery = (event) => {
    const start = drag.current;
    const strip = stripRef.current;
    if (!start || start.id !== event.pointerId || !strip) return;
    const distance = event.clientX - start.x;
    if (!start.moved && Math.abs(distance) > 4) {
      start.moved = true;
      // Захват указателя — только когда мышь реально повели: если мышь уйдёт за
      // край кадра, движение всё равно наше. Захватывать прямо при нажатии нельзя:
      // с захватом браузер отдаёт и последующий щелчок самой ленте, а не кадру
      // под курсором — и открытие галереи по клику переставало работать.
      // Браузер может и отказать (указатель уже отпущен) — тогда работаем без.
      try {
        strip.setPointerCapture?.(event.pointerId);
      } catch {
        /* не критично */
      }
    }
    if (start.moved) strip.scrollLeft = start.left - distance;
  };
  // Нижняя панель с миниатюрами и кнопкой «Все фото» остаётся обычным управлением:
  // линза не включается над ней и не может наползти на неё сверху. Границу берём
  // по фактическому положению миниатюр, поэтому защита сохраняется при любой
  // ширине галереи и при изменении масштаба страницы.
  const inlineZoomBounds = () => {
    const strip = stripRef.current;
    const thumbs = thumbsRef.current;
    if (!strip || !thumbs) return null;
    const sourceRect = strip.getBoundingClientRect();
    const thumbsRect = thumbs.getBoundingClientRect();
    return {
      sourceRect,
      bottom: Math.min(sourceRect.bottom, thumbsRect.top - 10),
    };
  };
  // На широком экране сама рамка под курсором становится увеличительным стеклом.
  // Внутри неё лежит оригинал активного снимка, увеличенный относительно того же
  // кадра в галерее: поэтому под курсором видна та же точка, но без потери качества.
  const positionZoom = (clientX, clientY) => {
    const initialBounds = inlineZoomBounds();
    if (!initialBounds || clientY >= initialBounds.bottom) return false;
    zoomPointer.current = { x: clientX, y: clientY };
    window.cancelAnimationFrame(zoomFrame.current);
    zoomFrame.current = window.requestAnimationFrame(() => {
      const strip = stripRef.current;
      const previewImage = zoomImageRef.current;
      const lens = zoomLensRef.current;
      if (!strip || !previewImage || !lens) return;
      const sourceRect = strip.getBoundingClientRect();
      const lensRect = lens.getBoundingClientRect();
      if (!sourceRect.width || !sourceRect.height || !lensRect.width || !lensRect.height) return;
      const zoomBounds = inlineZoomBounds();
      if (!zoomBounds) return;
      const zoom = GALLERY_ZOOM;
      const pointerX = Math.min(sourceRect.width, Math.max(0, clientX - sourceRect.left));
      const pointerY = Math.min(sourceRect.height, Math.max(0, clientY - sourceRect.top));
      const lensX = Math.min(sourceRect.width - lensRect.width, Math.max(0, pointerX - lensRect.width / 2));
      const zoomAreaHeight = Math.max(0, Math.min(sourceRect.height, zoomBounds.bottom - sourceRect.top));
      const lensY = Math.min(Math.max(0, zoomAreaHeight - lensRect.height), Math.max(0, pointerY - lensRect.height / 2));
      const imageWidth = sourceRect.width * zoom;
      const imageHeight = sourceRect.height * zoom;
      const imageX = Math.min(0, Math.max(lensRect.width - imageWidth, lensRect.width / 2 - pointerX * zoom));
      const imageY = Math.min(0, Math.max(lensRect.height - imageHeight, lensRect.height / 2 - pointerY * zoom));
      lens.style.transform = `translate3d(${lensX}px, ${lensY}px, 0)`;
      previewImage.style.width = `${imageWidth}px`;
      previewImage.style.height = `${imageHeight}px`;
      previewImage.style.transform = `translate3d(${imageX}px, ${imageY}px, 0)`;
    });
    return true;
  };
  const showZoom = (event) => {
    if (event.pointerType !== "mouse" || !window.matchMedia("(min-width: 981px) and (hover: hover) and (pointer: fine)").matches) return;
    if (positionZoom(event.clientX, event.clientY)) setZoomVisible(true);
  };
  const movePointer = (event) => {
    dragGallery(event);
    if (event.pointerType !== "mouse" || !window.matchMedia("(min-width: 981px) and (hover: hover) and (pointer: fine)").matches) return;
    if (positionZoom(event.clientX, event.clientY)) {
      if (!zoomVisible) setZoomVisible(true);
      return;
    }
    zoomPointer.current = null;
    setZoomVisible(false);
  };
  const hideZoom = (event) => {
    if (event.pointerType === "mouse") {
      window.cancelAnimationFrame(zoomFrame.current);
      zoomFrame.current = 0;
      zoomPointer.current = null;
      setZoomVisible(false);
    }
  };
  const endDrag = (event) => {
    const start = drag.current;
    const strip = stripRef.current;
    drag.current = null;
    if (!start || !strip) {
      setFreeScroll(false);
      snapOff(false);
      return;
    }
    try {
      strip.releasePointerCapture?.(event.pointerId);
    } catch {
      /* не критично */
    }
    const width = slideWidth();
    const distance = start.id === event.pointerId ? event.clientX - start.x : 0;
    const from = width ? Math.round(start.left / width) : active;
    // Порог — четверть кадра, но не больше 70 точек: короткого движения рукой
    // достаточно, чтобы перейти к следующему снимку.
    const threshold = width ? Math.min(70, width / 4) : 70;
    const step = Math.abs(distance) >= threshold ? (distance > 0 ? -1 : 1) : 0;
    // Перетаскивание не должно открывать все фотографии. Браузер всё равно пришлёт
    // клик сразу за отпусканием кнопки — он и погасит признак. Но если клика не
    // будет, признак снимаем сам следующим же тиком, иначе он проглотит
    // следующее честное нажатие.
    if (start.moved) {
      suppressOpen.current = true;
      window.setTimeout(() => {
        suppressOpen.current = false;
      }, 0);
    }
    setFreeScroll(false);
    // Доводим ленту до кадра своей анимацией: она же вернёт прилипание в конце.
    goTo(clampIndex(from + step), true);
  };
  const openModal = () => {
    if (suppressOpen.current) {
      suppressOpen.current = false;
      return;
    }
    setModalOpen(true);
  };
  useEffect(() => {
    const thumb = thumbsRef.current?.children[active];
    const rail = thumbsRef.current;
    if (!thumb || !rail) return;
    const thumbLeft = thumb.offsetLeft;
    const thumbRight = thumbLeft + thumb.offsetWidth;
    if (thumbLeft < rail.scrollLeft) rail.scrollTo({ left: thumbLeft, behavior: "smooth" });
    else if (thumbRight > rail.scrollLeft + rail.clientWidth)
      rail.scrollTo({
        left: thumbRight - rail.clientWidth,
        behavior: "smooth",
      });
  }, [active]);
  // Пустой лист при смахивании: браузер выбрасывает прежний кадр в тот же миг, когда
  // ему дают адрес нового, а оригинал снимка ещё едет по сети. Поэтому, во-первых, под
  // каждым большим кадром лежит облегчённая версия того же снимка (600 точек, ~30 КБ —
  // её браузер уже скачал для плитки в каталоге): она появляется почти сразу и её
  // накрывает оригинал, когда придёт. Во-вторых, соседние снимки запрашиваем заранее,
  // пока посетитель смотрит текущий, — тогда смахивание чаще всего не ждёт сети вовсе.
  const preloadKeeper = useRef([]);
  useEffect(() => {
    if (images.length < 2 || !ready) return;
    const link = navigator.connection;
    if (link?.saveData) return;
    const at = (step) => images[(active + step + images.length * 2) % images.length];
    // Кадр через один: качаем только облегчённую версию (13 КБ). Она страхует от
    // белого листа, если посетитель пролистнул дальше, чем мы успели приготовить, —
    // а тянуть вперёд по два оригинала на 70 КБ значило бы жечь мобильный трафик
    // на снимки, которых человек может и не увидеть.
    const wanted = [2, -2].map((step) => imageSource(at(step), IMAGE_WIDTH_CARD));
    const started = [];
    for (const href of new Set(wanted.filter(Boolean))) {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = href;
      started.push(image);
    }
    // Ссылки держим, чтобы сборщик мусора не оборвал запрос на полпути.
    preloadKeeper.current = [...started, ...preloadKeeper.current].slice(0, 12);
  }, [active, images, ready]);
  // Страховка к onLoad: если главный снимок уже лежал в кэше, браузер успевает
  // отметить его загруженным до того, как разметка оживёт, и события мы не увидим.
  // Соседи ждут готовности главного снимка или явного перелистывания: таймер
  // через две секунды раньше добавлял нагрузку именно на медленной сети.
  useEffect(() => {
    const image = stripRef.current?.querySelector(".gallery-frame-full");
    if (image?.complete && image.naturalWidth > 0) {
      setReady(true);
    }
  }, []);
  // Соседний кадр слева и справа держим готовым — это ровно то, что палец вытягивает
  // в поле зрения. Дальше не забегаем: у иных объявлений снимков по сотне, и каждый
  // лишний кадр — это 83 КБ мобильного трафика впустую.
  const near = ready ? 1 : 0;
  return (
    <>
      <section className={`gallery-panel${zoomVisible ? " zooming" : ""}`}>
        {/* Кадры дальше двух от текущего в разметку не ставим: у иных объявлений
            снимков под сотню, и сотня рамок в ленте — это лишняя работа браузеру.
            Соседние всегда на месте, поэтому тянуть ленту не во что пустое. */}
        <div
          className={`gallery-strip${freeScroll ? " free" : ""}`}
          ref={stripRef}
          onScroll={onStripScroll}
          onPointerEnter={showZoom}
          onPointerDown={onPointerDown}
          onPointerMove={movePointer}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={hideZoom}
        >
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              className="gallery-slide"
              tabIndex={index === active ? 0 : -1}
              onClick={openModal}
              aria-label={`Фото ${index + 1} из ${images.length}: ${car.title}. Открыть все фотографии`}
            >
              {Math.abs(index - active) <= near && (
                <>
                  <img className="gallery-frame-preview" src={imageSource(image, IMAGE_WIDTH_CARD)} alt="" aria-hidden="true" draggable="false" />
                  <img
                    className="gallery-frame-full"
                    src={imageSource(image, IMAGE_ORIGINAL)}
                    alt={`${car.title} ${fromPhrase(carOrigin(car))}, фото ${index + 1}`}
                    fetchPriority={index === active ? "high" : "low"}
                    draggable="false"
                    onLoad={index === 0 ? () => setReady(true) : undefined}
                    onError={(event) => {
                      if (index === 0) setReady(true);
                      retryWithFullImage(event, image);
                    }}
                  />
                </>
              )}
            </button>
          ))}
        </div>
        <div ref={zoomLensRef} className={`gallery-zoom-lens${zoomVisible && zoomReady ? " is-visible" : ""}`} aria-hidden="true">
          <img
            key={`${active}-${activeZoomSource}`}
            ref={zoomImageRef}
            src={activeZoomSource}
            alt=""
            draggable="false"
            decoding="async"
            onLoad={() => {
              setLoadedZoomSource(activeZoomSource);
              const pointer = zoomPointer.current;
              if (pointer) positionZoom(pointer.x, pointer.y);
            }}
            onError={(event) => retryWithFullImage(event, images[active])}
          />
        </div>
        <span aria-live="polite">
          <Images size={17} />
          {active + 1} из {images.length}
        </span>
        {images.length > 1 && (
          <div className="gallery-controls">
            <button aria-label="Предыдущее фото" onClick={() => move(-1)}>
              <ArrowLeft size={20} />
            </button>
            <button aria-label="Следующее фото" onClick={() => move(1)}>
              <ArrowRight size={20} />
            </button>
          </div>
        )}
        <div className="gallery-thumbs" ref={thumbsRef}>
          {images.map((image, index) => (
            <button key={`${image}-${index}`} className={active === index ? "active" : ""} onMouseEnter={() => selectImage(index)} onClick={() => selectImage(index)} aria-label={`Показать фото ${index + 1}`}>
              {/* Подпись для поиска по картинкам: большой кадр в разметке один, остальные
                  фото машины робот находит только здесь. Имя кнопки даёт aria-label. */}
              <img src={imageSource(image, IMAGE_WIDTH_THUMB)} alt={`${car.title}, фото ${index + 1}`} loading="lazy" fetchPriority="low" decoding="async" onError={(event) => retryWithFullImage(event, image)} />
            </button>
          ))}
        </div>
        <button className="gallery-view-all" onClick={() => setModalOpen(true)}>
          <Images size={18} />
          Все фото
        </button>
      </section>
      {modalOpen && <GalleryModal car={car} images={images} initialIndex={active} onClose={() => setModalOpen(false)} />}
    </>
  );
}

function FactList({ items, tiles = false }) {
  return (
    <div className={tiles ? "fact-list fact-list--tiles" : "fact-list"}>
      {items.map(([Icon, label, value]) => (
        <div className="fact-row" key={label}>
          <Icon size={21} weight="duotone" aria-hidden="true" />
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

// Полная техническая карта источника: ~85 пунктов в 7 группах, свёрнутых по
// умолчанию, чтобы не раздавить страницу. Словарь перевода живёт в
// spec-translations.js; незнакомые значения показываются как есть.
const SPEC_GROUP_ICONS = {
  "Общие данные": ClipboardText,
  "Общие сведения": ClipboardText,
  "Динамика и расход": Gauge,
  "Электромотор и батарея": BatteryHigh,
  "Объёмы и масса": Scales,
  "Размеры": ArrowsLeftRight,
  "Привод, тормоза, подвеска": Gear,
  "Кузов": CarProfile,
  "Электромотор": Lightning,
  "Батарея и зарядка": BatteryHigh,
  "Двигатель": Engine,
  "Трансмиссия": Gear,
  "Шасси и рулевое управление": SteeringWheel,
  "Колёса и тормоза": Tire,
  "Безопасность": ShieldCheck,
  "Помощь водителю": SteeringWheel,
  "Оснащение кузова": Sparkle,
  "Оснащение салона": SlidersHorizontal,
  "Сиденья": UsersThree,
  "Мультимедиа": Desktop,
  "Освещение": Lightbulb,
  "Стёкла и зеркала": Eye,
  "Опции": SlidersHorizontal,
  "Итог": ShieldCheck,
  "Самодиагностика": Gauge,
  "Коробка передач": Gear,
  "Рулевое управление": SteeringWheel,
  "Тормоза": Tire,
  "Электрика": Lightning,
  "Топливная система": GasPump,
  "Высоковольтная система": Lightning,
  "Кузовные панели": CarProfile,
  "Страховая история": ShieldCheck,
  "Батарея": BatteryHigh,
};

function TechnicalSpecs({ car, navigate }) {
  const { user, backend } = useContext(AuthContext);
  const [reportPayload, setReportPayload] = useState(null);
  const [reportError, setReportError] = useState(false);
  const [reportRetry, setReportRetry] = useState(0);
  useEffect(() => {
    if (!user || backend !== "server") {
      setReportPayload(null);
      setReportError(false);
      return undefined;
    }
    if (!car.reportPreview?.length) return undefined;
    const controller = new AbortController();
    setReportError(false);
    fetch(`/api/cars/${encodeURIComponent(car.id)}/report`, { signal:controller.signal, credentials:"same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("report unavailable")))
      .then((payload) => setReportPayload({ carId:car.id, accountId:user.id, groups:payload.groups || [] }))
      .catch(() => { if (!controller.signal.aborted) { setReportPayload(null); setReportError(true); } });
    return () => controller.abort();
  }, [user?.id, backend, car.id, car.reportPreview, reportRetry]);
  // Цвета в техкарте источника нет — она описывает модель, а не конкретную машину.
  // Подмешиваем его из объявления первой строкой «Общих данных», чтобы цвет
  // находился и глазами, и встроенным поиском по полным данным.
  const groups = useMemo(() => {
    const translated = translateTechnicalSpecs(car.technicalSpecs);
    const color = translateColor(car.bodyColor);
    if (color && translated.length) {
      const firstSpec = translated.findIndex((group) => !group.isReport);
      const colorRow = { name: "Цвет кузова", value: color };
      if (firstSpec >= 0) translated[firstSpec] = { ...translated[firstSpec], items: [colorRow, ...translated[firstSpec].items] };
      else translated.unshift({ name: "Общие сведения", isReport: false, items: [colorRow] });
    }
    return translated;
  }, [car.technicalSpecs, car.bodyColor]);
  const specGroups = groups.filter((group) => !group.isReport);
  const reportUnlocked = Boolean(user && backend === "server" && reportPayload?.carId === car.id && reportPayload.accountId === user.id);
  const reportGroups = reportUnlocked
    ? translateTechnicalSpecs({ groups:reportPayload.groups }).filter((group) => group.isReport)
    : [];
  const reportPreview = car.reportPreview?.length
    ? car.reportPreview.map((group) => translateSpecGroup(group.name))
    : groups.filter((group) => group.isReport).map((group) => group.name);
  const searchableGroups = [...specGroups, ...reportGroups];
  const reportHeadingId = useId();
  const [query, setQuery] = useState("");
  const searchBoxRef = useRef(null);
  // Тот же умный поиск: часть слова, кириллица и набранное не в той раскладке.
  const needles = listSearchVariants(query);
  // Выдача поиска — слой поверх аккордеона: сами группы не перестраиваются,
  // поэтому страница не дёргается при наборе (ищем и по названию, и по значению).
  const found = useMemo(() => {
    if (!needles.length) return [];
    return searchableGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const haystack = searchNormalize(`${item.name} ${item.value}`);
          return needles.some((needle) => haystack.includes(needle));
        }),
      }))
      .filter((group) => group.items.length);
  }, [searchableGroups, needles.join("|")]);
  const searching = needles.length > 0;
  // Клик мимо панели или Escape закрывают выдачу вместе с запросом. Escape
  // перехватываем на capture-фазе, чтобы в быстром просмотре он сперва закрыл
  // выдачу, а не модалку целиком.
  useEffect(() => {
    if (!searching) return undefined;
    const onPointerDown = (event) => {
      if (!searchBoxRef.current?.contains(event.target)) setQuery("");
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setQuery("");
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [searching]);
  if (!groups.length && !reportPreview.length) return null;
  const renderGroup = (group) => {
    const GroupIcon = SPEC_GROUP_ICONS[group.name] || ListChecks;
    return (
      <details className="spec-group" key={group.name}>
        <summary>
          <GroupIcon size={21} weight="duotone" aria-hidden="true" />
          <span>{group.name}</span>
          <small>{group.items.length}</small>
          <CaretDown className="spec-caret" size={18} aria-hidden="true" />
        </summary>
        <div className="spec-rows">
          {group.items.map((item, index) => (
            <div className="spec-row" key={`${item.name}-${index}`}>
              <span>{item.name}</span>
              <b>{item.value}</b>
            </div>
          ))}
        </div>
      </details>
    );
  };
  return (
    <>
    <section className="detail-facts-section technical-specs" aria-label="Характеристики автомобиля">
      <div className="spec-search-box" ref={searchBoxRef}>
        <SearchField
          className="spec-search"
          value={query}
          placeholder="Поиск: разгон, багажник, зарядка…"
          ariaLabel="Поиск по полным данным"
          onValueChange={setQuery}
        />
        {searching && (
          <div className="spec-search-results" role="region" aria-label="Результаты поиска по полным данным">
            {found.length
              ? found.map((group) => (
                  <div className="spec-search-group" key={`${group.isReport ? "report" : "spec"}-${group.name}`}>
                    <p>{group.isReport ? `Отчет об авто · ${group.name}` : group.name}</p>
                    {group.items.map((item, index) => (
                      <div className="spec-row" key={`${item.name}-${index}`}>
                        <span>{item.name}</span>
                        <b>{item.value}</b>
                      </div>
                    ))}
                  </div>
                ))
              : <p className="spec-search-empty">Ничего не найдено — попробуйте другое слово.</p>}
          </div>
        )}
      </div>
      {specGroups.map(renderGroup)}
    </section>
    {(reportGroups.length > 0 || reportPreview.length > 0) && (
      <section className="detail-facts-section technical-specs vehicle-report" aria-labelledby={reportHeadingId}>
        <h2 id={reportHeadingId}>Отчет об авто</h2>
        {reportUnlocked ? reportGroups.map(renderGroup) : user ? (
          <div className="vehicle-report-status" role="status">
            {backend !== "server" ? "Отчет временно недоступен." : reportError ? (
              <>Не удалось загрузить отчет. <button type="button" onClick={() => setReportRetry((value) => value + 1)}>Повторить</button></>
            ) : "Загружаем отчет…"}
          </div>
        ) : (
          <div className="vehicle-report-gate">
            <div className="vehicle-report-preview" aria-hidden="true">
              {reportPreview.slice(0, 6).map((name, index) => {
                const GroupIcon = SPEC_GROUP_ICONS[name] || ListChecks;
                return <div className="vehicle-report-preview-row" key={`${name}-${index}`}>
                  <GroupIcon size={21} weight="duotone" />
                  <span>{name}</span>
                  <i />
                  <CaretDown size={18} />
                </div>;
              })}
            </div>
            <div className="vehicle-report-gate-content">
              <LockKey size={47} weight="duotone" aria-hidden="true" />
              <h3>Полный отчет — после регистрации</h3>
              <p>Осмотр и страховая история доступны в личном кабинете</p>
              <button className="primary vehicle-report-gate-button" type="button" onClick={() => navigate("/register", { preserveScroll:true })}>Открыть отчет</button>
              <p className="vehicle-report-gate-login">Есть аккаунт? <button type="button" onClick={() => navigate("/login", { preserveScroll:true })}>Войти</button></p>
            </div>
          </div>
        )}
      </section>
    )}
    </>
  );
}

const CONDITION_SOURCE_HINT = "Информация о состоянии авто предоставлена источником объявления";

function VehicleConditionSummary({ car }) {
  const detailsId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const grade = /^[A-D]$/.test(car.conditionGrade || "") ? car.conditionGrade : null;
  const descriptionGrade = /^[A-D]$/.test(car.chinaGrade || "") ? car.chinaGrade : null;
  const displayedGrade = worstConditionGrade(grade, descriptionGrade);
  const displayedGradeMeta = conditionGradeMeta(displayedGrade);
  const hasNumber = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
  const points = (car.inspectionReport?.inspectionSections || []).flatMap((section) => section.points || []);
  const facts = [
    ["Оценка внешнего вида", hasNumber(car.appearanceScore) ? `${car.appearanceScore}/100` : null],
    ["Здоровье батареи", hasNumber(car.batteryHealth) ? `${car.batteryHealth}%` : null],
    ["Страховые обращения", hasNumber(car.insuranceClaims) ? String(car.insuranceClaims) : null],
    ["Переоформления", hasNumber(car.transfers) ? String(car.transfers) : null],
    ["Пункты с замечаниями", points.length ? `${points.filter((point) => point.status === "attention").length} из ${points.length}` : null],
  ].filter(([, value]) => value !== null);
  const sourceConditionSummary = car.conditionSummary
    ? `Согласно данным источника, ${car.conditionSummary.replace(/^В описании\s+/u, "").replace(/^./u, (letter) => letter.toLowerCase())}`
    : "";
  if (!grade && !descriptionGrade && !facts.length && !car.conditionSummary) return null;
  // Подробности открывает сама плашка оценки — со стрелкой, как у цены в шапке;
  // пояснение источника («Согласно данным источника…») тоже прячется под неё.
  // Без оценки остаётся прежняя ссылка «Подробнее», а пояснение стоит открыто.
  const gradeToggles = Boolean(displayedGradeMeta) && (facts.length > 0 || Boolean(sourceConditionSummary));
  const description = sourceConditionSummary && <p className="vehicle-condition-description">{sourceConditionSummary}</p>;
  // Под раскрытыми цифрами пояснение источника их только повторяло — там остаётся
  // короткая ссылка на источник. Полный текст нужен, лишь когда цифр нет.
  const sourceNote = facts.length > 0
    ? <p className="vehicle-condition-description">Согласно данным источника объявления</p>
    : description;
  return (
    <section className="vehicle-condition-summary" aria-label="Состояние согласно источнику">
      {displayedGradeMeta && (
        <div className="vehicle-condition-grade">
          {gradeToggles ? (
            <button
              type="button"
              className={`condition-grade-badge condition-grade-toggle condition-grade-${displayedGradeMeta.tone}`}
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              aria-label={`${displayedGradeMeta.label}: подробнее`}
              onClick={() => setDetailsOpen((open) => !open)}
            >
              <span>{displayedGradeMeta.label}</span>
              <CaretDown size={13} weight="bold" aria-hidden="true" />
            </button>
          ) : (
            // Раскрывать нечего — вместо стрелки значок «i», а подсказка при наведении
            // (на телефоне — по касанию) говорит, чья это оценка.
            <span
              className={`condition-grade-badge condition-grade-info condition-grade-${displayedGradeMeta.tone}`}
              role="img"
              aria-label={`${displayedGradeMeta.label}. ${CONDITION_SOURCE_HINT}`}
              tabIndex="0"
            >
              <span>{displayedGradeMeta.label}</span>
              <Info size={14} weight="bold" aria-hidden="true" />
              <ActionTooltip className="condition-grade-tooltip" text={CONDITION_SOURCE_HINT} tapToOpen />
            </span>
          )}
        </div>
      )}
      {!gradeToggles && description}
      {(facts.length > 0 || gradeToggles) && (
        <>
          {!gradeToggles && (
          <button
            type="button"
            className="vehicle-condition-details-toggle"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            Подробнее <CaretDown size={15} aria-hidden="true" />
          </button>
          )}
          <div className="animated-disclosure vehicle-condition-details" aria-hidden={!detailsOpen} inert={!detailsOpen}>
            <div id={detailsId}>
              {facts.length > 0 && <dl>{facts.map(([label, value]) => <div key={label} className="facts-row"><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
              {gradeToggles && sourceNote}
            </div>
          </div>
        </>
      )}
      {car.inspectionReport && <a href="#guazi-full-report" className="vehicle-condition-report-link">Полный отчёт осмотра <ArrowDown size={16} aria-hidden="true" /></a>}
    </section>
  );
}

// Подсказка к растаможке: что это за платёж, что в него входит и что сумма
// предварительная — обычными словами. С withAlert первой строкой идёт
// предупреждение («Без квоты на льготный ввоз») оранжевым: в карточке оно живёт
// только здесь, в оформлении заказа стоит строкой под растаможкой.
function CustomsTooltip({ price, withAlert = false }) {
  const alert = withAlert && price.customsAlert ? price.customsAlert.replace(/\.$/u, "") : null;
  const text = [price.customsHint || price.customsNote, price.customsIncludedText, price.customsBasisNote].filter(Boolean).join(" ");
  return (
    <>
      {alert && <><b className="tooltip-warn">{alert}.</b>{" "}</>}
      {text}
    </>
  );
}

// Строка детализации цены в карточке: название, пунктир до суммы, сумма и значок
// «i» справа от неё. Вид общий со списком «Основной информации» (.facts-row).
function PriceBreakdownRow({ label, value, description }) {
  return (
    <div className="facts-row">
      <b>{label}</b>
      <strong>{withApprox(value)}</strong>
      <span className="price-info" tabIndex={0} aria-label={`Подробнее: ${label}`}>
        <Info size={16} />
        <ActionTooltip text={description} />
      </span>
    </div>
  );
}

function PriceLabel({ label, description }) {
  // Подсказка общая со служебными кнопками: координаты ставит JS с fixed-позицией,
  // иначе текст резали край окна и прокрутка (как раньше у «Удалить из избранного»).
  return (
    <div className="price-label">
      <b>{label}</b>
      <span className="price-info" tabIndex={0} aria-label={`Подробнее: ${label}`}>
        <Info size={16} />
        <ActionTooltip text={description} />
      </span>
    </div>
  );
}

function CustomSearchCta({ variant, navigate }) {
  const isEmpty = variant === "empty";
  return (
    <section className={`custom-search-cta ${isEmpty ? "is-empty" : "is-end"}`} aria-labelledby={`custom-search-${variant}-title`}>
      <div className="custom-search-icon" aria-hidden="true">
        {isEmpty ? <MagnifyingGlass size={28} weight="bold" /> : <CarProfile size={28} weight="duotone" />}
      </div>
      <div className="custom-search-copy">
        <h2 id={`custom-search-${variant}-title`}>{isEmpty ? "Объявления не найдены" : "Не нашли подходящий автомобиль?"}</h2>
        <p>{isEmpty ? "По данным фильтрам ни одного объявления не найдено. Попробуйте изменить параметры фильтра." : "Напишите, что ищете — подберём подходящий вариант."}</p>
      </div>
      {!isEmpty && (
        <AppLink className="primary" href="/contacts" navigate={navigate}>
          Свяжитесь с нами <ArrowRight size={18} />
        </AppLink>
      )}
    </section>
  );
}

function Detail({ car, cars, apiMode, navigate, backToCatalog, favorite, favorites, toggleFavorite }) {
  // Шаг назад по истории возвращает и фильтры, и позицию карточки, поэтому
  // кнопка идёт именно им. Прямой заход историей не подкреплён — тогда в каталог.
  const goBack = () => (window.history.length > 1 && window.history.state?.fromPath ? navigate(-1) : backToCatalog(car.id));
  const openFilteredCatalog = (withModel) => {
    const stored = readCatalogReturn();
    const model = withModel ? [car.model] : [];
    const target = `/catalog?brand=${encodeURIComponent(car.brand)}${withModel ? `&model=${encodeURIComponent(car.model)}` : ""}`;
    if (!stored || stored.openedCarId !== car.id) {
      navigate(target);
      return;
    }
    // Марка и модель сужают выдачу: фильтры переносим, но порядок и якорь
    // прошлого списка к новому набору уже не относятся.
    navigate(target, {
      catalogState: { ...stored, catalog: { ...stored.catalog, filters: { ...stored.catalog.filters, brand: car.brand, model }, order: [] }, scrollY: 0, scrollAnchor: null },
    });
  };
  const openBrand = () => openFilteredCatalog(false);
  const openModel = () => openFilteredCatalog(true);
  // Адреса крошек — страницы марки и модели; адрес с фильтром остаётся только
  // у марки без своего раздела (туда же ведёт и нажатие).
  const { openQuickView, quickViewModal } = useVehicleQuickView({ apiMode:apiMode !== false, favorites, toggleFavorite, navigate });
  const openSimilarCar = (candidate) => {
    if (openQuickView(candidate)) return;
    navigate(carHref(candidate));
  };
  // Машины может ещё не быть: при переходе внутри сайта первый кадр рисуется до
  // того, как загрузчик карточки успел включиться. Всё, что читает car, — ниже
  // этой проверки, иначе падение роняет всю страницу в чёрный экран.
  if (!car) return <NotFound navigate={navigate} />;
  const brandCrumbHref = brandLandingPath(car.brand) || `/catalog?brand=${encodeURIComponent(car.brand)}`;
  const modelCrumbHref = modelLandingPath(car.brand, car.model) || `/catalog?brand=${encodeURIComponent(car.brand)}&model=${encodeURIComponent(car.model)}`;
  return (
    <main className="detail page-width">
      <VehicleDetailBody car={car} navigate={navigate} favorite={favorite} toggleFavorite={toggleFavorite} goBack={goBack} priceRatingPending={apiMode !== false && car.priceRating === undefined} breadcrumbs={
        <Breadcrumbs>
        <CrumbLink href="/" onOpen={() => navigate("/")}>Главная</CrumbLink>
        <CaretRight size={13} />
        <CrumbLink href="/catalog" onOpen={() => backToCatalog(car.id)}>Каталог авто {siteFromPhrase()}</CrumbLink>
        <CaretRight size={13} />
        <CrumbLink href={brandCrumbHref} onOpen={openBrand}>{car.brand}</CrumbLink>
        <CaretRight size={13} />
        <CrumbLink href={modelCrumbHref} onOpen={openModel}>{car.model}</CrumbLink>
        <CaretRight size={13} />
        {car.model} {car.year}
      </Breadcrumbs>
      } />
      <SimilarCars car={car} cars={cars} onOpenCar={openSimilarCar} />
      {quickViewModal}
    </main>
  );
}

// Ссылку кладём в буфер обмена: без доступа к Clipboard API (http, отказ в
// разрешении) остаётся старый путь через скрытое поле.
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  } catch {
    return false;
  }
}

// Оранжевая плашка под карточкой цены: особенность марки, из-за которой итог
// может вырасти уже после проверки машины. Стоит после кнопки, чтобы её
// прочитали перед обращением, но не заслоняла цену.
function BrandNotice({ car }) {
  const notice = brandNotice(car?.brand);
  if (!notice) return null;
  return (
    <section className="brand-notice" aria-label={notice.title}>
      <div className="brand-notice-heading">
        <BatteryHigh size={20} weight="duotone" />
        <b>{notice.title}</b>
      </div>
      {notice.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </section>
  );
}

// Серый ряд с номером объявления под карточкой цены: по нему клиент называет
// машину менеджеру, поэтому рядом кнопка «скопировать».
function ListingIdRow({ car }) {
  const [state, setState] = useState("idle");
  useEffect(() => {
    if (state === "idle") return undefined;
    const timer = window.setTimeout(() => setState("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [state]);
  const id = listingNumber(car.sourceId || car.id);
  if (!id) return null;
  const copy = async () => setState((await copyToClipboard(String(id))) ? "copied" : "failed");
  return (
    <span className="listing-id-row">
      <span>{state === "copied" ? "ID скопирован" : state === "failed" ? "Не удалось скопировать" : `ID объявления: ${id}`}</span>
      <button type="button" aria-label="Копировать ID объявления" onClick={copy}>
        {state === "copied" ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </span>
  );
}

// С подписью (labelled) — в полосе быстрого просмотра: там кнопка стоит с текстом,
// и подсказка при наведении ей не нужна.
function CopyLinkButton({ car, labelled = false, className }) {
  const [state, setState] = useState("idle");
  useEffect(() => {
    if (state === "idle") return undefined;
    const timer = window.setTimeout(() => setState("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [state]);
  const hint = state === "copied" ? "Ссылка скопирована" : state === "failed" ? "Не удалось скопировать" : "Копировать ссылку";
  const copy = async () => {
    const link = new URL(appHref(carHref(car)), window.location.origin).href;
    setState((await copyToClipboard(link)) ? "copied" : "failed");
  };
  if (labelled) {
    return (
      <button type="button" className={className} onClick={copy} aria-label={hint} aria-live="polite">
        {state === "copied" ? <Check size={19} weight="bold" /> : <LinkSimple size={19} weight="bold" />}
        <span>{hint}</span>
      </button>
    );
  }
  return (
    <button type="button" aria-label={hint} onClick={copy}>
      <LinkSimple size={21} />
      <ActionTooltip text={hint} />
    </button>
  );
}

// Китайское имя модели рядом с названием.
//
// В каталоге машины стоят под беларускими именами — так их здесь ищут: 星瑞 у нас
// Geely Preface, 缤越 — Coolray. Но покупатель сверяет карточку с китайскими
// объявлениями и обзорами, где имя другое, поэтому оно должно быть под рукой.
// Знак появляется только у переименованных моделей: где имя совпадает, показывать
// нечего (`config/model-names-by.mjs`).
function ChineseNameMark({ car }) {
  // Китайское имя — только у машины из Китая: корейской Elantra оно ни к чему.
  const info = carOrigin(car) === "china" ? chineseModelName(car?.brand, car?.model) : null;
  if (!info) return null;
  const spoken = info.pinyin ? `${info.zh} (${info.pinyin})` : info.zh;
  const hint = `В Китае эта модель называется ${spoken}`;
  const tooltip = (
    <>
      <b>В Китае — {info.zh}</b>
      {info.pinyin && <i>{info.pinyin}</i>}
      {info.note && <i>{info.note}</i>}
    </>
  );
  // Класс стрелки на полную страницу берём как есть: знак стоит рядом с ней в строке
  // заголовка, и они должны читаться как пара — один круг, один размер значка.
  return (
    <span className="detail-back chinese-name-mark" role="img" aria-label={hint} tabIndex="0">
      <Info />
      <ActionTooltip className="chinese-name-tooltip" text={tooltip} tapToOpen />
    </span>
  );
}

// Что делает кнопка «Узнать точную цену и наличие» в карточке: раньше она молча уводила
// в кабинет, и человек попадал неизвестно куда. Теперь запрос уходит с самой страницы,
// а окно подтверждает, что заявка принята. Собрано тем же набором, что и остальные
// такие окна сайта: значок, заголовок, строка текста и кнопка.
function AvailabilityRequestModal({ onClose, preview = false }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="lead-modal order-removal-modal confirm-modal availability-paused-modal social-unavailable-modal availability-request-modal" role="dialog" aria-modal="true" aria-labelledby="availability-request-title" aria-describedby="availability-request-description">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Закрыть"><X size={22} /></button>
        <Illustration className="availability-request-icon" src="/illustrations/catalog-service-shield.png" width="80" height="80" alt="" aria-hidden="true" />
        <h2 id="availability-request-title">{preview ? "Карточка в предпросмотре" : "Заявка принята"}</h2>
        <p id="availability-request-description">{preview
          ? "Кнопка показана для проверки интерфейса. Заявки по локальной тестовой карточке не отправляются."
          : "Мы передали запрос проверенной компании-импортёру: она уточнит у продавца наличие и цену и свяжется с вами."}</p>
        <div className="order-removal-actions availability-paused-actions">
          <button className="invert-button" type="button" onClick={onClose} autoFocus>Закрыть</button>
        </div>
      </section>
    </div>
  );
}

// Заявка гостя: только имя и телефон, без регистрации аккаунта.
function AvailabilityLeadModal({ car, submitLead, onClose, onDone }) {
  const backdropRef = useRef(null);
  const fieldsRef = useRef(null);
  const openingTracked = useRef(false);
  const [values, setValues] = useState({ name:"" });
  const [phoneValue, setPhoneValue] = useState({ country:"BY", national:"" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const mobileLayout = useMediaQuery(NARROW_VIEWPORT);
  const update = (field) => (event) => setValues((current) => ({ ...current, [field]:event.target.value }));
  useEffect(() => {
    if (openingTracked.current) return;
    openingTracked.current = true;
    trackYandexGoal("lead_form_open");
  }, []);
  useEffect(() => bindModalViewport(backdropRef.current, fieldsRef.current), []);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, pending]);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const phone = completePhoneNumber(phoneValue);
    if (values.name.trim().length < 2) return setError(authMessages.invalid_name);
    if (!phone) return setError(authMessages.invalid_phone);
    setPending(true);
    try {
      await submitLead(car, { name:values.name.trim(), phone });
      onDone();
    } catch (submitError) {
      setError(authMessages[submitError.message] || "Не удалось отправить заявку. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div ref={backdropRef} className="modal-backdrop auth-modal-backdrop availability-lead-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}>
      <form className="auth-card auth-modal availability-lead-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="availability-lead-title">
        <button className="modal-close" type="button" onClick={onClose} disabled={pending} aria-label="Закрыть"><X size={19} weight="bold" /></button>
        <div className="auth-modal-heading">
          <h1 id="availability-lead-title">Оставить заявку</h1>
        </div>
        <div ref={fieldsRef} className="availability-lead-fields">
          <p className="availability-lead-note">Заявку получит компания-импортёр и уточнит все детали.</p>
          <label className="auth-field"><span>Имя</span><input autoFocus autoComplete="name" value={values.name} onChange={update("name")} placeholder={mobileLayout ? "Имя" : "Например, Алексей"} required /></label>
          <PhoneField value={phoneValue} onChange={setPhoneValue} CountrySelect={SelectField} />
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="availability-lead-footer">
            <button className="primary auth-submit availability-lead-submit" type="submit" disabled={pending}>{pending ? "Отправляем…" : "Оставить заявку"}</button>
            <p className="availability-lead-legal">Нажимая кнопку, вы соглашаетесь с <a href={LEGAL_DOCUMENTS.terms} target="_blank" rel="noopener noreferrer">условиями</a> и <a href={LEGAL_DOCUMENTS.privacy} target="_blank" rel="noopener noreferrer">политикой конфиденциальности</a>.</p>
          </div>
        </div>
      </form>
    </div>
  );
}

const VEHICLE_QUICK_FACT_ICONS = {
  "Год выпуска": CalendarBlank,
  "Пробег": Gauge,
  "Двигатель": Engine,
  "Запас хода": RoadHorizon,
  "Привод": Gear,
  "Батарея": BatteryHigh,
  "Мощность": Lightning,
  "Разгон до 100 км/ч": Timer,
  "Кузов": CarProfile,
  "Цвет": Palette,
  "Коробка": Gear,
  "Длина": Ruler,
  "Расход топлива": GasPump,
  "Расход энергии": Lightning,
};

const loadVehicleMarketComparison = createVehicleMarketLoader();

function VehicleMarketSavings({ car }) {
  const pricing = useQuotaPricing();
  const quotaOn = pricing?.on === true;
  const url = vehicleMarketComparisonUrl(car, { quotaOn, refund50: pricing?.refund50 === true, base: import.meta.env.BASE_URL });
  const [loaded, setLoaded] = useState(null);
  // При переключении машины или льгот старый ответ не показываем даже на один кадр.
  const data = loaded?.url === url ? loaded.data : embeddedApiValue(url);
  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    loadVehicleMarketComparison(url).then((data) => {
      if (alive) setLoaded({ url, data });
    }).catch(() => {
      if (alive) setLoaded({ url, data: null });
    });
    return () => { alive = false; };
  }, [url]);
  const savings = vehicleMarketSavings(car, data, { quotaOn });
  const choice = vehicleMarketChoice(car, data, { quotaOn });
  if (!savings && !choice) return null;
  const selected = savings?.best;
  const percent = selected ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(selected.percent) : null;
  const savingsDescription = selected ? `${{ mean: "Средняя", median: "Медианная", min: "Минимальная" }[selected.key]} цена этой модели${savings.year === null ? " по всем годам" : ""} ниже, чем на белорусских площадках.` : "";
  const choiceDescription = `Больше объявлений этой модели${choice?.year === null ? " по всем годам" : ""}, чем на белорусских площадках.`;
  return (
    <div className="vehicle-market-advantages">
      {savings && <section className="vehicle-market-savings" tabIndex={0} aria-label="Сравнение с ценами в Беларуси" aria-description={savingsDescription}>
        <h3 aria-live="polite"><strong className="vehicle-market-value">{percent}%</strong> <span>экономии</span><Info className="vehicle-market-info" size={16} weight="regular" aria-hidden="true" /></h3>
        <ActionTooltip text={<span>{savingsDescription}</span>} className="quota-link-tooltip vehicle-market-tooltip" tapToOpen />
      </section>}
      {choice && <section className="vehicle-market-savings vehicle-market-choice" tabIndex={0} aria-label="Сравнение выбора автомобилей" aria-description={choiceDescription}>
        <h3><strong className="vehicle-market-value">{choice.multiplier}</strong> <span>больше выбор</span><Info className="vehicle-market-info" size={16} weight="regular" aria-hidden="true" /></h3>
        <ActionTooltip text={<span>{choiceDescription}</span>} className="quota-link-tooltip vehicle-market-tooltip" tapToOpen />
      </section>}
    </div>
  );
}

function VehicleDetailBody({ car, navigate, favorite, toggleFavorite, breadcrumbs = null, goBack = null, openFull = null, floatingCta = true, onOpenOrder = null, priceRatingPending = false, actions = true }) {
  const currency = useCurrency();
  // У цены в шапке выпадает «Цена среди похожих»; детализация стоит открытой в
  // правой колонке.
  const [pricePanel, setPricePanel] = useState(null);
  const ratingOpen = pricePanel === "rating";
  const togglePricePanel = (panel) => setPricePanel((open) => (open === panel ? null : panel));
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const ratingDisclosureId = useId();
  const priceDropdownRef = useRef(null);
  const ratingTriggerRef = useRef(null);
  useEffect(() => {
    if (!pricePanel) return undefined;
    const dismissOutside = (event) => {
      if (!priceDropdownRef.current?.contains(event.target)) setPricePanel(null);
    };
    const dismissEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPricePanel(null);
      ratingTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    window.addEventListener("keydown", dismissEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      window.removeEventListener("keydown", dismissEscape, true);
    };
  }, [pricePanel]);
  useEffect(() => { setPricePanel(null); }, [car.id]);
  const [floatingCtaHidden, setFloatingCtaHidden] = useState(true);
  const availabilityCtaRef = useRef(null);
  // По этой машине заказ уже создан — тогда кнопка не заводит второй, а ведёт в кабинет.
  const orderedListings = useOrderedListings();
  const inOrder = orderedListings.has(listingNumber(car.id));
  const { signedIn, request:sendAvailabilityRequest, submitLead:submitAvailabilityLead } = useAvailability();
  // Пусто — окна нет; дальше «lead» (форма гостя) или «sent» (заявка принята). Окно
  // открывается сразу, запрос идёт параллельно.
  const [availabilityStatus, setAvailabilityStatus] = useState("");
  const sold = car.available === false;
  const localGuaziPreview = GUAZI_PREVIEW_ENABLED && car.localPreview === true;
  useEffect(() => {
    if (car && !car.localPreview) trackEvent("vehicle_view", { listingId:car.id, listingTitle:car.title });
  }, [car?.id]);
  useEffect(() => {
    const cta = availabilityCtaRef.current;
    if (!cta) return undefined;
    const scroller = cta.closest(".quick-view-scroll");
    const source = scroller || window;
    let frame = 0;
    const update = () => {
      frame = 0;
      const limit = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
      setFloatingCtaHidden(cta.getBoundingClientRect().top < limit);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    source.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    const sidebar = cta.closest(".detail-sidebar");
    const resizeObserver = typeof ResizeObserver === "undefined" || !sidebar
      ? null
      : new ResizeObserver(schedule);
    resizeObserver?.observe(sidebar);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      source.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [car?.id]);
  const price = estimateLandedCost(car);
  const quotaPricing = useQuotaPricing();
  const quotaPricingOn = quotaPricing?.on !== false;
  const ratingPriceUsd = estimateLandedCost(car, { refund50:false }).totalUsd;
  const priceVerdict = priceRatingVerdictFor({ rating:car.priceRating, priceUsd:ratingPriceUsd, mileage:car.mileage, quotaPricingOn });
  const timing = estimateDeliveryDays(car.city, carOrigin(car));
  // Кнопка не уводит со страницы: сначала окно объясняет, что именно мы проверим.
  // Дальше вошедшему запрос уходит из самого окна, гостя ведём заводить аккаунт.
  const requestAvailability = () => {
    if (sold) return;
    if (localGuaziPreview) {
      setAvailabilityStatus("preview");
      return;
    }
    // Машина уже в заказе — заводить второй не нужно. Обычно ведём в кабинет, но если
    // карточку и открыли из самого заказа, идти некуда: просто закрываем превью.
    if (inOrder) {
      if (onOpenOrder) onOpenOrder();
      else navigate("/account");
      return;
    }
    trackEvent("availability_click", { listingId:car.id, listingTitle:car.title });
    // Вошедшему спрашивать нечего: он нажал ровно то, что и значит запрос. У гостя
    // сначала спрашиваем имя и телефон — иначе заявке некуда прийти.
    if (!signedIn) {
      setAvailabilityStatus("lead");
      return;
    }
    sendAvailability();
  };
  const sendAvailability = async () => {
    setAvailabilityStatus("sent");
    // Не дошло — окно закрываем и ничем больше не пугаем: кнопка карточки остаётся
    // жёлтой «Узнать точную цену и наличие», а не зелёной «Перейти в заказ», так что
    // человек видит, что отправить надо ещё раз, и может просто нажать её снова.
    if (!await sendAvailabilityRequest?.(car)) setAvailabilityStatus("");
  };
  const favoriteHint = favorite ? "Удалить из избранного" : "Добавить в избранное";
  const quickInfo = buildVehicleQuickFacts(car);
  const quickInfoColumns = [quickInfo.slice(0, 4), quickInfo.slice(4, 8)].filter((column) => column.length);
  // Обзор модели (если написан) — для материалов журнала про неё. Отдельного блока
  // «О модели» в карточке нет с 25.09.2026: он вёл на ту же страницу модели, что и
  // первая ссылка «Все … в наличии» ниже.
  const modelPage = modelPageForCar(car);
  // Разделы каталога, в которые попадает эта машина: марка, тип двигателя, кузов и их
  // сочетания. Со страницы машины в каталог вела одна общая ссылка, поэтому марка,
  // кузов и тип двигателя из карточки были недостижимы — а это постоянные страницы,
  // которые и должны собирать поиск, в отличие от карточки, живущей до продажи.
  // Раздел, на котором посетитель уже стоит, из списка убираем: в быстром просмотре
  // из каталога марки первой плашкой была бы ссылка на эту же страницу.
  // Плюс ценовая полоса по цене этой машины до Минска — тот же расчёт, что в правой
  // колонке. Полосы собраны из всего каталога, и с карточек на них не вело ничего.
  // Первой — каталожная страница этой модели: все такие машины с ценами и обзор.
  const modelPath = modelLandingPath(car.brand, car.model);
  const sections = [
    ...(modelPath ? [{ path: modelPath, name: `Все ${car.brand} ${car.model} в наличии` }] : []),
    ...landingsForCar(car),
    ...priceBandsForCar({ type: car.type, landedUsd: price.totalUsd }),
  ].filter((landing) => landing.path !== currentAppPath());
  // Материалы журнала про модель этой машины: сравнения с соседями по классу.
  const journal = BLOG_ENABLED && modelPage ? blogPostsForModel(modelPage.path) : [];
  // Блок отчёта продавца заполнен только у Guazi; у Che168 все поля пусты, а тип
  // батареи и так виден в «Полных характеристиках». Оценка внешнего вида, здоровье
  // батареи и страховые случаи сюда не входят: они уже есть в блоке «Состояние» в
  // правой колонке. Пустые строки не показываем, а без единой строки исчезает и
  // весь блок — вместе с дисклеймером-заглушкой.
  // Когда машина появилась в каталоге и когда мы её последний раз сверяли.
  // На широком экране строка идёт в подзаголовке, на телефоне подзаголовок скрыт —
  // там та же строка стоит отдельно, между фотографиями и характеристиками.
  const datesLine = carDatesLine(car);
  const conditionFacts = [
    [BatteryHigh, "Тип батареи", car.technicalSpecs?.count ? null : translateBattery(car.batteryType)],
  ].filter(([, , value]) => value);
  return (
    <>
      {/* В быстром просмотре хлебных крошек нет, а «ссылка» и «избранное» стоят в
          полосе окна рядом с крестиком — пустая строка над названием не нужна. */}
      {(breadcrumbs || actions) && (
      <div className="detail-topbar">
        {breadcrumbs}
        {actions && (
        <div className="detail-actions">
          <CopyLinkButton car={car} />
          <button disabled={localGuaziPreview} aria-label={favoriteHint} className={favorite ? "selected" : ""} onClick={() => toggleFavorite(car.id)}>
            <Heart size={21} weight={favorite ? "fill" : "regular"} />
            <ActionTooltip text={favoriteHint} />
          </button>
        </div>
        )}
      </div>
      )}
      {/* Общая обёртка названия с ценой и тела карточки. На компьютере ни на что
          не влияет; на телефоне через неё все блоки встают в один порядок: цена
          под фотографиями, затем плашки правой колонки, затем характеристики. */}
      <div className="detail-layout">
      <div className="detail-title">
        <div>
          {/* Ярлыка о новизне здесь нет: под заголовком и так стоит строка «Добавлено
              … · Обновлено …», и зелёная плашка её повторяла. */}
          <div className="detail-title-line">
            {goBack && (
              <button type="button" className="detail-back" aria-label="Назад" onClick={goBack}>
                <ArrowLeft size={20} />
                <ActionTooltip text="Назад" />
              </button>
            )}
            <h1>{car.title}</h1>
            <ChineseNameMark car={car} />
            {openFull && (
              <AppLink className="detail-back detail-open-full" href={carHref(car)} navigate={openFull} aria-label="Открыть полную страницу автомобиля">
                <ArrowUpRight size={20} />
                <ActionTooltip text="Открыть полную страницу" />
              </AppLink>
            )}
          </div>
          {/* Тип, привод и пробег из подзаголовка убраны: они и так стоят
              строкой ниже, в «Характеристиках». Остались только даты. */}
          {datesLine && <p>{datesLine}</p>}
        </div>

          <div ref={priceDropdownRef} className="detail-header-price" aria-label="Ориентировочная стоимость до Минска">
            <div className="price-total">
              <TotalPrice car={car} price={price} currency={currency} compactApproximation />
              {priceVerdict && (
                <button
                  ref={ratingTriggerRef}
                  type="button"
                  className={`price-rating-badge price-rating-badge-${priceVerdict.step}`}
                  aria-controls={ratingDisclosureId}
                  aria-expanded={ratingOpen}
                  aria-label={`Цена среди похожих: ${priceVerdict.badge.toLowerCase()}`}
                  onClick={() => togglePricePanel("rating")}
                >
                  <span>{priceVerdict.badge}</span>
                  <CaretDown size={13} weight="bold" aria-hidden="true" />
                </button>
              )}
              {/* Цена среди таких же машин. Раньше блок стоял первым в правой колонке;
                  теперь его открывает плашка у цены. Окно лежит внутри строки с суммой,
                  чтобы открываться сразу под ней, поверх подписи «Цена под ключ».
                  Набор для сравнения приходит с машиной от сервера; цену берём ту же,
                  что показана крупно, — включая выбранный режим цен с квотой. */}
              {priceVerdict && (
                <aside
                  id={ratingDisclosureId}
                  className={`order-card price-dropdown price-rating-dropdown${ratingOpen ? " open" : ""}`}
                  aria-label="Цена среди похожих"
                  aria-hidden={!ratingOpen}
                  inert={ratingOpen ? undefined : true}
                >
                  <PriceRatingScale
                    rating={car.priceRating}
                    priceUsd={ratingPriceUsd}
                    mileage={car.mileage}
                    battery={car.battery}
                    quotaPricingOn={quotaPricingOn}
                    formatMoney={(usd) => roughMoney(usd, currency)}
                  />
                  {quotaPricing?.refund50 && <p className="price-rating-note">Сравнение цен — без персонального возмещения по указу № 140.</p>}
                </aside>
              )}
            </div>
            {/* Что это за число: цена не за машину в Китае, а итог с доставкой и
                растаможкой. Мелкой строкой под ценой — крупное число остаётся главным. */}
            <span className="detail-sidebar-price-note">Цена под ключ до Минска.</span>
          </div>
      </div>
      <div className="detail-main">
        {/* Фотографии отдельным блоком от остального содержания: на узком экране
            правая колонка перестаёт быть колонкой, и между галереей и
            характеристиками встаёт шкала «Цена среди похожих». */}
        <div className="detail-gallery">
          <VehicleGallery car={car} />
        </div>
        {/* Когда добавлено и обновлено — строка только для телефона (на широком
            экране скрыта стилями). Стоит отдельным блоком сетки, чтобы на узком
            экране встать после шкалы цены, а не между фотографиями и ней. */}
        {datesLine && <p className="detail-dates">{datesLine}</p>}
        <div className="detail-content">
          {!localGuaziPreview && conditionFacts.length > 0 && (
            <section className="detail-facts-section condition-card">
              <div className="detail-facts-heading">
                <h2>Что указано в объявлении</h2>
              </div>
              <FactList items={conditionFacts} />
            </section>
          )}
          <TechnicalSpecs car={car} navigate={navigate} />
          <VehicleFaq car={car} navigate={navigate} />
          {/* Куда идти за объяснением сметы — в самом низу карточки, строками с
              иконками. Раньше эти ссылки стояли внутри разбора цены и терялись в
              нём; человек, который дочитал страницу, дальше либо считает другую
              машину, либо разбирается с растаможкой. */}
          {sections.length > 0 && (
            <nav className="detail-section-links" aria-label="Разделы каталога">
              <b>Смотреть в каталоге</b>
              <div>
                {sections.map((landing) => (
                  <AppLink key={landing.path} href={landing.path} navigate={navigate}>{landing.name}</AppLink>
                ))}
              </div>
            </nav>
          )}
          {journal.length > 0 && (
            <nav className="detail-section-links" aria-label="Материалы журнала об этой модели">
              <b>Об этой модели в журнале</b>
              <div>
                {journal.map((post) => (
                  <AppLink key={post.path} href={post.path} navigate={navigate}>{post.name}</AppLink>
                ))}
              </div>
            </nav>
          )}
          <div className="detail-tools-footer">
            <nav className="detail-tool-links" aria-label="Страницы расчётов">
              <AppLink href="/customs" navigate={navigate}><Calculator size={21} /><span>Калькулятор растаможки</span><CaretRight size={17} weight="bold" /></AppLink>
              <AppLink href="/delivery-cost" navigate={navigate}><RoadHorizon size={21} /><span>Из чего складывается цена</span><CaretRight size={17} weight="bold" /></AppLink>
              {car.type === "Электромобиль" && <AppLink href="/ev-quota" navigate={navigate}><Lightning size={21} /><span>Остаток квоты</span><CaretRight size={17} weight="bold" /></AppLink>}
            </nav>
            <p className="detail-source-note">{!localGuaziPreview && "Это сведения продавца и площадки, не наша независимая проверка. "}Актуальность продажи, VIN и возможность экспорта подтверждаются отдельно. <ListingIdRow car={car} /></p>
          </div>
        </div>
        <div className="detail-sidebar">
          {!sold && <VehicleMarketSavings key={car.id} car={car} />}
          {/* Состояние по данным источника — последней строкой «Основной информации»,
              а не отдельной плашкой. Нет основной информации — состояние стоит само. */}
          {quickInfo.length > 0 && (
            <section className="vehicle-quick-info" aria-label="Основная информация об автомобиле">
              <div className={`vehicle-quick-facts${quickInfoColumns.length > 1 ? " two-columns" : ""}`}>
                {quickInfoColumns.map((column, index) => (
                  <dl className="vehicle-quick-facts-column" key={index}>
                    {column.map(({ label, value }) => {
                      const Icon = VEHICLE_QUICK_FACT_ICONS[label] || Info;
                      return (
                        <div key={label} className="vehicle-quick-fact">
                          <Icon size={20} weight="duotone" aria-hidden="true" />
                          <div className="vehicle-quick-fact-copy">
                            <dt title={label}>{label}</dt>
                            <dd title={value}>{value}</dd>
                          </div>
                        </div>
                      );
                    })}
                  </dl>
                ))}
              </div>
              {car.source === "Guazi" && <VehicleConditionSummary car={car} />}
            </section>
          )}
          {car.source === "Guazi" && quickInfo.length === 0 && <VehicleConditionSummary car={car} />}
          {/* Детализация цены — перед сроком доставки, и всегда открыта: ссылку
              на неё искать не нужно. */}
          <aside className="price-breakdown-card" aria-label="Детализация цены">
                <div className="price-disclosure-content">
                <div className="price-breakdown">
                  <PriceBreakdownRow label={price.basePriceLabel} value={money(price.chinaUsd, currency)} description={price.basePriceNote || `${number(sourcePriceOf(car))} ${sourceCurrencySymbol(car)}${localGuaziPreview ? "" : " · данные источника"}`} />
                  <PriceBreakdownRow label={price.buyoutLabel} value={approximateMoney(price.buyoutLow, price.buyoutHigh, currency)} description="Платёжный агент и комиссии банка" />
                  {!price.isFob && <PriceBreakdownRow label={`Логистика ${inPhrase(carOrigin(car))}`} value={approximateMoney(price.chinaLegLow, price.chinaLegHigh, currency)} description={price.chinaLegNote} />}
                  <PriceBreakdownRow label="Доставка до Минска" value={approximateMoney(price.intlLow, price.intlHigh, currency)} description={price.intlNote} />
                  <PriceBreakdownRow label="СВХ в Минске" value={approximateMoney(price.svhLow, price.svhHigh, currency)} description="Разгрузка и хранение до оформления" />
                  {/* Предупреждение о пошлине («Без квоты на льготный ввоз») — первой
                      фразой подсказки: строкой под растаможкой оно ломало ровный ряд. */}
                  <PriceBreakdownRow label="Растаможка и сборы" value={approximateMoney(price.customsLow, price.customsHigh, currency)} description={<CustomsTooltip price={price} withAlert />} />
                  {price.serviceUsd > 0 && <PriceBreakdownRow label="Подбор и сопровождение" value={`≈ ${money(price.serviceUsd, currency)}`} description="Ориентировочно. Точную сумму назовут после расчёта конкретной машины — она может быть немного больше или меньше" />}
                </div>
                <div className="price-assumption">
                  <span>Это не оферта. Курс НБРБ на {PRICING.rateDate}; цену продавца, маршрут и таможенные параметры нужно подтвердить.</span>
                </div>
                </div>
          </aside>
          <section className={`delivery-disclosure delivery-card${deliveryOpen ? " open" : ""}`} aria-label="Срок доставки до Минска">
            <button type="button" className="delivery-card-heading" aria-expanded={deliveryOpen} onClick={() => setDeliveryOpen((open) => !open)}>
              <div className="delivery-card-icon">
                <Clock size={23} weight="duotone" />
              </div>
              <div>
                <span>Срок доставки до Минска</span>
                <h2>{daysFrom(timing.totalDays)}</h2>
              </div>
              <CaretDown className="disclosure-caret" size={20} weight="bold" />
            </button>
            <div className="animated-disclosure" aria-hidden={!deliveryOpen} inert={!deliveryOpen}>
              <div className="disclosure-content delivery-disclosure-content">
                <p className="delivery-intro">От договора до выдачи авто в Минске.</p>
                <div className="delivery-stages">
                  <div className="facts-row">
                    <b>Выкуп и экспорт</b>
                    <strong>{daysFrom(timing.buyoutDays)}</strong>
                  </div>
                  <div className="facts-row">
                    <b>Логистика {inPhrase(carOrigin(car))}</b>
                    <strong>{daysFrom(timing.chinaDays)}</strong>
                  </div>
                  <div className="facts-row">
                    <b>Маршрут до Минска</b>
                    <strong>{daysFrom(timing.intlDays)}</strong>
                  </div>
                  <div className="facts-row">
                    <b>СВХ и оформление</b>
                    <strong>{daysFrom(timing.svhDays)}</strong>
                  </div>
                </div>
                <div className="price-assumption delivery-note">
                  <span>Срок зависит от очереди на границе и загрузки перевозчика.</span>
                </div>
              </div>
            </div>
          </section>
          {sold ? (
            <div ref={availabilityCtaRef} className="sold-order-state" role="status">Этот автомобиль продан</div>
          ) : (
            <button ref={availabilityCtaRef} className={`primary report-order-cta availability-primary-cta${inOrder ? " ordered-cta" : ""}`} onClick={requestAvailability}>
              <span className="availability-primary-title">
                {inOrder ? (<><CheckCircle size={20} weight="fill" /> Перейти в заказ</>) : "Узнать точную цену и наличие"}
              </span>
            </button>
          )}
          <BrandNotice car={car} />
          {floatingCta && !sold && (
            <div className={`detail-floating-availability${floatingCtaHidden ? " is-hidden" : ""}`} aria-hidden={floatingCtaHidden}>
              <button className={`primary availability-primary-cta${inOrder ? " ordered-cta" : ""}`} type="button" onClick={requestAvailability} tabIndex={floatingCtaHidden ? -1 : 0}>
                <span className="availability-primary-title">
                  {inOrder ? (<><CheckCircle size={20} weight="fill" /> Перейти в заказ</>) : "Узнать точную цену и наличие"}
                </span>
              </button>
            </div>
          )}
          {availabilityStatus === "lead" ? (
            <AvailabilityLeadModal
              car={car}
              submitLead={submitAvailabilityLead}
              onClose={() => setAvailabilityStatus("")}
              onDone={() => setAvailabilityStatus("sent")}
            />
          ) : availabilityStatus ? (
            <AvailabilityRequestModal preview={availabilityStatus === "preview"} onClose={() => setAvailabilityStatus("")} />
          ) : null}
        </div>
      </div>
      </div>
      {localGuaziPreview && car.inspectionReport && (
        <div id="guazi-full-report" className="vehicle-guazi-report">
          <InspectionReport report={car.inspectionReport} />
        </div>
      )}
    </>
  );
}

function VehicleQuickViewModal({ car, navigate, favorite, toggleFavorite, onOpenFull, onClose, onOpenOrder = null, priceRatingPending = false }) {
  const closeRef = useRef(null);
  const currency = useCurrency();
  const setCurrency = useSetCurrency();
  const quotas = useMemo(() => ({
    personal: evQuotaState({ audience: "personal" }),
    business: evQuotaState({ audience: "business" }),
  }), []);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      // Галерея и модалка наличия открываются поверх и закрываются сами.
      if (document.querySelector(".gallery-modal, .modal-backdrop")) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);
  const localGuaziPreview = GUAZI_PREVIEW_ENABLED && car.localPreview === true;
  return (
    <div className="quick-view-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="quick-view-modal" role="dialog" aria-modal="true" aria-label={`Быстрый просмотр: ${car.title}`}>
        <header className="quick-view-bar">
          <div className="quick-view-pricing">
            {car.type === "Электромобиль" && <EvQuotaButton quotas={quotas} navigate={navigate} className="quick-view-action" />}
            <DecreePricingButton className="quick-view-action" />
          </div>
          <div className="quick-view-actions">
            {setCurrency && <CurrencySwitch currency={currency} setCurrency={setCurrency} className="quick-view-action quick-view-currency" />}
            <CopyLinkButton car={car} labelled className="quick-view-action" />
            <button type="button" disabled={localGuaziPreview} aria-pressed={favorite} aria-label={favorite ? "В избранном" : "В избранное"} className={`quick-view-action${favorite ? " selected" : ""}`} onClick={() => toggleFavorite(car.id)}>
              <Heart size={19} weight={favorite ? "fill" : "bold"} />
              <span>{favorite ? "В избранном" : "В избранное"}</span>
            </button>
          </div>
          <button ref={closeRef} className="quick-view-close" type="button" onClick={onClose} aria-label="Закрыть быстрый просмотр">
            <X size={19} weight="bold" />
          </button>
        </header>
        <div className="quick-view-scroll">
          {/* Повтор кнопки нужен и здесь: содержимое модалки прокручивается своим
              окном, и настоящая кнопка так же уходит вниз. Копия прилипает к низу
              прокрутки — модалка бывает только на широком экране, где повтор и
              задуман прилипающим, а не висящим поверх страницы. */}
          <VehicleDetailBody car={car} navigate={navigate} favorite={favorite} toggleFavorite={toggleFavorite} openFull={onOpenFull} onOpenOrder={onOpenOrder} priceRatingPending={priceRatingPending} actions={false} />
        </div>
      </section>
    </div>
  );
}

function DataTag({ type }) {
  const labels = {
    source: "Источник",
    calculated: "Расчёт",
    pending: "Нужно подтвердить",
  };
  return <span className={`data-tag ${type}`}>{labels[type]}</span>;
}

function SourceGrid({ rows }) {
  const visible = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (!visible.length) return <p className="order-empty">Источник не передал эти данные.</p>;
  return (
    <div className="order-facts">
      {visible.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

function OrderDraft({ car, navigate }) {
  const currency = useCurrency();
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [contact, setContact] = useState("");
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState("");
  if (!car) return <NotFound navigate={navigate} />;
  const price = estimateLandedCost(car);
  const sourceLink = car.sourceUrl?.replace(/\.md$/, ".html");
  const saveDraft = async (event) => {
    event.preventDefault();
    if (!consent) {
      setConsentError("Подтвердите согласие, чтобы сохранить заявку.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/order-drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId: car.id,
          contact: contact.trim(),
          calculation: {
            chinaPriceCny: car.chinaPrice,
            chinaUsd: price.chinaUsd,
            totalLow: price.totalLow,
            totalHigh: price.totalHigh,
            totalUsd: price.totalUsd,
            rateDate: PRICING.rateDate,
          },
        }),
      });
      if (!response.ok) throw new Error("save unavailable");
      setSaved(await response.json());
    } catch {
      setSaveError("Не удалось сохранить черновик. Проверьте подключение к серверу и попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };
  const vehicleRows = [
    ["Первая регистрация", car.firstRegistration],
    ["Пробег", `${number(car.mileage)} км`],
    ["Город", translateCity(car.city)],
    ["Владельцы", car.owners],
    ["Двигатель", car.engine],
    ["Коробка", car.transmission],
    ["Привод", car.drive],
    ["Цвет", translateColor(car.bodyColor)],
    ["Кузов", car.bodyType],
  ];
  const batteryRows = [
    ["Ёмкость", car.battery ? `${car.battery} кВт·ч` : null],
    ["Тип", car.batteryType ? translateBattery(car.batteryType) : null],
    ["Производитель", car.batteryBrand],
    ["Здоровье батареи", car.batteryHealth ? `${car.batteryHealth}%` : null],
    ["Запас хода на электротяге", car.electricRange ? `${car.electricRange} км` : null],
    ["Суммарный запас хода", car.combinedRange ? `${car.combinedRange} км` : null],
    ["Гарантия на силовую установку", translateSourceValue(car.warranty)],
    ["Защита батареи", translateSourceValue(car.batteryProtection)],
  ];
  const conditionRows = [
    ["Оценка источника", translateSourceValue(car.inspectionGrade || car.conditionGrade)],
    ["Внешний вид", car.appearanceScore ? `${car.appearanceScore}/100` : null],
    ["Страховые выплаты", translateClaims(car.claims || car.incident)],
    ["Силовая установка", car.powertrainInspection],
    ["Кузов", car.bodyInspection],
    ["Каркас кузова", car.structureInspection],
    ["Интерьер", car.interiorInspection],
    ["Подкапотное пространство", car.engineBayInspection],
  ];
  const assistanceRows = [
    ["Система помощи", car.driverAssistance],
    ["Уровень", car.assistanceLevel],
    ["Чип мультимедиа", car.infotainmentChip],
    ["Радары", car.radarCount ? `${car.radarCount} шт.` : null],
    ["Камеры", car.cameraCount ? `${car.cameraCount} шт.` : null],
    ["Ультразвуковые датчики", car.ultrasonicCount ? `${car.ultrasonicCount} шт.` : null],
  ];
  return (
    <main className="order-page page-width">
      <Breadcrumbs>
        <CrumbLink href="/" onOpen={() => navigate("/")}>Главная</CrumbLink>
        <CaretRight size={13} />
        <CrumbLink href={carHref(car)} onOpen={() => navigate(carHref(car))}>{car.title}</CrumbLink>
        <CaretRight size={13} />
        Предварительный заказ
      </Breadcrumbs>
      <button className="back-mobile" onClick={() => navigate(carHref(car))}>
        <ArrowLeft size={18} />
        Назад к автомобилю
      </button>
      <div className="order-heading">
        <div>
          <span>Черновик заказа · {listingNumber(car.sourceId)}</span>
          <h1>Предварительный заказ</h1>
          <p>Мы собрали всё, что уже известно, и отдельно отметили расчёты и данные, требующие подтверждения.</p>
        </div>
        <DataTag type="pending" />
      </div>
      <section className="order-car-summary">
        <img src={imageSource(car.image, IMAGE_WIDTH_TILE)} alt={car.title} onError={(event) => retryWithFullImage(event, car.image)} />
        <div>
          <h2>{car.title}</h2>
          <p>
            {number(car.mileage)} км · {powertrainName(car.type)} · {car.drive} привод
          </p>
        </div>
        <div className="order-source-price">
          <span>
            {price.isFob ? `Цена FOB · ${car.origin === "korea" ? "Пусан" : "Хоргос"}` : `Цена ${inPhrase(carOrigin(car))}`} <DataTag type="source" />
          </span>
          <b>{price.isFob ? bynify(money(price.chinaUsd, currency)) : `${number(sourcePriceOf(car))} ${sourceCurrencySymbol(car)}`}</b>
          <small>{withApprox(price.isFob ? price.basePriceNote : `≈ ${money(price.chinaUsd, currency)} по расчётному курсу`)}</small>
        </div>
      </section>
      <div className="order-layout">
        <div className="order-content">
          <section className="order-section">
            <div className="order-section-title">
              <div>
                <span>01</span>
                <h2>Предварительная стоимость</h2>
              </div>
              <DataTag type="calculated" />
            </div>
            <div className="order-cost-list">
              <div>
                <PriceLabel label={price.basePriceLabel} description={price.basePriceNote || `${number(sourcePriceOf(car))} ${sourceCurrencySymbol(car)} · данные источника`} />
                <b>{bynify(money(price.chinaUsd, currency))}</b>
              </div>
              <div>
                <PriceLabel label={price.buyoutLabel} description="Платёжный агент и комиссии банка" />
                <b>{withApprox(approximateMoney(price.buyoutLow, price.buyoutHigh, currency))}</b>
              </div>
              {!price.isFob && (
                <div>
                  <PriceLabel label={`Логистика ${inPhrase(carOrigin(car))}`} description={price.chinaLegNote} />
                  <b>{withApprox(approximateMoney(price.chinaLegLow, price.chinaLegHigh, currency))}</b>
                </div>
              )}
              <div>
                <PriceLabel label="Доставка до Минска" description={price.intlNote} />
                <b>{withApprox(approximateMoney(price.intlLow, price.intlHigh, currency))}</b>
              </div>
              <div>
                <PriceLabel label="СВХ в Минске" description="Разгрузка и хранение до оформления" />
                <b>{withApprox(approximateMoney(price.svhLow, price.svhHigh, currency))}</b>
              </div>
              <div>
                <div className="price-customs-copy">
                  <PriceLabel label="Таможня и сборы" description={<CustomsTooltip price={price} />} />
                  {price.customsAlert && <p className={`price-customs-alert${price.customsAlertTone === "warn" ? " price-customs-alert-warn" : ""}`}>{price.customsAlert}</p>}
                </div>
                <b>{withApprox(approximateMoney(price.customsLow, price.customsHigh, currency))}</b>
              </div>
              {price.serviceUsd > 0 && (
              <div>
                <PriceLabel label="Подбор и сопровождение" description="Ориентировочно. Точную сумму назовут после расчёта конкретной машины — она может быть немного больше или меньше" />
                <b><ApproxSign /> {bynify(money(price.serviceUsd, currency))}</b>
              </div>
              )}
            </div>
            <div className="order-grand-total">
              <PriceLabel label="Ориентировочно до Минска" description="Без постановки на учёт и страховки" />
              <b><ApproxSign /> {bynify(money(price.totalUsd, currency))}</b>
            </div>
            <div className="order-disclaimer">
              <Info size={18} />
              <p>Курс НБРБ на {PRICING.rateDate}. Это предварительная модель, а не оферта. Итог меняется после подтверждения цены продавцом, VIN, маршрута и таможенных параметров.</p>
            </div>
            {/* Куда идти за объяснением сметы. Раньше из карточки на страницы расчётов
                вела только ссылка в подвале: человек, который смотрит строку «таможня
                и сборы», упирался в цифру без продолжения. */}
            <p className="order-tool-links">
              <AppLink href="/customs" navigate={navigate}>Посчитать другую машину</AppLink>
              <AppLink href="/delivery-cost" navigate={navigate}>Из чего складывается цена</AppLink>
              {car.type === "Электромобиль" && <AppLink href="/ev-quota" navigate={navigate}>Остаток квоты</AppLink>}
            </p>
          </section>
          <section className="order-section">
            <div className="order-section-title">
              <div>
                <span>02</span>
                <h2>Автомобиль</h2>
              </div>
              <DataTag type="source" />
            </div>
            <SourceGrid rows={vehicleRows} />
          </section>
          <section className="order-section">
            <div className="order-section-title">
              <div>
                <span>03</span>
                <h2>Батарея и запас хода</h2>
              </div>
              <DataTag type="source" />
            </div>
            <SourceGrid rows={batteryRows} />
          </section>
          <section className="order-section">
            <div className="order-section-title">
              <div>
                <span>04</span>
                <h2>Состояние по отчёту источника</h2>
              </div>
              <DataTag type="source" />
            </div>
            <SourceGrid rows={conditionRows} />
            {car.description && (
              <div className="source-description">
                <b>Комментарий из объявления</b>
                <p>{car.description}</p>
              </div>
            )}
            <p className="source-warning">
              <Info size={17} />
              Это заявление площадки и продавца, не независимая проверка abcars.by.
            </p>
          </section>
          <section className="order-section">
            <div className="order-section-title">
              <div>
                <span>05</span>
                <h2>Оснащение и ассистенты</h2>
              </div>
              <DataTag type="source" />
            </div>
            <SourceGrid rows={assistanceRows} />
          </section>
        </div>
        <aside className="order-progress">
          <div className="progress-card">
            <span>Статус заказа</span>
            <h3>Можно запускать проверку</h3>
            <ol>
              <li className="done">
                <Check size={15} />
                <p>
                  <b>Карточка источника найдена</b>
                </p>
              </li>
              <li className="done">
                <Check size={15} />
                <p>
                  <b>Данные и фото загружены</b>
                  <small>{car.images?.length || 1} оригинальных фото</small>
                </p>
              </li>
              <li>
                <span>3</span>
                <p>
                  <b>Подтверждение продавца</b>
                  <small>Наличие и актуальная цена</small>
                </p>
              </li>
              <li>
                <span>4</span>
                <p>
                  <b>VIN и экспорт</b>
                  <small>Документы и ограничения</small>
                </p>
              </li>
              <li>
                <span>5</span>
                <p>
                  <b>Независимая проверка</b>
                  <small>Кузов, батарея и диагностика</small>
                </p>
              </li>
            </ol>
            {!verificationOpen && (
              <button className="primary" onClick={() => setVerificationOpen(true)}>
                Запустить проверку <ArrowRight size={18} />
              </button>
            )}
            {verificationOpen && !saved && (
              <form className="verification-form" onSubmit={saveDraft}>
                <div className="modal-icon">
                  <ChatCircleText size={24} weight="duotone" />
                </div>
                <h4>Куда прислать результат?</h4>
                <p>Оставьте телефон или Telegram. Имя и другие данные сейчас не нужны.</p>
                <label>
                  Телефон или @username
                  <input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="+375 … или @telegram" required autoFocus />
                </label>
                <ConsentField checked={consent} onChange={(value) => { setConsent(value); if (value) setConsentError(""); }} error={consentError} />
                <button className="primary" type="submit" disabled={saving}>
                  {saving ? "Сохраняем…" : "Сохранить и продолжить"}
                </button>
                {saveError && <small className="form-error">{saveError}</small>}
                <small>Черновик и расчёт сохранятся в базе; объявление попадёт в приоритетную очередь перепроверки.</small>
              </form>
            )}
            {saved && (
              <div className="verification-saved">
                <CheckCircle size={42} weight="fill" />
                <h4>Черновик №{saved.id} сохранён</h4>
                <p>Заявка записана в базе, а актуальность объявления будет перепроверена в приоритетном порядке.</p>
              </div>
            )}
            <div className="progress-links">
              {sourceLink && (
                <ExternalLink href={sourceLink}>
                  Оригинал объявления <ArrowRight size={16} />
                </ExternalLink>
              )}
              <button onClick={() => navigate(carHref(car))}>Вернуться к автомобилю</button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function ServiceScrollVideo({ navigate, total, updatedAt }) {
  const isMobileVideo = useMediaQuery("(max-width: 700px)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const sceneRef = useRef(null);
  const stickyRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const sticky = stickyRef.current;
    const video = videoRef.current;
    if (!scene || !sticky || !video || isMobileVideo !== (window.innerWidth <= 700)) return undefined;
    scene.classList.add("service-video-loading");
    const loader = scene.querySelector(".service-video-loader");
    const pageShell = scene.closest(".service-video-shell");

    let updateFrame = 0;
    let seekFrame = 0;
    let targetTime = 0;
    let seeking = false;
    let prepared = false;
    let lastProgress = -1;
    const loaderDelay = window.setTimeout(() => {
      if (!scene.classList.contains("service-video-ready") &&
          !scene.classList.contains("service-video-static") &&
          !scene.classList.contains("service-video-failed")) {
        scene.classList.add("service-video-loader-visible");
      }
    }, 1500);
    const showVideo = () => {
      window.clearTimeout(loaderDelay);
      scene.classList.remove("service-video-loader-visible");
      scene.classList.add("service-video-ready");
    };

    const commitFrame = () => {
      seekFrame = 0;
      if (!prepared || seeking || video.readyState < 2 || !Number.isFinite(video.duration)) return;
      if (Math.abs(video.currentTime - targetTime) <= 1 / 45) return;
      seeking = true;
      video.currentTime = targetTime;
    };
    const scheduleSeek = () => {
      if (!seeking && !seekFrame) seekFrame = window.requestAnimationFrame(commitFrame);
    };
    const handleSeeked = () => {
      seeking = false;
      if (prepared && Math.abs(video.currentTime - targetTime) <= 1 / 45) {
        showVideo();
      } else {
        scheduleSeek();
      }
    };
    const update = () => {
      updateFrame = 0;
      const rect = scene.getBoundingClientRect();
      if (scene.classList.contains("service-video-static")) {
        pageShell?.classList.toggle("service-video-header-active", rect.bottom > sticky.offsetHeight * 0.2);
        return;
      }
      const stickyTop = Number.parseFloat(window.getComputedStyle(sticky).top) || 0;
      const scrollDistance = Math.max(1, scene.offsetHeight - sticky.offsetHeight);
      const isMobileViewport = window.innerWidth <= 700;
      const progress = Math.min(1, Math.max(0, (stickyTop - rect.top) / scrollDistance));

      // Desktop keeps the two-copy film sequence. On mobile the film stays pinned
      // behind naturally scrolling copy/cards and fades independently near the end.
      const playbackProgress = isMobileViewport
        ? Math.min(1, progress / 0.5)
        : Math.min(1, progress / 0.84);
      const fadeProgress = isMobileViewport
        ? Math.min(1, Math.max(0, (progress - 0.5) / 0.28))
        : Math.min(1, Math.max(0, (progress - 0.7) / 0.28));
      const primaryCopyMotion = isMobileViewport
        ? progress
        : Math.min(1, progress / 0.42);
      const primaryCopyOpacity = isMobileViewport
        ? 1
        : 1 - Math.min(1, Math.max(0, (progress - 0.24) / 0.18));
      const copyTravel = isMobileViewport ? -scrollDistance : -160;
      scene.style.setProperty("--service-video-opacity", String(1 - fadeProgress));
      scene.style.setProperty("--service-primary-copy-opacity", String(primaryCopyOpacity));
      scene.style.setProperty("--service-primary-copy-y", `${copyTravel * primaryCopyMotion}px`);
      if (!isMobileViewport) {
        const secondaryCopyMotion = Math.min(1, Math.max(0, (progress - 0.4) / 0.38));
        const secondaryCopyReveal = Math.min(1, Math.max(0, (progress - 0.38) / 0.08));
        const secondaryCopyFade = Math.min(1, Math.max(0, (progress - 0.68) / 0.14));
        const trustCardFade = Math.min(1, Math.max(0, progress / 0.08));
        scene.style.setProperty("--service-scroll-cue-opacity", String(Math.max(0, 1 - progress / 0.12)));
        scene.style.setProperty("--service-secondary-copy-opacity", String(secondaryCopyReveal * (1 - secondaryCopyFade)));
        scene.style.setProperty("--service-trust-card-opacity", String(1 - trustCardFade));
        scene.style.setProperty("--service-secondary-copy-y", `${copyTravel * secondaryCopyMotion}px`);
      }
      scene.classList.toggle("service-video-copy-swapped", !isMobileViewport && progress >= 0.37);
      pageShell?.classList.toggle("service-video-header-active", fadeProgress < 0.8);

      if (video.readyState >= 1 && Number.isFinite(video.duration)) {
        const finalFrame = Math.max(0, video.duration - 0.04);
        targetTime = finalFrame * playbackProgress;
        scheduleSeek();
      }
    };
    const scheduleUpdate = () => {
      if (!updateFrame) updateFrame = window.requestAnimationFrame(update);
    };

    video.pause();
    video.addEventListener("seeked", handleSeeked);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    const cancelPreparation = prepareServiceVideo({
      video,
      poster: scene.querySelector(".service-scroll-poster"),
      source: isMobileVideo ? "/videos/how-it-works-mobile-v2.mp4" : "/videos/how-it-works-desktop-v2.mp4",
      onProgress: (progress) => {
        const percent = Math.round(progress * 100);
        if (percent === lastProgress) return;
        lastProgress = percent;
        loader?.style.setProperty("--service-video-progress", `${percent}%`);
        scene.classList.add("service-video-progress-known");
      },
      onReady: () => {
        prepared = true;
        scene.classList.remove("service-video-loading");
        update();
        if (Math.abs(video.currentTime - targetTime) <= 1 / 45) {
          showVideo();
        }
      },
      onUnavailable: () => {
        window.clearTimeout(loaderDelay);
        scene.classList.remove("service-video-loader-visible");
        scene.classList.remove("service-video-loading");
        if (!reducedMotion && !window.navigator.connection?.saveData && scene.getBoundingClientRect().top < -1) {
          scene.classList.add("service-video-failed");
        } else {
          scene.removeAttribute("style");
          scene.classList.remove("service-video-copy-swapped");
          scene.classList.add("service-video-static");
        }
        update();
      },
    });
    update();

    return () => {
      window.clearTimeout(loaderDelay);
      cancelPreparation();
      scene.classList.remove("service-video-loading", "service-video-loader-visible", "service-video-ready", "service-video-static", "service-video-failed", "service-video-progress-known", "service-video-copy-swapped");
      loader?.style.removeProperty("--service-video-progress");
      scene.removeAttribute("style");
      if (updateFrame) window.cancelAnimationFrame(updateFrame);
      if (seekFrame) window.cancelAnimationFrame(seekFrame);
      video.removeEventListener("seeked", handleSeeked);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      pageShell?.classList.remove("service-video-header-active");
    };
  }, [isMobileVideo, reducedMotion]);

  const roundedListings = total >= 100 ? formatRoundedListingCount(total).replace(/\+$/, "") : "64900";
  const catalogUpdateLabel = updatedAt ? catalogUpdatedDate(updatedAt) : "";
  // The complete opening region intentionally matches the dark theme in both
  // modes; the selected site theme resumes after the capability cards.

  return (
    <section className="service-video-story service-video-loading" ref={sceneRef} aria-label={`Автомобиль прибывает ${siteFromPhrase()}`}>
      <div className="service-video-sticky" ref={stickyRef}>
        <div className="service-scroll-media">
          <picture>
            <source media="(max-width: 700px)" srcSet="/videos/how-it-works-mobile-poster.webp" />
            <img className="service-scroll-poster" src="/videos/how-it-works-desktop-poster.webp"
              alt="" width="1920" height="1080" fetchPriority="high" />
          </picture>
          <video ref={videoRef} className="service-scroll-video" preload="none"
            muted playsInline aria-hidden="true" tabIndex={-1} />
          <span className="service-video-loader" role="status" aria-label="Загружаем видео"><span /></span>
        </div>
        <div className="service-video-copy">
          <div className="service-video-copy-inner">
            <div className="service-video-copy-panel service-video-copy-panel-primary">
              <h1>Авто {siteFromPhrase()} под ключ.</h1>
              <p>Подберём, посчитаем и найдём, кто привезёт. На связи от выбора машины до получения ключей</p>
              <div className="service-video-copy-actions">
                <button className="primary service-video-copy-cta" onClick={() => navigate("/catalog")}>
                  Выбрать автомобиль <ArrowRight size={18} />
                </button>
              </div>
            </div>
            <div className="service-video-copy-panel service-video-copy-panel-secondary">
              <h2>
                Более {roundedListings} авто с пробегом напрямую из{" "}
                <span className="service-video-country-mark">
                  {siteCountriesGenitive()}
                  {/* TODO (Корея): здесь нужна картинка с двумя флагами — Китая и Кореи;
                      пока стоит прежний флаг КНР, новый файл рисуется отдельно. */}
                  <img src="/services/china-flag.svg" alt="" aria-hidden="true" />
                </span>
              </h2>
              <p>{catalogUpdateLabel ? `Обновили каталог ${catalogUpdateLabel}` : "Обновили каталог"}</p>
            </div>
            <aside className="service-video-trust-card">
              <ShieldCheck className="service-video-trust-card-icon" size={28} weight="duotone" />
              <h3>Всё по договору. Оплата напрямую продавцу.</h3>
            </aside>
            <div className="service-video-checkline">
              <Check size={20} weight="bold" />
              <span>Полная проверка автомобиля перед покупкой</span>
            </div>
          </div>
        </div>
        <div className="service-video-scroll-cue" aria-hidden="true">
          <span>Листайте вниз</span>
          <span className="service-video-scroll-cue-track">
            <span className="service-video-scroll-cue-dot" />
          </span>
        </div>
      </div>
    </section>
  );
}

const SERVICE_CATALOG_TARGETS = Object.freeze([
  { brand: "Geely", model: "Monjaro" },
  { brand: "Zeekr", model: "001" },
  { brand: "Geely", model: "EX2" },
  { brand: "Geely", model: "EX5" },
  { brand: "Geely", model: "Galaxy M9" },
  { brand: "BYD", model: "Song PLUS" },
  { brand: "Xiaomi", model: "SU7" },
  { brand: "Deepal", model: "S05" },
]);

const serviceCatalogPrice = (car) => Number(estimateLandedCost(car).totalUsd) || Number.POSITIVE_INFINITY;

const sortServiceCatalogCars = (cars) => [...cars].sort((left, right) => serviceCatalogPrice(left) - serviceCatalogPrice(right));

const isServiceCatalogTarget = (car) => SERVICE_CATALOG_TARGETS.some(({ brand, model }) => car.brand === brand && car.model === model);

const mergeServiceCatalogCars = (priorityCars, fillerCars) => {
  const selectedIds = new Set(priorityCars.map((car) => car.id));
  const fillers = sortServiceCatalogCars(fillerCars)
    .filter((car) => !selectedIds.has(car.id) && !isServiceCatalogTarget(car))
    .slice(0, Math.max(0, 8 - priorityCars.length));
  return [...priorityCars, ...fillers];
};

const selectServiceCatalogCars = (cars) => {
  const priorityCars = SERVICE_CATALOG_TARGETS.map(({ brand, model }) => (
    sortServiceCatalogCars(cars.filter((car) => car.brand === brand && car.model === model))[0]
  )).filter(Boolean);
  return mergeServiceCatalogCars(priorityCars, cars);
};

function ServiceCatalogShowcase({ navigate, cars, apiMode, total, favorites, toggleFavorite, loading }) {
  const [showcaseCars, setShowcaseCars] = useState(() => selectServiceCatalogCars(cars));
  const [showcaseLoading, setShowcaseLoading] = useState(true);
  const { openQuickView, quickViewToggle, quickViewModal } = useVehicleQuickView({
    apiMode: apiMode !== false,
    favorites,
    toggleFavorite,
    navigate,
  });
  const openCar = (car) => {
    if (openQuickView(car)) return;
    navigate(carHref(car));
  };
  useEffect(() => {
    if (apiMode === null) return undefined;
    const localSelection = selectServiceCatalogCars(cars);
    if (apiMode === false) {
      setShowcaseCars(localSelection);
      setShowcaseLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;
    setShowcaseLoading(true);
    Promise.all([
      Promise.all(SERVICE_CATALOG_TARGETS.map(async ({ brand, model }) => {
        const query = new URLSearchParams({ brand, model, sort: "price_asc", limit: "1" });
        const catalog = await fetchCarsJson(`/api/cars?${query}`, controller.signal);
        return catalog.items?.[0] ? normalizeImportedCar(catalog.items[0]) : null;
      })),
      fetchCarsJson("/api/cars?sort=price_asc&limit=20", controller.signal),
    ])
      .then(([priorityItems, catalog]) => {
        if (cancelled) return;
        const fillerCars = (catalog.items || []).map(normalizeImportedCar);
        setShowcaseCars(mergeServiceCatalogCars(priorityItems.filter(Boolean), fillerCars));
      })
      .catch(() => {
        if (!cancelled) setShowcaseCars(localSelection);
      })
      .finally(() => {
        if (!cancelled) setShowcaseLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiMode, cars]);
  const listingCount = total || cars.length || 64000;
  const showSkeletons = (loading || showcaseLoading) && !showcaseCars.length;
  const showcaseSkeletons = ["service-a", "service-b", "service-c", "service-d", "service-e", "service-f"];

  return (
    <section className="service-catalog-section" aria-labelledby="service-catalog-title">
      <div className="page-width">
        <div className="section-heading service-catalog-heading">
          <div className="section-heading-title">{quickViewToggle}</div>
          <h2 id="service-catalog-title">Каталог авто</h2>
          <AppLink className="section-heading-link" href="/catalog" navigate={navigate}>
            К фильтрам <ArrowRight size={18} className="section-heading-link-arrow" />
            <CaretRight size={20} weight="bold" className="section-heading-link-caret" aria-hidden="true" />
          </AppLink>
        </div>
        <div className="featured-grid mobile-cards-grid" aria-busy={showSkeletons ? "true" : undefined}>
          {showSkeletons
            ? showcaseSkeletons.map((key) => <CardSkeleton key={key} />)
            : showcaseCars.map((car) => (
                <FeaturedCard
                  key={car.id}
                  anchorKey={`service-${car.id}`}
                  car={car}
                  favorite={favorites.has(car.id)}
                  toggleFavorite={toggleFavorite}
                  onClick={() => openCar(car)}
                />
              ))}
        </div>
        <div className="service-catalog-cta-wrap">
          <button className="primary service-catalog-cta" type="button" onClick={() => navigate("/catalog")}>
            Перейти к {number(listingCount)} объявлениям
          </button>
        </div>
      </div>
      {quickViewModal}
    </section>
  );
}

function ServiceContactCta({ includeOptions = true, questionEvent = "service_contact_question_click" }) {
  // Номер не выставляем сразу: первое нажатие показывает его, второе — звонит. Так же
  // устроена кнопка в шапке, и роботам, которые собирают телефоны со страниц, номер
  // не достаётся просто так.
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const revealPhone = (event) => {
    if (phoneRevealed) return;
    event.preventDefault();
    trackEvent(questionEvent);
    trackEvent("contact_phone_reveal");
    setPhoneRevealed(true);
  };

  return (
    <>
      <section className="service-contact-cta page-width" aria-labelledby="service-contact-cta-title">
        <div className="service-contact-cta-copy">
          <h2 id="service-contact-cta-title">Остались вопросы?</h2>
          <p>Поговорите с нашим экспертом. Ответим на вопросы и поможем выбрать подходящий автомобиль.</p>
          <a className="primary service-contact-cta-button" href={`tel:${COMPANY.phoneHref}`} onClick={revealPhone}>
            <Phone size={20} weight="fill" aria-hidden="true" />
            {phoneRevealed ? COMPANY.phone : "Задать вопрос"}
          </a>
        </div>
        <Illustration
          src="/services/contact-manager-black.png"
          width="1145"
          height="1374"
          alt="Консультант abcars.by"
          loading="lazy"
          decoding="async"
        />
      </section>
      {includeOptions && <section className="service-contact-options page-width" aria-label="Способы связи">
        <a className="service-contact-option" href={COMPANY.viberUrl} rel={EXTERNAL_LINK_REL} onClick={() => trackEvent("service_contact_sales_click")}>
          <img className="service-contact-option-illustration" src="/social/contact-viber.png" alt="" width="82" height="82" loading="lazy" decoding="async" />
          <strong>Viber</strong>
          <p>Напишите или позвоните — поможем выбрать автомобиль и посчитать цену до Минска.</p>
        </a>
        <ExternalLink className="service-contact-option" href={COMPANY.telegramUrl} onClick={() => trackEvent("service_contact_telegram_click")}>
          <img className="service-contact-option-illustration" src="/social/contact-telegram.png" alt="" width="82" height="82" loading="lazy" decoding="async" />
          <strong>Telegram</strong>
          <p>Быстро ответим на вопросы и подскажем по вашему запросу.</p>
        </ExternalLink>
        <a className="service-contact-option" href={`mailto:${COMPANY.email}`} onClick={() => trackEvent("service_contact_email_click")}>
          <img className="service-contact-option-illustration" src="/social/contact-mail.png" alt="" width="82" height="82" loading="lazy" decoding="async" />
          <strong>Электронная почта</strong>
          <p>{COMPANY.email} — для документов, расчётов и деловых вопросов.</p>
        </a>
      </section>}
    </>
  );
}

function ServicePurchaseFlow() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeStep = PURCHASE_FLOW_STEPS[activeIndex];

  return (
    <section className="service-purchase-flow page-width" aria-labelledby="service-purchase-flow-title">
      <h2 id="service-purchase-flow-title">Покупка авто: от выбора до ключей</h2>
      <div className="service-purchase-flow-layout">
        <div className="service-purchase-flow-switchers" role="group" aria-label="Этапы покупки">
          {PURCHASE_FLOW_STEPS.map((step, index) => {
            const selected = index === activeIndex;
            return (
              <button
                className={`service-purchase-flow-switcher${selected ? " active" : ""}`}
                type="button"
                aria-pressed={selected}
                onClick={() => setActiveIndex(index)}
                key={step.title}
              >
                <span className="service-purchase-flow-number" aria-hidden="true">{index + 1}</span>
                <span className="service-purchase-flow-copy">
                  <strong>{step.title}</strong>
                  <small>{step.text}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="service-purchase-flow-visual" role="region" aria-live="polite" aria-label={`Иллюстрация этапа «${activeStep.title}»`}>
          <div className={`service-purchase-flow-artwork ${activeStep.visual.kind}`} key={activeStep.title}>
            <Illustration
              className={activeStep.visual.darkSrc ? "theme-light" : undefined}
              src={activeStep.visual.src}
              width={activeStep.visual.width}
              height={activeStep.visual.height}
              alt={activeStep.visual.alt}
              loading="lazy"
              decoding="async"
            />
            {activeStep.visual.darkSrc && (
              <Illustration
                className="theme-dark"
                src={activeStep.visual.darkSrc}
                width={activeStep.visual.width}
                height={activeStep.visual.height}
                alt={activeStep.visual.alt}
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorksPage({ navigate, cars, apiMode, favorites, toggleFavorite, loading }) {
  const darkIntroRef = useRef(null);
  const { total, updatedAt } = useCatalogFacts();
  const assuranceArtwork = [
    { src: "/services/independent-check-body-repair.png", alt: "Повреждения кузова автомобиля под увеличительным стеклом", className: "service-assurance-art-diagnostics", width: 1254, height: 1254 },
    { src: "/services/vehicle-tracking-container.png", alt: "Красный грузовой контейнер", className: "service-assurance-art-tracking", width: 768, height: 768 },
  ];

  useLayoutEffect(() => {
    const intro = darkIntroRef.current;
    const pageShell = intro?.closest(".service-video-shell");
    const header = pageShell?.querySelector(":scope > .site-header");
    const lightRegion = pageShell?.querySelector(".service-light-region");
    if (!intro || !pageShell || !header || !lightRegion) return undefined;

    let frame = 0;
    const updateHeaderTheme = () => {
      frame = 0;
      const headerHeight = header.getBoundingClientRect().height;
      const lightSectionTop = lightRegion.getBoundingClientRect().top;
      pageShell.classList.toggle("service-dark-region-active", lightSectionTop > headerHeight);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateHeaderTheme);
    };

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    updateHeaderTheme();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      pageShell.classList.remove("service-dark-region-active");
    };
  }, []);

  const opportunitiesListingCount = total >= 1000 ? `${number(Math.floor(total / 1000) * 1000)} +` : "64 000 +";

  return (
    <main className="info-page service-video-page">
      <div className="service-dark-intro" ref={darkIntroRef}>
        <ServiceScrollVideo navigate={navigate} total={total} updatedAt={updatedAt} />
        <section className="info-proof-section page-width" aria-label="Возможности сервиса">
          <div className="info-proof">
            {SERVICE_PROOF.map(({ title, text }, index) => {
              const artwork = SERVICE_PROOF_ARTWORK[index] || SERVICE_PROOF_ARTWORK[0];
              return (
                <article key={title}>
                  <span className={`info-proof-icon info-proof-icon-art info-proof-icon-${artwork.className}`} aria-hidden="true">
                    <Illustration
                      src={artwork.src}
                      alt=""
                      width={artwork.width}
                      height={artwork.height}
                    />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              );
            })}
          </div>
        </section>
      </div>
      <div className="service-light-region">
        <section className="service-opportunities page-width" aria-labelledby="service-opportunities-title">
          <h2 id="service-opportunities-title">Возможности платформы</h2>
          <div className="service-opportunities-grid">
            <article className="service-opportunity-card service-opportunity-card-wide">
              <strong>{opportunitiesListingCount}</strong>
              <p>Активных объявлений<br />для выбора автомобиля</p>
              <Illustration src="/services/fast-convenient-car-rear.png" width="1254" height="1254" alt="Автомобиль с включёнными задними фонарями" loading="lazy" decoding="async" />
            </article>
            <article className="service-opportunity-card">
              <strong>Еженедельно</strong>
              <p>Обновляем наличие и цены в каталоге</p>
              <button className="primary service-opportunity-cta" type="button" onClick={() => navigate("/catalog")}>Перейти в каталог</button>
            </article>
            <article className="service-opportunity-card service-opportunity-card-no-cta">
              <strong>Расчёт</strong>
              <p>Сразу показываем, из чего состоит цена под ключ</p>
            </article>
            <article className="service-opportunity-card service-opportunity-card-wide service-opportunity-card-convenience">
              <strong>Удобно</strong>
              <p>Множество фильтров, умный поиск, детали и всё для вашего удобства</p>
              <Illustration className="service-opportunity-filter-dark" src="/services/convenient-filters.png" width="1254" height="1254" alt="Панель настройки фильтров" loading="lazy" decoding="async" />
              <Illustration className="service-opportunity-filter-light" src="/services/convenient-filters-light.png" width="1254" height="1254" alt="" aria-hidden="true" loading="lazy" decoding="async" />
            </article>
          </div>
        </section>
      </div>
      <ServiceCatalogShowcase
        navigate={navigate}
        cars={cars}
        apiMode={apiMode}
        total={total}
        favorites={favorites}
        toggleFavorite={toggleFavorite}
        loading={loading}
      />
      {/* Эти карточки переехали сюда с отдельной страницы «О нас». Тексты берём из
          src/service-copy.js — оттуда же их берёт разметка
          для поисковика, поэтому страница и её видимая роботу версия не разойдутся. */}
      <section className="service-assurance-section page-width" aria-labelledby="service-assurance-title">
        <h2 className="visually-hidden" id="service-assurance-title">Проверка и связь</h2>
        <div className="service-assurance-grid">
          {ABOUT_PRINCIPLES.map(({ title, text }, index) => {
            const artwork = assuranceArtwork[index];
            return (
              <article className={`service-opportunity-card service-assurance-card${index === 1 ? " service-assurance-card-tracking" : ""}`} key={title}>
                <strong>{title}</strong>
                <p>{text}</p>
                <Illustration
                  className={artwork.className}
                  src={artwork.src}
                  width={artwork.width}
                  height={artwork.height}
                  alt={artwork.alt}
                  loading="lazy"
                  decoding="async"
                />
              </article>
            );
          })}
        </div>
      </section>
      <ServicePurchaseFlow />
      <InspectionReport report={SERVICE_REPORT_EXAMPLE} />
      {REVIEWS_ENABLED && <ReviewsSection navigate={navigate} />}
      <FaqSection navigate={navigate} />
      <ServiceContactCta />
    </main>
  );
}

function FaqSection({ navigate }) {
  useEffect(() => {
    if (window.location.hash !== "#faq") return undefined;
    return holdAnchor(document.getElementById("faq"));
  }, []);
  return (
    <section className="service-faq info-section page-width" id="faq" aria-labelledby="service-faq-title">
      <section className="faq-hero">
        <div>
          <h2 id="service-faq-title">Вопросы и ответы</h2>
        </div>
      </section>
      <section className="faq-groups">
        {FAQ_GROUPS.map((group) => (
          <div className="faq-group" key={group.title}>
            <h3>{group.title}</h3>
            <HomeFaqList items={group.items} navigate={navigate} />
          </div>
        ))}
      </section>
    </section>
  );
}

function ReviewsSection({ navigate }) {
  const sliderRef = useRef(null);
  const [canPrevious, setCanPrevious] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const updateControls = useCallback(() => {
    const element = sliderRef.current;
    if (!element) return;
    setCanPrevious(element.scrollLeft > 1);
    setCanNext(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
  }, []);
  useEffect(() => {
    const element = sliderRef.current;
    if (!element) return;
    const observer = new ResizeObserver(updateControls);
    observer.observe(element);
    updateControls();
    if (window.location.hash === "#reviews") element.closest("section")?.scrollIntoView();
    return () => observer.disconnect();
  }, [updateControls]);
  const slide = (direction) => {
    const element = sliderRef.current;
    if (!element) return;
    const card = element.querySelector(".review-item");
    const step = card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(element).columnGap) : element.clientWidth;
    element.scrollBy({ left: direction * step, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return (
<section className="reviews-section info-section page-width" id="reviews" aria-labelledby="reviews-heading">
        <div className="reviews-heading">
          <h2 id="reviews-heading">Отзывы</h2>
          <div className="reviews-controls">
            <button type="button" aria-label="Предыдущие отзывы" aria-controls="reviews-slider" disabled={!canPrevious} onClick={() => slide(-1)}><ArrowLeft size={20} /></button>
            <button type="button" aria-label="Следующие отзывы" aria-controls="reviews-slider" disabled={!canNext} onClick={() => slide(1)}><ArrowRight size={20} /></button>
          </div>
        </div>
        <div className="reviews-photo-grid" id="reviews-slider" ref={sliderRef} onScroll={updateControls} role="region" aria-label="Отзывы клиентов">
          {[
            { number: 4, model: "BYD Han L", brand: "BYD", catalogModel: "Han L", year: 2025, mileage: "42.000", name: "Андрей", text: "Помогли выбрать автомобиль и сопровождали на каждом этапе. Все вопросы решались быстро, покупкой доволен.", extension: "png", width: 941, height: 1672 },
            { number: 1, model: "Geely Monjaro", brand: "Geely", catalogModel: "Monjaro", year: 2026, mileage: "12.000", name: "Александр", text: "Помогли подобрать автомобиль под мой бюджет и подробно объяснили все этапы покупки. Машину уже получил, всё понравилось." },
            { number: 5, model: "Li L6", brand: "Li Auto", catalogModel: "L6", year: 2025, mileage: "19.000", name: "Александр", text: "Искал комфортный автомобиль для семьи. Помогли с выбором и подробно объяснили процесс покупки. Всё время были на связи, машиной доволен.", extension: "png", width: 941, height: 1672 },
            { number: 6, model: "BYD Seal 06GT", brand: "BYD", catalogModel: "Seal 06GT", year: 2025, mileage: "27.100", name: "Максим", text: "Хотел попробовать электромобиль. Помогли разобраться в вариантах и выбрать подходящий. На вопросы отвечали быстро, от машины отличные впечатления.", extension: "png", width: 941, height: 1672 },
            { number: 2, model: "BYD Song Plus", brand: "BYD", catalogModel: "Song PLUS", year: 2024, mileage: "37.000", name: "Дмитрий", text: "Всегда были на связи и отвечали на вопросы. Удобно, что заранее понятны стоимость и порядок действий. Спасибо за помощь!" },
            { number: 7, model: "Geely EX2", brand: "Geely", catalogModel: "EX2", year: 2025, mileage: "22.700", name: "Елена", text: "Выбирала небольшой автомобиль для города. Помогли сравнить варианты и объяснили все этапы покупки. Машина удобная, езжу с удовольствием.", extension: "png", width: 941, height: 1672 },
            { number: 3, model: "Geely Monjaro", brand: "Geely", catalogModel: "Monjaro", year: 2026, mileage: "10.000", name: "Сергей", text: "От выбора автомобиля до получения всё прошло спокойно. Делились новостями о доставке и помогли разобраться с документами." },
            { number: 8, model: "Xiaomi YU7", brand: "Xiaomi", catalogModel: "YU7", year: 2025, mileage: "8.100", name: "Павел", text: "Давно присматривался к Xiaomi. Помогли подобрать вариант с небольшим пробегом и разобраться с покупкой. Всё прошло спокойно, автомобилем доволен.", extension: "png", width: 941, height: 1672 },
            { number: 9, model: "Zeekr 001", brand: "Zeekr", catalogModel: "001", year: 2024, mileage: "48.000", name: "Игорь", text: "Давно хотел Zeekr 001. Помогли выбрать автомобиль и разобраться с оформлением. На всех этапах были на связи, покупкой остался доволен.", extension: "png", width: 941, height: 1672 },
            { number: 10, model: "BYD Yuan UP", brand: "BYD", catalogModel: "Yuan UP", year: 2024, mileage: "16.000", name: "Никита", text: "Искал компактный электромобиль на каждый день. Помогли подобрать вариант и объяснили порядок покупки. Всё прошло понятно и спокойно, машиной доволен.", extension: "jpg", width: 941, height: 1672 },
          ].map(({ number, model, brand, catalogModel, year, mileage, name, text, extension = "jpg", width = 941, height = 1672 }) => (
            <article className="review-item" key={number}>
              <div className="review-card">
                <img src={`/reviews/${number}.${extension}`} alt={`Фото с автомобилем — ${number}`} width={width} height={height} loading="lazy" decoding="async" />
              </div>
              <div className="review-card-copy">
                <div className="review-card-stars" role="img" aria-label="5 из 5 звёзд">
                  {[1, 2, 3, 4, 5].map((star) => <Star key={star} size={16} weight="fill" aria-hidden="true" />)}
                </div>
                <h2>{name}</h2>
                <p>{text}</p>
              </div>
              <div className="review-car-details">
                <h3>{model} {year}</h3>
                <p>Пробег {mileage} км</p>
                <AppLink
                  href={`${brandLandingPath(brand)}?${new URLSearchParams({ model: catalogModel, yearFrom: String(year), yearTo: String(year) })}`}
                  navigate={navigate}
                  className="review-car-cta"
                >
                  Хочу такое же авто
                </AppLink>
              </div>
            </article>
          ))}
        </div>
      </section>
  );
}

const CONTACT_OFFICE_MAPS = Object.freeze({
  china: Object.freeze({ longitude: "27.597341", latitude: "53.940579", title: "Офис партнёров: Минск, улица Мележа, 5к1" }),
  korea: Object.freeze({ longitude: "27.512217", latitude: "53.922078", title: "Офис партнёров для авто из Кореи" }),
});

function ContactsPage({ navigate, theme }) {
  const [officeOrigin, setOfficeOrigin] = useState("china");
  const officeMap = CONTACT_OFFICE_MAPS[officeOrigin];
  const mapPoint = `${officeMap.longitude}%2C${officeMap.latitude}`;
  const mapSrc = `https://yandex.ru/map-widget/v1/?ll=${mapPoint}&pt=${mapPoint}%2Cpmrdm&z=16${theme === "dark" ? "&theme=dark" : ""}`;
  const contactDepartments = [
    { name: "Приём заявок с сайта", hours: "Круглосуточно" },
    { name: "По вопросам покупки авто", hours: COMPANY.hours },
    { name: "Служба поддержки", hours: "Круглосуточно" },
    { name: "По вопросам партнёрства", hours: COMPANY.hours },
  ];
  return (
    <main className="contact-page">
      <section className="contact-hero page-width" aria-labelledby="contact-title">
        <div className="contact-breadcrumbs">
          <AppLink href="/" navigate={navigate}>Главная</AppLink>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Контакты</span>
        </div>
        <h1 id="contact-title">Контакты</h1>
      </section>

      <section className="contact-method-grid page-width" aria-label="Способы связи">
        <a className="contact-method-card contact-method-card-brand" href={`tel:${COMPANY.phoneHref}`}>
          <img className="contact-method-brand-image" src="/social/contact-phone.png" alt="" width="92" height="92" decoding="async" />
          <strong>{COMPANY.phone}</strong>
          <span className="contact-method-description">Позвоните — обсудим ваши вопросы<br />и подберём автомобиль под ваши задачи.</span>
          <span className="contact-method-action">Позвонить <ArrowRight size={26} aria-hidden="true" /></span>
        </a>
        <a className="contact-method-card contact-method-card-brand" href={COMPANY.viberUrl} rel={EXTERNAL_LINK_REL}>
          <img className="contact-method-brand-image contact-method-brand-image-viber" src="/social/contact-viber.png" alt="" width="102" height="102" decoding="async" />
          <strong>Viber</strong>
          <span className="contact-method-description">Напишите или позвоните в Viber —<br />обсудим запрос и поможем выбрать авто.</span>
          <span className="contact-method-action">Связаться <ArrowRight size={26} aria-hidden="true" /></span>
        </a>
        <a className="contact-method-card contact-method-card-brand" href={`mailto:${COMPANY.email}`}>
          <img className="contact-method-brand-image" src="/social/contact-mail.png" alt="" width="92" height="92" decoding="async" />
          <strong>Электронная почта</strong>
          <span className="contact-method-description">Напишите на {COMPANY.email} —<br />обсудим документы и расчёт стоимости.</span>
          <span className="contact-method-action">Написать письмо <ArrowRight size={26} aria-hidden="true" /></span>
        </a>
        <ExternalLink className="contact-method-card contact-method-card-brand" href={COMPANY.telegramUrl}>
          <img className="contact-method-brand-image" src="/social/contact-telegram.png" alt="" width="92" height="92" decoding="async" />
          <strong>Telegram</strong>
          <span className="contact-method-description">Задайте вопрос в Telegram-чате —<br />ответим и поможем выбрать автомобиль.</span>
          <span className="contact-method-action">Задать вопрос <ArrowRight size={26} aria-hidden="true" /></span>
        </ExternalLink>
      </section>

      <section className="contact-socials page-width" aria-labelledby="contact-socials-title">
        <h2 id="contact-socials-title">Мы в социальных сетях</h2>
        <div className="contact-socials-links">
          <ExternalLink className="header-social-link contact-social-link" aria-label="Telegram" href={COMPANY.telegramUrl} onClick={() => trackEvent("contact_telegram_click")}><TelegramOfficialLogo size={36} weight="fill" /></ExternalLink>
          <ExternalLink className="header-social-link contact-social-link" aria-label="Instagram" href={COMPANY.instagramUrl} onClick={() => trackEvent("contact_instagram_click")}><InstagramLogo size={44} weight="bold" /></ExternalLink>
          <ExternalLink className="header-social-link contact-social-link" aria-label="Threads" href={COMPANY.threadsUrl} onClick={() => trackEvent("contact_threads_click")}><ThreadsLogo size={44} /></ExternalLink>
        </div>
      </section>

      <section className="contact-departments page-width" aria-label="Часы работы отделов">
        <ul>
          {contactDepartments.map(({ name, hours }) => (
            <li key={name}>
              <strong>{name}</strong>
              <span>{hours}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="contact-offices page-width" aria-labelledby="contact-offices-title">
        <h2 id="contact-offices-title">Офисы партнёров</h2>
        <SegmentedControl
          options={[{ value: "china", label: `Авто ${fromPhrase("china")}` }, { value: "korea", label: `Авто ${fromPhrase("korea")}` }]}
          value={officeOrigin}
          onChange={setOfficeOrigin}
          label="Направление автомобилей"
          className="contact-office-switch"
        />
        <div className="contact-map">
          <iframe
            key={`${officeOrigin}-${theme}`}
            src={mapSrc}
            title={`${officeMap.title} на Яндекс Картах`}
            loading="eager"
            allowFullScreen
          />
        </div>
      </section>

      <ServiceContactCta includeOptions={false} questionEvent="contact_page_question_click" />

    </main>
  );
}

/* Страницы-инструменты: квота, растаможка, стоимость доставки, калькулятор. Верстка
   такая же, как у обзоров моделей, — блоки в блоках: под заголовком полоса главных
   цифр, следом живой блок с расчётом, дальше разделы с вложенными списками, врезками
   и карточками сравнения, в конце частые вопросы и переходы к остальным расчётам.
   Раньше это были простыни абзацев, как у юридических страниц.

   Тексты, разделы и живые цифры лежат в src/tool-pages.js, оттуда же их берёт
   страница для поисковика: два места писали бы по-разному. */
/* Значки у заголовков страниц расчёта. Картинка узнаётся быстрее названия, а справа
   от заголовка всё равно пустое поле. Две рисовки ведут себя по-разному: у
   калькулятора значок крупнее плитки и уходит за её правый нижний угол, как в полосе
   «почему мы» на главной, а высокая батарея так обрезалась бы пополам — она стоит
   внутри плитки целиком. */
const TOOL_HERO_ICONS = Object.freeze({
  quota: { src: "/services/ev-quota-zero-percent-gold.png", width: 512, height: 512, fit: "quota", raw: true },
  customs: { src: "/services/customs-calculator.png", width: 224, height: 224 },
  cost: { src: "/services/delivery-car-carrier.png", width: 640, height: 426, fit: "carrier", raw: true },
  range: { src: "/services/battery-check.png", width: 512, height: 512, fit: "inside" },
  market: { src: "/services/price-comparison.png", width: 512, height: 512 },
  brands: { src: "/services/china-brands.png", width: 512, height: 426, fit: "flag" },
});

function ToolPage({ tool, navigate }) {
  const stats = toolPageStats(tool.kind);
  const updatedLabel = toolUpdatedLabel(tool);
  // Тексты страницы лежат отдельным файлом (см. src/tool-page-text-load.js).
  // По прямой ссылке они уже загружены до запуска приложения (src/main.jsx);
  // при переходе внутри сайта доезжают за долю секунды, и до этого страница
  // рисуется с заголовком и цифрами, но без текстовых разделов.
  const [allTexts, setAllTexts] = useState(loadedToolPageTexts);
  useEffect(() => {
    if (!allTexts) loadToolPageTexts().then(setAllTexts).catch(() => null);
  }, [allTexts]);
  const texts = allTexts?.[tool.path] || { intro: [], sections: [], faq: [], disclaimer: "" };
  // Текст разрываем примерно посередине, как в обзорах моделей: между половинами
  // встаёт блок про сервис.
  const splitAt = Math.ceil(texts.sections.length / 2);
  const firstSections = texts.sections.slice(0, splitAt);
  const restSections = texts.sections.slice(splitAt);
  // Страница растаможки живёт по другим правилам, чем квота и доставка: за ней
  // приходят посчитать. Поэтому калькулятор стоит сразу под заголовком, а текст
  // свёрнут в раскрывающиеся пункты — он в разметке страницы, но не мешает добраться
  // до формы. Пунктов ровно столько, сколько запросов они закрывают: вступление,
  // «чего нет в расчёте» и разбор указа № 140 убраны — их никто не ищет, а места
  // в списке они занимали столько же, сколько ставки пошлины.
  const isCalculator = tool.kind === "customs";
  const heroIcon = TOOL_HERO_ICONS[tool.kind];
  const isMarket = tool.kind === "market";
  // Расчёт запаса хода живёт по тем же правилам, что и растаможка: за страницей
  // приходят посчитать, поэтому форма стоит сразу под заголовком, а текст свёрнут
  // в пункты под ней — он в разметке страницы, но не отодвигает форму вниз.
  const isDeliveryCalculator = tool.kind === "cost";
  const isFormPage = isCalculator || tool.kind === "range" || isDeliveryCalculator;
  const isQuotaPage = tool.kind === "quota";
  const calculatorDetails = !isCalculator ? [] : [
    { title: customsExample().title, content: <ToolPageDataTable table={{ ...customsExample(), title: null }} /> },
    {
      title: "Ставки пошлины: полные таблицы",
      content: dutyRateTables().map((table) => <ToolPageDataTable key={table.title} table={table} />),
    },
    ...texts.sections.map((section) => ({
      title: section.title,
      content: <ModelPageSection section={{ ...section, title: null }} navigate={navigate} />,
    })),
  ];
  // На расчёте запаса хода разделы и вопросы стоят одним списком «Частые вопросы»:
  // два блока подряд с одинаковыми пунктами читались как повтор, а вопросов там
  // всего пять. На растаможке они разведены — в верхнем блоке таблицы ставок.
  const rangeDetails = isCalculator ? [] : [
    ...texts.sections.map((section) => ({
      title: section.title,
      content: <ModelPageSection section={{ ...section, title: null }} navigate={navigate} />,
    })),
    ...texts.faq.map((item) => ({
      title: item.q,
      content: <p>{renderInlineText(item.a, navigate)}</p>,
    })),
  ];
  // Справочник нужен прежде всего как быстрый список с поиском. Пояснения остаются
  // доступными людям и поисковикам, но не превращают страницу в длинную простыню.
  const brandsDetails = tool.kind !== "brands" ? [] : [
    ...texts.sections.map((section) => ({
      title: section.title,
      content: <ModelPageSection section={{ ...section, title: null }} navigate={navigate} />,
    })),
    ...texts.faq.map((item) => ({
      title: item.q,
      content: <p>{renderInlineText(item.a, navigate)}</p>,
    })),
  ];
  // На сравнении цен оставляем человеку только карточки и компактный блок вопросов.
  // Все пояснения по-прежнему находятся в разметке страницы и в FAQ schema, поэтому
  // поисковик и агент получают полный контекст, но длинная статья не идёт следом за
  // результатами, ради которых открывают страницу.
  const marketDetails = !isMarket ? [] : [
    {
      title: "Как работает сравнение цен?",
      content: <>{texts.intro.map((text) => <p key={text.slice(0, 40)}>{renderInlineText(text, navigate)}</p>)}</>,
    },
    ...texts.sections.map((section) => ({
      title: section.title,
      content: <ModelPageSection section={{ ...section, title: null }} navigate={navigate} />,
    })),
    ...texts.faq.map((item) => ({
      title: item.q,
      content: <p>{renderInlineText(item.a, navigate)}</p>,
    })),
  ];
  // После живого остатка квоты оставляем только ответы на поисковый запрос.
  // Повторное вступление, история тех же чисел и сервисная реклама здесь не помогают
  // ни человеку, ни поисковику.
  const quotaDetails = !isQuotaPage ? [] : [
    ...texts.sections.map((section) => ({
      title: section.title,
      content: <ModelPageSection section={{ ...section, title: null }} navigate={navigate} />,
    })),
    ...texts.faq.map((item) => ({
      title: item.q,
      content: <p>{renderInlineText(item.a, navigate)}</p>,
    })),
  ];
  // Шаг назад работает, только если на страницу пришли с другой страницы сайта. По
  // прямой ссылке из поиска возвращаться некуда — ведём на главную.
  const goBack = () => (window.history.length > 1 && window.history.state?.fromPath ? navigate(-1) : navigate("/"));
  // Пока журнал выключен, страница расчёта выглядит как прежде: текст по центру и
  // кружок «назад» слева. С журналом у неё появляется то же боковое меню, что у
  // материалов, — чтобы переход «журнал → расчёт → журнал» не терял навигацию. Кружок
  // «назад» в этом виде убран: слева от текста больше нет свободного поля, а его роль
  // берут хлебные крошки.
  const withAside = BLOG_ENABLED;
  const reading = (
      <div className="model-page-reading">
        {!withAside && (
        <div className="model-page-back-rail">
          <button type="button" className="model-page-back" aria-label="Назад" onClick={goBack}>
            <ArrowLeft size={24} />
          </button>
        </div>
        )}
        <div className={`model-page-body page-width${tool.kind === "brands" ? " tool-page-brands-body" : ""}`}>
          <section className="model-page-hero">
            <div className="model-page-hero-copy">
              {/* Та же строка над заголовком, что у материалов журнала: название
                  раздела ссылкой назад в журнал. */}
              {withAside && (
                <span className="blog-article-meta">
                  <AppLink href={BLOG_INDEX.path} navigate={navigate}>Расчёты</AppLink>
                </span>
              )}
              <h1>{tool.h1}</h1>
              <p>{tool.lead}</p>
              {/* На когда цифры. Ставим у заголовка, а не в подвале: за этими
                  страницами приходят именно за числом, и первый вопрос к нему —
                  насколько оно свежее. Текст общий с версией для поисковика. */}
              {/* На калькуляторе этой строки нет: там курс с датой стоит прямо
                  в расчёте, под суммой платежа, и вторая дата была бы повтором. */}
              {updatedLabel && !isFormPage && !isQuotaPage && tool.kind !== "brands" ? <p className="tool-page-updated">{updatedLabel}</p> : null}
            </div>
            {/* Значок у заголовка калькулятора: справа от заголовка оставалось
                пустое поле, а страница расчёта среди прочих узнаётся по картинке
                быстрее, чем по названию. Плитка та же, что в полосе «почему мы»
                на главной. Картинка украшает и в озвучку экрана не идёт. */}
            {heroIcon && (
              <span className={`tool-page-hero-icon${heroIcon.fit ? ` tool-page-hero-icon-${heroIcon.fit}` : ""}`} aria-hidden="true">
                {heroIcon.raw
                  ? <img src={appHref(heroIcon.src)} width={heroIcon.width} height={heroIcon.height} alt="" aria-hidden="true" />
                  : <Illustration src={heroIcon.src} width={heroIcon.width} height={heroIcon.height} alt="" aria-hidden="true" />}
              </span>
            )}
          </section>
          {/* Вступление и полоса ставок — только на квоте и доставке. На странице
              растаможки их нет: там сразу форма, а весь текст свёрнут ниже. */}
          {/* На сравнении цен этого блока нет вовсе: вступление уехало под таблицу, а
              полосы цифр у страницы нет — пустая обёртка добавляла к отступу лишние
              38 точек, и таблица отрывалась от заголовка. */}
          {!isFormPage && !isMarket && tool.kind !== "brands" && (
            <article className="model-page-article">
              {isQuotaPage && <QuotaPageCalculator />}
              {!isQuotaPage && (
                <div className="model-page-intro">
                  {texts.intro.map((text) => <p key={text.slice(0, 40)}>{text}</p>)}
                </div>
              )}
              {stats.length > 0 && !isQuotaPage && (
                <div className="model-page-numbers">
                  {stats.map((stat) => (
                    <div key={stat.label}>
                      <strong>{withApprox(stat.value)}</strong>
                      <span>{stat.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )}
          {tool.kind === "brands" && (
            <article className="model-page-article tool-page-brands-directory">
              <ChinaBrandsDirectory navigate={navigate} />
            </article>
          )}
          {/* На калькуляторе форма стоит в одной подложке с заголовком: между ними
              нечего читать, а две подложки подряд читались как пропущенный кусок. */}
          {isFormPage && (
            <article className="model-page-article">
              {isCalculator ? <CustomsCalculator /> : isDeliveryCalculator ? <DeliveryCalculator /> : <RangeCalculator />}
            </article>
          )}
          {/* Сравнение — в одной подложке с заголовком, как форма калькулятора: две
              подложки подряд с пустым промежутком читались как разрыв страницы. */}
          {isMarket && (
            <article className="model-page-article">
              <MarketCompare navigate={navigate} />
            </article>
          )}
        </div>
        {/* Сам инструмент — отдельным блоком: за живой цифрой квоты и расчётом сюда
            и приходят, объяснения читают уже потом. У калькулятора растаможки этого
            блока нет: его форма стоит выше, в одной подложке с заголовком, а пустая
            подложка здесь читалась бы как не загрузившийся кусок страницы. */}
        {/* У сравнения цен этого блока нет: его таблица стоит выше, в одной подложке
            с заголовком, а пустая подложка здесь читалась бы как не загрузившийся
            кусок страницы. */}
        {!isFormPage && !isMarket && !isQuotaPage && tool.kind !== "brands" && (
          <div className="model-page-body page-width">
            <article className="model-page-article">
              {tool.kind === "cost" && <ToolPageTable table={deliveryStages()} />}
              {tool.kind === "cost" && <ToolPageTable table={deliveryStagesKorea()} />}
            </article>
          </div>
        )}
        {isMarket ? (
          <ToolDisclosures title="Частые вопросы" titleId="market-compare-faq-title" items={marketDetails} faq={texts.faq} />
        ) : isQuotaPage ? (
          <ToolDisclosures title="О квоте и расчёте" titleId="ev-quota-details-title" items={quotaDetails} faq={texts.faq} />
        ) : isFormPage ? (
          <>
            {isCalculator ? (
              <>
                <ToolDisclosures title="Как считается растаможка" titleId="tool-page-details-title" items={calculatorDetails} />
                <ArticleFaq faq={texts.faq} title="Частые вопросы" />
              </>
            ) : (
              <ToolDisclosures title="Частые вопросы" titleId="tool-page-details-title" items={rangeDetails} faq={texts.faq} />
            )}
            <ModelPagePromo navigate={navigate} />
          </>
        ) : tool.kind === "brands" ? (
          <ToolDisclosures title="Подробнее о марках" titleId="china-brands-details-title" items={brandsDetails} faq={texts.faq} />
        ) : (
          <>
            <div className="model-page-body page-width">
              <article className="model-page-article">
                {firstSections.map((section) => <ModelPageSection key={section.title} section={section} navigate={navigate} />)}
              </article>
            </div>
            <ModelPagePromo navigate={navigate} />
            {restSections.length > 0 && (
              <div className="model-page-body page-width">
                <article className="model-page-article">
                  {restSections.map((section) => <ModelPageSection key={section.title} section={section} navigate={navigate} />)}
                </article>
              </div>
            )}
            <ArticleFaq faq={texts.faq} title="Частые вопросы" />
          </>
        )}
      </div>
  );
  if (!withAside) {
    return (
      <main className="model-page tool-page">
        {reading}
        <ToolPageLinks tool={tool} navigate={navigate} />
        {!isMarket && texts.disclaimer ? <p className="model-page-disclaimer page-width">{texts.disclaimer}</p> : null}
      </main>
    );
  }
  return (
    <main className="model-page tool-page tool-page-aside blog-page page-width">
      {/* Крошки ведут через журнал, а не сразу на главную: расчёты — его раздел,
          и обратный путь должен это показывать. */}
      <Breadcrumbs>
        <CrumbLink href="/" onOpen={() => goBackTo(navigate, "/")}>Главная</CrumbLink>
        <CaretRight size={13} />
        <CrumbLink href={BLOG_INDEX.path} onOpen={() => goBackTo(navigate, BLOG_INDEX.path)}>{BLOG_INDEX.name}</CrumbLink>
        <CaretRight size={13} />
        {tool.name}
      </Breadcrumbs>
      <BlogMasthead navigate={navigate} />
      <div className="blog-layout">
        {/* Всё содержимое страницы лежит в колонке сетки, включая оговорку: иначе
            она тянулась бы во всю ширину страницы и не совпадала бы по краям с
            текстом выше. Блока «Другие расчёты» здесь нет: те же ссылки стоят в
            боковой колонке, и внизу они были вторым списком того же самого. */}
        <div className="blog-main">
          {reading}
          {!isMarket && texts.disclaimer ? <p className="model-page-disclaimer">{texts.disclaimer}</p> : null}
        </div>
        <BlogSidebar navigate={navigate} currentPath={tool.path} />
      </div>
    </main>
  );
}

/* Таблица-карточки: первая ячейка строки становится заголовком, остальные читаются
   как «свойство — значение». Так же показаны версии в обзорах моделей: настоящая
   таблица на телефоне уезжала в боковую прокрутку. */
/* Та же таблица, но настоящей таблицей, а не карточками. Карточки хороши, когда их
   три-четыре и в каждой пара строк; ставки пошлины — это шесть почти одинаковых
   строк, и карточками они растягивались на три экрана. В свёрнутых пунктах на
   странице растаможки берём именно этот вид: он и компактнее, и совпадает с тем,
   что видит поисковик, — там эти же данные всегда были таблицей. */
function ToolPageDataTable({ table }) {
  return (
    <figure className="article-table tool-disclosure-table">
      {table.title ? <figcaption className="tool-disclosure-table-title">{table.title}</figcaption> : null}
      <div className="article-table-scroll">
        <table>
          <thead>
            <tr>{table.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, index) => (index ? <td key={cell + index}>{withApprox(cell)}</td> : <th key={cell} scope="row">{cell}</th>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.note ? <figcaption>{table.note}</figcaption> : null}
    </figure>
  );
}

function ToolPageTable({ table, heading: Heading = "h2" }) {
  return (
    <section className="model-page-versions">
      {/* Заголовка может не быть: внутри раскрывающегося пункта его роль играет
          кнопка пункта. А когда таблиц в пункте несколько, у них заголовок помельче. */}
      {table.title ? <Heading>{table.title}</Heading> : null}
      <div className="model-page-versions-cards">
        {table.rows.map((row) => (
          <div key={row[0]}>
            <strong>{row[0]}</strong>
            <dl>
              {table.columns.slice(1).map((column, index) => (
                <div key={column}>
                  <dt>{column}</dt>
                  <dd>{row[index + 1]}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

/* Переходы к остальным расчётам в конце страницы: человек, который считал доставку,
   почти всегда идёт потом смотреть растаможку или квоту. */
function ToolPageLinks({ tool, navigate }) {
  return (
    <section className="tool-page-links page-width" aria-labelledby="tool-page-links-title">
      <h2 id="tool-page-links-title">Другие расчёты</h2>
      <div className="tool-page-links-list">
        {TOOL_PAGES.filter((page) => page.path !== tool.path).map((page) => (
          <AppLink key={page.path} href={page.path} navigate={navigate}>
            <strong>{page.name}</strong>
            <p>{page.lead}</p>
            <span>Открыть <ArrowRight size={16} /></span>
          </AppLink>
        ))}
      </div>
    </section>
  );
}

const currentQuotaPeriodKey = (periods, now = new Date()) => {
  const key = `${now.getFullYear()}-${now.getMonth() + 1}`;
  if (periods.some((period) => period.key === key)) return key;
  return [...periods].reverse().find((period) => period.left != null)?.key || periods[0]?.key || "";
};

/* Главный интерактив страницы квоты: слева выбираются аудитория и месяц, справа
   шкала показывает официальный остаток именно для выбранной строки календаря. */
function QuotaPageCalculator() {
  const [audience, setAudience] = useState("personal");
  const quota = evQuotaState({ audience });
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(() => currentQuotaPeriodKey(quota.periods));
  const selectedPeriod = quota.periods.find((period) => period.key === selectedPeriodKey)
    || quota.periods.find((period) => period.key === currentQuotaPeriodKey(quota.periods))
    || quota.periods[0];
  return (
    <section className="quota-page-calc quota-panel" aria-label="Остаток квоты на электромобили">
      <div className="quota-page-calendar-column">
        <QuotaAudienceTabs audience={audience} onChange={setAudience} />
        <QuotaMonthPicker quota={quota} selectedKey={selectedPeriod?.key} onSelect={setSelectedPeriodKey} />
      </div>
      <QuotaPeriodResult quota={quota} period={selectedPeriod} />
    </section>
  );
}

/* Калькулятор растаможки. Две части в одном блоке: сверху — таможенный платёж,
   он считается по правилам Беларуси и от страны ввоза не зависит; ниже, если
   машина едет из Китая, — во сколько она обойдётся в Минске со всеми этапами.

   Обе части считает код из src/pricing.js — тот же, что и цену в карточке
   каталога. Своей механики расчёта здесь нет: иначе калькулятор и каталог
   разошлись бы в цифрах при первой же правке ставок.

   Списки выбора — те же, что в фильтрах каталога: свой вид у выпадающего списка
   на одной странице сразу выбивался бы из сайта. */
const modelLengthMm = (item) => {
  const match = `${item.lead || ""} ${item.teaser || ""}`.match(/длин(?:ой|а)\s+(\d)[,.](\d{1,2})\s*метр/i);
  return match ? Math.round(Number(`${match[1]}.${match[2]}`) * 1000) : 0;
};

const DELIVERY_MODEL_OPTIONS = [...new Map(MODEL_PAGES.map((item) => [item.name, {
  value: item.slug,
  label: item.name,
  brand: item.brand,
  catalogModel: item.model,
  lengthMm: modelLengthMm(item),
}])).values()]
  .sort((a, b) => a.label.localeCompare(b.label, "ru"));

const DELIVERY_LOCATION_OPTIONS = [...new Map(Object.entries(CITY_NAMES)
    .filter(([key]) => /^[a-z_]+$/.test(key))
    .map(([value, label]) => [label, { value, label }])).values()]
  .sort((a, b) => a.label.localeCompare(b.label, "ru"));

function DeliveryCalculator() {
  const [initial] = useState(() => {
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    const modelValue = params.get("model") || "";
    const cityValue = params.get("city") || "";
    return {
      model: DELIVERY_MODEL_OPTIONS.find((item) => item.value === modelValue) || null,
      location: DELIVERY_LOCATION_OPTIONS.find((item) => item.value === cityValue) || null,
      currency: CALC_CURRENCIES.some((item) => item.id === params.get("cur")) ? params.get("cur") : "usd",
    };
  }, []);
  const [model, setModel] = useState(initial.model);
  const [location, setLocation] = useState(initial.location);
  const [outCurrency, setOutCurrency] = useState(initial.currency);
  const [copied, setCopied] = useState(false);
  const [modelSizes, setModelSizes] = useState({});
  const knownSize = model?.value ? modelSizes[model.value] : null;
  const modelSize = knownSize || model || {};
  const estimate = useMemo(() => estimateDeliveryCip({
    model: model?.label,
    city: location?.value,
    lengthMm: modelSize.lengthMm,
    curbWeight: modelSize.curbWeight,
  }), [model, modelSize.lengthMm, modelSize.curbWeight, location]);
  const fromUsd = { usd: 1, eur: PRICING.usdByn / PRICING.eurByn, byn: PRICING.usdByn, rub: PRICING.usdByn / (PRICING.rubBynPer100 / 100) }[outCurrency] || 1;
  const sign = { usd: "$", eur: "€", byn: "BYN", rub: "₽" }[outCurrency] || "$";
  const amount = (value) => number(Math.round(value * fromUsd));
  const money = (value) => `${amount(value)} ${sign}`;
  const shareSearch = new URLSearchParams();
  if (model?.value && !model.custom) shareSearch.set("model", model.value);
  if (location?.value && !location.custom) shareSearch.set("city", location.value);
  if (outCurrency !== "usd") shareSearch.set("cur", outCurrency);
  const search = shareSearch.toString();

  useEffect(() => {
    if (!window.history?.replaceState) return;
    // Ползунок и ввод цифр дают десятки записей в секунду — Safari после ~100 бросает
    // ошибку, без обёртки она роняла страницу (см. patchHistoryState).
    replaceHistoryEntry(window.history.state, `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, [search]);
  useEffect(() => {
    if (!model?.value || model.custom || knownSize) return undefined;
    const controller = new AbortController();
    const query = new URLSearchParams({ brand:model.brand, model:model.catalogModel, limit:"24", sort:"newest" });
    fetchCarsJson(`/api/cars?${query}`, controller.signal)
      .then((catalog) => {
        const size = deliveryModelSize(catalog.items || []);
        setModelSizes((current) => ({ ...current, [model.value]:size }));
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setModelSizes((current) => ({ ...current, [model.value]:{ lengthMm:model.lengthMm || 0, curbWeight:0 } }));
      });
    return () => controller.abort();
  }, [model, knownSize]);
  const bodyClass = model && !model.custom
    ? deliveryBodyClass(model.label, modelSize)
    : "";
  const modelSelected = Boolean(model?.value && !model.custom);
  const locationSelected = Boolean(location?.value && !location.custom);
  const precisionPrompt = deliveryPrecisionPrompt({ modelSelected, locationSelected });
  // Не показываем промежуточный статус загрузки: базовую тарифную группу можно
  // определить сразу по названию и данным страницы модели. Ответ каталога затем
  // лишь уточняет габариты; если группа не изменилась, интерфейс остаётся полностью
  // неподвижным и выбор модели не выглядит как два последовательных пересчёта.
  const bodyClassText = `${bodyClass || "Кузов не определён"}.`;
  const deliveryHint = precisionPrompt
    // Страны в калькуляторе пока нет (расчёт по зонам Китая), поэтому плечо названо
    // без страны; с корейским профилем логистики здесь появится выбор.
    || `Ориентир от ${money(estimate.low)} до ${money(estimate.high)}. Плечо по стране отправления: ${estimate.transitLabel}.`;
  const copyShareLink = async () => {
    const url = `${window.location.origin}${appHref("/delivery-cost")}${search ? `?${search}` : ""}`;
    if (!await copyToClipboard(url)) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="tool-calc tool-calc-delivery" aria-label="Расчёт стоимости доставки CIP до Минска">
      <div className="tool-calc-fields">
        <div className="tool-calc-field tool-calc-combo-field">
          <ComboboxField
            label="Модель машины"
            value={model}
            options={DELIVERY_MODEL_OPTIONS}
            onChange={setModel}
            placeholder="Начните вводить модель"
          />
        </div>
        <div className="tool-calc-field tool-calc-combo-field">
          <ComboboxField
            label="Местоположение машины"
            value={location}
            options={DELIVERY_LOCATION_OPTIONS}
            onChange={setLocation}
            placeholder="Точно не знаю"
          />
        </div>
        <p className="tool-calc-why tool-calc-delivery-note">
          В CIP входят перевозка и страхование до Минска. Цена машины, растаможка, СВХ, регистрация, подбор и сопровождение считаются отдельно.
        </p>
      </div>
      <div className="tool-calc-result">
        <div className="tool-calc-summary">
          <div className="tool-calc-total">
            <span>Доставка CIP до Минска</span>
            <span className="tool-calc-sum">
              <strong><ApproxSign /> {amount(estimate.total)}</strong>
              <SelectField
                className="tool-calc-money-select"
                label="Валюта расчёта"
                value={(CALC_CURRENCIES.find((item) => item.id === outCurrency) || CALC_CURRENCIES[0]).name}
                options={CALC_CURRENCIES.map((item) => item.name)}
                onChange={(name) => setOutCurrency((CALC_CURRENCIES.find((item) => item.name === name) || CALC_CURRENCIES[0]).id)}
              />
            </span>
            <small aria-live="polite">
              {deliveryHint} <span className={`tool-calc-body-class${bodyClass === "Крупный кузов" ? " large" : ""}`}>{bodyClassText}</span>
            </small>
          </div>
          <dl className="tool-calc-rows">
            {estimate.rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd><ApproxSign /> {money(row.amount)}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className={`primary tool-calc-share${copied ? " copied" : ""}`} onClick={copyShareLink}>
            <LinkSimple size={17} />
            <span>{copied ? "Ссылка скопирована" : "Поделиться расчётом"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function CustomsCalculator() {
  // Расчёт из чужой ссылки. Читаем адрес один раз при первом появлении формы:
  // дальше поля живут своей жизнью, и подмешивать в них адрес на каждом шаге
  // значило бы отменять то, что человек только что выбрал.
  const shared = useMemo(() => calcStateFromSearch(window.location.search), []);
  const [kind, setKind] = useState(() => (CALC_KINDS.find((item) => item.id === shared.kind) || CALC_KINDS[3]).name);
  const [priceValue, setPriceValue] = useState(() => String(shared.price ?? 20000));
  const [currency, setCurrency] = useState(() => shared.currency || CALC_CURRENCIES[0].id);
  const [engineCc, setEngineCc] = useState(() => String(shared.engineCc ?? 1500));
  const [year, setYear] = useState(() => shared.year || String(new Date().getFullYear() - 3));
  const quotaPricing = useQuotaPricing();
  const refund50 = Boolean(quotaPricing?.refund50);
  const setRefund50 = (on) => quotaPricing?.setRefund50(on);
  useEffect(() => {
    if (shared.refund50) setRefund50(true);
  }, [shared]);
  // Валюта, в которой показан платёж. Пусто — значит «как у цены машины»: человек
  // вписал цену в долларах и, скорее всего, хочет видеть в них же ответ. Как только
  // он выберет валюту у самой суммы, она перестаёт следовать за ценой.
  const [resultCurrency, setResultCurrency] = useState(null);
  const [copied, setCopied] = useState(false);

  const kindItem = CALC_KINDS.find((item) => item.name === kind) || CALC_KINDS[0];
  const isElectric = kindItem.id === "ev";
  const years = calcYears();
  // Цена приходит в той валюте, которую выбрал человек, а расчёт живёт в долларах.
  const toUsd = { usd: 1, eur: PRICING.eurByn / PRICING.usdByn, byn: 1 / PRICING.usdByn, rub: (PRICING.rubBynPer100 / 100) / PRICING.usdByn }[currency];
  const priceUsd = Math.max(0, (Number(String(priceValue).replace(/\s/g, "")) || 0) * toUsd);
  const cc = Math.max(0, Math.round(Number(engineCc) || 0));

  // Возраст на дату оформления расчёт умеет считать сам — ему нужен год выпуска.
  const ageYears = carAgeYears({ year: Number(year) || Number(years[3]) });
  // Таможенная стоимость — то, что человек ввёл, и ничего сверх того: по статье 267
  // Таможенного кодекса ЕАЭС расходы на перевозку и страхование в стоимость товара
  // для личного пользования не входят. Так же считает и карточка каталога.
  const payment = priceUsd > 0
    ? customsPayment({
      customsValueUsd: priceUsd,
      kind: kindItem.id === "phev" ? "ice" : kindItem.id,
      engineCc: cc,
      ageYears,
      // Указ № 140 применяется независимо от выбранного режима квоты.
      refund50,
    })
    : null;

  const byn = (usd) => `${number(Math.round(usd * PRICING.usdByn))} р.`;
  const usd = (value) => `${number(Math.round(value))} $`;
  // Платёж показываем в той валюте, в какой вписана цена машины: тот, кто считает
  // в долларах, не должен переводить рубли в уме, а тот, кто считает в рублях, —
  // наоборот. Расчёт при этом как жил в долларах, так и живёт: меняется только
  // подпись под цифрой. Платят на таможне всё равно в рублях, и об этом сказано
  // прямо под суммой.
  const outCurrency = resultCurrency || currency;
  const fromUsd = { usd: 1, eur: PRICING.usdByn / PRICING.eurByn, byn: PRICING.usdByn, rub: PRICING.usdByn / (PRICING.rubBynPer100 / 100) }[outCurrency] || 1;
  // Знак берём тот же, что написан на кнопке валюты: нажал BYN — и в цифрах стоит
  // BYN, а не «р.». В связном тексте ниже рубли остаются рублями: там это слово,
  // а не обозначение валюты в колонке цифр.
  const sign = { usd: "$", eur: "€", byn: "BYN", rub: "₽" }[outCurrency] || "$";
  const amount = (value) => number(Math.round(value * fromUsd));
  const money = (value) => `${amount(value)} ${sign}`;
  // Вторая строка — та же сумма в другой валюте. Рублёвую цифру показываем всем,
  // кто считает не в рублях: её и вносят на таможне. Тем, кто уже выбрал рубли,
  // показываем доллары — привычную валюту объявлений.
  const alt = outCurrency === "byn" ? usd(payment ? payment.totalUsd : 0) : byn(payment ? payment.totalExactUsd : 0);
  const rows = payment
    ? [
      ["Ввозная пошлина", payment.dutyUsd],
      payment.vatUsd ? ["НДС 20%", payment.vatUsd] : null,
      ["Утилизационный сбор", payment.utilUsd],
      ["Таможенный сбор", payment.clearanceUsd],
      payment.refundUsd ? ["Возмещение по указу № 140", -payment.refundUsd] : null,
    ].filter(Boolean)
    : [];
  // Почему вышла такая сумма. Пишем разбор под расчётом мелким текстом: без него
  // человек видит цифру и не понимает, откуда она, а при бензиновой машине от трёх
  // до пяти лет ещё и меняет цену, не видит разницы и решает, что калькулятор сломан.
  // Слова берём из того же расчёта — правило, ставка и числа приходят из него, а не
  // пишутся здесь заново.
  const eur = (value) => `${number(Math.round(value))} €`;
  const rate = (value) => `${String(value).replace(".", ",")} €`;
  const whyDuty = () => {
    const d = payment?.detail || {};
    const cc = number(d.engineCc || 0);
    if (payment?.basis === "ev-quota") return "Электромобиль ввозится по квоте без ввозной пошлины — в платеже остаются только сборы.";
    if (payment?.basis === "ev-duty") return `Квота на беспошлинный ввоз электромобилей выбрана, поэтому начисляется пошлина 15% от стоимости машины — ${money(payment.dutyUsd)}`;
    if (payment?.basis === "erev") return "Бензиновый мотор здесь крутит только генератор, и машину оформляют по коду электромобиля. Но льготы у неё нет с 2026 года: пошлина 15% от стоимости и НДС 20% сверху — вместе около 38% цены.";
    if (payment?.basis === "value-or-volume") {
      return d.wonByVolume
        ? `Машине не больше трёх лет, поэтому пошлину считают по большему из двух: доля от стоимости (${Math.round(d.percent * 100)}% — ${eur(d.byValue)}) или ставка за объём (${cc} см³ × ${rate(d.ratePerCc)} — ${eur(d.byVolume)}). Больше вышла ставка за объём.`
        : `Машине не больше трёх лет, поэтому пошлину считают по большему из двух: доля от стоимости (${Math.round(d.percent * 100)}% — ${eur(d.byValue)}) или ставка за объём (${cc} см³ × ${rate(d.ratePerCc)} — ${eur(d.byVolume)}). Больше вышла доля от стоимости.`;
    }
    if (payment?.basis === "volume-3-5") {
      return `Машине от трёх до пяти лет, а на этой ступени пошлину считают только по объёму двигателя: ${cc} см³ × ${rate(d.ratePerCc)} = ${eur(d.dutyEur)}. Цена машины на пошлину не влияет — впишите другую, и сумма не изменится.`;
    }
    if (payment?.basis === "volume-over-5") {
      return `Машине больше пяти лет, а на этой ступени ставка за кубический сантиметр примерно вдвое выше: ${cc} см³ × ${rate(d.ratePerCc)} = ${eur(d.dutyEur)}. Цена машины на пошлину не влияет.`;
    }
    return "";
  };
  const whyRest = () => {
    const parts = [];
    // У гибрида с генератором про НДС уже сказано в разборе пошлины — второй раз не пишем.
    if (payment?.vatUsd && payment.basis !== "erev") {
      parts.push("Сверху идёт НДС 20%: нулевую ставку дают только машинам не старше пяти лет с даты выпуска.");
    }
    parts.push(`Утилизационный сбор — ${payment?.ageYears <= 3 ? "624,92" : "1 282,02"} р. по льготной ставке для частного ввоза, таможенный сбор за оформление — 120 р. Оба уже входят в итог и повторно не прибавляются.`);
    return parts.join(" ");
  };

  // Ссылка ровно на этот расчёт. Её же держим в адресной строке: скопированное
  // из браузера должно совпадать с тем, что даёт кнопка. Заменяем адрес, а не
  // добавляем новый, — иначе кнопка «назад» перебирала бы каждую введённую цифру.
  const shareSearch = calcShareSearch({
    kind: kindItem.id,
    price: String(priceValue).replace(/\s/g, ""),
    currency,
    engineCc: cc,
    year,
    refund50,
  });
  useEffect(() => {
    if (!window.history?.replaceState) return;
    // Ползунок и ввод цифр дают десятки записей в секунду — Safari после ~100 бросает
    // ошибку, без обёртки она роняла страницу (см. patchHistoryState).
    replaceHistoryEntry(window.history.state, `${window.location.pathname}${shareSearch ? `?${shareSearch}` : ""}`);
  }, [shareSearch]);
  const shareUrl = `${window.location.origin}${appHref("/customs")}${shareSearch ? `?${shareSearch}` : ""}`;
  const copyShareLink = async () => {
    const done = await copyToClipboard(shareUrl);
    if (!done) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    // Подпись блока — для тех, кто идёт по странице голосом: на экране её роль
    // играет заголовок страницы прямо над формой.
    <section className="tool-calc" aria-label="Калькулятор растаможки">
      {/* Слева поля, справа ответ: меняешь год или объём и тут же видишь, как
          изменился платёж, а не листаешь к нему вниз. */}
      <div className="tool-calc-fields">
        {/* Каждое поле — одна плашка: подпись мелким сверху, значение крупным
            под ней, а справа, за тонкой чертой, единица измерения или валюта.
            Так подпись не отрывается от поля и не съедает отдельную строку. */}
        {/* У списков подпись лежит поверх плашки, а сам список растянут на всю
            её площадь: нажатие в любую точку плашки должно открывать список, а
            не попадать мимо в пустое место рядом со значением. */}
        <div className="tool-calc-field tool-calc-field-select">
          <span className="tool-calc-label">Тип двигателя</span>
          <SelectField className="tool-calc-select" label="Тип двигателя" value={kind} options={CALC_KINDS.map((item) => item.name)} onChange={setKind} />
        </div>
        {/* Год выпуска идёт сразу за типом двигателя: вдвоём они решают, по какому
            правилу считать пошлину, и только потом спрашиваем цифры машины. */}
        <div className="tool-calc-field tool-calc-field-select">
          <span className="tool-calc-label">Год выпуска</span>
          <SelectField className="tool-calc-select" label="Год выпуска" value={year} options={years} onChange={setYear} />
        </div>
        {/* Цена и валюта — одно поле: платят на таможне в рублях, а объявления
            приходят в долларах и евро, и пересчитывать в уме никто не будет. */}
        {/* Не <label>: внутри стоят кнопки выбора валюты, а кнопка внутри подписи
            к полю уводила бы нажатие в поле ввода. */}
        <div className="tool-calc-field">
          {/* Подпись и поле — внутри <label>: тогда курсор встаёт в поле от нажатия
              в любую точку левой половины плашки, а не только по самой цифре.
              Кнопки валют стоят снаружи этой подписи, иначе нажатие на валюту
              уводило бы курсор в поле цены. */}
          <label className="tool-calc-main">
            <span className="tool-calc-label">Цена машины</span>
            <input className="tool-calc-input" type="number" inputMode="numeric" min="500" step="500" value={priceValue} onChange={(event) => setPriceValue(event.target.value)} />
          </label>
          <span className="tool-calc-unit tool-calc-currency" role="group" aria-label="Валюта цены">
            {CALC_CURRENCIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={currency === item.id ? "active" : ""}
                aria-pressed={currency === item.id}
                aria-label={item.label}
                onClick={() => setCurrency(item.id)}
              >
                {item.name}
              </button>
            ))}
          </span>
        </div>
        {/* Объём — в кубических сантиметрах, как он записан в документах машины и
            как его спрашивает таможня. У электромобиля и гибрида с генератором
            пошлина считается от стоимости, и поле не нужно вовсе. */}
        {kindItem.volume && (
          <div className="tool-calc-field">
            <label className="tool-calc-main">
              <span className="tool-calc-label">Объём двигателя</span>
              {/* Единицы стоят справа за чертой и в подпись не попадают, поэтому
                  для чтения с экрана называем поле целиком. */}
              <input className="tool-calc-input" type="number" inputMode="numeric" min="600" max="8000" step="100" aria-label="Объём двигателя, см³" value={engineCc} onChange={(event) => setEngineCc(event.target.value)} />
            </label>
            <span className="tool-calc-unit tool-calc-unit-text">см³</span>
          </div>
        )}
        {/* Переключатели — такие же, как «Быстрый просмотр» и «Цены с квотами»:
            обычная галочка была бы единственной на сайте. */}
        <label className="quick-view-toggle tool-calc-toggle">
          <input
            type="checkbox"
            role="switch"
            checked={isElectric ? Boolean(quotaPricing?.on) : refund50}
            disabled={isElectric && !quotaPricing?.available}
            onChange={(event) => {
              if (isElectric) quotaPricing?.set(event.target.checked);
              else setRefund50(event.target.checked);
            }}
          />
          <span className="quick-view-toggle-track" aria-hidden="true"><i /></span>
          <span className="quick-view-toggle-label">
            {isElectric ? "Учитывать квоту на беспошлинный ввоз" : "Возмещение 50% по указу № 140"}
          </span>
        </label>
      </div>
      {payment ? (
        <div className="tool-calc-result">
          {/* Сумма и разбивка по сборам — одна плашка: это один ответ, просто
              сначала итог, а под ним из чего он сложился. */}
          <div className="tool-calc-summary">
            <div className="tool-calc-total">
              <span>Таможенный платёж</span>
              {/* Валюта у самой суммы — это список: подпись рядом с числом сама
                  предлагает посмотреть платёж в другой валюте, а не только в той,
                  в которой вписана цена машины. */}
              <span className="tool-calc-sum">
                <strong>{amount(payment.totalExactUsd)}</strong>
                <SelectField
                  className="tool-calc-money-select"
                  label="Валюта расчёта"
                  value={(CALC_CURRENCIES.find((item) => item.id === outCurrency) || CALC_CURRENCIES[0]).name}
                  options={CALC_CURRENCIES.map((item) => item.name)}
                  onChange={(name) => {
                    // Выбрали ту же валюту, что и у цены машины, — связь возвращается:
                    // дальше сумма снова следует за ценой, а не застывает в своей
                    // валюте. Иначе после пары переключений туда-обратно смена валюты
                    // у цены переставала бы что-либо менять в ответе.
                    const picked = (CALC_CURRENCIES.find((item) => item.name === name) || CALC_CURRENCIES[0]).id;
                    setResultCurrency(picked === currency ? null : picked);
                  }}
                />
              </span>
              <small>
                Это {alt} по курсу Национального банка на {PRICING.rateDate}. Платить нужно в рублях.
              </small>
            </div>
            <dl className="tool-calc-rows">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value < 0 ? `− ${money(-value)}` : money(value)}</dd>
                </div>
              ))}
            </dl>
            {/* Расчёт нужно уметь переслать: без этого по ссылке из чата открывалась
                бы пустая форма, и разговор начинался бы заново. Кнопка стоит в самой
                плашке расчёта — это действие над тем, что в ней написано. */}
            <button type="button" className={`primary tool-calc-share${copied ? " copied" : ""}`} onClick={copyShareLink}>
              <LinkSimple size={17} />
              <span>{copied ? "Ссылка скопирована" : "Поделиться расчётом"}</span>
            </button>
          </div>
          <p className="tool-calc-why">
            {whyDuty()} {whyRest()}
          </p>
        </div>
      ) : (
        <p className="tool-calc-empty">Укажите цену машины, чтобы увидеть расчёт.</p>
      )}
    </section>
  );
}

/* Справочник марок на странице «Марки из Китая».

   Зачем живые числа: справочник, в котором рядом с маркой стоит «112 машин», сам себя
   и проверяет — если марка кончилась, это видно, а не написано задним числом. Числа
   берём из того же справочника фильтров, который заполняет панель каталога, поэтому
   отдельного запроса к серверу страница не делает: ответ уже загружен или в пути.

   Значок рисуем тем же BrandMark, что и в каталоге: свои картинки на этой странице
   разошлись бы с каталогом при первой же замене логотипа. */
const brandCountsFromMeta = (meta) => new Map((meta?.brands || []).map((item) => [item.brand, item.count]));

// Модели марок для справочника марок: по ответу /api/model-facts, пять самых
// многочисленных на марку.
function brandModelsFromFacts(data) {
  const grouped = {};
  for (const row of data.models || []) {
    if (!grouped[row.brand]) grouped[row.brand] = [];
    grouped[row.brand].push({
      model:row.model,
      count:Number(row.count) || 0,
      image:row.image || null,
      priceMin:Number(row.priceMin) || null,
      priceMax:Number(row.priceMax) || null,
    });
  }
  const next = {};
  for (const [brand, models] of Object.entries(grouped)) {
    models.sort((left, right) => right.count - left.count || left.model.localeCompare(right.model, "ru", { sensitivity:"base" }));
    next[brand] = {
      total:models.length,
      items:models.slice(0, 5),
      priceRanges:models.map((model) => ({ min:model.priceMin, max:model.priceMax })),
    };
  }
  return next;
}

function ChinaBrandsDirectory({ navigate }) {
  const narrow = useNarrowViewport();
  const [counts, setCounts] = useState(() => brandCountsFromMeta(bootCatalogMeta("")));
  // Ответ из заранее собранной страницы (src/boot-api.js) — для первого кадра.
  const [modelsByBrand, setModelsByBrand] = useState(() => {
    const embedded = embeddedApiValue("/api/model-facts");
    return embedded ? brandModelsFromFacts(embedded) : {};
  });
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("Только китайские");
  const [powertrain, setPowertrain] = useState("Все типы");
  const [priceSegment, setPriceSegment] = useState(BRAND_PRICE_SEGMENTS[0].label);
  const [sortMode, setSortMode] = useState("По популярности");
  useEffect(() => {
    let alive = true;
    requestCatalogMeta("")
      .then((meta) => {
        if (alive) setCounts(brandCountsFromMeta(meta));
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/model-facts", { signal:controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("model facts unavailable"))))
      .then((data) => setModelsByBrand(brandModelsFromFacts(data)))
      .catch(() => null);
    return () => controller.abort();
  }, []);
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const matchesQuery = (item) => !normalizedQuery || [
    item.brand,
    item.say,
    item.chinese,
    item.group,
    item.partner,
    item.about,
  ].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(normalizedQuery);
  const matchesFilters = (item) => matchesQuery(item)
    && (powertrain === "Все типы" || (BRAND_POWERTRAINS[item.brand] || []).includes(powertrain))
    && brandMatchesPriceSegment(modelsByBrand[item.brand], priceSegment);
  const chineseBrands = scope === "Не китайские" ? [] : CHINA_BRANDS.filter(matchesFilters);
  const foreignBrands = scope === "Только китайские" ? [] : CHINA_MADE_FOREIGN.filter(matchesFilters);
  const visibleBrands = [
    ...chineseBrands,
    ...foreignBrands.map((item) => ({ ...item, group: `В Китае — вместе с ${item.partner}` })),
  ];
  const sortedBrands = [...visibleBrands].sort((left, right) => (
    sortMode === "По алфавиту"
      ? left.brand.localeCompare(right.brand, "ru", { sensitivity: "base" })
      : (counts.get(right.brand) || 0) - (counts.get(left.brand) || 0)
  ));
  return (
    <div className="brand-directory-shell">
      <div className="market-compare-controls brand-directory-controls">
        <SearchField
          className="brand-directory-search"
          value={query}
          onValueChange={setQuery}
          placeholder="Найти марку"
          ariaLabel="Поиск по маркам"
        />
        <SelectField
          className="market-compare-sort brand-directory-sort"
          label="Сортировка"
          value={sortMode}
          options={["По популярности", "По алфавиту"]}
          onChange={setSortMode}
          mobileIcon={SortAscending}
          mobileActionSheet={narrow}
        />
      </div>
      <div className="market-compare-filter-row brand-directory-filter-row">
        <SelectField
          className="brand-directory-scope"
          label="Какие марки показывать"
          value={scope}
          options={["Только китайские", "Все марки", "Не китайские"]}
          onChange={setScope}
          icon={CarProfile}
          mobileActionSheet={narrow}
        />
        <SelectField
          className="brand-directory-powertrain-filter"
          label="Тип двигателя"
          value={powertrain}
          options={["Все типы", "Бензин", "Гибрид", "Электро"]}
          onChange={setPowertrain}
          icon={Engine}
          mobileActionSheet={narrow}
        />
        <SelectField
          className="brand-directory-price-filter"
          label="Ценовой сегмент"
          value={priceSegment}
          options={BRAND_PRICE_SEGMENTS.map((item) => item.label)}
          onChange={setPriceSegment}
          icon={CurrencyDollar}
          mobileActionSheet={narrow}
        />
      </div>
      {sortedBrands.length > 0 && <section className="brand-directory">
        <div className="brand-directory-grid">
          {sortedBrands.map((item) => (
            <BrandDirectoryCard key={item.brand} item={item} count={counts.get(item.brand) || 0} models={modelsByBrand[item.brand]} modelPreviewLimit={narrow ? 3 : 5} navigate={navigate} />
          ))}
        </div>
      </section>}
      {!sortedBrands.length && (
        <EmptyState
          className="brand-directory-empty"
          title="Такой марки в справочнике нет"
          description="Попробуйте другое написание или измените выбор марок."
        />
      )}
    </div>
  );
}

/* Подробное сравнение цен с рынком Беларуси. Сервер заранее сопоставляет одинаковые
   модели и годы, а браузер только переключает предел пробега и рисует карточки. */
function MarketCompare({ navigate }) {
  const pricing = useQuotaPricing();
  const quotaPricingOn = pricing?.on === true;
  const quotaMode = `${quotaPricingOn ? "on" : "off"}${pricing?.refund50 ? "&refund50=1" : ""}`;
  // Сравнение из готовой страницы (src/boot-api.js) — для первого кадра.
  const [dataByQuota, setDataByQuota] = useState(() => {
    const embedded = embeddedApiValue(`${import.meta.env.BASE_URL}api/market/compare?quota=${quotaMode}`);
    return embedded ? { [quotaMode]: embedded } : {};
  });
  const [failedModes, setFailedModes] = useState(() => new Set());
  const data = dataByQuota[quotaMode] || null;
  const failed = failedModes.has(quotaMode);
  useEffect(() => {
    if (dataByQuota[quotaMode]) return undefined;
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}api/market/compare?quota=${quotaMode}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("сравнение недоступно"))))
      .then((value) => {
        if (alive) setDataByQuota((known) => ({ ...known, [quotaMode]:value }));
      })
      .catch(() => {
        if (alive) setFailedModes((known) => new Set([...known, quotaMode]));
      });
    return () => {
      alive = false;
    };
  }, [quotaMode, dataByQuota]);
  if (failed) return null;
  const cards = data?.cards || [];
  if (data && !cards.length) return null;
  return (
    <section className="cost-calculator">
      <MarketCompareCards cards={cards} navigate={navigate} loading={!data} quotaPricingOn={quotaPricingOn} />
    </section>
  );
}

const MARKET_SKELETON_CARDS = ["a", "b", "c"];

/* Фильтры известны до ответа API и рисуются сразу. Скелетон нужен только на месте
   карточек: он сохраняет высоту списка и не выдаёт готовые контролы за загрузку. */
function MarketCompareSkeleton() {
  return (
    <div className="market-card-list market-card-list-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">Загружаем сравнение цен</span>
      <div aria-hidden="true" className="market-card-list-skeleton-items">
        {MARKET_SKELETON_CARDS.map((key) => (
          <article key={key} className="market-card market-card-skeleton skeleton-card">
            <div className="market-card-photo skeleton-line market-skeleton-photo" />
            <div className="market-card-identity market-skeleton-identity">
              <div className="skeleton-line market-skeleton-brand" />
              <div className="skeleton-line market-skeleton-model" />
              <div className="skeleton-line market-skeleton-year" />
            </div>
            <div className="market-card-data market-skeleton-data">
              <div className="skeleton-line market-skeleton-data-line" />
              <div className="skeleton-line market-skeleton-data-line" />
              <div className="skeleton-line market-skeleton-data-result" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

const MARKET_PAGE_SIZE = 50;

const MARKET_MILEAGE_OPTIONS = Object.freeze([
  { key:"20000", label:"До 20 000 км" },
  { key:"50000", label:"До 50 000 км" },
  { key:"100000", label:"До 100 000 км" },
  { key:"150000", label:"До 150 000 км" },
  { key:"200000", label:"До 200 000 км" },
  { key:"all", label:"Любой пробег" },
]);

const MARKET_PRICE_OPTIONS = Object.freeze([
  { key:"min", label:"По минимальной цене", column:"Минимум" },
  { key:"mean", label:"По средней цене", column:"Средняя" },
  { key:"median", label:"По медианной цене", column:"Медиана" },
]);

const MARKET_SORT_OPTIONS = Object.freeze(["Сначала выгодные", "Сначала невыгодные"]);

const MARKET_POWERTRAIN_OPTIONS = Object.freeze([
  { key:"all", label:"Все типы" },
  { key:"Электромобиль", label:"Электро" },
  { key:"Гибрид", label:"Гибрид" },
  { key:"ДВС", label:"Бензин" },
]);

const MARKET_PRICE_RANGE_VALUES = Object.freeze([
  10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 60000, 70000, 80000, 90000, 100000, 125000, 150000,
]);

const marketPriceRangeValue = (label) => {
  const value = Number(label);
  return Number.isFinite(value) && value > 0 ? value : null;
};

function defaultMarketPrices(card, mileageKey, priceKey, quotaPricingOn) {
  const choice = bestComparisonYear(card, mileageKey, priceKey, quotaPricingOn);
  if (choice?.aggregate) return choice.prices;
  const prices = choice?.year?.prices[mileageKey] || null;
  return prices ? { ...prices, ours:comparisonOwnPrices(prices.ours, quotaPricingOn) } : null;
}

function marketDifference(card, mileageKey, priceKey, quotaPricingOn) {
  return bestComparisonYear(card, mileageKey, priceKey, quotaPricingOn)?.difference ?? null;
}

// Поиск в сравнении использует те же словари, раскладку и транслитерацию, что
// основной поиск каталога. Варианты проверяем по очереди и берём первый, который
// вообще дал результат: так ошибочная раскладка «иьц» исправится как BMW, но более
// далёкие короткие транслитерации уже не подмешают Buick и Mitsubishi.
function marketCardsMatchingQuery(cards, query) {
  return itemsMatchingQuery(cards, query, (card) => `${card.brand} ${card.model} ${card.years.map((year) => year.year).join(" ")}`, (card) => [card.brand, card.model]);
}

function MarketStatRow({ label, stats, priceOption }) {
  const currency = useCurrency();
  const value = hasEnoughMarketSample(stats) ? stats?.[priceOption.key] : null;
  const count = Number(stats?.count);
  return (
    <div className="market-card-stat-row">
      <b className="market-card-source">
        <span className="market-card-source-label">{label}</span>
        {Number.isFinite(count) && count > 0 ? (
          <span className="market-card-count" aria-label={`${number(count)} объявлений`}>· {number(count)}</span>
        ) : null}
      </b>
      <span data-label={priceOption.column}>{Number.isFinite(value) ? bynify(money(Math.round(value), currency)) : "—"}</span>
    </div>
  );
}

function MarketCardDifference({ differenceLabel, difference, hasComparison, showRebuiltHint }) {
  return (
    <div className={`market-card-difference ${hasComparison && difference > 0.05 ? "cheaper" : hasComparison && difference < -0.05 ? "costlier" : "equal"}`}>
      <span>{differenceLabel}</span>
      {showRebuiltHint && (
        <button type="button" className="market-compare-hint" aria-label="Почему в Беларуси дешевле">
          <Info size={16} />
          <ActionTooltip text={REBUILT_HINT} tapToOpen />
        </button>
      )}
    </div>
  );
}

function MarketModelCard({ card, navigate, mileageOption, priceOption, quotaPricingOn }) {
  const years = card.years;
  const defaultYear = bestComparisonYear(card, mileageOption.key, priceOption.key, quotaPricingOn)?.year || null;
  const yearWasChosen = useRef(false);
  const [year, setYear] = useState(() => String(defaultYear?.year || "all"));
  useEffect(() => {
    if (!yearWasChosen.current) setYear(String(defaultYear?.year || "all"));
  }, [defaultYear?.year]);
  const selectedYear = years.find((item) => String(item.year) === year) || null;
  const rawPrices = selectedYear
    ? selectedYear.prices[mileageOption.key] || { ours:null, belarus:null }
    : aggregateComparisonPrices(years, mileageOption.key, quotaPricingOn);
  const prices = selectedYear
    ? { ...rawPrices, ours:comparisonOwnPrices(rawPrices.ours, quotaPricingOn) }
    : rawPrices;
  const ourPrice = prices.ours?.[priceOption.key];
  const belarusPrice = prices.belarus?.[priceOption.key];
  const hasComparison = hasEnoughComparisonSample(prices)
    && Number.isFinite(ourPrice)
    && Number.isFinite(belarusPrice)
    && belarusPrice > 0;
  const difference = hasComparison ? ((belarusPrice - ourPrice) / belarusPrice) * 100 : null;
  const hasBelarusData = years.some((item) => Object.values(item.prices).some((itemPrices) => Boolean(itemPrices.belarus?.count)));
  const differenceLabel = !hasBelarusData
    ? "Нет данных"
    : !hasComparison
    ? "Недостаточно данных"
    : Math.abs(difference) < 0.05
    ? "Цена одинаковая"
    : `${difference > 0 ? "Дешевле" : "Дороже"} на ${new Intl.NumberFormat("ru-RU", { maximumFractionDigits:1 }).format(Math.abs(difference))}%`;
  const showRebuiltHint = hasComparison && difference < -0.05 && hasRebuiltHint({
    brand:card.brand,
    model:card.model,
    year:selectedYear?.year ?? years[0]?.year,
    diff:difference,
  });
  const source = selectedYear?.image || card.image || null;
  const preview = imageSource(source, IMAGE_WIDTH_CARD);
  return (
    <article className="market-card">
      <div className="market-card-photo">
        {preview
          ? <img src={preview} alt={`${card.brand} ${card.model}`} loading="lazy" onError={(event) => retryWithFullImage(event, source)} />
          : <CarProfile size={44} weight="duotone" aria-hidden="true" />}
      </div>
      <div className="market-card-identity">
        <span className="market-card-brand">{card.brand}</span>
        <AppLink href={comparisonCatalogHref(card, selectedYear?.year)} navigate={navigate}>
          {card.model}
        </AppLink>
        {card.longVersion && <span className="market-card-version">Длиннобазная версия</span>}
        <SelectField
          className="market-card-year-select"
          label="Год выпуска"
          value={selectedYear ? String(selectedYear.year) : "Все года"}
          options={["Все года", ...years.map((item) => String(item.year))]}
          onChange={(value) => {
            yearWasChosen.current = true;
            setYear(value === "Все года" ? "all" : value);
          }}
        />
      </div>
      <div className="market-card-data">
        <section className="market-card-year-prices" aria-label={`${card.brand} ${card.model}, ${selectedYear ? `${selectedYear.year} год` : "все годы"}`}>
          <MarketStatRow label="В нашем каталоге" stats={prices.ours} priceOption={priceOption} />
          <MarketStatRow label="Продают в Беларуси" stats={prices.belarus} priceOption={priceOption} />
        </section>
        <MarketCardDifference differenceLabel={differenceLabel} difference={difference} hasComparison={hasComparison} showRebuiltHint={showRebuiltHint} />
      </div>
    </article>
  );
}

function MarketCompareCards({ cards, navigate, loading = false, quotaPricingOn = false }) {
  const currency = useCurrency();
  const narrow = useNarrowViewport();
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);
  const [brand, setBrand] = useState("Все марки");
  const [powertrain, setPowertrain] = useState(MARKET_POWERTRAIN_OPTIONS[0].label);
  const [mileage, setMileage] = useState("До 100 000 км");
  const [priceBasis, setPriceBasis] = useState("По медианной цене");
  const [priceFrom, setPriceFrom] = useState(null);
  const [priceTo, setPriceTo] = useState(null);
  const [priceRangeOpen, setPriceRangeOpen] = useState(false);
  const priceRangeRef = useRef(null);
  const [sortOrder, setSortOrder] = useState(MARKET_SORT_OPTIONS[0]);
  const [shown, setShown] = useState(MARKET_PAGE_SIZE);
  const mileageOption = MARKET_MILEAGE_OPTIONS.find((option) => option.label === mileage) || MARKET_MILEAGE_OPTIONS[2];
  const powertrainOption = MARKET_POWERTRAIN_OPTIONS.find((option) => option.label === powertrain) || MARKET_POWERTRAIN_OPTIONS[0];
  const priceOption = MARKET_PRICE_OPTIONS.find((option) => option.label === priceBasis) || MARKET_PRICE_OPTIONS[2];
  const brands = useMemo(() => ["Все марки", ...new Set(cards.map((card) => card.brand))].sort((left, right) => left === "Все марки" ? -1 : right === "Все марки" ? 1 : left.localeCompare(right, "ru")), [cards]);
  const priceFromOptions = useMemo(() => ["От", ...MARKET_PRICE_RANGE_VALUES.filter((value) => priceTo == null || value <= priceTo).map(String)], [priceTo]);
  const priceToOptions = useMemo(() => ["До", ...MARKET_PRICE_RANGE_VALUES.filter((value) => priceFrom == null || value >= priceFrom).map(String)], [priceFrom]);
  // В состоянии остаются исходные USD: смена валюты меняет только подписи,
  // не выбранные границы и не состав сравниваемых машин.
  const formatPriceBound = (value) => value === "От" || value === "До" ? value : money(Number(value), currency);
  const priceRangeLabel = priceFrom != null && priceTo != null
    ? `${money(priceFrom, currency)}–${money(priceTo, currency)}`
    : priceFrom != null
    ? `От ${money(priceFrom, currency)}`
    : priceTo != null
    ? `До ${money(priceTo, currency)}`
    : "Любая цена";
  useEffect(() => {
    if (!priceRangeOpen) return undefined;
    if (narrow) return undefined;
    const closeOutside = (event) => {
      if (!priceRangeRef.current?.contains(event.target)) setPriceRangeOpen(false);
    };
    const closeWithKeyboard = (event) => {
      if (event.key === "Escape") setPriceRangeOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [priceRangeOpen, narrow]);
  const visible = useMemo(() => {
    const brandCards = cards.filter((card) =>
      (brand === "Все марки" || card.brand === brand)
      && (powertrainOption.key === "all" || card.type === powertrainOption.key));
    const matching = marketCardsMatchingQuery(brandCards, query)
      .filter((card) => {
        if (priceFrom == null && priceTo == null) return true;
        const value = defaultMarketPrices(card, mileageOption.key, priceOption.key, quotaPricingOn)?.ours?.[priceOption.key];
        return Number.isFinite(value) && (priceFrom == null || value >= priceFrom) && (priceTo == null || value <= priceTo);
      });
    const uniqueModels = powertrainOption.key === "all" ? collapseSameModelCards(matching) : matching;
    return uniqueModels
      .sort((left, right) => {
        const leftDifference = marketDifference(left, mileageOption.key, priceOption.key, quotaPricingOn);
        const rightDifference = marketDifference(right, mileageOption.key, priceOption.key, quotaPricingOn);
        if (leftDifference == null) return rightDifference == null ? 0 : 1;
        if (rightDifference == null) return -1;
        const result = rightDifference - leftDifference;
        return sortOrder === MARKET_SORT_OPTIONS[0] ? result : -result;
      });
  }, [cards, query, brand, powertrainOption.key, mileageOption.key, priceOption.key, priceFrom, priceTo, quotaPricingOn, sortOrder]);
  useEffect(() => setShown(MARKET_PAGE_SIZE), [query, brand, powertrain, mileage, priceBasis, priceFrom, priceTo, sortOrder]);
  const page = visible.slice(0, shown);

  return (
    <div className="market-compare">
      <div className="market-compare-controls">
        <SearchField
          ref={searchRef}
          className="market-compare-search"
          value={query}
          onValueChange={setQuery}
          placeholder="Марка или модель"
          ariaLabel="Поиск по марке и модели"
        />
        <SelectField className="market-compare-sort" label="Сортировка" value={sortOrder} options={MARKET_SORT_OPTIONS} onChange={setSortOrder} mobileIcon={SortAscending} mobileActionSheet={narrow} />
      </div>
      <div className="market-compare-filter-row">
        <SelectField className="market-compare-brand" label="Марка" value={brand} options={brands} onChange={setBrand} icon={CarProfile} mobileActionSheet={narrow} />
        <SelectField className="market-compare-type" label="Тип двигателя" value={powertrain} options={MARKET_POWERTRAIN_OPTIONS.map((option) => option.label)} onChange={setPowertrain} icon={Engine} mobileActionSheet={narrow} />
        <SelectField className="market-compare-mileage" label="Пробег" value={mileage} options={MARKET_MILEAGE_OPTIONS.map((option) => option.label)} onChange={setMileage} icon={Gauge} mobileActionSheet={narrow} />
        <div ref={priceRangeRef} className={`market-compare-price-range${priceRangeOpen ? " open" : ""}${priceFrom != null || priceTo != null ? " has-selection" : ""}`}>
          <button
            type="button"
            className="market-compare-price-range-toggle"
            aria-expanded={priceRangeOpen}
            aria-controls="market-price-range-fields"
            onClick={() => setPriceRangeOpen((current) => !current)}
          >
            <CurrencyDollar size={20} weight="duotone" aria-hidden="true" />
            <span>{bynify(priceRangeLabel)}</span>
          </button>
          {priceRangeOpen && !narrow && (
            <div className="market-compare-price-range-fields" id="market-price-range-fields">
              <SelectField
                className="market-compare-price-bound"
                label="Цена от"
                value={priceFrom == null ? "От" : String(priceFrom)}
                options={priceFromOptions}
                formatOption={formatPriceBound}
                onChange={(value) => setPriceFrom(marketPriceRangeValue(value))}
              />
              <SelectField
                className="market-compare-price-bound"
                label="Цена до"
                value={priceTo == null ? "До" : String(priceTo)}
                options={priceToOptions}
                formatOption={formatPriceBound}
                onChange={(value) => setPriceTo(marketPriceRangeValue(value))}
              />
            </div>
          )}
        </div>
        <SelectField className="market-compare-price" label="Цена" value={priceBasis} options={MARKET_PRICE_OPTIONS.map((option) => option.label)} onChange={setPriceBasis} icon={Scales} mobileActionSheet={narrow} />
      </div>
      {priceRangeOpen && narrow && typeof document !== "undefined" && createPortal(
        <FilterSheet
          title="Диапазон цены"
          onClose={() => setPriceRangeOpen(false)}
          compact
          footer={<button type="button" className="primary" onClick={() => setPriceRangeOpen(false)}>Готово</button>}
        >
          <div className="mobile-filter-sheet-fields market-price-sheet-fields" id="market-price-range-fields">
            <SelectField
              className="market-compare-price-bound"
              label="Цена от"
              value={priceFrom == null ? "От" : String(priceFrom)}
              options={priceFromOptions}
              formatOption={formatPriceBound}
              onChange={(value) => setPriceFrom(marketPriceRangeValue(value))}
            />
            <SelectField
              className="market-compare-price-bound"
              label="Цена до"
              value={priceTo == null ? "До" : String(priceTo)}
              options={priceToOptions}
              formatOption={formatPriceBound}
              onChange={(value) => setPriceTo(marketPriceRangeValue(value))}
            />
          </div>
        </FilterSheet>,
        document.body,
      )}
      {loading && <MarketCompareSkeleton />}
      {!loading && visible.length === 0 && (
        <EmptyState
          className="market-compare-empty-state"
          description={priceFrom != null || priceTo != null
              ? "В выбранном диапазоне цен машин нет. Измените границы или выберите любую цену."
              : powertrainOption.key !== "all"
              ? `Машин типа «${powertrain}» с выбранными параметрами нет. Выберите другой тип или измените фильтры.`
              : brand === "Все марки"
              ? "Попробуйте другое написание модели или выберите марку из списка."
              : `По марке ${brand} с таким запросом ничего нет. Уберите слово из поиска или выберите другую марку.`}
        />
      )}
      {!loading && visible.length > 0 && <div className="market-card-list">{page.map((card) => <MarketModelCard key={card.key} card={card} navigate={navigate} mileageOption={mileageOption} priceOption={priceOption} quotaPricingOn={quotaPricingOn} />)}</div>}
      {!loading && visible.length > shown && (
        <button type="button" className="market-compare-more" onClick={() => setShown((current) => current + MARKET_PAGE_SIZE)}>
          Показать ещё {Math.min(MARKET_PAGE_SIZE, visible.length - shown)}
        </button>
      )}
    </div>
  );
}

/* Калькулятор реального запаса хода. Форма и вид результата те же, что у калькулятора
   растаможки: это соседние страницы одного списка, и своя механика у каждой сбивала бы
   с толку. Сам расчёт живёт в src/range-estimate.js — там же написано, откуда взяты
   поправки и почему это оценка, а не замер. */
function RangeCalculator() {
  // Расчёт из чужой ссылки. Читаем адрес один раз при первом появлении формы:
  // дальше поля живут своей жизнью, и подмешивать в них адрес на каждом шаге
  // значило бы отменять то, что человек только что выбрал.
  const shared = useMemo(() => rangeStateFromSearch(window.location.search), []);
  const byId = (list, id, fallback) => (list.find((item) => item.id === id) || fallback).name;
  const [rated, setRated] = useState(() => String(shared.rated ?? 500));
  const [cycle, setCycle] = useState(() => byId(RANGE_CYCLES, shared.cycle, RANGE_CYCLES[0]));
  const [celsius, setCelsius] = useState(() => String(shared.celsius ?? 20));
  const [mode, setMode] = useState(() => byId(RANGE_MODES, shared.mode, RANGE_MODES[1]));
  const [chemistry, setChemistry] = useState(() => byId(RANGE_CHEMISTRY, shared.chemistry, RANGE_CHEMISTRY[0]));
  // Спрашиваем год выпуска, а не возраст: год человек знает из объявления, а
  // «сколько машине лет» приходится считать в уме — и половина считает не так.
  // Возраст выводим сами, он же уходит в ссылку на расчёт.
  const years = calcYears();
  const [year, setYear] = useState(() => {
    const fromShare = shared.ageYears == null ? null : String(Number(years[0]) - shared.ageYears);
    return years.includes(fromShare) ? fromShare : years[0];
  });
  const ageYears = Math.max(0, Number(years[0]) - Number(year));
  const [heatPump, setHeatPump] = useState(() => Boolean(shared.heatPump));
  const [copied, setCopied] = useState(false);

  const cycleItem = RANGE_CYCLES.find((item) => item.name === cycle) || RANGE_CYCLES[0];
  const modeItem = RANGE_MODES.find((item) => item.name === mode) || RANGE_MODES[1];
  const chemistryItem = RANGE_CHEMISTRY.find((item) => item.name === chemistry) || RANGE_CHEMISTRY[0];
  const ratedKm = Math.max(0, Number(String(rated).replace(/\s/g, "")) || 0);
  const input = {
    rated: ratedKm,
    cycle: cycleItem.id,
    celsius: Number(celsius) || 0,
    mode: modeItem.id,
    chemistry: chemistryItem.id,
    ageYears,
    heatPump,
  };
  const result = realRange(input);
  const summer = realRange({ ...input, celsius: 20, mode: "mixed" });
  // Из готовой таблицы берём только сноску под расчётом: сама таблица «паспорт →
  // зима» с экрана убрана — она повторяла то, что человек только что посчитал сам.
  // В версии для поисковика таблица осталась: скриптов он не запускает и цифры
  // видит только готовыми.
  const table = rangeTable(input);

  // Ссылка ровно на этот расчёт. Её же держим в адресной строке: скопированное
  // из браузера должно совпадать с тем, что даёт кнопка. Заменяем адрес, а не
  // добавляем новый, — иначе кнопка «назад» перебирала бы каждую введённую цифру.
  const shareSearch = rangeShareSearch({
    rated: ratedKm,
    cycle: cycleItem.id,
    celsius: input.celsius,
    mode: modeItem.id,
    chemistry: chemistryItem.id,
    ageYears: input.ageYears,
    heatPump,
  });
  useEffect(() => {
    if (!window.history?.replaceState) return;
    // Ползунок и ввод цифр дают десятки записей в секунду — Safari после ~100 бросает
    // ошибку, без обёртки она роняла страницу (см. patchHistoryState).
    replaceHistoryEntry(window.history.state, `${window.location.pathname}${shareSearch ? `?${shareSearch}` : ""}`);
  }, [shareSearch]);
  const shareUrl = `${window.location.origin}${appHref("/range")}${shareSearch ? `?${shareSearch}` : ""}`;
  const copyShareLink = async () => {
    const done = await copyToClipboard(shareUrl);
    if (!done) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="tool-calc tool-calc-range">
      {/* Слева поля, справа ответ — как в калькуляторе растаможки: меняешь мороз или
          режим и тут же видишь, сколько останется, а не листаешь вниз. */}
      <div className="tool-calc-fields">
        {/* Погода — первой: от неё в ответе меняется больше, чем от всего остального
            вместе, и подбирают её чаще всего. Плашка залита радугой от мороза к жаре,
            цвет гаснет правее выбранного градуса, тянуть можно за любое место шкалы.
            Клавиатурой она работает так же — стрелками по одному градусу. */}
        {/* Доля шкалы, пройденная ползунком: по ней обрезается приглушённая половина.
            Считаем здесь, а не в стилях, — там текущего значения нет. */}
        <div className="tool-calc-field tool-calc-field-temp" style={{ "--temp-pct": (Math.min(40, Math.max(-40, Number(celsius) || 0)) + 40) / 80 }}>
          <span className="tool-calc-main">
            <span className="tool-calc-label" id="range-temp-label">Температура за окном</span>
            <span className="tool-calc-temp-value">{Number(celsius) > 0 ? `+${Number(celsius)}` : Number(celsius)} °C</span>
          </span>
          <input
            className="tool-calc-temp-range"
            type="range"
            min="-40"
            max="40"
            step="1"
            aria-labelledby="range-temp-label"
            value={Number(celsius) || 0}
            onChange={(event) => setCelsius(event.target.value)}
          />
        </div>
        {/* Паспортная цифра и цикл, по которому её мерили, — в одном ряду: порознь
            они занимали две строки, а вопрос это один. Каждое поле — плашка: подпись
            мелким сверху, значение крупным под ней, а справа за тонкой чертой
            единица измерения. */}
        <div className="tool-calc-row">
          <div className="tool-calc-field">
            <label className="tool-calc-main">
              <span className="tool-calc-label">Паспортный запас хода</span>
              <input className="tool-calc-input" type="number" inputMode="numeric" min="50" max="1500" step="10" aria-label="Паспортный запас хода, км" value={rated} onChange={(event) => setRated(event.target.value)} />
            </label>
            <span className="tool-calc-unit tool-calc-unit-text">км</span>
          </div>
          <div className="tool-calc-field tool-calc-field-select">
            <span className="tool-calc-label">Цикл</span>
            <SelectField className="tool-calc-select" label="Цикл измерения" value={cycle} options={RANGE_CYCLES.map((item) => item.name)} onChange={setCycle} />
          </div>
        </div>
        <div className="tool-calc-field tool-calc-field-select">
          <span className="tool-calc-label">Как ездите</span>
          <SelectField className="tool-calc-select" label="Режим движения" value={mode} options={RANGE_MODES.map((item) => item.name)} onChange={setMode} />
        </div>
        <div className="tool-calc-field tool-calc-field-select">
          <span className="tool-calc-label">Батарея</span>
          <SelectField className="tool-calc-select" label="Химия батареи" value={chemistry} options={RANGE_CHEMISTRY.map((item) => item.name)} onChange={setChemistry} />
        </div>
        <div className="tool-calc-field tool-calc-field-select">
          <span className="tool-calc-label">Год выпуска</span>
          <SelectField className="tool-calc-select" label="Год выпуска" value={year} options={years} onChange={setYear} />
        </div>
        <label className="quick-view-toggle tool-calc-toggle">
          <input type="checkbox" role="switch" checked={heatPump} onChange={(event) => setHeatPump(event.target.checked)} />
          <span className="quick-view-toggle-track" aria-hidden="true"><i /></span>
          <span className="quick-view-toggle-label">Есть тепловой насос</span>
        </label>
      </div>
      {ratedKm > 0 ? (
        <div className="tool-calc-result">
          {/* Ответ и разбор по причинам — одна плашка: сначала сколько проедет, под
              чертой из чего сложилась потеря. */}
          <div className="tool-calc-summary">
            <div className="tool-calc-total">
              <span>Проедет на самом деле</span>
              <span className="tool-calc-sum"><strong>{number(result.km)} км</strong></span>
              <small>
                Из паспортных {number(ratedKm)} км это {Math.round((result.km / ratedKm) * 100)}%. В тёплую погоду в смешанном режиме — около {number(summer.km)} км.
              </small>
            </div>
            <dl className="tool-calc-rows">
              <div>
                <dt>Цикл измерения</dt>
                <dd>−{Math.round((1 - result.parts.cycle) * 100)}%</dd>
              </div>
              <div>
                <dt>Погода</dt>
                <dd>{result.parts.temperature >= 1 ? "без потерь" : `−${Math.round((1 - result.parts.temperature) * 100)}%`}</dd>
              </div>
              <div>
                <dt>Скорость</dt>
                <dd>{result.parts.mode >= 1 ? `+${Math.round((result.parts.mode - 1) * 100)}%` : `−${Math.round((1 - result.parts.mode) * 100)}%`}</dd>
              </div>
              <div>
                <dt>Возраст батареи</dt>
                <dd>{result.parts.age >= 1 ? "без потерь" : `−${Math.round((1 - result.parts.age) * 100)}%`}</dd>
              </div>
            </dl>
            <button type="button" className={`primary tool-calc-share${copied ? " copied" : ""}`} onClick={copyShareLink}>
              <LinkSimple size={17} />
              <span>{copied ? "Ссылка скопирована" : "Поделиться расчётом"}</span>
            </button>
          </div>
          <p className="tool-calc-why">{table.note}</p>
        </div>
      ) : (
        <p className="tool-calc-empty">Укажите паспортный запас хода, чтобы увидеть расчёт.</p>
      )}
    </section>
  );
}

function BrandDirectoryCard({ item, count, models, modelPreviewLimit = 5, navigate }) {
  const path = brandLandingPath(item.brand);
  const visibleModels = models?.items?.slice(0, modelPreviewLimit) || [];
  // Резервируем максимальную ширину превью ещё до ответа /api/model-facts.
  // Последний слот оставляем под «+N», поэтому карточка не меняет высоту, когда
  // фотографии моделей появляются после первого кадра.
  const modelPreviewWidth = 44 + modelPreviewLimit * 34;
  const powertrains = BRAND_POWERTRAINS[item.brand] || [];
  const powertrainIcons = {
    "Бензин": GasPump,
    "Гибрид": ArrowsLeftRight,
    "Электро": Lightning,
  };
  const since = item.since ? `С ${item.since} года. ` : "";
  const inner = (
    <>
      <span className="brand-directory-head">
        <BrandMark brand={item.brand} />
        <b>{item.brand}</b>
        <span
          className={`brand-directory-models${models ? "" : " pending"}`}
          style={{ "--brand-directory-models-width": `${modelPreviewWidth}px` }}
          aria-label={models ? `Популярные модели ${item.brand}: ${visibleModels.map((model) => model.model).join(", ")}` : undefined}
          aria-hidden={models ? undefined : true}
        >
          {visibleModels.map((model) => {
            const modelPath = modelLandingPath(item.brand, model.model) || `${path}?model=${encodeURIComponent(model.model)}`;
            return (
              <AppLink className="brand-directory-model-photo brand-directory-model-link" href={modelPath} navigate={navigate} key={model.model} aria-label={`${item.brand} ${model.model}`}>
                {model.image
                  ? <img src={imageSource(model.image, 240)} alt="" loading="lazy" onError={(event) => retryWithFullImage(event, model.image)} />
                  : <CarProfile size={16} weight="duotone" aria-hidden="true" />}
                <ActionTooltip text={`${item.brand} ${model.model}`} />
              </AppLink>
            );
          })}
          {models?.total > visibleModels.length && (
            <AppLink className="brand-directory-model-photo brand-directory-model-more" href={path} navigate={navigate} aria-label={`Ещё ${models.total - visibleModels.length} моделей ${item.brand}`}>
              +{models.total - visibleModels.length}
              <ActionTooltip text={`Ещё ${models.total - visibleModels.length} моделей ${item.brand}`} />
            </AppLink>
          )}
        </span>
      </span>
      <p>{since}{item.about}</p>
      <span className="brand-directory-meta">
        <span className="brand-directory-count">
          {count > 0 ? `${number(count)} ${pluralRu(count, "машина", "машины", "машин")} в каталоге` : "Сейчас в каталоге нет"}
        </span>
        <span className="brand-directory-powertrains" aria-label={`Выпускает: ${powertrains.join(", ")}`}>
          {powertrains.map((powertrain) => {
            const Icon = powertrainIcons[powertrain];
            return <span key={powertrain}><Icon size={15} weight="duotone" aria-hidden="true" />{powertrain}</span>;
          })}
        </span>
      </span>
    </>
  );
  return (
    <div className="brand-directory-card">
      {path && <AppLink className="brand-directory-card-main-link" href={path} navigate={navigate} aria-label={`Все автомобили ${item.brand}`} />}
      {inner}
    </div>
  );
}

// ── Журнал: подборки на главной, общая страница и страница материала ──────────
//
// Подборка — это статья и живой список машин по правилу отбора (см. src/blog-posts.js).
// Список и цифры в тексте берутся из каталога в момент открытия страницы, поэтому
// страница не устаревает между выкладками сайта.
//
// Весь раздел закрыт выключателем BLOG_ENABLED: пока он выключен, блока на главной
// нет, ссылки в подвале нет, а адреса /blog и /blog/… отвечают «страницы нет».

// Сколько машин показываем на странице подборки.
const BLOG_POST_CARS_LIMIT = 12;

/** Текст материала: подгружается отдельным файлом, как тексты обзоров моделей. */
function useBlogText(slug) {
  const [text, setText] = useState(() => loadedBlogText(slug));
  useEffect(() => {
    const ready = loadedBlogText(slug);
    setText(ready);
    if (ready) return undefined;
    let alive = true;
    loadBlogText(slug)
      .then((loaded) => {
        if (alive) setText(loaded || { intro: ["Текст временно не загрузился. Обновите страницу, чтобы попробовать ещё раз."] });
      })
      .catch(() => {
        if (alive) setText({ intro: ["Текст временно не загрузился. Обновите страницу, чтобы попробовать ещё раз."] });
      });
    return () => {
      alive = false;
    };
  }, [slug]);
  return text;
}

/** Живой срез каталога по правилу отбора подборки. */
function useCollectionCars(post, { limit = BLOG_POST_CARS_LIMIT } = {}) {
  const query = post ? String(blogListParams(post, limit)) : null;
  // Список, встроенный в заранее собранную страницу: первый кадр рисуется из него,
  // свежий ответ приходит следом и заменяет список без заготовок на месте машин.
  const embedded = query ? embeddedApiValue(`/api/cars?${query}`) : undefined;
  const bootQuery = useRef(embedded ? query : null);
  const [cars, setCars] = useState(() => (embedded ? embedded.items.map(normalizeImportedCar) : []));
  const [total, setTotal] = useState(embedded ? embedded.total : null);
  // Не «последняя проверка» (`refreshedAt`), а настоящее изменение набора: проверка
  // идёт каждую ночь по всему каталогу и у всех наборов одинаковая.
  const [changedAt, setChangedAt] = useState(embedded?.changedAt || null);
  const [loading, setLoading] = useState(!embedded);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!query) return undefined;
    const controller = new AbortController();
    const fromBoot = bootQuery.current === query;
    bootQuery.current = null;
    if (!fromBoot) {
      setCars([]);
      setTotal(null);
      setChangedAt(null);
      setLoading(true);
      setFailed(false);
    }
    fetch(`/api/cars?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("collection unavailable"))))
      .then((catalog) => {
        setCars(catalog.items.map(normalizeImportedCar));
        setTotal(catalog.total);
        setChangedAt(catalog.changedAt || null);
      })
      .catch((error) => {
        // Встроенный список уже на экране — неудачное обновление его не прячет.
        if (error.name !== "AbortError" && !fromBoot) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);
  return { cars, total, changedAt, loading, failed };
}

/**
 * Края подборки: самая доступная машина и та, которой подборка хвалится, — самая
 * дальнобойная, самая быстрая или самая свежая. Из них берутся вторая и третья
 * цифры в полосе.
 *
 * Отдельными запросами, а не по показанному списку: список идёт «в разнобой», по одной
 * машине на модель, и края по нему посчитались бы по двенадцати случайным объявлениям.
 * Запросы крошечные — по одной строке, — и сервер отдаёт их из общего кэша.
 */
function useCollectionEdges(post) {
  const cheapestQuery = post ? String(blogApiParams(post, { sort: "price_asc", limit: 1 })) : null;
  const highlightSort = blogHighlightSort(post);
  // Берём пять машин, а не одну: у части объявлений главная цифра не заполнена
  // (пробег стоит нулём, разгон не указан), и первая строка выборки может её не иметь.
  const highlightQuery = highlightSort ? String(blogApiParams(post, { sort: highlightSort, limit: 5 })) : null;
  const edgesFrom = (cheapestCars, notableCars) => {
    const cheapest = cheapestCars[0] || null;
    // Первая машина, у которой главная цифра вообще есть.
    const notable = notableCars.find((car) => blogHighlight(post, car)) || null;
    return {
      priceFromUsd: cheapest ? estimateLandedCost(cheapest).totalUsd : null,
      highlight: blogHighlight(post, notable),
    };
  };
  // Края из заранее собранной страницы (src/boot-api.js) — для первого кадра.
  const embeddedCheapest = cheapestQuery ? embeddedApiValue(`/api/cars?${cheapestQuery}`) : undefined;
  const embeddedNotable = highlightQuery ? embeddedApiValue(`/api/cars?${highlightQuery}`) : { items: [] };
  const booted = Boolean(embeddedCheapest && embeddedNotable);
  const bootKey = useRef(booted ? `${cheapestQuery}|${highlightQuery}` : null);
  const [edges, setEdges] = useState(() =>
    booted ? edgesFrom(embeddedCheapest.items.map(normalizeImportedCar), embeddedNotable.items.map(normalizeImportedCar)) : { priceFromUsd: null, highlight: null },
  );
  useEffect(() => {
    if (!cheapestQuery) return undefined;
    const controller = new AbortController();
    const fromBoot = bootKey.current === `${cheapestQuery}|${highlightQuery}`;
    bootKey.current = null;
    if (!fromBoot) setEdges({ priceFromUsd: null, highlight: null });
    const load = (query) =>
      query
        ? fetch(`/api/cars?${query}`, { signal: controller.signal })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error("collection edge unavailable"))))
            .then((catalog) => catalog.items.map(normalizeImportedCar))
        : Promise.resolve([]);
    Promise.all([load(cheapestQuery), load(highlightQuery)])
      .then(([cheapestCars, notableCars]) => setEdges(edgesFrom(cheapestCars, notableCars)))
      .catch(() => {});
    return () => controller.abort();
  }, [cheapestQuery, highlightQuery]);
  return edges;
}

// ── Переход в журнал с выбранным разделом ─────────────────────────────────────
// Отдельных адресов у фильтров журнала нет намеренно (десяток почти пустых страниц
// поисковику вредит), поэтому выбранный раздел передаём не адресом, а одноразовым
// намерением: нажали «Подборки» в статье — журнал открылся уже с этим фильтром.
let blogFilterIntent = null;

const openBlogWithFilter = (navigate, filter) => {
  blogFilterIntent = filter;
  navigate(BLOG_INDEX.path);
};

/** Забирает намерение и сразу его гасит: оно действует на один переход. */
const takeBlogFilterIntent = () => {
  const filter = blogFilterIntent;
  blogFilterIntent = null;
  return filter;
};

/**
 * Переход по хлебным крошкам назад. Если на страницу пришли именно оттуда, куда ведёт
 * крошка, делаем шаг назад по истории: тогда прежняя страница открывается на том же
 * месте, где её оставили, — главная у блока подборок, журнал у той же карточки. Пришли
 * иначе (по ссылке из поиска, из мессенджера) — возвращаться некуда, обычный переход.
 */
const goBackTo = (navigate, path) => {
  if (window.history.length > 1 && window.history.state?.fromPath === path) navigate(-1);
  else navigate(path);
};

/**
 * Выбор страны прямо в заголовке каталога (решение Сергея 29.09.2026): в «Каталог авто
 * из Китая и Кореи» слова стран выделены и открывают обычный список сайта — «Китай и
 * Корея», «Китай», «Корея». Выбор ставит фильтр `country`, а дальше каталог сам уводит
 * на страницу страны (`/catalog/korea`), как делает с маркой. Текст заголовка для
 * поисковика не меняется: те же слова и пробелы, кнопка — часть фразы.
 */
const HEADING_FROM = /из(\s|\u00a0)(Китая|Кореи)((\s|\u00a0)и(\s|\u00a0)(Китая|Кореи))?/;

function HeadingCountryMenu({ tail, value = ANY_COUNTRY, onChange }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const menuRef = useRef(null);
  const anchorRef = useRef(null);
  const match = HEADING_FROM.exec(String(tail || ""));
  const selected = match ? countryKey(value) : null;
  // Слова в кнопке — по выбранной стране, а без выбора — обе, как в заголовке страницы.
  const words = selected ? originOf(selected).genitive : siteCountriesGenitive();
  // Заголовок центрируется и меняет ширину вместе с выбранной страной. Держим
  // открытый список у исходной точки, но не выпускаем его за края экрана.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const menu = menuRef.current;
    if (!open || !box || !menu) {
      anchorRef.current = null;
      return;
    }
    const positionMenu = () => {
      const rect = box.getBoundingClientRect();
      const x = rect.left + window.scrollX;
      const y = rect.top + window.scrollY;
      if (!anchorRef.current) anchorRef.current = { x, y };
      const inset = 12;
      const minX = window.scrollX + inset;
      const maxX = window.scrollX + document.documentElement.clientWidth - menu.offsetWidth - inset;
      const targetX = Math.max(minX, Math.min(anchorRef.current.x, maxX));
      menu.style.setProperty("--heading-menu-dx", `${Math.round(targetX - x)}px`);
      menu.style.setProperty("--heading-menu-dy", `${Math.round(anchorRef.current.y - y)}px`);
    };
    positionMenu();
    const onResize = () => {
      anchorRef.current = null;
      positionMenu();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, words]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === "Escape" || (event.type === "pointerdown" && !boxRef.current?.contains(event.target))) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!match) return <span>{tail}</span>;
  const prefix = tail.slice(0, match.index);
  const suffix = tail.slice(match.index + match[0].length);
  // Список — выбор одного пункта: «Все страны», Китай, Корея (Сергей, 29.09.2026
  // вечером; до этого были галочки, и нажатый Китай при выбранной Корее давал «все
  // страны» — выглядело как сброс фильтра). Остальные фильтры при выборе не трогаются.
  const options = [{ key: null, label: ANY_COUNTRY }, ...ACTIVE_ORIGINS.map((key) => ({ key, label: countryName(key) }))];
  const checked = (key) => (selected || null) === key;
  const choose = (key) => {
    const label = key ? countryName(key) : ANY_COUNTRY;
    setOpen(false);
    if (label !== (value || ANY_COUNTRY)) onChange?.(label);
  };
  return (
    <span>
      {prefix}из{match[1]}
      <span className={`heading-country${open ? " open" : ""}`} ref={boxRef}>
        <button type="button" className="heading-country-trigger" aria-haspopup="menu" aria-expanded={open} aria-label="Выбрать страну" onClick={() => setOpen((current) => !current)}>
          {words}
          {/* Своя стрелка: толще и короче, чем у значков сайта, с круглыми концами. */}
          <svg className="heading-country-caret" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div ref={menuRef} className="select-menu heading-country-menu" role="menu" aria-hidden={!open} inert={open ? undefined : true}>
          <div className="select-options">
            {options.map(({ key, label }) => (
              <button key={key || "all"} type="button" role="menuitemradio" aria-checked={checked(key)} className={checked(key) ? "selected" : ""} onClick={() => choose(key)}>
                {/* Без галочек (Сергей, 29.09.2026): выбранный пункт выделен подложкой, слева только слово. */}
                <span className="select-option-label"><span>{label}</span></span>
                {/* Флаг справа — из public/flags, чтобы не зависеть от эмодзи системы; у «Всех стран» — свой «флаг» с глобусом. */}
                <img className="heading-country-flag" src={`/flags/${key || "all"}.svg`} alt="" aria-hidden="true" width="24" height="16" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      </span>
      {suffix}
    </span>
  );
}

/**
 * Боковое меню журнала: два способа сузить выдачу — по типу машины и по разделу.
 * Разделы перечислены все, включая пустые: так видно, что в журнале будет дальше.
 * Пустой пункт не кликается — ссылка в никуда хуже честно серого пункта.
 *
 * На общей странице журнала пункты работают как фильтр (`onFilter`), на странице
 * материала — как ссылки в журнал. Отдельных адресов у фильтров нет намеренно:
 * десяток почти пустых страниц поисковику только вредит.
 */
// Значки страниц-расчётов. Держим их здесь, а не в описании страниц: `tool-pages.js`
// читает и сервер, а там разметки нет.
const TOOL_PAGE_ICONS = { "/ev-quota": Lightning, "/customs": Calculator, "/delivery-cost": RoadHorizon, "/china-brands": SquaresFour, "/range": BatteryHigh, "/price-belarus": Scales };

// Значки пунктов бокового меню — по слугу из `src/blog-posts.js`. Значки заведены и для
// разделов, которых пока нет: их пункты появятся вместе с первым материалом.
/** Сколько разделов видно до нажатия «Показать все разделы» (кроме «Все материалы»). */
const BLOG_SIDEBAR_SHORT_LIST = 3;

const BLOG_FILTER_ICONS = {
  all: List,
  electric: Lightning,
  hybrid: Engine,
  petrol: GasPump,
  collections: SquaresFour,
  comparisons: ArrowsLeftRight,
  articles: Article,
  news: Newspaper,
  law: Scales,
  tips: Lightbulb,
};

/**
 * Боковое меню журнала. Сверху один список выбора — как выпадающий список сайта:
 * «Все материалы», типы машин, разделы. Выбранный пункт подсвечен, пустые видны, но
 * не нажимаются: так заранее видно, что в журнале будет дальше, и при этом нет ссылок
 * в никуда. Отдельных адресов у фильтров нет намеренно — десяток почти пустых страниц
 * поисковику только вредит.
 *
 * Ниже — переходы к расчётам. Это не фильтры журнала, поэтому они вынесены отдельным
 * блоком и выглядят обычными кнопками со значками.
 */
function BlogSidebar({ navigate, filter = null, onFilter = null, currentPath = null }) {
  const [allSections, setAllSections] = useState(false);
  // Пустые разделы не показываем: пункт, за которым ничего нет, только сбивает.
  // Они появятся сами, как только в разделе выйдет первый материал.
  const items = blogSidebarItems().filter((item) => item.count > 0);
  const chosen = (item) => (filter ? filter.kind === item.kind && filter.slug === item.slug : item.kind === "all");
  // Сразу видны «Все материалы» и три самых больших раздела. Остальные — по нажатию:
  // десяток пунктов подряд читается как оглавление сайта и отодвигает сами материалы
  // вниз, а выбирают почти всегда из первых строк. Выбранный раздел показываем всегда,
  // даже если он не попал в тройку, — иначе отметка выбора пропадает из меню.
  const sections = items.filter((item) => item.kind !== "all");
  const biggest = [...sections].sort((a, b) => b.count - a.count).slice(0, BLOG_SIDEBAR_SHORT_LIST);
  const visible = allSections
    ? items
    : items.filter((item) => item.kind === "all" || biggest.includes(item) || chosen(item));
  const hidden = items.length - visible.length;
  // Где меню ведёт себя как обычная навигация: на главной журнала (её признак —
  // onFilter, разделы там переключаются на месте, в любом состоянии фильтра) и на
  // самих страницах расчётов (их признак — currentPath). Там расчёты и каталог
  // открываются в этой же вкладке и без стрелок: читать ещё нечего, терять нечего.
  // Со страницы материала — по-прежнему в новой вкладке, чтобы не потерять текст.
  const sameTab = Boolean(onFilter) || Boolean(currentPath);
  return (
    <aside className="blog-sidebar" aria-label="Разделы журнала">
      <nav className="blog-sidebar-filters">
        {visible
          .map((item) => {
            const Icon = BLOG_FILTER_ICONS[item.slug] || List;
            const inside = (
              <>
                <Icon size={18} />
                <span>{item.name}</span>
                <small>{item.count}</small>
              </>
            );
            return onFilter ? (
              <button
                type="button"
                key={item.slug}
                className={`blog-filter-item${chosen(item) ? " current" : ""}`}
                onClick={() => onFilter(item.kind === "all" ? null : item)}
              >
                {inside}
              </button>
            ) : (
              <AppLink
                className="blog-filter-item"
                key={item.slug}
                href={BLOG_INDEX.path}
                navigate={navigate}
                onClick={() => openBlogWithFilter(navigate, item.kind === "all" ? null : item)}
              >
                {inside}
              </AppLink>
            );
          })}
        {hidden > 0 || allSections ? (
          <button
            type="button"
            className="blog-filter-more"
            onClick={() => setAllSections((open) => !open)}
            aria-expanded={allSections}
          >
            <span>{allSections ? "Свернуть разделы" : "Показать все разделы"}</span>
            <CaretDown size={16} weight="bold" aria-hidden="true" />
          </button>
        ) : null}
      </nav>
      <nav className="blog-sidebar-tools">
        {TOOL_PAGES.map((tool) => {
          const Icon = TOOL_PAGE_ICONS[tool.path] || Calculator;
          return sameTab ? (
            <AppLink
              className={`blog-tool-button${currentPath === tool.path ? " current" : ""}`}
              key={tool.path}
              href={tool.path}
              navigate={navigate}
              aria-current={currentPath === tool.path ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{tool.name}</span>
            </AppLink>
          ) : (
            // Расчёты, как и каталог, открываются в новой вкладке: посетитель уходит
            // считать и возвращается к материалу, не теряя прочитанное. Поэтому это
            // обычные ссылки, а не переход внутри приложения.
            <a
              className={`blog-tool-button${currentPath === tool.path ? " current" : ""}`}
              key={tool.path}
              href={appHref(tool.path)}
              target="_blank"
              rel="noreferrer"
              aria-current={currentPath === tool.path ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{tool.name}</span>
              <ArrowRight size={16} weight="bold" />
            </a>
          );
        })}
        {/* Кнопки «Каталог авто из Китая» здесь больше нет (решение владельца
            06.09.2026): в статьях за этим теперь отвечает рекламная врезка в тексте,
            а две одинаковые жёлтые кнопки на одном экране спорили друг с другом. */}
      </nav>
    </aside>
  );
}

/**
 * Шапка журнала — строка «Журнал abcars.by» над содержимым. Стоит на всех страницах
 * раздела: на общей, в материале и на страницах расчётов, — чтобы переход внутри
 * журнала не выглядел уходом на другую часть сайта. На общей странице это заголовок
 * страницы, на остальных — ссылка обратно в журнал: свой заголовок там уже есть,
 * а двух главных заголовков на странице быть не должно.
 *
 * Внутри материала ссылкой стоит только слово «Журнал», а адрес сайта рядом — обычный
 * текст: подчёркнутая целиком строка «Журнал abcars.by» читается как ссылка на сайт,
 * а ведёт она в раздел. Строка при этом остаётся тем же блоком того же размера, что и
 * заголовок общей страницы, — иначе при переходе внутрь журнала содержимое прыгает.
 */
function BlogMasthead({ navigate, main = false }) {
  // Хвост строки («abcars.by») отделяется от названия раздела, чтобы имя раздела не
  // пришлось писать в шапке ещё раз: если h1 когда-нибудь перестанет начинаться со
  // слова «Журнал», ссылкой станет вся строка — как было раньше.
  const tail = BLOG_INDEX.h1.startsWith(BLOG_INDEX.name)
    ? BLOG_INDEX.h1.slice(BLOG_INDEX.name.length)
    : null;
  return (
    <div className={main ? "blog-masthead" : "blog-masthead blog-masthead-link"}>
      {main ? (
        <h1>{BLOG_INDEX.h1}</h1>
      ) : tail ? (
        <p>
          <AppLink href={BLOG_INDEX.path} navigate={navigate}>
            {BLOG_INDEX.name}
          </AppLink>
          {tail}
        </p>
      ) : (
        <AppLink href={BLOG_INDEX.path} navigate={navigate}>
          {BLOG_INDEX.h1}
        </AppLink>
      )}
    </div>
  );
}

/**
 * Общая страница журнала: материалы теми же карточками, что на главной, и меню
 * разделов сбоку. Ширина и раскладка — как у каталога: колонка выдачи и узкий столбец
 * справа, чтобы страницы сайта не расходились между собой.
 */
function BlogIndexPage({ navigate }) {
  const [filter, setFilter] = useState(takeBlogFilterIntent);
  const posts = blogPostsFor(filter);
  return (
    <main className="blog-page page-width">
      <Breadcrumbs>
        <CrumbLink href="/" onOpen={() => goBackTo(navigate, "/")}>Главная</CrumbLink>
        <CaretRight size={13} />
        {BLOG_INDEX.name}
      </Breadcrumbs>
      <BlogMasthead navigate={navigate} main />
      <div className="blog-layout">
        <div className="blog-main">
          <div className="blog-card-grid blog-card-grid-index">
            {posts.map((post) => (
              <BlogCollectionCard key={post.slug} post={post} navigate={navigate} />
            ))}
          </div>
        </div>
        <BlogSidebar navigate={navigate} filter={filter} onFilter={setFilter} />
      </div>
    </main>
  );
}

/**
 * Одна карточка списка: номер на снимке, слева фото, справа только самое нужное —
 * название, главная цифра подборки, цена под ключ и короткая причина, почему машина
 * в списке. Полный набор характеристик здесь лишний: карточка должна читаться
 * одним взглядом, а подробности есть в самом объявлении.
 */
function BlogTopCard({ car, rank = null, post = null, list = [], navigate, onOpen, reason: ownReason }) {
  const currency = useCurrency();
  const source = car.images?.[0] || car.image || null;
  const image = imageSource(source, IMAGE_WIDTH_CARD);
  const title = car.title || carTitle(car.brand, car.model, car.year);
  const figure = blogCarFigure(car, post);
  // В подборке причина считается по самому списку, а в сравнении карточки одной модели
  // стоят рядом, и «самая доступная в подборке» звучало бы странно — там строку
  // передают готовой.
  const reason = ownReason !== undefined ? ownReason : blogCarReason(car, list, post, (item) => (item ? estimateLandedCost(item).totalUsd : null));
  return (
    <AppLink
      className="blog-top-card"
      href={carHref(car)}
      navigate={navigate}
      onClick={(event) => {
        if (onOpen?.(car)) event.preventDefault();
      }}
    >
      <span className="blog-top-photo">
        {image ? <img src={image} alt={title} loading="lazy" onError={(event) => retryWithFullImage(event, source)} /> : null}
        {/* Номер только там, где список — это место в топе. В сравнении машины одной
            модели не ранжируются, и цифра на снимке вводила бы в заблуждение. */}
        {rank ? <span className="blog-top-rank">{rank}</span> : null}
      </span>
      {/* Порядок один для всех подборок: название, цена, почему машина в списке и внизу
          главная цифра — то, по чему подборка вообще собрана. Цифра акцентного цвета:
          на ней взгляд и должен остановиться, когда карточки листают одну за другой. */}
      <span className="blog-top-body">
        {/* Название и цена — одной строкой: слева машина, справа сколько она стоит
            под ключ. Оба одинакового размера, чтобы взгляд не выбирал между ними. */}
        <span className="blog-top-head">
          <strong>{title}</strong>
          {/* «Под ключ в Минске» ушло в подсказку у значка: в карточке эта строчка
              повторялась десять раз и занимала место, а объяснение нужно один раз. */}
          <span className="blog-top-price">
            <ApproxSign /> {bynify(money(estimateLandedCost(car).totalUsd, currency))}
            <span className="price-info" tabIndex={0} aria-label="Из чего складывается цена">
              <Info size={16} />
              <ActionTooltip text="Итог в Минске: выкуп машины, доставка, таможня и оформление. Предварительный расчёт по открытым тарифам." />
            </span>
          </span>
        </span>
        {reason ? <span className="blog-top-reason">{reason}</span> : null}
        {figure ? (
          <span className="blog-top-figure">
            <i>{figure.label}</i>
            <b>{withApprox(figure.value)}</b>
          </span>
        ) : null}
      </span>
    </AppLink>
  );
}

/**
 * Шапка сравнения: две настоящие машины из каталога друг против друга. Не рисунок и не
 * фотобанк — снимки живые, поэтому кадр меняется, когда объявление продают.
 */
function BlogDuelHero({ data, navigate, onOpen }) {
  const currency = useCurrency();
  if (!data.some((entry) => entry.hero)) return null;
  return (
    <div className="blog-duel-hero">
      {data.map((entry) => {
        const car = entry.hero;
        const source = car?.images?.[0] || car?.image || null;
        const image = imageSource(source, IMAGE_WIDTH_CARD);
        const open = (event) => {
          if (car && onOpen?.(car)) event.preventDefault();
        };
        return (
          <figure key={entry.side.name}>
            <AppLink href={car ? carHref(car) : entry.side.review} navigate={navigate} onClick={open} aria-label={entry.side.name}>
              {image ? <img src={image} srcSet={imageSourceSet(source, IMAGE_WIDTH_CARD)} alt={entry.side.name} loading="eager" onError={(event) => retryWithFullImage(event, source)} /> : null}
            </AppLink>
            <figcaption>
              <strong>{entry.side.name}</strong>
              <span>{entry.priceFromUsd ? `от ${money(entry.priceFromUsd, currency)} под ключ` : "цена считается"}</span>
            </figcaption>
          </figure>
        );
      })}
      {/* Значок между кадрами — единственное украшение на странице: он сразу говорит,
          что это сравнение, а не подборка из двух машин. */}
      <span className="blog-duel-versus" aria-hidden="true">vs</span>
    </div>
  );
}

/**
 * Таблица различий. Всё в ней считается из каталога: наличие, цена самой доступной
 * машины и лучшие цифры версий, которые сейчас есть. Подсвечено только настоящее
 * преимущество — при равных значениях не подсвечивается ничего.
 */
function BlogDuelTable({ post, data, navigate }) {
  const currency = useCurrency();
  const rows = blogDuelRows(data);
  // Вторая половина таблицы — паспорт модели: то, чего в каталоге нет и что от
  // объявлений не зависит. Она написана в самом материале, поэтому и оговорка под
  // таблицей своя: цифры каталога считаются сейчас, паспортные взяты у производителя.
  // Таблица одна и без перегородок: посетитель сравнивает две машины, а не изучает,
  // какая цифра откуда взялась. Что считается из каталога, а что паспортное, сказано
  // одной строкой под таблицей.
  const lines = [...rows, ...blogDuelSpecRows(blogPostSides(post))];
  if (!lines.length) return null;
  const cell = (value) => (value ? (value.money != null ? `≈ ${money(value.money, currency)}` : value.text) : "—");
  const line = (row) => (
    <tr key={row.key}>
      <th scope="row">{row.label}</th>
      {row.values.map((value, index) => {
        const side = data[index]?.side;
        // Наличие — единственная строка, из которой есть куда пойти: число машин ведёт
        // в каталог, отобранный по этой модели.
        const target = row.key === "total" && value && side ? blogCatalogHref({ filters: side.filters }) : null;
        return (
          <td key={side?.name || index} className={row.best === index ? "best" : undefined}>
            {/* Обычная ссылка в новую вкладку, а не переход внутри приложения: человек
                уходит смотреть каталог, но статья остаётся открытой — так же сделаны
                кнопки расчётов в боковом меню журнала. */}
            {target ? (
              <a href={appHref(target)} target="_blank" rel="noreferrer">{withApprox(cell(value))}</a>
            ) : (
              withApprox(cell(value))
            )}
          </td>
        );
      })}
    </tr>
  );
  return (
    <section className="blog-duel-table" aria-labelledby="blog-duel-title">
      {/* Заголовок стоит внутри таблицы, в пустой клетке над названиями строк: так он
          оказывается на одной строке с названиями моделей, а над таблицей не висит
          лишний ярус. */}
      <div className="blog-duel-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">
                <h2 id="blog-duel-title">В цифрах</h2>
              </th>
              {data.map((entry) => (
                <th key={entry.side.name} scope="col">
                  <a href={appHref(entry.side.review)} target="_blank" rel="noreferrer">{entry.side.name}</a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{lines.map(line)}</tbody>
        </table>
      </div>
      {/* Подписей под названиями строк нет — вместо десятка мелких пояснений одна
          строка под таблицей: откуда цифры и что стоит за ценой. */}
      <p className="blog-duel-source">Наличие, цена и характеристики версий считаются из каталога в момент открытия страницы: цена — самая доступная машина под ключ в Минске, остальное — лучшее, что есть сейчас. Габариты, багажник и гарантия — паспортные данные производителей.</p>
    </section>
  );
}

/**
 * Живые машины одной модели: пять самых доступных строками каталога — теми же, что
 * в списке на главной и в каталоге. Своя вёрстка списка тут не нужна: в сравнении
 * машины не соревнуются между собой, как в подборке, а показывают, что есть в наличии
 * и с какой суммы модель начинается.
 */
function BlogDuelSideCars({ entry, navigate, favorites, toggleFavorite, onOpen }) {
  const cars = entry.cars.slice(0, 5);
  if (!cars.length) return null;
  const catalogTarget = blogCatalogHref({ filters: entry.side.filters });
  return (
    <section className="blog-duel-cars">
      <h3>{entry.side.name} в наличии</h3>
      <div className="car-list">
        {cars.map((car) => (
          <CarRow
            key={car.id}
            car={car}
            navigate={navigate}
            favorite={favorites?.has(car.id)}
            toggleFavorite={toggleFavorite}
            // Быстрый просмотр там, где он включён и помещается; иначе обычный переход
            // на страницу машины — как в каталоге и на главной.
            onOpen={(item) => {
              if (onOpen?.(item)) return;
              navigate(carHref(item));
            }}
          />
        ))}
      </div>
      <AppLink className="blog-top-more" href={catalogTarget} navigate={navigate}>
        {entry.total ? `Все ${number(entry.total)} в каталоге` : "Смотреть в каталоге"} <ArrowRight size={17} />
      </AppLink>
    </section>
  );
}

/** Сам список с заголовком и переходом в каталог. */
function BlogTopList({ post, cars, total, changedAt, navigate, onOpen }) {
  if (!cars.length) return null;
  const catalogTarget = blogCatalogHref(post);
  // Когда набор машин последний раз правда менялся — цена, пробег, фотографии или
  // новая машина в подборке. Не «последняя проверка каталога»: она у всех наборов
  // одинаковая и обещает свежесть, которой может и не быть.
  const freshness = blogFreshnessLabel(changedAt);
  return (
    <section className="blog-top" aria-labelledby="blog-top-title">
      {/* Список живой: он собирается из каталога при каждом открытии страницы.
          Мелкой строкой над заголовком говорим об этом прямо — иначе подборку
          читают как написанную однажды и с тех пор устаревшую. */}
      <p className="blog-top-note">Обновляем топ автоматически из нашего каталога{freshness ? `. Наличие и цены обновлены ${freshness}` : ""}</p>
      <h2 id="blog-top-title">{post.name}</h2>
      <div className="blog-top-list">
        {cars.map((car, index) => (
          <BlogTopCard key={car.id} car={car} rank={index + 1} post={post} list={cars} navigate={navigate} onOpen={onOpen} />
        ))}
      </div>
      <AppLink className="blog-top-more" href={catalogTarget} navigate={navigate}>
        {total ? `Все ${number(total)} в каталоге` : "Смотреть в каталоге"} <ArrowRight size={17} />
      </AppLink>
    </section>
  );
}

// Рекламная врезка внутри материала журнала: одна строка про каталог и кнопка.
// Стоит в разрыве после первого абзаца вступления, то есть сразу под открывающей
// картинкой: читатель уже понял, о чём материал, но ещё не ушёл в текст с головой.
// Оформлена не как абзац статьи, а как плашка на своей подложке и рубленым шрифтом,
// чтобы её не приняли за продолжение текста.
function ArticleCatalog({ navigate }) {
  const { total, updatedAt } = useCatalogFacts();
  const box = useRef(null);
  // Показом считаем не появление врезки в статье, а то, что её довели до экрана:
  // статью читают сверху вниз, и до врезки доходят не все. Иначе показов было бы
  // ровно столько же, сколько открытых статей, и отношение нажатий к показам
  // ничего не говорило бы о самой врезке. Считаем один раз за открытую страницу.
  useEffect(() => {
    const node = box.current;
    if (!node || typeof IntersectionObserver !== "function") return undefined;
    const watcher = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watcher.disconnect();
      trackEvent("article_promo_shown");
    }, { threshold: 0.5 });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);
  // Число в кнопке — живое: сколько машин в каталоге, столько и обещаем. Округляем
  // вниз до тысяч: точная цифра меняется каждую ночь и выглядит как счётчик, а
  // круглая читается как размер каталога. Пока каталог не ответил (первое рисование
  // и версия для поисковика), в кнопке просто «Каталог» — врать числом нельзя, а
  // прятать кнопку тем более.
  const listings = total >= 1000 ? number(Math.floor(total / 1000) * 1000) : null;
  // Дата последней актуализации — та же, что на главной, и теми же словами. Строка
  // мелкая и серая: это не обещание, а доказательство, что цифра рядом свежая.
  const updated = updatedAt ? catalogUpdatedDate(updatedAt) : "";
  return (
    <aside className="article-catalog" ref={box}>
      <p className="article-catalog-copy">
        {/* Название пишем логотипом. Для читалок с экрана рядом лежит то же слово
            текстом: сами картинки логотипа спрятаны от них. */}
        <span className="wordmark article-catalog-logo">
          <SiteLogo />
          <span className="visually-hidden">abcars.by</span>
        </span>
        <span> — это маркетплейс б/у авто {siteFromPhrase()}</span>
      </p>
      <div className="article-catalog-action">
        <AppLink className="primary article-catalog-button" href="/catalog" navigate={navigate} onClick={() => trackEvent("article_promo_click")}>
          {listings ? `${listings} объявлений` : "Каталог"} <ArrowRight size={18} />
        </AppLink>
        {updated ? <span className="article-catalog-updated">Каталог обновлён {updated}</span> : null}
      </div>
    </aside>
  );
}

// Вступление материала: абзацы до первого раздела и рекламная врезка после первого
// из них. Общее для всех видов материалов — статьи, подборки, сравнения и отчёта.
function BlogIntro({ paragraphs, navigate }) {
  const list = paragraphs || [];
  return (
    <div className="model-page-intro">
      {list.map((paragraph, index) => (
        <Fragment key={paragraph}>
          <p>{renderInlineText(paragraph, navigate)}</p>
          {index === 0 ? <ArticleCatalog navigate={navigate} /> : null}
        </Fragment>
      ))}
      {/* Материал без текста вступления рекламу всё равно показывает: врезка
          привязана к месту в статье, а не к наличию абзаца. */}
      {list.length === 0 ? <ArticleCatalog navigate={navigate} /> : null}
    </div>
  );
}

/** Открывающий кадр статьи: своя картинка вместо машины из каталога. */
function BlogCoverFigure({ cover }) {
  if (!cover?.src) return null;
  return (
    <figure className="blog-figure blog-figure-own">
      <BlogCoverImage cover={cover} place="hero" eager />
    </figure>
  );
}

function BlogFigure({ car, index, navigate, onOpen = null, eager = false }) {
  const currency = useCurrency();
  const gallery = car.images?.length ? car.images : [car.image].filter(Boolean);
  // У соседних снимков берём разные кадры: иначе три фотографии подряд оказываются
  // одинаковыми «три четверти спереди».
  const source = gallery[Math.min(index, gallery.length - 1)] || null;
  const image = imageSource(source, IMAGE_WIDTH_ARTICLE);
  if (!image) return null;
  const title = car.title || carTitle(car.brand, car.model, car.year);
  // Нажатие раскрывает быстрый просмотр — как в каталоге и на главной. Если посетитель
  // сам выключил его переключателем или экран узкий, `onOpen` вернёт неправду и ссылка
  // сработает обычным образом, открыв полную страницу машины.
  const open = (event) => {
    if (onOpen?.(car)) event.preventDefault();
  };
  return (
    <figure className="blog-figure">
      <AppLink href={carHref(car)} navigate={navigate} onClick={open} aria-label={`Открыть объявление: ${title}`}>
        <img src={image} srcSet={imageSourceSet(source, IMAGE_WIDTH_ARTICLE)} alt={`${title} — автомобиль ${fromPhrase(carOrigin(car))} в наличии`} loading={eager ? "eager" : "lazy"} onError={(event) => retryWithFullImage(event, source)} />
      </AppLink>
      <figcaption>
        <AppLink href={carHref(car)} navigate={navigate} onClick={open}>{title}</AppLink>
        <span>
          {car.mileage ? `${number(car.mileage)} км · ` : ""}<ApproxSign /> {bynify(money(estimateLandedCost(car).totalUsd, currency))} под ключ в Минске
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Похожие материалы под статьёй — теми же карточками, что в журнале и на главной.
 * Три в ряд: колонка статьи ровно три колонки сетки, поэтому карточки здесь той же
 * ширины, что везде.
 */
function BlogRelated({ post, navigate }) {
  const related = blogRelatedPosts(post);
  if (!related.length) return null;
  return (
    <section className="blog-related" aria-labelledby="blog-related-title">
      <h2 id="blog-related-title">Похожие статьи</h2>
      <div className="blog-card-grid blog-card-grid-index">
        {related.map((item) => (
          <BlogCollectionCard key={item.slug} post={item} navigate={navigate} />
        ))}
      </div>
    </section>
  );
}

/**
 * Общая обвязка страницы материала: крошки, шапка со строкой «раздел · дата», подложка
 * статьи, кнопка «поделиться», похожие материалы и меню сбоку. Внутрь ставится тело
 * материала — у подборки и у сравнения оно разное, а рамка одна.
 */
function BlogArticleShell({ post, navigate, quickViewModal, children }) {
  // Дата — день выпуска материала. Свежесть наличия и цен пишется отдельной подписью
  // над списком машин: она про каталог, а не про статью.
  const date = blogPostDateSentence(post);
  return (
    <main className="blog-page page-width">
      <Breadcrumbs>
        <CrumbLink href="/" onOpen={() => goBackTo(navigate, "/")}>Главная</CrumbLink>
        <CaretRight size={13} />
        <CrumbLink href={BLOG_INDEX.path} onOpen={() => goBackTo(navigate, BLOG_INDEX.path)}>{BLOG_INDEX.name}</CrumbLink>
        <CaretRight size={13} />
        {post.name}
      </Breadcrumbs>
      <BlogMasthead navigate={navigate} />
      <div className="blog-layout">
        {/* В колонке сетки два блока: сама статья на своей подложке — так же, как обзор
            модели, — и под ней похожие материалы. */}
        <div className="blog-main">
          <article className="blog-article">
            {/* Та же кнопка «поделиться», что на карточках, — в правом верхнем углу
                подложки. Список раскрывается вниз: наверху страницы вверх ему некуда. */}
            <div className="blog-article-share">
              <BlogShareMenu post={post} direction="down" />
            </div>
            <header className="blog-head">
              {/* Строка над заголовком: раздел и дата через точку. Слова «опубликовано»
                  нет — дата и так читается как дата, а лишнее слово только удлиняет
                  строку перед заголовком. */}
              <span className="blog-article-meta">
                {/* Раздел — ссылка в журнал: из статьи логично вернуться к списку
                    материалов, а не только к главной. Вид тот же, что был у подписи. */}
                <AppLink
                  href={BLOG_INDEX.path}
                  navigate={navigate}
                  onClick={() => openBlogWithFilter(navigate, post.rubric ? { kind: "rubric", slug: post.rubric, name: post.rubricName } : null)}
                >
                  {post.rubricName || BLOG_INDEX.name}
                </AppLink>
                {date ? <span>{date}</span> : null}
              </span>
              <h1>{post.h1}</h1>
              <p>{post.lead}</p>
            </header>
            {children}
          </article>
          <BlogRelated post={post} navigate={navigate} />
        </div>
        <BlogSidebar navigate={navigate} />
      </div>
      {quickViewModal}
    </main>
  );
}

/** Страница материала: у подборки и у сравнения общая рамка и разное тело. */
function BlogPostPage({ post, navigate, favorites, toggleFavorite }) {
  if (post.kind === "article") return <BlogArticlePage post={post} navigate={navigate} favorites={favorites} toggleFavorite={toggleFavorite} />;
  if (post.kind === "report") return <BlogReportPage post={post} navigate={navigate} />;
  return post.kind === "duel"
    ? <BlogDuelPage post={post} navigate={navigate} favorites={favorites} toggleFavorite={toggleFavorite} />
    : <BlogCollectionPage post={post} navigate={navigate} favorites={favorites} toggleFavorite={toggleFavorite} />;
}

/**
 * Отчёт по рынку: цифры вместо списка машин. Порядок блоков — от общего к частному:
 * сначала индекс с графиком (за ним и приходят), потом движение по моделям, потом
 * квота, наличие и новинки, и только в конце текст о том, как всё это считается.
 *
 * Пока это образец с условными цифрами: настоящий отчёт считается из недельных
 * снимков цен, а их пока меньше двух. Материал помечен черновиком, поэтому в списке
 * журнала его нет, и наверху страницы стоит предупреждение.
 */
function BlogReportPage({ post, navigate }) {
  const text = useBlogText(post.slug);
  const report = SAMPLE_REPORT;
  const chart = useMemo(() => indexChartSvg(report.index.points), [report]);
  const modelHref = (row) => blogCatalogHref({ filters: { brand: row.brand, model: row.model } });
  const movers = (rows, tone) => (
    <div className="report-movers">
      {rows.map((row) => (
        <AppLink key={`${row.brand}-${row.model}-${row.year}`} className="report-mover" href={modelHref(row)} navigate={navigate}>
          <span className="report-mover-name">{row.brand} {row.model}{row.year ? ` ${row.year}` : ""}</span>
          <span className="report-mover-price">{number(row.nowUsd)} $</span>
          <span className={`report-mover-change ${tone}`}>{percent(row.changePct)}</span>
          <span className="report-mover-count">{number(row.listings)} в наличии</span>
        </AppLink>
      ))}
    </div>
  );
  return (
    <BlogArticleShell post={post} navigate={navigate}>
      {report.sample && (
        <p className="report-sample-note">
          Образец. Цифры в этом отчёте условные — он показывает, как материал выглядит. Настоящий отчёт выйдет, когда накопятся недельные срезы цен.
        </p>
      )}
      <BlogIntro paragraphs={text?.intro} navigate={navigate} />

      <section className="report-block">
        <p className="report-week">Неделя {report.weekLabel}</p>
        <div className="report-headline">
          <strong className={report.index.changePct < 0 ? "down" : "up"}>{percent(report.index.changePct)}</strong>
          <span>цена под ключ по постоянной корзине из {number(report.index.baskets)} наборов «модель и год»</span>
        </div>
        {/* График рисуется одним и тем же кодом для приложения и для версии страницы,
            которую видит поисковик: иначе они однажды разойдутся. */}
        <div className="report-chart-frame" dangerouslySetInnerHTML={{ __html: chart }} />
        <p className="report-caption">За сто принят уровень первой недели наблюдений. В корзине {number(report.index.listings)} объявлений.</p>
      </section>

      <section className="report-block">
        <h2>Подешевело за неделю</h2>
        {movers(report.cheaper, "down")}
        <h2>Подорожало за неделю</h2>
        {movers(report.dearer, "up")}
        <p className="report-caption">Сравниваются одинаковые наборы: та же модель того же года. Уход дорогой машины с продажи ценой модели не считается.</p>
      </section>

      <section className="report-block">
        <h2>Квота, наличие и курс</h2>
        <div className="model-page-numbers">
          <div><strong>{number(report.quota.left)}</strong><span>осталось от квоты на беспошлинный ввоз электромобилей</span></div>
          <div><strong>{report.quota.weeksLeft} нед.</strong><span>при нынешнем темпе {number(report.quota.perWeek)} машин в неделю</span></div>
          <div><strong>{number(report.stock.total)}</strong><span>машин в каталоге, из них {number(report.stock.week)} появились за неделю</span></div>
          <div><strong>{String(report.rate.usdByn).replace(".", ",")}</strong><span>курс доллара НБРБ на {report.rate.dateLabel}, {percent(report.rate.changePct)} за неделю</span></div>
        </div>
      </section>

      <section className="report-block">
        <h2>Впервые в каталоге</h2>
        <div className="report-movers">
          {report.newcomers.map((row) => (
            <AppLink key={`${row.brand}-${row.model}`} className="report-mover" href={modelHref(row)} navigate={navigate}>
              <span className="report-mover-name">{row.brand} {row.model}</span>
              <span className="report-mover-price">от {number(row.fromUsd)} $</span>
              <span className="report-mover-change" />
              <span className="report-mover-count">{number(row.listings)} в наличии</span>
            </AppLink>
          ))}
        </div>
      </section>

      <div className="model-page-article">
        {(text?.sections || []).map((section) => (
          <ModelPageSection key={section.title} section={section} navigate={navigate} />
        ))}
      </div>
      <ArticleFaq faq={text?.faq} title="Частые вопросы" navigate={navigate} />
      <ArticleSources sources={text?.sources} />
      {text?.disclaimer ? <p className="blog-disclaimer">{text.disclaimer}</p> : null}
    </BlogArticleShell>
  );
}

/**
 * Статья: связный текст с фотографиями, без списка машин.
 *
 * Четвёртый вид материала журнала. Отвечает на «объясни» и «помоги решить» — запросы,
 * которых не закрывают ни разделы каталога (они показывают машины), ни обзоры моделей
 * (они описывают одну модель). Разделы статьи те же, что в обзорах, плюс три блока,
 * которых там не было: нумерованные шаги, таблица и свой график.
 *
 * Фотографии стоят между разделами — сплошной текст, пусть и с врезками, читать
 * тяжело; кадры настоящие, из каталога, и кликаются в объявление.
 */
function BlogArticlePage({ post, navigate, favorites, toggleFavorite }) {
  const text = useBlogText(post.slug);
  const photos = useArticlePhotos(post);
  const { openQuickView, quickViewModal } = useVehicleQuickView({ apiMode: true, favorites, toggleFavorite, navigate });
  const sections = text?.sections || [];
  return (
    <BlogArticleShell post={post} navigate={navigate} quickViewModal={quickViewModal}>
      {post.cover?.src ? (
        <BlogCoverFigure cover={post.cover} />
      ) : photos[0] ? (
        <BlogFigure car={photos[0]} index={0} navigate={navigate} onOpen={openQuickView} eager />
      ) : null}
      <BlogIntro paragraphs={text?.intro} navigate={navigate} />
      <div className="model-page-article">
        {sections.map((section, index) => {
          // Кадр после раздела, но не после последнего: за ним идут вопросы,
          // и фотография между текстом и вопросами читается как обрыв.
          const car = index < sections.length - 1 ? photos[index + 1] : null;
          return (
            <Fragment key={section.title}>
              <ModelPageSection section={section} navigate={navigate} />
              {car ? <BlogFigure car={car} index={index + 1} navigate={navigate} onOpen={openQuickView} /> : null}
            </Fragment>
          );
        })}
      </div>
      <ArticleFaq faq={text?.faq} title="Частые вопросы" navigate={navigate} />
      <ArticleSources sources={text?.sources} />
      {text?.disclaimer ? <p className="blog-disclaimer">{text.disclaimer}</p> : null}
    </BlogArticleShell>
  );
}

/** Подборка: статья, полоса цифр и живой список машин по правилу отбора. */
function BlogCollectionPage({ post, navigate, favorites, toggleFavorite }) {
  const text = useBlogText(post.slug);
  // Один запрос на всю статью: из него и список машин, и снимки между разделами.
  // Берём с запасом — из шестидесяти машин набирается десяток разных марок; подборка,
  // где половина машин одной марки, подборкой не выглядит.
  const carsState = useCollectionCars(post, { limit: BLOG_TOP_POOL });
  const edges = useCollectionEdges(post);
  // Открывающий кадр — тот же, что на карточке материала: человек нажал на карточку
  // и видит наверху статьи ту же машину, а не другую.
  const { car: coverCar } = useCollectionCover(post);
  const topCars = blogTopCars(carsState.cars, post);
  const { openQuickView, quickViewModal } = useVehicleQuickView({ apiMode: true, favorites, toggleFavorite, navigate });
  // Цифры в тексте — из каталога: сколько машин подходит, от какой суммы и какой
  // запас хода у самой дальнобойной. Чего каталог не отдал, того в полосе нет.
  const stats = blogPostStats({ total: carsState.total, ...edges });
  return (
    <BlogArticleShell post={post} navigate={navigate} quickViewModal={quickViewModal}>
      {/* Открывающая фотография — сразу после описания, до текста: статья без
          картинки на первом экране читается как стена. */}
      {post.cover?.src ? (
        <BlogCoverFigure cover={post.cover} />
      ) : coverCar ? (
        <BlogFigure car={coverCar} index={0} navigate={navigate} onOpen={openQuickView} eager />
      ) : null}
      <BlogIntro paragraphs={text?.intro} navigate={navigate} />
      {stats.length > 0 && (
        <div className="model-page-numbers">
          {stats.map((stat) => (
            <div key={stat.label}>
              <strong>{withApprox(stat.value)}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      )}
      {/* Сам список — сразу после полосы цифр: за ним и приходят, а разборы
          читают уже после. */}
      <BlogTopList post={post} cars={topCars} total={carsState.total} changedAt={carsState.changedAt} navigate={navigate} onOpen={openQuickView} />
      {/* Между разделами статьи встают фотографии машин из этой же подборки:
          сплошной текст, пусть и с врезками, читать тяжело. Последний раздел
          оставляем без снимка — дальше идут вопросы и список машин. */}
      <div className="model-page-article">
        {(text?.sections || []).map((section, index) => {
          // Ни обложку, ни машины из списка в тексте не повторяем.
          const shown = new Set([coverCar?.id, ...topCars.map((item) => item.id)]);
          const cars = carsState.cars.filter((item) => !shown.has(item.id));
          const car = index < (text?.sections?.length || 0) - 1 ? cars[index] : null;
          return (
            <Fragment key={section.title}>
              <ModelPageSection section={section} navigate={navigate} />
              {car ? <BlogFigure car={car} index={index} navigate={navigate} onOpen={openQuickView} /> : null}
            </Fragment>
          );
        })}
      </div>
      <ArticleFaq faq={text?.faq} title="Частые вопросы" navigate={navigate} />
      <ArticleSources sources={text?.sources} />
      {text?.disclaimer ? <p className="blog-disclaimer">{text.disclaimer}</p> : null}
    </BlogArticleShell>
  );
}

/**
 * Сравнение: две машины в шапке, таблица различий, разборы текстом и живые списки
 * обеих моделей. Порядок другой, чем у подборки: сначала ответ в цифрах — за ним и
 * приходят по запросу «что выбрать», — а машины в наличии стоят под разбором, когда
 * человек уже решил, какая из двух ему ближе.
 */
function BlogDuelPage({ post, navigate, favorites, toggleFavorite }) {
  const text = useBlogText(post.slug);
  const data = useDuelSides(post);
  const { openQuickView, quickViewModal } = useVehicleQuickView({ apiMode: true, favorites, toggleFavorite, navigate });
  // Снимки между разделами берём у обеих сторон по очереди: иначе половина статьи
  // была бы проиллюстрирована одной моделью.
  const heroes = new Set(data.map((entry) => entry.hero?.id).filter(Boolean));
  const photoCars = [];
  for (let index = 0; index < 4; index += 1) {
    for (const entry of data) {
      const car = entry.cars.filter((item) => !heroes.has(item.id))[index];
      if (car) photoCars.push(car);
    }
  }
  return (
    <BlogArticleShell post={post} navigate={navigate} quickViewModal={quickViewModal}>
      <BlogDuelHero data={data} navigate={navigate} onOpen={openQuickView} />
      <BlogIntro paragraphs={text?.intro} navigate={navigate} />
      <BlogDuelTable post={post} data={data} navigate={navigate} />
      <div className="model-page-article">
        {(text?.sections || []).map((section, index) => {
          const car = index < (text?.sections?.length || 0) - 1 ? photoCars[index] : null;
          return (
            <Fragment key={section.title}>
              <ModelPageSection section={section} navigate={navigate} />
              {car ? <BlogFigure car={car} index={index} navigate={navigate} onOpen={openQuickView} /> : null}
            </Fragment>
          );
        })}
      </div>
      {data.map((entry) => (
        <BlogDuelSideCars key={entry.side.name} entry={entry} navigate={navigate} favorites={favorites} toggleFavorite={toggleFavorite} onOpen={openQuickView} />
      ))}
      <ArticleFaq faq={text?.faq} title="Частые вопросы" navigate={navigate} />
      <ArticleSources sources={text?.sources} />
      {text?.disclaimer ? <p className="blog-disclaimer">{text.disclaimer}</p> : null}
    </BlogArticleShell>
  );
}

// В карточке заказа номер показываем коротко — «№000045» вместо «Заказ № EV-2026-000045».
// Приставка и год у всех заказов одинаковые и различают их только цифры в конце; полный
// номер остаётся в окне удаления и в подписи раздела для программ чтения с экрана.
const shortOrderNumber = (orderNumber) => {
  const tail = String(orderNumber || "").match(/(\d+)\s*$/);
  return tail ? `№${tail[1]}` : String(orderNumber || "");
};

const deleteLocalOrder = (userId, orderId) => {
  const orders = readLocalOrders(userId);
  const order = orders.find((item) => item.id === orderId);
  if (!order) throw new Error("order_not_found");
  const next = orders.filter((item) => item.id !== orderId);
  storeLocalOrders(userId, next);
  return next;
};

const formatAccountPhone = (value) => {
  const digits = normalizeLocalPhone(value);
  return digits ? `+${digits}` : "";
};

const profileFromUser = (user) => ({
  name:user.name,
  email:user.email || "",
  telegram:user.telegram || "",
  city:user.city || "",
  preferredContact:user.preferredContact || "phone",
  passportNumber:user.passportNumber || "",
  personalNumber:user.personalNumber || "",
  passportIssueDate:user.passportIssueDate || "",
  passportIssuedBy:user.passportIssuedBy || "",
  registrationAddress:user.registrationAddress || "",
});

const preferredContactOptions = [
  { value:"phone", label:"Позвонить" },
  { value:"telegram", label:"Написать в Telegram" },
  { value:"email", label:"Написать на email" },
];

const preferredContactLabels = preferredContactOptions.map((option) => option.label);

const preferredContactLabel = (value) => (preferredContactOptions.find((option) => option.value === value) || preferredContactOptions[0]).label;

const preferredContactValue = (label) => (preferredContactOptions.find((option) => option.label === label) || preferredContactOptions[0]).value;

const activeOrderStage = (order) => {
  if (!["confirmed"].includes(order.availabilityStatus || "decision") && order.inspectionStatus === "decision") return 1;
  if (order.contractStatus === "locked") return 2;
  if (order.paymentStatus === "locked") return 3;
  return 4;
};

// Этапы сделки в кабинете (осмотр, договор, оплата) — пока сделку ведёт импортёр, скрыты.
const ORDER_DEAL_STAGES_ENABLED = false;

function OrderStageRow({ number:stageNumber, title, description, open, locked, done, fixed = false, onToggle, children }) {
  const heading = (
    <>
      <b>{done ? <Check size={23} weight="bold" /> : stageNumber}</b>
      <span><strong>{title}</strong><small>{description}</small></span>
      {!fixed ? locked ? <LockKey size={20} /> : <CaretDown size={21} className="customer-order-stage-caret" /> : null}
    </>
  );
  return (
    <section className={`customer-order-stage${open ? " open" : ""}${locked ? " locked" : ""}${done ? " done" : ""}${fixed ? " fixed" : ""}`}>
      {fixed ? <div className="customer-order-stage-heading">{heading}</div> : <button className="customer-order-stage-heading" type="button" onClick={onToggle} disabled={locked} aria-expanded={open}>{heading}</button>}
      {open && !locked && <div className="customer-order-stage-body">{children}</div>}
    </section>
  );
}

function OrderRemovalModal({ carTitle, orderNumber, saving, error, onCancel, onConfirm }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, saving]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onCancel()}>
      <section className="lead-modal order-removal-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="order-removal-title" aria-describedby="order-removal-description">
        <button className="modal-close" type="button" onClick={onCancel} disabled={saving} aria-label="Закрыть"><X size={19} /></button>
        <div className="order-removal-icon"><Trash size={25} weight="duotone" /></div>
        <h2 id="order-removal-title">Убрать автомобиль?</h2>
        <p id="order-removal-description"><b>{carTitle}</b> будет удалён из заказа № {orderNumber}. Заявка на проверку объявления также будет удалена.</p>
        {error && <div className="auth-error order-removal-error" role="alert">{error}</div>}
        <form className="order-removal-actions" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
          <button className="secondary" type="button" onClick={onCancel} disabled={saving}>Отмена</button>
          <button className="danger-button solid" type="submit" disabled={saving}><Trash size={18} /> {saving ? "Удаляем…" : "Убрать авто"}</button>
        </form>
      </section>
    </div>
  );
}

function AccountRemovalModal({ pending, error, onCancel, onConfirm }) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, pending]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !pending && onCancel()}>
      <section className="lead-modal order-removal-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="account-removal-title" aria-describedby="account-removal-description">
        <button className="modal-close" type="button" onClick={onCancel} disabled={pending} aria-label="Закрыть"><X size={19} /></button>
        <h2 id="account-removal-title">Удалить аккаунт?</h2>
        <p id="account-removal-description">Заказ, избранные автомобили и личные данные будут удалены безвозвратно. Восстановить аккаунт после удаления нельзя.</p>
        <form className="account-removal-form" onSubmit={(event) => { event.preventDefault(); onConfirm(password); }}>
          <PasswordField label="Пароль для подтверждения" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={pending} />
          {error && <div className="auth-error order-removal-error" role="alert">{error}</div>}
          <div className="order-removal-actions">
            <button className="secondary" type="button" onClick={onCancel} disabled={pending}>Отмена</button>
            <button className="danger-button solid" type="submit" disabled={pending || !password}><Trash size={18} /> {pending ? "Удаляем…" : "Удалить аккаунт"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CustomerOrdersPanel({ user, cars, apiMode, favorites, toggleFavorite, authBackend, navigate }) {
  // Цена заказа тоже слушается переключателя валюты в шапке: рубли в каталоге и
  // доллары в заказе выглядели бы разными ценами.
  const currency = useCurrency();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [localMode, setLocalMode] = useState(authBackend === "local");
  const [expandedStage, setExpandedStage] = useState(1);
  const [removalOpen, setRemovalOpen] = useState(false);
  const [removalError, setRemovalError] = useState("");
  const [availabilityComment, setAvailabilityComment] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  // Машин в заказе может быть несколько: показываем выбранную, по умолчанию свежую.
  const order = orders.find((item) => item.id === selectedOrderId) || orders[0] || null;
  // Заголовок карточки открывает быстрый просмотр — тот же, что в каталоге.
  const { openQuickView, quickViewModal } = useVehicleQuickView({ apiMode:apiMode !== false, favorites, toggleFavorite, navigate, orderOnScreen:true });
  // Кабинет — единственное место, где заказы заводятся и удаляются, поэтому именно он
  // сообщает остальному приложению, по каким машинам заказ уже есть.
  const publishOrderedListings = useContext(SetOrderedListingsContext);
  const [previewCar, setPreviewCar] = useState(null);
  const previewListingId = order?.listingId || null;
  // Карточку для просмотра готовим заранее: модалка показывает полную страницу
  // автомобиля, а в заказе хранится только короткая выжимка.
  useEffect(() => {
    if (!previewListingId || previewCar?.id === previewListingId) return undefined;
    const known = cars.find((item) => item.id === previewListingId);
    if (known && !known._summary) {
      setPreviewCar(known);
      return undefined;
    }
    const controller = new AbortController();
    const request = apiMode !== false
      ? fetch(`/api/cars/${encodeURIComponent(previewListingId)}`, { signal:controller.signal }).then((response) => (response.ok ? response.json() : Promise.reject(new Error("not found"))))
      : loadStaticCar(previewListingId, controller.signal);
    request
      .then((loaded) => setPreviewCar(normalizeImportedCar(loaded)))
      .catch(() => {});
    return () => controller.abort();
  }, [apiMode, cars, previewCar, previewListingId]);

  useEffect(() => {
    let cancelled = false;
    const loadLocal = () => {
      const pendingListingId = window.localStorage.getItem(pendingOrderKey);
      if (pendingListingId) {
        const car = cars.find((item) => item.id === pendingListingId);
        if (car) {
          createLocalOrder(user.id, car);
          window.localStorage.removeItem(pendingOrderKey);
        }
      }
      const values = readLocalOrders(user.id);
      if (!cancelled) {
        setLocalMode(true);
        setOrders(values);
        if (values[0]) {
          setExpandedStage(activeOrderStage(values[0]));
          setAvailabilityComment(values[0].availabilityComment || "");
        }
      }
    };
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        if (authBackend === "local") {
          loadLocal();
          return;
        }
        const pendingListingId = window.localStorage.getItem(pendingOrderKey);
        if (pendingListingId) {
          const createResponse = await fetch("/api/account/orders", { method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ listingId:pendingListingId }) });
          if (!createResponse.ok) throw new Error("order_create_failed");
          window.localStorage.removeItem(pendingOrderKey);
        }
        const response = await fetch("/api/account/orders", { cache:"no-store", credentials:"same-origin" });
        if (!response.ok) throw new Error("orders_load_failed");
        const payload = await response.json();
        const values = Array.isArray(payload.orders) ? payload.orders : [];
        if (!cancelled) {
          setOrders(values);
          if (values[0]) {
            setExpandedStage(activeOrderStage(values[0]));
            setAvailabilityComment(values[0].availabilityComment || "");
          }
        }
      } catch {
        loadLocal();
        if (!readLocalOrders(user.id).length && !cancelled) setError("Не удалось загрузить заказ. Попробуйте обновить страницу.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [authBackend, cars, user.id]);

  // Список машин в заказе держим в актуальном состоянии для всего приложения: заказ
  // могли только что создать или убрать, и кнопка на карточке обязана это отразить.
  // Пока заказы грузятся, ничего не публикуем — иначе кнопка на миг стала бы обычной.
  useEffect(() => {
    if (!loading) publishOrderedListings?.(orders);
  }, [loading, orders, publishOrderedListings]);

  const applyAction = async (action, values = {}) => {
    const current = order;
    if (!current || saving) return;
    setSaving(true);
    setError("");
    try {
      let updated;
      if (localMode) {
        updated = updateLocalOrder(user.id, current.id, action, values).order;
      } else {
        const response = await fetch(`/api/account/orders/${current.id}`, { method:"PATCH", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ action, ...values }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "order_update_failed");
        updated = payload.order;
      }
      if (!updated) throw new Error("order_update_failed");
      setOrders((values) => values.map((order) => order.id === updated.id ? updated : order));
      if (action !== "save_order_contact") setExpandedStage(activeOrderStage(updated));
      return true;
    } catch {
      setError("Не удалось сохранить действие. Попробуйте ещё раз.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const removeOrder = async () => {
    const current = order;
    if (!current || saving) return;
    setSaving(true);
    setError("");
    setRemovalError("");
    try {
      if (localMode) {
        try {
          setOrders(deleteLocalOrder(user.id, current.id));
        } catch (localError) {
          if (localError.message !== "order_not_found" || authBackend === "local") throw localError;
          const response = await fetch(`/api/account/orders/${current.id}`, { method:"DELETE", credentials:"same-origin" });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "order_remove_failed");
          setLocalMode(false);
          setOrders((values) => values.filter((order) => order.id !== current.id));
        }
      } else {
        const response = await fetch(`/api/account/orders/${current.id}`, { method:"DELETE", credentials:"same-origin" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "order_remove_failed");
        setOrders((values) => values.filter((order) => order.id !== current.id));
      }
      setExpandedStage(1);
      setSelectedOrderId("");
      setRemovalOpen(false);
    } catch (removeError) {
      console.error("[customer-order] removal failed", { orderId:current.id, source:localMode ? "local" : "server", error:removeError.message });
      setRemovalError(removeError.message === "unauthorized" ? "Сессия истекла. Обновите страницу и войдите снова." : "Не удалось убрать автомиль. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };

  // Переключение машины: у каждой свой прогресс, поэтому вместе с выбором
  // подтягиваем её активный этап и комментарий.
  const chooseOrder = (next) => {
    if (!next || next.id === order?.id) return;
    setSelectedOrderId(next.id);
    setExpandedStage(activeOrderStage(next));
    setAvailabilityComment(next.availabilityComment || "");
    setError("");
  };

  if (loading) return <section className="account-order-loading" aria-live="polite">Загружаем ваш заказ…</section>;
  if (!order) return (
    <section className="account-panel account-empty">
      <div className="account-panel-title"><div><span>Мои заказы</span><h2>Начните с подходящего автомобиля</h2></div><ClipboardText size={27} weight="duotone" /></div>
      <p>{error || "Выберите автомобиль в каталоге — после этого здесь появится заявка на проверку объявления."}</p>
      <button className="primary" onClick={() => navigate("/catalog")}>Перейти в каталог <ArrowRight size={18} /></button>
    </section>
  );

  const availabilityStatus = order.availabilityStatus || "decision";
  const availabilityRequested = availabilityStatus !== "decision";
  const availabilityConfirmed = availabilityStatus === "confirmed";
  const inspectionDone = order.inspectionStatus === "skipped";
  const inspectionUnlocked = availabilityConfirmed || order.inspectionStatus !== "decision";
  const contractUnlocked = order.contractStatus !== "locked";
  const contractDone = order.contractStatus === "confirmed";
  const paymentUnlocked = order.paymentStatus !== "locked";
  const requestAvailabilityCheck = () => {
    if (availabilityRequested || saving) return;
    trackAvailabilityRequest(order, availabilityComment);
    applyAction("request_availability_check", { comment:availabilityComment.trim() });
  };
  const requestOrderRemoval = (event) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    setRemovalError("");
    setRemovalOpen(true);
  };
  // Быстрый просмотр работает только на широком экране и при включённом свитчере;
  // в остальных случаях ссылка открывает страницу автомобиля, как раньше.
  const openCarPreview = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button) return;
    if (!previewCar || previewCar.id !== order.listingId) return;
    if (openQuickView(previewCar)) event.preventDefault();
  };
  // Одинаковые названия встречаются у разных объявлений — такие различаем номером заказа.
  const orderLabels = orders.map((item, index) => {
    const title = item.car.title || "Автомобиль";
    const twin = orders.some((other, otherIndex) => otherIndex !== index && (other.car.title || "Автомобиль") === title);
    return twin ? `${title} · ${item.orderNumber}` : title;
  });
  const widestOrderLabel = orderLabels.reduce((longest, label) => (label.length > longest.length ? label : longest), "");
  return (
    <section className="customer-order" aria-label={`Заказ ${order.orderNumber}`}>
      {orders.length > 1 && (
      <div className="customer-order-picker">
        <SelectField
          className="customer-order-select"
          label="Автомобиль в заказе"
          value={orderLabels[orders.indexOf(order)]}
          options={orderLabels}
          onChange={(label) => chooseOrder(orders[orderLabels.indexOf(label)])}
        />
        {/* Невидимая мерка: ширину списка задаёт самое длинное название, иначе
            поле дёргалось бы при каждом переключении машины. */}
        <span className="customer-order-picker-sizer" aria-hidden="true">{widestOrderLabel}</span>
      </div>
      )}
      <div className="customer-order-car">
        <img src={imageSource(order.car.image, IMAGE_WIDTH_TILE)} alt={order.car.title} onError={(event) => retryWithFullImage(event, order.car.image)} />
        <div className="customer-order-car-copy">
          <div className="customer-order-car-heading"><h2><a href={`/cars/${encodeURIComponent(listingNumber(order.listingId))}`} target="_blank" rel="noopener noreferrer" onClick={openCarPreview}>{order.car.title}</a></h2><p>{shortOrderNumber(order.orderNumber)}</p></div>
          {order.car.estimatedTotalUsd ? <div className="customer-order-car-price"><b><ApproxSign /> {bynify(money(order.car.estimatedTotalUsd, currency))}</b></div> : null}
        </div>
        <div className="customer-order-card-controls">
          <details className="order-car-menu">
            <summary aria-label="Действия с автомобилем"><DotsThreeVertical size={23} weight="bold" /></summary>
            <div><button type="button" disabled={saving} onClick={requestOrderRemoval}><Trash size={17} /> Убрать автомобиль</button></div>
          </details>
        </div>
      </div>
      <div className="customer-order-stages">
        <OrderStageRow number={1} title="Проверка объявления" description="Проверенная компания-импортёр уточнит у продавца наличие, цену и готовность к сделке." open fixed done={availabilityRequested}>
          {/* После отправки запроса вёрстка этапа не меняется: поле с комментарием и
              кнопка просто перестают быть активными, а рядом с кнопкой встаёт статус. */}
          <form className="availability-check-form" onSubmit={(event) => { event.preventDefault(); requestAvailabilityCheck(); }}>
            <div className="availability-check-block">
              <p>Заявку получит проверенная компания-импортёр. Она свяжется с продавцом и подтвердит:</p>
              <ul className="availability-check-list">
                <li><CheckCircle size={20} weight="fill" /> автомобиль ещё в продаже;</li>
                <li><CheckCircle size={20} weight="fill" /> цена и комплектация не изменились;</li>
                <li><CheckCircle size={20} weight="fill" /> продавец готов к осмотру и оформлению сделки.</li>
              </ul>
            </div>
            {/* После отправки пустое поле не оставляем: показывать нечего. */}
            {(!availabilityRequested || availabilityComment.trim()) && (
              <label className="availability-comment-field">
                <textarea value={availabilityComment} onChange={(event) => setAvailabilityComment(event.target.value)} maxLength={600} disabled={availabilityRequested} aria-label="Комментарий менеджеру" placeholder="Комментарий менеджеру" />
              </label>
            )}
            <div className="availability-check-actions">
              <button className="primary" type="submit" disabled={saving || availabilityRequested}>Узнать точную цену и наличие</button>
              {availabilityRequested && (
                <p className="availability-check-status"><CheckCircle size={20} weight="fill" />{availabilityConfirmed ? "Актуальность подтверждена." : "Запрос отправлен, с вами скоро свяжутся."}</p>
              )}
            </div>
          </form>
        </OrderStageRow>
        {/* Этапы «Осмотр», «Договор», «Оплата и выкуп» скрыты 25.09.2026: abcars — сервис,
            договор и оплату ведёт компания-импортёр. Вернуть — ORDER_DEAL_STAGES_ENABLED = true. */}
        {ORDER_DEAL_STAGES_ENABLED && (<>
          <OrderStageRow number={2} title="Осмотр автомобиля" description="Проверим состояние автомобиля перед покупкой." open={expandedStage === 2} locked={!inspectionUnlocked} done={inspectionDone} onToggle={() => setExpandedStage(expandedStage === 2 ? 0 : 2)}>
            {order.inspectionStatus === "decision" ? (
              <><p>Заказать осмотр перед покупкой?</p><div className="customer-order-actions"><button className="primary" type="button" disabled={saving} onClick={() => applyAction("order_inspection")}>Заказать осмотр</button><button className="order-text-action" type="button" disabled={saving} onClick={() => applyAction("skip_inspection")}>Пропустить</button></div></>
            ) : order.inspectionStatus === "requested" ? (
              <div className="customer-order-notice"><CheckCircle size={21} weight="fill" /><p><b>Осмотр заказан.</b><span>Подтвердим стоимость и срок в выбранном вами канале связи.</span></p></div>
            ) : (
              <div className="customer-order-notice"><CheckCircle size={21} weight="fill" /><p><b>Осмотр пропущен.</b><span>Решение сохранено, можно перейти к договору.</span></p></div>
            )}
          </OrderStageRow>
          <OrderStageRow number={3} title="Договор" description="Подготовим и согласуем договор доставки." open={expandedStage === 3} locked={!contractUnlocked} done={contractDone} onToggle={() => setExpandedStage(expandedStage === 3 ? 0 : 3)}>
            {contractDone ? (
              <div className="customer-order-notice"><CheckCircle size={21} weight="fill" /><p><b>Договор согласован.</b><span>Переходим к счёту и выкупу автомобиля.</span></p></div>
            ) : (
              <><p>Данные уже заполнены из профиля. Подтвердите автомобиль и условия.</p><div className="contract-summary"><span>{user.name}</span><span>{formatAccountPhone(user.phone)}</span><span>{order.car.title}</span></div><div className="customer-order-actions"><button className="primary" type="button" disabled={saving} onClick={() => applyAction("confirm_contract")}>Согласовать договор</button></div></>
            )}
          </OrderStageRow>
          <OrderStageRow number={4} title="Оплата и выкуп" description="Сформируем счёт и подтвердим выкуп автомобиля." open={expandedStage === 4} locked={!paymentUnlocked} done={order.paymentStatus === "invoice_requested"} onToggle={() => setExpandedStage(expandedStage === 4 ? 0 : 4)}>
            {order.paymentStatus === "invoice_requested" ? (
              <div className="customer-order-notice"><CheckCircle size={21} weight="fill" /><p><b>Запрос на счёт получен.</b><span>После проверки цены продавца счёт появится здесь.</span></p></div>
            ) : (
              <><p>Сначала подтвердим актуальную цену продавца, затем подготовим счёт.</p>{order.car.estimatedTotalUsd && <div className="order-estimate"><span>Ориентировочно до Минска</span><b><ApproxSign /> {money(order.car.estimatedTotalUsd, currency)}</b></div>}<button className="primary" type="button" disabled={saving} onClick={() => applyAction("request_invoice")}>Запросить счёт</button></>
            )}
          </OrderStageRow>
        </>)}
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {removalOpen && <OrderRemovalModal carTitle={order.car.title} orderNumber={order.orderNumber} saving={saving} error={removalError} onCancel={() => { setRemovalOpen(false); setRemovalError(""); }} onConfirm={removeOrder} />}
      {quickViewModal}
    </section>
  );
}

function AccountLogoutModal({ pending, onCancel, onConfirm }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, pending]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !pending && onCancel()}>
      <section className="lead-modal order-removal-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="account-logout-title" aria-describedby="account-logout-description">
        <button className="modal-close" type="button" onClick={onCancel} disabled={pending} aria-label="Закрыть"><X size={19} /></button>
        <h2 id="account-logout-title">Выйти из аккаунта?</h2>
        <p id="account-logout-description">Заказ и избранные автомобили сохранятся — вы вернётесь к ним при следующем входе.</p>
        <div className="order-removal-actions">
          <button className="secondary" type="button" onClick={onCancel} disabled={pending}>Отмена</button>
          <button className="invert-button" type="button" onClick={onConfirm} disabled={pending}>{pending ? "Выходим…" : "Выйти из аккаунта"}</button>
        </div>
      </section>
    </div>
  );
}

function AccountPage({ user, cars, apiMode, favorites, toggleFavorite, authBackend, navigate, onLogout, onSaveProfile, onDeleteAccount, pending }) {
  const [section, setSection] = useState("order");
  const [removalOpen, setRemovalOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [removalError, setRemovalError] = useState("");
  const [profile, setProfile] = useState(() => profileFromUser(user));
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  useEffect(() => {
    setProfile(profileFromUser(user));
  }, [user]);
  const setProfileValue = (field, value) => {
    setProfile((current) => ({ ...current, [field]:value }));
    setProfileSaved(false);
  };
  const updateProfileField = (field) => (event) => setProfileValue(field, event.target.value);
  const confirmRemoval = async (password) => {
    setRemovalError("");
    try {
      await onDeleteAccount(password);
    } catch (error) {
      setRemovalError(error.message === "invalid_credentials" ? "Неверный пароль." : authMessages[error.message] || "Не удалось удалить аккаунт.");
    }
  };
  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileSaved(false);
    if (profile.name.trim().length < 2) return setProfileError(authMessages.invalid_name);
    if (profile.preferredContact === "email" && !profile.email.trim()) return setProfileError(authMessages.email_required);
    if (profile.preferredContact === "telegram" && !profile.telegram.trim()) return setProfileError(authMessages.telegram_required);
    try {
      await onSaveProfile(profile);
      setProfileSaved(true);
    } catch (error) {
      setProfileError(authMessages[error.message] || "Не удалось сохранить данные.");
    }
  };
  return (
    <main className="account-page">
      <header className="account-heading">
        <h1>Здравствуйте, {user.name.split(" ")[0]}</h1>
        <button className="secondary account-logout" onClick={() => setLogoutOpen(true)} disabled={pending}><SignOut size={18} /> Выйти</button>
      </header>
      <div className="account-layout">
        <aside className="account-sidebar">
          <div className="account-sidebar-user">
            <b>{user.name.slice(0,1).toUpperCase()}</b>
            <div><strong>{user.name}</strong><span>{formatAccountPhone(user.phone)}</span></div>
            <button type="button" className="account-delete" onClick={() => { setRemovalError(""); setRemovalOpen(true); }} aria-label="Удалить аккаунт" title="Удалить аккаунт"><Trash size={18} /></button>
          </div>
          <nav className="account-navigation" aria-label="Разделы личного кабинета">
            <button type="button" className={section === "order" ? "active" : ""} aria-current={section === "order" ? "page" : undefined} onClick={() => setSection("order")}><ClipboardText size={21} weight="duotone" /><span>Заказ</span></button>
            <button type="button" className={section === "profile" ? "active" : ""} aria-current={section === "profile" ? "page" : undefined} onClick={() => setSection("profile")}><UserCircle size={21} weight="duotone" /><span>Личные данные</span></button>
          </nav>
        </aside>
        <div className="account-content">
        {/* Both panels stay mounted and are toggled with `hidden`: remounting the
            order panel replayed its fetch, so every switch flashed the loading
            row and the page height jumped. */}
        <div className="account-tabpanel" hidden={section !== "order"}>
          <CustomerOrdersPanel user={user} cars={cars} apiMode={apiMode} favorites={favorites} toggleFavorite={toggleFavorite} authBackend={authBackend} navigate={navigate} />
        </div>
        <div className="account-tabpanel" hidden={section !== "profile"}>
          <form className="account-section profile-editor account-profile-section" onSubmit={saveProfile}>
            <div className="account-section-heading">
              <span>Личные данные</span>
            </div>
            <div className="profile-fields">
              <label className="auth-field"><span>Имя и фамилия</span><input autoComplete="name" value={profile.name} onChange={updateProfileField("name")} maxLength={80} required /></label>
              <label className="auth-field profile-phone"><span>Телефон для входа</span><input value={formatAccountPhone(user.phone)} disabled /></label>
              <label className="auth-field"><span>Email</span><input type="email" autoComplete="email" value={profile.email} onChange={updateProfileField("email")} placeholder="name@example.com" maxLength={160} /></label>
              <label className="auth-field"><span>Telegram</span><div className="profile-input-prefix"><b>@</b><input value={profile.telegram} onChange={updateProfileField("telegram")} placeholder="username" maxLength={80} /></div></label>
              <label className="auth-field"><span>Город</span><input autoComplete="address-level2" value={profile.city} onChange={updateProfileField("city")} placeholder="Например, Минск" maxLength={120} /></label>
              <div className="auth-field"><span>Как удобнее связаться</span><SelectField className="profile-contact-select" label="Как удобнее связаться" value={preferredContactLabel(profile.preferredContact)} options={preferredContactLabels} onChange={(label) => setProfileValue("preferredContact", preferredContactValue(label))} /></div>
            </div>
            {/* В местном режиме профиль сохраняется в браузере посетителя, поэтому
                паспортных полей там нет: их место — только база под шифрованием. */}
            {authBackend !== "local" && <details className="profile-extra">
              <summary>
                <span>Дополнительные поля</span>
                <CaretDown className="profile-extra-caret" size={18} />
              </summary>
              <div className="profile-fields profile-extra-fields">
                <label className="auth-field"><span>Серия и номер паспорта</span><input value={profile.passportNumber} onChange={updateProfileField("passportNumber")} placeholder="Например, MP1234567" maxLength={20} /></label>
                <label className="auth-field"><span>Личный номер</span><input value={profile.personalNumber} onChange={updateProfileField("personalNumber")} placeholder="Например, 1234567A001PB1" maxLength={20} /></label>
                <label className="auth-field"><span>Дата выдачи</span><input type="date" value={profile.passportIssueDate} onChange={updateProfileField("passportIssueDate")} /></label>
                <label className="auth-field"><span>Кем выдан</span><input value={profile.passportIssuedBy} onChange={updateProfileField("passportIssuedBy")} placeholder="Наименование органа" maxLength={200} /></label>
                <label className="auth-field"><span>Адрес регистрации</span><input autoComplete="street-address" value={profile.registrationAddress} onChange={updateProfileField("registrationAddress")} placeholder="Населённый пункт, улица, дом, квартира" maxLength={240} /></label>
              </div>
            </details>}
            {profileError && <div className="auth-error" role="alert">{profileError}</div>}
            <div className="profile-actions"><button className="primary" type="submit" disabled={pending}>Сохранить изменения</button>{profileSaved && <p role="status"><CheckCircle size={18} weight="fill" /> Данные сохранены</p>}</div>
          </form>
        </div>
        </div>
      </div>
      {logoutOpen && <AccountLogoutModal pending={pending} onCancel={() => setLogoutOpen(false)} onConfirm={onLogout} />}
      {removalOpen && (
        <AccountRemovalModal
          pending={pending}
          error={removalError}
          onCancel={() => { setRemovalOpen(false); setRemovalError(""); }}
          onConfirm={confirmRemoval}
        />
      )}
    </main>
  );
}

export { HowItWorksPage, ContactsPage, ToolPage, ModelsIndexPage, BlogIndexPage, BlogPostPage, Catalog, Detail, OrderDraft, VehicleQuickViewModal, AccountPage, SavedSearchesPage, Favorites };
