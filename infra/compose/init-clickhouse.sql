CREATE DATABASE IF NOT EXISTS factoryops;

CREATE TABLE IF NOT EXISTS factoryops.telemetry_raw
(
  ingested_at DateTime64(3, 'UTC'),
  tenant_id String,
  site_id String,
  asset_id String,
  signal String,
  value Float64,
  unit String,
  quality LowCardinality(String),
  observed_at DateTime64(3, 'UTC')
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(observed_at)
ORDER BY (site_id, asset_id, signal, observed_at);

CREATE TABLE IF NOT EXISTS factoryops.feature_windows
(
  created_at DateTime64(3, 'UTC'),
  tenant_id String,
  site_id String,
  asset_id String,
  signal String,
  window_start DateTime64(3, 'UTC'),
  window_end DateTime64(3, 'UTC'),
  features String,
  baseline_version String,
  model_version String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (site_id, asset_id, signal, created_at);
