import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { sessionOptions, type SessionData } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'

export async function createContext(_opts: FetchCreateContextFnOptions) {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions)
  return { session, prisma }
}

export type Context = Awaited<ReturnType<typeof createContext>>
