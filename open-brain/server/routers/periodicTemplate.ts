import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

const PeriodTypeEnum = z.enum(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'])

export const periodicTemplateRouter = router({
  get: protectedProcedure
    .input(PeriodTypeEnum)
    .query(async ({ input }) => {
      return prisma.periodicTemplate.findUnique({ where: { periodType: input } })
    }),
  upsert: protectedProcedure
    .input(z.object({
      periodType: PeriodTypeEnum,
      content: z.string(),
    }))
    .mutation(async ({ input }) => {
      return prisma.periodicTemplate.upsert({
        where: { periodType: input.periodType },
        create: { periodType: input.periodType, content: input.content },
        update: { content: input.content },
      })
    }),
})
