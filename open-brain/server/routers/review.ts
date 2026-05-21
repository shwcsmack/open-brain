import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { computeNextState, Rating, type Grade } from '@/lib/fsrs'

export const reviewRouter = router({
  listDue: protectedProcedure
    .input(z.object({ deckId: z.string().optional() }))
    .query(async ({ input }) => {
      const now = new Date()
      const where = {
        deletedAt: null as null,
        due: { lte: now },
        ...(input.deckId
          ? { decks: { some: { deckId: input.deckId } } }
          : {}),
      }
      return prisma.flashcard.findMany({ where, orderBy: { due: 'asc' } })
    }),

  dueCounts: protectedProcedure.query(async () => {
    const now = new Date()
    const decks = await prisma.deck.findMany()
    const counts = await Promise.all(
      decks.map(async deck => {
        const count = await prisma.deckCard.count({
          where: {
            deckId: deck.id,
            card: { deletedAt: null, due: { lte: now } },
          },
        })
        return { deckId: deck.id, deckName: deck.name, dueCount: count }
      })
    )
    const totalDue = await prisma.flashcard.count({
      where: { deletedAt: null, due: { lte: now } },
    })
    return { decks: counts, totalDue }
  }),

  rate: protectedProcedure
    .input(
      z.object({
        cardId: z.string(),
        rating: z.enum(['Again', 'Hard', 'Good', 'Easy']),
      })
    )
    .mutation(async ({ input }) => {
      const card = await prisma.flashcard.findUniqueOrThrow({
        where: { id: input.cardId },
      })

      const ratingMap: Record<string, Grade> = {
        Again: Rating.Again,
        Hard: Rating.Hard,
        Good: Rating.Good,
        Easy: Rating.Easy,
      }

      const next = computeNextState(
        {
          stability: card.stability,
          difficulty: card.difficulty,
          due: card.due,
          reps: card.reps,
          lapses: card.lapses,
          state: card.state,
          lastReview: card.lastReview,
        },
        ratingMap[input.rating]
      )

      const updated = await prisma.flashcard.update({
        where: { id: card.id },
        data: {
          stability: next.stability,
          difficulty: next.difficulty,
          due: next.due,
          reps: next.reps,
          lapses: next.lapses,
          state: next.state,
          lastReview: next.lastReview,
        },
      })

      // For cloze cards: return siblings (same noteId, same front source)
      let siblings: typeof updated[] = []
      if (card.type === 'CLOZE' && card.noteId) {
        siblings = await prisma.flashcard.findMany({
          where: {
            noteId: card.noteId,
            type: 'CLOZE',
            deletedAt: null,
            id: { not: card.id },
          },
          orderBy: { clozeIndex: 'asc' },
        })
      }

      return { card: updated, siblings, scheduledDays: next.scheduledDays }
    }),
})
