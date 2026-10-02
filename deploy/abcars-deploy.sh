#!/bin/bash
# Выкладка новой версии сайта: забрать код, собрать, перезапустить.
# Прошлая сборка сохраняется рядом — если новая окажется плохой, откат мгновенный.
set -euo pipefail
cd "${ABCARS_DEPLOY_ROOT:-/srv/abcars}"
# A second manual deploy cannot replace dist.next while the first one builds it.
exec 9>"${ABCARS_DEPLOY_LOCK:-/run/lock/abcars-deploy.lock}"
flock -n 9 || { echo "другая выкладка уже выполняется"; exit 1; }
log_root="${ABCARS_DEPLOY_LOG_ROOT:-/var/log/abcars-deploy}"
run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$log_root/$run_id"
log_dir="$log_root/$run_id"
exec > >(tee -a "$log_dir/deploy.log") 2>&1
started=$SECONDS
stage=prepare
rollback_needed=0
finish() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ] && [ "$rollback_needed" -eq 1 ]; then
    echo "проверка новой версии не прошла — возвращаем предыдущую сборку"
    mv dist "dist.failed-$run_id" && mv dist.prev dist && systemctl restart abcars \
      && find /var/cache/nginx/abcars -type f -delete \
      || echo "ОШИБКА ОТКАТА: требуется восстановление через abcars-rollback.sh"
  fi
  printf '[deploy] finished exit=%s elapsed=%ss revision=%s log=%s\n' "$result" "$((SECONDS-started))" "${after_rev:-unknown}" "$log_dir"
  printf '{"exitCode":%s,"seconds":%s,"revision":"%s","lastStage":"%s"}\n' "$result" "$((SECONDS-started))" "${after_rev:-unknown}" "$stage" > "$log_dir/result.json"
}
trap finish EXIT
run() {
  stage=$1; shift
  local begin=$SECONDS
  printf '[deploy] %s start %s\n' "$stage" "$(date -u +%FT%TZ)"
  "$@"
  printf '[deploy] %s complete %ss\n' "$stage" "$((SECONDS-begin))"
}


before_rev=""
after_rev=""
pricing_refreshed=0

if [ -d .git ]; then
  before_rev=$(git rev-parse HEAD)
  # Compare with the last published revision even after a failed build/pull.
  if [ -s dist/release.json ]; then
    published_rev=$(node -p "JSON.parse(require('fs').readFileSync('dist/release.json','utf8')).revision")
    before_rev=$(git rev-parse --verify "$published_rev^{commit}")
  fi
  # Merge the pinned object, not a moving origin/main after another fetch.
  if [ -n "${ABCARS_DEPLOY_REVISION:-}" ]; then
    target_rev=$ABCARS_DEPLOY_REVISION
    test "$(git rev-parse origin/main)" = "$target_rev"
  else
    run fetch git fetch origin main
    target_rev=$(git rev-parse FETCH_HEAD)
  fi

  # Ночные задачи держат свежий курс и остаток квоты прямо в этих двух файлах.
  # Обычный pull умеет сохранить такие локальные правки, пока новый коммит их не
  # затрагивает. Это быстрый путь для подавляющего большинства выкладок интерфейса.
  if ! git merge --ff-only "$target_rev"; then
    # Если новый коммит тоже меняет расчёт или квоту, Git не может совместить его
    # с ночными цифрами. Только в этом редком случае забираем версию из репозитория
    # и повторно получаем актуальные данные из источников.
    if git diff --quiet -- . ':(exclude)src/pricing.js' ':(exclude)src/ev-quota.js' \
      && git diff --cached --quiet -- . ':(exclude)src/pricing.js' ':(exclude)src/ev-quota.js'; then
      git checkout -- src/pricing.js src/ev-quota.js 2>/dev/null || true
      git merge --ff-only "$target_rev"
      /usr/local/bin/abcars-pricing.sh rates quota --no-build \
        || echo "курс или квота не обновились — используются данные из репозитория"
      pricing_refreshed=1
    else
      echo "git pull не прошёл из-за других локальных изменений; выкладка остановлена"
      exit 1
    fi
  fi
  after_rev=$(git rev-parse HEAD)
  if [ -n "${ABCARS_DEPLOY_REVISION:-}" ]; then test "$after_rev" = "$ABCARS_DEPLOY_REVISION"; fi
  # Install atomically: future calls must not run an older deployment policy.
  if ! cmp -s deploy/abcars-deploy.sh /usr/local/bin/abcars-deploy.sh; then
    bash -n deploy/abcars-deploy.sh
    install -m755 deploy/abcars-deploy.sh /usr/local/bin/abcars-deploy.sh.next
    mv /usr/local/bin/abcars-deploy.sh.next /usr/local/bin/abcars-deploy.sh
  fi
else
  echo "без git: собираем то, что лежит на сервере"
fi

