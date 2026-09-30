# Guazi importer

This is a closed-pilot source adapter for Chinese EV and PHEV listings. Its default discovery mode is targeted: it reads only configured new-energy brand/model pages, then rechecks the powertrain in every detail card.

## What it imports

- Source ID and original URL
- Manufacturer, series, model, registration date
- Mileage, transfer count, city, and price in CNY
- EV/PHEV type, battery capacity/type, advertised range, and Guazi condition grade where present
- Original Guazi gallery URLs
- Local price history between import runs

## Commands

- `npm run import:guazi -- --limit=18 --scan=600` — targeted import (default)
- `npm run import:guazi -- --limit=1000 --scan=4000 --concurrency=10` — larger file snapshot with weighted priority brands
- `npm run import:guazi -- --discovery=sitemap --limit=18 --scan=600` — broad audit/fallback
- `npm run import:guazi-global -- --repair-fallbacks --limit=1000 --concurrency=5 --pure-ev` — re-fetch incomplete Guazi Global cards without adding new listings
- `npm run import:watch` — import immediately and repeat every six hours
- `npm run db:discover -- --limit=500 --scan=3000 --concurrency=8` — targeted discovery straight into PostgreSQL without replacing the static catalog
- `npm run db:schedule -- --limit=1000` — enqueue stale cards for incremental refresh
- `npm run db:expire -- --days=30` — hide cards not seen successfully for the retention window
- `npm run worker` — continuously consume refresh jobs (`npm run worker:once` handles one job)
- `npm test` — parser and site tests

When the API is available, the website reads paginated data from PostgreSQL. `public/data/cars.json` remains a static fallback for GitHub Pages. Import diagnostics are written to `runtime/import-report.json`. Reports stay out of `public/` on purpose: everything under `public/` is served to visitors, and the reports describe sources, proxy channels and error texts.

Guazi Global result-page previews are used only for discovery. A card is written to the catalog only after its product page yields a gallery with at least two original photos; incomplete reader responses are neither cached nor imported.

The Che168 Global pilot uses the **Incomplete Reports** layer (`vehicle_list=1`) in a connected browser because the public HTTP endpoint presents a JavaScript bot challenge. `scripts/import-che168-browser.mjs` exports the browser-backed pilot runner. It applies the same 2020+, electric-only, allowed-brand policy and requires a structured detail page with at least two original photos before appending a card. New Che168 imports retain every populated row from the detail page's grouped technical specification table in `technicalSpecs`; this uses the detail response already required for validation and does not add a source request. The catalog API omits this heavier block from list responses and returns it only on the individual vehicle endpoint.

### Specification language (2026-09-10)

All three Che168 import paths read vehicle details from `/en/detail/<id>`. The regular refresh keeps its established `/ru/used-cars` discovery session, filters, pagination, pace and request allowance; discovery supplies IDs and prices, never the technical specification sheet. This avoids changing the proven list walk just to change the specification language.

Che168's Russian detail response translates `Front-Wheel Drive (FWD)` into `Задний привод` for listings 59396664 and 59665828. The importers therefore pass `expectedLocale: "en"` to the parser and reject an unexpected Russian response rather than falling back to it. A language mismatch does not terminate the regular refresh. Existing saved Russian sheets remain readable for compatibility.

English specifications are stored unchanged; `src/spec-translations.js` translates the sheet when rendering, including fuel, transmission, suspension, warranties and descriptive trim wording. Proper names, model codes, tire sizes and unknown terms are preserved rather than guessed. The main numeric fields are extracted independently from the original values. System horsepower takes precedence over motor and engine horsepower when explicitly published; electric and combined range stay separate.

`tests/che168-english-import.test.mjs` uses sanitized live responses for nine vehicles (petrol, mild hybrid, EV, PHEV and range extender) to check parsing, Russian rendering, preservation of every populated row, and the database write boundary without writing to a real database. Historical catalog records are not rewritten by switching the import language; a separate, verified re-fetch is required to repair old records. No blanket rear-to-front replacement is safe.

### Import v2 — default Che168 bulk path

`scripts/import-v2.mjs` (`npm run importv2`) is the fastest route and the one to reach for first. Measured on the first full sweep: ~17,700 candidates discovered across 20 policy brands, imported at roughly 100 cards per 40 seconds with a 0.3% rejection rate.

It launches Playwright Chromium, loads the electric feed once so the bot challenge is solved, and from then on reads the site's own React Flight endpoint (`RSC: 1` header) instead of scraping rendered DOM:

