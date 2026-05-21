import { PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db'
  // PrismaBetterSqlite3 expects url without the "file:" prefix for absolute paths,
  // but accepts "file:..." relative paths directly
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl })
  return new PrismaClient({ adapter })
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
