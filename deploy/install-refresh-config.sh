#!/bin/bash
# Install configuration only: never start a refresh or enable its timer.
set -euo pipefail
cd /srv/abcars
install -d /etc/systemd/system/abcars-refresh.service.d
install -m 644 deploy/abcars-refresh-full-cycle.conf /etc/systemd/system/abcars-refresh.service.d/full-cycle.conf
systemctl daemon-reload
echo "Настройка полного круга установлена; запуск и расписание не изменялись."