- The list layer honours `brandid` and `page` **server-side**. Pages are stable, 24 items each, and `ssrPageIndex`/`ssrPageCount` report progress honestly, so brand feeds do not need the sort-order recovery trick. The plain HTML list is the layer that repeats stale pages — the Flight response does not.
- A detail Flight payload is less than half the weight of the detail HTML page and carries the same `ssrCarDetail`/`ssrSpecParam` data. Wrapping it as `[1,${JSON.stringify(text)}])` lets the canonical parser read it with no separate RSC code path.
- List items expose `fuelname`, so hybrids are dropped before a detail request is spent on them. The detail card stays the authority: the policy rechecks brand, model year, and powertrain there.
- Discovery and detail reads run concurrently. A 20-brand sweep is hundreds of list pages; discovering everything first would leave a long run with nothing written.
- Every `--batch` accepted cards are appended to `public/data/cars.json` **and** PostgreSQL, so an interrupted run keeps what it already earned. Nothing existing is replaced or filtered.

`config/che168-brands.json` caches the source's brand-id map (144 brands with electric listings, built once by probing the electric feed). Refresh it with `--refresh-map` when a new marque appears.

Commands:

- `npm run importv2 -- --limit=100` — one batch of 100
- `npm run importv2 -- --limit=20000 --batch=100 --concurrency=6` — full sweep of every policy brand, checkpointing each 100
- `npm run importv2 -- --limit=500 --brands=Deepal,Zeekr` — selected brands only
- `npm run importv2 -- --map-only --refresh-map` — rebuild the brand-id map
- `npm run importv2 -- --repair=range` — re-read cards already in the catalog whose named field never parsed, and fill it in place; nothing new is added
- `npm run importv2 -- --brands=AION,ORA --static=0` — write only to PostgreSQL, for when another importer is already running
- `--database=0` skips the PostgreSQL write; `--concurrency` above 6 starts drawing HTTP 429 from the source

After a large import, `npm run refresh -- --only-unverified --quiet` walks only
active Che168 cards whose displayed date still says “Added” without a later
“Updated” date. It uses a separate report and cursor, does not touch already
rechecked cards, does not discover or add new listings, and does not alter the
regular refresh circle. A card seen in the live source gets its current price
and landed estimate; a card missing from the list is marked sold only when its
own detail endpoint explicitly confirms that it is gone.

### Complete catalog refresh (2026-09-12)

The regular `npm run refresh` checks **all active Che168 listings present at the
start of the cycle**, including listings checked in the past and now stale.
Lists confirm prices and availability in batches. Every listing not seen there
gets a detail check, oldest first, even if a brand list was incomplete or the
brand is missing from the discovery maps. Absence from a list alone never means
sold. Unknown answers remain pending; they do not update the check date.

There is no default per-brand or per-run detail cap. Optional `--detail-per-brand=N`
and `--detail-limit=N` deliberately shorten a run; zero disables those checks.
`--skip-detail`, `--brands`, and other short-run options cannot turn outstanding
listings into a completed cycle. `--only-unverified` remains a separate, narrower
catch-up mode and never reports that the whole catalog was updated.

The version-2 cursor stores a fixed cycle start time. List confirmations are
saved before detail work; each successful detail result is committed before the
next request. After interruption, restart the same command: database check dates
exclude completed cards. Legacy cursors are upgraded by discarding their old
“brand visited” flags. A cycle closes only when no listings from its starting
snapshot remain unchecked and the brand queue is complete. New imports do not
extend that snapshot indefinitely. The next invocation starts the next cycle;
the script does not relaunch itself.

Deploy the code and install the service override with
`bash /srv/abcars/deploy/install-refresh-config.sh` to remove the old 4.5-hour
service timeout. This configuration-only installer neither starts the importer
nor enables any timer. Do not run concurrent refreshes sharing the same database
and browser profile. Scheduling and the first real run require the owner's
separate instruction. A short dry run still contacts the source; use the isolated
tests for offline verification.

Two importers must not share `public/data/cars.json`: each rewrites it whole from its own snapshot, so the second writer drops the first one's cards. `--static=0` keeps a run out of that file and parks its accepted cards in `runtime/che168-pending.json`, ready to be merged into the catalog once the other run finishes. A run always seeds its skip list from both the static file and the `listings` table, so cards that reached only the database are not fetched twice.

Keep concurrency modest: the source rate-limits, and the runner backs off on 429 rather than dropping a listing.

Requires Playwright (`playwright` devDependency plus `npx playwright install chromium`). Headless Chromium passes the challenge; no headed session is needed.

### Import v1 — browser-driven Che168 workflow (fallback)

