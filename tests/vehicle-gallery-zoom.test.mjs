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
  assert.match(styles, /\.gallery-zoom-lens,\s*\.gallery-modal-zoom-lens \{[^}]*width: min\(clamp\(280px, 40%, 320px\), 100%\);[^}]*aspect-ratio: 1;[^}]*overflow: hidden;/s);
  assert.doesNotMatch(styles, /gallery-zoom-preview/);
});

test("immersive gallery uses the same original-quality magnifier on desktop", () => {
  assert.ok(app.includes('className={`gallery-modal-zoom-lens${zoomReady ? " is-visible" : ""}`}'));
  assert.ok(app.includes("const zoomSource = zoomIndex === null ? \"\" : imageSource(images[zoomIndex], IMAGE_ORIGINAL);"));
  assert.ok(app.includes("const zoomReady = Boolean(zoomKey) && loadedZoomKey === zoomKey;"));
  assert.ok(app.includes("const imageWidth = sourceRect.width * GALLERY_ZOOM;"));
  assert.ok(app.includes("setLoadedZoomKey(zoomKey);"));
  assert.match(styles, /\.gallery-zoom-lens,\s*\.gallery-modal-zoom-lens \{\s*display: none;/s);
  assert.match(styles, /\.gallery-modal figure\.zooming \{\s*cursor: crosshair;/s);
  assert.match(styles, /\.gallery-modal-zoom-lens img \{\s*object-fit: contain;/s);
});

test("desktop inline gallery is 15 percent shorter than the 4:3 source photo", () => {
  assert.match(styles, /\.gallery-panel \{[^}]*aspect-ratio: 80 \/ 51;[^}]*overflow: hidden;/s);
  assert.match(styles, /\.gallery-slide img \{[^}]*object-fit: cover;/s);
  assert.match(styles, /@media \(min-width: 981px\) and \(hover: hover\) and \(pointer: fine\) \{\s*\.gallery-slide img \{\s*object-fit: cover;/s);
  assert.match(styles, /\.gallery-zoom-lens img,[^}]*object-fit: cover;/s);
  assert.doesNotMatch(styles, /\.gallery-panel \{[^}]*height: 495px;/s);
  assert.match(styles, /@media \(max-width: 980px\) \{[\s\S]*?\.gallery-panel \{\s*aspect-ratio: auto;\s*height: 450px;/);
});

test("sold vehicle replaces every gallery with one blurred, inert cover", () => {
  assert.ok(app.includes('if (car.available === false) return <SoldVehiclePhoto car={car} detail />;'));
  assert.ok(app.includes('<strong>Продано</strong>'));
  assert.match(styles, /\.sold-vehicle-photo > img \{[^}]*filter: blur\(12px\);/s);
  const soldComponent = app.slice(app.indexOf("function SoldVehiclePhoto"), app.indexOf("function HoverImagePreview"));
  assert.doesNotMatch(soldComponent, /onClick|onPointer|zoom|GalleryModal/);
  assert.match(app, /\{floatingCta && !sold && \(/);
  assert.ok(app.includes('<div ref={availabilityCtaRef} className="sold-order-state" role="status">Этот автомобиль продан</div>'));
});
