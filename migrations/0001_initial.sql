CREATE TABLE IF NOT EXISTS repositories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL UNIQUE,
  description TEXT,
  html_url TEXT NOT NULL,
  stargazers_count INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  created_at TEXT,
  updated_at TEXT,
  pushed_at TEXT,
  starred_at TEXT,
  owner_login TEXT NOT NULL,
  owner_avatar_url TEXT,
  topics TEXT NOT NULL DEFAULT '[]',
  ai_summary TEXT,
  ai_tags TEXT NOT NULL DEFAULT '[]',
  ai_platforms TEXT NOT NULL DEFAULT '[]',
  analyzed_at TEXT,
  analysis_failed INTEGER NOT NULL DEFAULT 0,
  custom_description TEXT,
  custom_tags TEXT NOT NULL DEFAULT '[]',
  custom_category TEXT,
  category_locked INTEGER NOT NULL DEFAULT 0,
  last_edited TEXT,
  subscribed_to_releases INTEGER NOT NULL DEFAULT 0,
  vector_indexed_at TEXT,
  license TEXT,
  vector_indexed_license TEXT,
  sync_marker TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_repositories_stars ON repositories(stargazers_count DESC);
CREATE INDEX IF NOT EXISTS idx_repositories_category ON repositories(custom_category);
CREATE INDEX IF NOT EXISTS idx_repositories_sync_marker ON repositories(sync_marker);

CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY,
  tag_name TEXT NOT NULL,
  name TEXT,
  body TEXT,
  published_at TEXT,
  html_url TEXT,
  assets TEXT NOT NULL DEFAULT '[]',
  repo_id INTEGER NOT NULL,
  repo_full_name TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  prerelease INTEGER NOT NULL DEFAULT 0,
  draft INTEGER NOT NULL DEFAULT 0,
  is_read INTEGER NOT NULL DEFAULT 0,
  zipball_url TEXT,
  tarball_url TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_releases_published ON releases(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_releases_repo ON releases(repo_id);
CREATE INDEX IF NOT EXISTS idx_releases_unread ON releases(is_read);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT '📁',
  keywords TEXT NOT NULL DEFAULT '[]',
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_custom INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE IF NOT EXISTS asset_filters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  keywords TEXT NOT NULL DEFAULT '[]',
  platform TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE IF NOT EXISTS ai_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_type TEXT NOT NULL DEFAULT 'openai',
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  custom_prompt TEXT,
  use_custom_prompt INTEGER NOT NULL DEFAULT 0,
  concurrency INTEGER NOT NULL DEFAULT 1,
  reasoning_effort TEXT,
  mimo_plan TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS embedding_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_type TEXT NOT NULL DEFAULT 'openai',
  base_url TEXT NOT NULL DEFAULT '',
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  dimensions INTEGER NOT NULL DEFAULT 1536,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE IF NOT EXISTS vector_search_configs (
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

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS worker_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL,
  module TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_worker_logs_timestamp ON worker_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_worker_logs_level ON worker_logs(level, timestamp DESC);