1. Open the client-rendered **Incomplete Reports** feed for one brand with `vehicle_list=1` and the electric filter. Do not use the server/SSR list as the discovery authority: it can repeat an old page even when the visible catalog has changed.
2. Read IDs and preview fields from `[data-uc-car-card]`. Add `&page=N` or use the visible pagination controls, but verify progress by newly rendered external IDs rather than by the page number alone.
3. For a large brand, enumerate its visible model/series options and crawl each `seriesid` separately. This is usually faster and more complete than trying to force the entire brand feed through one pagination window.
4. If a large model still exposes only part of its count, repeat that model under the available sort orders (recommended, price, posting date, model year, and mileage). Merge all feeds by external listing ID.
5. Once discovery is complete, fetch detail pages in parallel; a browser does not need to open every vehicle manually. Reject cards that fail the 2020+, pure-electric, structured-fields, or gallery rules.
6. Write the same accepted set to `public/data/cars.json` and PostgreSQL. Keep the source name internal; do not add Guazi/Che168 labels to customer-facing cards.
7. Routine bulk verification is intentionally short: syntax/parser smoke checks, unique-ID and policy invariants, static/DB count parity, and `git diff --check`. The user performs visual catalog review; do not run the full build/test/visual QA cycle unless requested or importer code changed in a risky way.

Requested batch sizes are targets, not exact quotas. Import all valid cards found near the target when that avoids an artificial cutoff.

## Encar (Korea) importer (2026-09-29)

`npm run import:encar` (`scripts/import-encar.mjs`) and `npm run refresh:encar`
(`scripts/refresh-encar.mjs`) read the source with plain HTTP — no browser. The API is
geo-blocked for Belarus (CloudFront answers 404 to everything), so both scripts run
**only on our server in St Petersburg**; locally they stop with a clear
`ENCAR_GEO_BLOCKED` message. Parsing lives in `scripts/lib/encar-parser.mjs`, network
and list walking in `scripts/lib/encar-client.mjs`, tests with sanitized live responses
in `tests/encar-parser.test.mjs` (`tests/fixtures/encar-samples.json`).

How it works:

- Discovery walks slices «brand → model group → (year when a slice is deeper than
  10 000)» through `search/car/list/premium` (500 rows per page). Filters at the list
  layer: registration year ≥ 2020, price 700–13 000 만원 (≈ 5–96 k$), regular sale
  only (`SellType.일반`, no lease/rent), fuel limited to petrol / diesel / petrol
  hybrid / diesel hybrid / electric. **LPG, LPG+petrol, CNG, hydrogen are never
  imported** (owner decision 2026-09-29). Trucks (`화물차`) are rejected on the card.
- Every candidate costs three requests: the card (`/v1/readside/vehicle/<Id>`), the
  insurance summary (`/record/vehicle/<vehicleId>/summary` → accidents, owner changes,
  total loss) and the inspection sheet (`/inspection/vehicle/<vehicleId>` → accident /
  simple repair / flood flags). The last two are optional (`--history=0`).
- The card is the authority: brand via `canonicalImportBrand` (KG_Mobility_Ssangyong →
  KGM, Mini → MINI), model via `config/korean-model-names.mjs` (Korean and English
  spellings, generation prefixes and codes stripped, imported brands glued to the
  Che168 catalog names: «5시리즈 (G30)» → «5 Series», «GLC-클래스» → «GLC», «Santafe» →
  «Santa Fe», «쿠퍼» → «MINI»), then the usual `importPolicyViolation` (per-country
  brand list, model year ≥ 2020) and the landed-price ceiling (100 000 $).
- Record shape follows the contract below. Price: `sourcePrice` in won, `usdPrice` by
  the NBRB rate at import; engine as `"2.2L"` for display plus exact `engineCc` (2151)
  which `estimateLandedCost` prefers for the duty tiers; `manufactureDate` = first
  registration month (`yearMonth`) — the source has no production date and the Korean
  model year runs ahead of registration; `city` = the city word of the seller's address
  (`부산`, `수원`), which `src/city-names.js` and `korea-logistics.js` understand;
  `claims` / `claimsCount` / `owners` from the insurance summary, `incident` from the
  inspection sheet; photos as plain `https://ci.encar.com/carpicture…jpg` URLs, exterior
  frames first (the photo store keeps the first five on disk).
- Full sheet (`technicalSpecs`, same shape as the Che168 sheet, `sourceLocale: "ru"`):
  options from the source dictionary (only unambiguous codes — 001–008 repeat across
  sections), the inspection sheet by unit and by body panel, the insurance summary and
  EV battery data (`ev-battery`, fetched when the card says it exists: SOH → `batteryHealth`,
  capacity → `battery`, range → `electricRange`). Korean cars imported before this
  existed are completed with `import:encar -- --repair --limit=N`.
