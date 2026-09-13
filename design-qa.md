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
