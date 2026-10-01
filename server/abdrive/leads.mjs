import { randomUUID } from 'node:crypto';
import { normalizeRussianPhone } from '../../src/markets/contact.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function normalizeLead(body) {
  if (!body || typeof body!=='object' || Array.isArray(body)) throw new Error('invalid_lead');
  if (!uuid.test(String(body.requestKey || ''))) throw new Error('invalid_request_key');
  const phone=normalizeRussianPhone(body.phone);
  if (!phone) throw new Error('invalid_phone');
  if (body.consent !== true) throw new Error('consent_required');
  const name=String(body.name || '').trim();
  const comment=String(body.comment || '').trim();
  if (!name || name.length>100 || comment.length>2000) throw new Error('invalid_lead');
  const listingId=body.listingId == null ? null : String(body.listingId);
  if (listingId && !/^[a-zA-Z0-9-]{1,100}$/.test(listingId)) throw new Error('invalid_listing');
  return {requestKey:body.requestKey,name,phone,comment,listingId};
}

// Snapshot and consentVersion come from the server, not from browser-supplied prices.
export async function saveLead(client, lead, {snapshot,consentVersion,destination,transaction=true}) {
  if (!consentVersion || !destination?.id || !destination?.name || !snapshot) throw new Error('lead_configuration_missing');
  const id=randomUUID();
  if(transaction)await client.query('BEGIN');
  try {
    const inserted=await client.query(`INSERT INTO leads
      (id,request_key,name,phone,destination_id,destination_name,listing_id,snapshot,comment,consent_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(request_key) DO NOTHING RETURNING id`,
    [id,lead.requestKey,lead.name,lead.phone,destination.id,destination.name,lead.listingId,snapshot,lead.comment,consentVersion]);
    if (inserted.rowCount) await client.query('INSERT INTO lead_notifications(lead_id) VALUES($1)',[id]);
    else {
      // A retry is accepted only for the identical submission. Do not reveal its personal data.
      const existing=await client.query(`SELECT id FROM leads WHERE request_key=$1
        AND phone=$2 AND name=$3 AND comment=$4 AND listing_id IS NOT DISTINCT FROM $5 AND destination_id=$6`,
      [lead.requestKey,lead.phone,lead.name,lead.comment,lead.listingId,destination.id]);
      if (!existing.rowCount) throw new Error('request_key_conflict');
    }
    if(transaction)await client.query('COMMIT');
    return {accepted:true};
  } catch(error) { if(transaction)await client.query('ROLLBACK');throw error; }
}

export async function claimNotification(db) {
  const token=randomUUID();
  const result=await db.query(`UPDATE lead_notifications n SET attempts=attempts+1,
    locked_until=now()+interval '5 minutes',lock_token=$1
    WHERE n.lead_id=(SELECT lead_id FROM lead_notifications WHERE sent_at IS NULL
      AND available_at<=now() AND (locked_until IS NULL OR locked_until<now())
      ORDER BY available_at,lead_id LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING *`,[token]);
  return result.rows[0] || null;
}

export async function finishNotification(db,job,{sent,error=null}) {
  await db.query(`UPDATE lead_notifications SET sent_at=CASE WHEN $3 THEN now() ELSE NULL END,
    locked_until=NULL,lock_token=NULL,last_error=$4,
    available_at=CASE WHEN $3 THEN available_at ELSE now()+least(3600,30*power(2,least(attempts,7))) * interval '1 second' END
    WHERE lead_id=$1 AND lock_token=$2 AND sent_at IS NULL`,[job.lead_id,job.lock_token,sent,error ? String(error).slice(0,200) : null]);
}
