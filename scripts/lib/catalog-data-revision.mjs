// A small aggregate over indexed change dates, without loading vehicle payloads.
// Counts also catch deletion; visibility is independent of listing content.
export async function catalogDataRevision(db) {
  const {rows} = await db.query(`SELECT
    (SELECT max(content_changed_at)::text FROM listings) AS content,
    (SELECT max(sold_at)::text FROM listings WHERE status='unavailable') AS sold,
    (SELECT max(updated_at)::text FROM vehicles) AS vehicles,
    (SELECT max(updated_at)::text FROM catalog_sources) AS sources,
    (SELECT count(*)::text FROM listings) AS listing_count,
    (SELECT count(*)::text FROM vehicles) AS vehicle_count,
    (SELECT count(*)::text || ':' || COALESCE(bit_xor(hashtextextended(listing_id,0)),0)::text
      FROM catalog_hidden_duplicates) AS visibility`);
  if (!rows[0]) throw new Error('Catalog revision unavailable');
  return JSON.stringify(rows[0]);
}
