import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("vehicle gallery magnifier stays inside the desktop lens and uses the original image", () => {
  assert.ok(app.includes('className={`gallery-zoom-lens${zoomVisible && zoomReady ? " is-visible" : ""}`}'));
  assert.match(app, /\(min-width: 981px\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.ok(app.includes("const GALLERY_ZOOM = 1.4;"));
  assert.ok(app.includes("const zoom = GALLERY_ZOOM;"));
  assert.ok(app.includes("const activeZoomSource = imageSource(images[active], IMAGE_ORIGINAL);"));
  assert.ok(app.includes("const zoomReady = loadedZoomSource === activeZoomSource;"));
  assert.ok(app.includes('key={`${active}-${activeZoomSource}`}'));
  assert.ok(app.includes("src={activeZoomSource}"));
  assert.ok(app.includes("setLoadedZoomSource(activeZoomSource);"));
  assert.ok(app.includes('previewImage.style.transform = `translate3d(${imageX}px, ${imageY}px, 0)`;'));
  assert.ok(app.includes("const inlineZoomBounds = () =>"));
  assert.ok(app.includes("clientY >= initialBounds.bottom"));
  assert.ok(app.includes("zoomBounds.bottom - sourceRect.top"));
  assert.doesNotMatch(app, /gallery-zoom-preview/);
  assert.match(styles, /@media \(min-width: 981px\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(styles, /\.gallery-zoom-lens \{[^}]*width: min\(clamp\(280px, 40%, 320px\), 100%\);[^}]*aspect-ratio: 1;[^}]*overflow: hidden;/s);
  assert.doesNotMatch(styles, /gallery-zoom-preview/);
});

test("immersive gallery has no magnifier", () => {
  const modal = app.slice(app.indexOf("function GalleryModal"), app.indexOf("function VehicleGallery"));
  assert.doesNotMatch(modal, /zoom|onPointerEnter|onPointerMove|onPointerLeave/);
  assert.doesNotMatch(styles, /gallery-modal-zoom-lens|\.gallery-modal figure\.zooming/);
});

test("immersive gallery labels each photo until it loads", () => {
  const modal = app.slice(app.indexOf("function GalleryModal"), app.indexOf("function VehicleGallery"));
  assert.ok(modal.includes('const [loadedImages, setLoadedImages] = useState(() => new Set());'));
  assert.ok(modal.includes('!loadedImages.has(index) && <span className="gallery-modal-loading" aria-hidden="true">Загружаем фото…</span>'));
  assert.ok(modal.includes('onLoad={() => markImageLoaded(index)}'));
  assert.match(styles, /\.gallery-modal-loading \{[^}]*color: #8e949e;[^}]*font-size: 14px;[^}]*animation: gallery-photo-loading-pulse 1\.6s ease-in-out infinite;/s);
  assert.match(styles, /@keyframes gallery-photo-loading-pulse \{\s*0%, 100% \{ opacity: 0\.45; \}\s*50% \{ opacity: 0\.82; \}\s*\}/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\s*\.gallery-modal-loading \{\s*animation: none;/s);
});

test("desktop inline gallery is 15 percent shorter than the 4:3 source photo", () => {
  assert.match(styles, /\.gallery-panel \{[^}]*aspect-ratio: 80 \/ 51;[^}]*overflow: hidden;/s);
  assert.match(styles, /\.gallery-slide img \{[^}]*object-fit: cover;/s);
  assert.match(styles, /@media \(min-width: 981px\) and \(hover: hover\) and \(pointer: fine\) \{\s*\.gallery-slide img \{\s*object-fit: cover;/s);
  assert.match(styles, /\.gallery-zoom-lens img \{[^}]*object-fit: cover;/s);
  assert.doesNotMatch(styles, /\.gallery-panel \{[^}]*height: 495px;/s);
  assert.match(styles, /@media \(max-width: 980px\) \{[\s\S]*?\.gallery-panel \{\s*aspect-ratio: auto;\s*height: 450px;/);
});

test("sold vehicle replaces every gallery with one blurred, inert cover", () => {
  assert.ok(app.includes('if (car.available === false) return <SoldVehiclePhoto car={car} detail />;'));
  assert.ok(app.includes('<strong>Продано</strong>'));
  assert.match(styles, /\.sold-vehicle-photo > img[^{]*\{[^}]*filter: blur\(12px\);/s);
  const soldComponent = app.slice(app.indexOf("function SoldVehiclePhoto"), app.indexOf("function HoverImagePreview"));
  assert.doesNotMatch(soldComponent, /onClick|onPointer|zoom|GalleryModal/);
  assert.match(app, /\{floatingCta && !sold && \(/);
  assert.ok(app.includes('<div ref={availabilityCtaRef} className="sold-order-state" role="status">Этот автомобиль продан</div>'));
});

test("local Guazi preview keeps the availability button without sending a test request", () => {
  assert.ok(app.includes('if (localGuaziPreview) {'));
  assert.ok(app.includes('setAvailabilityStatus("preview");'));
  assert.ok(app.includes('preview={availabilityStatus === "preview"}'));
  assert.ok(app.includes('Заявку получит наш проверенный партнёр'));
});

test("availability action is green below the information and has a floating repeat", () => {
  assert.ok(app.indexOf('className={`delivery-disclosure delivery-card') < app.indexOf('className={`primary report-order-cta availability-primary-cta'));
  assert.ok(app.includes('Бесплатно <span aria-hidden="true">•</span> Ни к чему не обязывает'));
  assert.match(styles, /\.primary\.availability-primary-cta\s*\{[^}]*min-height:\s*52px;[^}]*background:\s*linear-gradient\(90deg, #38b65a 0%, #2fa64d 100%\);[^}]*box-shadow:/s);
  assert.match(styles, /\.availability-primary-note\s*\{[^}]*opacity:\s*0\.75;/s);
});

test("price breakdown opens as a dropdown beside the vehicle title", () => {
  assert.ok(app.includes('const [priceOpen, setPriceOpen] = useState(false);'));
  assert.ok(app.includes('Цена под ключ до Минска. {" "}'));
  assert.ok(app.includes('onClick={() => setPriceOpen((open) => !open)}>Детализация</button>'));
  assert.ok(app.includes('className={`order-card price-dropdown${priceOpen ? " open" : ""}`}'));
  assert.ok(app.includes('currency={currency} compactApproximation'));
  assert.ok(app.indexOf('className="detail-topbar"') < app.indexOf('className="detail-title"'));
  assert.ok(app.indexOf('className={`order-card price-dropdown') < app.indexOf('className="detail-main"'));
  assert.match(styles, /\.detail-header-price > \.price-dropdown\s*\{[^}]*position:\s*absolute;/s);
  assert.match(styles, /\.detail-header-price > \.price-dropdown\.open\s*\{[^}]*opacity:\s*1;/s);
  assert.ok(app.includes('{!price.isFob && ('));
  assert.ok(app.indexOf('className={`delivery-disclosure delivery-card') < app.indexOf('className={`primary report-order-cta availability-primary-cta'));
  assert.match(styles, /\.price-disclosure-content\s*\{\s*padding-top:\s*0;/);
  assert.match(styles, /\.detail-sidebar-price-note button\s*\{[^}]*text-decoration:\s*none;/s);
  assert.match(styles, /\.detail-sidebar-price-note button\[aria-expanded="true"\]\s*\{\s*color:\s*var\(--accent\);/);
  assert.match(styles, /\.detail-sidebar > \.report-order-cta\s*\{[^}]*margin:\s*16px 0 0;/s);
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\) 386px;/);
  assert.ok(app.includes('className="header-currency-switch"'));
  assert.ok(app.indexOf('className="header-currency-switch"') < app.indexOf('className={`icon-label searches-link'));
  assert.ok(!app.includes('className="price-currency-switch"'));
});

test("condition summary uses readable grades and hides facts in an animated disclosure", () => {
  const summary = app.slice(app.indexOf("function VehicleConditionSummary"), app.indexOf("function PriceLabel"));
  assert.ok(summary.includes('aria-label="Состояние согласно источнику"'));
  assert.doesNotMatch(summary, /<h2>Состояние согласно источнику<\/h2>/);
  assert.ok(summary.includes("Согласно данным источника,"));
  assert.ok(summary.includes("conditionGradeMeta(displayedGrade)"));
  assert.doesNotMatch(summary, /Оценка в описании|displayedGradeLabel/);
  assert.ok(summary.includes('className="vehicle-condition-details-toggle"'));
  assert.ok(summary.includes('className="animated-disclosure vehicle-condition-details" aria-hidden={!detailsOpen}'));
  assert.ok(summary.includes("setDetailsOpen((open) => !open)"));
  assert.doesNotMatch(summary, /Шкала A–D/);
  assert.match(styles, /\.condition-grade-excellent,\s*\.condition-grade-good\s*\{[^}]*background:\s*#217a47;[^}]*color:\s*#fff;/s);
  assert.match(styles, /\.condition-grade-badge\s*\{[^}]*min-height:\s*24px;[^}]*padding:\s*3px 7px;[^}]*font-size:\s*12px;/s);
  assert.match(styles, /\.vehicle-condition-details-toggle\[aria-expanded="true"\] svg\s*\{\s*transform:\s*rotate\(180deg\);/s);
  assert.match(styles, /\.vehicle-condition-details-toggle\s*\{[^}]*color:\s*var\(--accent-dark\);/s);
  assert.match(styles, /\.vehicle-condition-details-toggle\[aria-expanded="true"\]\s*\{\s*color:\s*var\(--accent\);/s);
});
