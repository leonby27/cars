import test from 'node:test';
import assert from 'node:assert/strict';
import { createPriceFitQueue } from '../src/price-fit.js';

function setup() {
  const frames = new Map(), log = [];
  let id = 0;
  const schedule = createPriceFitQueue({ requestFrame: run => { frames.set(++id, run); return id; }, cancelFrame: key => frames.delete(key) });
  const price = (name, natural, available = 100) => {
    let scale = 1;
    const box = { isConnected: true, get clientWidth() { return available; }, style: {
      removeProperty() { scale = 1; log.push(`reset:${name}`); },
      setProperty(key, value) { scale = Number(value); log.push(`write:${name}:${value}`); },
    } };
    const line = { isConnected: true, getClientRects() { log.push(`read:${name}`); return [{ width: natural * scale }]; } };
    return { box, line, scale: () => scale };
  };
  return { schedule, price, log, frames, flush: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(run => run()); } };
}

test('prices share a frame and all reads precede the next round of font writes', () => {
  const s = setup(), a = s.price('a', 115), b = s.price('b', 108), c = s.price('c', 90);
  for (const p of [a,b,c]) s.schedule(p.box, p.line);
  assert.equal(s.frames.size, 1);
  s.flush();
  assert.deepEqual(s.log, ['reset:a','reset:b','reset:c','read:a','read:b','read:c','write:a:0.92','write:b:0.92','read:a','read:b','write:a:0.84','read:a']);
  assert.equal(a.scale(), 0.84); assert.equal(b.scale(), 0.92); assert.equal(c.scale(), 1);
});

test('removal, replacement and hidden prices do not leave pending layout work', () => {
  const s = setup(), p = s.price('p', 200), hidden = s.price('hidden', 200, 0);
  const cancelOld = s.schedule(p.box, p.line);
  const cancelNew = s.schedule(p.box, p.line);
  cancelOld(); assert.equal(s.frames.size, 1);
  cancelNew(); assert.equal(s.frames.size, 0);
  s.schedule(p.box, p.line); p.box.isConnected = false;
  s.schedule(hidden.box, hidden.line); s.flush();
  assert.deepEqual(s.log, ['reset:hidden']);
});

test('refitting after a price or width change restores the original size', () => {
  const s = setup(), p = s.price('p', 140);
  s.schedule(p.box,p.line); s.flush(); assert.equal(p.scale(),0.68);
  p.line.getClientRects = () => [{width:80}];
  s.schedule(p.box,p.line); s.flush(); assert.equal(p.scale(),1);
});
