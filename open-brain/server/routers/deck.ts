import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

export const deckRouter = router({
  list: protectedProcedure.query(async () => {
    const decks = await prisma.deck.findMany({ orderBy: { createdAt: 'asc' } })
    // Count non-deleted cards per deck
    const withCounts = await Promise.all(
      decks.map(async deck => {
        const count = await prisma.deckCard.count({
          where: { deckId: deck.id, card: { deletedAt: null } },
        })
        return { ...deck, cardCount: count }
      })
    )
    return withCounts
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
