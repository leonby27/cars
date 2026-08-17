# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

Typography preference: prioritize comfortable readability over ultra-compact UI. Keep every rendered text size at 16px or larger across the project, including supporting copy, controls, labels, badges, and mobile layouts. The uppercase “Срок доставки до Минска” label and the non-offer disclaimer in the vehicle estimate card are explicit 14px exceptions; do not introduce other smaller sizes unless the user explicitly requests them.

Russian typography preference: prevent short Russian prepositions and conjunctions from hanging at the ends of lines throughout the rendered interface, including dynamic content. Keep the shared typography processor enabled instead of relying only on manually inserted non-breaking spaces.

Brand color preference: use red `#EE1C25` for brand accents, links, icons, and active states instead of orange. Use yellow `#F4D90E` with dark text for all regular primary CTA buttons. Preserve red for destructive actions where it communicates danger.

Outline color preference: never use red for borders, outlines, focus rings, or selection rings anywhere in the product. Keep red for text, icons, fills, and semantic danger accents only; use the shared neutral `--focus-ring` token for accessible focus indication.

Select-search focus preference: keep the search field inside an open select to one thin neutral 1px border only. Do not add an outer focus shadow or a second ring; use `--line-strong` for the focused border.

Favicon preference: use a compact red `#EE1C25` favicon with a centered lowercase white `e` rendered as the Comfortaa 700 glyph from the customer-facing wordmark.

Vehicle gallery preference: clicking the main image should open an immersive modal with a vertical photo stream similar to Auto.ru. On desktop, keep a sticky left-side thumbnail rail for quick navigation and expose the full thumbnail set; on mobile, support horizontal swipe navigation directly on the main gallery.

Visual QA preference: do not run browser-based visual checks, take implementation screenshots, or perform design-QA comparisons unless the user explicitly asks. The user reviews visual changes manually. Validate changes with build, tests, and non-visual checks only.

SEO appearance preference: SEO work must not change the existing visual design, layout, spacing, typography, or visible component treatment. Semantic link and routing changes must preserve the previous computed appearance, and new indexable routes should reuse existing product UI rather than introduce new page designs.

Home vehicle feed preference: show a randomized feed with 4 cards per row on desktop. Initially show 5 rows (20 cards), then append another 20 cards only when the user clicks “Показать ещё”; do not auto-load on scroll. Do not show the “Карточка доступна” status label anywhere in the product.

Home quick-search count preference: when every quick-search filter is at its default, label the CTA “Показать 2500+ авто”; after any filter is selected, show the exact matching count.

Home conversion content preference: use the space between the vehicle feed and footer for concise trust, objection-handling, and SEO content. Prioritize a transparent order journey and practical answers over generic promotional claims.

Home FAQ appearance preference: place the entire FAQ section inside a rounded light-gray container, use 18px question text, and present every question as a separate rounded white card instead of using divider lines. Keep the question summary at the same 62px minimum height and preserve identical top and bottom padding in both collapsed and expanded states so its title never jumps. Size FAQ grid rows to their content and align the list to the top so closed cards never stretch to fill the height of the intro column. Keep expanded answers inside their question card, render “Все вопросы и ответы” as a regular yellow primary CTA, and do not show a sourcing CTA below the questions.

Home trust-strip preference: lead with “Сопровождаем до выдачи” and the supporting line “От подбора до получения в Минске”; use 18px headings and keep them short enough to remain on one line at desktop widths. Present the three trust points as separate rounded cards on a light-gray surface with each icon inside its own white tile.

Home utility-service preference: place a compact Auto.ru-inspired row of automatic service shortcuts directly below the home search panel, with smaller illustrations and a reserved wide banner slot on the right at desktop widths. Keep the five labels short and on one line: “Таможня”, “Подбор”, “Сравнить”, “Разбор”, “Обслуживание”; size the adjacent banner to the resulting single-row card height. Use original, soft 3D automotive illustrations with borderless tiles; describe only calculations and catalog analysis the product can actually perform, and never claim automatic battery-health diagnostics without BMS or manufacturer data.

Popular-brands preference: keep the home-page brand list in stable alphabetical order by its displayed Latin-script name; do not reorder it by listing count.

Product brand preference: use `evcars.by` as the customer-facing product name and keep brand-aligned demo contact handles on the `evcars.by` identity.

Header-navigation preference: do not show the “Доставленные авто” link in the main header navigation; keep delivered cases accessible elsewhere in the site.

