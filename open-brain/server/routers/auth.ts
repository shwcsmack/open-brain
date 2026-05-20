import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { router, publicProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { TRPCError } from '@trpc/server'

export const authRouter = router({
  hasUser: publicProcedure.query(async () => {
    const count = await prisma.user.count()
    return count > 0
  }),

  setup: publicProcedure
    .input(z.object({ password: z.string().min(8) }))
    .mutation(async ({ input, ctx }) => {
      if ((await prisma.user.count()) > 0)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'User already exists' })
      const hash = await bcrypt.hash(input.password, 12)
      const user = await prisma.user.create({ data: { passwordHash: hash } })
      ctx.session.userId = user.id
      await ctx.session.save()
    }),

  login: publicProcedure
    .input(z.object({ password: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findFirst()
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No user exists' })
      const valid = await bcrypt.compare(input.password, user.passwordHash)
      if (!valid) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid password' })
      ctx.session.userId = user.id
      await ctx.session.save()
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    ctx.session.destroy()
  }),
})
