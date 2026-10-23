// Compare source identities inside PostgreSQL; only sold photo references leave it.
// Source URLs stay in listing_media even after a sale. No source requests are made.
export function sourcePhotoIdentitySql(column='m.url') {
  const url=`split_part(split_part(${column},'?',1),'#',1)`;
  const original=`regexp_replace(${url},'^https?://[^/]+','','i')`;
  const che=`regexp_replace(CASE WHEN ${url} LIKE '/photo/%' THEN ${url} ELSE '/photo'||${original} END,'/[0-9]+x[0-9]+_(c[0-9]+_)?([^/]+)$',E'/\\\\2')`;
  return `CASE
    WHEN ${column} ~* '^https?://ci[.]encar[.]com/' THEN 'encar:'||${original}
    WHEN ${column} ~ '^/photo/encar/(v2/)?w(600|1200|1920)/' THEN 'encar:'||regexp_replace(${url},'^/photo/encar/(v2/)?w(600|1200|1920)','')
    WHEN ${column} ~* '^https?://([a-z0-9-]+[.])*autoimg[.]cn/escimg/' OR ${column} LIKE '/photo/escimg/%'
      THEN regexp_replace(${che},'[.]jpg$','.jpg.webp')
    WHEN ${column} ~* '^https?://(image-public[.]guazistatic[.]com|image-oversea[.]guazistatic-global[.]com|global-image-pub[.]guazistatic-global[.]com|global-image1[.]guazistatic-global[.]com)/'
      THEN 'guazi:'||lower(split_part(${url},'/',3))||${original}
    ELSE NULL END`;
}

export const soldPhotoQuery=`WITH sold AS MATERIALIZED (
  SELECT l.id,m.url,${sourcePhotoIdentitySql()} AS photo_key
  FROM listings l JOIN listing_media m ON m.listing_id=l.id
  WHERE l.status='unavailable'
), protected AS (
  SELECT ${sourcePhotoIdentitySql()} AS photo_key
  FROM listings l JOIN listing_media m ON m.listing_id=l.id
  WHERE l.status IS DISTINCT FROM 'unavailable'
)
SELECT s.id,s.url FROM sold s
WHERE s.photo_key IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM protected p WHERE p.photo_key=s.photo_key
)`;
