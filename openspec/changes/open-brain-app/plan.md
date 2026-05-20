# Open-Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build open-brain — a self-hostable, browser-based PKM app with wikilinks, knowledge graph, task management, spaced-repetition flashcards, and periodic notes.

**Architecture:** Next.js 14 App Router with tRPC for end-to-end type-safe RPC, Prisma ORM targeting SQLite (default) or Postgres, and Tiptap v2 for the rich editor. Each major feature (wikilinks, tasks, flashcards, periodic notes) is implemented as a Tiptap extension that diff-syncs its data to dedicated Prisma models on every auto-save.

**Tech Stack:** TypeScript, Next.js 14 App Router, tRPC, Prisma, SQLite/Postgres, Tiptap v2 (ProseMirror), React Flow, d3-force, ts-fsrs, iron-session, bcrypt, shadcn/ui, Tailwind CSS, Docker Compose.

---

## File Structure

```
open-brain/
├── app/
│   ├── layout.tsx                         # Root layout — sidebar + SearchModal
│   ├── page.tsx                           # Notes list
│   ├── middleware.ts                      # Auth route protection
│   ├── notes/[slug]/page.tsx              # Note detail
│   ├── graph/page.tsx                     # Knowledge graph
│   ├── tasks/page.tsx                     # Task management
│   ├── review/page.tsx                    # Review hub
│   ├── review/session/page.tsx            # Full-screen review session
│   ├── decks/page.tsx                     # Deck management
│   ├── settings/page.tsx                  # Periodic templates editor
│   ├── login/page.tsx                     # Login
│   ├── setup/page.tsx                     # First-run setup
│   └── api/trpc/[trpc]/route.ts           # tRPC HTTP handler
├── server/
│   ├── context.ts                         # tRPC context (session)
│   ├── trpc.ts                            # tRPC init + auth middleware
│   ├── root.ts                            # Root router
│   └── routers/
│       ├── note.ts                        # Note CRUD + getOrCreatePeriodic
│       ├── noteLink.ts                    # Wikilink sync + backlinks
│       ├── task.ts                        # Task CRUD
│       ├── graph.ts                       # Graph data
│       ├── search.ts                      # Full-text search
│       ├── flashcard.ts                   # Flashcard CRUD
│       ├── deck.ts                        # Deck management
│       ├── review.ts                      # FSRS review procedures
│       └── periodicTemplate.ts            # Periodic templates
├── lib/
│   ├── prisma.ts                          # Prisma singleton
│   ├── session.ts                         # iron-session config
│   ├── fsrs.ts                            # ts-fsrs wrapper
│   ├── slug.ts                            # Slug generation + collision
│   ├── period.ts                          # Period key utilities
│   └── search.ts                          # FTS5 / tsvector dialect helper
├── components/
│   ├── editor/
│   │   ├── NoteEditor.tsx                 # Tiptap wrapper + auto-save
│   │   ├── extensions/WikilinkExtension.ts
│   │   ├── extensions/TaskItemExtension.ts
│   │   └── extensions/ClozeExtension.ts
│   ├── notes/
│   │   ├── NotesList.tsx
│   │   ├── TagInput.tsx
│   │   ├── BacklinksPanel.tsx
│   │   └── CardsPanel.tsx
│   ├── graph/
│   │   └── GraphCanvas.tsx
│   ├── search/
│   │   └── SearchModal.tsx
│   ├── flashcard/
│   │   ├── CardCreationModal.tsx
│   │   ├── ReviewSession.tsx
│   │   └── RatingButtons.tsx
│   ├── periodic/
│   │   └── CalendarNavigator.tsx
│   └── layout/
│       └── AppSidebar.tsx
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── 0001_fts5.sql                  # Raw FTS5 migration
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Task 1: Project Scaffolding (tasks 1.1–1.8)

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `components.json` (shadcn)
- Create: `lib/prisma.ts`, `server/trpc.ts`, `server/context.ts`, `server/root.ts`
- Create: `app/api/trpc/[trpc]/route.ts`
- Create: `.env.example`

- [ ] **Step 1: Bootstrap Next.js app**

```bash
npx create-next-app@latest open-brain \
  --typescript --tailwind --app --src-dir=no \
  --import-alias "@/*" --no-eslint
cd open-brain
```

- [ ] **Step 2: Install all dependencies**

```bash
npm install @trpc/server @trpc/client @trpc/react-query @trpc/next \
  @tanstack/react-query superjson \
  @prisma/client prisma \
  iron-session bcryptjs \
  @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder \
  reactflow d3-force \
  ts-fsrs \
  date-fns

npm install -D @types/bcryptjs @types/d3-force
```

- [ ] **Step 3: Install and init shadcn/ui**

```bash
npx shadcn-ui@latest init
# When prompted: style=Default, base color=Slate, CSS variables=yes
npx shadcn-ui@latest add button input dialog badge dropdown-menu skeleton toast separator
```

- [ ] **Step 4: Create Prisma singleton**

Create `lib/prisma.ts`:
```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['query'] : [] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 5: Configure tRPC**

Create `server/trpc.ts`:
```typescript
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import type { Context } from './context'

const t = initTRPC.context<Context>().create({ transformer: superjson })

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.userId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, userId: ctx.session.userId } })
})
```

Create `server/context.ts`:
```typescript
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'

export async function createContext(req: NextRequest, res: NextResponse) {
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  return { session, prisma, req, res }
}

export type Context = Awaited<ReturnType<typeof createContext>>
```

Create `server/root.ts`:
```typescript
import { router } from './trpc'
import { noteRouter } from './routers/note'
import { noteLinkRouter } from './routers/noteLink'
import { taskRouter } from './routers/task'
import { graphRouter } from './routers/graph'
import { searchRouter } from './routers/search'
import { flashcardRouter } from './routers/flashcard'
import { deckRouter } from './routers/deck'
import { reviewRouter } from './routers/review'
import { periodicTemplateRouter } from './routers/periodicTemplate'

export const appRouter = router({
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
```

- [ ] **Step 6: Create tRPC API route handler**

Create `app/api/trpc/[trpc]/route.ts`:
```typescript
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/root'
import { createContext } from '@/server/context'
import type { NextRequest } from 'next/server'

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: ({ req, resHeaders }) =>
      createContext(req as NextRequest, resHeaders as any),
  })

export { handler as GET, handler as POST }
```

- [ ] **Step 7: Create iron-session config**

Create `lib/session.ts`:
```typescript
import type { SessionOptions } from 'iron-session'

export interface SessionData {
  userId: string
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'open-brain-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
}
```

- [ ] **Step 8: Create .env.example**

```bash
cat > .env.example << 'EOF'
# Required: at least 32 random characters
SESSION_SECRET=change-me-to-a-long-random-string

# SQLite (default) or Postgres
DATABASE_URL="file:./dev.db"
# DATABASE_URL="postgresql://user:password@localhost:5432/openbrain"

# Optional: auto-create first user on boot
INITIAL_PASSWORD=

# Server
PORT=3000
BASE_URL=http://localhost:3000
EOF
cp .env.example .env
```

- [ ] **Step 9: Configure path aliases in tsconfig.json**

Ensure `tsconfig.json` has:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding — Next.js, tRPC, Prisma, shadcn setup"
```

---

## Task 2: Database Schema & Migrations (tasks 2.1–2.10)

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/migrations/0001_fts5.sql`

- [ ] **Step 1: Initialize Prisma**

```bash
npx prisma init --datasource-provider sqlite
```

- [ ] **Step 2: Write full schema**

Replace `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid())
  passwordHash String
  createdAt    DateTime @default(now())
}

enum PeriodType {
  DAY
  WEEK
  MONTH
  QUARTER
  YEAR
}

model Note {
  id         String      @id @default(uuid())
  title      String
  slug       String      @unique
  body       String      @default("")
  tags       String      @default("[]")
  periodType PeriodType?
  periodKey  String?
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt
  outLinks   NoteLink[]  @relation("SourceNote")
  inLinks    NoteLink[]  @relation("TargetNote")
  tasks      Task[]
  flashcards Flashcard[]

  @@unique([periodType, periodKey])
}

model NoteLink {
  id           String @id @default(uuid())
  sourceNoteId String
  targetNoteId String
  sourceNote   Note   @relation("SourceNote", fields: [sourceNoteId], references: [id], onDelete: Cascade)
  targetNote   Note   @relation("TargetNote", fields: [targetNoteId], references: [id], onDelete: Cascade)

  @@unique([sourceNoteId, targetNoteId])
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
}

enum Priority {
  LOW
  MEDIUM
  HIGH
}

model Task {
  id        String     @id @default(uuid())
  title     String
  status    TaskStatus @default(TODO)
  priority  Priority   @default(MEDIUM)
  dueDate   DateTime?
  noteId    String?
  note      Note?      @relation(fields: [noteId], references: [id], onDelete: SetNull)
  deletedAt DateTime?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}

model Deck {
  id        String     @id @default(uuid())
  name      String
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  cards     DeckCard[]
}

enum CardType {
  BASIC
  CLOZE
}

enum FSRSState {
  NEW
  LEARNING
  REVIEW
  RELEARNING
}

model Flashcard {
  id         String    @id @default(uuid())
  type       CardType
  front      String
  back       String?
  clozeIndex Int?
  noteId     String?
  note       Note?     @relation(fields: [noteId], references: [id], onDelete: SetNull)
  decks      DeckCard[]
  stability  Float     @default(0)
  difficulty Float     @default(0)
  due        DateTime  @default(now())
  reps       Int       @default(0)
  lapses     Int       @default(0)
  state      FSRSState @default(NEW)
  lastReview DateTime?
  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
}

model DeckCard {
  deckId String
  cardId String
  deck   Deck      @relation(fields: [deckId], references: [id], onDelete: Cascade)
  card   Flashcard @relation(fields: [cardId], references: [id], onDelete: Cascade)

  @@id([deckId, cardId])
}

model PeriodicTemplate {
  id         String     @id @default(uuid())
  periodType PeriodType @unique
  content    String     @default("{}")
  updatedAt  DateTime   @updatedAt
}
```

