import Database from 'better-sqlite3'
import { DB_PATH } from './config.js'

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      category_id TEXT,
      status      TEXT    NOT NULL DEFAULT 'queued',   -- queued | running | paused | done | failed
      stage       TEXT,                                -- nfo | par2 | posting | indexing
      progress    REAL    NOT NULL DEFAULT 0,          -- 0..1 da etapa atual
      position    INTEGER NOT NULL DEFAULT 0,          -- ordem na fila
      options     TEXT,                                -- JSON: { redundancy, volumes, subdirs, makeNfo, index }
      error       TEXT,
      nzb_path    TEXT,
      nfo_path    TEXT,
      result      TEXT,                                -- JSON: resposta do Curupira etc
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      started_at  INTEGER,
      finished_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status   ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_position ON jobs(position);
  `)

  // Migrações incrementais (CREATE TABLE IF NOT EXISTS não altera tabela existente).
  const cols = db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name)
  if (!cols.includes('stages')) {
    // JSON: [{ key, label, status, startedAt, finishedAt, error?, subs? }] por etapa do pipeline
    db.exec('ALTER TABLE jobs ADD COLUMN stages TEXT')
  }
}
