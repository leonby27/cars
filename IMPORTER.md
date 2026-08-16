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

When the API is available, the website reads paginated data from PostgreSQL. `public/data/cars.json` remains a static fallback for GitHub Pages. Import diagnostics are written to `public/data/import-report.json`.

Guazi Global result-page previews are used only for discovery. A card is written to the catalog only after its product page yields a gallery with at least two original photos; incomplete reader responses are neither cached nor imported.

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
