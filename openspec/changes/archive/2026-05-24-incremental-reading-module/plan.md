# Incremental Reading Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SuperMemo-style incremental reading system to Open Brain that lets users queue notes and Wikipedia articles, extract passages as child reading items, schedule everything via FSRS, and distill leaf items into notes or flashcards.

**Architecture:** New `ReadingItem` Prisma model with a self-referencing extract tree (`parentItemId`), a dedicated `server/routers/reading.ts` tRPC router (~10 procedures), three new Next.js App Router pages (`/reading`, `/reading/add`, `/reading/session`), and Wikipedia fetch/parse utilities extracted into `lib/wikipedia.ts`. The existing `NoteViewer`, `CardCreationModal`, and `lib/fsrs.ts` are reused without modification.

**Tech Stack:** Next.js 16 App Router, tRPC v11, Prisma 7 + better-sqlite3, ts-fsrs, turndown (new dep for HTML→markdown), React 19, Tailwind CSS, sonner (toasts already in use)

---

## File Structure

**New files:**
- `prisma/schema.prisma` — add `ReadingItem` model + `ReadingSource` enum; add nullable FK fields to `Note` and `Flashcard`
- `lib/wikipedia.ts` — fetch Wikipedia mobile-sections API, convert HTML→markdown, extract title from URL
- `lib/htmlToMarkdown.ts` — thin wrapper around turndown with configured options
- `server/routers/reading.ts` — all reading tRPC procedures
- `app/reading/page.tsx` — queue overview (Due / All tabs)
- `app/reading/add/page.tsx` — add URL / Wikipedia / note to queue
- `app/reading/session/page.tsx` — active reader with selection toolbar + FSRS rating
- `components/reading/SelectionToolbar.tsx` — floating toolbar on text selection
- `components/reading/RatingBar.tsx` — Again / Hard / Good / Easy buttons
- `components/reading/ExtractHighlighter.tsx` — wraps NoteViewer, dims extracted passages
- `components/reading/WikipediaSectionChecklist.tsx` — section picker for /reading/add
- `tests/reading.lib.test.ts` — unit tests for `lib/wikipedia.ts` and `lib/htmlToMarkdown.ts`
- `tests/reading.router.test.ts` — integration tests for reading tRPC procedures

**Modified files:**
- `prisma/schema.prisma` — ReadingItem model, ReadingSource enum, FK on Note + Flashcard
- `server/root.ts` — register `readingRouter`
- `app/notes/[slug]/page.tsx` — add "Add to reading queue" button

---

## Task 1: Database Schema

**Files:**
- Modify: `open-brain/prisma/schema.prisma`

- [ ] **Step 1.1: Add `ReadingSource` enum and `ReadingItem` model to schema**

Open `open-brain/prisma/schema.prisma`. Add after the existing `FSRSState` enum and before the closing of the file:

```prisma
enum ReadingSource {
  NOTE
  URL
  WIKIPEDIA_SECTION
  EXTRACT
}

model ReadingItem {
  id           String        @id @default(uuid())
  title        String
  content      String        @default("")
  sourceType   ReadingSource
  url          String?
  articleUrl   String?
  sectionTitle String?
  priority     Int           @default(50)
  extractedText String?

  sourceNoteId String?
  sourceNote   Note?         @relation("NoteReadingItems", fields: [sourceNoteId], references: [id], onDelete: SetNull)

  parentItemId String?
  parentItem   ReadingItem?  @relation("ExtractTree", fields: [parentItemId], references: [id], onDelete: SetNull)
  children     ReadingItem[] @relation("ExtractTree")

  stability  Float     @default(0)
  difficulty Float     @default(0)
  due        DateTime  @default(now())
  reps       Int       @default(0)
  lapses     Int       @default(0)
  state      FSRSState @default(NEW)
  lastReview DateTime?

  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  terminatedNotes      Note[]      @relation("NoteFromReading")
  terminatedFlashcards Flashcard[] @relation("FlashcardFromReading")
}
```

- [ ] **Step 1.2: Add `sourceReadingItemId` FK to `Note` model**

In `prisma/schema.prisma`, find the `Note` model and add inside it:

```prisma
  sourceReadingItemId String?
  sourceReadingItem   ReadingItem? @relation("NoteFromReading", fields: [sourceReadingItemId], references: [id], onDelete: SetNull)
  readingItems        ReadingItem[] @relation("NoteReadingItems")
```

- [ ] **Step 1.3: Add `sourceReadingItemId` FK to `Flashcard` model**

In `prisma/schema.prisma`, find the `Flashcard` model and add inside it:

```prisma
  sourceReadingItemId String?
  sourceReadingItem   ReadingItem? @relation("FlashcardFromReading", fields: [sourceReadingItemId], references: [id], onDelete: SetNull)
```

- [ ] **Step 1.4: Run migration**

```bash
cd open-brain && npx prisma migrate dev --name add-reading-module
```

Expected: migration file created under `prisma/migrations/`, Prisma client regenerated with no errors.

- [ ] **Step 1.5: Verify generated types**

```bash
cd open-brain && npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 1.6: Commit**

```bash
git add open-brain/prisma/schema.prisma open-brain/prisma/migrations/
git commit -m "feat(schema): add ReadingItem model with FSRS fields and extract tree"
```

---

## Task 2: HTML-to-Markdown and Wikipedia Utilities

**Files:**
- Create: `open-brain/lib/htmlToMarkdown.ts`
- Create: `open-brain/lib/wikipedia.ts`
- Create: `open-brain/tests/reading.lib.test.ts`

- [ ] **Step 2.1: Install turndown**

```bash
cd open-brain && npm install turndown && npm install --save-dev @types/turndown
```

Expected: `turndown` appears in `package.json` dependencies.

- [ ] **Step 2.2: Write failing tests for `htmlToMarkdown`**

Create `open-brain/tests/reading.lib.test.ts`:

```typescript
import { htmlToMarkdown } from '../lib/htmlToMarkdown'
import { extractWikipediaTitleFromUrl, parseWikipediaSections } from '../lib/wikipedia'

describe('htmlToMarkdown', () => {
  it('converts a paragraph to plain text', () => {
    const result = htmlToMarkdown('<p>Hello world</p>')
    expect(result.trim()).toBe('Hello world')
  })

  it('converts bold to markdown bold', () => {
    const result = htmlToMarkdown('<p><b>Important</b> text</p>')
    expect(result).toContain('**Important**')
  })

  it('converts headings', () => {
    const result = htmlToMarkdown('<h2>Section Title</h2>')
    expect(result).toContain('## Section Title')
  })

  it('strips script tags entirely', () => {
    const result = htmlToMarkdown('<p>Safe</p><script>alert(1)</script>')
    expect(result).not.toContain('alert')
    expect(result).toContain('Safe')
  })
})

describe('extractWikipediaTitleFromUrl', () => {
  it('extracts title from standard Wikipedia URL', () => {
    const title = extractWikipediaTitleFromUrl('https://en.wikipedia.org/wiki/Mitochondria')
    expect(title).toBe('Mitochondria')
  })

  it('handles URL-encoded titles', () => {
    const title = extractWikipediaTitleFromUrl('https://en.wikipedia.org/wiki/Spaced_repetition')
    expect(title).toBe('Spaced_repetition')
  })

  it('returns null for non-Wikipedia URLs', () => {
    const title = extractWikipediaTitleFromUrl('https://example.com/page')
    expect(title).toBeNull()
  })
})

