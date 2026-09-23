## Design QA — delivery-cost CIP calculator

- Source visual truth: `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-168551e8-ae60-4b48-9c35-f563cde2347a.png`
- Implementation screenshot: unavailable by project policy
- Intended route: `http://127.0.0.1:5173/delivery-cost`
- Intended states: desktop and mobile, dark and light themes, model/location combobox open, default and large-vehicle estimates
- Source pixels: 1746 × 1396
- Implementation pixels, CSS viewport and density normalization: unavailable because a browser capture was not permitted

### Full-view comparison evidence

Blocked. The repository owner decision in `AGENTS.md` prohibits opening, refreshing, capturing or visually inspecting the rendered preview unless visual verification is explicitly requested in the current request. The current request specified the result-card content but did not authorize visual verification.

### Focused region comparison evidence

Blocked for the same reason. No claim about rendered typography, spacing, colors, image quality, copy wrapping or responsive fidelity is made from code alone.

### Findings

- [Blocked] No rendered comparison artifact is available. Automated calculation tests and the production build pass, but they are not a substitute for the required visual comparison.

### Comparison history

- No visual iteration was run for this change because the project-specific visual-verification prohibition takes precedence.

### Implementation checklist

- [x] Shared two-column calculator structure implemented.
- [x] Editable, filterable model and location comboboxes implemented.
- [x] Location defaults to «Точно не знаю».
- [x] CIP total and itemized breakdown implemented.
- [x] Calculation tests pass.
- [x] Production build passes.
- [ ] Browser-rendered desktop/mobile and theme comparison pending explicit owner authorization.

### Follow-up polish

No visual polish is classified without rendered evidence.

final result: blocked

---

## Design QA — shared tool-page hero spacing

- Source visual truth: `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-6b77ff75-02e6-4250-aac7-447c29f9e83b.png` and `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-a3f96897-5360-4925-a4bf-83e26e6ea513.png`
- Implementation screenshots: Codex in-app Browser captures emitted during the 2026-09-22 verification run; this browser API did not expose filesystem paths for the captures.
- Routes: `/ev-quota`, `/customs`, `/delivery-cost`, `/china-brands`, `/range`, `/price-belarus`
- Browser: Codex in-app browser
- Viewports: 1243 × 894 CSS px desktop and 390 × 844 CSS px mobile at 1× CSS density
- Source pixels: 1856 × 996 and 1594 × 1064
- State: dark theme, default controls, first functional block visible below each hero.

### Full-view comparison evidence

The supplied screenshots show the same structural boundary with two different distances: the directory/comparison pages used the container's 38px desktop gap, while calculator forms added an 18px top margin and reached 56px. The revised pages use the exact midpoint, 47px, without changing the hero, controls, illustrations, typography, or card layout.

### Focused region comparison evidence

Browser geometry was measured between `.model-page-hero` and the following `.model-page-article` on all six right-menu pages. Every desktop route measured exactly 47px. At 390px wide every route measured exactly 39px, the midpoint of the former responsive values 30px and 48px. The two calculator routes report a computed top margin of 0px, so no component adds a second spacing contribution. No route has horizontal overflow on mobile.

### Required fidelity surfaces

- Fonts and typography: unchanged across all six pages.
- Spacing and layout rhythm: one shared 47px desktop and 39px narrow-screen interval replaces the 38/56px and 30/48px split.
- Colors and visual tokens: unchanged.
- Image quality and asset fidelity: existing hero illustrations are unchanged and remain sharp.
- Copy and content: unchanged.

### Findings

No actionable P0, P1, or P2 mismatch remains. The shared interval is visually centered between the two supplied reference values and is consistent on every checked route.

### Comparison history

- Earlier finding: calculators added their own 18px top margin on top of the page gap, while directory and comparison components did not, producing visibly jumping vertical rhythm.
- Fix: moved the spacing decision to the shared tool-page container and removed only the calculator's extra top contribution inside that template.
- Post-fix evidence: browser-computed geometry for six desktop and six mobile route states, plus full-page in-app Browser captures for `/range` mobile and `/china-brands` desktop.

### Interaction and runtime checks

- All six pages were navigated through the shared right-side menu at desktop and mobile widths.
- Search, filters, calculators, cards, and responsive wrapping remain present; no horizontal overflow was detected at 390px.
- Browser console contains no runtime errors; only Vite development messages and the React DevTools notice.

### Implementation checklist

