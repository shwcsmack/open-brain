import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

export const graphRouter = router({
  getAll: protectedProcedure.query(async () => {
    const [notes, links] = await Promise.all([
      prisma.note.findMany({ select: { id: true, title: true, slug: true } }),
      prisma.noteLink.findMany({ select: { sourceNoteId: true, targetNoteId: true } }),
    ])
    return { nodes: notes, edges: links }
  }),
})
