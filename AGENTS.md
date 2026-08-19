# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

Typography preference: prioritize comfortable readability over ultra-compact UI. Keep every rendered text size at 16px or larger across the project, including supporting copy, controls, labels, badges, and mobile layouts. The muted “Срок доставки до Минска” label, the “Основная информация” label, and the non-offer disclaimer in the vehicle estimate card are explicit sub-16px exceptions; do not introduce other smaller sizes unless the user explicitly requests them. Match the delivery label typography to the “Основная информация” label instead of uppercasing it.

Authentication modal preference: present login and registration as a centered modal over the current page without changing its scroll position. Keep only a centered heading above the tabs, with no eyebrow or supporting description. Use darker dark-theme inputs and tab rail, and give the close control a lighter circular surface. Animate the modal's height smoothly when switching between login and registration. Keep the registration consent selected by default and its sentence compact enough for one desktop line with plain underlined links; this consent line is an explicit sub-16px typography exception.

Vehicle estimate density preference: in the detail sidebar, lead the estimate with the final landed-price figure aligned left and do not label it “Итого” or show a “Предварительный расчёт” heading. Keep intermediate labels and prices slightly smaller, omit dividers between them, and render the non-offer disclaimer as an extra-small plain text line without an icon.

Russian typography preference: prevent short Russian prepositions and conjunctions from hanging at the ends of lines throughout the rendered interface, including dynamic content. Keep the shared typography processor enabled instead of relying only on manually inserted non-breaking spaces.

Brand color preference: use red `#EE1C25` for brand accents, links, icons, and active states instead of orange. Use yellow `#F4D90E` with dark text for all regular primary CTA buttons. Preserve red for destructive actions where it communicates danger.

Outline color preference: never use red for borders, outlines, focus rings, or selection rings anywhere in the product. Keep red for text, icons, fills, and semantic danger accents only; use the shared neutral `--focus-ring` token for accessible focus indication.

Select-search focus preference: keep the search field inside an open select to one thin neutral 1px border only. Do not add an outer focus shadow or a second ring; use `--line-strong` for the focused border.

Select opening-focus preference: opening any searchable select must keep focus on the select trigger instead of automatically focusing the search field; users may focus search explicitly by tapping it or navigating to it with the keyboard.

Favicon preference: use a compact red `#EE1C25` favicon with a centered lowercase white `e` rendered as the Comfortaa 700 glyph from the customer-facing wordmark.

Vehicle gallery preference: clicking the main image should open an immersive modal with a vertical photo stream similar to Auto.ru. On desktop, keep a sticky left-side thumbnail rail for quick navigation and expose the full thumbnail set; on mobile, support horizontal swipe navigation directly on the main gallery. Keep the inline gallery’s previous/next arrows dark on their translucent white circular buttons in both themes so the icons remain legible over photos.

Gallery modal header preference: keep the vehicle title/count close to the left edge and the close control close to the right edge with a compact, symmetrical safe inset instead of centering them to the narrower gallery content width.

Visual QA preference: do not run browser-based visual checks, take implementation screenshots, or perform design-QA comparisons unless the user explicitly asks. The user reviews visual changes manually. Validate changes with build, tests, and non-visual checks only.

Che168 bulk-import preference: run **import v2** — `npm run importv2` (`scripts/import-v2.mjs`), documented in `IMPORTER.md`. It solves the bot challenge once in Playwright Chromium and then reads the site's own React Flight endpoint (`RSC: 1`), where `brandid` and `page` are honoured server-side; discovery and detail reads run concurrently and every `--batch` accepted cards are written to both the static catalog and PostgreSQL. Reach for the v1 DOM-scraping runner (`scripts/import-che168-browser.mjs`) only if that endpoint stops answering. The guidance below describes v1 and still applies to it: use the **Incomplete Reports** catalog and treat client-rendered listing cards as the discovery source of truth; the plain SSR/embedded list payloads may be stale or repeated (the Flight responses paginate honestly, so v2 does not need the sort-order recovery trick). Discover by brand, split large brands into model/series feeds when that improves coverage, use the site's `page` parameter/client pagination, and deduplicate every candidate by the external listing ID. Use multiple sort orders only to recover listings that normal pagination does not expose. After discovery, parse detail cards in parallel and keep the 2020+, pure-electric import policy. Import counts are approximate targets: a slightly larger or smaller valid batch is acceptable. For routine bulk imports, skip browser visual QA and the full test suite unless explicitly requested; run only fast syntax, data-integrity, static-catalog/PostgreSQL count, and relevant parser checks. The user will inspect the rendered catalog visually.