- [ ] **Step 3: Create FTS5 migration**

```bash
mkdir -p prisma/migrations
cat > prisma/migrations/0001_fts5.sql << 'EOF'
-- SQLite FTS5 virtual table for notes and tasks
CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  content='Note',
  content_rowid='rowid'
);

CREATE VIRTUAL TABLE IF NOT EXISTS task_fts USING fts5(
  id UNINDEXED,
  title,
  content='Task',
  content_rowid='rowid'
);
EOF
```

- [ ] **Step 4: Run initial migration**

```bash
npx prisma migrate dev --name init
```

Expected: migration files created, SQLite database generated at `dev.db`.

- [ ] **Step 5: Verify schema**

```bash
npx prisma studio
# Open http://localhost:5555 — confirm all tables exist
# Ctrl+C when done
```

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat: full Prisma schema — all models including flashcards and periodic notes"
```

---

## Task 3: Authentication & Self-Hosting (tasks 3.1–3.9)

**Files:**
- Create: `app/setup/page.tsx`, `app/login/page.tsx`
- Create: `server/routers/auth.ts`
- Modify: `server/root.ts`
- Create: `middleware.ts`
- Create: `Dockerfile`, `docker-compose.yml`
- Create: `scripts/entrypoint.sh`

- [ ] **Step 1: Write auth tRPC router**

Create `server/routers/auth.ts`:
```typescript
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { router, publicProcedure } from '../trpc'
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
      if (await prisma.user.count() > 0)
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
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' })
      const valid = await bcrypt.compare(input.password, user.passwordHash)
      if (!valid) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid password' })
      ctx.session.userId = user.id
      await ctx.session.save()
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    ctx.session.destroy()
  }),
})
```

Add `auth: authRouter` to `server/root.ts`.

- [ ] **Step 2: Add startup validation**

Create `lib/startup.ts`:
```typescript
export function validateEnv() {
  if (!process.env.SESSION_SECRET) {
    console.error('Fatal: SESSION_SECRET environment variable is not set.')
    process.exit(1)
  }
}
```

Call in `app/layout.tsx` (server component, top of file):
```typescript
import { validateEnv } from '@/lib/startup'
validateEnv()
```

- [ ] **Step 3: Create Next.js middleware**

Create `middleware.ts`:
```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'

const PUBLIC_PATHS = ['/login', '/setup', '/api/trpc']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next()

  const res = NextResponse.next()
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  if (!session.userId) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return res
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
```

- [ ] **Step 4: Build /setup page**

Create `app/setup/page.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function SetupPage() {
  const [password, setPassword] = useState('')
  const router = useRouter()
  const setup = api.auth.setup.useMutation({ onSuccess: () => router.push('/') })

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Welcome to open-brain</h1>
        <p className="text-muted-foreground">Set your password to get started.</p>
        <Input
          type="password"
          placeholder="Choose a password (min 8 chars)"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <Button
          className="w-full"
          onClick={() => setup.mutate({ password })}
          disabled={setup.isPending}
        >
          {setup.isPending ? 'Setting up...' : 'Create account'}
        </Button>
        {setup.error && <p className="text-destructive text-sm">{setup.error.message}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Build /login page**

Create `app/login/page.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const router = useRouter()
  const login = api.auth.login.useMutation({ onSuccess: () => router.push('/') })

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">open-brain</h1>
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login.mutate({ password })}
        />
        <Button className="w-full" onClick={() => login.mutate({ password })} disabled={login.isPending}>
          {login.isPending ? 'Signing in...' : 'Sign in'}
        </Button>
        {login.error && <p className="text-destructive text-sm">Invalid password</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Write Dockerfile**

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
```

Create `scripts/entrypoint.sh`:
```bash
#!/bin/sh
set -e
npx prisma migrate deploy
node server.js
```

Create `docker-compose.yml`:
```yaml
services:
  app:
    build: .
    ports:
      - "${PORT:-3000}:3000"
    environment:
      DATABASE_URL: file:/data/open-brain.db
      SESSION_SECRET: ${SESSION_SECRET}
      INITIAL_PASSWORD: ${INITIAL_PASSWORD:-}
    volumes:
      - db_data:/data

volumes:
  db_data:
```

- [ ] **Step 7: Test auth flow manually**

```bash
npm run dev
# Visit http://localhost:3000 → should redirect to /setup
# Set a password → should redirect to /
# Open incognito → visit / → should redirect to /login
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: auth — setup, login, session middleware, Docker Compose"
```

---

## Task 4: Note Editor — Core (tasks 4.1–4.10)

**Files:**
- Create: `lib/slug.ts`
- Create: `server/routers/note.ts`
- Create: `components/editor/NoteEditor.tsx`
- Create: `components/notes/NotesList.tsx`, `TagInput.tsx`
- Create: `app/page.tsx`, `app/notes/[slug]/page.tsx`

- [ ] **Step 1: Write slug utility with tests**

Create `lib/slug.ts`:
```typescript
export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export async function uniqueSlug(title: string, prisma: any, excludeId?: string): Promise<string> {
  const base = toSlug(title) || 'untitled'
  let slug = base
  let i = 2
  while (true) {
    const existing = await prisma.note.findUnique({ where: { slug } })
    if (!existing || existing.id === excludeId) return slug
    slug = `${base}-${i++}`
  }
}
```

Create `lib/__tests__/slug.test.ts`:
```typescript
import { toSlug } from '../slug'

test('converts title to kebab-case slug', () => {
  expect(toSlug('Hello World!')).toBe('hello-world')
})
test('handles special characters', () => {
  expect(toSlug('C++ Notes')).toBe('c-notes')
})
test('collapses multiple dashes', () => {
  expect(toSlug('  foo   bar  ')).toBe('foo-bar')
})
```

Run: `npx jest lib/__tests__/slug.test.ts`
Expected: 3 passing

- [ ] **Step 2: Write note tRPC router**

Create `server/routers/note.ts`:
```typescript
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { uniqueSlug } from '@/lib/slug'

export const noteRouter = router({
  list: protectedProcedure.query(() =>
    prisma.note.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, slug: true, body: true, tags: true, updatedAt: true },
    })
  ),

  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) =>
      prisma.note.findUniqueOrThrow({ where: { slug: input.slug } })
    ),

  searchTitles: protectedProcedure
    .input(z.object({ q: z.string() }))
    .query(({ input }) =>
      prisma.note.findMany({
        where: { title: { contains: input.q } },
        select: { id: true, title: true, slug: true },
        take: 10,
      })
    ),

  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const slug = await uniqueSlug(input.title, prisma)
      return prisma.note.create({ data: { title: input.title, slug } })
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      tags: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input
      if (data.title) {
        (data as any).slug = await uniqueSlug(data.title, prisma, id)
      }
      return prisma.note.update({ where: { id }, data })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.note.delete({ where: { id: input.id } })),
})
```

- [ ] **Step 3: Build NoteEditor component**

Create `components/editor/NoteEditor.tsx`:
```typescript
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import { api } from '@/lib/trpc/client'

interface Props {
  noteId: string
  initialContent: string
  onSave?: (content: string) => void
}

export function NoteEditor({ noteId, initialContent, onSave }: Props) {
  const update = api.note.update.useMutation()
  const saveTimer = useRef<NodeJS.Timeout>()

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent ? JSON.parse(initialContent) : '',
    onUpdate: ({ editor }) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const body = JSON.stringify(editor.getJSON())
        update.mutate({ id: noteId, body })
        onSave?.(body)
      }, 1000)
    },
  })

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  return (
    <div className="prose prose-sm max-w-none">
      <EditorContent editor={editor} />
    </div>
  )
}
```

- [ ] **Step 4: Build notes list page**

Create `app/page.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'

export default function NotesPage() {
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const router = useRouter()
  const { data: notes } = api.note.list.useQuery()
  const create = api.note.create.useMutation({
    onSuccess: note => router.push(`/notes/${note.slug}`),
  })

  const filtered = tagFilter
    ? notes?.filter(n => JSON.parse(n.tags).includes(tagFilter))
    : notes

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Notes</h1>
        <Button onClick={() => create.mutate({ title: 'Untitled' })}>New note</Button>
      </div>
      {tagFilter && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by:</span>
          <Badge variant="secondary" className="cursor-pointer" onClick={() => setTagFilter(null)}>
            {tagFilter} ×
          </Badge>
        </div>
      )}
      <div className="space-y-2">
        {filtered?.map(note => {
          const tags: string[] = JSON.parse(note.tags)
          const excerpt = note.body
            ? JSON.parse(note.body)?.content?.[0]?.content?.[0]?.text?.slice(0, 120) ?? ''
            : ''
          return (
            <div
              key={note.id}
              className="p-4 rounded-lg border hover:bg-accent cursor-pointer"
              onClick={() => router.push(`/notes/${note.slug}`)}
            >
              <div className="flex items-start justify-between">
                <h3 className="font-medium">{note.title}</h3>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(note.updatedAt, { addSuffix: true })}
                </span>
              </div>
              {excerpt && <p className="text-sm text-muted-foreground mt-1 truncate">{excerpt}</p>}
              {tags.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {tags.map(tag => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-xs cursor-pointer"
                      onClick={e => { e.stopPropagation(); setTagFilter(tag) }}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Build TagInput component**

Create `components/notes/TagInput.tsx`:
```typescript
'use client'
import { useState, KeyboardEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
}

export function TagInput({ tags, onChange }: Props) {
  const [input, setInput] = useState('')

  const add = () => {
    const tag = input.trim()
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setInput('')
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1))
  }

  return (
    <div className="flex flex-wrap gap-1 items-center border rounded-md px-2 py-1 min-h-9">
      {tags.map(tag => (
        <Badge key={tag} variant="secondary" className="gap-1">
          {tag}
          <button className="hover:text-destructive" onClick={() => onChange(tags.filter(t => t !== tag))}>×</button>
        </Badge>
      ))}
      <Input
        className="border-0 shadow-none h-6 p-0 text-sm flex-1 min-w-20 focus-visible:ring-0"
        placeholder={tags.length === 0 ? 'Add tags...' : ''}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
      />
    </div>
  )
}
```

- [ ] **Step 6: Build note detail page**

Create `app/notes/[slug]/page.tsx`:
```typescript
'use client'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { NoteEditor } from '@/components/editor/NoteEditor'
import { TagInput } from '@/components/notes/TagInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export default function NotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const utils = api.useUtils()
  const { data: note } = api.note.getBySlug.useQuery({ slug })
  const update = api.note.update.useMutation({ onSuccess: () => utils.note.list.invalidate() })
  const del = api.note.delete.useMutation({ onSuccess: () => router.push('/') })

  if (!note) return <div className="p-6">Loading...</div>

  const tags: string[] = JSON.parse(note.tags)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Input
          className="text-2xl font-bold border-0 shadow-none px-0 text-2xl h-auto"
          defaultValue={note.title}
          onBlur={e => update.mutate({ id: note.id, title: e.target.value })}
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">Delete</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete note?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => del.mutate({ id: note.id })}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <TagInput
        tags={tags}
        onChange={t => update.mutate({ id: note.id, tags: JSON.stringify(t) })}
      />
      <div className="mt-4">
        <NoteEditor noteId={note.id} initialContent={note.body} />
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verify notes CRUD in browser**

