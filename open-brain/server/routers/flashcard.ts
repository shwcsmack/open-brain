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

  syncCloze: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
        items: z.array(
          z.object({
            front: z.string(),
            clozeIndex: z.number().int(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      // Get existing cloze cards for this note (including soft-deleted)
      const existing = await prisma.flashcard.findMany({
        where: { noteId: input.noteId, type: 'CLOZE' },
      })

      // Index by clozeIndex (skip nulls)
      const existingMap = new Map(
        existing
          .filter((c) => c.clozeIndex !== null)
          .map((c) => [c.clozeIndex as number, c])
      )
      const incomingIndices = new Set(input.items.map((i) => i.clozeIndex))

      const ops: Promise<unknown>[] = []

      // Insert new or restore soft-deleted
      for (const item of input.items) {
        const ex = existingMap.get(item.clozeIndex)
        if (!ex) {
          ops.push(
            prisma.flashcard.create({
              data: {
                type: 'CLOZE',
                front: item.front,
                clozeIndex: item.clozeIndex,
                noteId: input.noteId,
                stability: 0,
                difficulty: 0,
                due: new Date(),
                reps: 0,
                lapses: 0,
                state: 'NEW',
                lastReview: null,
              },
            })
          )
        } else if (ex.deletedAt !== null) {
          // Restore soft-deleted
          ops.push(
            prisma.flashcard.update({
              where: { id: ex.id },
              data: { deletedAt: null, front: item.front },
            })
          )
        } else if (ex.front !== item.front) {
          // Update front text if changed
          ops.push(
            prisma.flashcard.update({
              where: { id: ex.id },
              data: { front: item.front },
            })
          )
        }
      }

      // Soft-delete removed
      for (const [idx, card] of existingMap) {
        if (!incomingIndices.has(idx) && card.deletedAt === null) {
          ops.push(
            prisma.flashcard.update({
              where: { id: card.id },
              data: { deletedAt: new Date() },
            })
          )
        }
      }

      await Promise.all(ops)
    }),
})
