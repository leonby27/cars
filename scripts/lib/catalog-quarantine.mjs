// Unverified is hidden, never sold. Preserve quote, check date, media and
// business records; collectors retry skipped records in their next snapshot.
export async function quarantineListing(db, { source, externalId, reason, checkedFrom }) {
  if (!['Che168', 'Encar'].includes(source) || typeof externalId !== 'string' || !externalId.trim() || !reason) throw Error('Invalid catalog quarantine');
  const args = [source, String(externalId), JSON.stringify({ reason, observedAt: new Date().toISOString() })];
  if (checkedFrom) args.push(checkedFrom);
  try {
    return await db.query(`UPDATE listings SET status='skipped', sold_at=NULL, content_changed_at=now(),
      source_payload=source_payload || jsonb_build_object('catalogQuarantine', $3::jsonb)
      WHERE source=$1 AND external_id=$2 AND status IN ('active','skipped')
      ${checkedFrom ? "AND COALESCE(last_checked_at, '-infinity') <= $4::timestamptz" : ""}`, args);
  } catch (error) { error.stage = 'write'; throw error; }
}