Header appearance preference: keep the header container borderless and use the same solid background token as the page (`var(--page)`) in both themes so scrolling content does not show through. Do not use backdrop blur. Use a larger wordmark and keep primary navigation inside a burger menu instead of inline links. Avoid outlined controls in the header; prefer clean surfaces and filled soft backgrounds only for individual controls where separation is needed. Keep the burger-menu button on the same soft filled background as the other header controls in both themes.

Neutral surface hierarchy preference: keep grouped gray surfaces low-contrast against the page. In the dark theme, use `#1b1e22` for grouped/soft surfaces and `#22262b` for cards that are white in the light theme, so nested cards are only slightly lighter than their container; use `#202329` for intermediate control surfaces. Give shared search selects their own higher-contrast `--filter-field-bg` token (`#292d34` in dark and `#f4f5f6` in light) instead of inheriting the generic surface token. Give disabled selects a separate, still-visible `--filter-field-disabled-bg` (`#24282e` in dark and `#eef0f2` in light) so they remain distinguishable from the grouped container without looking active. When a select opens, increase its surface contrast slightly via `--filter-field-open-bg` (`#30343c` in dark and white in light); never make the open trigger darker than its resting state. Dark search panels should be borderless. In the light theme, preserve the existing white-card-on-`#eff1f3` hierarchy.

Logo preference: render the customer-facing `evcars.by` wordmark entirely in lowercase red Comfortaa, using one consistent type size and a visually heavy 700 weight across the full name.

Theme preference: support both light and dark themes with a compact theme toggle in the main header. Remember the explicit device-local choice, otherwise follow the operating-system preference. Preserve the red brand accent and yellow primary CTAs in both themes.

Company-presence preference: the prototype should feel like a real Minsk-based company, with a substantial footer, office/contact page, legal entity details, social links, and policy pages. Keep temporary company details centralized in `src/company-data.js` so they can be replaced before publication.

Company-address preference: show the Minsk street address without an office number.

Company-details preference: do not show a settlement account number in the public company details.

Company-phone preference: do not publish a company phone number; keep Telegram and email as the public contact methods.

Footer appearance preference: keep the site footer light, using a pale neutral surface with dark headings and readable gray secondary text; do not use a dark inverted footer.

Footer social-icon preference: place social icons in consistent white circular buttons; use a blue Telegram mark and a recognizable gradient-outline Instagram glyph rather than a filled Instagram tile.

Delivered-case preference: use structured delivery stories as trust proof, including route, duration, mileage, final landed cost, decision context, and a customer quote. Keep all temporary case data centralized in `src/delivery-cases.js` for replacement with verified cases.

Commercial-information preference: explain payment stages, contract timing, responsibility boundaries, guarantees, and common questions in dedicated pages linked from the footer. Keep temporary commercial terms and FAQ content centralized in `src/purchase-info.js` and review them with legal and operations before publication.

Lead-form consent preference: every form that collects a name, phone number, email, or messenger handle must require explicit consent before submission and link directly to the privacy policy and site terms. Reuse one consent component so wording and validation remain consistent.

Vehicle-report entry preference: availability CTAs on both the vehicle detail and the first account-order stage temporarily open the shared “Автомобиль временно недоступен” placeholder modal and do not submit a request.

Account preference: the vehicle order is one section of a complete customer account, not the whole account. Use a left sidebar—not top tabs—for the current order, favorites, personal data, and account settings. The order itself stays simple and lightweight, with one visible vehicle and four sequential stages: listing availability check, optional inspection, delivery agreement, then payment and purchase. Keep the first availability-check stage permanently expanded rather than making it a disclosure, and allow one optional manager-comment field there. Use the same rounded container treatment as the rest of the product. Present the selected vehicle as a compact but informative mini card with real metadata and a prominent approximate landed price; do not add an “Ориентировочно” caption beside that price. Make the vehicle name a link that opens its catalog detail page in a new tab, and make the arrow link use the same target. Hide the “Убрать автомобиль” action inside a kebab menu, keep it available at every order stage, and require confirmation in a modal that warns about deleting the order progress. Keep the mini-card supporting typography comfortably readable rather than tiny. Avoid multi-field forms inside the stages; use the saved account details and one clear action per decision.

Order availability-gate preference: submitting the listing-availability request must not unlock the inspection stage. Keep inspection locked until an internal/admin workflow explicitly confirms that the vehicle is still available; the customer-facing API must not expose that confirmation transition.

Order-contact preference: do not show a persistent contact card between the vehicle and order stages. While availability requests are disabled, do not collect or submit contact data from the “Уточнить актуальность” action.

Personal-data preference: do not show placeholder copy about future phone-number changes or SMS confirmation under the login phone. Keep optional passport and registration details in a collapsed disclosure within personal data, persist them with the customer profile, and position them as advance preparation for future contract documents.

