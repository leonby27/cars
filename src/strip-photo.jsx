import { useEffect, useRef, useState } from "react";

// Native lazy loading can fetch an entire horizontal gallery. Only give hidden
// frames a URL when they enter the clipped strip, so swiping loads the next frame.
export function StripPhoto({ src, first = false, ...props }) {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (first || revealed) return undefined;
    if (typeof IntersectionObserver === "undefined") { setRevealed(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setRevealed(true); observer.disconnect(); }
    }, { rootMargin: "200px 0px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [first, revealed]);
  return <img {...props} ref={ref} src={first || revealed ? src : undefined} width="600" height="450" decoding="async" loading="lazy" />;
}