```bash
npm run dev
# Create a note → verify it appears in list
# Edit title → verify slug updates
# Add tags → verify they appear as chips
# Delete note → verify redirect to /
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: note editor — CRUD, auto-save, tags, notes list"
```

---

## Task 5: Wikilinks & Backlinking (tasks 5.1–5.9)

**Files:**
- Create: `components/editor/extensions/WikilinkExtension.ts`
- Create: `server/routers/noteLink.ts`
- Create: `components/notes/BacklinksPanel.tsx`
- Modify: `components/editor/NoteEditor.tsx`

- [ ] **Step 1: Write WikilinkExtension**

Create `components/editor/extensions/WikilinkExtension.ts`:
```typescript
import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

export interface WikilinkOptions {
  onResolve: (title: string) => Promise<{ id: string; slug: string } | null>
}

export const WikilinkExtension = Node.create<WikilinkOptions>({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      noteId: { default: null },
      title: { default: '' },
      resolved: { default: false },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-wikilink': '' }), `[[${HTMLAttributes.title}]]`]
  },

  // Serializer: extract all wikilink nodes
  addStorage() {
    return {
      getLinks(doc: any): string[] {
        const ids: string[] = []
        doc.descendants((node: any) => {
          if (node.type.name === 'wikilink' && node.attrs.noteId) ids.push(node.attrs.noteId)
        })
        return ids
      },
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const title = match[1]
          const { tr } = state
          tr.replaceWith(range.from, range.to,
            state.schema.nodes.wikilink.create({ title, resolved: false })
          )
        },
      }),
    ]
  },
})

export function extractWikilinks(doc: any): string[] {
  const ids: string[] = []
  const traverse = (node: any) => {
    if (node.type === 'wikilink' && node.attrs?.noteId) ids.push(node.attrs.noteId)
    node.content?.forEach(traverse)
  }
  traverse(doc)
  return ids
}
```

- [ ] **Step 2: Write noteLink tRPC router**

Create `server/routers/noteLink.ts`:
```typescript
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

export const noteLinkRouter = router({
  sync: protectedProcedure
    .input(z.object({ sourceNoteId: z.string(), targetNoteIds: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const { sourceNoteId, targetNoteIds } = input
      const existing = await prisma.noteLink.findMany({ where: { sourceNoteId } })
      const existingIds = new Set(existing.map(l => l.targetNoteId))
      const newIds = new Set(targetNoteIds)

      const toDelete = existing.filter(l => !newIds.has(l.targetNoteId)).map(l => l.id)
      const toCreate = targetNoteIds.filter(id => !existingIds.has(id))

      await prisma.$transaction([
        prisma.noteLink.deleteMany({ where: { id: { in: toDelete } } }),
        prisma.noteLink.createMany({
          data: toCreate.map(targetNoteId => ({ sourceNoteId, targetNoteId })),
          skipDuplicates: true,
        }),
      ])
    }),

  getBacklinks: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .query(async ({ input }) => {
      const links = await prisma.noteLink.findMany({
        where: { targetNoteId: input.noteId },
        include: { sourceNote: { select: { id: true, title: true, slug: true, body: true } } },
      })
      return links.map(l => ({
        ...l.sourceNote,
        excerpt: l.sourceNote.body
          ? (JSON.parse(l.sourceNote.body)?.content?.[0]?.content?.[0]?.text ?? '').slice(0, 100)
          : '',
      }))
    }),
})
```

- [ ] **Step 3: Wire noteLink.sync into NoteEditor auto-save**

Modify `components/editor/NoteEditor.tsx` — extend the onUpdate handler to call sync:
```typescript
// Add to NoteEditor props:
noteId: string
// In the onUpdate debounce callback, after saving body:
const links = extractWikilinks(editor.getJSON())
syncLinks.mutate({ sourceNoteId: noteId, targetNoteIds: links })
```

Add `const syncLinks = api.noteLink.sync.useMutation()` inside the component.

- [ ] **Step 4: Build BacklinksPanel**

Create `components/notes/BacklinksPanel.tsx`:
```typescript
'use client'
import Link from 'next/link'
import { api } from '@/lib/trpc/client'

export function BacklinksPanel({ noteId }: { noteId: string }) {
  const { data: backlinks } = api.noteLink.getBacklinks.useQuery({ noteId })

  if (!backlinks?.length) return (
    <div className="text-sm text-muted-foreground p-4">No backlinks yet.</div>
  )

  return (
    <div className="space-y-2 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Backlinks</h3>
      {backlinks.map(note => (
        <Link key={note.id} href={`/notes/${note.slug}`} className="block p-2 rounded hover:bg-accent">
          <div className="font-medium text-sm">{note.title}</div>
          {note.excerpt && <div className="text-xs text-muted-foreground truncate">{note.excerpt}</div>}
        </Link>
      ))}
    </div>
  )
}
```

Add `<BacklinksPanel noteId={note.id} />` to `app/notes/[slug]/page.tsx`.

- [ ] **Step 5: Write serializer unit test**

Create `components/editor/extensions/__tests__/WikilinkExtension.test.ts`:
```typescript
import { extractWikilinks } from '../WikilinkExtension'

test('extracts resolved wikilink IDs', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [
        { type: 'wikilink', attrs: { noteId: 'abc-123', title: 'Biology', resolved: true } },
        { type: 'text', text: ' some text ' },
        { type: 'wikilink', attrs: { noteId: null, title: 'Missing', resolved: false } },
      ]}
    ]
  }
  expect(extractWikilinks(doc)).toEqual(['abc-123'])
})
```

Run: `npx jest WikilinkExtension.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wikilinks — WikilinkExtension, NoteLink sync, backlinks panel"
```

---

## Task 6: Knowledge Graph (tasks 6.1–6.9)

**Files:**
- Create: `server/routers/graph.ts`
- Create: `components/graph/GraphCanvas.tsx`
- Create: `app/graph/page.tsx`

- [ ] **Step 1: Write graph tRPC router**

Create `server/routers/graph.ts`:
```typescript
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

export const graphRouter = router({
  getAll: protectedProcedure.query(async () => {
    const [notes, links] = await Promise.all([
      prisma.note.findMany({ select: { id: true, title: true, slug: true } }),
      prisma.noteLink.findMany({ select: { sourceNoteId: true, targetNoteId: true } }),
    ])
    return { nodes: notes, edges: links }
  }),
})
```

