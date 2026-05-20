import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

const TaskStatusEnum = z.enum(['TODO', 'IN_PROGRESS', 'DONE'])
const PriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH'])

export const taskRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          status: TaskStatusEnum.optional(),
          priority: PriorityEnum.optional(),
        })
        .optional()
    )
    .query(({ input }) =>
      prisma.task.findMany({
        where: {
          deletedAt: null,
          ...(input?.status ? { status: input.status } : {}),
          ...(input?.priority ? { priority: input.priority } : {}),
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
        include: { note: { select: { title: true, slug: true } } },
      })
    ),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        status: TaskStatusEnum.default('TODO'),
        priority: PriorityEnum.default('MEDIUM'),
        dueDate: z.string().optional(),
        noteId: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const { dueDate, ...rest } = input
      return prisma.task.create({
        data: {
          ...rest,
          ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
        },
      })
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        status: TaskStatusEnum.optional(),
        priority: PriorityEnum.optional(),
        dueDate: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, dueDate, ...rest } = input
      return prisma.task.update({
        where: { id },
        data: {
          ...rest,
          ...(dueDate !== undefined
            ? { dueDate: dueDate ? new Date(dueDate) : null }
            : {}),
        },
      })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      prisma.task.update({ where: { id: input.id }, data: { deletedAt: new Date() } })
    ),

  syncFromNote: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
        tasks: z.array(z.object({ title: z.string(), done: z.boolean() })),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await prisma.task.findMany({
        where: { noteId: input.noteId, deletedAt: null },
      })
      const existingTitles = new Set(existing.map(t => t.title))
      const newTitles = new Set(input.tasks.map(t => t.title))

      const toDelete = existing.filter(t => !newTitles.has(t.title))
      const toUpdate = input.tasks.filter(t => existingTitles.has(t.title))
      const toCreate = input.tasks.filter(t => !existingTitles.has(t.title))

      await prisma.$transaction(async tx => {
        for (const t of toDelete) {
          await tx.task.update({ where: { id: t.id }, data: { deletedAt: new Date() } })
        }
        for (const t of toUpdate) {
          const existingTask = existing.find(e => e.title === t.title)!
          await tx.task.update({
            where: { id: existingTask.id },
            data: { status: t.done ? 'DONE' : 'TODO' },
          })
        }
        if (toCreate.length > 0) {
          await tx.task.createMany({
            data: toCreate.map(t => ({
              title: t.title,
              status: t.done ? ('DONE' as const) : ('TODO' as const),
              noteId: input.noteId,
            })),
          })
        }
      })
    }),
})