- [x] Shared midpoint spacing on desktop.
- [x] Shared midpoint spacing on mobile/tablet.
- [x] No calculator-specific double margin.
- [x] All six menu pages visually and geometrically checked.
- [x] Production build passes.

### Follow-up polish

No further scoped polish is required.

final result: passed

---

## Design QA — price-page title and scales revision

- Source visual truth: `/Users/user/Downloads/ChatGPT Image 21 сент. 2026 г., 23_08_16.png`
- Implementation screenshot: `/Users/user/Documents/Files/profile2/AI-Folders/car/abcars/implementation-price-belarus-title.png`
- Route: `http://127.0.0.1:5173/price-belarus`
- Browser: Codex in-app browser
- Viewport and implementation pixels: 1280 × 720 CSS px at 1× density
- Source pixels: 1254 × 1254 RGBA
- Density normalization: the source is a transparent square asset rather than a page mockup, so it was compared directly with its rendered tile crop; the implementation screenshot is 1:1 with the CSS viewport.
- State: dark desktop page, default search and filters.

### Full-view comparison evidence

The requested heading renders as «Где дешевле купить авто: в Китае или Беларуси» in two balanced lines. The hero height, lead, search controls, filter row, sidebar and first comparison card remain unchanged.

### Focused region comparison evidence

The attached scales asset is used directly and centered at 104 × 104 CSS px inside the existing 124 × 124 px tile. Its full silhouette remains visible, with more surrounding space than the previous 134 px treatment and no transparency halo or unintended crop.

### Required fidelity surfaces

- Fonts and typography: the existing product font, heading weight, line height and letter spacing are preserved; the non-breaking space keeps «в Китае» together.
- Spacing and layout rhythm: only the illustration's internal rendered size changed; the tile and surrounding hero spacing are unchanged.
- Colors and visual tokens: the existing dark hero and tile tokens are preserved.
- Image quality and asset fidelity: the exact supplied RGBA asset is exported as 512 px PNG, WebP and AVIF and remains sharp at the rendered size.
- Copy and content: the heading matches the requested wording exactly; all other copy remains unchanged.

### Findings

No actionable P0/P1/P2 mismatch remains in the tested desktop state.

### Comparison history

- Earlier finding: the previous scales illustration and title no longer matched the owner's requested revision.
- Fix: replaced all responsive image variants, introduced a compact 104 px fit for the market hero only, and updated the heading.
- Post-fix evidence: `implementation-price-belarus-title.png`; the new asset is fully visible and smaller within the unchanged tile.

### Implementation checklist

- [x] Exact revised heading.
- [x] Exact supplied illustration.
- [x] Slightly smaller illustration in the existing tile.
- [x] Browser rendering and console checked.

### Follow-up polish

No P3 follow-up is required for this scoped revision.

- Primary interactions tested: page load and existing search/filter controls remain present and accessible.
- Console errors checked: no runtime errors were reported; only Vite connection messages and the React DevTools development notice were present.

final result: passed

---

# Design QA — china-brands mobile card scale

- Source visual truth: `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-79683e6c-4d84-4b49-9617-e0a6cd234909.png`
- Desktop scale reference: `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-83c36bd1-dec2-4801-90ec-94fc608edd4f.png`
- Implementation screenshot: `/tmp/china-brands-mobile-after-crop.png`
- Route: `http://127.0.0.1:5173/china-brands`
- Browser: Codex in-app browser
- Viewport: 494 × 898 CSS px at 2× density; dark theme; default Chinese/popularity filters
- Source pixels: 976 × 694 mobile crop and 1668 × 416 desktop crop; implementation crop: 980 × 1960
- Density normalization: the mobile source and implementation were compared at effectively equal 2× pixel width; the desktop crop established the requested 15px description and 52 × 27px logo scale.

## Full-view comparison evidence

The corrected mobile card visibly uses the compact desktop typography and desktop-size brand mark while retaining the intended mobile stacking, three model previews and left-aligned powertrain row.

## Focused region comparison evidence

Before the fix, browser-computed styles were 18px/25px for the description and 24 × 20px for the brand logo. After the fix, the same rendered card measures 15px/22.5px and 52 × 27px. The resulting BYD card was captured and visually checked against both supplied references.

## Required fidelity surfaces

- Fonts and typography: Manrope, weight 500, 15px size and 1.5 line height now match the desktop card.
- Spacing and layout rhythm: mobile-only stacking and the existing gaps are preserved.
- Colors and visual tokens: unchanged dark-theme card, muted copy and red count tokens.
- Image quality and asset fidelity: the original SVG logo and model photos remain unchanged; only the logo's rendered dimensions were corrected.
- Copy and content: unchanged.

