import { useEffect, useRef, useState } from "react";

// Native lazy loading can fetch an entire horizontal gallery or model carousel.
// Only give hidden frames a URL near the viewport and inside the clipped track.
export function StripPhoto({ src, first = false, loading = "lazy", ...props }) {
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
  return <img {...props} ref={ref} src={first || revealed ? src : undefined} width="600" height="450" decoding="async" loading={loading} />;
}
