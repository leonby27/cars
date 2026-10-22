# Weekly source circles

Owner request, 2026-10-05: circle 1 / Che168 on Monday, circle 2 / Guazi
on Wednesday, circle 3 / Encar on Saturday, all at 18:00 Europe/Minsk.

Install the schedule with `bash deploy/install-circle-schedule.sh` on the
production server. This installation is separately authorized by the schedule
request; it does not publish the website or require a Git commit. Keep the
runner and its library alongside the repository scripts. Configuration backups
are stored under `/srv/abcars-backups/circle-schedule-*`.

The timers specify their own timezone. They have no randomized delay and do
not catch up missed executions after downtime. Enabling them does not start a
collector immediately. Existing source processes cause a skipped launch, with
a Telegram explanation. The old daily Che168 timer is disabled. Manual
Telegram commands remain available.

Che168 uses the existing full-circle command and its 100-new-cars-per-brand
setting. Guazi starts a new circle after completion, otherwise resumes its
durable checkpoint. Encar updates existing cars, then imports the refresh's
fresh discoveries using existing import/physical-vehicle deduplication rules.
Incomplete Encar refreshes prevent the import stage. Telegram receives only one
result per launch: a numeric summary after success, or detailed failure context,
saved progress and recent log lines after an error. There are no automatic
startup or per-brand messages. Child collectors use
`ABCARS_CIRCLE_REPORT_OWNER=scheduler` to prevent duplicate result notifications;
manual Che168/Guazi runs also omit per-brand notifications but keep their own
final result. Guazi persists summary metrics with its durable checkpoint. Encar
import reports are checked for request errors, not only process exit status.
Logs remain `/tmp/circle.log`,
`runtime/guazi-refresh/worker.log`, and `runtime/encar-circle.log`.

## Sitemap refresh after catalog changes

Prepared locally on 2026-10-19; requires a separately authorized release of the
updated runner and scripts before taking effect in production.

After a verified completed scheduled circle (including Encar discovery import),
the runner refreshes the sitemap before reporting success. It takes the same
`/run/lock/abcars-deploy.lock` as manual deployments, waiting up to 10 minutes.
The refresh generates fresh data in a temporary directory and replaces only the
sitemap XML files and their gzip/Brotli copies. HTML, assets, feeds and running
services are untouched. Pagination URLs (`?page=...`), individual vehicle cards and images are never included. The single `sitemap-7c4f19b2.xml` contains a direct URL list (catalog sections,
models, journal and other public pages). Former `-pages.xml` files, vehicle shards
and their compressed copies are removed.
Vehicle pages retain their existing indexing and internal-link behavior. Database/preparation failures preserve the previous
XML and fail the scheduled run; details are in `runtime/sitemap-refresh.log`.

Direct Che168/Guazi/Encar refreshes and Encar imports also invoke the refresh
after their database updates (dry runs and directories without a published
sitemap are skipped). Scheduled children defer to the runner so Encar refresh
and import produce one final sitemap update. For other import tools, run an
explicit refresh from `/srv/abcars` with its usual environment loaded:

```sh
flock -w 600 /run/lock/abcars-deploy.lock npm run sitemap:update
```

The refresh skips another site's profile, a closed preview build or a directory
without a published sitemap. It does not rebuild the frontend or publish code.

Encar refresh saves its unresolved detail queue atomically to
`runtime/encar-refresh-checkpoint.json`, after the list snapshot, every 100
processed cards or 30 seconds, and on a graceful stop. Resume it with
`npm run refresh:encar -- --resume` using the same `--brands` / `--year-from`
settings. Completed cards are omitted; failed and unattempted cards are retried.
A hard process kill can replay the last unsaved successful writes; upserts are
idempotent. Resume retains the original list/discovery date and cumulative
counts. A broken/stopped list walk is checked again on resume, preserving the
unresolved detail queue and successful writes. The scheduler resumes an unfinished
detail checkpoint; a completed round starts a new list snapshot. A failure before
the detail queue was created needs a fresh list walk. The October 10 failed run
predates this checkpoint format and cannot be resumed through this option.