- Specifications reference (2026-09-29): Encar has no power, torque, acceleration,
  dimensions, weight or battery data (checked: API, page, JATO id — nothing). They come
  from a model/trim reference crawled from auto-data.net into `config/korea-specs/<brand>.json`
  (`npm run specs:korea -- --brands=Hyundai,Kia`, parser `scripts/lib/autodata-parser.mjs`,
  one page per second, resumable; generations and trims produced from 2019). The Korean
  Danawa catalogue does not answer from abroad. Matching (`scripts/lib/korea-specs.mjs`):
  brand → model (double names like «Grandeur/Azera») → generation by the code in the
  Encar series name («그랜저 (GN7)», «5시리즈 (G30)») or by year → trim by powertrain,
  fuel, displacement (±60 cc), drive and grade words («520i», «E220d», «Long Range»).
  Several trims that differ only in power → dimensions and weight are taken when they
  agree, power is left empty (`specSource.exact = false`). Matched values fill empty
  fields only: `horsepower` (also written into `engine` as `"2.5L 198HP"` so the power
  filter works), `torqueNm`, `acceleration`, `dimensions`, `curbWeight`, `doors`, tires,
  EV battery and range; the trim's full sheet is added to `technicalSpecs` as
  «Характеристики: …» groups with a first row naming the source. The client applies the
  reference on every read (`EncarClient({ specs })`); `npm run db:korea-specs` applies it
  to cars already in the database (`--all` recomputes, `--dry-run` only counts).
- Age: EAEU rules count a car's age from its production date; Encar publishes none, so
  `manufactureDate` is the first-registration month (later than production by weeks).
  The card shows the Korean model year (`formYear`).
- Writes go to PostgreSQL only (`importCars`, batches of `--batch`, default 50); the
  static `public/data/cars.json` is not touched. Reports: `runtime/encar-import-report.json`,
  `runtime/encar-refresh-report.json`.
- Refresh (`refresh:encar`): one list walk gives every live Id and its price. Active
  Encar rows seen with the same price get `last_seen_at`; rows with a changed price are
  re-read and rewritten (price arrow); rows missing from the lists are checked by card —
  404 or a non-`ADVERTISE` status means sold, otherwise the row is rewritten. Absence
  from a list alone never marks a car sold. New matching Ids are saved to
  `runtime/encar-discoveries.json`; `import:encar -- --discoveries` imports them without
  a second walk. There is no timer: the owner runs both scripts by hand (decision
  2026-09-29); `expireUnseenListings` keeps skipping `Encar` rows.

Commands (on the server, from `/srv/abcars`):

- `npm run import:encar -- --limit=50 --database=0` — dry run, nothing written
- `npm run import:encar -- --limit=2000 --brands=Hyundai,Kia,Genesis` — targeted import
- `npm run import:encar -- --limit=10000 --max-minutes=240` — long run, stops on time
- `npm run refresh:encar` — prices, sold cars, discoveries
- `npm run import:encar -- --discoveries --limit=600` — import what the refresh found
- `--concurrency` (default 2), `--pace` ms between requests (300), `--price-max` in 만원,
  `--year-from`, `--history=0`, `--detail-limit` (refresh only)

Before the first import: deploy the nginx block for `/photo/encar/` (it is in
`deploy/nginx-abcars-photo-location.conf` but on 2026-09-29 was **not yet on the
server**), and switch the source on in the cabinet when the catalog is ready
(`catalog_sources` has `('Encar', false)`). Disk: the photo store keeps **only the cover
frame** of Korean cars (≈ 50 KB each, 60–70 k cars ≈ 3.5 GB) until the disk is enlarged
(owner decision 2026-09-29); the other frames come through the bounded nginx cache. To
store five frames, set `PHOTO_STORE_ENCAR_FRAMES=5` in `/srv/abcars/.env.local` and
restart `abcars-photo-store` — the daily pass fetches the missing frames itself. Sold
Korean cars lose their stored frames a week later like everyone else (`photo-cleanup`).

### Record contract

- `source: "Encar"` (exact spelling — `originForSource`, `ORIGIN_SOURCES`, SQL filters and
  `SOURCE_CODES` all key on it), `id: "encar-<encar id>"`, `externalId: "<encar id>"`.
  Public address becomes `/cars/kr-<id>` (`src/listing-id.js`); never strip the `kr-`.
