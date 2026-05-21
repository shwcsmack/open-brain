/**
 * Integration test for SQLite FTS5 search.
 *
 * Uses better-sqlite3 directly against a real in-memory SQLite database to
 * verify that the FTS5 virtual tables, BM25 ranking, and snippet extraction
 * work correctly — without mocking. This is the path exercised in production.
 */
import Database from 'better-sqlite3'

function setupDb() {
  const db = new Database(':memory:')

  // Minimal schema matching production
  db.exec(`
    CREATE TABLE "Note" (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '{}',
      slug TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE "Task" (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'TODO',
      deletedAt TEXT,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE note_fts USING fts5(
      id UNINDEXED,
      title,
      body,
      content='Note',
      content_rowid='rowid'
    );

    CREATE VIRTUAL TABLE task_fts USING fts5(
      id UNINDEXED,
      title,
      content='Task',
      content_rowid='rowid'
    );
  `)

  return db
}

function insertNote(db: ReturnType<typeof Database>, id: string, title: string, body: string) {
  db.prepare(`INSERT INTO "Note" (id, title, body, slug) VALUES (?, ?, ?, ?)`).run(id, title, body, id)
  db.prepare(`INSERT INTO note_fts(id, title, body) VALUES (?, ?, ?)`).run(id, title, body)
}

function insertTask(db: ReturnType<typeof Database>, id: string, title: string) {
  db.prepare(`INSERT INTO "Task" (id, title) VALUES (?, ?)`).run(id, title)
  db.prepare(`INSERT INTO task_fts(id, title) VALUES (?, ?)`).run(id, title)
}

describe('FTS5 integration', () => {
  let db: ReturnType<typeof Database>

  beforeEach(() => {
    db = setupDb()
  })

  afterEach(() => {
    db.close()
  })

  it('returns notes matching a query', () => {
    insertNote(db, 'n1', 'Mitochondria', 'The mitochondria is the powerhouse of the cell')
    insertNote(db, 'n2', 'Unrelated Note', 'Nothing relevant here')

    const rows = db.prepare(`
      SELECT n.id, n.title, 'note' as type
      FROM note_fts
      JOIN "Note" n ON n.id = note_fts.id
      WHERE note_fts MATCH ?
      ORDER BY rank
      LIMIT 20
    `).all('mitochondria*') as { id: string; title: string; type: string }[]

    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('n1')
    expect(rows[0].type).toBe('note')
  })

  it('returns results ranked by relevance (BM25)', () => {
    insertNote(db, 'n1', 'Biology basics', 'cells biology overview')
    insertNote(db, 'n2', 'Cell biology', 'biology biology biology — highly relevant')

    const rows = db.prepare(`
      SELECT n.id FROM note_fts
      JOIN "Note" n ON n.id = note_fts.id
      WHERE note_fts MATCH ?
      ORDER BY rank
      LIMIT 20
    `).all('biology*') as { id: string }[]

    expect(rows).toHaveLength(2)
    // n2 mentions "biology" three times — should rank higher (lower rank score = better)
    expect(rows[0].id).toBe('n2')
  })

  it('returns tasks matching a query', () => {
    insertNote(db, 'n1', 'Some note', 'unrelated')
    insertTask(db, 't1', 'Buy groceries')
    insertTask(db, 't2', 'Write report')

    const rows = db.prepare(`
      SELECT t.id, t.title, 'task' as type
      FROM task_fts
      JOIN "Task" t ON t.id = task_fts.id
      WHERE task_fts MATCH ? AND t.deletedAt IS NULL
      ORDER BY rank
      LIMIT 10
    `).all('groceries*') as { id: string; title: string; type: string }[]

    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('t1')
    expect(rows[0].type).toBe('task')
  })

  it('generates snippets with sentinel characters', () => {
    insertNote(db, 'n1', 'Test Note', 'The mitochondria is the powerhouse of the cell and generates ATP')

    const rows = db.prepare(`
      SELECT snippet(note_fts, 2, char(1), char(2), '...', 30) as snip
      FROM note_fts
      WHERE note_fts MATCH ?
    `).all('mitochondria*') as { snip: string }[]

    expect(rows).toHaveLength(1)
    // Snippet should contain the sentinel chars wrapping the matched term
    expect(rows[0].snip).toContain('\x01')
    expect(rows[0].snip).toContain('\x02')
    expect(rows[0].snip.toLowerCase()).toContain('mitochondria')
  })

  it('returns no results for non-matching query', () => {
    insertNote(db, 'n1', 'Biology note', 'cells and organisms')

    const rows = db.prepare(`
      SELECT n.id FROM note_fts
      JOIN "Note" n ON n.id = note_fts.id
      WHERE note_fts MATCH ?
      ORDER BY rank LIMIT 20
    `).all('quantum*') as { id: string }[]

    expect(rows).toHaveLength(0)
  })

  it('reflects deletions from the index', () => {
    insertNote(db, 'n1', 'Temporary Note', 'powerhouse content')

    // Delete from FTS index (mirroring deleteNoteFromFts)
    db.prepare(`DELETE FROM note_fts WHERE id = ?`).run('n1')

    const rows = db.prepare(`
      SELECT n.id FROM note_fts
      JOIN "Note" n ON n.id = note_fts.id
      WHERE note_fts MATCH ?
      ORDER BY rank LIMIT 20
    `).all('powerhouse*') as { id: string }[]

    expect(rows).toHaveLength(0)
  })
})
