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

# Новые правки в базе применяем до перезапуска сайта: свежий код может ожидать
# столбца, которого в базе ещё нет. Уже применённые правки пропускаются сами.
npm run db:migrate

# Сохранённые цены нужны для сортировки и фильтра. Полный проход по десяткам тысяч
# объявлений нужен только после изменения формулы, её справочников или свежих
# курсов/квоты. Для обычной правки страницы этот проход ничего не меняет.
pricing_changed=0
if [ -z "$before_rev" ] || [ -z "$after_rev" ]; then
  pricing_changed=1
elif [ "$before_rev" != "$after_rev" ] && git diff --name-only "$before_rev" "$after_rev" -- \
  src/pricing.js src/china-logistics.js src/engine-spec.js src/ev-quota.js \
  config/import-policy.mjs config/model-names-by.mjs scripts/lib/che168-parser.mjs \
  scripts/backfill-estimates.mjs | grep -q .; then
  pricing_changed=1
fi

if [ "$pricing_refreshed" -eq 1 ] || [ "$pricing_changed" -eq 1 ]; then
  npm run db:estimates \
    || echo "пересчёт цен не прошёл: сортировка по цене может отставать от карточек"
else
  echo "формула цены не менялась: полный пересчёт каталога пропущен"
fi

if ABCARS_BUILD_DIR=dist.next npm run build >/tmp/abcars-deploy-build.log 2>&1; then
  echo "сборка готова"
else
  echo "сборка не удалась — предыдущая версия продолжает работать"
  tail -20 /tmp/abcars-deploy-build.log
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
find /var/cache/nginx/abcars -type f -delete
systemctl reload nginx

# Бот-приёмщик команд с 25.09.2026 ещё и подтверждает номера из заявок (см.
# scripts/telegram-commands.mjs), поэтому новый код нужен и ему. Раньше бот
# перезапускали руками — и правки до него не доходили.
systemctl restart abcars-bot 2>/dev/null || echo "бот не перезапущен (службы abcars-bot нет?) — сайт работает"

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

# Прогрев больше не задерживает завершение выкладки. Его отдельная служба сразу
# наполнит кэш в фоне; systemd сохранит результат и журнал, даже если SSH закрыт.
systemctl start --no-block abcars-warm-api.service \
  || echo "фоновый прогрев не запустился — сайт работает, первый заход будет медленным"

echo "выложено"