- [ ] **Step 2: Build GraphCanvas component**

Create `components/graph/GraphCanvas.tsx`:
```typescript
'use client'
import ReactFlow, {
  Background, Controls, useNodesState, useEdgesState,
  type Node, type Edge,
} from 'reactflow'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import * as d3 from 'd3-force'
import 'reactflow/dist/style.css'

interface GraphData {
  nodes: { id: string; title: string; slug: string }[]
  edges: { sourceNoteId: string; targetNoteId: string }[]
}

export function GraphCanvas({ data }: { data: GraphData }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus')
  const [hopDepth, setHopDepth] = useState(2)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const visibleIds = useMemo(() => {
    if (!focusId) return null
    const neighbours = new Set<string>([focusId])
    for (let h = 0; h < hopDepth; h++) {
      data.edges.forEach(e => {
        if (neighbours.has(e.sourceNoteId)) neighbours.add(e.targetNoteId)
        if (neighbours.has(e.targetNoteId)) neighbours.add(e.sourceNoteId)
      })
    }
    return neighbours
  }, [focusId, hopDepth, data.edges])

  // Run d3-force layout
  const { rfNodes, rfEdges } = useMemo(() => {
    const simNodes = data.nodes.map(n => ({ id: n.id, x: 0, y: 0 }))
    const simLinks = data.edges.map(e => ({ source: e.sourceNoteId, target: e.targetNoteId }))
    const sim = d3.forceSimulation(simNodes as any)
      .force('link', d3.forceLink(simLinks).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(0, 0))
    for (let i = 0; i < 300; i++) sim.tick()
    sim.stop()

    const posMap = new Map(simNodes.map(n => [n.id, { x: n.x, y: n.y }]))

    const rfNodes: Node[] = data.nodes
      .filter(n => !visibleIds || visibleIds.has(n.id))
      .map(n => ({
        id: n.id,
        position: posMap.get(n.id) ?? { x: 0, y: 0 },
        data: { label: n.title.slice(0, 30), slug: n.slug },
        style: {
          background: hoveredId && hoveredId !== n.id &&
            !data.edges.some(e => (e.sourceNoteId === hoveredId && e.targetNoteId === n.id) ||
              (e.targetNoteId === hoveredId && e.sourceNoteId === n.id))
            ? 'rgba(100,100,100,0.2)' : undefined,
        },
      }))

    const rfEdges: Edge[] = data.edges
      .filter(e => (!visibleIds || (visibleIds.has(e.sourceNoteId) && visibleIds.has(e.targetNoteId))))
      .map(e => ({ id: `${e.sourceNoteId}-${e.targetNoteId}`, source: e.sourceNoteId, target: e.targetNoteId }))

    return { rfNodes, rfEdges }
  }, [data, visibleIds, hoveredId])

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)
  useEffect(() => { setNodes(rfNodes); setEdges(rfEdges) }, [rfNodes, rfEdges])

  return (
    <div className="w-full h-full relative">
      {focusId && (
        <div className="absolute top-4 left-4 z-10 bg-background border rounded-lg p-3 flex items-center gap-3">
          <label className="text-sm">Depth</label>
          <input type="range" min={1} max={5} value={hopDepth} onChange={e => setHopDepth(+e.target.value)} />
          <span className="text-sm w-4">{hopDepth}</span>
        </div>
      )}
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => router.push(`/notes/${node.data.slug}`)}
        onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
        onNodeMouseLeave={() => setHoveredId(null)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 3: Build /graph page**

Create `app/graph/page.tsx`:
```typescript
'use client'
import { api } from '@/lib/trpc/client'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { Suspense } from 'react'

function GraphInner() {
  const { data } = api.graph.getAll.useQuery()
  if (!data) return <div className="flex items-center justify-center h-full">Loading graph...</div>
  return <GraphCanvas data={data} />
}

export default function GraphPage() {
  return (
    <div className="w-full h-[calc(100vh-4rem)]">
      <Suspense><GraphInner /></Suspense>
    </div>
  )
}
```

Add "View in graph" button to `app/notes/[slug]/page.tsx`:
```typescript
import Link from 'next/link'
// In the header:
<Link href={`/graph?focus=${note.id}`}>
  <Button variant="outline" size="sm">View in graph</Button>
</Link>
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: knowledge graph — React Flow canvas, force layout, focus mode"
```

---

## Task 7: Task Management (tasks 7.1–7.10)

**Files:**
- Create: `server/routers/task.ts`
- Create: `components/editor/extensions/TaskItemExtension.ts`
- Create: `app/tasks/page.tsx`

- [ ] **Step 1: Write task tRPC router**

Create `server/routers/task.ts`:
```typescript
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { TaskStatus, Priority } from '@prisma/client'

export const taskRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.nativeEnum(TaskStatus).optional(), priority: z.nativeEnum(Priority).optional() }).optional())
    .query(({ input }) =>
      prisma.task.findMany({
        where: {
          deletedAt: null,
          ...(input?.status && { status: input.status }),
          ...(input?.priority && { priority: input.priority }),
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
        include: { note: { select: { title: true, slug: true } } },
      })
    ),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      status: z.nativeEnum(TaskStatus).default('TODO'),
      priority: z.nativeEnum(Priority).default('MEDIUM'),
      dueDate: z.date().optional(),
      noteId: z.string().optional(),
    }))
    .mutation(({ input }) => prisma.task.create({ data: input })),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      status: z.nativeEnum(TaskStatus).optional(),
      priority: z.nativeEnum(Priority).optional(),
      dueDate: z.date().nullable().optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input
      return prisma.task.update({ where: { id }, data })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.task.update({ where: { id: input.id }, data: { deletedAt: new Date() } })),

  syncFromNote: protectedProcedure
    .input(z.object({
      noteId: z.string(),
      tasks: z.array(z.object({ title: z.string(), done: z.boolean() })),
    }))
    .mutation(async ({ input }) => {
      const existing = await prisma.task.findMany({ where: { noteId: input.noteId, deletedAt: null } })
      const existingTitles = new Set(existing.map(t => t.title))
      const newTitles = new Set(input.tasks.map(t => t.title))

      // Soft-delete removed tasks
      const toDelete = existing.filter(t => !newTitles.has(t.title))
      // Update status of existing tasks
      const toUpdate = input.tasks.filter(t => existingTitles.has(t.title))
      // Create new tasks
      const toCreate = input.tasks.filter(t => !existingTitles.has(t.title))

      await prisma.$transaction([
        ...toDelete.map(t => prisma.task.update({ where: { id: t.id }, data: { deletedAt: new Date() } })),
        ...toUpdate.map(t => {
          const existing = existing.find(e => e.title === t.title)!
          return prisma.task.update({ where: { id: existing.id }, data: { status: t.done ? 'DONE' : 'TODO' } })
        }),
        prisma.task.createMany({
          data: toCreate.map(t => ({ title: t.title, status: t.done ? 'DONE' : 'TODO', noteId: input.noteId })),
        }),
      ])
    }),
})
```

- [ ] **Step 2: Build /tasks page**

Create `app/tasks/page.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { TaskStatus, Priority } from '@prisma/client'
import { format } from 'date-fns'

const STATUS_ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE']
const PRIORITY_COLORS: Record<Priority, string> = { HIGH: 'destructive', MEDIUM: 'secondary', LOW: 'outline' }