describe('parseWikipediaSections', () => {
  it('extracts lead and numbered sections', () => {
    const mockResponse = {
      lead: {
        displaytitle: 'Mitochondria',
        sections: [{ id: 0, text: '<p>The mitochondrion is a double-membrane-bound organelle.</p>' }],
      },
      remaining: {
        sections: [
          { id: 1, anchor: 'Structure', line: 'Structure', text: '<p>The inner membrane.</p>' },
          { id: 2, anchor: 'Function', line: 'Function', text: '<p>ATP production.</p>' },
        ],
      },
    }
    const sections = parseWikipediaSections(mockResponse, 'https://en.wikipedia.org/wiki/Mitochondria')
    expect(sections).toHaveLength(3)
    expect(sections[0].sectionTitle).toBe('Introduction')
    expect(sections[0].content).toContain('mitochondrion')
    expect(sections[1].sectionTitle).toBe('Structure')
    expect(sections[2].sectionTitle).toBe('Function')
    expect(sections[0].articleUrl).toBe('https://en.wikipedia.org/wiki/Mitochondria')
  })

  it('returns empty array for missing remaining sections', () => {
    const mockResponse = {
      lead: {
        displaytitle: 'Test',
        sections: [{ id: 0, text: '<p>Lead.</p>' }],
      },
      remaining: { sections: [] },
    }
    const sections = parseWikipediaSections(mockResponse, 'https://en.wikipedia.org/wiki/Test')
    expect(sections).toHaveLength(1)
  })
})
```

- [ ] **Step 2.3: Run tests — verify they fail**

```bash
cd open-brain && npx jest tests/reading.lib.test.ts
```

Expected: FAIL — `Cannot find module '../lib/htmlToMarkdown'`

- [ ] **Step 2.4: Create `lib/htmlToMarkdown.ts`**

```typescript
import TurndownService from 'turndown'

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

// Remove script, style, and nav elements entirely
td.remove(['script', 'style', 'nav', 'figure', 'sup'])

export function htmlToMarkdown(html: string): string {
  return td.turndown(html)
}
```

- [ ] **Step 2.5: Create `lib/wikipedia.ts`**

```typescript
import { htmlToMarkdown } from './htmlToMarkdown'

export interface WikipediaSection {
  sectionTitle: string
  content: string
  articleUrl: string
}

export function extractWikipediaTitleFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.endsWith('wikipedia.org')) return null
    const parts = parsed.pathname.split('/')
    const wikiIndex = parts.indexOf('wiki')
    if (wikiIndex === -1 || wikiIndex + 1 >= parts.length) return null
    return decodeURIComponent(parts[wikiIndex + 1])
  } catch {
    return null
  }
}

interface MobileSectionsResponse {
  lead: {
    displaytitle: string
    sections: Array<{ id: number; text: string }>
  }
  remaining: {
    sections: Array<{ id: number; anchor: string; line: string; text: string }>
  }
}

export function parseWikipediaSections(
  response: MobileSectionsResponse,
  articleUrl: string,
): WikipediaSection[] {
  const sections: WikipediaSection[] = []

  const leadSection = response.lead.sections[0]
  if (leadSection) {
    sections.push({
      sectionTitle: 'Introduction',
      content: htmlToMarkdown(leadSection.text),
      articleUrl,
    })
  }

  for (const section of response.remaining.sections) {
    if (!section.text?.trim()) continue
    sections.push({
      sectionTitle: section.line || section.anchor,
      content: htmlToMarkdown(section.text),
      articleUrl,
    })
  }

  return sections
}

export async function fetchWikipediaSections(
  titleOrUrl: string,
): Promise<WikipediaSection[]> {
  const title = titleOrUrl.startsWith('http')
    ? extractWikipediaTitleFromUrl(titleOrUrl)
    : titleOrUrl

  if (!title) throw new Error('Invalid Wikipedia URL')

  const url = `https://en.wikipedia.org/api/rest_v1/page/mobile-sections/${encodeURIComponent(title)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'OpenBrain/1.0 (self-hosted PKM; contact@openbrain.app)' },
  })

  if (res.status === 404) throw new Error(`Wikipedia article not found: ${title}`)
  if (!res.ok) throw new Error(`Wikipedia API error: ${res.status}`)

  const data: MobileSectionsResponse = await res.json()
  const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
  return parseWikipediaSections(data, articleUrl)
}
```

- [ ] **Step 2.6: Run tests — verify they pass**

```bash
cd open-brain && npx jest tests/reading.lib.test.ts
```

Expected: PASS — all 7 tests pass.

- [ ] **Step 2.7: Commit**

```bash
git add open-brain/lib/htmlToMarkdown.ts open-brain/lib/wikipedia.ts open-brain/tests/reading.lib.test.ts open-brain/package.json open-brain/package-lock.json
git commit -m "feat(lib): add HTML-to-markdown and Wikipedia fetch utilities"
```

---

## Task 3: tRPC Reading Router — Core Queue Operations

**Files:**
- Create: `open-brain/server/routers/reading.ts`
- Modify: `open-brain/server/root.ts`
- Create: `open-brain/tests/reading.router.test.ts`

- [ ] **Step 3.1: Write failing router integration tests**

Create `open-brain/tests/reading.router.test.ts`:

```typescript
/**
 * Integration tests for the reading tRPC router.
 * Uses Prisma directly against a temporary SQLite database.
 * Import the router's pure logic functions, not the HTTP layer.
 */
import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

let prisma: PrismaClient
let dbPath: string

beforeAll(async () => {
  dbPath = path.join(os.tmpdir(), `reading-test-${Date.now()}.db`)
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` })
  prisma = new PrismaClient({ adapter })
  // Push schema to test DB
  const { execSync } = await import('child_process')
  execSync(`DATABASE_URL="file:${dbPath}" npx prisma db push --skip-generate`, {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  })
})

afterAll(async () => {
  await prisma.$disconnect()
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
})

afterEach(async () => {
  await prisma.readingItem.deleteMany()
  await prisma.note.deleteMany()
  await prisma.flashcard.deleteMany()
})

// Helpers that mirror router logic (imported after router is created)
import {
  addNote,
  listDue,
  extractItem,
  reviewItem,
  terminateNote,
} from '../server/routers/reading'

describe('addNote', () => {
  it('creates a ReadingItem linked to an existing note', async () => {
    const note = await prisma.note.create({
      data: { title: 'Test Note', slug: 'test-note', body: '# Hello\nworld' },
    })
    const item = await addNote(prisma, note.id)
    expect(item.sourceType).toBe('NOTE')
    expect(item.sourceNoteId).toBe(note.id)
    expect(item.content).toBe('# Hello\nworld')
    expect(item.deletedAt).toBeNull()
  })

  it('returns existing item without creating a duplicate', async () => {
    const note = await prisma.note.create({
      data: { title: 'Dup Note', slug: 'dup-note', body: 'body' },
    })
    const first = await addNote(prisma, note.id)
    const second = await addNote(prisma, note.id)
    expect(second.id).toBe(first.id)
    const count = await prisma.readingItem.count({ where: { sourceNoteId: note.id } })
    expect(count).toBe(1)
  })
})

