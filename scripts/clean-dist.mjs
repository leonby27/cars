#!/usr/bin/env node
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenHostingConfig = path.join(root, ".openai", "hosting.json");

if (existsSync(forbiddenHostingConfig)) {
  throw new Error("ChatGPT Sites hosting is disabled for this project; production is abcars.by on Timeweb.");
}

rmSync(path.join(root, "dist"), { recursive:true, force:true });
