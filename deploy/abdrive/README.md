# Independent ABDrive deployment

These scripts target the existing Timeweb host. Release and HTTPS operations share `/run/lock/abdrive-release.lock`. Never use the BY deployment runner to release ABDrive.

- `provision.py`: one-time additive creation of new database, roles, service user and private environment. Refuses existing ABDrive resources. No existing business rows are touched.
- `install-release.sh ARCHIVE RELEASE`: extracts an immutable release, installs dependencies, applies only the guarded RU schema, switches only ABDrive, checks catalog/HTTP and preserves BY process. On failure restores a real prior release or stops the new service.
- `enable-https.sh`: requires both public names to resolve to 5.23.48.128; obtains a separate certificate and installs the HTTPS config. Does not edit BY certificates.

Build locally with `SITE_ID=abdrive VITE_SITE_ID=abdrive SITE_URL=https://abdrive.ru npm run build`. Archive config, src, server, scripts/lib, scripts/abdrive-migrate.mjs, db/sites/abdrive, db/market, dist-abdrive, package.json, package-lock.json and deploy/abdrive. Do not include env files, node_modules, local data or BY dist. Upload archive to /tmp and run the installer as root. Keep the previous release for rollback.

Private settings live in `/etc/abdrive/environment`. The lead form stays unavailable until actual operator documents and a consent version are configured. Set explicit RU Telegram credentials before enabling intake. No automatic BY credential inheritance. Do not add test leads to production; integration tests target only loopback PostgreSQL.

Include `scripts/abdrive-warm-prices.mjs` in release archives. Before switching the application, the installer reuses `/var/cache/abdrive/price-index.json` and updates only imported listings that changed. A full catalog calculation remains for a missing index, a new pricing version or the twice-monthly rate change. The running service checks indexed change timestamps instead of recalculating the catalog every five minutes. The installer checks the home page, brand directory, budget pages and catalog before accepting a release; it expects `/blog` to return 404 while the journal flag is disabled and checks it as a page only when enabled.

Manual application rollback: resolve the previous directory in `/srv/abdrive/releases`, point `/srv/abdrive/current` to it atomically, restart only `abdrive`, then check its local health and catalog. Do not drop the private database when rolling back application code.

Current installed release and unfinished items: `docs/architecture/two-sites.md`.

Crawler budgets: include the shared `deploy/nginx-car-ai-*.conf`,
`deploy/nginx-abcars-proxy.conf` and `deploy/install-car-ai-limits.sh` in releases
that install nginx configuration. Follow `deploy/README-ai-crawlers.md`; the new
site config depends on `/etc/nginx/snippets/car-ai-limit.conf` and its http zone.

Homepage performance: the same preparation script writes `/var/cache/abdrive/home-snapshot.json` before switching releases. It uses 20 public cards with five preview photos, model links and catalog facts; the runtime renders it before listening and refreshes in the background. The one offline database connection has a 30-second statement timeout; the live application's five-second limit is unchanged. Missing snapshots never block the homepage.

The RU build creates Brotli assets. When deploying the 2026-10-02 first-load fix, also sync `nginx-https.conf` to the existing ABDrive vhost after backing it up, run `nginx -t`, and reload nginx. This routes public build assets directly from the current RU release; it must not replace BY configuration. The release installer does not otherwise overwrite existing HTTPS configuration.
