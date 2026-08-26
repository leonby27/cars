-- Адреса облачных хостингов: Amazon, Google, Alibaba, DigitalOcean, Scaleway и прочие.
-- Роботы, которые притворяются обычным браузером и даже изображают поведение живого
-- человека, приезжают именно оттуда — 26.08.2026 такие «посетители» составили в
-- разделе аналитики большинство. Живой человек с адреса дата-центра почти не заходит,
-- поэтому события с этих адресов не записываем вовсе.
--
-- Списки диапазонов провайдеры публикуют сами; их скачивает и переписывает эту
-- таблицу `npm run ranges` (scripts/update-datacenter-ranges.mjs), раз в неделю по
-- расписанию. Таблица живёт в базе, а не в файле: выкладка сайта её не откатывает.
CREATE TABLE IF NOT EXISTS datacenter_ranges (
  network CIDR PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Проверка «попадает ли адрес в диапазон» без индекса перебирала бы десятки тысяч
-- строк на каждое событие.
CREATE INDEX IF NOT EXISTS datacenter_ranges_network_idx
  ON datacenter_ranges USING gist (network inet_ops);
