import { prisma } from './prisma'

export async function searchNotes(query: string) {
  const isSQLite = !process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:')

  if (isSQLite) {
    try {
      const notes = await prisma.$queryRawUnsafe<any[]>(`
        SELECT n.id, n.title, n.slug, n.body, n.updatedAt,
               snippet(note_fts, 1, '<b>', '</b>', '...', 30) as snippet,
               'note' as type
        FROM note_fts
        JOIN "Note" n ON n.id = note_fts.id
        WHERE note_fts MATCH ?
        ORDER BY rank
        LIMIT 20
      `, query + '*')

      const tasks = await prisma.$queryRawUnsafe<any[]>(`
        SELECT t.id, t.title, NULL as slug, t.updatedAt,
               snippet(task_fts, 1, '<b>', '</b>', '...', 30) as snippet,
               'task' as type
        FROM task_fts
        JOIN "Task" t ON t.id = task_fts.id
        WHERE task_fts MATCH ? AND t.deletedAt IS NULL
        ORDER BY rank
        LIMIT 10
      `, query + '*')

      return [...notes, ...tasks].map(r => ({
        ...r,
        snippet: r.snippet ? r.snippet.slice(0, 160) : r.snippet,
      }))
    } catch (e) {
      // FTS tables might not exist yet, fall back to LIKE search
      const notes = await prisma.note.findMany({
        where: { OR: [{ title: { contains: query } }, { body: { contains: query } }] },
        select: { id: true, title: true, slug: true, updatedAt: true, body: true },
        take: 20,
      })
      return notes.map(n => {
        const body = n.body ?? ''
        const matchIdx = body.toLowerCase().indexOf(query.toLowerCase())
        const start = Math.max(0, (matchIdx >= 0 ? matchIdx : 0) - 20)
        const raw = body.slice(start, start + 160).replace(
          new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          (m: string) => `<b>${m}</b>`
        )
        const { body: _body, ...rest } = n
        return { ...rest, type: 'note' as const, snippet: raw.slice(0, 160) }
      })
    }
  }

  // Postgres tsvector fallback
  const results = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, title, slug, 'note' as type, updatedAt,
      ts_headline('english', body, plainto_tsquery('english', $1), 'StartSel=<b>, StopSel=</b>, MaxFragments=1, MaxWords=20, MinWords=5') as snippet
    FROM "Note"
    WHERE to_tsvector('english', title || ' ' || body) @@ plainto_tsquery('english', $1)
    ORDER BY ts_rank(to_tsvector('english', title || ' ' || body), plainto_tsquery('english', $1)) DESC
    LIMIT 20
  `, query)
  return results.map(r => ({
    ...r,
    snippet: r.snippet ? r.snippet.slice(0, 160) : r.snippet,
  }))
}

export async function syncNoteToFts(noteId: string, title: string, body: string) {
  const isSQLite = !process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:')
  if (!isSQLite) return

  try {
    await prisma.$executeRawUnsafe(`DELETE FROM note_fts WHERE id = ?`, noteId)
    await prisma.$executeRawUnsafe(
      `INSERT INTO note_fts(id, title, body) VALUES (?, ?, ?)`,
      noteId, title, body
    )
  } catch { /* FTS tables might not exist */ }
}

export async function deleteNoteFromFts(noteId: string) {
  const isSQLite = !process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:')
  if (!isSQLite) return

  try {
    await prisma.$executeRawUnsafe(`DELETE FROM note_fts WHERE id = ?`, noteId)
  } catch { /* ignore */ }
}

export async function syncTaskToFts(taskId: string, title: string) {
  const isSQLite = !process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:')
  if (!isSQLite) return

  try {
    await prisma.$executeRawUnsafe(`DELETE FROM task_fts WHERE id = ?`, taskId)
    await prisma.$executeRawUnsafe(
      `INSERT INTO task_fts(id, title) VALUES (?, ?)`,
      taskId, title
    )
  } catch { /* FTS tables might not exist */ }
}

export async function deleteTaskFromFts(taskId: string) {
  const isSQLite = !process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:')
  if (!isSQLite) return

  try {
    await prisma.$executeRawUnsafe(`DELETE FROM task_fts WHERE id = ?`, taskId)
  } catch { /* ignore */ }
}
