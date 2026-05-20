import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { searchContent } from '@/lib/search'
import { prisma } from '@/lib/prisma'

export const searchRouter = router({
  query: protectedProcedure
    .input(z.object({ q: z.string() }))
    .query(async ({ input }) => {
      if (!input.q.trim()) {
        const recent = await prisma.note.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: { id: true, title: true, slug: true, updatedAt: true },
        })
        return recent.map(n => ({ ...n, type: 'note' as const, snippet: '' }))
      }
      return searchContent(input.q)
    }),
})