describe('listDue', () => {
  it('returns items due now, ordered by priority desc then due asc', async () => {
    const past = new Date(Date.now() - 3600_000)
    await prisma.readingItem.createMany({
      data: [
        { title: 'Low', content: '', sourceType: 'URL', priority: 20, due: past },
        { title: 'High', content: '', sourceType: 'URL', priority: 80, due: past },
      ],
    })
    const due = await listDue(prisma)
    expect(due[0].title).toBe('High')
    expect(due[1].title).toBe('Low')
  })

  it('excludes future items', async () => {
    const future = new Date(Date.now() + 3600_000)
    await prisma.readingItem.create({
      data: { title: 'Future', content: '', sourceType: 'URL', due: future },
    })
    const due = await listDue(prisma)
    expect(due).toHaveLength(0)
  })

  it('excludes soft-deleted items', async () => {
    const past = new Date(Date.now() - 1000)
    await prisma.readingItem.create({
      data: { title: 'Deleted', content: '', sourceType: 'URL', due: past, deletedAt: new Date() },
    })
    const due = await listDue(prisma)
    expect(due).toHaveLength(0)
  })
})

describe('extractItem', () => {
  it('creates a child ReadingItem with parentItemId and extractedText', async () => {
    const parent = await prisma.readingItem.create({
      data: { title: 'Parent', content: 'long content', sourceType: 'URL' },
    })
    const child = await extractItem(prisma, parent.id, 'long content')
    expect(child.parentItemId).toBe(parent.id)
    expect(child.extractedText).toBe('long content')
    expect(child.sourceType).toBe('EXTRACT')
    expect(child.deletedAt).toBeNull()
  })

  it('derives title from first 80 chars of selected text', async () => {
    const parent = await prisma.readingItem.create({
      data: { title: 'Parent', content: 'x'.repeat(200), sourceType: 'URL' },
    })
    const longText = 'A'.repeat(100)
    const child = await extractItem(prisma, parent.id, longText)
    expect(child.title.length).toBeLessThanOrEqual(80)
  })
})

describe('reviewItem', () => {
  it('advances FSRS state from NEW after a Good rating', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Item', content: '', sourceType: 'URL', state: 'NEW', reps: 0 },
    })
    const updated = await reviewItem(prisma, item.id, 'Good')
    expect(updated.reps).toBe(1)
    expect(updated.due.getTime()).toBeGreaterThan(Date.now())
    expect(['LEARNING', 'REVIEW']).toContain(updated.state)
  })

  it('increments lapses and sets near-future due on Again rating', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Item', content: '', sourceType: 'URL', state: 'REVIEW', stability: 10, difficulty: 5, reps: 5 },
    })
    const updated = await reviewItem(prisma, item.id, 'Again')
    expect(updated.lapses).toBe(1)
    // Due should be within 10 minutes for Again in REVIEW state
    const tenMinutes = Date.now() + 10 * 60 * 1000
    expect(updated.due.getTime()).toBeLessThan(tenMinutes)
  })
})

describe('terminateNote', () => {
  it('creates a Note and soft-deletes the ReadingItem', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Extract Title', content: 'The key insight.', sourceType: 'EXTRACT' },
    })
    const note = await terminateNote(prisma, item.id, undefined)
    expect(note.title).toBe('Extract Title')
    expect(note.body).toBe('The key insight.')
    expect(note.sourceReadingItemId).toBe(item.id)
    const updated = await prisma.readingItem.findUnique({ where: { id: item.id } })
    expect(updated?.deletedAt).not.toBeNull()
  })

  it('uses provided title override', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Original', content: 'content', sourceType: 'EXTRACT' },
    })
    const note = await terminateNote(prisma, item.id, 'My Custom Title')
    expect(note.title).toBe('My Custom Title')
  })
})
```

- [ ] **Step 3.2: Run tests — verify they fail**

```bash
cd open-brain && npx jest tests/reading.router.test.ts
```

Expected: FAIL — `Cannot find module '../server/routers/reading'`

- [ ] **Step 3.3: Create `server/routers/reading.ts` with exported pure logic functions**

```typescript
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { computeNextState, Rating, type Grade } from '@/lib/fsrs'
import { fetchWikipediaSections } from '@/lib/wikipedia'
import type { PrismaClient } from '@/lib/generated/prisma/client'
import { uniqueSlug } from '@/lib/slug'

// Pure logic functions exported for testing
export async function addNote(db: PrismaClient, noteId: string) {
  const existing = await db.readingItem.findFirst({
    where: { sourceNoteId: noteId, deletedAt: null },
  })
  if (existing) return existing

  const note = await db.note.findUniqueOrThrow({ where: { id: noteId } })
  return db.readingItem.create({
    data: {
      title: note.title,
      content: note.body ?? '',
      sourceType: 'NOTE',
      sourceNoteId: noteId,
    },
  })
}

export async function listDue(db: PrismaClient) {
  return db.readingItem.findMany({
    where: { deletedAt: null, due: { lte: new Date() } },
    orderBy: [{ priority: 'desc' }, { due: 'asc' }],
  })
}

export async function extractItem(db: PrismaClient, parentItemId: string, selectedText: string) {
  const title = selectedText.slice(0, 80).trim()
  return db.readingItem.create({
    data: {
      title,
      content: selectedText,
      sourceType: 'EXTRACT',
      parentItemId,
      extractedText: selectedText,
    },
  })
}

export async function reviewItem(
  db: PrismaClient,
  readingItemId: string,
  ratingStr: 'Again' | 'Hard' | 'Good' | 'Easy',
) {
  const item = await db.readingItem.findUniqueOrThrow({ where: { id: readingItemId } })
  const ratingMap: Record<string, Grade> = {
    Again: Rating.Again,
    Hard: Rating.Hard,
    Good: Rating.Good,
    Easy: Rating.Easy,
  }
  const next = computeNextState(
    {
      stability: item.stability,
      difficulty: item.difficulty,
      due: item.due,
      reps: item.reps,
      lapses: item.lapses,
      state: item.state,
      lastReview: item.lastReview,
    },
    ratingMap[ratingStr],
  )
  return db.readingItem.update({
    where: { id: readingItemId },
    data: {
      stability: next.stability,
      difficulty: next.difficulty,
      due: next.due,
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      lastReview: next.lastReview,
    },
  })
}

export async function terminateNote(
  db: PrismaClient,
  readingItemId: string,
  titleOverride: string | undefined,
) {
  const item = await db.readingItem.findUniqueOrThrow({ where: { id: readingItemId } })
  const title = (titleOverride ?? item.title).trim() || 'Untitled'
  const slug = await uniqueSlug(title, db as unknown as Parameters<typeof uniqueSlug>[1])
  const note = await db.note.create({
    data: { title, slug, body: item.content, sourceReadingItemId: readingItemId },
  })
  await db.readingItem.update({
    where: { id: readingItemId },
    data: { deletedAt: new Date() },
  })
  return note
}