## Findings

No actionable P0, P1 or P2 mismatch remains in the requested card description and logo sizing.

## Comparison history

- Earlier finding: shared mobile article rules enlarged card paragraphs to 18px, while the global mobile brand-list rule shrank every `.brand-logo` to 24 × 20px.
- Fix: added late, directory-specific mobile overrides for the desktop 15px description and 52 × 27px logo dimensions.
- Post-fix evidence: browser-computed dimensions and `/tmp/china-brands-mobile-after-crop.png`.

## Interaction and runtime checks

- Page contains meaningful content and no framework error overlay.
- Browser console contains no runtime errors; only Vite development messages and the React DevTools notice.

## Implementation checklist

- [x] Desktop description type scale on mobile.
- [x] Desktop brand-logo size on mobile.
- [x] Preserve mobile layout and three-preview limit.
- [x] Visually inspect the corrected mobile rendering.

## Follow-up polish

No additional polish is required for this scoped change.

final result: passed

---

**Comparison Metadata**

- Source visual truth: `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-4c5ae275-58d1-4ebf-a90d-c3ece6f6091b.png`
- Composition reference: `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-9a625aad-bf6c-439e-abf1-3de59c6e78ad.png`
- Count-row reference: `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-6d01b359-eb91-4ae8-adf7-1d1fdc0fbb7e.png`
- Supplied illustration: `/Users/user/Downloads/ChatGPT Image 21 сент. 2026 г., 22_50_00.png`
- Implementation screenshot: `/Users/user/Documents/Files/profile2/AI-Folders/car/abcars/implementation-price-belarus.png`
- Route: `http://127.0.0.1:5173/price-belarus`
- Browser: Codex in-app browser
- Viewport: 1280 x 720 CSS px
- Source pixels: 1726 x 754; composition reference: 1800 x 498; count-row reference: 784 x 314; illustration: 1254 x 1254
- Implementation pixels: 1280 x 720
- Density normalization: implementation capture is 1:1 with the CSS viewport. The supplied references have different crops and widths, so the comparison used shared section proportions, wrapping, spacing rhythm, and component treatment rather than direct pixel overlays.
- State: dark desktop page, search value `Voyah FREE`, all powertrain types selected, one matching model card visible.

**Full-view Comparison Evidence**

- The implementation uses the same compact calculator-hero structure as the range-page reference: short heading and one-line lead on the left, clipped illustration tile on the right, and the existing search/filter row below.
- The supplied gold scale illustration is used directly, with transparency preserved and without a generated or CSS approximation.
- The page keeps the existing typography, palette, card radii, controls, and layout system. The reference captures differ in width, but no actionable P0/P1/P2 layout drift is visible at the tested desktop viewport.

**Focused Region Comparison Evidence**

- The price rows were compared separately because the requested count treatment is small in the full-page capture.
- Each source label is followed by a muted, regular-weight middle dot and the numeric listing count only. The price remains right-aligned and the savings row is unchanged.
- Searching for `Voyah FREE` with all powertrain types selected renders one model card, confirming that duplicate model variants no longer appear as separate cards in this state.

**Required Fidelity Surfaces**

- Fonts and typography: existing product font stack, hierarchy, optical weights, line height, and underlined model link are preserved. The new counts use regular weight and the existing muted text color.
- Spacing and layout rhythm: hero copy, illustration tile, filters, model card, row separators, and right-aligned prices retain the established page rhythm and radii.
- Colors and visual tokens: existing dark surfaces, coral filters, green savings state, white prices, and muted gray count token are preserved.
- Image quality and asset fidelity: the supplied transparent illustration was exported to PNG, WebP, and AVIF at 512 px and renders sharply in the clipped tile without a visible halo.
- Copy and content: heading and description are intentionally shortened; listing counts contain only the number; `Voyah FREE` appears once in the all-types state.

**Comparison History**

- Iteration 1 findings: [P2] hero copy was materially longer than the calculator reference; [P2] the requested illustration tile was missing; [P2] the all-types result could show multiple cards for one model; [P2] listing counts were absent from price rows.
- Fixes made: shortened the heading and lead, added the supplied scales asset in the existing calculator tile, collapsed all-types results to one representative card per brand/model, and added muted numeric counts after each row label.
- Post-fix evidence: `implementation-price-belarus.png`, captured in the in-app browser at 1280 x 720 with `Voyah FREE` searched. One card is visible and both counts render in place.

**Findings**