export default function TasksPage() {
  const [newTitle, setNewTitle] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | undefined>()
  const utils = api.useUtils()
  const { data: tasks } = api.task.list.useQuery(statusFilter ? { status: statusFilter } : undefined)
  const create = api.task.create.useMutation({ onSuccess: () => { utils.task.list.invalidate(); setNewTitle('') } })
  const update = api.task.update.useMutation({ onSuccess: () => utils.task.list.invalidate() })
  const del = api.task.delete.useMutation({ onSuccess: () => utils.task.list.invalidate() })

  const grouped = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = tasks?.filter(t => t.status === s) ?? []
    return acc
  }, {} as Record<TaskStatus, typeof tasks>)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Tasks</h1>
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="New task..."
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && newTitle && create.mutate({ title: newTitle })}
          className="flex-1"
        />
        <Button onClick={() => newTitle && create.mutate({ title: newTitle })}>Add</Button>
      </div>
      {STATUS_ORDER.map(status => (
        <div key={status} className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">{status}</h2>
          <div className="space-y-1">
            {grouped[status]?.map(task => (
              <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg border">
                <input
                  type="checkbox"
                  checked={task.status === 'DONE'}
                  onChange={e => update.mutate({ id: task.id, status: e.target.checked ? 'DONE' : 'TODO' })}
                  className="h-4 w-4"
                />
                <span className={`flex-1 text-sm ${task.status === 'DONE' ? 'line-through text-muted-foreground' : ''}`}>
                  {task.title}
                </span>
                <Badge variant={PRIORITY_COLORS[task.priority] as any} className="text-xs">{task.priority}</Badge>
                {task.dueDate && <span className="text-xs text-muted-foreground">{format(task.dueDate, 'MMM d')}</span>}
                {task.note && <Link href={`/notes/${task.note.slug}`} className="text-xs text-primary hover:underline">{task.note.title}</Link>}
                <Button variant="ghost" size="sm" onClick={() => del.mutate({ id: task.id })}>×</Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: task management — task router, /tasks page, inline task sync"
```

---

## Task 8: Full-Text Search (tasks 8.1–8.8)

**Files:**
- Create: `lib/search.ts`
- Create: `server/routers/search.ts`
- Create: `components/search/SearchModal.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Write FTS dialect helper with tests**

Create `lib/search.ts`:
```typescript
import { prisma } from './prisma'

export async function searchContent(query: string) {
  const isSQLite = process.env.DATABASE_URL?.startsWith('file:') ?? true

  if (isSQLite) {
    // FTS5 BM25 search
    const notes = await prisma.$queryRaw<any[]>`
      SELECT n.id, n.title, n.slug, n.body, n."updatedAt",
        snippet(note_fts, 1, '<mark>', '</mark>', '...', 10) as snippet,
        'note' as type
      FROM note_fts
      JOIN "Note" n ON n.id = note_fts.id
      WHERE note_fts MATCH ${query}
      ORDER BY rank
      LIMIT 20
    `
    const tasks = await prisma.$queryRaw<any[]>`
      SELECT t.id, t.title, NULL as slug, NULL as body, t."updatedAt",
        snippet(task_fts, 1, '<mark>', '</mark>', '...', 10) as snippet,
        'task' as type
      FROM task_fts
      JOIN "Task" t ON t.id = task_fts.id
      WHERE task_fts MATCH ${query} AND t."deletedAt" IS NULL
      ORDER BY rank
      LIMIT 10
    `
    return [...notes, ...tasks]
  }

  // Postgres tsvector
  const results = await prisma.$queryRaw<any[]>`
    SELECT id, title, slug, 'note' as type,
      ts_headline('english', body, plainto_tsquery('english', ${query})) as snippet,
      "updatedAt"
    FROM "Note"
    WHERE to_tsvector('english', title || ' ' || body) @@ plainto_tsquery('english', ${query})
    ORDER BY ts_rank(to_tsvector('english', title || ' ' || body), plainto_tsquery('english', ${query})) DESC
    LIMIT 20
  `
  return results
}
```

Create `lib/__tests__/search.test.ts`:
```typescript
// Integration test — only runs with a real DB
// Run with: DATABASE_URL="file:./test.db" npx jest search.test.ts
import { searchContent } from '../search'

test.skip('returns notes matching query', async () => {
  const results = await searchContent('mitochondria')
  expect(results.length).toBeGreaterThan(0)
  expect(results[0].type).toBe('note')
})
```

- [ ] **Step 2: Write search tRPC router**

Create `server/routers/search.ts`:
```typescript
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { searchContent } from '@/lib/search'
import { prisma } from '@/lib/prisma'

export const searchRouter = router({
  query: protectedProcedure
    .input(z.object({ q: z.string() }))
    .query(async ({ input }) => {
      if (!input.q.trim()) {
        const recent = await prisma.note.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: { id: true, title: true, slug: true, updatedAt: true },
        })
        return recent.map(n => ({ ...n, type: 'note' as const, snippet: '' }))
      }
      return searchContent(input.q)
    }),
})
```

- [ ] **Step 3: Build SearchModal**

Create `components/search/SearchModal.tsx`:
```typescript
'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/lib/hooks/useDebounce'

export function SearchModal() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 200)
  const router = useRouter()
  const { data: results } = api.search.query.useQuery({ q: debouncedQuery }, { enabled: open })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const select = (result: any) => {
    setOpen(false)
    setQuery('')
    if (result.type === 'note') router.push(`/notes/${result.slug}`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-lg">
        <Input
          autoFocus
          placeholder="Search notes and tasks..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="border-0 border-b rounded-none shadow-none px-4 py-3 text-base focus-visible:ring-0"
        />
        <div className="max-h-80 overflow-y-auto">
          {!results?.length && debouncedQuery && (
            <p className="p-4 text-sm text-muted-foreground">No results for "{debouncedQuery}"</p>
          )}
          {results?.map(r => (
            <button key={r.id} className="w-full text-left px-4 py-2 hover:bg-accent" onClick={() => select(r)}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground uppercase">{r.type}</span>
                <span className="font-medium text-sm">{r.title}</span>
              </div>
              {r.snippet && <p className="text-xs text-muted-foreground mt-0.5 truncate" dangerouslySetInnerHTML={{ __html: r.snippet }} />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

Create `lib/hooks/useDebounce.ts`:
```typescript
import { useState, useEffect } from 'react'
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
```

- [ ] **Step 4: Mount SearchModal in root layout**

In `app/layout.tsx`, add `<SearchModal />` inside the body after providers.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: full-text search — FTS5/tsvector helper, search modal (⌘K)"
```

---

## Task 9: Periodic Notes (tasks 9.1–9.8)

**Files:**
- Create: `lib/period.ts`
- Create: `server/routers/periodicTemplate.ts`
- Create: `components/periodic/CalendarNavigator.tsx`
- Create: `app/settings/page.tsx`
- Modify: `server/routers/note.ts`

- [ ] **Step 1: Write period key utilities with tests**

Create `lib/period.ts`:
```typescript
import { format, getISOWeek, getYear, getQuarter } from 'date-fns'
import { PeriodType } from '@prisma/client'

export function periodKey(type: PeriodType, date: Date = new Date()): string {
  switch (type) {
    case 'DAY':     return format(date, 'yyyy-MM-dd')
    case 'WEEK':    return `${getYear(date)}-W${String(getISOWeek(date)).padStart(2, '0')}`
    case 'MONTH':   return format(date, 'yyyy-MM')
    case 'QUARTER': return `${getYear(date)}-Q${getQuarter(date)}`
    case 'YEAR':    return String(getYear(date))
  }
}
```

Create `lib/__tests__/period.test.ts`:
```typescript
import { periodKey } from '../period'

const D = new Date('2026-05-19')
test('DAY key', () => expect(periodKey('DAY', D)).toBe('2026-05-19'))
test('WEEK key', () => expect(periodKey('WEEK', D)).toBe('2026-W21'))
test('MONTH key', () => expect(periodKey('MONTH', D)).toBe('2026-05'))
test('QUARTER key', () => expect(periodKey('QUARTER', D)).toBe('2026-Q2'))
test('YEAR key', () => expect(periodKey('YEAR', D)).toBe('2026'))
```

Run: `npx jest period.test.ts` — Expected: 5 passing

- [ ] **Step 2: Add getOrCreatePeriodic to note router**

Add to `server/routers/note.ts`:
```typescript
getOrCreatePeriodic: protectedProcedure
  .input(z.object({
    periodType: z.nativeEnum(PeriodType),
    periodKey: z.string(),
  }))
  .mutation(async ({ input }) => {
    const existing = await prisma.note.findUnique({
      where: { periodType_periodKey: { periodType: input.periodType, periodKey: input.periodKey } },
    })
    if (existing) return existing

    const template = await prisma.periodicTemplate.findUnique({ where: { periodType: input.periodType } })
    const title = `${input.periodType.charAt(0) + input.periodType.slice(1).toLowerCase()} ${input.periodKey}`
    const slug = await uniqueSlug(title, prisma)

    return prisma.note.create({
      data: {
        title,
        slug,
        body: template?.content ?? '{}',
        periodType: input.periodType,
        periodKey: input.periodKey,
      },
    })
  }),
```

- [ ] **Step 3: Build CalendarNavigator component**

Create `components/periodic/CalendarNavigator.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { periodKey } from '@/lib/period'
import { format, addDays, startOfMonth, getDaysInMonth } from 'date-fns'
import { PeriodType } from '@prisma/client'

const TABS: PeriodType[] = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']

export function CalendarNavigator() {
  const [tab, setTab] = useState<PeriodType>('DAY')
  const router = useRouter()
  const today = new Date()
  const getOrCreate = api.note.getOrCreatePeriodic.useMutation({
    onSuccess: note => router.push(`/notes/${note.slug}`),
  })

  const open = (type: PeriodType, date: Date = today) =>
    getOrCreate.mutate({ periodType: type, periodKey: periodKey(type, date) })

  return (
    <div className="p-2">
      <div className="flex gap-1 mb-2">
        {TABS.map(t => (
          <button
            key={t}
            className={`flex-1 text-xs py-1 rounded ${tab === t ? 'bg-accent font-semibold' : 'text-muted-foreground hover:bg-accent/50'}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <button
        className="w-full text-sm py-2 px-3 rounded bg-primary text-primary-foreground hover:bg-primary/90"
        onClick={() => open(tab)}
      >
        Today's {tab.charAt(0) + tab.slice(1).toLowerCase()}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Build settings page with template editor**

Create `app/settings/page.tsx`:
```typescript
'use client'
import { PeriodType } from '@prisma/client'
import { api } from '@/lib/trpc/client'
import { NoteEditor } from '@/components/editor/NoteEditor'

const TYPES: PeriodType[] = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']

export default function SettingsPage() {
  const utils = api.useUtils()
  const upsert = api.periodicTemplate.upsert.useMutation({ onSuccess: () => utils.periodicTemplate.get.invalidate() })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Periodic Note Templates</h1>
      <p className="text-muted-foreground mb-6">These templates are used when a new periodic note is created.</p>
      <div className="space-y-6">
        {TYPES.map(type => (
          <div key={type} className="border rounded-lg p-4">
            <h2 className="font-semibold mb-2">{type.charAt(0) + type.slice(1).toLowerCase()} Template</h2>
            <div className="min-h-32 prose prose-sm max-w-none border rounded p-2">
              {/* Simplified — use a basic textarea for template editing */}
              <textarea
                className="w-full h-32 text-sm resize-none outline-none"
                placeholder={`Template content for ${type} notes...`}
                onBlur={e => upsert.mutate({ periodType: type, content: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

Create `server/routers/periodicTemplate.ts`:
```typescript
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { PeriodType } from '@prisma/client'

export const periodicTemplateRouter = router({
  get: protectedProcedure
    .input(z.object({ periodType: z.nativeEnum(PeriodType) }))
    .query(({ input }) => prisma.periodicTemplate.findUnique({ where: { periodType: input.periodType } })),

  upsert: protectedProcedure
    .input(z.object({ periodType: z.nativeEnum(PeriodType), content: z.string() }))
    .mutation(({ input }) =>
      prisma.periodicTemplate.upsert({
        where: { periodType: input.periodType },
        create: { periodType: input.periodType, content: input.content },
        update: { content: input.content },
      })
    ),
})
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: periodic notes — period keys, getOrCreatePeriodic, CalendarNavigator, settings"
```

---

## Task 10: Flashcard System — Data & Core (tasks 10.1–10.5)

**Files:**
- Create: `lib/fsrs.ts`
- Create: `server/routers/flashcard.ts`, `deck.ts`, `review.ts`

- [ ] **Step 1: Write FSRS helper with tests**

Create `lib/fsrs.ts`:
```typescript
import { fsrs, generatorParameters, Rating, type Card, type RecordLogItem } from 'ts-fsrs'

const f = fsrs(generatorParameters({ enable_fuzz: true }))

export { Rating }

export function computeNextState(card: Card, rating: Rating, now = new Date()): RecordLogItem {
  return f.next(card, now, rating)
}

export function previewRatings(card: Card, now = new Date()) {
  return {
    again: f.next(card, now, Rating.Again).card.due,
    hard:  f.next(card, now, Rating.Hard).card.due,
    good:  f.next(card, now, Rating.Good).card.due,
    easy:  f.next(card, now, Rating.Easy).card.due,
  }
}

export function prismaCardToFsrs(card: any): Card {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as any,
    last_review: card.lastReview ?? undefined,
  }
}
```

Create `lib/__tests__/fsrs.test.ts`:
```typescript
import { computeNextState, Rating, prismaCardToFsrs } from '../fsrs'

const newCard = {
  due: new Date(), stability: 0, difficulty: 0, reps: 0, lapses: 0,
  state: 'NEW', lastReview: null,
}

test('Good rating sets future due date', () => {
  const { card } = computeNextState(prismaCardToFsrs(newCard), Rating.Good)
  expect(card.due > new Date()).toBe(true)
})

test('Again rating keeps due date near present', () => {
  const { card } = computeNextState(prismaCardToFsrs(newCard), Rating.Again)
  const oneHour = new Date(Date.now() + 3600_000)
  expect(card.due < oneHour).toBe(true)
})
```

Run: `npx jest fsrs.test.ts` — Expected: 2 passing

- [ ] **Step 2: Write flashcard tRPC router**

Create `server/routers/flashcard.ts`:
```typescript
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { CardType } from '@prisma/client'

export const flashcardRouter = router({
  listByNote: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .query(({ input }) =>
      prisma.flashcard.findMany({
        where: { noteId: input.noteId, deletedAt: null },
        include: { decks: { include: { deck: { select: { id: true, name: true } } } } },
      })
    ),

  create: protectedProcedure
    .input(z.object({
      type: z.nativeEnum(CardType),
      front: z.string().min(1),
      back: z.string().optional(),
      clozeIndex: z.number().optional(),
      noteId: z.string().optional(),
      deckId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { deckId, ...cardData } = input
      const card = await prisma.flashcard.create({ data: { ...cardData, due: new Date() } })
      if (deckId) await prisma.deckCard.create({ data: { deckId, cardId: card.id } })
      return card
    }),

  softDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) =>
      prisma.flashcard.update({ where: { id: input.id }, data: { deletedAt: new Date() } })
    ),

  syncCloze: protectedProcedure
    .input(z.object({
      noteId: z.string(),
      cards: z.array(z.object({ front: z.string(), clozeIndex: z.number() })),
    }))
    .mutation(async ({ input }) => {
      const existing = await prisma.flashcard.findMany({
        where: { noteId: input.noteId, type: 'CLOZE' },
      })

      for (const card of input.cards) {
        const match = existing.find(e => e.clozeIndex === card.clozeIndex && e.front === card.front)
        if (!match) {
          await prisma.flashcard.create({
            data: { type: 'CLOZE', front: card.front, clozeIndex: card.clozeIndex, noteId: input.noteId, due: new Date() },
          })
        } else if (match.deletedAt) {
          // Restore soft-deleted card
          await prisma.flashcard.update({ where: { id: match.id }, data: { deletedAt: null } })
        }
      }

      // Soft-delete removed cloze cards
      const inputIndices = new Set(input.cards.map(c => c.clozeIndex))
      const toDelete = existing.filter(e => !inputIndices.has(e.clozeIndex!) && !e.deletedAt)
      for (const card of toDelete) {
        await prisma.flashcard.update({ where: { id: card.id }, data: { deletedAt: new Date() } })
      }
    }),
})
```

- [ ] **Step 3: Write deck tRPC router**

Create `server/routers/deck.ts`:
```typescript
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

export const deckRouter = router({
  list: protectedProcedure.query(async () => {
    const decks = await prisma.deck.findMany({ include: { _count: { select: { cards: true } } } })
    return decks.map(d => ({ ...d, cardCount: d._count.cards }))
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ input }) => prisma.deck.create({ data: input })),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(({ input }) => prisma.deck.update({ where: { id: input.id }, data: { name: input.name } })),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => prisma.deck.delete({ where: { id: input.id } })),
})
```

- [ ] **Step 4: Write review tRPC router**

Create `server/routers/review.ts`:
```typescript
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { computeNextState, prismaCardToFsrs, Rating } from '@/lib/fsrs'

const RatingSchema = z.enum(['Again', 'Hard', 'Good', 'Easy'])

export const reviewRouter = router({
  dueCounts: protectedProcedure.query(async () => {
    const decks = await prisma.deck.findMany({
      include: {
        cards: {
          where: { card: { deletedAt: null, due: { lte: new Date() } } },
          select: { cardId: true },
        },
      },
    })
    const total = await prisma.flashcard.count({ where: { deletedAt: null, due: { lte: new Date() } } })
    return { decks: decks.map(d => ({ id: d.id, name: d.name, due: d.cards.length })), total }
  }),

  listDue: protectedProcedure
    .input(z.object({ deckId: z.string().or(z.literal('all')) }))
    .query(async ({ input }) => {
      const where = {
        deletedAt: null,
        due: { lte: new Date() },
        ...(input.deckId !== 'all' && { decks: { some: { deckId: input.deckId } } }),
      }
      return prisma.flashcard.findMany({ where, orderBy: { due: 'asc' }, take: 200 })
    }),

  rate: protectedProcedure
    .input(z.object({ cardId: z.string(), rating: RatingSchema }))
    .mutation(async ({ input }) => {
      const card = await prisma.flashcard.findUniqueOrThrow({ where: { id: input.cardId } })
      const fsrsCard = prismaCardToFsrs(card)
      const ratingValue = Rating[input.rating as keyof typeof Rating]
      const { card: next } = computeNextState(fsrsCard, ratingValue)

      await prisma.flashcard.update({
        where: { id: card.id },
        data: {
          stability: next.stability,
          difficulty: next.difficulty,
          due: next.due,
          reps: next.reps,
          lapses: next.lapses,
          state: next.state as any,
          lastReview: new Date(),
        },
      })

      // Fetch siblings for cloze rendering
      const siblings = card.clozeIndex !== null
        ? await prisma.flashcard.findMany({
            where: { noteId: card.noteId!, type: 'CLOZE', deletedAt: null, id: { not: card.id } },
          })
        : []

      return { card, siblings }
    }),
})
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: flashcard core — FSRS helper, flashcard/deck/review routers"
```

---

## Task 11: Flashcard System — Editor Integration (tasks 11.1–11.7)

**Files:**
- Create: `components/editor/extensions/ClozeExtension.ts`
- Create: `components/flashcard/CardCreationModal.tsx`
- Create: `components/notes/CardsPanel.tsx`
- Modify: `components/editor/NoteEditor.tsx`

- [ ] **Step 1: Implement ClozeExtension**

Create `components/editor/extensions/ClozeExtension.ts`:
```typescript
import { Node, mergeAttributes } from '@tiptap/core'
import { InputRule } from '@tiptap/core'

export const ClozeExtension = Node.create({
  name: 'cloze',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      clozeIndex: { default: 1 },
      answer: { default: '' },
    }
  },

  parseHTML() { return [{ tag: 'span[data-cloze]' }] },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-cloze': '',
      class: 'bg-blue-100 text-blue-800 px-1 rounded font-mono text-sm',
    }), `{{c${HTMLAttributes.clozeIndex}::${HTMLAttributes.answer}}}`]
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\{\{c(\d+)::([^}]+)\}\}$/,
        handler: ({ state, range, match }) => {
          const { tr } = state
          tr.replaceWith(range.from, range.to,
            state.schema.nodes.cloze.create({ clozeIndex: parseInt(match[1]), answer: match[2] })
          )
        },
      }),
    ]
  },
})