Interaction motion preference: use subtle, immediate microinteractions without delay. Keep select/dropdown, accordion, burger-menu, caret, and currency-switch motion in the 140–200ms range with gentle fade, short translate/scale, or rotation; avoid layout jumps and honor `prefers-reduced-motion`.

Primary loading-state preference: use a compact spinner and short muted label centered in the available viewport instead of an oversized text-based loading hero.

SEO appearance preference: SEO work must not change the existing visual design, layout, spacing, typography, or visible component treatment. Semantic link and routing changes must preserve the previous computed appearance, and new indexable routes should reuse existing product UI rather than introduce new page designs.

Home vehicle feed preference: show a randomized feed with 4 cards per row on desktop. Initially show 5 rows (20 cards), then append another 20 cards only when the user clicks “Показать ещё”; do not auto-load on scroll. Do not show the “Карточка доступна” status label anywhere in the product.

Home catalog-section preference: title the home vehicle-feed section “Каталог”, keep its “Все автомобили” link on one line on mobile, and align the heading and link text to the same baseline.

Home quick-search count preference: when every quick-search filter is at its default, derive the CTA count from the full catalog total, round it down to hundreds, and append “+” (for example, 3857 → “Показать 3800+ авто”); after any filter is selected, show the exact matching count.

Mobile home-hero preference: center the main heading and render the benefits beneath it as centered regular-weight muted text separated into short sentences with periods, without check icons or bullet styling.

Home hero-benefit copy preference: use “Полное сопровождение” as the third benefit instead of “Оплата без посредников” on both mobile and desktop.

Mobile vehicle-type tabs preference: keep “Все / Электромобили / Гибриды” fully visible in one row without horizontal scrolling. Use hug-content widths rather than stretching the tabs across the filter, and tighten only their internal horizontal padding so the row fits naturally.

How-it-works hero visual preference: replace the right-side “Ваш путь” summary card with the transparent `public/illustrations/how-it-works-hero.png` artwork sourced from `img1.png`. Show the entire artwork with `object-fit: contain`, without adding a background panel, and keep it responsive on mobile and desktop.

How-it-works hero-copy preference: use the heading “Покупка авто из Китая — всё под контролем” and keep only the primary “Выбрать автомобиль” CTA; do not show the secondary “Посмотреть этапы” link.

How-it-works process-step preference: present every stage as a separate gray rounded card with an 8px gap. In the light theme, keep the icon tile inside each step white rather than pale red; use a neutral gray tile in the dark theme. Use larger 24px step numbers and concise descriptions that stay on one line at desktop widths, while allowing natural wrapping on mobile.

How-it-works section-spacing preference: keep the vertical gap between the three-item proof strip and the “Пять этапов” section compact—approximately half the original spacing (85px total on desktop), with proportionally reduced spacing at narrower breakpoints.

Information-page CTA preference: do not invert the closing catalog CTA to a dark block in the light theme. Use the shared light-gray soft surface with normal dark text and muted supporting copy; preserve the yellow primary button.

Mobile popular-brands preference: center the catalog arrow inside a compact square control aligned with the section heading, and keep generous vertical spacing between brand rows.

Home conversion content preference: use the space between the vehicle feed and footer for concise trust, objection-handling, and SEO content. Prioritize a transparent order journey and practical answers over generic promotional claims.

Home FAQ appearance preference: place the entire FAQ section inside a rounded light-gray container, use 18px question text, and present every question as a separate rounded white card instead of using divider lines. Keep the question summary at the same 62px minimum height and preserve identical top and bottom padding in both collapsed and expanded states so its title never jumps. Size FAQ grid rows to their content and align the list to the top so closed cards never stretch to fill the height of the intro column. Keep expanded answers inside their question card, render “Все вопросы и ответы” as a regular yellow primary CTA, and do not show a sourcing CTA below the questions.