// tRPC router
export const readingRouter = router({
  listDue: protectedProcedure.query(() => listDue(prisma)),

  listAll: protectedProcedure
    .input(
      z.object({
        sourceType: z.enum(['NOTE', 'URL', 'WIKIPEDIA_SECTION', 'EXTRACT']).optional(),
        state: z.enum(['NEW', 'LEARNING', 'REVIEW', 'RELEARNING']).optional(),
        sourceNoteId: z.string().optional(),
      }).optional(),
    )
    .query(({ input }) =>
      prisma.readingItem.findMany({
        where: {
          deletedAt: null,
          ...(input?.sourceType ? { sourceType: input.sourceType } : {}),
          ...(input?.state ? { state: input.state } : {}),
          ...(input?.sourceNoteId ? { sourceNoteId: input.sourceNoteId } : {}),
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
    ),

  addNote: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(({ input }) => addNote(prisma, input.noteId)),

  fetchWikipedia: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .query(async ({ input }) => {
      try {
        return await fetchWikipediaSections(input.url)
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Failed to fetch Wikipedia article',
        })
      }
    }),

  addWikipedia: protectedProcedure
    .input(
      z.array(
        z.object({
          title: z.string(),
          content: z.string(),
          articleUrl: z.string(),
          sectionTitle: z.string(),
        }),
      ),
    )
    .mutation(({ input }) =>
      Promise.all(
        input.map(section =>
          prisma.readingItem.create({
            data: {
              title: section.title,
              content: section.content,
              sourceType: 'WIKIPEDIA_SECTION',
              url: section.articleUrl,
              articleUrl: section.articleUrl,
              sectionTitle: section.sectionTitle,
            },
          }),
        ),
      ),
    ),

  addUrl: protectedProcedure
    .input(z.object({ url: z.string().url(), title: z.string().optional(), content: z.string().optional() }))
    .mutation(async ({ input }) => {
      if (input.content) {
        return prisma.readingItem.create({
          data: {
            title: input.title ?? new URL(input.url).hostname,
            content: input.content,
            sourceType: 'URL',
            url: input.url,
          },
        })
      }
      try {
        const res = await fetch(input.url, { signal: AbortSignal.timeout(10_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const html = await res.text()
        const { htmlToMarkdown } = await import('@/lib/htmlToMarkdown')
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
        const title = input.title ?? titleMatch?.[1]?.trim() ?? new URL(input.url).hostname
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
        const content = htmlToMarkdown(bodyMatch?.[1] ?? html)
        return prisma.readingItem.create({
          data: { title, content, sourceType: 'URL', url: input.url },
        })
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Failed to fetch URL',
        })
      }
    }),

  extract: protectedProcedure
    .input(z.object({ parentItemId: z.string(), selectedText: z.string().min(1) }))
    .mutation(({ input }) => extractItem(prisma, input.parentItemId, input.selectedText)),

  review: protectedProcedure
    .input(z.object({ readingItemId: z.string(), rating: z.enum(['Again', 'Hard', 'Good', 'Easy']) }))
    .mutation(({ input }) => reviewItem(prisma, input.readingItemId, input.rating)),

  terminateNote: protectedProcedure
    .input(z.object({ readingItemId: z.string(), title: z.string().optional() }))
    .mutation(({ input }) => terminateNote(prisma, input.readingItemId, input.title)),
})
```

- [ ] **Step 3.4: Register router in `server/root.ts`**

Add to `open-brain/server/root.ts`:

```typescript
import { readingRouter } from './routers/reading'
// ... inside the router({}) call:
reading: readingRouter,
```

Full updated file:

```typescript
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
import { readingRouter } from './routers/reading'

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
  reading: readingRouter,
})

export type AppRouter = typeof appRouter
```

- [ ] **Step 3.5: Run tests — verify they pass**

```bash
cd open-brain && npx jest tests/reading.router.test.ts --testTimeout=30000
```

Expected: PASS — all tests pass. (The `db push` in `beforeAll` may take a few seconds.)

- [ ] **Step 3.6: Run full test suite to check for regressions**

```bash
cd open-brain && npx jest
```

Expected: all pre-existing tests still pass.

- [ ] **Step 3.7: Commit**

```bash
git add open-brain/server/routers/reading.ts open-brain/server/root.ts open-brain/tests/reading.router.test.ts
git commit -m "feat(api): add reading tRPC router with FSRS review and extract tree"
```

---

## Task 4: Queue Overview Page (`/reading`)

**Files:**
- Create: `open-brain/app/reading/page.tsx`

- [ ] **Step 4.1: Create the queue overview page**

Create `open-brain/app/reading/page.tsx`:

```typescript
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

const SOURCE_LABELS: Record<string, string> = {
  NOTE: 'Note',
  URL: 'URL',
  WIKIPEDIA_SECTION: 'Wikipedia',
  EXTRACT: 'Extract',
}

const SOURCE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  NOTE: 'default',
  URL: 'outline',
  WIKIPEDIA_SECTION: 'secondary',
  EXTRACT: 'outline',
}

export default function ReadingPage() {
  const [tab, setTab] = useState<'due' | 'all'>('due')

  const { data: dueItems = [], isLoading: dueLoading } = trpc.reading.listDue.useQuery()
  const { data: allItems = [], isLoading: allLoading } = trpc.reading.listAll.useQuery(undefined, {
    enabled: tab === 'all',
  })

  const items = tab === 'due' ? dueItems : allItems
  const isLoading = tab === 'due' ? dueLoading : allLoading

  return (
    <div className="flex min-h-screen">
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <nav className="flex flex-col gap-1">
          <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
          <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Tasks</Link>
          <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
          <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Decks</Link>
          <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Review</Link>
          <Link href="/reading" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent">Reading</Link>
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Settings</Link>
        </nav>
      </aside>

      <main className="flex-1 p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Reading Queue</h1>
          <div className="flex gap-2">
            {dueItems.length > 0 && (
              <Link href="/reading/session">
                <Button size="sm">Start reading ({dueItems.length} due)</Button>
              </Link>
            )}
            <Link href="/reading/add">
              <Button variant="outline" size="sm">Add to queue</Button>
            </Link>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('due')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === 'due' ? 'bg-accent' : 'hover:bg-accent/50'
            }`}
          >
            Due {dueItems.length > 0 && `(${dueItems.length})`}
          </button>
          <button
            onClick={() => setTab('all')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === 'all' ? 'bg-accent' : 'hover:bg-accent/50'
            }`}
          >
            All
          </button>
        </div>

        {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}

        {!isLoading && items.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {tab === 'due'
              ? 'Nothing due right now. Great work!'
              : 'Your reading queue is empty. Add something to get started.'}
          </div>
        )}

        <div className="space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-lg border"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Badge variant={SOURCE_VARIANTS[item.sourceType] ?? 'outline'}>
                  {SOURCE_LABELS[item.sourceType] ?? item.sourceType}
                </Badge>
                <span className="text-sm font-medium truncate">{item.title}</span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                {item.due <= new Date() ? 'due now' : `due ${format(item.due, 'MMM d')}`}
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 4.2: Update the sidebar nav on `/review/page.tsx` to include Reading link**

Open `open-brain/app/review/page.tsx`. In the `<nav>` block, add after the Review link:

```tsx
<Link href="/reading" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Reading</Link>
```

Do the same for any other pages that have the full sidebar nav (check `app/tasks/page.tsx`, `app/graph/page.tsx`, `app/decks/page.tsx`, `app/settings/page.tsx`).

- [ ] **Step 4.3: Verify TypeScript**

```bash
cd open-brain && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4.4: Commit**

```bash
git add open-brain/app/reading/page.tsx open-brain/app/review/page.tsx
git commit -m "feat(ui): add reading queue overview page at /reading"
```

---

## Task 5: Add to Queue Page (`/reading/add`)

**Files:**
- Create: `open-brain/app/reading/add/page.tsx`
- Create: `open-brain/components/reading/WikipediaSectionChecklist.tsx`

- [ ] **Step 5.1: Create WikipediaSectionChecklist component**

Create `open-brain/components/reading/WikipediaSectionChecklist.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Section {
  sectionTitle: string
  content: string
  articleUrl: string
}

interface Props {
  sections: Section[]
  onConfirm: (selected: Section[]) => void
  isPending: boolean
}

