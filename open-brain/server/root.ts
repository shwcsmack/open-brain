import { router } from './trpc'
import { authRouter } from './routers/auth'
import { noteRouter } from './routers/note'
import { noteLinkRouter } from './routers/noteLink'
import { graphRouter } from './routers/graph'
import { taskRouter } from './routers/task'
import { searchRouter } from './routers/search'
import { periodicTemplateRouter } from './routers/periodicTemplate'

// Stub routers — will be replaced in subsequent tasks
const stubRouter = router({})

export const appRouter = router({
  auth: authRouter,
  note: noteRouter,
  noteLink: noteLinkRouter,
  task: taskRouter,
  graph: graphRouter,
  search: searchRouter,
  flashcard: stubRouter,
  deck: stubRouter,
  review: stubRouter,
  periodicTemplate: periodicTemplateRouter,
})

export type AppRouter = typeof appRouter
