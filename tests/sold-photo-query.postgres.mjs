// Read-only integration: fixture CTEs shadow both real business tables.
import assert from 'node:assert/strict';
import {pool} from '../server/db.mjs';
import {soldPhotoQuery,sourcePhotoIdentitySql} from '../scripts/lib/sold-photo-query.mjs';
import {photoIdentity} from '../scripts/lib/photo-cleanup.mjs';
const che='https://erscglobal2.autoimg.cn/escimg/auto/';
const guazi='https://global-image-pub.guazistatic-global.com/';
const fixtures=[
 {id:'sold-shared-che',status:'unavailable',url:che+'1400x0_c42_shared.jpg.webp'},
 {id:'active-che',status:'active',url:che+'600x0_c42_shared.jpg.webp'},
 {id:'sold-shared-encar',status:'unavailable',url:'https://ci.encar.com/shared.jpg'},
 {id:'active-encar',status:'active',url:'/photo/encar/v2/w1920/shared.jpg'},
 {id:'sold-shared-guazi',status:'unavailable',url:guazi+'shared.jpg?x-bce-process=image/format,f_jpg'},
 {id:'active-guazi',status:'active',url:guazi+'shared.jpg?x-bce-process=image/resize,m_lfit,w_600/format,f_webp/quality,q_90'},
 {id:'sold-skipped-owner',status:'unavailable',url:guazi+'temporary.jpg'},
 {id:'skipped-owner',status:'skipped',url:guazi+'temporary.jpg?x-bce-process=image/format,f_jpg'},
 {id:'sold-only-che',status:'unavailable',url:che+'1400x0_c42_only.jpg.webp'},
 {id:'sold-only-encar',status:'unavailable',url:'https://ci.encar.com/only.jpg'},
 {id:'sold-only-guazi',status:'unavailable',url:guazi+'only.jpg'},
 {id:'skipped-only',status:'skipped',url:guazi+'keep.jpg'},
];
const client=await pool.connect();
try {
 await client.query('BEGIN READ ONLY');
 for(const url of [che+'1400x0_c42_shared.jpg.webp',che+'600x0_c42_shared.jpg.webp','/photo/escimg/auto/1080x0_shared.jpg','https://ci.encar.com/shared.jpg','/photo/encar/v2/w1920/shared.jpg']) {
  const {rows}=await client.query(`SELECT ${sourcePhotoIdentitySql()} AS key FROM (VALUES ($1::text)) m(url)`,[url]);
  assert.equal(rows[0].key,photoIdentity(url));
 }
 const {rows}=await client.query(`WITH listings AS (
   SELECT id,status FROM jsonb_to_recordset($1::jsonb) AS x(id text,status text,url text)
 ), listing_media AS (
   SELECT id AS listing_id,url FROM jsonb_to_recordset($1::jsonb) AS x(id text,status text,url text)
 ) SELECT * FROM (${soldPhotoQuery}) q`,[JSON.stringify(fixtures)]);
 assert.deepEqual(rows.map(row=>row.id).sort(),['sold-only-che','sold-only-encar','sold-only-guazi']);
 await client.query('ROLLBACK');
 console.log('Read-only PostgreSQL fixture checks passed: only sold images, shared active/skipped images protected.');
} finally {await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end();}