`--detail-limit` and `--max-minutes` never turn an incomplete refresh into a
successful circle. Import stays blocked while any details or lists remain
unresolved. Dry runs write separate `*-dry.json` files and cannot overwrite the
live queue/discoveries/report. Network/HTTP, parsing and database failures are
counted separately; HTTP/network codes and representative errors appear in the
report and per-card log. Each live card rewrite is a database transaction.

Encar filters escape literal dots using the marketplace grammar (`ID_.4`,
`ID_.5`). Fractional electric/combined ranges are rounded to whole kilometres
only for the database integer columns; exact source values remain in the saved
payload and original technical specifications.

Encar shares its network backoff between workers: after five exhausted requests
(including their normal retries), all new requests wait 60 seconds. A valid HTTP
response clears the consecutive-failure counter. Fifteen exhausted requests in
a row stop the run with `ENCAR_UNAVAILABLE`, retaining the unresolved refresh
queue; this covers network errors, HTTP 429 and 5xx. The importer also stops and
waits for in-flight workers before writing its final report. Transport diagnostics
include nested socket/DNS errors from Node's `AggregateError` instead of only
`fetch failed`.

Request starts share the existing `--pace` across workers, including history and
inspection calls. HTTP 408 retries too. HTTP 429 respects `Retry-After` (30-second
fallback); a requested wait above two minutes stops safely and records when to
retry. Fifteen consecutive unverified cards or malformed cards also stop the
source, even when some optional endpoints still respond successfully.

HTTP 407 is read with the existing Undici `request` dependency: browser-style
`fetch` hides this response as a network failure. A 407 is not a sale. The client
checks the normal public Encar page's JSON state without executing JavaScript.
It requires the exact query/listing identity (including dummy advertisements),
and matching `ADVERTISE`/`advertise`, `WAIT`/`wait` or `SOLD`/`soldOut` states. Active public
details follow the normal parser and import policy. Unconfirmed pages and
verification redirects remain errors; they are never followed as a bypass.
No proxy/cookie/agent-rotation configuration is added.

Resume checks access first. If lists return 407 but a matching public card is
verified, it may continue the saved queue. API 404 always checks the public page;
a valid public WAIT or active card takes precedence over that HTTP status.
If no lists could be confirmed during a fresh walk, details are not processed.
HTML/geographic error pages cannot prove a sale. Failed history, inspection or
battery requests cannot overwrite saved records with empty history; absence
responses are accepted only while the API is verified. Database connection or
resource failures stop processing with the queue retained.

Consolidated follow-up installed after explicit owner approval on 2026-10-20.
Only the 11 agreed runtime modules and 10 test files were replaced; the catalog
backup and installation receipt are in
`/srv/abcars-backups/encar-system-20261020-lmvoqnkm/`. The retained queue was
expanded from 291 to 780 by requeuing the 489 removals from the last run, preserving
the original round and discovery dates. No catalog rows were bulk-reactivated.
Availability has four outcomes in the installed version of `encar-result.mjs`: active,
explicitly sold, temporarily hidden, or unconfirmed. Only matching explicit SOLD
sets `unavailable` and a sale date. WAIT, ordinary policy exclusions and a
verified API 404 paired with the site's structured failed detail load use
`skipped`, without a sale date. An unconfirmed response stays queued and keeps
the last stored state. The outcome, reason, source statuses and observation time
are recorded together with the listing in `sourceAvailability`.

Skipped listings are included in the next snapshot. Known unavailable ads that
reappear in current source lists also re-enter detail verification. Returning
ads use the same physical-vehicle identity guard as imports, including safe
replay after a successful write that preceded the last saved checkpoint.