export function WikipediaSectionChecklist({ sections, onConfirm, isPending }: Props) {
  const [checked, setChecked] = useState<Set<number>>(new Set(sections.map((_, i) => i)))

  function toggle(i: number) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Select sections to add ({checked.size} of {sections.length} selected)
        </p>
        <div className="flex gap-2">
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setChecked(new Set(sections.map((_, i) => i)))}
          >
            All
          </button>
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setChecked(new Set())}
          >
            None
          </button>
        </div>
      </div>

      {sections.map((s, i) => (
        <label
          key={i}
          className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50"
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={checked.has(i)}
            onChange={() => toggle(i)}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">{s.sectionTitle}</p>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {s.content.slice(0, 120)}
            </p>
          </div>
        </label>
      ))}

      <Button
        onClick={() => onConfirm(sections.filter((_, i) => checked.has(i)))}
        disabled={checked.size === 0 || isPending}
        className="w-full"
      >
        {isPending ? 'Adding...' : `Add ${checked.size} section${checked.size !== 1 ? 's' : ''} to queue`}
      </Button>
    </div>
  )
}
```

- [ ] **Step 5.2: Create add-to-queue page**

Create `open-brain/app/reading/add/page.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { WikipediaSectionChecklist } from '@/components/reading/WikipediaSectionChecklist'
import { NoteViewer } from '@/components/editor/NoteViewer'

type Step = 'input' | 'wikipedia-preview' | 'url-preview'

interface WikiSection {
  sectionTitle: string
  content: string
  articleUrl: string
}

function isWikipediaUrl(url: string) {
  try {
    return new URL(url).hostname.endsWith('wikipedia.org')
  } catch {
    return false
  }
}