- Price: `sourcePrice` = price in KRW (integer won), `sourceCurrency: "KRW"`,
  `chinaPrice` = the same won amount (legacy column `price_cny` stores the price in the
  seller's currency; `NOT NULL`), `usdPrice` = USD at import by the NBRB rate
  (`sourceUsdRate("KRW")`) — the price-change arrow and `previous_price_usd` need it.
  Never store a CNY conversion: the estimate would come out ~190× too low.
- `engine` as `"2.2L"` plus `engineCc`; `manufactureDate` `"YYYY-MM"`; `city` as a single
  city word; `sourceListedAt` = Encar publication date in UTC (the source gives KST).
- Fuel: `type` (`ДВС`/`Гибрид`/`Электромобиль`) with `sourceFuelType` `Gasoline` /
  `Diesel` / `Hybrid` / `Diesel Hybrid` / `Electric` — the word «Hybrid» deliberately
  lacks «gasoline» so hybrids stay out of the petrol fuel filter.
- Claims: `claimsCount` (number) — the «без страховых случаев» filter accepts it next to
  the Chinese `0次理赔` strings.
- Photos: `ci.encar.com` frames go through our cache as `/photo/encar/v2/w600|w1200|w1920/<path>`
  (`src/photo-source.js`, store, warm-up) and the nginx block in
  `deploy/nginx-abcars-photo-location.conf`.
- Import policy: `importPolicyViolation` is per country; Korea additionally allows
  Genesis and KGM; Chevrolet/Renault stay excluded for both countries.

### Photo cache correction (2026-09-30, prepared locally)

Production requests for photos 42664100_019.jpg and 42124074_044.jpg reproduced a cache collision:
after requesting w600, w1200 and w1920 returned the same 600×338 JPEG bytes. Direct
Encar requests returned 1200×675 and 1919×1080. The origin rewrite removed the width
from `$uri`, which also served as the nginx cache key. The corrected block preserves
the sized `$uri` and uses a separate `$encar_path` only for the upstream request.

The `v2` path bypasses previously cached browser responses and permanent files that
may contain a small image under a large filename. Legacy URLs are mapped to v2 by
nginx; photo cleanup recognizes both generations. No existing files need deletion.

On the next **explicitly authorized deployment**, install the updated nginx photo
snippet before publishing the frontend (validate with `nginx -t` and reload). Also
sync `src/photo-source.js`, `scripts/lib/catalog-photo-store.mjs`, and
`scripts/lib/photo-cleanup.mjs` to their matching paths under `/opt/abcars-photo-store`
and restart any already-running photo-store/gallery-store services. Preserve their
queues and timer settings. New photos are fetched on demand; do not bulk-download or
purge old files. Run `ABCARS_TEST_NGINX=1 node --test tests/nginx-encar-cache.test.mjs`
with the local `nginx:stable` Docker image to verify both request orders, versioned
browser URLs, legacy URLs and persistent copies without accessing production.

## Local database and API

1. Run `npm run db:setup` to start PostgreSQL, apply migrations, and seed the current JSON snapshot.
2. Run `npm run dev:all` to start the API, autonomous crawler, and Vite together.
3. Run `npm run db:discover -- --limit=500 --scan=3000` periodically to add targeted EV/PHEV listings.
4. The crawler automatically schedules stale listings every 15 minutes and expires unseen listings daily. The standalone maintenance commands remain available for manual operations.

The database stores normalized vehicles, listings, photo URLs, price history, crawl runs/jobs, limited source snapshots, and order drafts. The catalog API filters and paginates in SQL, so the browser never downloads 200,000 cards. A saved order draft raises that listing to priority 100 in the refresh queue.

For a larger catalog, discovery and refresh are separate workloads: discovery adds new IDs in batches; workers recheck only stale or user-requested cards. Run multiple workers against the same database—jobs are claimed with `FOR UPDATE SKIP LOCKED`, so they do not duplicate work. Source payloads over 1 MB are not retained and only the three newest snapshots per listing/format remain.

Guazi may redirect a datacenter IP to a verification page. With no external channel configured, a database-backed circuit breaker probes recovery every ten minutes and prevents the whole queue from hammering the blocked source. Set `GUAZI_PROXY_URLS` or `GUAZI_CHANNELS_JSON` when approved channels become available; the source client keeps a listing on a stable channel and immediately fails over to the next one. CAPTCHA/403/429 responses do not consume a listing's retry budget.

The target catalog is in `config/guazi-targets.json`. Each target can have a series-name allowlist and a numeric priority. Higher-priority brands receive proportionally more discovery and enrichment slots. A detail card still has to contain `type:新能源`, so an ICE variant cannot enter the public snapshot merely because its series name matched.

## Production gate

The current adapter is for a closed pilot. Before public commercial launch, replace the index-oriented access with an approved partner feed or record written permission and image-use terms.
