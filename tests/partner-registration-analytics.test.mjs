import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../server/db.mjs';
import { getAnalyticsUpdates, ANALYTICS_SECTIONS } from '../server/analytics.mjs';
import { clearAnalyticsUpdates, navigationViewedSections, sectionFreshCount } from '../src/analytics-updates.js';

test('partner unread applications are counted across all traffic filters and ordinary overview reset preserves them', async () => {
 const original=pool.query;
 let applicationQueries=0;
 pool.query=async(sql,params)=>{
  if(sql==='SELECT section, seen_at FROM analytics_seen') return {rows:ANALYTICS_SECTIONS.map(section=>({section,seen_at:'2026-10-08T00:00:00Z'}))};
  if(sql.includes('FROM partner_registration_requests')) {
   applicationQueries++;
   assert.match(sql,/WHERE seen_at IS NULL/);
   assert.equal(params,undefined);
   assert.doesNotMatch(sql,/human_action|traffic_events|created_at|interval/);
   return {rows:[{n:3}]};
  }
  return {rows:[{n:0,page_views:0}]};
 };
 try {
  for(const filters of [{}, {traffic:'without-quota',acquisition:'paid',activity:'actions'}]) {
   const updates=await getAnalyticsUpdates(filters,{now:Date.parse('2026-10-08T12:00:00Z')});
   assert.equal(updates.partnership,3);
   assert.equal(sectionFreshCount(updates,'partnership'),3);
   assert.equal(clearAnalyticsUpdates(updates,navigationViewedSections('overview','overview')).partnership,3);
   assert.equal(clearAnalyticsUpdates(updates,navigationViewedSections('leads','overview')).partnership,3);
  }
  assert.equal(applicationQueries,2);
 } finally {pool.query=original;}
});
