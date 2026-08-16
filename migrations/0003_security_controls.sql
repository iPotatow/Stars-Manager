-- Persistent login throttling shared by all Worker isolates.
CREATE TABLE IF NOT EXISTS login_rate_limits (
  client_key TEXT PRIMARY KEY,
  window_started INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX IF NOT EXISTS idx_login_rate_limits_window ON login_rate_limits(window_started);
