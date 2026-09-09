import { useLayoutEffect, useRef } from "react";

// Measure natural card heights so the deck opens without fixed-height clipping.
export function usePurchaseMotion() {
  const timelineRef = useRef(null);
  useLayoutEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const cards = [...timeline.querySelectorAll(".purchase-timeline-card")];
    const measure = () => {
      const gap = parseFloat(getComputedStyle(timeline).getPropertyValue("--step-gap")) || 24;
      let top = 0;
      cards.forEach((card, index) => {
        const step = card.parentElement;
        const height = card.offsetHeight;
        step.style.setProperty("--expanded-top", `${top}px`);
        step.style.setProperty("--card-height", `${height}px`);
        step.style.setProperty("--deck-index", index);
        step.style.setProperty("--deck-order", cards.length - index);
        top += height + gap;
      });
      timeline.style.setProperty("--expanded-height", `${top - gap}px`);
      timeline.style.setProperty("--first-height", `${cards[0]?.offsetHeight || 400}px`);
      timeline.dataset.measured = "true";
    };
    const observer = new ResizeObserver(measure);
    cards.forEach((card) => observer.observe(card));
    measure();
    return () => observer.disconnect();
  }, []);
  return timelineRef;
}
