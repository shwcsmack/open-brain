import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'

export async function createContext({ req }: FetchCreateContextFnOptions) {
  const res = new Response()
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  return { session, prisma }
}

export type Context = Awaited<ReturnType<typeof createContext>>
