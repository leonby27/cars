import http from "node:http";
import { pool } from "./db.mjs";
import { createOrderDraft, getCar, getCatalogMeta, listCars } from "./repository.mjs";

const port = Number(process.env.API_PORT || 8787);
const json = (response, status, payload) => { response.writeHead(status, { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "access-control-allow-origin":"*", "access-control-allow-headers":"content-type" }); response.end(JSON.stringify(payload)); };
const readJson = async (request) => {
  const chunks=[]; let size=0;
  for await (const chunk of request) { size += chunk.length; if (size > 65_536) throw new Error("request_too_large"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") return json(response, 204, null);
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      const [cars,jobs] = await Promise.all([
        pool.query("SELECT count(*)::int AS cars FROM listings WHERE status='active'"),
        pool.query("SELECT count(*) FILTER (WHERE status='queued')::int queued, count(*) FILTER (WHERE status='running')::int running, count(*) FILTER (WHERE status='failed')::int failed FROM crawl_jobs"),
      ]);
      return json(response, 200, { ok:true, database:"postgresql", cars:cars.rows[0].cars, jobs:jobs.rows[0] });
    }
    if (request.method === "GET" && url.pathname === "/api/cars") return json(response, 200, await listCars(url.searchParams));
    if (request.method === "GET" && url.pathname === "/api/catalog/meta") return json(response, 200, await getCatalogMeta(url.searchParams.get("type"), url.searchParams.get("brand")));
    const carMatch = request.method === "GET" && url.pathname.match(/^\/api\/cars\/([^/]+)$/);
    if (carMatch) { const car = await getCar(decodeURIComponent(carMatch[1])); return car ? json(response, 200, car) : json(response, 404, { error:"car_not_found" }); }
    if (request.method === "POST" && url.pathname === "/api/order-drafts") {
      const body = await readJson(request);
      const contact = String(body.contact || "").trim();
      if (!body.listingId || !contact) return json(response, 400, { error:"listing_and_contact_required" });
      if (contact.length > 200) return json(response, 400, { error:"contact_too_long" });
      return json(response, 201, await createOrderDraft({ listingId:body.listingId, contact, calculation:body.calculation }));
    }
    return json(response, 404, { error:"not_found" });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error:"internal_error" });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`ChinaCar API: http://127.0.0.1:${port}`));

const shutdown = async () => { server.close(); await pool.end(); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