Once the active card and price are verified, HTTP 407 on optional history,
inspection or battery data no longer blocks those facts. The Encar writer locks
the existing listing inside its transaction and retains its prior history,
battery facts and technical sheet, verifying the physical vehicle identity.
New listings keep unknown history instead of a clean-history claim. The payload
records `historyUnavailable`, the report counts deferred history explicitly,
and the next refresh rereads marked cars even when their price is unchanged.
A successful history response removes the marker through the ordinary rewrite.
Partial successful responses preserve previously known history values and rows;
missing facts remain null instead of becoming zero or "no accident". Explicit
new facts can still update the old values. The existing row is locked and its
physical identity checked for every Encar rewrite.
Transport/server/schema failures and unverified main-card availability still
remain errors; this exception is limited to optional HTTP 407 responses.

The existing scheduled runner retries an Encar phase once after five minutes
for a typed temporary source interruption or an incomplete live list. It resumes
the saved refresh queue or repeats the checkpointed import, whose known-ID guard
skips saved cars. The source lock stays held. Parse errors, write failures and
stale reports never trigger this automatic retry. A stop interrupts the pause.
Only one final notification is sent; persistent source interruptions are reported
as paused, without claiming completion. No extra timer or queue is required.

Status updates must acknowledge exactly one row; round totals must match the
original snapshot. Damaged queues or inconsistent totals are rejected before
resumption. The combined regression scenario covers the original response types,
a database interruption, an access outage, history preservation, revival and
resumption of only unresolved IDs.

Owner policy update installed after explicit approval on 2026-10-20: API 404/407
paired with an explicit structured failed public detail load becomes
`unavailable`, leaves the pending queue and does not block discovery import.
Keep the record and facts, record `source-unavailable`, and omit a sale date for
this assumption. The removed total includes these records and separately shows
`unverifiedUnavailable`. A streak of 15 missing cards checks a known readable
control; a failed control still stops a source-wide outage. Other transport,
schema, identity and write failures retain their safeguards. This supersedes the
previous hidden/queued behavior for these missing-data responses. Five runtime
modules and ten test files were installed, with 119/119 checks passing on the
installed files. Backup and receipt:
`/srv/abcars-backups/encar-unavailable-install-20261020-w8nc2xis/`.
The existing service resumed the original queue of 503 IDs without an installer
rewrite of the checkpoint or catalog. Unrelated website changes were excluded.

Optional-history follow-up installed with explicit owner approval on 2026-10-21,
without stopping or restarting the active circle. Optional HTTP 404 without a
transport error during the API access problem now uses `historyUnavailable`,
like optional HTTP 407. Verified main-card data remains usable and saved history
is retained. This does not relax main-card, transport, schema or write checks.
Only `encar-client.mjs` and its regression test were replaced; 119/119 installed
checks passed. Backup and receipt:
`/srv/abcars-backups/encar-optional-history-install-20261021-d3zj8lan/`.
The scheduler/importer PID and start time remained unchanged. Existing processes
keep their previously loaded module; the change takes effect in a new process.
Already recorded rejections remain in the current attempt's final report.

Reports keep cumulative round totals and a separate `attempt` with current
completed/error counts and examples. Old queued failures are not presented as
new failures. The scheduler validates current resume/finish timestamps while
retaining the original list/discovery date, so a successful resumed refresh can
proceed to import without accepting an unrelated stale report.

List pagination uses each page's current count because ads can disappear during
the walk. An unexpectedly empty page is retried twice (after 5 and 10 seconds).
A confirmed smaller count can complete the slice; a persistent gap still marks
it incomplete and blocks import. No completeness check is bypassed.

Stop future scheduling with:
`systemctl disable --now abcars-circle-che.timer abcars-circle-guazi.timer abcars-circle-encar.timer`.
This does not stop a currently running collector. Stop a scheduled collector
with the corresponding `abcars-circle@SOURCE.service`; Che168/Guazi can also
be stopped through their existing Telegram commands.
