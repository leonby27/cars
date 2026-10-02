#!/usr/bin/env bash
# Build these before the normal BY migration, without blocking catalog writes.
set -euo pipefail
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d abcars <<'SQL'
SET lock_timeout='5s';
SET statement_timeout='120s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS listings_external_lookup_idx ON listings(external_id) WHERE source<>'Encar';
CREATE INDEX CONCURRENTLY IF NOT EXISTS vehicles_brand_model_idx ON vehicles(brand,model);
SELECT c.relname,i.indisvalid,i.indisready FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
WHERE c.relname IN ('listings_external_lookup_idx','vehicles_brand_model_idx');
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname IN ('listings_external_lookup_idx','vehicles_brand_model_idx') AND i.indisvalid AND i.indisready)<>2
 THEN RAISE EXCEPTION 'Catalog read index is incomplete; inspect before retrying'; END IF;
END $$;
SQL
