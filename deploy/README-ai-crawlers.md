# Shared crawler and catalog protection

## Active replacement — 25 October 2026

Google reCAPTCHA v2 replaces all local verification puzzles and all previous collective-risk challenge heuristics. The owner authorized creation of the Google v2 key and installation on both sites. The replacement entered enforce mode at 08:19 Minsk; relaxed nginx allowances followed at 08:20. A final provider timing refinement was installed with backup. Google domain verification is enabled for abcars.by and abdrive.ru; credentials are only in the root-managed service environment (0600). Live widgets load on both domains. See the deployment receipt under outputs/2026-10-25-protection-release in the parent workspace.

The owner authorized committing, pushing and publishing the prepared replacement and simplified verification page on 26 October. The normal page contains the Google checkbox with automatic submission, no extra buttons or clearance-duration text, and a small DB-IP attribution using `rel="nofollow"`.

### Kept

- `geography` uses a compact, periodically refreshed local country database. Public GET catalog/list/card HTML and full-list APIs require reCAPTCHA when the address is outside the existing exemptions, before shared-cache delivery. Encoded paths and API aliases are normalized by `reading()`.
- Exempt countries (Europe, former USSR and Turkey), verified search providers, internal warmers and verified Ahrefs keep their existing exemptions. Forged User-Agent/forwarded headers do not create a trusted-search exemption.
- Geographic clearance is signed, host-only and valid for one hour. The opaque signed session can preserve it across a mobile address change. Forms/auth, assets, HEAD and light metadata are outside catalog verification.
- Google tokens are verified server-side, with exact hostname and timestamp checks. Nonces are session/IP-bound and single-use. Missing keys refuse startup/installation; provider validation failure never grants clearance and has no homemade fallback. Google outage produces a retry message.
- `mass_export` retains personal IP/session enumeration budgets. Around 600 distinct details, 100 paginated reads with 8,000 requested listing capacity, or 300 collection reads with 16,000 capacity cause verification. Additional daily clearance totals remain bounded to 8,000 units / 600 details; another CAPTCHA cannot reset those totals. Repeated normalized views remain available. Capacity means requested response capacity, not proven downloaded cars.
- Separate nginx capacity limits, explicit bot denials and provider budgets protect the origin. The verified PerplexityBot allowance remains 20 heavy GET/HEAD reads/minute across both domains and provider addresses, burst two. Google/Yandex and user-directed Perplexity fetches remain outside that specific quota.
- Transport/storage failure keeps the guard fail-open to preserve site availability; stale/unknown geodata cannot challenge everyone. Explicit personal-budget refusals are not converted into endless CAPTCHA loops.

### Removed

- Local four-digit picture generation, audio puzzles and answer checking; the old audio assets are no longer shipped.
- Expired October IP/subnet challenge lists.
- Statistical same-car HTML/API campaign matching and its UA, IP-count, timing and pair thresholds.
- Collective `/24`, `/16`, IPv6 group-risk detection and shared network-clearance quotas.
- All enable/disable/observe knobs for those removed mechanisms. Their tables are no longer created, queried or updated. Existing historical rows may remain idle on disk; this release does not destructively migrate the guard database.

Country classification and signed session/grant handling remain necessary: reCAPTCHA identifies a completed challenge but does not decide which visitor needs one, protect upstream caches or govern request capacity. CAPTCHA cannot stop exempt-country proxies, paid solvers or stolen clearance.

## Installation

Run the standalone `install-car-bot-protection.sh` for candidate nginx rate settings and `install-catalog-guard.py` for the guard only during an authorized release. Neither rebuilds the app or accesses the catalog/customer database.

Stage the companion Python/JS/nginx/unit files and fresh `catalog-guard-countries.json`. Set `CATALOG_RECAPTCHA_SITE_KEY` and `CATALOG_RECAPTCHA_SECRET_KEY` in the root-managed service environment, outside Git, for a domain-restricted v2 checkbox key covering abcars.by and abdrive.ru. The installer validates provider keys, policies and fresh countries before changing live files, locks releases, backs up files, validates nginx and rolls back on failure. Its receipt exposes only the guard mode, never service secrets. The retired audio directory is removed only as part of this validated, backed-up installation and is restored on rollback.

`update-catalog-guard-geo.py` consumes `geography.exempt_countries`; the daily geo update timer retains atomic refresh. Sources: [DB-IP](https://db-ip.com/db/download/ip-to-country-lite) and [Ahrefs ranges](https://api.ahrefs.com/v3/public/crawler-ip-ranges). Missing/mismatched/stale country data disables only the geographic condition, not personal/capacity safeguards.

`CATALOG_GUARD_MODE=observe` remains the single overall emergency observation switch; enforcement is not removed ad hoc before a replacement is ready.

## Verification

- `python3 tests/catalog-guard.test.py`: ordinary browsing, normalized aliases, personal/session budgets, daily clearance and persistence.
- `python3 tests/catalog-guard-geo.test.py`: immediate geographic checks, exemptions, one-hour clearance and stale data behavior.
- `python3 tests/catalog-guard-recaptcha.test.py`: Google validation and nonce replay binding.
- `python3 tests/catalog-guard-installer.test.py`: no mutation on missing keys, secret-safe receipt, audio retirement and full rollback in a sandbox.
- `node --test tests/catalog-guard-page.test.mjs`: actual rendered widget callback submits once after success, with minimal controls and nofollow attribution.
- `node --test tests/catalog-guard-client.test.mjs`: preserved drafts, cancellation and concurrent recovery.
- `python3 tests/catalog-guard.integration.py`: actual isolated nginx, cache, both domains, managed recovery and provider absence, with no production requests.
- `python3 tests/nginx-ai-limits.integration.py`: crawler/provider budgets, forged agents and ordinary burst allowances.
- `node tests/catalog-guard-navigation.browser.mjs`: optional existing React navigation fixture, now using an explicit fake managed-provider widget for tests rather than a local puzzle. No live CAPTCHA is solved by that fixture.

Google integration references: [widget](https://developers.google.com/recaptcha/docs/display), [server-side verification](https://developers.google.com/recaptcha/docs/verify).
