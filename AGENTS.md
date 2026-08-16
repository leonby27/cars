# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

Typography preference: prioritize comfortable readability over ultra-compact UI. Keep every rendered text size at 16px or larger across the project, including supporting copy, controls, labels, badges, and mobile layouts. Do not introduce a smaller size unless the user explicitly requests that exception.

Brand color preference: use red `#EE1C25` for brand accents, links, icons, and active states instead of orange. Use yellow `#F4D90E` with dark text for all regular primary CTA buttons. Preserve red for destructive actions where it communicates danger.

Vehicle gallery preference: clicking the main image should open an immersive modal with a vertical photo stream similar to Auto.ru. On desktop, keep a sticky left-side thumbnail rail for quick navigation and expose the full thumbnail set; on mobile, support horizontal swipe navigation directly on the main gallery.

Visual QA preference: do not run browser-based visual checks, take implementation screenshots, or perform design-QA comparisons unless the user explicitly asks. The user reviews visual changes manually. Validate changes with build, tests, and non-visual checks only.

Home vehicle feed preference: show a randomized feed with 4 cards per row on desktop. Initially show 5 rows (20 cards), then append another 20 cards only when the user clicks “Показать ещё”; do not auto-load on scroll. Do not show the “Карточка доступна” status label anywhere in the product.

Home conversion content preference: use the space between the vehicle feed and footer for concise trust, objection-handling, and SEO content. Prioritize a transparent order journey and practical answers over generic promotional claims.

Popular-brands preference: keep the home-page brand list in stable alphabetical order by its displayed Latin-script name; do not reorder it by listing count.

Product brand preference: use `evcars.by` as the customer-facing product name and keep brand-aligned demo contact handles on the `evcars.by` identity.

Header-navigation preference: do not show the “Доставленные авто” link in the main header navigation; keep delivered cases accessible elsewhere in the site.

Theme preference: support both light and dark themes with a compact theme toggle in the main header. Remember the explicit device-local choice, otherwise follow the operating-system preference. Preserve the red brand accent and yellow primary CTAs in both themes.

Company-presence preference: the prototype should feel like a real Minsk-based company, with a substantial footer, office/contact page, legal entity details, social links, and policy pages. Keep temporary company details centralized in `src/company-data.js` so they can be replaced before publication.

Footer appearance preference: keep the site footer light, using a pale neutral surface with dark headings and readable gray secondary text; do not use a dark inverted footer.

Footer social-icon preference: place social icons in consistent white circular buttons; use a blue Telegram mark and a recognizable gradient-outline Instagram glyph rather than a filled Instagram tile.

Delivered-case preference: use structured delivery stories as trust proof, including route, duration, mileage, final landed cost, decision context, and a customer quote. Keep all temporary case data centralized in `src/delivery-cases.js` for replacement with verified cases.

Commercial-information preference: explain payment stages, contract timing, responsibility boundaries, guarantees, and common questions in dedicated pages linked from the footer. Keep temporary commercial terms and FAQ content centralized in `src/purchase-info.js` and review them with legal and operations before publication.

Lead-form consent preference: every form that collects a name, phone number, email, or messenger handle must require explicit consent before submission and link directly to the privacy policy and site terms. Reuse one consent component so wording and validation remain consistent.

Vehicle-report entry preference: the vehicle-detail “Заказать отчёт о состоянии авто” CTA must not open a report-order lead form. Guests should see only a registration form in a modal and then continue to the account; signed-in users should go directly to the account, where report ordering belongs.

Account preference: the vehicle order is one section of a complete customer account, not the whole account. Use a left sidebar—not top tabs—for the current order, favorites, personal data, and account settings. The order itself stays simple and lightweight, with one visible vehicle and four sequential stages: listing availability check, optional inspection, delivery agreement, then payment and purchase. Keep the first availability-check stage permanently expanded rather than making it a disclosure, and allow one optional manager-comment field there. Use the same rounded container treatment as the rest of the product. Present the selected vehicle as a compact but informative mini card with real metadata and a prominent approximate landed price; do not add an “Ориентировочно” caption beside that price. Make the vehicle name a link that opens its catalog detail page in a new tab, and make the arrow link use the same target. Hide the “Убрать автомобиль” action inside a kebab menu, keep it available at every order stage, and require confirmation in a modal that warns about deleting the order progress. Keep the mini-card supporting typography comfortably readable rather than tiny. Avoid multi-field forms inside the stages; use the saved account details and one clear action per decision.

