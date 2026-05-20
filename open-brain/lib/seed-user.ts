import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

let seeded = false

export async function seedInitialUserIfNeeded() {
  if (seeded) return
  seeded = true
  const initialPassword = process.env.INITIAL_PASSWORD
  if (!initialPassword) return
  if ((await prisma.user.count()) > 0) return
  const hash = await bcrypt.hash(initialPassword, 12)
  await prisma.user.create({ data: { passwordHash: hash } })
}
