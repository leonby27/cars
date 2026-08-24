import crypto from "node:crypto";
import os from "node:os";
import { pool, withTransaction } from "../server/db.mjs";
import { getCar, upsertCar } from "../server/repository.mjs";
import { expireUnseenListings, scheduleStaleListings } from "../server/crawler-maintenance.mjs";
import { normalizeDrive, normalizeEnergy, parseGuaziHtml, parseGuaziMarkdown } from "./lib/guazi-parser.mjs";
import { fetchSourceText } from "./lib/source-client.mjs";

const workerId = `${os.hostname()}-${process.pid}`;
const runOnce = process.argv.includes("--once");
const userAgent = process.env.GUAZI_HTML_USER_AGENT || "abcars.by-Worker/0.2";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const scheduleIntervalMs = Math.max(60_000, Number(process.env.CRAWL_SCHEDULE_INTERVAL_MS || 15 * 60_000));
const expireIntervalMs = Math.max(60_000, Number(process.env.CRAWL_EXPIRE_INTERVAL_MS || 24 * 60 * 60_000));
let nextScheduleAt=0;
let nextExpireAt=0;

async function runMaintenance() {
  const now=Date.now();
  if (now >= nextScheduleAt) { const queued=await scheduleStaleListings(1000); if (queued) console.log(`Scheduled ${queued} stale listings`); nextScheduleAt=now + scheduleIntervalMs; }
  if (now >= nextExpireAt) { const expired=await expireUnseenListings(30); if (expired) console.log(`Expired ${expired} unseen listings`); nextExpireAt=now + expireIntervalMs; }
}

async function fetchText(url, accept) {
  return fetchSourceText(url, { accept, userAgent, attempts:2 });
}

async function claimJob() {
  return withTransaction(async (client) => {
    const sourceResult = await client.query(`SELECT h.* FROM source_health h
      WHERE EXISTS (SELECT 1 FROM crawl_jobs j WHERE j.source=h.source AND j.status='queued' AND j.available_at<=now())
        AND (h.blocked_until IS NULL OR h.blocked_until<=now())
        AND (h.status<>'probing' OR h.probe_until IS NULL OR h.probe_until<=now())
      ORDER BY h.blocked_until NULLS FIRST, h.updated_at FOR UPDATE SKIP LOCKED LIMIT 1`);
    const source = sourceResult.rows[0];
    if (!source) return null;
    if (source.status === "blocked" || source.status === "probing") {
      await client.query("UPDATE source_health SET status='probing', probe_until=now() + interval '2 minutes', updated_at=now() WHERE source=$1", [source.source]);
    }
    const result = await client.query(`WITH candidate AS (
      SELECT id FROM crawl_jobs WHERE source=$2 AND status='queued' AND available_at<=now()
      ORDER BY priority DESC, available_at, id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE crawl_jobs j SET status='running', locked_at=now(), locked_by=$1, attempts=attempts+1
      FROM candidate WHERE j.id=candidate.id RETURNING j.*`, [workerId,source.source]);
    return result.rows[0] || null;
  });
}

async function markSourceHealthy(source) {
  await pool.query(`INSERT INTO source_health (source,status,last_success_at,updated_at)
    VALUES ($1,'healthy',now(),now()) ON CONFLICT (source) DO UPDATE SET status='healthy', blocked_until=NULL, probe_until=NULL,
    consecutive_failures=0, last_success_at=now(), last_error=NULL, updated_at=now()`, [source]);
}

async function blockSource(source, error) {
  await pool.query(`INSERT INTO source_health (source,status,blocked_until,consecutive_failures,last_failure_at,last_error,updated_at)
    VALUES ($1,'blocked',now() + interval '10 minutes',1,now(),$2,now()) ON CONFLICT (source) DO UPDATE SET status='blocked',
    blocked_until=now() + interval '10 minutes', probe_until=NULL, consecutive_failures=source_health.consecutive_failures+1,
    last_failure_at=now(), last_error=$2, updated_at=now()`, [source,String(error.message || error).slice(0,1000)]);
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
  await markSourceHealthy(job.source);
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
  } catch (error) { if (error.code === "source_blocked") throw error; }
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
    bodyStructure:detail.bodyStructure ?? existing?.bodyStructure,
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
    sourceListedAt:parsed.sourceListedAt ?? detail.sourceListedAt ?? existing?.sourceListedAt,
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
  await Promise.all([
    pool.query("UPDATE crawl_jobs SET status='done', completed_at=now(), locked_at=NULL, locked_by=NULL, last_error=NULL WHERE id=$1", [job.id]),
    markSourceHealthy(job.source),
  ]);
}

async function fail(job, error) {
  if (error.code === "source_blocked") {
    await Promise.all([
      blockSource(job.source,error),
      pool.query("UPDATE crawl_jobs SET status='queued', attempts=GREATEST(0,attempts-1), available_at=now(), locked_at=NULL, locked_by=NULL, last_error=$2 WHERE id=$1", [job.id,String(error.message).slice(0,1000)]),
    ]);
    return;
  }
  const retry = job.attempts < job.max_attempts;
  await pool.query(`UPDATE crawl_jobs SET status=$2, available_at=CASE WHEN $2='queued' THEN now() + make_interval(mins => LEAST(1440, (power(2, attempts)::int * 5))) ELSE available_at END, locked_at=NULL, locked_by=NULL, last_error=$3, completed_at=CASE WHEN $2='failed' THEN now() ELSE NULL END WHERE id=$1`, [job.id,retry ? "queued" : "failed",String(error.message || error).slice(0,1000)]);
}

let stopping = false;
process.on("SIGINT", () => { stopping=true; });
process.on("SIGTERM", () => { stopping=true; });

do {
  await runMaintenance();
  const job = await claimJob();
  if (!job) { if (runOnce) break; await sleep(2000); continue; }
  try { await processJob(job); await complete(job); console.log(`Completed job ${job.id} ${job.listing_id}`); }
  catch (error) { await fail(job, error); console.error(`Failed job ${job.id}: ${error.message}`); }
  if (runOnce) break;
} while (!stopping);

await pool.end();