- No actionable P0/P1/P2 mismatch remains in the tested desktop state.

**Open Questions**

- None.

**Implementation Checklist**

- [x] Compact hero copy.
- [x] Supplied scales illustration in the shared calculator tile.
- [x] One card per brand/model in the all-types view.
- [x] Muted regular numeric counts after price-row labels.
- [x] Search interaction and console checked in the in-app browser.

**Follow-up Polish**

- No P3 follow-up is required for the requested state.

- Primary interactions tested: search entry and clear affordance, filtered result rendering, all-types duplicate collapse, year selector presence, and count accessibility labels.
- Console errors checked: no runtime errors were reported; only Vite connection messages and the React DevTools development notice were present.

final result: passed

---

# Design QA — vehicle tracking desktop spacing

- Source visual truth: `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-1bfeee1a-6cbb-4529-87bb-322f637864c2.png`
- Implementation screenshot: `/tmp/abcars-tracking-compact-desktop.png`
- Side-by-side comparison: `/tmp/abcars-tracking-qa-comparison.png`
- Viewport: 1256 × 774 CSS px, dark theme, desktop tracking route, default closed-FAQ state
- Density normalization: both source and implementation are 2512 × 1548 px at 2× density; no resizing was needed before comparison

## Full-view comparison evidence

The implementation preserves the existing header, icon, copy, search controls, FAQ cards, colors, type scale, radii and dark-theme surfaces. The requested desktop title now occupies one line. The header-to-icon gap is 44 CSS px, and the search-to-first-question gap is 48 CSS px, visibly reducing both annotated spaces without compressing the inner hero hierarchy.

## Focused region comparison evidence

The hero and first FAQ rows are large and legible in the equal-size side-by-side comparison, so a separate crop was not needed. The title bounding box is 779 × 64 CSS px and remains centered. The search row and FAQ list both measure 920 CSS px wide and share the same left and right edges.

## Required fidelity surfaces

- Fonts and typography: existing Manrope family, weights, line heights and letter spacing are unchanged; desktop heading wrapping is corrected to one line. Mobile keeps its two-line wrap and fits within 390 CSS px.
- Spacing and layout rhythm: both user-annotated vertical gaps are reduced; search and FAQ alignment remains exact.
- Colors and visual tokens: unchanged from the existing dark-theme tokens.
- Image quality and asset fidelity: the existing road icon is unchanged and remains sharp; no assets were replaced or approximated.
- Copy and content: all visible copy remains unchanged.

## Findings

No actionable P0, P1 or P2 mismatches remain. The red arrows in the source are review annotations and are intentionally not part of the implementation.

## Interaction and responsive checks

- VIN validation message appears after an invalid submission.
- FAQ disclosure opens and reveals its answer.
- No page errors were detected during desktop or mobile checks.
- At 390 × 844 CSS px, the title remains responsive and fits without horizontal overflow.

## Comparison history

- Earlier finding: desktop title wrapped to two lines and both annotated vertical gaps were too large.
- Fix: widened the desktop hero copy, kept the title on one line above 980 px, reduced top hero padding to 44 px and the search-to-FAQ gap to 48 px.
- Post-fix evidence: `/tmp/abcars-tracking-qa-comparison.png`; the requested changes are visible with no new layout regressions.

## Implementation checklist

- [x] Keep the desktop heading on one line.
- [x] Reduce the header-to-icon gap.
- [x] Reduce the search-to-FAQ gap.
- [x] Preserve responsive mobile wrapping.
- [x] Verify the production build and primary interactions.

## Follow-up polish

No additional polish is required for this scoped change.

final result: passed

---

# Design QA — mobile service-card density

- Source visual truth paths: `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-de025266-062b-4369-b0d5-717ac03b9753.png` and `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-5b2d2be7-67da-4977-baf0-880088886fca.png`
- Implementation screenshot path: inline Codex in-app Browser captures from `http://127.0.0.1:5173/how-it-works` (the browser exposed these captures inline rather than as filesystem files)
- Viewport: 390 × 844 CSS px, dark and light themes, mobile service route
- Source dimensions: 802 × 916 px and 830 × 1350 px; implementation captures: 390 × 844 px
- Density normalization: the source problem-state crops were scaled to the implementation content width for visual comparison. Their differing crop heights were excluded from the density judgment.
- State: static cards, dark-theme comparison for both groups plus light-theme verification for «Возможности платформы»

## Full-view comparison evidence