Order-contact preference: do not show a persistent contact card between the vehicle and order stages. Open a compact contact modal only when the user clicks “Уточнить актуальность”, prefill it from the account, allow multiple Phone/Viber/Telegram methods, and submit the contact together with the availability request. Do not reveal the selected contact destination before consent; show exactly where the reply will be sent only after the user submits the modal.

Personal-data preference: do not show placeholder copy about future phone-number changes or SMS confirmation under the login phone. Keep optional passport and registration details in a collapsed disclosure within personal data, persist them with the customer profile, and position them as advance preparation for future contract documents.

Catalog custom-search preference: when catalog filters return no cars and when a user reaches the end of the results, show a light, white-background CTA offering individual vehicle sourcing, including cars not currently in the catalog. The CTA opens a modal with a vehicle-preferences textarea and phone input; do not use a dark or inverted treatment.

Search filter preference: use the home-page filter as the shared pattern across home and catalog. Keep the “Все / Электромобили / Гибриды” tabs plus brand, model, year, price, and mileage in the primary area. Place body type and optional advanced fields in the collapsible section below. In the lower action row, align the “Ещё фильтры” control left and the primary CTA right; use the red accent color.

Filter-field spacing preference: keep a clearly readable vertical gap between each filter label and its selected value; avoid label/value text appearing visually stuck together in both themes.

Expanded search grid preference: on desktop, keep the expanded filter fields in the same five-column grid as the primary filters, leaving unused grid cells empty rather than redistributing fields into fewer, wider columns.

Default search filter preference: initial year, price, and mileage values must be explicitly unbounded (“Любой …”), so the initial result count equals the full catalog total. Apply limits only after the user selects one.

Advanced catalog filter preference: show drive, owners, and insurance-history filters only when those fields are present in the returned dataset. Do not offer a range filter while range coverage is incomplete. Disable model selection until a brand is selected.

Expanded filter layout preference: keep the primary “Показать … авто” action in the lower action row both when “Ещё фильтры” is collapsed and expanded.

Vehicle card preview preference: on pointer-hover desktop layouts, split the image into 4–5 horizontal cursor zones that switch among the first listing photos, with a compact segmented position indicator similar to Auto.ru. Keep touch previews stable.

Featured card pricing preference: do not show the “под ключ до Минска” label on home-page vehicle cards. Keep the price left-aligned with the title and metadata, and use compact vertical spacing between card text rows.

Featured card content preference: do not show the source price in Chinese yuan on home-page vehicle cards.

Listing age preference: show how long a listing has been on Guazi only when Guazi supplies an actual publication/listing timestamp. Never substitute the local import, price-history, sitemap last-modified, or monitoring first-seen timestamp.

Freshness-label preference: do not show internal refresh, import, check, or update timestamps in the customer-facing UI, including labels such as “Актуализировано”, “обновлено”, and “Источник проверен”.

Vehicle detail facts preference: place characteristics in a single vertical icon-led list directly below the gallery, followed by “Что указано в объявлении” in the same row-based layout.

Vehicle fact typography preference: use larger, comfortably readable text for characteristic labels and values—16px on desktop and 15px on mobile.

Localization preference: show Chinese listing cities in Russian. Present source letter grades as plain-language vehicle-condition labels; do not expose the source name in catalog result metadata.

Catalog navigation preference: when returning from a vehicle page, preserve the catalog filters, sorting, number of loaded results, and scroll position. The in-app “back to catalog” action should use the same history entry when the vehicle was opened from the catalog.

Catalog loading preference: render the catalog in batches of 24 vehicles and automatically load the next batch as the user approaches the end of the current results; do not render every matching vehicle initially or use a regular “Показать ещё” button. In the results summary, show the total number matching the active filters rather than the number of cards loaded so far.

Vehicle estimate card preference: keep the landed-cost estimate fully expanded in the light sidebar card, including line items, total, and disclaimer. Show one approximate midpoint price instead of ranges in both the vehicle sidebar and order detail, and separate “Итого” with a simple line instead of a bordered surface. Keep the 35–50 day delivery section below it as a collapsed chevron disclosure, and place the yellow “Заказать отчёт” CTA at the bottom.

Estimate-description preference: keep explanatory copy for individual cost rows behind an info icon beside the row title. Show it only while the icon is hovered and hide it immediately when the pointer leaves; do not toggle it by click.

Vehicle import policy: for future imports, import only model-year 2023+ electric vehicles from the home-page popular brands plus Leapmotor, Tesla, Mercedes-Benz, Lynk & Co, Mazda, and Toyota. Never use this policy to clean or remove existing catalog entries; existing hybrids and all other existing cars remain untouched. Keep the executable policy in `config/import-policy.mjs` and the human-readable rules in `IMPORT_POLICY.md` synchronized.
