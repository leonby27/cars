#!/bin/bash
# Выкладка новой версии сайта: забрать код, собрать, перезапустить.
# Прошлая сборка сохраняется рядом — если новая окажется плохой, откат мгновенный.
set -euo pipefail
cd /srv/abcars

before_rev=""
after_rev=""
pricing_refreshed=0

if [ -d .git ]; then
  before_rev=$(git rev-parse HEAD)

  # Ночные задачи держат свежий курс и остаток квоты прямо в этих двух файлах.
  # Обычный pull умеет сохранить такие локальные правки, пока новый коммит их не
  # затрагивает. Это быстрый путь для подавляющего большинства выкладок интерфейса.
  if ! git pull --ff-only; then
    # Если новый коммит тоже меняет расчёт или квоту, Git не может совместить его
    # с ночными цифрами. Только в этом редком случае забираем версию из репозитория
    # и повторно получаем актуальные данные из источников.
    if git diff --quiet -- . ':(exclude)src/pricing.js' ':(exclude)src/ev-quota.js' \
      && git diff --cached --quiet -- . ':(exclude)src/pricing.js' ':(exclude)src/ev-quota.js'; then
      git checkout -- src/pricing.js src/ev-quota.js 2>/dev/null || true
      git pull --ff-only
      /usr/local/bin/abcars-pricing.sh rates quota --no-build \
        || echo "курс или квота не обновились — используются данные из репозитория"
      pricing_refreshed=1
    else
      echo "git pull не прошёл из-за других локальных изменений; выкладка остановлена"
      exit 1
    fi
  fi
  after_rev=$(git rev-parse HEAD)
else
  echo "без git: собираем то, что лежит на сервере"
fi

# Зависимости ставим только когда их список изменился: npm ci стоит несколько
# секунд, а package-lock.json меняется редко. Отпечаток прошлой установки лежит
# рядом с node_modules.
lock_hash=$(sha256sum package-lock.json | cut -d" " -f1)
if [ ! -d node_modules ] || [ "$(cat node_modules/.abcars-lock-hash 2>/dev/null)" != "$lock_hash" ]; then
  npm ci --no-audit --no-fund
  echo "$lock_hash" > node_modules/.abcars-lock-hash
else
  echo "зависимости не менялись: npm ci пропущен"
fi

set -a; source ./.env.local; set +a

# Classify the actual changes before launching expensive tasks.
plan_flags=$(node scripts/deploy-plan.mjs "$before_rev" "$after_rev" "$pricing_refreshed")
read -r reuse_catalog reuse_feed pricing_changed duplicates_changed migrations_changed <<< "$plan_flags"

if [ "$migrations_changed" -eq 1 ]; then
  npm run db:migrate
else
  echo "схема базы не менялась: миграции пропущены"
fi
if [ "$duplicates_changed" -eq 1 ]; then
  npm run dedupe:catalog -- --apply
else
  echo "правила дублей не менялись: проверку выполнит штатный таймер"
fi
if [ "$pricing_changed" -eq 1 ]; then
  npm run db:estimates
else
  echo "расчёт цены не менялся: пересчёт каталога пропущен"
fi

if ABCARS_REUSE_CATALOG="$reuse_catalog" ABCARS_REUSE_FEED="$reuse_feed" ABCARS_BUILD_DIR=dist.next npm run build >/tmp/abcars-deploy-build.log 2>&1; then
  echo "сборка готова"
else
  echo "сборка не удалась — предыдущая версия продолжает работать"
  tail -20 /tmp/abcars-deploy-build.log
  exit 1
fi

# A missing snapshot would bring the full cold calculation back into HTTP requests.
# Keep the previous release running if database-backed preparation did not finish.
if [ ! -s dist.next/market-price-stats.json ] || [ ! -s dist.next/catalog-build-data.bin ]; then
  echo "сводка цен не подготовлена — предыдущая версия продолжает работать"
  exit 1
fi

# Build beside the live directory, then exchange the two directories only after
# the new pages, images and text chunks are all ready.
rm -rf dist.prev
if [ -d dist ]; then mv dist dist.prev; fi
if ! mv dist.next dist; then
  [ -d dist.prev ] && mv dist.prev dist
  exit 1
fi
bash deploy/abcars-archive-assets.sh

systemctl restart abcars
# The command listener keeps imported modules in memory. Reload it so newly
# deployed Telegram commands become available; do not enable a stopped bot or
# start either catalog refresh. Its KillMode=process preserves detached workers.
if systemctl is-active --quiet abcars-bot; then
  systemctl restart abcars-bot
fi
find /var/cache/nginx/abcars -type f -delete
systemctl reload nginx

# Поисковые позиции берутся не из живой выдачи, а из Search Console и Яндекс
# Вебмастера. Таймер перечитывает опубликованные ими сутки каждые шесть часов.
# Устанавливаем его при каждой выкладке: так новый сервер или восстановленная
# машина не останутся со старым архивом из-за забытого ручного шага.
if install -m644 deploy/abcars-search-traffic.service deploy/abcars-search-traffic.timer /etc/systemd/system/ \
  && systemctl daemon-reload \
  && systemctl enable --now abcars-search-traffic.timer; then
  systemctl start --no-block abcars-search-traffic.service \
    || echo "поисковые отчёты обновятся по следующему запуску таймера"
else
  echo "таймер поисковых отчётов не установился — сайт работает, но позиции могут устареть"
fi

# Фид каталога для Яндекса (/feeds/yandex-cars.xml) собирает сама сборка, а свежим
# его держит утренний таймер: цены и проданные машины меняются каждую ночь. Ставим
# таймер при каждой выкладке — так же, как таймер поисковых отчётов выше.
if install -m644 deploy/abcars-feed.service deploy/abcars-feed.timer /etc/systemd/system/ \
  && systemctl daemon-reload \
  && systemctl enable --now abcars-feed.timer; then
  echo "таймер фида для Яндекса установлен"
else
  echo "таймер фида не установился — фид из сборки есть, но обновляться каждое утро не будет"
fi

# Импорты и ночная сверка меняют каталог независимо от выкладок, поэтому лёгкая
# сверка дублей повторяется каждый час.
if install -m644 deploy/abcars-catalog-dedupe.service deploy/abcars-catalog-dedupe.timer /etc/systemd/system/ \
  && systemctl daemon-reload \
  && systemctl enable --now abcars-catalog-dedupe.timer; then
  echo "таймер межисточниковых дублей установлен"
else
  echo "таймер дублей не установился — текущая сверка применена, но новые импорты потребуют ручного запуска"
fi

# Прогрев больше не задерживает завершение выкладки. Его отдельная служба сразу
# наполнит кэш в фоне; systemd сохранит результат и журнал, даже если SSH закрыт.
systemctl start --no-block abcars-warm-api.service \
  || echo "фоновый прогрев не запустился — сайт работает, первый заход будет медленным"

echo "выложено"
