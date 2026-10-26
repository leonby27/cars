# Catalog protection replacement — 25 October 2026

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
