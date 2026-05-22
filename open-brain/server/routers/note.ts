import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { uniqueSlug } from '@/lib/slug'
import { syncNoteToFts, deleteNoteFromFts } from '@/lib/search'
import { syncNoteMarkdownDerivatives } from '@/lib/noteMarkdownSync'

export const noteRouter = router({
  list: protectedProcedure.query(() =>
    prisma.note.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, slug: true, body: true, tags: true, updatedAt: true, periodType: true, periodKey: true },
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
      // When the body changes, the note is the source of truth for wikilinks,
      // tasks, and cloze cards — derive them here so the client doesn't have
      // to fire three follow-up mutations (and so it can't race a stale notes
      // list against the new body).
      if (data.body !== undefined) {
        await syncNoteMarkdownDerivatives(updated.id, updated.body ?? '')
      }
      return updated
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      void deleteNoteFromFts(input.id)
      return prisma.note.delete({ where: { id: input.id } })
    }),

  getOrCreatePeriodic: protectedProcedure
    .input(z.object({
      periodType: z.enum(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']),
      periodKey: z.string().regex(
        /^\d{4}-\d{2}-\d{2}$|^\d{4}-W\d{2}$|^\d{4}-\d{2}$|^\d{4}-Q[1-4]$|^\d{4}$/,
        'Invalid period key format'
      ),
    }))
    .mutation(async ({ input }) => {
      const existing = await prisma.note.findUnique({
        where: { periodType_periodKey: { periodType: input.periodType, periodKey: input.periodKey } },
      })
      if (existing) return existing

      // Get template
      const template = await prisma.periodicTemplate.findUnique({
        where: { periodType: input.periodType },
      })

      // Build title from periodType + periodKey
      const titleMap: Record<string, string> = {
        DAY: `Daily Note — ${input.periodKey}`,
        WEEK: `Weekly Note — ${input.periodKey}`,
        MONTH: `Monthly Note — ${input.periodKey}`,
        QUARTER: `Quarterly Note — ${input.periodKey}`,
        YEAR: `Yearly Note — ${input.periodKey}`,
      }
      const title = titleMap[input.periodType]
      const slug = await uniqueSlug(title, prisma)
      const body = template?.content && template.content !== '{}'
        ? template.content
        : ''

      const note = await prisma.note.create({
        data: {
          title,
          slug,
          body,
          tags: '[]',
          periodType: input.periodType,
          periodKey: input.periodKey,
        },
      })
      void syncNoteToFts(note.id, note.title, body)
      return note
    }),
})
