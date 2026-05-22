import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { stripMarkdown } from '@/lib/stripMarkdown'

export const noteLinkRouter = router({
  sync: protectedProcedure
    .input(z.object({
      sourceNoteId: z.string(),
      targetNoteIds: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      const { sourceNoteId, targetNoteIds } = input
      const existing = await prisma.noteLink.findMany({ where: { sourceNoteId } })
      const existingIds = new Set(existing.map(l => l.targetNoteId))
      const newIds = new Set(targetNoteIds)

      const toDelete = existing
        .filter(l => !newIds.has(l.targetNoteId))
        .map(l => l.id)
      const toCreate = targetNoteIds.filter(id => !existingIds.has(id))

      await prisma.$transaction(async tx => {
        if (toDelete.length > 0) {
          await tx.noteLink.deleteMany({ where: { id: { in: toDelete } } })
        }
        if (toCreate.length > 0) {
          await tx.noteLink.createMany({
            data: toCreate.map(targetNoteId => ({ sourceNoteId, targetNoteId })),
          })
        }
      })
    }),

  getBacklinks: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .query(async ({ input }) => {
      const links = await prisma.noteLink.findMany({
        where: { targetNoteId: input.noteId },
        include: {
          sourceNote: { select: { id: true, title: true, slug: true, body: true } },
        },
      })
      return links.map(l => {
        const excerpt = stripMarkdown(l.sourceNote.body ?? '').trim().slice(0, 100)
        return {
          id: l.sourceNote.id,
          title: l.sourceNote.title,
          slug: l.sourceNote.slug,
          excerpt,
        }
      })
    }),
})
