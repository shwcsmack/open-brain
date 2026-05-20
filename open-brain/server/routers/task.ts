import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { syncTaskToFts, deleteTaskFromFts } from '@/lib/search'

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
    .mutation(async ({ input }) => {
      const { dueDate, ...rest } = input
      const task = await prisma.task.create({
        data: {
          ...rest,
          ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
        },
      })
      await syncTaskToFts(task.id, task.title)
      return task
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
    .mutation(async ({ input }) => {
      const { id, dueDate, ...rest } = input
      const updated = await prisma.task.update({
        where: { id },
        data: {
          ...rest,
          ...(dueDate !== undefined
            ? { dueDate: dueDate ? new Date(dueDate) : null }
            : {}),
        },
      })
      await syncTaskToFts(updated.id, updated.title)
      return updated
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { id } = input
      const deleted = await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } })
      await deleteTaskFromFts(id)
      return deleted
    }),

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

      // Sync FTS after transaction completes
      for (const t of toDelete) {
        await deleteTaskFromFts(t.id)
      }
      for (const t of toUpdate) {
        const existingTask = existing.find(e => e.title === t.title)!
        await syncTaskToFts(existingTask.id, existingTask.title)
      }
      if (toCreate.length > 0) {
        const created = await prisma.task.findMany({
          where: { noteId: input.noteId, deletedAt: null, title: { in: toCreate.map(t => t.title) } },
          select: { id: true, title: true },
        })
        for (const task of created) {
          await syncTaskToFts(task.id, task.title)
        }
      }
    }),
})