The mobile cards retain the source anatomy, content order, imagery, palette and rounded treatment while using a visibly tighter scale. The four «Возможности платформы» cards now measure 295, 220, 220 and 293 CSS px high. The two «Проверка и сопровождение» cards now measure 385 and 427 CSS px high, including the tracking button and artwork.

## Focused region comparison evidence

Focused browser captures checked the first three opportunity cards together, the «Удобно» card with its illustration, and both assurance cards. Titles, descriptions, CTA and artwork remain fully visible without horizontal overflow at 390 CSS px.

## Required fidelity surfaces

- Fonts and typography: Manrope is preserved; mobile card headings use 36px and descriptions use 16px with readable line height. Weight, hierarchy and wrapping remain consistent.
- Spacing and layout rhythm: both groups use 18px mobile padding and 16px radii. Opportunity-card gaps are reduced to 10px, and text-only opportunity cards use a 220px minimum height.
- Colors and visual tokens: existing light and dark surface tokens are unchanged; contrast remains consistent in both themes.
- Image quality and asset fidelity: all supplied car, filter, magnifier and container assets are preserved. Only their mobile rendered size changed; crops remain intentional and sharp.
- Copy and content: no labels, descriptions or actions were changed.

## Findings

No actionable P0, P1 or P2 issues remain. The requested compactness is visible across all six cards without clipping, overlap or lost content.

## Interaction and responsive checks

- The «Перейти в каталог» and «Отследить авто по VIN» controls remain visible and correctly sized.
- The page has no horizontal overflow at 390 × 844 CSS px.
- No browser error overlay or console errors were detected.
- The production build completes successfully.

## Comparison history

- Earlier finding: the mobile opportunity and assurance cards used desktop-like 44px headings, large padding and oversized artwork, producing long single-card screens.
- Fix: introduced mobile-only 18px padding, 36px headings, 16px descriptions, smaller artwork and shorter opportunity-card minimum heights while leaving desktop styles unchanged.
- Post-fix evidence: the inline in-app Browser captures show the revised cards in both themes at 390 × 844 CSS px; measured computed sizes match the intended mobile scale.

## Implementation checklist

- [x] Compact all four «Возможности платформы» cards on mobile.
- [x] Apply the same mobile scale to both «Проверка и сопровождение» cards.
- [x] Preserve desktop dimensions and content.
- [x] Verify light and dark themes at the mobile breakpoint.
- [x] Verify the production build and browser console.

## Follow-up polish

No additional polish is required for this scoped change.

final result: passed

---

# Design QA — Audi report layout from reference image

- Source visual truth: `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-5669232f-9006-4356-abaa-beb446ff8009.png`
- Source image: 2722 × 1528 px; its CSS viewport and device pixel ratio are unknown.
- Implementation route: `http://127.0.0.1:5173/how-it-works`.
- Implementation screenshot: unavailable; the owner requested to review the page visually themselves.
- Intended state: dark theme, four report sections collapsed.
- Current annotation viewport: 1114 × 894 CSS px. No same-viewport capture or density normalization was performed.

## Full-view and focused comparison evidence

The reference was opened and inspected: car and name in one row, two vehicle-data columns below, verdict on the right, and four full-width collapsed sections. The implementation uses that structure. No rendered full-view or focused-region screenshot was captured, so visual comparison cannot be completed.

## Required fidelity surfaces

- Fonts and typography: existing Manrope styles retained; rendered wrapping unverified.
- Spacing and layout rhythm: header and metadata positions adjusted to the reference; rendered alignment unverified.
- Colors and tokens: existing dark and light report palettes retained; rendered colors unverified.
- Image quality and asset fidelity: existing Audi cutout reused; rendered size and sharpness unverified.
- Copy and content: report content preserved, including the body type not shown in the reference; rendering unverified.

## Findings, interaction checks and comparison history

No visual severity finding is possible without an implementation capture. The production build and all 645 automated tests passed. The four disclosure controls were not browser-tested in this pass. This is the first layout pass; there is no post-fix comparison.

final result: blocked

Blocker: browser-based image-to-code QA was intentionally left to the owner.

---

# Design QA — SEO positions table controls

- Source visual truth: `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-a6d29887-8c99-4cff-891e-14a00412808c.png`
- Source dimensions: 2036 × 830 px
- Implementation evidence: inline Codex in-app Browser capture from `http://localhost:5173/analytics` (the browser surface did not expose a filesystem path)
- Viewport: 1280 × 720 CSS px at device pixel ratio 2, dark theme, «SEO позиции», 30-day period
- Tested states: «Только с позициями» disabled and enabled