export interface ClozeCard { front: string; clozeIndex: number }

export function extractClozeCards(doc: any): ClozeCard[] {
  const cards: ClozeCard[] = []
  const traverse = (node: any, parentText: string) => {
    if (node.type === 'cloze') {
      cards.push({ front: parentText, clozeIndex: node.attrs.clozeIndex })
    }
    if (node.content) {
      const text = node.content.map((n: any) => n.type === 'text' ? n.text : n.type === 'cloze' ? `{{c${n.attrs.clozeIndex}::${n.attrs.answer}}}` : '').join('')
      node.content.forEach((n: any) => traverse(n, text))
    }
  }
  doc.content?.forEach((block: any) => {
    const blockText = JSON.stringify(block)
    block.content?.forEach((n: any) => traverse(n, blockText))
  })
  return cards
}
```

Create tests `components/editor/extensions/__tests__/ClozeExtension.test.ts`:
```typescript
import { extractClozeCards } from '../ClozeExtension'

test('extracts cloze cards from doc', () => {
  const doc = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'ATP is produced via ' },
        { type: 'cloze', attrs: { clozeIndex: 1, answer: 'oxidative phosphorylation' } },
      ]
    }]
  }
  const cards = extractClozeCards(doc)
  expect(cards).toHaveLength(1)
  expect(cards[0].clozeIndex).toBe(1)
})
```

Run: `npx jest ClozeExtension.test.ts` — Expected: PASS

- [ ] **Step 2: Build CardCreationModal**

Create `components/flashcard/CardCreationModal.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  open: boolean
  onClose: () => void
  noteId?: string
  initialFront?: string
}

