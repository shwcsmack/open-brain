import { prisma as defaultPrisma } from '@/lib/prisma'
import {
  extractWikilinkSlugs,
  extractTasks,
  extractClozeItems,
} from '@/lib/markdownExtract'
import { resolveTargetNoteIds } from '@/lib/wikilinkResolve'
import { syncTaskToFts, deleteTaskFromFts } from '@/lib/search'

type Prisma = typeof defaultPrisma

export { resolveTargetNoteIds }

/**
 * Replace the `NoteLink` rows for `sourceNoteId` so they exactly match the
 * wikilinks in `body`. Mirrors `noteLink.sync` (diff + transactional create /
 * delete) — unresolved slugs do not create links.
 */
export async function syncNoteLinksFromBody(
  sourceNoteId: string,
  body: string,
  prisma: Prisma = defaultPrisma,
): Promise<void> {
  const slugs = extractWikilinkSlugs(body)
  let targetNoteIds: string[] = []
  if (slugs.length > 0) {
    const uniqueSlugs = [...new Set(slugs)]
    const resolved = await prisma.note.findMany({
      where: { slug: { in: uniqueSlugs } },
      select: { id: true, slug: true },
    })
    const slugToId = new Map(resolved.map((n) => [n.slug, n.id]))
    targetNoteIds = resolveTargetNoteIds(slugs, slugToId)
  }

  const existing = await prisma.noteLink.findMany({ where: { sourceNoteId } })
  const existingIds = new Set(existing.map((l) => l.targetNoteId))
  const newIds = new Set(targetNoteIds)
  const toDelete = existing
    .filter((l) => !newIds.has(l.targetNoteId))
    .map((l) => l.id)
  const toCreate = targetNoteIds.filter((id) => !existingIds.has(id))

  if (toDelete.length === 0 && toCreate.length === 0) return

  await prisma.$transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx.noteLink.deleteMany({ where: { id: { in: toDelete } } })
    }
    if (toCreate.length > 0) {
      await tx.noteLink.createMany({
        data: toCreate.map((targetNoteId) => ({ sourceNoteId, targetNoteId })),
      })
    }
  })
}

/**
 * Replace the live `Task` rows for `noteId` so they exactly match the GFM
 * checkboxes in `body`. Mirrors `task.syncFromNote` but is called
 * unconditionally — an empty `tasks` list soft-deletes every task whose title
 * no longer appears in the body, so removing the last checkbox cleans up.
 */
export async function syncTasksFromBody(
  noteId: string,
  body: string,
  prisma: Prisma = defaultPrisma,
): Promise<void> {
  const tasks = extractTasks(body)

  const existing = await prisma.task.findMany({
    where: { noteId, deletedAt: null },
  })
  const existingTitles = new Set(existing.map((t) => t.title))
  const newTitles = new Set(tasks.map((t) => t.title))

  const toDelete = existing.filter((t) => !newTitles.has(t.title))
  const toUpdate = tasks.filter((t) => existingTitles.has(t.title))
  const toCreate = tasks.filter((t) => !existingTitles.has(t.title))

  if (toDelete.length === 0 && toUpdate.length === 0 && toCreate.length === 0) {
    return
  }

  await prisma.$transaction(async (tx) => {
    for (const t of toDelete) {
      await tx.task.update({
        where: { id: t.id },
        data: { deletedAt: new Date() },
      })
    }
    for (const t of toUpdate) {
      const existingTask = existing.find((e) => e.title === t.title)!
      await tx.task.update({
        where: { id: existingTask.id },
        data: { status: t.done ? 'DONE' : 'TODO' },
      })
    }
    if (toCreate.length > 0) {
      await tx.task.createMany({
        data: toCreate.map((t) => ({
          title: t.title,
          status: t.done ? ('DONE' as const) : ('TODO' as const),
          noteId,
        })),
      })
    }
  })

  // FTS sync runs after the transaction so a failed write never leaves the
  // index pointing at a row that doesn't exist.
  for (const t of toDelete) {
    await deleteTaskFromFts(t.id)
  }
  for (const t of toUpdate) {
    const existingTask = existing.find((e) => e.title === t.title)!
    await syncTaskToFts(existingTask.id, existingTask.title)
  }
  if (toCreate.length > 0) {
    const created = await prisma.task.findMany({
      where: {
        noteId,
        deletedAt: null,
        title: { in: toCreate.map((t) => t.title) },
      },
      select: { id: true, title: true },
    })
    for (const task of created) {
      await syncTaskToFts(task.id, task.title)
    }
  }
}

/**
 * Replace the cloze flashcards for `noteId` so they exactly match the
 * `{{cN::answer}}` items in `body`. Mirrors `flashcard.syncCloze`: an empty
 * extraction soft-deletes every still-live cloze card on the note.
 */
export async function syncClozeFromBody(
  noteId: string,
  body: string,
  prisma: Prisma = defaultPrisma,
): Promise<void> {
  const items = extractClozeItems(body)

  const existing = await prisma.flashcard.findMany({
    where: { noteId, type: 'CLOZE' },
  })
  const existingMap = new Map(
    existing
      .filter((c) => c.clozeIndex !== null)
      .map((c) => [c.clozeIndex as number, c]),
  )
  const incomingIndices = new Set(items.map((i) => i.clozeIndex))

  await prisma.$transaction(async (tx) => {
    const ops: Promise<unknown>[] = []

    for (const item of items) {
      const ex = existingMap.get(item.clozeIndex)
      if (!ex) {
        ops.push(
          tx.flashcard.create({
            data: {
              type: 'CLOZE',
              front: item.front,
              back: item.answer ?? null,
              clozeIndex: item.clozeIndex,
              noteId,
              stability: 0,
              difficulty: 0,
              due: new Date(),
              reps: 0,
              lapses: 0,
              state: 'NEW',
              lastReview: null,
            },
          }),
        )
      } else if (ex.deletedAt !== null) {
        ops.push(
          tx.flashcard.update({
            where: { id: ex.id },
            data: {
              deletedAt: null,
              front: item.front,
              back: item.answer ?? ex.back,
            },
          }),
        )
      } else if (
        ex.front !== item.front ||
        (item.answer !== undefined && ex.back !== item.answer)
      ) {
        ops.push(
          tx.flashcard.update({
            where: { id: ex.id },
            data: {
              front: item.front,
              ...(item.answer !== undefined ? { back: item.answer } : {}),
            },
          }),
        )
      }
    }

    for (const [idx, card] of existingMap) {
      if (!incomingIndices.has(idx) && card.deletedAt === null) {
        ops.push(
          tx.flashcard.update({
            where: { id: card.id },
            data: { deletedAt: new Date() },
          }),
        )
      }
    }

    await Promise.all(ops)
  })
}

/**
 * Run all three derived-state syncs for a note's markdown body. Called by
 * `note.update` whenever a new body is persisted — keeps wikilinks, tasks, and
 * cloze cards in lockstep with the source of truth (the markdown text) without
 * relying on the client to fire follow-up mutations.
 *
 * Runs sequentially because the SQLite WAL writer is single-threaded — issuing
 * three concurrent `$transaction` calls just serializes them at a lower layer
 * and makes ordering harder to reason about.
 */
export async function syncNoteMarkdownDerivatives(
  noteId: string,
  body: string,
  prisma: Prisma = defaultPrisma,
): Promise<void> {
  await syncNoteLinksFromBody(noteId, body, prisma)
  await syncTasksFromBody(noteId, body, prisma)
  await syncClozeFromBody(noteId, body, prisma)
}
