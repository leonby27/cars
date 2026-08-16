import { pool } from "./db.mjs";
import { getSessionAccount } from "./auth.mjs";

const orderSelect = `SELECT o.id,o.listing_id,o.inspection_status,o.contract_status,o.payment_status,
  o.contract_confirmed_at,o.invoice_requested_at,o.created_at,o.updated_at,
  l.title,l.estimated_total_usd,l.mileage_km,l.city,
  v.brand,v.model,v.model_year,v.powertrain,v.drivetrain,v.battery_kwh,v.electric_range_km,
  (SELECT m.url FROM listing_media m WHERE m.listing_id=o.listing_id ORDER BY m.position LIMIT 1) AS image
  FROM customer_orders o
  JOIN listings l ON l.id=o.listing_id
  JOIN vehicles v ON v.id=l.vehicle_id`;

const orderNumber = (row) => {
  const year = new Date(row.created_at).getUTCFullYear();
  return `EV-${year}-${String(row.id).padStart(6, "0")}`;
};

export function rowToCustomerOrder(row) {
  return {
    id:Number(row.id),
    orderNumber:orderNumber(row),
    listingId:row.listing_id,
    inspectionStatus:row.inspection_status,
    contractStatus:row.contract_status,
    paymentStatus:row.payment_status,
    contractConfirmedAt:row.contract_confirmed_at,
    invoiceRequestedAt:row.invoice_requested_at,
    createdAt:row.created_at,
    updatedAt:row.updated_at,
    car:{
      id:row.listing_id,
      title:row.title,
      brand:row.brand,
      model:row.model,
      year:row.model_year,
      type:row.powertrain,
      mileage:Number(row.mileage_km) || 0,
      city:row.city,
      drive:row.drivetrain,
      battery:Number(row.battery_kwh) || null,
      range:Number(row.electric_range_km) || null,
      image:row.image,
      estimatedTotalUsd:Number(row.estimated_total_usd) || null,
    },
  };
}

async function getOrder(customerId, orderId) {
  const result = await pool.query(`${orderSelect} WHERE o.customer_id=$1 AND o.id=$2`, [customerId,orderId]);
  return result.rows[0] ? rowToCustomerOrder(result.rows[0]) : null;
}

export async function listCustomerOrders(request) {
  const account = await getSessionAccount(request);
  if (!account) return { error:"unauthorized" };
  const result = await pool.query(`${orderSelect} WHERE o.customer_id=$1 ORDER BY o.updated_at DESC`, [account.id]);
  return { orders:result.rows.map(rowToCustomerOrder) };
}

export async function createCustomerOrder(request, listingId) {
  const account = await getSessionAccount(request);
  if (!account) return { error:"unauthorized" };
  const listing = await pool.query("SELECT 1 FROM listings WHERE id=$1 AND status='active'", [listingId]);
  if (!listing.rowCount) return { error:"listing_not_found" };
  const result = await pool.query(
    `INSERT INTO customer_orders (customer_id,listing_id) VALUES ($1,$2)
     ON CONFLICT (customer_id,listing_id) DO UPDATE SET updated_at=now()
     RETURNING id`,
    [account.id,listingId],
  );
  return { order:await getOrder(account.id, result.rows[0].id) };
}

const actionUpdates = {
  order_inspection:{
    where:"inspection_status='decision'",
    set:"inspection_status='requested'",
  },
  skip_inspection:{
    where:"inspection_status='decision'",
    set:"inspection_status='skipped',contract_status='available'",
  },
  confirm_contract:{
    where:"contract_status='available'",
    set:"contract_status='confirmed',payment_status='available',contract_confirmed_at=now()",
  },
  request_invoice:{
    where:"payment_status='available'",
    set:"payment_status='invoice_requested',invoice_requested_at=now()",
  },
};

export async function updateCustomerOrder(request, orderId, action) {
  const account = await getSessionAccount(request);
  if (!account) return { error:"unauthorized" };
  const transition = actionUpdates[action];
  if (!transition) return { error:"invalid_order_action" };
  const result = await pool.query(
    `UPDATE customer_orders SET ${transition.set},updated_at=now()
      WHERE id=$1 AND customer_id=$2 AND ${transition.where}
      RETURNING id`,
    [orderId,account.id],
  );
  if (!result.rowCount) {
    const existing = await getOrder(account.id, orderId);
    return existing ? { error:"order_action_unavailable", order:existing } : { error:"order_not_found" };
  }
  return { order:await getOrder(account.id, orderId) };
}

export async function deleteCustomerOrder(request, orderId) {
  const account = await getSessionAccount(request);
  if (!account) return { error:"unauthorized" };
  const result = await pool.query(
    `DELETE FROM customer_orders
      WHERE id=$1 AND customer_id=$2
      RETURNING id`,
    [orderId,account.id],
  );
  if (!result.rowCount) {
    return { error:"order_not_found" };
  }
  return { ok:true, id:Number(result.rows[0].id) };
}
