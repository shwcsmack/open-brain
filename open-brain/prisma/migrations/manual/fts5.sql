-- SQLite FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  content='Note',
  content_rowid='rowid'
);

CREATE VIRTUAL TABLE IF NOT EXISTS task_fts USING fts5(
  id UNINDEXED,
  title,
  content='Task',
  content_rowid='rowid'
);