Home trust-strip preference: lead with “Сопровождаем до выдачи” and the supporting line “От подбора до получения в Минске”; use 18px headings and keep them short enough to remain on one line at desktop widths. Present the three trust points as separate rounded cards on a light-gray surface with each icon inside its own white tile.

Home utility-service preference: place a compact Auto.ru-inspired row of automatic service shortcuts directly below the home search panel, with smaller illustrations and a reserved wide banner slot on the right at desktop widths. Keep the five labels short and on one line: “Таможня”, “Подбор”, “Сравнить”, “Разбор”, “Обслуживание”; size the adjacent banner to the resulting single-row card height. Use original, soft 3D automotive illustrations with borderless tiles; describe only calculations and catalog analysis the product can actually perform, and never claim automatic battery-health diagnostics without BMS or manufacturer data.

Popular-brands preference: keep the home-page brand list in stable alphabetical order by its displayed Latin-script name; do not reorder it by listing count.

Popular-brand count preference: show the current listing count immediately to the right of every brand name in the home-page popular-brands grid. Keep it secondary with smaller 16px typography, muted color, and regular weight; source counts from the same local/API brand metadata already used by the catalog.

Product brand preference: use `evcars.by` as the customer-facing product name and keep brand-aligned demo contact handles on the `evcars.by` identity.

Header-navigation preference: do not show the “Доставленные авто” link in the main header navigation; keep delivered cases accessible elsewhere in the site.

Header appearance preference: keep the header container borderless and use the same solid background token as the page (`var(--page)`) in both themes so scrolling content does not show through. Do not use backdrop blur. Use a larger wordmark and keep primary navigation inside a burger menu instead of inline links. Avoid outlined controls in the header; prefer clean surfaces and filled soft backgrounds only for individual controls where separation is needed. Keep the burger-menu button on the same soft filled background as the other header controls in both themes.

Mobile header-control preference: place the favorites and account icon buttons on the same soft gray filled blocks as the burger-menu and theme controls, with matching compact dimensions and corner radii.

Mobile header-menu preference: keep the burger-menu popover compact and content-width rather than stretching it across the viewport; align it to the viewport's left safe inset and cap its width against both safe insets so it never creates horizontal page overflow on narrow devices. Place the currency switch inside the burger menu on mobile, but keep the theme toggle visible in its original header position.

Header menu-surface preference: in the dark theme, render the opened burger-menu popover slightly lighter than the standard dark card surface so the floating menu remains clearly visible against the page; use a dedicated surface token rather than changing every panel.

Vehicle-card consistency preference: use the shared catalog `CarRow` layout for the home-page vehicle feed only at the mobile breakpoint. On desktop, preserve the original four-column `FeaturedCard` grid rather than showing catalog rows.

Neutral surface hierarchy preference: keep grouped gray surfaces low-contrast against the page. In the dark theme, use `#1b1e22` for grouped/soft surfaces and `#22262b` for cards that are white in the light theme, so nested cards are only slightly lighter than their container; use `#202329` for intermediate control surfaces. Give shared search selects their own higher-contrast `--filter-field-bg` token (`#292d34` in dark and `#f4f5f6` in light) instead of inheriting the generic surface token. Give disabled selects a separate, still-visible `--filter-field-disabled-bg` (`#24282e` in dark and `#eef0f2` in light) so they remain distinguishable from the grouped container without looking active. When a select opens, increase its surface contrast slightly via `--filter-field-open-bg` (`#30343c` in dark and white in light); never make the open trigger darker than its resting state. Dark search panels should be borderless. In the light theme, preserve the existing white-card-on-`#eff1f3` hierarchy.

Dark card-border preference: keep featured vehicle cards, catalog information side cards, the vehicle quick-information card, and the estimate card borderless in the dark theme. Use surface contrast and spacing for separation; the outlined secondary action inside the catalog side card should also become a filled borderless control. Preserve their borders in the light theme.

