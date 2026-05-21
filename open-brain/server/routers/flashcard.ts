import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

export const flashcardRouter = router({
  listByNote: protectedProcedure
    .input(z.string()) // noteId
    .query(async ({ input }) => {
      return prisma.flashcard.findMany({
        where: { noteId: input, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      })
    }),

  create: protectedProcedure
    .input(
      z.object({
        type: z.enum(['BASIC', 'CLOZE']),
        front: z.string(),
        back: z.string().optional(),
        clozeIndex: z.number().int().optional(),
        noteId: z.string().optional(),
        deckId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const now = new Date()
      const card = await prisma.$transaction(async (tx) => {
        if (input.deckId) {
          const deck = await tx.deck.findUnique({ where: { id: input.deckId } })
          if (!deck) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Deck not found' })
        }
        const c = await tx.flashcard.create({
          data: {
            type: input.type,
            front: input.front,
            back: input.back,
            clozeIndex: input.clozeIndex,
            noteId: input.noteId,
            // FSRS initial values
            stability: 0,
            difficulty: 0,
            due: now,
            reps: 0,
            lapses: 0,
            state: 'NEW',
            lastReview: null,
          },
        })
        if (input.deckId) {
          await tx.deckCard.create({ data: { deckId: input.deckId, cardId: c.id } })
        }
        return c
      })
      return card
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        front: z.string().optional(),
        back: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input
      return prisma.flashcard.update({ where: { id }, data })
    }),

  softDelete: protectedProcedure
    .input(z.string()) // cardId
    .mutation(async ({ input }) => {
      return prisma.flashcard.update({
        where: { id: input },
        data: { deletedAt: new Date() },
      })
    }),
})
