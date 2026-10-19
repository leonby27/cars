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
services are untouched. Individual vehicle cards and images are never included. The index references
only the pages sitemap (catalog sections, models, journal and other public
pages). All former vehicle shards and compressed copies are removed.
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
and matching `ADVERTISE`/`advertise` or `SOLD`/`soldOut` states. Active public
details follow the normal parser and import policy. Unconfirmed pages and
verification redirects remain errors; they are never followed as a bypass.
No proxy/cookie/agent-rotation configuration is added.

Resume checks access first. If lists return 407 but a matching public card is
verified, it may continue the saved queue while requiring public confirmation
for API 404s too. This prevents treating an API access problem as mass sales.
If no lists could be confirmed during a fresh walk, details are not processed.
HTML/geographic error pages cannot prove a sale. Failed history, inspection or
battery requests cannot overwrite saved records with empty history; absence
responses are accepted only while the API is verified. Database connection or
resource failures stop processing with the queue retained.

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