Logo preference: render the customer-facing `evcars.by` logo from the supplied SVG artwork, not from live type — `public/logo-light.svg` and `public/logo-dark.svg` (a red badge plus the wordmark). Ship both variants in the markup and let CSS reveal the one matching `data-theme`, since the theme is resolved before first paint. Size every placement through the `--wordmark-height` custom property so the artwork keeps its own proportions.

Theme preference: support both light and dark themes with a compact theme toggle in the main header. Remember the explicit device-local choice, otherwise follow the operating-system preference. Preserve the red brand accent and yellow primary CTAs in both themes.

Company-presence preference: the prototype should feel like a real Minsk-based company, with a substantial footer, office/contact page, legal entity details, social links, and policy pages. Keep temporary company details centralized in `src/company-data.js` so they can be replaced before publication.

Company-address preference: show the Minsk street address without an office number.

Company-details preference: do not show a settlement account number in the public company details.

Company-phone preference: show the centralized temporary demo phone number as the third contact method on the contacts page and in the footer. Keep it in `src/company-data.js` so it can be replaced before publication.

Contact-map preference: embed a responsive Yandex Maps frame for the Minsk office directly below the contact-method row. Use a native red Yandex placemark tied to the office coordinates so it moves with the map; do not overlay a separate HTML marker or open the address information card.

Contact-hero preference: match the two-column proportions of the “О сервисе” hero, with the constrained text block on the left and the same automotive illustration on the right. Do not show a separate office card or map button; place “Офис в Минске” and the address/hours directly in the supporting copy below the title.

Dark contact-surface preference: remove the outer outlines from the contact-method group and embedded map in the dark theme. Keep internal dividers where they separate content.

Company-details appearance preference: keep the requisites section visually separate from the footer. Place its content inside a rounded soft-gray card on the page background, leave a clear page-colored gap before the footer, and use slightly stronger dividers between detail rows.

Company-details copy preference: title the requisites section “Фиксируем все детали договором”.

Footer appearance preference: keep the site footer light, using a pale neutral surface with dark headings and readable gray secondary text; do not use a dark inverted footer. Keep the footer itself borderless.

Footer navigation preference: omit “Доставленные авто”, “Контакты и офис”, “Реквизиты”, and “Гарантии” from the footer on both mobile and desktop. Keep their routes available elsewhere; this preference concerns only footer navigation.

Footer grouping preference: combine the former “Компания” and “Покупателю” link groups into one “Навигация” column on mobile and desktop. Keep the combined navigation full-width within the mobile footer grid and remove the unused desktop column.

Footer contact-link preference: omit “Оплата и договор” from the combined navigation column and place a “Контакты” link at the top of the “Связаться” column before the public email and address.

Footer contact-link typography preference: style “Контакты” like an ordinary footer navigation item such as “О компании”; reserve the stronger primary-text treatment in the “Связаться” column for the email address only.

Service-navigation preference: label the `/how-it-works` page “О сервисе” everywhere in the visible interface and generated navigation. Hide the separate “О компании” (`/about`) page from header, footer, and generated navigation while preserving its route for old direct links.

Footer social-icon preference: place slightly enlarged, monochrome social icons in consistent white circular buttons without outlines.

Delivered-case preference: use structured delivery stories as trust proof, including route, duration, mileage, final landed cost, decision context, and a customer quote. Keep all temporary case data centralized in `src/delivery-cases.js` for replacement with verified cases.

Commercial-information preference: explain payment stages, contract timing, responsibility boundaries, guarantees, and common questions in dedicated pages linked from the footer. Keep temporary commercial terms and FAQ content centralized in `src/purchase-info.js` and review them with legal and operations before publication.

Lead-form consent preference: every form that collects a name, phone number, email, or messenger handle must require explicit consent before submission and link directly to the privacy policy and site terms. Reuse one consent component so wording and validation remain consistent.

Vehicle-report entry preference: availability CTAs on both the vehicle detail and the first account-order stage temporarily open the shared “Автомобиль временно недоступен” placeholder modal and do not submit a request.