Catalog custom-search preference: when catalog filters return no cars and when a user reaches the end of the results, show a light, white-background CTA offering individual vehicle sourcing, including cars not currently in the catalog. The CTA opens a modal with a vehicle-preferences textarea and phone input; do not use a dark or inverted treatment.

Search filter preference: use one shared `VehicleSearch` component for the home page and catalog so their markup, styling, controls, and behavior remain identical. Only the home-page instance may have a maximum-width constraint; the catalog instance fills its available width. Keep the “Все / Электромобили / Гибриды” tabs plus brand, model, year, price, and mileage in the primary area. Place body type and optional advanced fields in the collapsible section below. In the lower action row, align the “Ещё фильтры” control left and the primary CTA right; use the red accent color.

Filter-field appearance preference: keep shared search fields minimal by hiding visible labels and showing only the bold selected value with its chevron. Preserve each hidden field name as an accessible label.

Expanded search grid preference: on desktop, keep the expanded filter fields in the same five-column grid as the primary filters, leaving unused grid cells empty rather than redistributing fields into fewer, wider columns.

Default search filter preference: initial year, price, and mileage values must be explicitly unbounded (“Любой …”), so the initial result count equals the full catalog total. Apply limits only after the user selects one.

Advanced catalog filter preference: show drive, owners, insurance-history, and plain-language vehicle-condition filters only when those fields are present in the returned dataset. Do not offer a range filter while range coverage is incomplete. Disable model selection until a brand is selected.

Expanded filter layout preference: keep the primary “Показать … авто” action in the lower action row both when “Ещё фильтры” is collapsed and expanded.

Vehicle card preview preference: on pointer-hover desktop layouts, split the image into 4–5 horizontal cursor zones that switch among the first listing photos, with a compact segmented position indicator similar to Auto.ru. Keep touch previews stable.

Similar-vehicle preference: select detail-page recommendations by the same body type and a comparable landed-price budget, always excluding other listings of the current make and model. Rank matches deterministically by price proximity rather than randomizing them.

Featured card pricing preference: do not show the “под ключ до Минска” label on home-page vehicle cards. Keep the price left-aligned with the title and metadata, and use compact vertical spacing between card text rows.

Featured card content preference: do not show the source price in Chinese yuan on home-page vehicle cards.

Listing age preference: show how long a listing has been on Guazi only when Guazi supplies an actual publication/listing timestamp. Never substitute the local import, price-history, sitemap last-modified, or monitoring first-seen timestamp.

Freshness-label preference: do not show internal refresh, import, check, or update timestamps in the customer-facing UI, including labels such as “Актуализировано”, “обновлено”, and “Источник проверен”.

Vehicle detail facts preference: place characteristics in a single vertical icon-led list directly below the gallery, followed by “Что указано в объявлении” in the same row-based layout.

Vehicle fact typography preference: use larger, comfortably readable text for characteristic labels and values—16px on desktop and 15px on mobile.

Localization preference: show Chinese listing cities in Russian. Present source letter grades as plain-language vehicle-condition labels; do not expose the source name in catalog result metadata.

Catalog navigation preference: when returning from a vehicle page, preserve the catalog filters, sorting, number of loaded results, and scroll position. The in-app “back to catalog” action should use the same history entry when the vehicle was opened from the catalog.

Catalog loading preference: render the catalog in batches of 24 vehicles and automatically load the next batch as the user approaches the end of the current results; do not render every matching vehicle initially or use a regular “Показать ещё” button. In the results summary, show the total number matching the active filters rather than the number of cards loaded so far.

Vehicle estimate card preference: keep the landed-cost estimate fully expanded in the light sidebar card, including line items, total, and disclaimer. Show one approximate midpoint price instead of ranges in both the vehicle sidebar and order detail, and separate “Итого” with a simple line instead of a bordered surface. Keep the 35–50 day delivery section below it as a collapsed chevron disclosure, and place the yellow “Уточнить актуальность объявления” CTA at the bottom.

Estimate-description preference: keep explanatory copy for individual cost rows behind an info icon beside the row title. Show it only while the icon is hovered and hide it immediately when the pointer leaves; do not toggle it by click.

Vehicle import policy: for future imports, import only model-year 2023+ electric vehicles from the home-page popular brands plus Leapmotor, Tesla, Mercedes-Benz, Lynk & Co, Mazda, and Toyota. Never use this policy to clean or remove existing catalog entries; existing hybrids and all other existing cars remain untouched. Keep the executable policy in `config/import-policy.mjs` and the human-readable rules in `IMPORT_POLICY.md` synchronized.
