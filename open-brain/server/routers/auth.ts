import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { router, publicProcedure, protectedProcedure } from '../trpc'
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
    await ctx.session.destroy()
  }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findUnique({ where: { id: ctx.userId } })
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash)
      if (!valid) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      if (input.currentPassword === input.newPassword) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'New password must be different from current password' })
      }
      const hash = await bcrypt.hash(input.newPassword, 12)
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } })
    }),
})
