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

# Прошлая сборка остаётся рядом: если новая окажется плохой, возвращаем её на место
# тут же, не дожидаясь, пока кто-то заметит поломанный сайт.
rm -rf dist.prev
[ -d dist ] && cp -a dist dist.prev
if npm run build >/tmp/abcars-publish-build.log 2>&1; then
  systemctl restart abcars
  find /var/cache/nginx/abcars -type f -delete
  npm run warm:api || true
  systemctl reload nginx
  # Поисковикам про новые статьи говорим сразу, а не ждём завтрашней рассылки:
  # у молодого сайта разница между «сегодня» и «через неделю» заметная.
  npm run indexnow || echo "поисковикам сообщить не удалось — уйдёт со следующей рассылкой"
  echo "журнал обновлён"
else
  echo "СБОРКА НЕ УДАЛАСЬ — возвращаю прежнюю, подробности в /tmp/abcars-publish-build.log"
  tail -5 /tmp/abcars-publish-build.log
  if [ -d dist.prev ]; then
    rm -rf dist
    cp -a dist.prev dist
    systemctl restart abcars
    systemctl reload nginx
    echo "прежняя сборка возвращена, сайт работает как вчера"
  fi
  exit 1
fi
