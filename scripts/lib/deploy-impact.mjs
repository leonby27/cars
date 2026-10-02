// One policy for both revision planning and snapshot compatibility.
// Unknown runtime files remain conservative; extend audited exceptions only
// after checking that they render prepared data rather than prepare it.
const renderOnly = new Set([
  'config/critical-classes.json',
  'src/analytics.js', 'src/boot-api.js', 'src/counter-loader.js', 'src/price-fit.js', 'src/spec-fit.js',
  'src/model-text-load.js', 'src/model-text-imports.js', 'src/model-texts.js',
  'src/blog-text-load.js', 'src/blog-text-imports.js', 'src/blog-texts.js',
  'src/info-pages-seo.js', 'src/service-copy.js', 'src/purchase-info.js', 'src/tracking-info.js',
  'src/legal-copy.js', 'src/service-video-loading.js', 'src/vehicle-market-savings.js', 'src/market-compare.js',
]);
const operationsOnly = new Set([
  'scripts/deploy.mjs', 'scripts/deploy-plan.mjs', 'scripts/build.mjs',
  'scripts/clean-dist.mjs', 'scripts/split-css.mjs', 'scripts/precompress-dist.mjs',
  'scripts/prerender-home.mjs', 'scripts/audit-blog-images.mjs',
  'db/migrations/045_vehicles_updated_at_index.sql',
  'db/migrations/046_catalog_read_indexes.sql',
]);
export const developmentOnly = file => /^(tests|research|docs)\//.test(file)
  || /(^|\/)(AGENTS|README)[^/]*\.md$/.test(file);
export const presentationOnly = file => renderOnly.has(file)
  || /^src\/.*\.(jsx|tsx|css)$/.test(file)
  || /^src\/(model-texts|blog-texts)\//.test(file)
  || /^public\/.*\.(avif|webp|png|jpe?g|svg|gif|ico|woff2?|ttf|mp4|webm)$/.test(file);
export const catalogInput = file => !developmentOnly(file) && !presentationOnly(file)
  && !operationsOnly.has(file) && !file.startsWith('deploy/');
// Journal selection affects the catalog snapshot, but not the feed. The feed
// imports a literal CORE_MODELS list from social-blocks, not its journal helpers.
const catalogOnly = new Set([
  'scripts/generate-seo-pages.mjs', 'scripts/lib/catalog-build-cache.mjs',
  'scripts/lib/blog-cover.mjs', 'src/blog-posts.js', 'src/blog-social.js',
]);
export const feedInput = file => catalogInput(file) && !catalogOnly.has(file);
export const priceInput = file => !developmentOnly(file) && !presentationOnly(file) && !operationsOnly.has(file) && (
  file === 'scripts/backfill-estimates.mjs' || file === 'scripts/lib/che168-parser.mjs'
  || file.startsWith('db/migrations/') || file.startsWith('config/')
  || /^src\/.*\.js$/.test(file) && !['src/blog-posts.js','src/blog-social.js'].includes(file));
export const duplicateInput = file => file === 'scripts/deduplicate-cross-source.mjs'
  || file === 'scripts/lib/cross-source-dedupe.mjs'
  || file.startsWith('config/') && !presentationOnly(file) || file.startsWith('db/migrations/') && !operationsOnly.has(file);
// Listener imports modules once. Unknown runtime changes still reload it;
// audited presentation/editorial/deployment changes do not.
export const botInput = file => catalogInput(file) && !catalogOnly.has(file)
  && !['scripts/lib/deploy-impact.mjs','scripts/lib/deploy-plan.mjs','scripts/lib/reuse-feed.mjs','scripts/yandex-feed.mjs'].includes(file)
  || file === 'deploy/abcars-bot.service';
