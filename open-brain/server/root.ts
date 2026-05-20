import { router } from './trpc'
import { authRouter } from './routers/auth'
import { noteRouter } from './routers/note'

// Stub routers — will be replaced in subsequent tasks
const stubRouter = router({})

export const appRouter = router({
  auth: authRouter,
  note: noteRouter,
  noteLink: stubRouter,
  task: stubRouter,
  graph: stubRouter,
  search: stubRouter,
  flashcard: stubRouter,
  deck: stubRouter,
  review: stubRouter,
  periodicTemplate: stubRouter,
})

export type AppRouter = typeof appRouter