# Зависимости ставим только когда их список изменился: npm ci стоит несколько
# секунд, а package-lock.json меняется редко. Отпечаток прошлой установки лежит
# рядом с node_modules.
lock_hash=$(sha256sum package-lock.json | cut -d" " -f1)
if [ ! -d node_modules ] || [ "$(cat node_modules/.abcars-lock-hash 2>/dev/null)" != "$lock_hash" ]; then
  run dependencies npm ci --no-audit --no-fund
  echo "$lock_hash" > node_modules/.abcars-lock-hash
else
  echo "зависимости не менялись: npm ci пропущен"
fi

set -a; source ./.env.local; set +a

# Classify the actual changes before launching expensive tasks.
plan_flags=$(node scripts/deploy-plan.mjs "$before_rev" "$after_rev" "$pricing_refreshed")
read -r reuse_catalog reuse_feed pricing_changed duplicates_changed migrations_changed bot_changed <<< "$plan_flags"

if [ "$migrations_changed" -eq 1 ]; then
  run migrations npm run db:migrate
else
  echo "схема базы не менялась: миграции пропущены"
fi
if [ "$duplicates_changed" -eq 1 ]; then
  run duplicates npm run dedupe:catalog -- --apply
else
  echo "правила дублей не менялись: проверку выполнит штатный таймер"
fi
if [ "$pricing_changed" -eq 1 ]; then
  run prices npm run db:estimates
else
  echo "расчёт цены не менялся: пересчёт каталога пропущен"
fi

run build env ABCARS_REUSE_CATALOG="$reuse_catalog" ABCARS_REUSE_FEED="$reuse_feed" \
  ABCARS_BUILD_DIR=dist.next ABCARS_BUILD_LOG="$log_dir/build.log" \
  ABCARS_BUILD_TIMINGS="$log_dir/build-timings.json" npm run build

# A missing snapshot would bring the full cold calculation back into HTTP requests.
# Keep the previous release running if database-backed preparation did not finish.
if [ ! -s dist.next/market-price-stats.json ] || [ ! -s dist.next/catalog-build-data.bin ]; then
  echo "сводка цен не подготовлена — предыдущая версия продолжает работать"
  exit 1
fi

printf '{"revision":"%s"}\n' "$after_rev" > dist.next/release.json

# Build beside the live directory, then exchange the two directories only after
# the new pages, images and text chunks are all ready.
stage=publish
publish_started=$SECONDS
rm -rf dist.prev
if [ -d dist ]; then mv dist dist.prev; fi
if ! mv dist.next dist; then
  [ -d dist.prev ] && mv dist.prev dist
  exit 1
fi
rollback_needed=1
run archive bash deploy/abcars-archive-assets.sh

systemctl restart abcars
# The command listener keeps imported modules in memory. Reload it so newly
# deployed Telegram commands become available; do not enable a stopped bot or
# start either catalog refresh. Its KillMode=process preserves detached workers.
if [ "$bot_changed" -eq 1 ] && systemctl is-active --quiet abcars-bot; then
  systemctl restart abcars-bot
fi
find /var/cache/nginx/abcars -type f -delete
# Only reinstall changed/missing unit files, with one daemon-reload for the batch.
units_changed=0
rates_timer_changed=0
for name in abcars-search-traffic abcars-feed abcars-catalog-dedupe abcars-rates abcars-price-snapshot; do
  for suffix in service timer; do
    file="$name.$suffix"
    if ! cmp -s "deploy/$file" "/etc/systemd/system/$file"; then
      install -m644 "deploy/$file" "/etc/systemd/system/$file"
      units_changed=1
      if [ "$file" = abcars-rates.timer ]; then rates_timer_changed=1; fi
    fi
  done
done
if [ "$units_changed" -eq 1 ]; then run units systemctl daemon-reload; fi
if [ "$rates_timer_changed" -eq 1 ] && systemctl is-active --quiet abcars-rates.timer; then
  run rates-timer systemctl restart abcars-rates.timer
fi
for name in abcars-search-traffic abcars-feed abcars-catalog-dedupe abcars-rates abcars-price-snapshot; do
  if ! systemctl is-enabled --quiet "$name.timer" || ! systemctl is-active --quiet "$name.timer"; then
    systemctl enable --now "$name.timer"
  fi
done
# Search statistics run on their own timer, never as a side effect of publishing.
# Nginx reads new HTML from disk; unchanged configuration needs no reload.
# Snippet changes still require their validated installation (see AGENTS.md).
printf '[deploy] publish complete %ss\n' "$((SECONDS-publish_started))"

# Check the origin directly; cached nginx responses cannot prove readiness.
run health curl --fail --silent --show-error --retry 8 --retry-connrefused --retry-delay 1 --retry-max-time 30 \
  --max-time 5 "http://127.0.0.1:${API_PORT:-8787}/api/health"
echo
rollback_needed=0

# Прогрев больше не задерживает завершение выкладки. Его отдельная служба сразу
# наполнит кэш в фоне; systemd сохранит результат и журнал, даже если SSH закрыт.
systemctl start --no-block abcars-warm-api.service \
  || echo "фоновый прогрев не запустился — сайт работает, первый заход будет медленным"

echo "выложено"