export default function AddToQueuePage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [step, setStep] = useState<Step>('input')
  const [wikiSections, setWikiSections] = useState<WikiSection[]>([])
  const [urlPreview, setUrlPreview] = useState<{ title: string; content: string } | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [manualContent, setManualContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const utils = trpc.useUtils()
  const fetchWikipedia = trpc.reading.fetchWikipedia.useQuery(
    { url },
    { enabled: false }
  )
  const addWikipedia = trpc.reading.addWikipedia.useMutation({
    onSuccess: () => {
      toast.success('Sections added to reading queue')
      router.push('/reading')
    },
    onError: () => toast.error('Failed to add sections'),
  })
  const addUrl = trpc.reading.addUrl.useMutation({
    onSuccess: () => {
      toast.success('Added to reading queue')
      router.push('/reading')
    },
    onError: (err) => {
      setFetchError(err.message)
    },
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFetchError(null)
    setIsLoading(true)
    try {
      if (isWikipediaUrl(url)) {
        const result = await utils.reading.fetchWikipedia.fetch({ url })
        setWikiSections(result)
        setStep('wikipedia-preview')
      } else {
        // For non-Wikipedia, try fetch; fallback to manual paste
        try {
          const result = await utils.reading.addUrl.fetch({ url })
          setUrlPreview({ title: result.title, content: result.content })
          setStep('url-preview')
        } catch (err) {
          setFetchError(err instanceof Error ? err.message : 'Fetch failed')
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Fetch failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <nav className="flex flex-col gap-1">
          <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
          <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Tasks</Link>
          <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
          <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Decks</Link>
          <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Review</Link>
          <Link href="/reading" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Reading</Link>
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Settings</Link>
        </nav>
      </aside>

      <main className="flex-1 p-6 max-w-3xl">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/reading" className="text-muted-foreground hover:text-foreground text-sm">← Queue</Link>
          <h1 className="text-2xl font-bold">Add to Reading Queue</h1>
        </div>

        {step === 'input' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Wikipedia or web URL</label>
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://en.wikipedia.org/wiki/..."
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  required
                />
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Fetching...' : 'Fetch'}
                </Button>
              </div>
            </div>

            {fetchError && (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{fetchError}</p>
                <div>
                  <label className="text-sm font-medium mb-1 block">Or paste content manually</label>
                  <textarea
                    className="w-full min-h-[200px] rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    placeholder="Paste article content here..."
                    value={manualContent}
                    onChange={e => setManualContent(e.target.value)}
                  />
                  {manualContent && (
                    <Button
                      className="mt-2"
                      onClick={() => addUrl.mutate({ url, content: manualContent, title: new URL(url).hostname })}
                      disabled={addUrl.isPending}
                    >
                      Add to queue
                    </Button>
                  )}
                </div>
              </div>
            )}
          </form>
        )}

        {step === 'wikipedia-preview' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Found {wikiSections.length} sections. Choose which to add:
            </p>
            <WikipediaSectionChecklist
              sections={wikiSections}
              onConfirm={selected =>
                addWikipedia.mutate(
                  selected.map(s => ({
                    title: s.sectionTitle,
                    content: s.content,
                    articleUrl: s.articleUrl,
                    sectionTitle: s.sectionTitle,
                  })),
                )
              }
              isPending={addWikipedia.isPending}
            />
            <button className="text-sm text-muted-foreground hover:underline" onClick={() => setStep('input')}>
              ← Back
            </button>
          </div>
        )}

        {step === 'url-preview' && urlPreview && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <h2 className="font-semibold mb-2">{urlPreview.title}</h2>
              <div className="max-h-64 overflow-y-auto">
                <NoteViewer markdown={urlPreview.content.slice(0, 2000)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => addUrl.mutate({ url, content: urlPreview.content, title: urlPreview.title })}
                disabled={addUrl.isPending}
              >
                {addUrl.isPending ? 'Adding...' : 'Add to queue'}
              </Button>
              <Button variant="outline" onClick={() => setStep('input')}>Back</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 5.3: Verify TypeScript**

```bash
cd open-brain && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5.4: Commit**

```bash
git add open-brain/app/reading/add/page.tsx open-brain/components/reading/WikipediaSectionChecklist.tsx
git commit -m "feat(ui): add /reading/add page with Wikipedia section picker"
```

---

## Task 6: Reading Session — Base Render + FSRS Rating

**Files:**
- Create: `open-brain/components/reading/RatingBar.tsx`
- Create: `open-brain/components/reading/ExtractHighlighter.tsx`
- Create: `open-brain/app/reading/session/page.tsx`

- [ ] **Step 6.1: Create RatingBar component**

Create `open-brain/components/reading/RatingBar.tsx`:

```typescript
'use client'
import { Button } from '@/components/ui/button'

type Rating = 'Again' | 'Hard' | 'Good' | 'Easy'

interface Props {
  onRate: (rating: Rating) => void
  isPending: boolean
}

const RATINGS: { label: Rating; className: string }[] = [
  { label: 'Again', className: 'text-red-600 border-red-200 hover:bg-red-50' },
  { label: 'Hard', className: 'text-orange-600 border-orange-200 hover:bg-orange-50' },
  { label: 'Good', className: 'text-green-600 border-green-200 hover:bg-green-50' },
  { label: 'Easy', className: 'text-blue-600 border-blue-200 hover:bg-blue-50' },
]

export function RatingBar({ onRate, isPending }: Props) {
  return (
    <div className="flex gap-2 justify-center">
      {RATINGS.map(r => (
        <Button
          key={r.label}
          variant="outline"
          size="sm"
          className={r.className}
          onClick={() => onRate(r.label)}
          disabled={isPending}
        >
          {r.label}
        </Button>
      ))}
    </div>
  )
}
```

- [ ] **Step 6.2: Create ExtractHighlighter component**

Create `open-brain/components/reading/ExtractHighlighter.tsx`:

```typescript
'use client'
import { NoteViewer } from '@/components/editor/NoteViewer'

interface Props {
  markdown: string
  extractedTexts: string[]
}

function highlightExtracts(markdown: string, extracts: string[]): string {
  let result = markdown
  for (const text of extracts) {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized) continue
    // Escape for use in regex
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(${escaped})`, 'gi')
    result = result.replace(re, '<mark class="bg-yellow-100/50 text-yellow-900/70 dark:bg-yellow-900/20 line-through">$1</mark>')
  }
  return result
}

export function ExtractHighlighter({ markdown, extractedTexts }: Props) {
  if (extractedTexts.length === 0) {
    return <NoteViewer markdown={markdown} />
  }
  const highlighted = highlightExtracts(markdown, extractedTexts)
  // We need to render raw HTML for the highlights; use a div with dangerouslySetInnerHTML
  // only after passing through NoteViewer's preprocessing for wikilinks.
  // Since we're inserting <mark> tags into markdown before react-markdown processes it,
  // we enable rehype-raw on this path by wrapping in a container.
  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  )
}
```

> **Note:** The `dangerouslySetInnerHTML` approach is acceptable here because `extractedTexts` comes from the user's own prior selections (stored in `ReadingItem.extractedText`), not from external content. The markdown content itself is treated as-is; no user-controlled HTML is injected.

- [ ] **Step 6.3: Create reading session page**

Create `open-brain/app/reading/session/page.tsx`:

```typescript
'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { RatingBar } from '@/components/reading/RatingBar'
import { ExtractHighlighter } from '@/components/reading/ExtractHighlighter'
import { Badge } from '@/components/ui/badge'

const SOURCE_LABELS: Record<string, string> = {
  NOTE: 'Note', URL: 'URL', WIKIPEDIA_SECTION: 'Wikipedia', EXTRACT: 'Extract',
}

type ReadingItem = {
  id: string
  title: string
  content: string
  sourceType: string
  articleUrl: string | null
  extractedText: string | null
  parentItemId: string | null
}

export default function ReadingSessionPage() {
  const utils = trpc.useUtils()
  const { data: dueItems, isLoading } = trpc.reading.listDue.useQuery()
  const { data: allItems } = trpc.reading.listAll.useQuery(undefined)

  const [queue, setQueue] = useState<ReadingItem[]>([])
  const [current, setCurrent] = useState<ReadingItem | null>(null)
  const [done, setDone] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const reviewMutation = trpc.reading.review.useMutation()

  useEffect(() => {
    if (dueItems && !initialized) {
      setInitialized(true)
      const items = dueItems as ReadingItem[]
      setQueue(items.slice(1))
      setCurrent(items[0] ?? null)
      if (items.length === 0) setDone(true)
    }
  }, [dueItems, initialized])

  // Get extractedTexts for the current item (its children's extractedText fields)
  const childExtracts = allItems
    ?.filter(item => item.parentItemId === current?.id && item.extractedText)
    .map(item => item.extractedText as string) ?? []

  async function handleRate(rating: 'Again' | 'Hard' | 'Good' | 'Easy') {
    if (!current || reviewMutation.isPending) return
    await reviewMutation.mutateAsync({ readingItemId: current.id, rating })
    utils.reading.listDue.invalidate()
    advance()
  }

  function advance() {
    const next = queue[0]
    if (!next) {
      setDone(true)
      setCurrent(null)
    } else {
      setCurrent(next)
      setQueue(q => q.slice(1))
    }
  }

  if (isLoading) {
    return <SessionShell><p className="text-muted-foreground">Loading...</p></SessionShell>
  }

  if (done || !current) {
    return (
      <SessionShell>
        <div className="text-center py-12">
          <p className="text-lg font-medium mb-2">All caught up!</p>
          <p className="text-muted-foreground mb-4">No more items due right now.</p>
          <Link href="/reading" className="text-sm underline">Back to queue</Link>
        </div>
      </SessionShell>
    )
  }

  return (
    <SessionShell>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{SOURCE_LABELS[current.sourceType] ?? current.sourceType}</Badge>
          <span className="text-xs text-muted-foreground">{queue.length} remaining</span>
        </div>
        <Link href="/reading" className="text-xs text-muted-foreground hover:underline">← Queue</Link>
      </div>

      <h1 className="text-xl font-semibold mb-4">{current.title}</h1>

      <div className="mb-8" id="reading-content">
        <ExtractHighlighter
          markdown={current.content}
          extractedTexts={childExtracts}
        />
      </div>

      <div className="border-t pt-4">
        <p className="text-xs text-center text-muted-foreground mb-3">How well did you read this?</p>
        <RatingBar onRate={handleRate} isPending={reviewMutation.isPending} />
      </div>
    </SessionShell>
  )
}

function SessionShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <nav className="flex flex-col gap-1">
          <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
          <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Tasks</Link>
          <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
          <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Decks</Link>
          <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Review</Link>
          <Link href="/reading" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Reading</Link>
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Settings</Link>
        </nav>
      </aside>
      <main className="flex-1 p-6 max-w-3xl">{children}</main>
    </div>
  )
}
```

- [ ] **Step 6.4: Verify TypeScript**

```bash
cd open-brain && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6.5: Commit**

```bash
git add open-brain/components/reading/RatingBar.tsx open-brain/components/reading/ExtractHighlighter.tsx open-brain/app/reading/session/page.tsx
git commit -m "feat(ui): add reading session page with FSRS rating bar"
```

---

## Task 7: Reading Session — Selection Toolbar + Extract/Terminate Flow

**Files:**
- Create: `open-brain/components/reading/SelectionToolbar.tsx`
- Modify: `open-brain/app/reading/session/page.tsx`

- [ ] **Step 7.1: Create SelectionToolbar component**

Create `open-brain/components/reading/SelectionToolbar.tsx`:

```typescript
'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  contentId: string
  onExtract: (text: string) => void
  onSaveAsNote: (text: string) => void
  onCreateFlashcard: (text: string) => void
}

interface Position { top: number; left: number }

export function SelectionToolbar({ contentId, onExtract, onSaveAsNote, onCreateFlashcard }: Props) {
  const [selectedText, setSelectedText] = useState('')
  const [position, setPosition] = useState<Position | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleSelectionChange() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelectedText('')
        setPosition(null)
        return
      }

      // Check that selection is within our content area
      const contentEl = document.getElementById(contentId)
      if (!contentEl) return
      const range = sel.getRangeAt(0)
      if (!contentEl.contains(range.commonAncestorContainer)) {
        setSelectedText('')
        setPosition(null)
        return
      }

      const rect = range.getBoundingClientRect()
      setSelectedText(sel.toString().trim())
      setPosition({
        top: rect.top + window.scrollY - 48,
        left: rect.left + rect.width / 2,
      })
    }

    document.addEventListener('mouseup', handleSelectionChange)
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('mouseup', handleSelectionChange)
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [contentId])

  if (!position || !selectedText) return null

  return (
    <div
      ref={toolbarRef}
      style={{ position: 'absolute', top: position.top, left: position.left, transform: 'translateX(-50%)' }}
      className="z-50 flex gap-1 bg-popover border rounded-lg shadow-lg p-1"
      onMouseDown={e => e.preventDefault()} // prevent selection loss
    >
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { onExtract(selectedText); window.getSelection()?.removeAllRanges() }}>
        Extract
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { onSaveAsNote(selectedText); window.getSelection()?.removeAllRanges() }}>
        Save as Note
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { onCreateFlashcard(selectedText); window.getSelection()?.removeAllRanges() }}>
        Flashcard
      </Button>
    </div>
  )
}
```

- [ ] **Step 7.2: Update `app/reading/session/page.tsx` to include toolbar + extract + terminate flow**

Replace the contents of `open-brain/app/reading/session/page.tsx` with the full updated version:

```typescript
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { RatingBar } from '@/components/reading/RatingBar'
import { ExtractHighlighter } from '@/components/reading/ExtractHighlighter'
import { SelectionToolbar } from '@/components/reading/SelectionToolbar'
import { CardCreationModal } from '@/components/flashcard/CardCreationModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