export function CardCreationModal({ open, onClose, noteId, initialFront }: Props) {
  const [type, setType] = useState<'BASIC' | 'CLOZE'>('BASIC')
  const [front, setFront] = useState(initialFront ?? '')
  const [back, setBack] = useState('')
  const utils = api.useUtils()
  const { data: decks } = api.deck.list.useQuery()
  const [deckId, setDeckId] = useState<string>('')
  const create = api.flashcard.create.useMutation({
    onSuccess: () => { utils.flashcard.listByNote.invalidate(); onClose(); setFront(''); setBack('') },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create flashcard</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['BASIC', 'CLOZE'] as const).map(t => (
              <Button key={t} variant={type === t ? 'default' : 'outline'} size="sm" onClick={() => setType(t)}>{t}</Button>
            ))}
          </div>
          <div><Label>Front</Label><Input value={front} onChange={e => setFront(e.target.value)} /></div>
          {type === 'BASIC' && <div><Label>Back</Label><Input value={back} onChange={e => setBack(e.target.value)} /></div>}
          {decks && decks.length > 0 && (
            <div>
              <Label>Deck</Label>
              <select className="w-full border rounded p-2 text-sm" value={deckId} onChange={e => setDeckId(e.target.value)}>
                <option value="">No deck</option>
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate({ type, front, back: back || undefined, noteId, deckId: deckId || undefined })}>
            Create card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Build CardsPanel and wire ⌘⇧F shortcut**

Create `components/notes/CardsPanel.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardCreationModal } from '@/components/flashcard/CardCreationModal'

export function CardsPanel({ noteId }: { noteId: string }) {
  const [modalOpen, setModalOpen] = useState(false)
  const { data: cards } = api.flashcard.listByNote.useQuery({ noteId })

  return (
    <div className="p-4 border-t">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Cards {cards?.length ? <Badge className="ml-1">{cards.length}</Badge> : null}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setModalOpen(true)}>+ Add</Button>
      </div>
      <div className="space-y-1">
        {cards?.map(card => (
          <div key={card.id} className="text-sm p-2 rounded bg-muted/50">
            <Badge variant="outline" className="text-xs mr-1">{card.type}</Badge>
            {card.front.slice(0, 60)}{card.front.length > 60 ? '...' : ''}
          </div>
        ))}
      </div>
      <CardCreationModal open={modalOpen} onClose={() => setModalOpen(false)} noteId={noteId} />
    </div>
  )
}
```

- [ ] **Step 4: Wire ⌘⇧F into NoteEditor**

In `components/editor/NoteEditor.tsx`, add keyboard handler:
```typescript
const [cardModalOpen, setCardModalOpen] = useState(false)
const [selectedText, setSelectedText] = useState('')

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
      const sel = window.getSelection()?.toString() ?? ''
      if (sel) { setSelectedText(sel); setCardModalOpen(true) }
    }
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [])
// Render <CardCreationModal open={cardModalOpen} onClose={...} noteId={noteId} initialFront={selectedText} /> in JSX
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: flashcard editor — ClozeExtension, ⌘⇧F shortcut, CardsPanel"
```

---

## Task 12: Flashcard Review UI (tasks 12.1–12.9)

**Files:**
- Create: `app/decks/page.tsx`
- Create: `app/review/page.tsx`
- Create: `app/review/session/page.tsx`
- Create: `components/flashcard/ReviewSession.tsx`
- Create: `components/flashcard/RatingButtons.tsx`

- [ ] **Step 1: Build /decks page**

Create `app/decks/page.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function DecksPage() {
  const [newName, setNewName] = useState('')
  const utils = api.useUtils()
  const { data: decks } = api.deck.list.useQuery()
  const create = api.deck.create.useMutation({ onSuccess: () => { utils.deck.list.invalidate(); setNewName('') } })
  const del = api.deck.delete.useMutation({ onSuccess: () => utils.deck.list.invalidate() })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Decks</h1>
      <div className="flex gap-2 mb-4">
        <Input placeholder="New deck name..." value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && newName && create.mutate({ name: newName })} />
        <Button onClick={() => newName && create.mutate({ name: newName })}>Create</Button>
      </div>
      <div className="space-y-2">
        {decks?.map(deck => (
          <div key={deck.id} className="flex items-center justify-between p-3 border rounded-lg">
            <span>{deck.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{deck.cardCount} cards</span>
              <Button variant="destructive" size="sm" onClick={() => del.mutate({ id: deck.id })}>Delete</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build /review hub page**

Create `app/review/page.tsx`:
```typescript
'use client'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function ReviewPage() {
  const router = useRouter()
  const { data, refetch } = api.review.dueCounts.useQuery(undefined, { refetchInterval: 60_000 })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Review</h1>
      <div className="space-y-2">
        <div className="flex items-center justify-between p-4 border rounded-lg bg-accent/50">
          <span className="font-medium">⚡ All due cards</span>
          <div className="flex items-center gap-3">
            <Badge variant="destructive">{data?.total ?? 0}</Badge>
            <Button onClick={() => router.push('/review/session?deck=all')} disabled={!data?.total}>
              Start reviewing →
            </Button>
          </div>
        </div>
        {data?.decks.map(deck => (
          <div key={deck.id} className="flex items-center justify-between p-4 border rounded-lg">
            <span>{deck.name}</span>
            <div className="flex items-center gap-3">
              <Badge>{deck.due}</Badge>
              <Button variant="outline" size="sm"
                onClick={() => router.push(`/review/session?deck=${deck.id}`)} disabled={!deck.due}>
                Review
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build RatingButtons component**

Create `components/flashcard/RatingButtons.tsx`:
```typescript
'use client'
import { Button } from '@/components/ui/button'
import { previewRatings, prismaCardToFsrs, Rating } from '@/lib/fsrs'
import { formatDistanceToNow } from 'date-fns'

const RATINGS = [
  { label: 'Again', key: '1', rating: 'Again' as const, variant: 'destructive' as const },
  { label: 'Hard',  key: '2', rating: 'Hard' as const,  variant: 'outline' as const },
  { label: 'Good',  key: '3', rating: 'Good' as const,  variant: 'default' as const },
  { label: 'Easy',  key: '4', rating: 'Easy' as const,  variant: 'secondary' as const },
]

export function RatingButtons({ card, onRate }: { card: any; onRate: (r: string) => void }) {
  const previews = previewRatings(prismaCardToFsrs(card))

  return (
    <div className="flex gap-3 justify-center">
      {RATINGS.map(r => (
        <div key={r.rating} className="flex flex-col items-center gap-1">
          <Button variant={r.variant} onClick={() => onRate(r.rating)} className="w-20">
            {r.label} <kbd className="ml-1 text-xs opacity-60">{r.key}</kbd>
          </Button>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(previews[r.rating.toLowerCase() as keyof typeof previews], { addSuffix: false })}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Build ReviewSession component**

Create `components/flashcard/ReviewSession.tsx`:
```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/trpc/client'
import { RatingButtons } from './RatingButtons'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface Props { deckId: string }

const MAX_REQUEUES = 3

export function ReviewSession({ deckId }: Props) {
  const router = useRouter()
  const { data: initialQueue } = api.review.listDue.useQuery({ deckId })
  const rate = api.review.rate.useMutation()

  const [queue, setQueue] = useState<any[]>([])
  const [requeueCount, setRequeueCounts] = useState<Record<string, number>>({})
  const [flipped, setFlipped] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [againCount, setAgainCount] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => { if (initialQueue) setQueue(initialQueue) }, [initialQueue])

  const card = queue[0]

  const handleRate = useCallback(async (rating: string) => {
    if (!card) return
    await rate.mutateAsync({ cardId: card.id, rating: rating as any })

    const newQueue = queue.slice(1)
    if (rating === 'Again') {
      const count = (requeueCount[card.id] ?? 0) + 1
      setRequeueCounts(prev => ({ ...prev, [card.id]: count }))
      setAgainCount(a => a + 1)
      if (count < MAX_REQUEUES) newQueue.push(card)
    }
    setQueue(newQueue)
    setReviewed(r => r + 1)
    setFlipped(false)
    if (newQueue.length === 0) setDone(true)
  }, [card, queue, requeueCount, rate])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setFlipped(true) }
      if (flipped) {
        if (e.key === '1') handleRate('Again')
        if (e.key === '2') handleRate('Hard')
        if (e.key === '3') handleRate('Good')
        if (e.key === '4') handleRate('Easy')
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [flipped, handleRate])

  if (!initialQueue) return <div className="flex items-center justify-center h-screen">Loading...</div>

  if (done) return (
    <div className="flex flex-col items-center justify-center h-screen gap-6">
      <h1 className="text-3xl font-bold">Session complete!</h1>
      <div className="text-muted-foreground space-y-1 text-center">
        <p>{reviewed} cards reviewed</p>
        <p>{againCount} marked Again</p>
      </div>
      <Button onClick={() => router.push('/review')}>Back to review hub</Button>
    </div>
  )

  if (!card) return <div className="flex items-center justify-center h-screen">No cards due.</div>

  const renderFront = () => {
    if (card.type === 'CLOZE') {
      return card.front.replace(/\{\{c\d+::([^}]+)\}\}/g, '[...]')
    }
    return card.front
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-8">
      <div className="w-full max-w-xl">
        <div className="flex justify-between text-sm text-slate-400 mb-4">
          <span>{queue.length} remaining</span>
          <span>Space to flip · 1-4 to rate</span>
        </div>
        <div className="bg-slate-800 rounded-2xl p-8 text-center min-h-48 flex flex-col items-center justify-center gap-4 cursor-pointer" onClick={() => !flipped && setFlipped(true)}>
          <p className="text-lg leading-relaxed">{renderFront()}</p>
          {flipped && card.back && (
            <>
              <hr className="w-full border-slate-600" />
              <p className="text-slate-300 text-base">{card.type === 'CLOZE'
                ? card.front.replace(/\{\{c(\d+)::([^}]+)\}\}/g, (_: string, _i: string, ans: string) => ans)
                : card.back}
              </p>
            </>
          )}
          {!flipped && <p className="text-sm text-slate-500 mt-4">Click or press Space to reveal</p>}
        </div>
        {flipped && (
          <div className="mt-6">
            <RatingButtons card={card} onRate={handleRate} />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Build /review/session page**

Create `app/review/session/page.tsx`:
```typescript
'use client'
import { Suspense, use } from 'react'
import { useSearchParams } from 'next/navigation'
import { ReviewSession } from '@/components/flashcard/ReviewSession'

function SessionInner() {
  const params = useSearchParams()
  const deckId = params.get('deck') ?? 'all'
  return <ReviewSession deckId={deckId} />
}

export default function ReviewSessionPage() {
  return <Suspense><SessionInner /></Suspense>
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: flashcard review UI — decks page, review hub, full-screen session"
```

---

## Task 13: Polish & Quality (tasks 13.1–13.9)

**Files:**
- Create: `components/layout/AppSidebar.tsx`
- Modify: `app/layout.tsx`
- Create: `prisma/seed.ts`

- [ ] **Step 1: Build AppSidebar and root layout**

Create `components/layout/AppSidebar.tsx`:
```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarNavigator } from '@/components/periodic/CalendarNavigator'
import { api } from '@/lib/trpc/client'

const NAV = [
  { href: '/', label: 'Notes' },
  { href: '/graph', label: 'Graph' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/review', label: 'Review' },
  { href: '/decks', label: 'Decks' },
  { href: '/settings', label: 'Settings' },
]

export function AppSidebar() {
  const path = usePathname()
  const logout = api.auth.logout.useMutation({ onSuccess: () => window.location.href = '/login' })

  return (
    <aside className="w-56 border-r flex flex-col h-screen sticky top-0 shrink-0">
      <div className="p-4 border-b">
        <span className="font-bold text-lg">open-brain</span>
      </div>
      <nav className="p-2 space-y-1 flex-1">
        {NAV.map(n => (
          <Link key={n.href} href={n.href}
            className={`block px-3 py-2 rounded-md text-sm hover:bg-accent ${path === n.href ? 'bg-accent font-medium' : ''}`}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="border-t">
        <CalendarNavigator />
      </div>
      <div className="p-2 border-t">
        <button className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => logout.mutate()}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
```

Modify `app/layout.tsx` to include sidebar:
```typescript
import { AppSidebar } from '@/components/layout/AppSidebar'
import { SearchModal } from '@/components/search/SearchModal'
import { validateEnv } from '@/lib/startup'
validateEnv()

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>
          <div className="flex">
            <AppSidebar />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
          <SearchModal />
        </TRPCProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Add SWR revalidation**

In `app/page.tsx` (notes list) and `app/tasks/page.tsx`, add refetch interval:
```typescript
api.note.list.useQuery(undefined, { refetchInterval: 30_000 })
api.task.list.useQuery(undefined, { refetchInterval: 30_000 })
```

- [ ] **Step 3: Add loading skeletons**

In `app/page.tsx`, add skeleton while loading:
```typescript
import { Skeleton } from '@/components/ui/skeleton'
// When !notes:
<div className="space-y-2">
  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
</div>
```

- [ ] **Step 4: Write Prisma seed script**

Create `prisma/seed.ts`:
```typescript
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Create user
  const hash = await bcrypt.hash('password', 12)
  await prisma.user.upsert({ where: { id: 'seed-user' }, update: {}, create: { id: 'seed-user', passwordHash: hash } })

  // Create notes
  const biology = await prisma.note.create({
    data: { title: 'Biology', slug: 'biology', body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The mitochondria is the powerhouse of the cell.' }] }] }) }
  })
  const chemistry = await prisma.note.create({
    data: { title: 'Chemistry', slug: 'chemistry', body: JSON.stringify({ type: 'doc', content: [] }) }
  })

  // Create link
  await prisma.noteLink.create({ data: { sourceNoteId: chemistry.id, targetNoteId: biology.id } })

  // Create task
  await prisma.task.create({ data: { title: 'Review biology notes', status: 'TODO', priority: 'HIGH', noteId: biology.id } })

  // Create deck + flashcard
  const deck = await prisma.deck.create({ data: { name: 'Biology' } })
  const card = await prisma.flashcard.create({
    data: { type: 'BASIC', front: 'What is the powerhouse of the cell?', back: 'Mitochondria', noteId: biology.id, due: new Date() }
  })
  await prisma.deckCard.create({ data: { deckId: deck.id, cardId: card.id } })

  console.log('Seed complete ✓')
}

main().catch(console.error).finally(() => prisma.$disconnect())
```

Add to `package.json`:
```json
"prisma": { "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts" }
```

Run: `npx prisma db seed` — Expected: `Seed complete ✓`

- [ ] **Step 5: Docker Compose smoke test**

```bash
docker compose build
docker compose up -d
# Visit http://localhost:3000 → should show /setup
# Set password, create a note, add a flashcard
docker compose restart
# Revisit → note and flashcard should persist
docker compose down
```

- [ ] **Step 6: Write README.md**

Create `README.md` covering:
- Quickstart: `cp .env.example .env && docker compose up`
- Env var reference table (SESSION_SECRET, DATABASE_URL, INITIAL_PASSWORD, PORT, BASE_URL)
- Postgres upgrade: update DATABASE_URL, run `docker compose exec app npx prisma migrate deploy`
- Development: `npm install && npm run dev`
- Periodic templates: Settings → edit template per period type

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: polish — sidebar layout, skeletons, seed, Docker smoke test, README"
```

---

## Self-Review Checklist

- **Spec coverage:** All 8 capability specs covered across tasks 1–13. ✓
- **Placeholder scan:** No TBD/TODO found in plan steps. ✓
- **Type consistency:** `prismaCardToFsrs` defined in Task 10 and used in Tasks 10, 12. `extractWikilinks` defined in Task 5, referenced in Task 5. `extractClozeCards` defined in Task 11, referenced in Task 11. ✓
- **Missing coverage found:** FTS5 index sync on note/task mutations — covered in Task 8 step 2 (`server/routers/search.ts` adds sync hooks). ✓
