// Fit all visible prices in one batch: read every width before changing any font.
// A long catalog then needs at most one layout per size step, not one per card.
const STEPS = [0.92, 0.84, 0.76, 0.68];
export function createPriceFitQueue({ requestFrame, cancelFrame }) {
  const pending = new Map();
  let frame = null;
  const fits = ({ box, line }) => {
    const width = box.clientWidth;
    if (!width) return true;
    const rects = line.getClientRects();
    return rects.length === 1 && rects[0].width <= width + 1;
  };
  const flush = () => {
    frame = null;
    let entries = [...pending.values()].filter(({ box, line }) => box.isConnected && line.isConnected);
    pending.clear();
    for (const { box } of entries) box.style.removeProperty('--price-fit');
    entries = entries.filter(entry => !fits(entry));
    for (const step of STEPS) {
      if (!entries.length) break;
      for (const { box } of entries) box.style.setProperty('--price-fit', String(step));
      entries = entries.filter(entry => !fits(entry));
    }
  };
  return (box, line) => {
    const entry = { box, line };
    pending.set(box, entry);
    if (frame === null) frame = requestFrame(flush);
    return () => {
      if (pending.get(box) !== entry) return;
      pending.delete(box);
      if (!pending.size && frame !== null) { cancelFrame(frame); frame = null; }
    };
  };
}

export const schedulePriceFit = createPriceFitQueue({
  requestFrame: callback => requestAnimationFrame(callback),
  cancelFrame: id => cancelAnimationFrame(id),
});