const SOURCE_LABELS: Record<string, string> = {
  NOTE: 'Note', URL: 'URL', WIKIPEDIA_SECTION: 'Wikipedia', EXTRACT: 'Extract',
}

type ReadingItem = {
  id: string
  title: string
  content: string
  sourceType: string
  articleUrl: string | null
  extractedText: string | null
  parentItemId: string | null
}

export default function ReadingSessionPage() {
  const utils = trpc.useUtils()
  const { data: dueItems, isLoading } = trpc.reading.listDue.useQuery()
  const { data: allItems } = trpc.reading.listAll.useQuery(undefined)

  const [queue, setQueue] = useState<ReadingItem[]>([])
  const [current, setCurrent] = useState<ReadingItem | null>(null)
  const [done, setDone] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Local list of extracted texts for immediate highlight feedback
  const [localExtracts, setLocalExtracts] = useState<string[]>([])

  // Save-as-note dialog state
  const [noteDialog, setNoteDialog] = useState<{ open: boolean; text: string; title: string }>({
    open: false, text: '', title: '',
  })

  // Flashcard modal state
  const [flashcardModal, setFlashcardModal] = useState<{ open: boolean; front: string }>({
    open: false, front: '',
  })

  const reviewMutation = trpc.reading.review.useMutation()
  const extractMutation = trpc.reading.extract.useMutation({
    onSuccess: () => {
      utils.reading.listDue.invalidate()
      utils.reading.listAll.invalidate()
      toast.success('Added to reading queue')
    },
  })
  const terminateMutation = trpc.reading.terminateNote.useMutation({
    onSuccess: () => {
      toast.success('Saved as note')
      advance()
    },
    onError: () => toast.error('Failed to save note'),
  })

  useEffect(() => {
    if (dueItems && !initialized) {
      setInitialized(true)
      const items = dueItems as ReadingItem[]
      setQueue(items.slice(1))
      setCurrent(items[0] ?? null)
      if (items.length === 0) setDone(true)
    }
  }, [dueItems, initialized])

  // Server-side extracted texts + local immediate feedback
  const serverExtracts = allItems
    ?.filter(item => item.parentItemId === current?.id && item.extractedText)
    .map(item => item.extractedText as string) ?? []
  const extractedTexts = [...new Set([...serverExtracts, ...localExtracts])]

  async function handleRate(rating: 'Again' | 'Hard' | 'Good' | 'Easy') {
    if (!current || reviewMutation.isPending) return
    await reviewMutation.mutateAsync({ readingItemId: current.id, rating })
    utils.reading.listDue.invalidate()
    advance()
  }

  function advance() {
    setLocalExtracts([])
    const next = queue[0]
    if (!next) { setDone(true); setCurrent(null) }
    else { setCurrent(next); setQueue(q => q.slice(1)) }
  }

  function handleExtract(text: string) {
    if (!current) return
    setLocalExtracts(prev => [...prev, text])
    extractMutation.mutate({ parentItemId: current.id, selectedText: text })
  }

  function handleSaveAsNote(text: string) {
    setNoteDialog({ open: true, text, title: text.slice(0, 80).trim() })
  }

  function handleCreateFlashcard(text: string) {
    setFlashcardModal({ open: true, front: text })
  }

  if (isLoading) {
    return <SessionShell><p className="text-muted-foreground">Loading...</p></SessionShell>
  }

  if (done || !current) {
    return (
      <SessionShell>
        <div className="text-center py-12">
          <p className="text-lg font-medium mb-2">All caught up!</p>
          <p className="text-muted-foreground mb-4">No more items due right now.</p>
          <Link href="/reading" className="text-sm underline">Back to queue</Link>
        </div>
      </SessionShell>
    )
  }

  return (
    <SessionShell>
      <div className="relative">
        <SelectionToolbar
          contentId="reading-content"
          onExtract={handleExtract}
          onSaveAsNote={handleSaveAsNote}
          onCreateFlashcard={handleCreateFlashcard}
        />

        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{SOURCE_LABELS[current.sourceType] ?? current.sourceType}</Badge>
            <span className="text-xs text-muted-foreground">{queue.length} remaining</span>
          </div>
          <Link href="/reading" className="text-xs text-muted-foreground hover:underline">← Queue</Link>
        </div>

        <h1 className="text-xl font-semibold mb-4">{current.title}</h1>

        <div className="mb-8" id="reading-content">
          <ExtractHighlighter markdown={current.content} extractedTexts={extractedTexts} />
        </div>

        <div className="border-t pt-4">
          <p className="text-xs text-center text-muted-foreground mb-3">How well did you read this?</p>
          <RatingBar onRate={handleRate} isPending={reviewMutation.isPending} />
        </div>
      </div>

      {/* Save as Note dialog */}
      <Dialog open={noteDialog.open} onOpenChange={open => setNoteDialog(d => ({ ...d, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <Input
                value={noteDialog.title}
                onChange={e => setNoteDialog(d => ({ ...d, title: e.target.value }))}
              />
            </div>
            <p className="text-sm text-muted-foreground line-clamp-3">{noteDialog.text}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog(d => ({ ...d, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!current) return
                setNoteDialog(d => ({ ...d, open: false }))
                terminateMutation.mutate({
                  readingItemId: current.id,
                  title: noteDialog.title || undefined,
                })
              }}
              disabled={terminateMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flashcard modal */}
      <CardCreationModal
        open={flashcardModal.open}
        onClose={() => setFlashcardModal(d => ({ ...d, open: false }))}
        initialFront={flashcardModal.front}
      />
    </SessionShell>
  )
}

function SessionShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <nav className="flex flex-col gap-1">
          <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
          <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Tasks</Link>
          <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
          <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Decks</Link>
          <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Review</Link>
          <Link href="/reading" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Reading</Link>
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Settings</Link>
        </nav>
      </aside>
      <main className="flex-1 p-6 max-w-3xl">{children}</main>
    </div>
  )
}
```

- [ ] **Step 7.3: Verify TypeScript**

```bash
cd open-brain && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7.4: Commit**

```bash
git add open-brain/components/reading/SelectionToolbar.tsx open-brain/app/reading/session/page.tsx
git commit -m "feat(ui): add selection toolbar with Extract, Save as Note, and Flashcard actions"
```

---

## Task 8: Wikipedia Wikilink "+" Chips

**Files:**
- Modify: `open-brain/app/reading/session/page.tsx`

- [ ] **Step 8.1: Add Wikipedia link enrichment to ExtractHighlighter or session page**

The Wikipedia "+" chip needs to post-process the rendered content to detect Wikipedia links. Since `NoteViewer` uses react-markdown, we can add a custom link component that detects Wikipedia URLs.

Update `open-brain/components/reading/ExtractHighlighter.tsx` to accept an optional `onAddWikipediaLink` prop and render `+` chips next to Wikipedia links:

```typescript
'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { preprocessWikilinks } from '@/components/editor/NoteViewer'

interface Props {
  markdown: string
  extractedTexts: string[]
  onAddWikipediaLink?: (url: string) => void
}

function isWikipediaUrl(href: string): boolean {
  try {
    return new URL(href).hostname.endsWith('wikipedia.org')
  } catch {
    return false
  }
}

function markExtracts(markdown: string, extracts: string[]): string {
  let result = markdown
  for (const text of extracts) {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized) continue
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`(${escaped})`, 'gi'), '~~$1~~')
  }
  return result
}

export function ExtractHighlighter({ markdown, extractedTexts, onAddWikipediaLink }: Props) {
  const processedMarkdown = extractedTexts.length > 0
    ? markExtracts(markdown, extractedTexts)
    : markdown

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const isWiki = href && isWikipediaUrl(href)
            return (
              <span className="inline-flex items-center gap-0.5">
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                  {children}
                </a>
                {isWiki && onAddWikipediaLink && (
                  <button
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-green-700 text-xs leading-none hover:bg-green-200 ml-0.5"
                    title="Add to reading queue"
                    onClick={e => { e.preventDefault(); onAddWikipediaLink(href!) }}
                  >
                    +
                  </button>
                )}
              </span>
            )
          },
          del: ({ children }) => (
            <span className="bg-yellow-100/60 text-yellow-900/60 dark:bg-yellow-900/20 line-through">
              {children}
            </span>
          ),
        }}
      >
        {preprocessWikilinks(processedMarkdown)}
      </ReactMarkdown>
    </div>
  )
}
```

> **Note:** Using `~~text~~` strikethrough syntax (GFM) to mark extracted passages. The custom `del` renderer converts them to a highlighted/dimmed visual instead of actual strikethrough.

- [ ] **Step 8.2: Wire `onAddWikipediaLink` in session page**

In `open-brain/app/reading/session/page.tsx`, add the following mutation and handler, then pass `onAddWikipediaLink` to `ExtractHighlighter`:

Add mutation:
```typescript
const addWikipediaMutation = trpc.reading.addWikipedia.useMutation({
  onSuccess: (items) => {
    toast.success(`Added ${items.length} Wikipedia sections to queue`)
    utils.reading.listDue.invalidate()
  },
  onError: () => toast.error('Failed to add Wikipedia article'),
})
```

Add handler:
```typescript
async function handleAddWikipediaLink(url: string) {
  try {
    const sections = await utils.reading.fetchWikipedia.fetch({ url })
    addWikipediaMutation.mutate(
      sections.map(s => ({
        title: s.sectionTitle,
        content: s.content,
        articleUrl: s.articleUrl,
        sectionTitle: s.sectionTitle,
      })),
    )
  } catch {
    toast.error('Failed to fetch Wikipedia article')
  }
}
```

Update `ExtractHighlighter` usage in the JSX:
```tsx
<ExtractHighlighter
  markdown={current.content}
  extractedTexts={extractedTexts}
  onAddWikipediaLink={current.sourceType === 'WIKIPEDIA_SECTION' ? handleAddWikipediaLink : undefined}
/>
```

- [ ] **Step 8.3: Verify TypeScript**

```bash
cd open-brain && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8.4: Commit**

```bash
git add open-brain/components/reading/ExtractHighlighter.tsx open-brain/app/reading/session/page.tsx
git commit -m "feat(ui): add Wikipedia wikilink + chips for in-session queue expansion"
```

---

## Task 9: Note Detail Page — Add to Reading Queue Button

**Files:**
- Modify: `open-brain/app/notes/[slug]/page.tsx`

- [ ] **Step 9.1: Add the "Add to reading queue" button to the note detail page**

In `open-brain/app/notes/[slug]/page.tsx`, import and use the reading router:

After the existing tRPC imports, add:

```typescript
// After existing trpc query declarations:
const { data: readingItems } = trpc.reading.listAll.useQuery(
  { sourceNoteId: note?.id },
  { enabled: !!note?.id }
)
const addToQueueMutation = trpc.reading.addNote.useMutation({
  onSuccess: () => {
    toast.success('Added to reading queue')
    utils.reading.listAll.invalidate()
  },
  onError: () => toast.error('Failed to add to reading queue'),
})
```

Derive the queued state:
```typescript
const isQueued = readingItems && readingItems.length > 0
```

Add the button in the note action bar (near the existing Save/Edit buttons):
```tsx
<Button
  variant="outline"
  size="sm"
  disabled={isQueued || addToQueueMutation.isPending}
  onClick={() => note && addToQueueMutation.mutate({ noteId: note.id })}
>
  {isQueued ? 'In reading queue' : 'Add to reading queue'}
</Button>
```

- [ ] **Step 9.2: Verify TypeScript**

```bash
cd open-brain && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9.3: Run full test suite**

```bash
cd open-brain && npx jest
```

Expected: all tests pass.

- [ ] **Step 9.4: Commit**

```bash
git add open-brain/app/notes/\[slug\]/page.tsx
git commit -m "feat(ui): add 'Add to reading queue' button on note detail page"
```

---

## Self-Review Against Specs

**Spec coverage check:**

| Spec requirement | Task that covers it |
|---|---|
| ReadingItem data model (reading-queue) | Task 1 |
| Queue listing with due-first ordering | Task 3 (listDue) |
| Full queue listing with filters | Task 3 (listAll) |
| Add existing note to queue | Task 3 (addNote) |
| FSRS review advances scheduling | Task 3 (reviewItem) |
| Extract creates child ReadingItem | Task 3 (extractItem) |
| Terminate as note | Task 3 (terminateNote) |
| Queue overview page | Task 4 |
| Session loads highest-priority due item | Task 6 |
| Extracted passages highlighted | Task 8 (ExtractHighlighter ~~markup~~) |
| Text selection toolbar | Task 7 (SelectionToolbar) |
| Extract action from session | Task 7 |
| Save as Note terminal action | Task 7 |
| Create Flashcard terminal action | Task 7 (CardCreationModal) |
| FSRS rating bar | Task 6 (RatingBar) |
| Wikipedia fetch and section parsing | Task 2 (lib/wikipedia.ts) |
| Section-level Wikipedia queuing | Task 3 (addWikipedia) |
| Wikipedia add page with checklist | Task 5 |
| Wikilink follow "+" chip | Task 8 |
| Non-Wikipedia URL import | Task 3 (addUrl) + Task 5 |
| Flashcard provenance (sourceReadingItemId) | Task 1 (schema) + Task 7 (CardCreationModal used as-is; note: sourceReadingItemId not wired to the modal — see gap below) |
| Note provenance (sourceReadingItemId) | Task 1 (schema) + Task 3 (terminateNote) |
| Add to reading queue button on note detail | Task 9 |

**Gap identified — Flashcard sourceReadingItemId:** The `CardCreationModal` component accepts `noteId` but not `sourceReadingItemId`. When the user creates a flashcard from the session, the modal doesn't currently pass `sourceReadingItemId` to `flashcard.create`. 

**Fix:** Update `CardCreationModal` to accept an optional `sourceReadingItemId` prop and pass it to `flashcard.create`. Add this to Task 7's implementation:

In `open-brain/components/flashcard/CardCreationModal.tsx`, add `sourceReadingItemId?: string` to `CardCreationModalProps` and include it in the `createCard.mutate` call:

```typescript
// In CardCreationModalProps interface:
sourceReadingItemId?: string

// In handleSubmit:
createCard.mutate({
  type,
  front: front.trim(),
  back: type === 'BASIC' ? back.trim() || undefined : undefined,
  noteId: noteId || undefined,
  deckId: deckId || undefined,
  sourceReadingItemId: sourceReadingItemId || undefined,
})
```

Also update `server/routers/flashcard.ts` `create` procedure to accept `sourceReadingItemId: z.string().optional()` and persist it.

Pass it from session page:
```tsx
<CardCreationModal
  open={flashcardModal.open}
  onClose={() => setFlashcardModal(d => ({ ...d, open: false }))}
  initialFront={flashcardModal.front}
  sourceReadingItemId={current?.id}
/>
```

This fix should be implemented as part of Task 7 (Step 7.2).
