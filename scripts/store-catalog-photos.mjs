// Пять первых кадров каждой машины каталога. Только SELECT в базе; прогресс и повторы — на диске.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../server/db.mjs';
import { catalogPhotoPaths, storeCatalogPhoto, atomicPhotoState } from './lib/catalog-photo-store.mjs';
const directory=process.env.PHOTO_STORE_DIR || '/srv/abcars-media';
const stateDirectory=process.env.PHOTO_STORE_STATE_DIR || '/srv/abcars/runtime/photo-store';
// Потолок 16: хранилище отвечает на новый кадр около секунды, и вся скорость здесь —
// в числе одновременных запросов. Служба идёт с низким приоритетом (Nice/IOWeight),
// поэтому сайту эти потоки не мешают.
const concurrency=Math.min(16,Math.max(1,Number(process.env.PHOTO_STORE_CONCURRENCY)||4));
await fs.mkdir(directory,{recursive:true}); await fs.mkdir(stateDirectory,{recursive:true});
const stateFile=path.join(stateDirectory,'progress.json');
let state={ cursor:'', recentAt:new Date().toISOString(), recentId:'', retries:{}, checked:0, stored:0, bytes:0 };
try { state={...state,...JSON.parse(await fs.readFile(stateFile,'utf8'))}; } catch(error) { if(error.code!=='ENOENT') throw error; }
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;}); process.on('SIGINT',()=>{stopping=true;});
const select=`SELECT l.id, l.first_seen_at::text AS seen_at,
 (SELECT array_agg(url ORDER BY position) FROM
 (SELECT url,position FROM listing_media WHERE listing_id=l.id ORDER BY position LIMIT 5) m) AS images
 FROM listings l WHERE l.status='active'`;
async function storeCars(cars, previewCount = 5) {
  const jobs=cars.flatMap(car=>catalogPhotoPaths(car, { previewCount }).map(href=>({id:car.id,href})));
  const failed=new Set(); let cursor=0, fatal;
  await Promise.all(Array.from({length:concurrency},async()=>{
    while(cursor<jobs.length && !fatal){
      const job=jobs[cursor++];
      try { const result=await storeCatalogPhoto(job.href,{directory}); if(result.stored){state.stored++;state.bytes+=result.bytes;} }
      catch(error){ if(error.code==='PHOTO_DISK_FULL')fatal=error; else {failed.add(job.id);console.warn(`[photo-store] retry ${job.id}: ${error.message}`);} }
    }
  }));
  if(fatal) throw fatal;
  for(const car of cars){
    state.checked++;
    if(failed.has(car.id))state.retries[car.id]={after:Date.now()+3600_000, previewCount:Math.max(previewCount,state.retries[car.id]?.previewCount || 1)};
    else if (previewCount >= (state.retries[car.id]?.previewCount || 1)) delete state.retries[car.id];
  }
}
// Не более 60 машин витрины и 100 востребованных за один час. Кадры хранятся для всего
// каталога, но эта очередь доводит до конца сначала те машины, которые сейчас смотрят:
// полный проход занимает часы, и ждать его посетителю незачем.
async function refreshPriority() {
  if (Date.now() - (state.priorityAt || 0) < 3600_000 || state.priorityIds?.length) return;
  const ids = new Set();
  let complete = true;
  try {
    const response = await fetch('https://abcars.by/api/cars?limit=60&sort=variety', {
      signal: AbortSignal.timeout(15_000), headers: {accept:'application/json'}, redirect:'error',
    });
    if (!response.ok) throw new Error(`showcase HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error('Invalid showcase response');
    for (const car of data.items.slice(0,60)) if (typeof car.id === 'string') ids.add(car.id);
  } catch (error) { complete=false; console.warn('[photo-store] showcase:',error.message); }
  try {
    const popular = await pool.query(`SELECT listing_id FROM analytics_events
      WHERE created_at >= now() - interval '7 days' AND event_name='vehicle_view'
        AND human=true AND listing_id IS NOT NULL
      GROUP BY listing_id ORDER BY count(DISTINCT visitor_id) DESC, max(created_at) DESC LIMIT 100`);
    for (const row of popular.rows) ids.add(row.listing_id);
  } catch (error) { complete=false; console.warn('[photo-store] popular:',error.message); }
  state.priorityIds=[...ids];
  // При временном сбое пробуем через пять минут, без остановки обложек.
  state.priorityAt=Date.now()-(complete ? 0 : 55*60_000);
  await atomicPhotoState(stateFile,state);
}
try {
  console.log('[photo-store] started',JSON.stringify({cursor:state.cursor,stored:state.stored}));
  do {
    // Новые объявления обслуживаются между каждыми 25 старыми машинами.
    const recent=await pool.query(select+` AND (l.first_seen_at,l.id)>($1::timestamptz,$2) ORDER BY l.first_seen_at,l.id LIMIT 25`,[state.recentAt,state.recentId]);
    if(recent.rows.length){
      await storeCars(recent.rows);
      const last=recent.rows.at(-1);state.recentAt=last.seen_at;state.recentId=last.id;
      await atomicPhotoState(stateFile,state);
    }
    const retryIds=Object.entries(state.retries).filter(([,value])=>value.after<=Date.now()).slice(0,5).map(([id])=>id);
    if(retryIds.length){
      const retry=await pool.query(select+' AND l.id=ANY($1::text[])',[retryIds]);
      for (const car of retry.rows) await storeCars([car], state.retries[car.id]?.previewCount || 5);
      for(const id of retryIds)if(!retry.rows.some(car=>car.id===id))delete state.retries[id];
      await atomicPhotoState(stateFile,state);
    }
    if(!state.completedAt){
      const batch=await pool.query(select+' AND l.id>$1 ORDER BY l.id LIMIT 25',[state.cursor]);
      await storeCars(batch.rows);
      if(batch.rows.length)state.cursor=batch.rows.at(-1).id;
      else state.completedAt=new Date().toISOString();
    } else if(Date.now()-Date.parse(state.completedAt)>86400_000) {
      // Ежедневный проход проверяет добавленные кадры и пропущенные поздние транзакции.
      state.cursor='';state.completedAt=null;
    }
    if (!stopping) {
      await refreshPriority();
      const ids=(state.priorityIds || []).slice(0,5);
      if (ids.length) {
        const priority=await pool.query(select+' AND l.id=ANY($1::text[])',[ids]);
        await storeCars(priority.rows,5);
        state.priorityIds=state.priorityIds.slice(ids.length);
      }
    }
    state.updatedAt=new Date().toISOString();
    await atomicPhotoState(stateFile,state);
    console.log('[photo-store]',JSON.stringify({checked:state.checked,stored:state.stored,mb:Math.round(state.bytes/1024**2),retries:Object.keys(state.retries).length,completedAt:state.completedAt||null}));
    if(process.argv.includes('--once'))break;
    await new Promise(resolve=>setTimeout(resolve,state.completedAt?15000:1000));
  } while(!stopping);
} finally { await pool.end(); }
