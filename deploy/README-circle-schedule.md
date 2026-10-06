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

Stop future scheduling with:
`systemctl disable --now abcars-circle-che.timer abcars-circle-guazi.timer abcars-circle-encar.timer`.
This does not stop a currently running collector. Stop a scheduled collector
with the corresponding `abcars-circle@SOURCE.service`; Che168/Guazi can also
be stopped through their existing Telegram commands.
