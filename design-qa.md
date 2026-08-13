# Design QA — ChinaCar.by MVP

Date: 2026-08-13

## Scope and evidence

- Reference: Auto.ru home, results, listing, and vehicle-detail captures at 1280×720.
- Implementation: ChinaCar.by home, catalog, vehicle detail, and lead-success state.
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

- Temporary `chinacar.by` wordmark and coral accent establish the MVP's own identity.
- No advertising column; it is replaced by an explanation of the vehicle-check service.
- Destination price is explicitly approximate, matching the agreed MVP scope.

## Final result

Passed. No open P0, P1, or P2 findings.
