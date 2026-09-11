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

In every regular refresh, cards that have only their import-time check now take
the first available detail slots inside their brand after any unfinished tail
from the previous circle. This does not increase the source request allowance;
it prevents older routine checks from pushing newly imported cards to the back
of the queue for several circles.

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
