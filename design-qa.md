# Design QA — abcars.by MVP

Date: 2026-08-13

## Scope and evidence

- Reference: Auto.ru home, results, listing, and vehicle-detail captures at 1280×720.
- Implementation: abcars.by home, catalog, vehicle detail, and lead-success state.
- Responsive checks: desktop 1280×720 and mobile 390×844.
- Side-by-side visual evidence: `qa-comparison.png`.

## Comparison passes

### Layout, spacing, typography, and surfaces

Passed. The implementation preserves the reference's familiar hierarchy: restrained top navigation, prominent search area, compact grey fields, horizontal result rows, a large vehicle gallery, and a right-side price/action panel. Density, border treatment, radii, and spacing remain consistent across the core screens. Manrope provides the same compact marketplace character while supporting Cyrillic cleanly.

### Color, imagery, and icons

Passed. The neutral white/grey marketplace palette is retained with a project-specific coral action color. All vehicle imagery is raster and product-specific, with consistent marketplace crops and no placeholder art. Phosphor icons use one visual family and consistent weights.

### Copy and product context

Passed. Auto.ru's generic marketplace copy was adapted for the Belarus-to-China workflow: China price, approximate Minsk price, source/update status, export availability, battery SOH, and pre-order verification. The advertising rail was intentionally replaced by a verification explainer because it supports the MVP's conversion path.

### States and interactions

Passed after fixes. Verified: home filters → filtered catalog, filter reset/empty state, favorites counter, comparison counter, detail opening, availability request, required contact fields, success confirmation, and Escape/backdrop modal closing.

### Responsiveness and accessibility

Passed after fixes. Desktop and mobile layouts have no overlap or clipped primary controls. Mobile search and catalog controls keep practical tap sizes. Form inputs have visible labels, images have alt text, icon-only actions have accessible names, cards are keyboard reachable, and reduced-motion preferences are respected.

## Resolved findings

1. **P1 · Behavior:** Search navigation stored the full query string as the route state and displayed the 404 view. Fixed by deriving the pathname after updating browser history.
2. **P2 · Accessibility:** Catalog and detail icon actions were missing accessible names. Fixed with explicit Russian `aria-label` values and keyboard activation for featured vehicle cards.

## Intentional product deviations

- Temporary `abcars.by` wordmark and coral accent establish the MVP's own identity.
- No advertising column; it is replaced by an explanation of the vehicle-check service.
- Destination price is explicitly approximate, matching the agreed MVP scope.

## Final result

Passed. No open P0, P1, or P2 findings.

---

## Home catalog-card parity — 2026-08-18

### Evidence

- User annotation: `/var/folders/kf/9xg09l710qvbnpkq2fzdw0140000gn/T/codex-clipboard-27682d76-4687-40d9-a0d8-e721c0885514.png` (1032 × 1154 px), identifying the separate home-card layout to replace.
- Source visual truth: `/Users/user/Documents/Files/profile2/AI-Folders/car/chinacar-mvp/design-qa-catalog-card-mobile.png` (532 × 898 px), the existing catalog `CarRow` at a 532 × 898 CSS viewport.
- Implementation: `/Users/user/Documents/Files/profile2/AI-Folders/car/chinacar-mvp/design-qa-home-card-mobile.png` (532 × 898 px), the home feed using the shared catalog `CarRow` at the same 532 × 898 CSS viewport.
- Combined comparison: `/Users/user/Documents/Files/profile2/AI-Folders/car/chinacar-mvp/design-qa-home-vs-catalog-mobile.png` (1084 × 938 px).
- State: dark theme, USD selected, mobile card list, first cards visible.
- Density normalization: browser captures were normalized to identical 532 × 898 output pixels before comparison; the implementation capture originated from devicePixelRatio 2 and the catalog reference capture from devicePixelRatio 1.
- Browser checks: both feeds rendered responsive mobile headers, photo strips, favorite controls, prices, specifications, and location metadata; no horizontal overflow was present at the comparison viewport. An existing React warning about empty-string `inert` attributes was corrected to use boolean attributes; a fresh home-page load then produced zero console errors.

### Full-view and focused comparison

The combined evidence compares two full mobile viewports side by side. A separate focused crop was not needed because the first two complete cards are large enough to inspect typography, spacing, imagery, controls, and metadata directly.

### Required fidelity surfaces

- Fonts and typography: passed. The home feed inherits the same title, price, summary, chip, and location styles from `CarRow`.
- Spacing and layout rhythm: passed. Card width, padding, radii, image-strip height, inter-card spacing, and content order match the catalog.
- Colors and visual tokens: passed. Both surfaces use the same dark panel, field, text, muted-text, and selected-state tokens.
- Image quality and asset fidelity: passed. Both use `HoverImagePreview` with the same real vehicle imagery, crop behavior, count badge, and mobile strip.
- Copy and content: passed. The home feed now exposes the same mileage, vehicle type, drive, battery, range, body type, city, destination price, and favorite state as the catalog.

### Comparison history

- Initial comparison: no actionable P0, P1, or P2 mismatch. The shared component produces equivalent catalog and home card anatomy; differences are limited to the randomized vehicle data and surrounding page controls.

### Findings

No actionable P0, P1, or P2 findings remain.

final result: passed
