const SHORT_RUSSIAN_WORD = /(^|[\s([{"'«„—–-])((?:а|в|во|да|до|за|и|из|к|ко|на|не|ни|но|о|об|от|по|с|со|у))[\t ]+(?=[\p{L}\p{N}])/giu;
const SKIPPED_CONTENT = "script, style, textarea, select, option, pre, code, [contenteditable='true'], [data-typography='off']";

export function protectRussianShortWords(value) {
  if (typeof value !== "string" || !/[А-ЯЁа-яё]/.test(value)) return value;

  let result = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = result.replace(SHORT_RUSSIAN_WORD, "$1$2\u00a0");
    if (next === result) break;
    result = next;
  }
  return result;
}

function shouldSkip(node) {
  return !node.parentElement || Boolean(node.parentElement.closest(SKIPPED_CONTENT));
}

function processTextNode(node) {
  if (shouldSkip(node)) return;
  const next = protectRussianShortWords(node.nodeValue);
  if (next !== node.nodeValue) node.nodeValue = next;
}

function processSubtree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    processTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) processTextNode(walker.currentNode);
}

export function installRussianTypography(root) {
  processSubtree(root);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") {
        processTextNode(mutation.target);
        return;
      }
      mutation.addedNodes.forEach(processSubtree);
    });
  });

  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}
