// Mobile keyboards resize the visual viewport, while fixed overlays and dvh
// can still use the full layout viewport. Keep this overlay inside visible space.
export function bindModalViewport(backdrop, scroller, view = window) {
  const mobile = view.matchMedia("(max-width: 700px), (pointer: coarse)");
  const viewport = view.visualViewport;
  let frame = 0;
  const update = () => {
    frame = 0;
    if (!mobile.matches) {
      backdrop.style.removeProperty("--modal-viewport-height");
      backdrop.style.removeProperty("--modal-viewport-top");
      return;
    }
    backdrop.style.setProperty("--modal-viewport-height", `${viewport?.height ?? view.innerHeight}px`);
    backdrop.style.setProperty("--modal-viewport-top", `${viewport?.offsetTop ?? 0}px`);

    // Scroll only the form contents, so the underlying page stays in place.
    const focused = backdrop.ownerDocument.activeElement;
    if (!scroller.contains(focused) || !focused.matches("input, textarea, select")) return;
    const bounds = scroller.getBoundingClientRect();
    const field = focused.getBoundingClientRect();
    const gutter = 8;
    if (field.top < bounds.top + gutter) scroller.scrollTop += field.top - bounds.top - gutter;
    else if (field.bottom > bounds.bottom - gutter) scroller.scrollTop += field.bottom - bounds.bottom + gutter;
  };
  const schedule = () => {
    if (!frame) frame = view.requestAnimationFrame(update);
  };
  update();
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  view.addEventListener("resize", schedule);
  mobile.addEventListener("change", schedule);
  backdrop.addEventListener("focusin", schedule);
  return () => {
    view.cancelAnimationFrame(frame);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    view.removeEventListener("resize", schedule);
    mobile.removeEventListener("change", schedule);
    backdrop.removeEventListener("focusin", schedule);
    backdrop.style.removeProperty("--modal-viewport-height");
    backdrop.style.removeProperty("--modal-viewport-top");
  };
}
