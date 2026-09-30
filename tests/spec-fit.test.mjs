import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpecFitQueue } from '../src/spec-fit.js';

function setup() {
  let frame, id = 0, dirty = false, layouts = 0;
  const read = () => { if (dirty) { layouts++; dirty = false; } };
  const style = () => new Proxy({ cssText:'', display:'', removeProperty(key) { this[key] = ''; } }, {
    set(target,key,value) { dirty = true; target[key] = value; if (key === 'cssText') target.display = ''; return true; },
  });
  const chip = (width, { mobileHidden = false, body = false, clipped = false } = {}) => ({
    style:style(), mobileHidden,
    classList:{ contains:() => body },
    querySelector:() => ({ get scrollWidth() { read(); return clipped ? 200 : width; }, clientWidth:width }),
    getBoundingClientRect() { read(); return {width}; },
  });
  const row = (width, chips) => ({ isConnected:true, children:chips, get clientWidth() { read(); return width; } });
  const schedule = createSpecFitQueue({
    requestFrame:cb => { frame=cb; return ++id; }, cancelFrame:() => {frame=null;},
    computedStyle:node => {read();return {display:node.mobileHidden ? 'none' : 'flex', columnGap:'8px'};},
  });
  return {chip,row,schedule,flush:()=>{const cb=frame;frame=null;cb?.();},layouts:()=>layouts};
}

test('many mini-spec rows share layout phases and hide only chips that do not fit', () => {
  const s=setup();
  const rows=Array.from({length:30},()=>s.row(150,[s.chip(80),s.chip(80),s.chip(50,{body:true})]));
  rows.forEach(r=>s.schedule(r));s.flush();
  for(const r of rows) assert.deepEqual(r.children.map(c=>c.style.display),['','none','']);
  assert.ok(s.layouts()<=4, `layout repeated per card: ${s.layouts()}`);
});

test('CSS-hidden chips, clipped body labels and detached rows retain their behavior', () => {
  const s=setup(), hidden=s.chip(200,{mobileHidden:true}), body=s.chip(50,{body:true,clipped:true});
  const r=s.row(120,[hidden,s.chip(40),body]);
  const detached=s.row(100,[s.chip(200)]);detached.isConnected=false;
  s.schedule(r);s.schedule(detached);s.flush();
  assert.equal(r.children[1].style.display,'');assert.equal(body.style.display,'none');
  assert.equal(detached.children[0].style.display,'');
});

test('cancelled and replaced measurements do not mutate removed rows', () => {
  const s=setup(),r=s.row(10,[s.chip(100)]);
  const old=s.schedule(r);const current=s.schedule(r);old();s.flush();
  assert.equal(r.children[0].style.display,'none');
  r.children[0].style.display='';s.schedule(r)();s.flush();
  assert.equal(r.children[0].style.display,'');current();
});
