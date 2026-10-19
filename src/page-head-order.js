export function orderPageHead(head) {
  const anchor = head.querySelector('meta[name="viewport"]') || head.querySelector('meta[charset]');
  let cursor = anchor ? anchor.nextSibling : head.firstChild;
  const nodes = [
    ...head.querySelectorAll('title'),
    ...['description', 'robots', 'googlebot'].flatMap(name => [...head.querySelectorAll(`meta[name="${name}"]`)]),
    ...head.querySelectorAll('link[rel="canonical"], link[rel="alternate"][hreflang], link[rel="prev"], link[rel="next"]'),
    ...head.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]'),
  ];
  for (const node of nodes) {
    if (node === cursor) cursor = cursor.nextSibling;
    else head.insertBefore(node, cursor);
  }
}
