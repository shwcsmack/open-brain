import { router } from './trpc'

// Stub routers — will be replaced in subsequent tasks
const stubRouter = router({})

export const appRouter = router({
  note: stubRouter,
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
