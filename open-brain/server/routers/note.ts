import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { uniqueSlug } from '@/lib/slug'
import { syncNoteToFts, deleteNoteFromFts } from '@/lib/search'

export const noteRouter = router({
  list: protectedProcedure.query(() =>
    prisma.note.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, slug: true, body: true, tags: true, updatedAt: true },
    })
  ),

  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) =>
      prisma.note.findUniqueOrThrow({ where: { slug: input.slug } })
    ),

  searchTitles: protectedProcedure
    .input(z.object({ q: z.string() }))
    .query(({ input }) =>
      prisma.note.findMany({
        where: { title: { contains: input.q } },
        select: { id: true, title: true, slug: true },
        take: 10,
      })
    ),

  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const slug = await uniqueSlug(input.title, prisma)
      const note = await prisma.note.create({ data: { title: input.title, slug } })
      void syncNoteToFts(note.id, note.title, note.body ?? '')
      return note
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      tags: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input
      const update: Record<string, unknown> = { ...data }
      if (data.title) {
        update.slug = await uniqueSlug(data.title, prisma, id)
      }
      const updated = await prisma.note.update({ where: { id }, data: update })
      void syncNoteToFts(updated.id, updated.title, updated.body ?? '')
      return updated
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      void deleteNoteFromFts(input.id)
      return prisma.note.delete({ where: { id: input.id } })
    }),
})
