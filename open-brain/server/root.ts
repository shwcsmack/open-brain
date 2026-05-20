import { router } from './trpc'
import { authRouter } from './routers/auth'
import { noteRouter } from './routers/note'
import { noteLinkRouter } from './routers/noteLink'
import { graphRouter } from './routers/graph'

// Stub routers — will be replaced in subsequent tasks
const stubRouter = router({})

export const appRouter = router({
  auth: authRouter,
  note: noteRouter,
  noteLink: noteLinkRouter,
  task: stubRouter,
  graph: graphRouter,
  search: stubRouter,
  flashcard: stubRouter,
  deck: stubRouter,
  review: stubRouter,
  periodicTemplate: stubRouter,
})

export type AppRouter = typeof appRouter
