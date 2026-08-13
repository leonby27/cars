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
- `npm run import:watch` — import immediately and repeat every six hours
- `npm test` — parser and site tests

The website reads the generated snapshot from `public/data/cars.json`. Import diagnostics are written to `public/data/import-report.json`.

The target catalog is in `config/guazi-targets.json`. Each target can have a series-name allowlist and a numeric priority. Higher-priority brands receive proportionally more discovery and enrichment slots. A detail card still has to contain `type:新能源`, so an ICE variant cannot enter the public snapshot merely because its series name matched.

## Production gate

The current adapter is for a closed pilot. Before public commercial launch, replace the index-oriented access with an approved partner feed or record written permission and image-use terms.
