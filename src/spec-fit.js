// Mini-spec rows share read/write phases, instead of forcing a layout for every
// car three times (mount, ResizeObserver and font readiness).
export function createSpecFitQueue({ requestFrame, cancelFrame, computedStyle }) {
  const pending = new Map();
  let frame = null;
  const flush = () => {
    frame = null;
    const rows = [...pending.keys()].filter(row => row.isConnected)
      .map(row => ({ row, available:row.clientWidth, chips:[...row.children] }))
      .filter(item => item.available > 0);
    pending.clear();
    for (const item of rows) {
      item.styles = item.chips.map(chip => chip.style.cssText);
      for (const chip of item.chips) chip.style.removeProperty('display');
    }
    for (const item of rows) {
      item.eligible = item.chips.map(chip => computedStyle(chip).display !== 'none');
      item.gap = Number.parseFloat(computedStyle(item.row).columnGap) || 0;
    }
    for (const { chips, eligible } of rows) chips.forEach((chip, i) => {
      if (!eligible[i]) return;
      Object.assign(chip.style, { display:'flex', flex:'none', width:'max-content', maxWidth:'none' });
    });
    for (const item of rows) item.widths = item.chips.map((chip, i) => item.eligible[i] ? chip.getBoundingClientRect().width : 0);
    const bodyLabels = [];
    for (const { chips, eligible, styles, widths, available, gap } of rows) {
      let occupied = 0;
      chips.forEach((chip, i) => {
        chip.style.cssText = styles[i];
        if (!eligible[i]) return;
        const next = occupied + (occupied ? gap : 0) + widths[i];
        const fits = next <= available + 0.5;
        chip.style.display = fits ? '' : 'none';
        if (fits) {
          occupied = next;
          // Body type is the final chip; also hide it when its own label clips.
          if (chip.classList.contains('body-type-spec')) {
            const label = chip.querySelector('span');
            if (label) bodyLabels.push({ chip, label });
          }
        }
      });
    }
    const clipped = bodyLabels.filter(({ label }) => label.scrollWidth > label.clientWidth + 1);
    for (const { chip } of clipped) chip.style.display = 'none';
  };
  return row => {
    const token = {};
    pending.set(row, token);
    if (frame === null) frame = requestFrame(flush);
    return () => {
      if (pending.get(row) !== token) return;
      pending.delete(row);
      if (!pending.size && frame !== null) { cancelFrame(frame); frame = null; }
    };
  };
}
export const scheduleSpecFit = createSpecFitQueue({
  requestFrame: callback => requestAnimationFrame(callback),
  cancelFrame: id => cancelAnimationFrame(id),
  computedStyle: node => getComputedStyle(node),
});
