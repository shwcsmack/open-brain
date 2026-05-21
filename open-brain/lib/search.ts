import { prisma } from './prisma'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function tiptapToPlainText(body: string): string {
  try {
    const doc = JSON.parse(body)
    const texts: string[] = []
    function walk(node: any) {
      if (node.type === 'text' && typeof node.text === 'string') {
        texts.push(node.text)
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          walk(child)
        }
      }
    }
    walk(doc)
    return texts.join(' ')
  } catch {
    return ''
  }
}

function processSnippet(raw: string): string {
  const escaped = escapeHtml(raw)
  return escaped.replace(/\x01/g, '<b>').replace(/\x02/g, '</b>').slice(0, 160)
}

export async function searchNotes(query: string) {
  try {
    const notes = await prisma.$queryRawUnsafe<any[]>(`
      SELECT n.id, n.title, n.slug, n.body, n.updatedAt,
             snippet(note_fts, 2, char(1), char(2), '...', 30) as snippet,
             'note' as type
      FROM note_fts
      JOIN "Note" n ON n.id = note_fts.id
      WHERE note_fts MATCH ?
      ORDER BY rank
      LIMIT 20
    `, query + '*')

    const tasks = await prisma.$queryRawUnsafe<any[]>(`
      SELECT t.id, t.title, NULL as slug, t.updatedAt,
             snippet(task_fts, 1, char(1), char(2), '...', 30) as snippet,
             'task' as type
      FROM task_fts
      JOIN "Task" t ON t.id = task_fts.id
      WHERE task_fts MATCH ? AND t.deletedAt IS NULL
      ORDER BY rank
      LIMIT 10
    `, query + '*')

    return [...notes, ...tasks].map(r => ({
      ...r,
      snippet: r.snippet ? processSnippet(r.snippet as string) : r.snippet,
    }))
  } catch (e) {
    // FTS tables might not exist yet, fall back to LIKE search
    const notes = await prisma.note.findMany({
      where: { OR: [{ title: { contains: query } }, { body: { contains: query } }] },
      select: { id: true, title: true, slug: true, updatedAt: true, body: true },
      take: 20,
    })
    return notes.map(n => {
      const body = tiptapToPlainText(n.body ?? '')
      const matchIdx = body.toLowerCase().indexOf(query.toLowerCase())
      const start = Math.max(0, (matchIdx >= 0 ? matchIdx : 0) - 20)
      const excerpt = body.slice(start, start + 160)
      const escaped = escapeHtml(excerpt)
      const snippet = escaped.replace(
        new RegExp(escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        (m: string) => `<b>${m}</b>`
      ).slice(0, 160)
      const { body: _body, ...rest } = n
      return { ...rest, type: 'note' as const, snippet }
    })
  }
}

export async function syncNoteToFts(noteId: string, title: string, body: string) {
  try {
    const plainBody = tiptapToPlainText(body)
    await prisma.$executeRawUnsafe(`DELETE FROM note_fts WHERE id = ?`, noteId)
    await prisma.$executeRawUnsafe(
      `INSERT INTO note_fts(id, title, body) VALUES (?, ?, ?)`,
      noteId, title, plainBody
    )
  } catch { /* FTS tables might not exist */ }
}

export async function deleteNoteFromFts(noteId: string) {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM note_fts WHERE id = ?`, noteId)
  } catch { /* ignore */ }
}

export async function syncTaskToFts(taskId: string, title: string) {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM task_fts WHERE id = ?`, taskId)
    await prisma.$executeRawUnsafe(
      `INSERT INTO task_fts(id, title) VALUES (?, ?)`,
      taskId, title
    )
  } catch { /* FTS tables might not exist */ }
}

export async function deleteTaskFromFts(taskId: string) {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM task_fts WHERE id = ?`, taskId)
  } catch { /* ignore */ }
}
