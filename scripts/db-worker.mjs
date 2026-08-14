import crypto from "node:crypto";
import os from "node:os";
import { pool, withTransaction } from "../server/db.mjs";
import { getCar, upsertCar } from "../server/repository.mjs";
import { normalizeDrive, normalizeEnergy, parseGuaziHtml, parseGuaziMarkdown } from "./lib/guazi-parser.mjs";
import { fetchSourceText } from "./lib/source-client.mjs";

const workerId = `${os.hostname()}-${process.pid}`;
const runOnce = process.argv.includes("--once");
const userAgent = process.env.GUAZI_HTML_USER_AGENT || "ChinaCarBY-Worker/0.2";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function fetchText(url, accept) {
  return fetchSourceText(url, { accept, userAgent, attempts:2 });
}

async function claimJob() {
  return withTransaction(async (client) => {
    const result = await client.query(`WITH candidate AS (
      SELECT id FROM crawl_jobs WHERE status='queued' AND available_at<=now()
      ORDER BY priority DESC, available_at, id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE crawl_jobs j SET status='running', locked_at=now(), locked_by=$1, attempts=attempts+1
      FROM candidate WHERE j.id=candidate.id RETURNING j.*`, [workerId]);
    return result.rows[0] || null;
  });
}

async function saveSnapshot({ source, externalId, url, format, response }) {
  const payload = response.text.length <= 1_000_000 ? response.text : null;
  await pool.query("INSERT INTO source_snapshots (source, external_id, url, format, content_hash, payload, http_status) VALUES ($1,$2,$3,$4,$5,$6,$7)", [source,externalId,url,format,hash(response.text),payload,response.status]);
  await pool.query(`DELETE FROM source_snapshots WHERE id IN (
    SELECT id FROM source_snapshots WHERE source=$1 AND external_id=$2 AND format=$3
    ORDER BY fetched_at DESC OFFSET 3
  )`, [source,externalId,format]);
}

async function refreshGuazi(job) {
  const markdownUrl = job.url.endsWith(".md") ? job.url : job.url.replace(/\.html$/, ".md");
  const markdownResponse = await fetchText(markdownUrl, "text/markdown,text/plain;q=0.9,*/*;q=0.5");
  const parsed = parseGuaziMarkdown(markdownResponse.text, markdownUrl);
  if (!parsed) throw new Error("Guazi markdown no longer contains a supported EV/PHEV listing");
  await saveSnapshot({ source:"Guazi", externalId:parsed.externalId, url:markdownUrl, format:"markdown", response:markdownResponse });
  const existing = await getCar(parsed.id);
  let detail = { blocked:true, images:[] };
  try {
    const htmlUrl = markdownUrl.replace(/\.md$/, ".html");
    const htmlResponse = await fetchText(htmlUrl, "text/html,*/*;q=0.5");
    detail = parseGuaziHtml(htmlResponse.text);
    await saveSnapshot({ source:"Guazi", externalId:parsed.externalId, url:htmlUrl, format:"html", response:htmlResponse });
  } catch {}
  const importedAt = new Date().toISOString();
  const car = {
    ...existing,
    ...parsed,
    type:normalizeEnergy(detail.energy, `${parsed.rawModel} ${parsed.rawSeries}`),
    drive:detail.driveRaw ? normalizeDrive(detail.driveRaw) : existing?.drive || "Не указан",
    battery:detail.battery ?? existing?.battery,
    batteryType:detail.batteryType ?? existing?.batteryType,
    batteryBrand:detail.batteryBrand ?? existing?.batteryBrand,
    batteryHealth:detail.batteryHealth ?? existing?.batteryHealth,
    electricRange:detail.electricRange ?? existing?.electricRange,
    combinedRange:detail.combinedRange ?? existing?.combinedRange,
    range:detail.range ?? existing?.range,
    claims:detail.claims ?? existing?.claims,
    engine:detail.engine ?? existing?.engine,
    transmission:detail.transmission ?? existing?.transmission,
    bodyColor:detail.bodyColor ?? existing?.bodyColor,
    vehicleClass:detail.vehicleClass ?? existing?.vehicleClass,
    driverAssistance:detail.driverAssistance ?? existing?.driverAssistance,
    infotainmentChip:detail.infotainmentChip ?? existing?.infotainmentChip,
    assistanceLevel:detail.assistanceLevel ?? existing?.assistanceLevel,
    radarCount:detail.radarCount ?? existing?.radarCount,
    cameraCount:detail.cameraCount ?? existing?.cameraCount,
    ultrasonicCount:detail.ultrasonicCount ?? existing?.ultrasonicCount,
    warranty:detail.warranty ?? existing?.warranty,
    inspectionGrade:detail.inspectionGrade ?? existing?.inspectionGrade,
    powertrainInspection:detail.powertrainInspection ?? existing?.powertrainInspection,
    bodyInspection:detail.bodyInspection ?? existing?.bodyInspection,
    interiorInspection:detail.interiorInspection ?? existing?.interiorInspection,
    structureInspection:detail.structureInspection ?? existing?.structureInspection,
    engineBayInspection:detail.engineBayInspection ?? existing?.engineBayInspection,
    batteryProtection:detail.batteryProtection ?? existing?.batteryProtection,
    images:detail.images.length ? detail.images : existing?.images,
    image:detail.images[0] || existing?.image,
    checkedAt:importedAt,
    importedAt,
    status:"Карточка доступна",
    statusTone:"green",
  };
  if (!car.images?.length) throw new Error("No valid gallery available");
  await upsertCar(car);
}

async function processJob(job) {
  if (job.source === "Guazi" && job.job_type === "refresh_listing") return refreshGuazi(job);
  throw new Error(`Unsupported job ${job.source}:${job.job_type}`);
}

async function complete(job) {
  await pool.query("UPDATE crawl_jobs SET status='done', completed_at=now(), locked_at=NULL, locked_by=NULL, last_error=NULL WHERE id=$1", [job.id]);
}

async function fail(job, error) {
  if (error.code === "source_blocked") {
    await pool.query("UPDATE crawl_jobs SET status='queued', attempts=GREATEST(0,attempts-1), available_at=now() + interval '6 hours', locked_at=NULL, locked_by=NULL, last_error=$2 WHERE id=$1", [job.id,String(error.message).slice(0,1000)]);
    return;
  }
  const retry = job.attempts < job.max_attempts;
  await pool.query(`UPDATE crawl_jobs SET status=$2, available_at=CASE WHEN $2='queued' THEN now() + make_interval(mins => LEAST(1440, (power(2, attempts)::int * 5))) ELSE available_at END, locked_at=NULL, locked_by=NULL, last_error=$3, completed_at=CASE WHEN $2='failed' THEN now() ELSE NULL END WHERE id=$1`, [job.id,retry ? "queued" : "failed",String(error.message || error).slice(0,1000)]);
}

let stopping = false;
process.on("SIGINT", () => { stopping=true; });
process.on("SIGTERM", () => { stopping=true; });

do {
  const job = await claimJob();
  if (!job) { if (runOnce) break; await sleep(2000); continue; }
  try { await processJob(job); await complete(job); console.log(`Completed job ${job.id} ${job.listing_id}`); }
  catch (error) { await fail(job, error); console.error(`Failed job ${job.id}: ${error.message}`); }
  if (runOnce) break;
} while (!stopping);

await pool.end();
