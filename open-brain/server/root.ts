import { router } from './trpc'
import { authRouter } from './routers/auth'
import { noteRouter } from './routers/note'
import { noteLinkRouter } from './routers/noteLink'
import { graphRouter } from './routers/graph'
import { taskRouter } from './routers/task'
import { searchRouter } from './routers/search'
import { periodicTemplateRouter } from './routers/periodicTemplate'
import { flashcardRouter } from './routers/flashcard'
import { deckRouter } from './routers/deck'
import { reviewRouter } from './routers/review'

export const appRouter = router({
  auth: authRouter,
  note: noteRouter,
  noteLink: noteLinkRouter,
  task: taskRouter,
  graph: graphRouter,
  search: searchRouter,
  flashcard: flashcardRouter,
  deck: deckRouter,
  review: reviewRouter,
  periodicTemplate: periodicTemplateRouter,
})

export type AppRouter = typeof appRouter
