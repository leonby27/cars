#!/bin/bash
# Утренняя выкладка материалов журнала.
#
# Публикация статьи — это не правка кода: у каждого материала стоит день выпуска,
# и он появляется на сайте сам, когда этот день настал. Но страницы журнала лежат
# готовыми файлами, поэтому сайт нужно пересобрать — этим и занимается задание.
#
# Собираем не каждое утро, а только когда есть что выкладывать: проверка сравнивает
# список материалов последней сборки с тем, что уже должно быть на сайте. Так же
# догоняется пропущенный день — если утром сборка не прошла, назавтра выйдут оба.
#
# Ставится на сервер так:
#   install -m644 /srv/abcars/deploy/abcars-publish.* /etc/systemd/system/
#   systemctl daemon-reload && systemctl enable --now abcars-publish.timer
cd /srv/abcars || exit 1
set -a; source ./.env.local; set +a

node scripts/blog-due.mjs
case $? in
  0) ;;
  10) exit 0 ;;
  *) echo "проверка журнала сломалась — на всякий случай ничего не пересобираю"; exit 1 ;;
esac

# Build beside the live site: its pictures and already-opened text chunks stay
# available for the whole build, even when the new publication takes minutes.
if ABCARS_BUILD_DIR=dist.next npm run build >/tmp/abcars-publish-build.log 2>&1; then
  rm -rf dist.prev
  if [ -d dist ]; then mv dist dist.prev; fi
  if ! mv dist.next dist; then
    [ -d dist.prev ] && mv dist.prev dist
    exit 1
  fi
  bash deploy/abcars-archive-assets.sh
  systemctl restart abcars
  find /var/cache/nginx/abcars -type f -delete
  npm run warm:api || true
  systemctl reload nginx
  # Поисковикам про новые статьи говорим сразу, а не ждём завтрашней рассылки:
  # у молодого сайта разница между «сегодня» и «через неделю» заметная.
  npm run indexnow || echo "поисковикам сообщить не удалось — уйдёт со следующей рассылкой"
  echo "журнал обновлён"
else
  echo "СБОРКА НЕ УДАЛАСЬ — прежняя версия продолжает работать, подробности в /tmp/abcars-publish-build.log"
  tail -5 /tmp/abcars-publish-build.log
  exit 1
fi
