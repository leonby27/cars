#!/bin/bash
# Explicit owner request: install and enable the weekly schedule, never run now.
set -euo pipefail
cd /srv/abcars
backup_dir="/srv/abcars-backups/circle-schedule-$(date -u +%Y%m%dT%H%M%SZ)"
install -d "$backup_dir"
systemctl list-timers --all --no-pager > "$backup_dir/timers-before.txt"
systemctl is-enabled abcars-refresh.timer > "$backup_dir/old-refresh-enabled.txt" || true
for unit in abcars-circle@.service abcars-circle-che.timer abcars-circle-guazi.timer abcars-circle-encar.timer; do
  if test -f "/etc/systemd/system/$unit"; then cp -a "/etc/systemd/system/$unit" "$backup_dir/"; fi
done
systemd-analyze verify deploy/abcars-circle@.service deploy/abcars-circle-{che,guazi,encar}.timer
install -m 644 deploy/abcars-circle@.service deploy/abcars-circle-{che,guazi,encar}.timer /etc/systemd/system/
systemctl daemon-reload
systemctl disable --now abcars-refresh.timer
systemctl enable --now abcars-circle-che.timer abcars-circle-guazi.timer abcars-circle-encar.timer
systemctl list-timers --all --no-pager 'abcars-circle*'
echo "Backup: $backup_dir"
