// Keep the fast path explicit. An unfamiliar runtime file gets a full rebuild.
const presentation = (file) => /^src\/.*\.(jsx|tsx|css)$/.test(file)
  || /^public\/.*\.(avif|webp|png|jpe?g|svg|gif|ico|woff2?|ttf|mp4|webm)$/.test(file);
const developmentOnly = (file) => /^(tests|research|docs)\//.test(file)
  || /(^|\/)(AGENTS|README)[^/]*\.md$/.test(file);
const pricingFiles = new Set([
  'src/pricing.js', 'src/pricing-state.js', 'src/ev-quota.js', 'src/china-logistics.js',
  'src/korea-logistics.js', 'src/engine-spec.js', 'src/origin.js',
  'config/import-policy.mjs', 'config/model-names-by.mjs',
  'scripts/lib/che168-parser.mjs', 'scripts/backfill-estimates.mjs',
]);
// Audited browser infrastructure does not change stored vehicle prices. Unknown
// JS remains conservative, but loading counters/text chunks must not rewrite DB rows.
const browserInfrastructure = new Set([
  'src/analytics.js', 'src/boot-api.js', 'src/counter-loader.js', 'src/price-fit.js', 'src/spec-fit.js',
  'src/model-text-load.js', 'src/model-text-imports.js',
  'src/blog-text-load.js', 'src/blog-text-imports.js',
]);
const duplicates = (file) => file === 'scripts/deduplicate-cross-source.mjs'
  || file === 'scripts/lib/cross-source-dedupe.mjs'
  || file.startsWith('config/') || file.startsWith('db/migrations/');

export function deploymentPlan(files, { knownBase = true, pricingRefreshed = false } = {}) {
  const changes = [...new Set(files)];
  const dataChanges = changes.filter(file => !presentation(file) && !developmentOnly(file));
  const full = !knownBase || pricingRefreshed || dataChanges.length > 0;
  return {
    mode:full ? 'full' : 'presentation',
    reuseCatalog:!full,
    reuseFeed:!full,
    // Data/API-only changes need fresh snapshots but do not necessarily alter
    // stored prices. Unknown calculation/configuration changes remain conservative.
    recalculatePrices:!knownBase || pricingRefreshed || changes.some(file =>
      pricingFiles.has(file) || file.startsWith('config/') || file.startsWith('db/migrations/')
      || /^src\/.*\.js$/.test(file) && !developmentOnly(file) && !browserInfrastructure.has(file)),
    checkDuplicates:!knownBase || changes.some(duplicates),
    migrate:!knownBase || changes.some(file=>file.startsWith('db/migrations/') || file === 'scripts/db-migrate.mjs'),
    reasons:!knownBase ? ['Нет исходной ревизии для сравнения']
      : pricingRefreshed ? ['Обновлены курсы или квоты']
      : dataChanges.length ? dataChanges
      : ['Изменены только интерфейс, оформление или проверки'],
  };
}
