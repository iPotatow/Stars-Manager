CREATE TABLE vector_search_configs_cloudflare (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  embedding_config_id TEXT,
  index_mode TEXT NOT NULL DEFAULT 'readme',
  readme_max_chars INTEGER NOT NULL DEFAULT 6000,
  search_threshold REAL NOT NULL DEFAULT 0.35,
  search_top_k INTEGER NOT NULL DEFAULT 30,
  enable_hyde INTEGER NOT NULL DEFAULT 1,
  enable_reranking INTEGER NOT NULL DEFAULT 1,
  embedding_format_version INTEGER,
  status_json TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

INSERT INTO vector_search_configs_cloudflare (
  id, enabled, embedding_config_id, index_mode, readme_max_chars,
  search_threshold, search_top_k, enable_hyde, enable_reranking,
  embedding_format_version, status_json, last_sync_at, created_at, updated_at
)
SELECT
  id, enabled, embedding_config_id, index_mode, readme_max_chars,
  search_threshold, search_top_k, enable_hyde, enable_reranking,
  embedding_format_version, status_json, last_sync_at, created_at, updated_at
FROM vector_search_configs;

DROP TABLE vector_search_configs;
ALTER TABLE vector_search_configs_cloudflare RENAME TO vector_search_configs;

DELETE FROM settings WHERE key IN ('proxy_config', 'rpc_download_config');
