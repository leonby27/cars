import test from "node:test";
import assert from "node:assert/strict";
import { rowToCustomerOrder } from "../server/orders.mjs";

test("maps a customer order to the account flow shape", () => {
  const order = rowToCustomerOrder({
    id:7,
    listing_id:"car-1",
    availability_status:"requested",
    availability_comment:"Уточнить остаточную ёмкость батареи",
    availability_requested_at:"2026-08-16T10:00:30.000Z",
    contact_name:"Анна Иванова",
    contact_phone:"+375291234567",
    contact_methods:["phone","telegram"],
    contact_saved_at:"2026-08-16T10:00:45.000Z",
    contact_consent_at:"2026-08-16T10:00:45.000Z",
    inspection_status:"skipped",
    contract_status:"available",
    payment_status:"locked",
    contract_confirmed_at:null,
    invoice_requested_at:null,
    created_at:"2026-08-16T10:00:00.000Z",
    updated_at:"2026-08-16T10:01:00.000Z",
    title:"Volkswagen ID.4 CROZZ 2025",
    brand:"Volkswagen",
    model:"ID.4 CROZZ",
    model_year:2025,
    powertrain:"Электромобиль",
    mileage_km:18400,
    city:"Пекин",
    drivetrain:"Задний",
    battery_kwh:"55.7",
    electric_range_km:442,
    image:"https://example.com/car.jpg",
    estimated_total_usd:"23900",
  });

  assert.equal(order.orderNumber, "EV-2026-000007");
  assert.equal(order.availabilityStatus, "requested");
  assert.equal(order.availabilityComment, "Уточнить остаточную ёмкость батареи");
  assert.equal(order.contactName, "Анна Иванова");
  assert.equal(order.contactPhone, "+375291234567");
  assert.deepEqual(order.contactMethods, ["phone","telegram"]);
  assert.equal(order.inspectionStatus, "skipped");
  assert.equal(order.contractStatus, "available");
  assert.equal(order.car.estimatedTotalUsd, 23900);
  assert.equal(order.car.mileage, 18400);
  assert.equal(order.car.type, "Электромобиль");
  assert.equal(order.car.range, 442);
});
