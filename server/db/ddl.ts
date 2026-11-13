import type { DbDriver } from '../../shared/types/setup'

const SQLITE_DDL = `
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
CREATE TABLE IF NOT EXISTS npm_plugin_icons (
  name         TEXT    PRIMARY KEY,
  version      TEXT    NOT NULL,
  content_hash TEXT    NOT NULL DEFAULT '',
  data         BLOB,
  updated_at   INTEGER NOT NULL DEFAULT 0
);
`

const POSTGRES_DDL = `
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
CREATE TABLE IF NOT EXISTS npm_plugin_icons (
  name         TEXT    PRIMARY KEY,
  version      TEXT    NOT NULL,
  content_hash TEXT    NOT NULL DEFAULT '',
  data         BYTEA,
  updated_at   BIGINT  NOT NULL DEFAULT 0
);
`

export function ddlFor(driver: DbDriver): string {
  return driver === 'sqlite' ? SQLITE_DDL : POSTGRES_DDL
}