Account preference: the vehicle order is one section of a complete customer account, not the whole account. Use a left sidebar—not top tabs—for the current order, favorites, personal data, and account settings. The order itself stays simple and lightweight, with one visible vehicle and four sequential stages: listing availability check, optional inspection, delivery agreement, then payment and purchase. Keep the first availability-check stage permanently expanded rather than making it a disclosure, and allow one optional manager-comment field there. Use the same rounded container treatment as the rest of the product. Present the selected vehicle as a compact but informative mini card with real metadata and a prominent approximate landed price; do not add an “Ориентировочно” caption beside that price. Make the vehicle name a link that opens its catalog detail page in a new tab, and make the arrow link use the same target. Hide the “Убрать автомобиль” action inside a kebab menu, keep it available at every order stage, and require confirmation in a modal that warns about deleting the order progress. Keep the mini-card supporting typography comfortably readable rather than tiny. Avoid multi-field forms inside the stages; use the saved account details and one clear action per decision.

Order availability-gate preference: submitting the listing-availability request must not unlock the inspection stage. Keep inspection locked until an internal/admin workflow explicitly confirms that the vehicle is still available; the customer-facing API must not expose that confirmation transition.

Order-contact preference: do not show a persistent contact card between the vehicle and order stages. While availability requests are disabled, do not collect or submit contact data from the “Уточнить актуальность” action.

Personal-data preference: do not show placeholder copy about future phone-number changes or SMS confirmation under the login phone. Keep optional passport and registration details in a collapsed disclosure within personal data, persist them with the customer profile, and position them as advance preparation for future contract documents.

Catalog custom-search preference: when catalog filters return no cars and when a user reaches the end of the results, show a light, white-background CTA offering individual vehicle sourcing, including cars not currently in the catalog. The CTA opens a modal with a vehicle-preferences textarea and phone input; do not use a dark or inverted treatment.

Search filter preference: use one shared `VehicleSearch` component for the home page and catalog so their markup, styling, controls, and behavior remain identical. Only the home-page instance may have a maximum-width constraint; the catalog instance fills its available width. On desktop, keep the “Все / Электромобили / Гибриды” tabs plus brand, model, year, price, and mileage in the primary area, with body type and optional advanced fields in the collapsible section below. On mobile, keep only brand and model in the primary area and move year, price, mileage, body type, and available advanced fields into a bottom action sheet opened by “Ещё фильтры”. In the lower desktop action row, align the “Ещё фильтры” control left and the primary CTA right; use the red accent color.

Mobile search action-layout preference: keep “Ещё фильтры” hug-content at the left instead of stretching it across the panel. When “Сбросить” is visible, align it to the far right of the same row at the same 40px control height. Keep the yellow search CTA on its own full-width row below with a 14px vertical gap.

Mobile filter-sheet close-control preference: in the dark theme, keep the square close-button surface visibly lighter than the action-sheet background, with a slightly brighter hover state; preserve the current size and radius.

Mobile filter-sheet action preference: when “Сбросить” is shown beside “Готово”, give both buttons equal half-row width and the same 52px height. Style “Сбросить” as a filled neutral secondary action with the shared 10px radius and equally strong label weight.

Search reset preference: whenever any primary, type, or advanced vehicle-search filter differs from its default, show a quiet borderless “Сбросить” action immediately before the primary CTA. Reset every filter, including hidden advanced values and the dependent model, on both the home page and catalog; hide the action when all defaults are active.

Catalog model-chip preference: after a catalog brand is selected, show a single horizontally scrollable row of quick model chips between the shared search panel and results. Include “Все модели”, derive the remaining models from the same filtered local/API metadata as the model select, update results immediately, and use a soft filled active state without an outline. In the light theme, give inactive chips a dedicated medium-gray surface and make their hover surface visibly darker so neither state blends into the white page.

Catalog result-card density preference: keep desktop listing photos compact enough for a shorter row and a wider information column. Size the body-type chip from its content instead of stretching it; truncate only when space is genuinely insufficient. Treat the China price as secondary muted information, and give the favorite control an immediate soft-red hover state without a delay or transition.

