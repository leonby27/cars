import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { countLeadPeople } from "../server/analytics-lead-people.mjs";
import { getAnalyticsLeadPeople } from "../server/analytics.mjs";

test("две машины, подбор и кабинет с тем же телефоном — один человек", () => {
  const rows = [
    { id:"draft-1", phone:"+375 (29) 123-45-67", kind:"car" },
    { id:"draft-2", phone:"375291234567", kind:"car" },
    { id:"draft-3", phone:"+375 29 123 45 67", kind:"custom_search" },
    { id:"order-1", customer_id:"account-1", phone:"375291234567", kind:"car" },
  ];
  assert.deepEqual(countLeadPeople(rows), { lead_people:1, car_lead_people:1, custom_search_people:1 });
  assert.equal(rows.length, 4, "исходные заявки не удаляем");
  assert.equal(countLeadPeople([...rows, { id:"draft-4", phone:"+375291234568", kind:"car" }]).lead_people, 2);
});

test("неизвестные контакты не объединяются, один аккаунт без телефона узнаётся", () => {
  assert.equal(countLeadPeople([{ id:"draft-1" }, { id:"order-1" }]).lead_people, 2);
  assert.equal(countLeadPeople([{ id:"order-1", customer_id:"a" }, { id:"order-2", customer_id:"a" }]).lead_people, 1);
  assert.equal(countLeadPeople([{ id:"draft-1", phone:"person1@example.com" }, { id:"draft-2", phone:"other1@example.com" }]).lead_people, 2);
  assert.deepEqual(countLeadPeople(), { lead_people:0, car_lead_people:0, custom_search_people:0 });
});

test("счётчик охватывает все заявки периода и сохраняет исключение сотрудников", async () => {
  const from = "2026-09-30T21:00:00.000Z";
  const to = "2026-10-01T21:00:00.000Z";
  const counts = await getAnalyticsLeadPeople(from, to, { db:{ query:async (sql, params) => {
    assert.deepEqual(params, [from, to]);
    assert.match(sql, /d.created_at >= \$1 AND d.created_at < \$2/);
    assert.match(sql, /coalesce\(o.availability_requested_at, o.created_at\) >= \$1/);
    assert.match(sql, /coalesce\(o.availability_requested_at, o.created_at\) < \$2/);
    assert.match(sql, /SELECT phone FROM customer_accounts WHERE staff/);
    assert.match(sql, /SELECT id FROM customer_accounts WHERE staff/);
    assert.doesNotMatch(sql, /LIMIT|device/);
    return { rows:Array.from({ length:250 }, (_, i) => ({ id:`draft-${i}`, phone:`+37529${String(i).padStart(7, "0")}`, kind:"car" })) };
  } } });
  assert.equal(counts.lead_people, 250);
});

test("открытия объединяются по посетителю, красный счётчик остаётся по каждой заявке", async () => {
  const source = await readFile(new URL("../server/analytics.mjs", import.meta.url), "utf8");
  assert.match(source, /count\(DISTINCT visitor_id\) FILTER \(WHERE event_name='availability_click' AND \$\{LIVE_VISITOR\}\)::int AS availability_modal_opens/);
  assert.match(source, /SELECT count\(\*\) FROM order_drafts WHERE created_at > \$1/);
  assert.match(source, /SELECT count\(\*\) FROM customer_orders WHERE created_at > \$1/);
});

test("один человек и две новые заявки отображаются как 1 / 1 +2, без вычитания и обрезки", async () => {
  const vite = await createServer({ configFile:false, plugins:[react()], server:{ middlewareMode:true }, appType:"custom" });
  try {
    const { LeadsFunnelCount } = await vite.ssrLoadModule("/src/analytics-page.jsx");
    const render = (props) => renderToStaticMarkup(createElement(LeadsFunnelCount, props));
    const html = render({ opens:1, total:1, fresh:2 });
    assert.match(html, /<span>1<\/span><i aria-hidden="true">\/<\/i>/);
    assert.match(html, /is-leads"><span>1<\/span>/);
    assert.match(html, /aria-label="Новых заявок: 2">2<\/b>/);
    assert.doesNotMatch(render({ opens:1, total:1, fresh:0 }), /<b/);
    assert.match(render({ opens:0, total:0, fresh:3 }), /aria-label="Новых заявок: 3">3<\/b>/);
    assert.match(render({ total:1, fresh:123 }), /aria-label="Новых заявок: 123">123<\/b>/);
  } finally {
    await vite.close();
  }
});
