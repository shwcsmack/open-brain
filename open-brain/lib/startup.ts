import Database from 'better-sqlite3'
import path from 'path'

export function validateEnv() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    console.error('Fatal: SESSION_SECRET must be set and at least 32 characters long.')
    process.exit(1)
  }
}

export async function applyFts5Tables() {
  // Only for SQLite
  const dbUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db'
  if (!dbUrl.startsWith('file:') && dbUrl !== '') {
    return // Postgres - skip
  }
  const dbPath = dbUrl.replace('file:', '')
  const absolutePath = path.resolve(process.cwd(), dbPath)

  try {
    const db = new Database(absolutePath)
    db.exec(`
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
    `)
    db.close()
  } catch (e) {
    // FTS5 not available - silently continue, LIKE fallback will be used
    console.warn('FTS5 tables could not be created (FTS5 may not be available):', e)
  }
}