Filter-field appearance preference: keep shared search fields minimal by hiding visible labels and showing only the bold selected value with its chevron. Preserve each hidden field name as an accessible label.

Filter option-count preference: in the searchable brand and model dropdowns, show the matching listing count beside every option, including “Все марки” and “Все модели”. Keep counts small, muted, and visually secondary; do not append them to the closed select trigger or change the underlying filter value.

Expanded search grid preference: on desktop, keep the expanded filter fields in the same five-column grid as the primary filters, leaving unused grid cells empty rather than redistributing fields into fewer, wider columns.

Default search filter preference: initial year, price, and mileage values must be explicitly unbounded (“Любой …”), so the initial result count equals the full catalog total. Apply limits only after the user selects one.

Advanced catalog filter preference: show drive, owners, insurance-history, and plain-language vehicle-condition filters only when those fields are present in the returned dataset. Do not offer a range filter while range coverage is incomplete. Disable model selection until a brand is selected.

Expanded filter layout preference: keep the primary “Показать … авто” action in the lower action row both when “Ещё фильтры” is collapsed and expanded.

Vehicle card preview preference: on pointer-hover desktop layouts, split the image into 4–5 horizontal cursor zones that switch among the first listing photos, with a compact segmented position indicator similar to Auto.ru. Keep touch previews stable.

Mobile catalog-card gallery preference: replace the single large hover-preview image in each mobile catalog result with a compact 138px-tall horizontally swipeable inline photo strip showing two images plus a small reveal of the third. Let the gallery viewport span the full card width without persistent corner clipping, but keep 6px padding inside the scroll track so the left inset appears only at the initial position and the right inset only at the final position; intermediate photos should scroll flush to the card edges. Apply the 9px left corner radius only to the first photo and the right corner radius only to the last photo, so each radius scrolls away with its respective edge image. Let users swipe through the same first five listing photos used by the desktop hover preview, distinguish horizontal swipes from taps so swiping never opens the detail page, use a 2px gap, hide the desktop segmented indicator, and keep the photo-count badge over the strip.

Mobile catalog-card gesture preference: keep horizontal swiping inside the inline photo strip, but always allow a vertical gesture started over the strip to scroll the page normally.

Mobile catalog-card layout preference: present every result as its own compact, moderately rounded low-contrast card instead of separating results with divider lines. Put the vehicle title at a compact 16px size and 600 weight and the landed price at a visibly reinforced 800 weight at the top with the favorite control in the upper-right corner, followed by the photo strip, 15px summary, small low-padding 14px medium-weight specification blocks with 15px icons, and 15px location; these mobile card details are explicit sub-16px typography exceptions. Do not repeat the title or price below the gallery. In the dark theme, keep the favorite control and specification blocks visibly lighter than the card at rest instead of revealing their contrast only on hover.

Similar-vehicle preference: select detail-page recommendations by the same body type and a comparable landed-price budget, always excluding other listings of the current make and model. Rank matches deterministically by price proximity rather than randomizing them.

Featured card pricing preference: do not show the “под ключ до Минска” label on home-page vehicle cards. Keep the price left-aligned with the title and metadata, and use compact vertical spacing between card text rows.

Featured card content preference: do not show the source price in Chinese yuan on home-page vehicle cards.

Listing age preference: show how long a listing has been on Guazi only when Guazi supplies an actual publication/listing timestamp. Never substitute the local import, price-history, sitemap last-modified, or monitoring first-seen timestamp.

Catalog sorting preference: offer the sort options “Дешёвые”, “Дорогие”, “Новые объявления”, “С наименьшим пробегом”, “С наибольшим запасом хода”, “Новые по году”, and “Старые по году” in that order. Do not show a “Старые объявления” option. New-listing sorting must use the actual source publication timestamp rather than an internal refresh timestamp; range sorting must place listings without range data last.

Catalog sort-control sizing preference: size the visible sorting trigger to its selected label rather than the dropdown width. Keep the dropdown independently wide enough for the longest sorting option.

Catalog sort-menu preference: show all sorting options at once without an internal scrollbar when the complete list fits comfortably in the menu.

