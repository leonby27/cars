#!/usr/bin/env node
import '../config/load-env.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshPublishedSitemaps } from './lib/sitemap-refresh.mjs';
import { safeDiagnostic } from './lib/circle-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const result = await refreshPublishedSitemaps({ root });
  console.log(`[sitemap] ${JSON.stringify(result)}`);
} catch (error) {
  console.error(`[sitemap] ${safeDiagnostic(error.message)}`);
  process.exitCode = 1;
}
