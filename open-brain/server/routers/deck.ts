import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

export const deckRouter = router({
  list: protectedProcedure.query(async () => {
    const [decks, countRows] = await Promise.all([
      prisma.deck.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.deckCard.groupBy({
        by: ['deckId'],
        where: { card: { deletedAt: null } },
        _count: { cardId: true },
      }),
    ])
    const countMap = new Map(countRows.map(r => [r.deckId, r._count.cardId]))
    return decks.map(deck => ({ ...deck, cardCount: countMap.get(deck.id) ?? 0 }))
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return prisma.deck.create({ data: { name: input.name } })
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return prisma.deck.update({
        where: { id: input.id },
        data: { name: input.name },
      })
    }),

  delete: protectedProcedure
    .input(z.string()) // deckId
    .mutation(async ({ input }) => {
      await prisma.deck.delete({ where: { id: input } })
    }),
})