Dark catalog sorting appearance preference: remove visible outlines from both the sorting trigger and its open dropdown menu in the dark theme; preserve the existing outlined treatment in the light theme.

Mobile catalog result-tools preference: hide the “Подходящие варианты” label, promote “N найденных” to the same 16px/700 primary typography, and use compact 14px text in the sorting trigger and its options; the sorting text is an explicit sub-16px mobile exception.

Mobile scroll-to-top preference: after the user scrolls more than 360px down the home page or catalog, smoothly reveal a compact soft-gray square arrow button fixed to the lower-right safe inset. It should smoothly scroll to the page top, remain hidden on desktop, and honor reduced-motion preferences.

Catalog result-card layout preference: keep the desktop listing photo slightly narrower so the information column has enough room to keep the battery, range, and body-type chips on one row when the available catalog width permits it.

Catalog result-card hover preference: treat the hovered result as one rounded surface, visually remove the divider immediately above and below it without shifting layout, and keep its specification and action chips distinct from the hover background with a contrasting surface token. Apply and remove the card-hover state immediately, without a delay or transition.

Catalog result-card action preference: do not show a separate “Подробнее” button because the entire result card already opens the vehicle. On card hover, immediately color the vehicle-title link with the brand accent.

Catalog result-card specification preference: keep the battery, range, and body-type chips in one row; allow only the body-type chip to shrink and truncate its label with an ellipsis when space is insufficient. Use slightly smaller 15px text inside these compact chips.

Freshness-label preference: do not show internal refresh, import, check, or update timestamps in the customer-facing UI, including labels such as “Актуализировано”, “обновлено”, and “Источник проверен”.

Vehicle detail facts preference: place characteristics in a single vertical icon-led list directly below the gallery, followed by “Что указано в объявлении” in the same row-based layout.

Vehicle detail breadcrumb preference: use the trail “Главная → Автомобили из Китая → Марка → Модель и год”. Keep the brand as its own catalog-filtering level, do not repeat it in the final model crumb, and use a moderately dense weight across the breadcrumb trail.

Vehicle quick-summary preference: above the estimate card in the detail sidebar, show a separate compact rounded card titled “Основная информация” in small muted text. Below it, use a slightly denser font weight and split the comma-separated summary into two paragraphs: year, mileage, and powertrain first; electric/combined range, drivetrain, battery capacity, and horsepower second. Do not show transmission or body type there. Translate common values into concise Russian wording and omit unavailable facts rather than inferring them.

Mobile vehicle quick-summary preference: hide the “Основная информация” sidebar card on vehicle-detail pages at mobile widths; keep it visible on desktop.

Mobile vehicle availability-CTA preference: keep “Уточнить актуальность авто” in a compact floating bottom panel until the original CTA inside the estimate card enters the viewport. Hide the floating duplicate while the original CTA is visible or its modal is open; both controls must trigger the same action.

Vehicle fact-list typography preference: use 17px text for labels and values on desktop. On mobile, render each fact as one compact 16px row with a small icon, label, and right-aligned value instead of stacking the value below the label.

Vehicle fact typography preference: keep characteristic labels and values comfortably readable while prioritizing compact mobile density—17px on desktop and 16px on mobile.

Mobile vehicle-detail heading preference: place the vehicle name above the landed price in the hero. Render the name like compact supporting copy at 16px/600 in the primary white text color, and give the price the former large-title treatment at 27px/800.

Mobile vehicle-detail hero preference: hide the powertrain, drivetrain, and mileage summary beneath the hero price, and render “Назад к каталогу” as a compact soft-gray filled pill with its arrow instead of a plain text control. Keep the pill closer to the header than to the vehicle title, using a 12px top margin and 20px bottom margin.

Localization preference: show Chinese listing cities in Russian. Present source letter grades as plain-language vehicle-condition labels; do not expose the source name in catalog result metadata.

Catalog navigation preference: when returning from a vehicle page, preserve the catalog filters, sorting, number of loaded results, and scroll position. The in-app “back to catalog” action should use the same history entry when the vehicle was opened from the catalog.

