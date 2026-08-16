import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const STYLESHEET_URL = new URL("../src/styles.css", import.meta.url);
const MINIMUM_FONT_SIZE_PX = 16;

test("CSS font sizes never fall below 16px", async () => {
  const stylesheet = await readFile(STYLESHEET_URL, "utf8");
  const violations = [];

  for (const match of stylesheet.matchAll(/font-size\s*:\s*([^;}]+)/gi)) {
    const declaration = match[1].trim();

    for (const value of declaration.matchAll(/(-?\d*\.?\d+)px/gi)) {
      const size = Number(value[1]);

      if (size < MINIMUM_FONT_SIZE_PX) {
        const line = stylesheet.slice(0, match.index).split("\n").length;
        violations.push(`line ${line}: font-size: ${declaration}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found font sizes below ${MINIMUM_FONT_SIZE_PX}px:\n${violations.join("\n")}`,
  );
});
