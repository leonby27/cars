# Geographic access — 28 October 2026

The owner requested verification of all traffic outside the existing CIS/Europe country list and a full Singapore block. Cyprus, Georgia and Turkey remain in the existing list. The rules are shared by abcars.by and abdrive.ru. Country classification uses the current DB-IP country source for both IPv4 and IPv6.

Installed on both production domains on 28 October 2026 at 17:36 Europe/Minsk. Configuration backup: `/var/backups/car-catalog-guard.q_omi7t2`. Installed-policy checks passed on both hosts; the daily updater completed successfully after installation. The initial protection installation did not rebuild the application.

- Every content location inherits the geographic auth check: informational/private pages, HTML aliases, model metadata, authentication/submission APIs, analytics endpoints, static assets and photos. The verification endpoints stay reachable to visitors who need to solve reCAPTCHA. Safe same-origin return paths now cover informational pages and account entry too. Non-catalog requests do not spend catalog-export budgets.
- SG is denied by nginx before location handling, provider exemptions, cache delivery or valid visitor clearance. The same denial covers HTTP/www redirect servers and the CAPTCHA endpoints. It remains active if the Python verification service is stopped or its country data expires. Both nginx rules and Python country classes derive from the same validated source; there is no independent hand-maintained IP list.
- Verified search crawlers and internal warmers retain their exemptions. Ahrefs requires its published address ranges and matching agent. OpenAI GPTBot, Claude training, Common Crawl and Amazon crawlers require their published crawler ranges and matching agent; Meta crawlers require its AS32934 networks from RIPEstat and matching agent. Existing search/user fetch verification and all provider capacity limits remain. A crawler name alone grants no exemption. SG denial takes precedence over every exemption.
- The daily country updater also refreshes crawler ranges, validates the generated classifier and nginx country map, and reloads nginx only when the denial map changes. A failed feed retains its previous verified list; failed nginx validation restores both old country data and old denial rules. The existing stale/unknown country-data availability fallback for CAPTCHA is preserved; it does not disable the independent nginx country block.

Validation: country policy/clearance/IPv6 checks, source generation and failed-refresh rollback, installer rollback, isolated nginx-to-service checks on both hosts (static locations, all methods, cached pages, signed clearance, spoofed agents, blocked country with the service stopped), actual October country-map checks, and Chromium desktop/mobile navigation with a fake managed widget. No live visitor CAPTCHA was solved automatically.

The owner subsequently authorized committing, pushing and synchronizing these changes to the server on 28 October 2026. Use the standalone protection installer for this release. Further changes require their own publication authorization.

## Previous policy — 25 October 2026

Status: activated on both production sites on 25 October 2026 after explicit owner authorization. The owner authorized committing, pushing and publishing the prepared protection changes and simplified verification page on 26 October 2026. A new domain-restricted Google v2 key was created in abcars-search-analytics, with the secret stored only in the root-managed service environment.

The candidate has one verification mechanism: Google reCAPTCHA v2. The local geography rule requests it before the first catalog GET from outside the existing Europe/former USSR/Turkey exemption list. Successful server validation grants a signed one-hour clearance. Known search/internal and verified Ahrefs exemptions remain; unknown/stale country data fails open for availability.

Removed from code and candidate configuration: the four-digit image/audio CAPTCHA and audio files, expired IP/subnet lists, same-car cross-network HTML/API correlation, collective subnet-risk scoring and shared subnet-clearance budgets. There are no disabled duplicate detectors. Their historical SQLite tables are left untouched and unused; no business or catalog database is involved.

Retained because CAPTCHA does not replace them: replay-safe signed sessions/nonces, country lookup, cache access checks, personal IP/session mass-export limits and nginx capacity/provider limits. The ordinary candidate rate allowance remains 120 catalog requests/minute with burst 120 (short budget 240/minute); public reads 600/minute with burst 160. Rates count requests, not pages. Existing provider limits and trusted-search exemptions are preserved.

The replacement installer validates both Google keys, policy and country data before touching production. Old audio files are retired with backup/rollback during an authorized replacement installation. Its receipt never prints the service environment or credentials. A missing provider cannot silently activate the weak local CAPTCHA.

Validation includes ordinary browsing, first-read geographic challenge, managed recovery, exact host/token checks, nonce reuse rejection, personal export limits, cached responses, installer preflight and rollback. The existing browser fixture was adapted to a fake managed widget; live Google widgets have been checked on both domains, and the configured secret was accepted by Siteverify (invalid-token preflight). No real visitor challenge was solved automatically.

The remaining limits are heuristics and shared IPs can still aggregate activity; zero false positives cannot be guaranteed. Geographic CAPTCHA also cannot prevent exempt-country proxies, paid solvers or stolen valid cookies. The cleanup does not justify removing working server protection before the replacement is installed.

The verification page shows the heading and Google checkbox, then submits automatically after a successful widget callback. Extra continue/refresh buttons and the clearance-duration explanation are omitted. The small DB-IP attribution remains with `rel="nofollow"`. Error pages retain their recovery action.


## Full-page correction release — 26 October 2026

The owner authorized commit, push and server installation of all prepared changes on 26 October 2026. The owner reported that an outside-country visitor could dismiss the remaining iframe dialog and continue viewing cards already embedded in the homepage. This was a mismatch between the verification page and its old API-recovery wrapper, plus the unguarded initial home HTML.

The candidate replaces the dismissible iframe with a single full-page navigation on a marked, active, same-origin catalog GET refusal. It preserves the current public path, filters and fragment for automatic return; it does not retry denied catalog reads. Aborted requests, forms, authentication/account pages and unmarked capacity refusals do not trigger this navigation. Private background reads remain denied rather than granting catalog access.

The geographic rule now covers `/`, its query variants and direct `/api/pages/static` home representations before shared-cache delivery. `/index.html` redirects to the guarded root. Home checks do not consume personal enumeration budgets. Verified search/internal exemptions, allowed countries, one-hour signed clearance and stale-data availability behavior remain. The CAPTCHA page refuses iframe embedding; its completion script returns directly to the requested public page.

Regression checks cover cached home HTML denied on both hosts, encoded/direct aliases, no modal/close path, single navigation for parallel refusals, private forms, reload before solving and automatic return with the fake test provider. No live CAPTCHA was solved during automated verification.