Catalog loading preference: render the catalog in batches of 24 vehicles and automatically load the next batch as the user approaches the end of the current results; do not render every matching vehicle initially or use a regular “Показать ещё” button. In the results summary, show the total number matching the active filters rather than the number of cards loaded so far.

Vehicle estimate card preference: keep the landed-cost estimate fully expanded in the light sidebar card, including line items, total, and disclaimer. Show one approximate midpoint price instead of ranges in both the vehicle sidebar and order detail, and separate “Итого” with a simple line instead of a bordered surface. Keep the 35–50 day delivery section below it as a collapsed chevron disclosure, and place the yellow “Уточнить актуальность объявления” CTA at the bottom.

Vehicle delivery-detail preference: keep the expanded delivery disclosure concise. Do not show descriptive paragraphs beneath individual stages; put an approximate duration directly in each stage heading, using 2–4 days for purchase/preparation, 3–6 days for logistics within China, and 30–40 days for the route to Minsk. Keep the opening and variability notes to one short sentence each.

Estimate-description preference: keep explanatory copy for individual cost rows behind an info icon beside the row title. Show it only while the icon is hovered and hide it immediately when the pointer leaves; do not toggle it by click.

Vehicle import policy: for future imports, import only model-year 2020+ electric vehicles from the home-page popular brands plus Leapmotor, Tesla, Mercedes-Benz, Lynk & Co, Mazda, and Toyota. Never use this policy to clean or remove existing catalog entries; existing hybrids and all other existing cars remain untouched. Keep the executable policy in `config/import-policy.mjs` and the human-readable rules in `IMPORT_POLICY.md` synchronized.

Vehicle quick-view preference: on desktop widths (min-width 981px), a click on a vehicle card opens a quick-view modal instead of navigating to `/cars/:id`. This applies to every card list — the home feed, the catalog (list and grid), and the similar-vehicles block on a vehicle page — except the favourites list, where the card keeps opening the full page. The page behind the modal keeps its state: catalog filters, order, and scroll position. The modal shows the same blocks as the vehicle page except breadcrumbs, the back button, and similar vehicles. Below 981px every card keeps navigating to the full page.

Quick view is an addition to the full vehicle page, never a replacement: keep an arrow beside the vehicle name in the modal that opens the full page, and keep every card a real link so ⌘/middle/right-click opens the full page in a new tab. A "Быстрый просмотр" switch sits beside the vehicle lists that use it — next to the "Каталог" heading on the home page and next to the result count in the catalog. It is on by default, persists in localStorage, and turning it off makes every card click go straight to the vehicle page. Show the switch only on desktop widths, and keep the switch itself compact next to the heading text.

Action-button tooltip preference: the round "Копировать ссылку" and favourite buttons show a small (14px) borderless tooltip that fades in above the button and centred on it, flipping below only when there is no room above; the copy button reports the result in the same tooltip.

Share-action preference: no share icon anywhere in the interface, including the vehicle-page action row.

Static vehicle-page policy: the build ships the public pages only. Per-vehicle prerendered pages, the per-vehicle JSON records, and the compact static catalog are generated exclusively with `SEO_VEHICLE_PAGES=1`. Production serves listings from the database API and keeps indexing disabled, so those 30 000 noindex pages and their JSON twins were pure build weight — a gigabyte in `dist/` and a build that read a 421 MB dump. Turning them back on for search engines means setting `SEO_ALLOW_INDEXING=1` alongside it and deciding where the build reads the catalog from: the local dump or the database. Without them the app has no static fallback data, so `npm run preview` needs the API running.

Catalog-dump policy: treat `public/data/cars.json` as an optional local artifact. It stays out of git, only importers create it, and the database is the source of truth for which listings are already known. A missing dump must never crash an importer: known ids come from the database, and the static copy is simply not written instead of being recreated from a single run.

Interface-chrome typography exceptions: the favourites counter badge (`.icon-label b`, `.header-actions .favorites-link > b`), the mobile menu currency switch (`.header-menu-currency button`), and the mobile type tabs (`.type-tabs button`) are explicit sub-16px exceptions, approved as interface chrome rather than reading copy. They are listed in `tests/typography.test.mjs`; every other text size stays at 16px or larger.
