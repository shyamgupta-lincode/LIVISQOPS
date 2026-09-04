# Feature definitions

Stream-worker feature windows are computed by `packages/domain` (`compute_features`) and persisted on anomaly records (`features` JSON) plus ClickHouse `factoryops.feature_windows` when the archive path is enabled.
