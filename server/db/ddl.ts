import type { DbDriver } from '../../shared/types/setup'

const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  display_name  TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_avatars (
  user_id      TEXT    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT    NOT NULL,
  data         BLOB    NOT NULL,
  version      TEXT    NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT    NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS plugins (
  id           TEXT    PRIMARY KEY,
  name         TEXT    NOT NULL,
  author_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT    NOT NULL,
  summary      TEXT    NOT NULL DEFAULT '',
  description  TEXT    NOT NULL DEFAULT '',
  category     TEXT    NOT NULL DEFAULT '',
  visibility   TEXT    NOT NULL DEFAULT 'listed',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plugins_author_name ON plugins(author_id, name);
CREATE INDEX IF NOT EXISTS idx_plugins_author ON plugins(author_id);
CREATE TABLE IF NOT EXISTS plugin_versions (
  id            TEXT    PRIMARY KEY,
  plugin_id     TEXT    NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  version       TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pending',
  artifact_path TEXT    NOT NULL,
  file_count    INTEGER NOT NULL DEFAULT 0,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  changelog     TEXT    NOT NULL DEFAULT '',
  submitted_at  INTEGER NOT NULL,
  reviewed_at   INTEGER,
  reviewer_id   TEXT    REFERENCES users(id) ON DELETE SET NULL,
  review_note   TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plugin_versions_plugin_version ON plugin_versions(plugin_id, version);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_plugin ON plugin_versions(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_status ON plugin_versions(status);
CREATE TABLE IF NOT EXISTS api_tokens (
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE TABLE IF NOT EXISTS oauth_codes (
  state       TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_codes(expires_at);
`

const POSTGRES_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  display_name  TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    BIGINT  NOT NULL
);
CREATE TABLE IF NOT EXISTS user_avatars (
  user_id      TEXT    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT    NOT NULL,
  data         BYTEA   NOT NULL,
  version      TEXT    NOT NULL,
  updated_at   BIGINT  NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT    NOT NULL UNIQUE,
  created_at   BIGINT  NOT NULL,
  expires_at   BIGINT  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS plugins (
  id           TEXT    PRIMARY KEY,
  name         TEXT    NOT NULL,
  author_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT    NOT NULL,
  summary      TEXT    NOT NULL DEFAULT '',
  description  TEXT    NOT NULL DEFAULT '',
  category     TEXT    NOT NULL DEFAULT '',
  visibility   TEXT    NOT NULL DEFAULT 'listed',
  created_at   BIGINT  NOT NULL,
  updated_at   BIGINT  NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plugins_author_name ON plugins(author_id, name);
CREATE INDEX IF NOT EXISTS idx_plugins_author ON plugins(author_id);
CREATE TABLE IF NOT EXISTS plugin_versions (
  id            TEXT    PRIMARY KEY,
  plugin_id     TEXT    NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  version       TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pending',
  artifact_path TEXT    NOT NULL,
  file_count    INTEGER NOT NULL DEFAULT 0,
  size_bytes    BIGINT  NOT NULL DEFAULT 0,
  changelog     TEXT    NOT NULL DEFAULT '',
  submitted_at  BIGINT  NOT NULL,
  reviewed_at   BIGINT,
  reviewer_id   TEXT    REFERENCES users(id) ON DELETE SET NULL,
  review_note   TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plugin_versions_plugin_version ON plugin_versions(plugin_id, version);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_plugin ON plugin_versions(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_status ON plugin_versions(status);
CREATE TABLE IF NOT EXISTS api_tokens (
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL DEFAULT '',
  created_at   BIGINT  NOT NULL,
  last_used_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE TABLE IF NOT EXISTS oauth_codes (
  state       TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  BIGINT  NOT NULL,
  expires_at  BIGINT  NOT NULL,
  consumed_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_codes(expires_at);
`

export function ddlFor(driver: DbDriver): string {
  return driver === 'sqlite' ? SQLITE_DDL : POSTGRES_DDL
}