## Full-view comparison evidence

The rendered SEO panel matches the requested annotated layout: the explanatory paragraph is absent, the table headers contain only «Яндекс» and «Google», and the «Только с позициями» control occupies the top-right area of the panel heading. Existing table spacing, dark surfaces, typography and column alignment remain intact.

## Focused region comparison evidence

The panel header and table header are fully legible in the full-view capture, so a separate crop was not required. With the switch enabled, the visible result set changes from 120 keyword rows to 12 ranked rows, and empty semantic groups are omitted.

## Required fidelity surfaces

- Fonts and typography: existing Manrope hierarchy and weights are preserved; removed helper copy no longer creates an extra text block.
- Spacing and layout rhythm: the switch is vertically aligned with the heading on desktop and remains compact at the mobile breakpoint.
- Colors and visual tokens: the control uses the existing surface, line, accent, focus-ring and text tokens.
- Image quality and asset fidelity: this UI contains no image assets; no substitutions were introduced.
- Copy and content: the control label is exactly «Только с позициями»; the removed explanatory paragraph and «позиция · динамика» sublabels are absent.

## Findings

No actionable P0, P1 or P2 visual mismatches remain.

## Interaction and responsive checks

- Disabled state shows all 120 semantic-core rows.
- Enabled state shows 12 rows with a Yandex or Google position; no unranked row remains visible.
- Semantic group headers with no visible results are hidden.
- The headers are exactly «Запрос», «Wordstat / мес.», «Яндекс», «Google».
- No browser console errors were detected in a clean analytics tab.
- The focused SEO tests and production build pass.

## Comparison history

- Earlier state: long helper paragraph, duplicated header sublabels and no ranked-only filter.
- Fix: removed the marked copy, simplified the engine headers and added an accessible ranked-only switch with responsive styling.
- Post-fix evidence: inline in-app Browser desktop and mobile captures confirm the requested state without overflow or alignment regressions.

## Implementation checklist

- [x] Remove the explanatory paragraph.
- [x] Remove the «позиция · динамика» sublabels.
- [x] Add the «Только с позициями» switch.
- [x] Filter both engines and hide empty groups.
- [x] Verify desktop, mobile, browser console, tests and production build.

## Follow-up polish

No additional polish is required for this scoped change.

final result: passed
## Design QA — EV quota hero illustration scale

- Source visual truth path: browser comment screenshot supplied in the current task (tool attachment; no filesystem path exposed).
- Implementation screenshot path: Codex in-app Browser capture emitted during the 2026-09-23 verification run (browser API did not expose a filesystem path).
- Route: `http://localhost:5173/ev-quota`
- Browser: Codex in-app browser
- Viewport: 1135 × 898 CSS px at 1× density
- Source and implementation pixels: 1135 × 898
- Density normalization: none required; source and implementation use the same viewport and density.
- State: dark desktop page, physical-person tab, September selected.

### Full-view comparison evidence

The 124 × 124 hero tile remains the same size and position as the other calculator-page tiles. No title wrapping, hero height, sidebar position, calculator columns, or surrounding spacing changed.

### Focused region comparison evidence

The source comment showed the quota illustration sitting too small and too high inside the square tile. In the revised browser capture the image is 132px wide, centered with a 4px crop on each side, and starts at 31px from the tile top. The subject is visibly larger and its lower leaves sit close to the bottom edge without clipping the central `0%` mark.

### Required fidelity surfaces

- Fonts and typography: unchanged.
- Spacing and layout rhythm: the shared tile remains 124 × 124; only the image inside it moved and scaled.
- Colors and visual tokens: unchanged.
- Image quality and asset fidelity: the supplied transparent PNG remains sharp; only a minimal symmetric edge crop is used.
- Copy and content: unchanged.

### Findings

No actionable P0, P1, or P2 mismatch remains for the requested illustration scale and vertical placement.

### Comparison history

- Earlier finding: the illustration occupied too little of the tile and left excessive space below it.
- Fix: increased the image width from 124px to 132px, shifted it to `left: -4px`, and moved it down from 27px to 31px.
- Post-fix evidence: the in-app Browser capture at 1135 × 898 shows the larger, lower illustration inside the unchanged tile.

### Implementation checklist

- [x] Keep the shared 124 × 124 tile.
- [x] Increase only the illustration.
- [x] Move the illustration lower.
- [x] Preserve the hero and calculator layout.
- [x] Run the focused layout tests.

### Follow-up polish

No additional scoped polish is required.

final result: passed

---
