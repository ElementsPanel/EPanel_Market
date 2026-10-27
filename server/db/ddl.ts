import type { DbDriver } from '../../shared/types/setup'

const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  previous_email TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'registration',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_expires ON email_verification_tokens(expires_at);
CREATE TABLE IF NOT EXISTS auth_captcha_challenges (
  request_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  settings_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_auth_captcha_expires ON auth_captcha_challenges(expires_at);
CREATE TABLE IF NOT EXISTS npm_plugins (
  id             TEXT    PRIMARY KEY,
  name           TEXT    NOT NULL UNIQUE,
  display_name   TEXT    NOT NULL,
  summary        TEXT    NOT NULL DEFAULT '',
  description    TEXT    NOT NULL DEFAULT '',
  category       TEXT    NOT NULL DEFAULT '',
  keywords       TEXT    NOT NULL DEFAULT '[]',
  author_name    TEXT    NOT NULL DEFAULT '',
  repository     TEXT    NOT NULL DEFAULT '',
  homepage       TEXT    NOT NULL DEFAULT '',
  license        TEXT    NOT NULL DEFAULT '',
  latest_version TEXT    NOT NULL,
  versions       TEXT    NOT NULL DEFAULT '[]',
  readme         TEXT    NOT NULL DEFAULT '',
  sides          TEXT    NOT NULL DEFAULT '[]',
  published_at   INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL DEFAULT 0,
  synced_at      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_npm_plugins_updated ON npm_plugins(updated_at);
`

const POSTGRES_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
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
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  previous_email TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'registration',
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_expires ON email_verification_tokens(expires_at);
CREATE TABLE IF NOT EXISTS auth_captcha_challenges (
  request_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  settings_hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_auth_captcha_expires ON auth_captcha_challenges(expires_at);
CREATE TABLE IF NOT EXISTS npm_plugins (
  id             TEXT    PRIMARY KEY,
  name           TEXT    NOT NULL UNIQUE,
  display_name   TEXT    NOT NULL,
  summary        TEXT    NOT NULL DEFAULT '',
  description    TEXT    NOT NULL DEFAULT '',
  category       TEXT    NOT NULL DEFAULT '',
  keywords       TEXT    NOT NULL DEFAULT '[]',
  author_name    TEXT    NOT NULL DEFAULT '',
  repository     TEXT    NOT NULL DEFAULT '',
  homepage       TEXT    NOT NULL DEFAULT '',
  license        TEXT    NOT NULL DEFAULT '',
  latest_version TEXT    NOT NULL,
  versions       TEXT    NOT NULL DEFAULT '[]',
  readme         TEXT    NOT NULL DEFAULT '',
  sides          TEXT    NOT NULL DEFAULT '[]',
  published_at   BIGINT  NOT NULL DEFAULT 0,
  updated_at     BIGINT  NOT NULL DEFAULT 0,
  synced_at      BIGINT  NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_npm_plugins_updated ON npm_plugins(updated_at);
`

export function ddlFor(driver: DbDriver): string {
  return driver === 'sqlite' ? SQLITE_DDL : POSTGRES_DDL
}
