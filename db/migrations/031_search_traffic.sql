-- Daily search reports are an independent archive; resetting visitor events must not erase it.
CREATE TABLE IF NOT EXISTS search_traffic_daily (
  source TEXT NOT NULL,
  property TEXT NOT NULL,
  day TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (source, property, day)
);
CREATE TABLE IF NOT EXISTS search_traffic_sync (
  source TEXT NOT NULL,
  property TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (source, property)
);
