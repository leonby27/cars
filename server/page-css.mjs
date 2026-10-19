export const topLevelBlocks = (css) => {
  const blocks = [];
  let depth = 0;
  let start = 0;
  let inComment = false;
  let quote = null;
  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (inComment) {
      if (c === "*" && css[i + 1] === "/") {
        inComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "/" && css[i + 1] === "*") {
      inComment = true;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        blocks.push(css.slice(start, i + 1).trim());
        start = i + 1;
      }
    } else if (c === ";" && depth === 0) {
      // Правила без тела: @import, @charset, @layer a, b;
      blocks.push(css.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  const tail = css.slice(start).trim();
  if (tail) blocks.push(tail);
  return blocks.filter(Boolean);
};

const headOf = (block) => {
  const brace = block.indexOf("{");
  return brace === -1 ? block : block.slice(0, brace);
};
const bodyOf = (block) => {
  const brace = block.indexOf("{");
  return brace === -1 ? "" : block.slice(brace + 1, block.lastIndexOf("}"));
};

export const classesOf = (selector) => (selector.match(/\.-?[_a-zA-Z][\w-]*/g) || []).map((name) => name.slice(1));
export const stateModifiers = new Set(["active", "selected", "open", "current", "future", "accent", "has-photo", "chosen", "disabled", "dragging", "measured"]);

export const splitBlock = (block, isCritical) => {
  const head = headOf(block).trim().replace(/^(?:\/\*[\s\S]*?\*\/\s*)+/, "");
  if (!head.startsWith("@")) {
    return isCritical(head) ? { critical: block, rest: "" } : { critical: "", rest: block };
  }
  const name = head.slice(1).split(/[\s({]/, 1)[0].toLowerCase();
  // Шрифты, переменные, анимации и настройки страницы нужны с первого кадра.
  if (["font-face", "keyframes", "-webkit-keyframes", "property", "charset", "import", "namespace", "page", "counter-style"].includes(name)) {
    return { critical: block, rest: "" };
  }
  if (!["media", "supports", "layer", "container", "scope"].includes(name)) {
    return { critical: block, rest: "" };
  }
  const inner = topLevelBlocks(bodyOf(block));
  const criticalInner = [];
  const restInner = [];
  for (const child of inner) {
    const split = splitBlock(child, isCritical);
    if (split.critical) criticalInner.push(split.critical);
    if (split.rest) restInner.push(split.rest);
  }
  return {
    critical: criticalInner.length ? `${head} {\n${criticalInner.join("\n")}\n}` : "",
    rest: restInner.length ? `${head} {\n${restInner.join("\n")}\n}` : "",
  };
};


const parsedStyles = new Map();

export function pageCriticalCss(css, markup) {
  let blocks = parsedStyles.get(css);
  if (!blocks) {
    blocks = topLevelBlocks(css);
    if (parsedStyles.size >= 8) parsedStyles.clear();
    parsedStyles.set(css, blocks);
  }
  const classes = new Set();
  for (const match of markup.matchAll(/\sclass=["']([^"']*)["']/g)) {
    for (const name of match[1].split(/\s+/)) classes.add(name);
  }
  const needed = (selector) => selector.split(",").some((part) => {
    if (/:(?:not|is|where|has)\(|\\|\[[^\]]*\./.test(part)) return true;
    const names = classesOf(part).filter((name) => !stateModifiers.has(name));
    return names.every((name) => classes.has(name));
  });
  return blocks.map((block) => splitBlock(block, needed).critical).filter(Boolean).join("\n");
}

export function withPageCss(html, markup) {
  return html.replace(/<style data-page-css>([\s\S]*?)<\/style>/g,
    (_, css) => `<style data-page-css>${pageCriticalCss(css, markup)}</style>`);
}
