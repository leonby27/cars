#!/bin/bash
set -euo pipefail
install -m644 /srv/abcars/deploy/abcars-social-week.service /etc/systemd/system/
install -m644 /srv/abcars/deploy/abcars-social-week.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now abcars-social-week.timer
systemctl list-timers abcars-social-week.timer --no-pager
