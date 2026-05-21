## Context

Greenfield project: a self-hostable, browser-based personal knowledge management tool inspired by Obsidian and Capacities. The user owns all data; no cloud dependency, no Electron. The stack is full-stack TypeScript with Next.js App Router, tRPC, Prisma, shadcn/ui, and Tailwind, deployable via Docker Compose.

This change formalizes the project as **open-brain** and extends the prior `browser-based-pkm-tool` design with a first-class Anki-style spaced repetition flashcard system. The core PKM features (wikilink editor, backlinks, graph view, task management, full-text search, auth) carry over from that design unchanged; this document adds flashcard-specific decisions and consolidates the complete architecture.

## Goals / Non-Goals

**Goals:**
- Single-user, self-hosted web app with password-protected access
- Real-time Markdown editing with `[[wikilink]]` syntax and automatic backlink index
- Interactive knowledge graph view
- Task management integrated with notes (inline tasks + standalone task view)
- Full-text search across notes and tasks
- Bidirectional flashcard system: cards created from notes or standalone, reviewed via FSRS-scheduled sessions
- Periodic notes: auto-created daily, weekly, monthly, quarterly, and yearly note templates accessible via a calendar-style navigator
- Docker Compose deployment with SQLite default; Postgres optional via env var

**Non-Goals:**
- Multi-user / multi-tenant support
- Real-time collaboration (no CRDT / WebSocket sync)
- Mobile native app
- Plugin ecosystem (no extension API in v1)
- Paid cloud hosting
- Image occlusion flashcard type (v2)
- AI-generated flashcards (v2)

## Decisions

### D1: Next.js App Router + tRPC for the full-stack layer

**Choice:** Next.js 14 App Router for routing and server components; tRPC for all data mutations and queries via route handlers.

**Rationale:** tRPC gives end-to-end type safety with zero schema duplication — critical for a TypeScript-first project. Next.js App Router + tRPC is the established pattern for this stack with strong shadcn/ui ecosystem support. tRPC runs over standard HTTP, compatible with Docker/self-hosting without WebSocket infrastructure.

**Alternatives considered:**
- *REST API* — no type safety without a separate schema layer (e.g., Zod + OpenAPI); more boilerplate
- *Remix* — less established with this specific stack combination; shadcn/ui ecosystem more Next.js-centric

### D2: Prisma + SQLite (default) / PostgreSQL (optional)

**Choice:** Prisma ORM with SQLite as the default, switchable to PostgreSQL via `DATABASE_URL`.

**Rationale:** SQLite requires zero infrastructure — just a mounted volume. Perfect for single-user self-hosting. Prisma migrations work identically across both dialects, making the Postgres upgrade path painless.

**Full-text search:** SQLite FTS5 virtual table for SQLite; `pg_trgm` + `to_tsvector` for Postgres, abstracted behind a `searchNotes(query)` raw-query helper. Results ranked by BM25/tsvector relevance.

**Alternatives considered:**
- *Postgres-only* — heavier infrastructure requirement; breaks the zero-setup self-hosting story
- *No ORM (raw SQL)* — loses migration tooling and type-safe query builder

### D3: Tiptap (ProseMirror) for the editor

**Choice:** Tiptap v2 with StarterKit plus four custom extensions: `WikilinkExtension`, `TaskItemExtension`, `ClozeExtension`, and a card-creation toolbar action.

**Rationale:** Tiptap's node-based document model makes wikilinks and cloze blanks first-class (clickable, hoverable, rendered distinctly). A ProseMirror extension can intercept serialization to diff-sync both NoteLink rows and Flashcard rows on save.

**WikilinkExtension:** parses `[[Title]]` as a node; resolves to note record; renders as inline chip. On save, serializer extracts all link nodes and syncs the `NoteLink` join table.

**ClozeExtension:** parses `{{c1::answer}}` syntax as a cloze node; renders as highlighted blank in edit mode and as a reviewable blank in read mode. On save, serializer extracts cloze nodes, diffs against `Flashcard` rows for this note.

**Alternatives considered:**
- *CodeMirror 6* — better for plain-text/code; no first-class node model for wikilinks
- *Draft.js / Lexical* — smaller ecosystems, less maintained

### D4: React Flow for the graph view

**Choice:** React Flow (not D3) for the interactive graph canvas, with `d3-force` for layout positioning only.

**Rationale:** React Flow nodes are React components — they use shadcn/ui styling and respond to state naturally. D3's imperative DOM manipulation is awkward alongside React's virtual DOM. React Flow handles zoom, pan, and drag out of the box.

**Alternatives considered:**
- *D3 only* — imperative model conflicts with React; harder to style consistently
- *Cytoscape.js* — less React-native; heavier dependency

### D5: Link / backlink persistence via NoteLink table

**Choice:** Dedicated `NoteLink` table (`sourceNoteId → targetNoteId`) updated on every note save via diff algorithm.

**Rationale:** Graph view and backlink panel both need to query links across all notes efficiently. Parsing on read would require loading all note bodies. The diff-on-save approach keeps the index fresh with minimal overhead.

### D6: Task management as first-class entities

**Choice:** `Task` table with optional `noteId` FK. Inline tasks (Markdown checkboxes) synced to `Task` rows on save via `TaskItemExtension`. Status: `TODO | IN_PROGRESS | DONE`. Priority: `LOW | MEDIUM | HIGH`. Due date: nullable.

**Rationale:** Inline and standalone tasks share the same tRPC `task` router. Tasks survive note deletion (FK nullable).

### D7: Authentication via iron-session

**Choice:** Single-user session auth with a bcrypt-hashed password in the database, managed via Next.js middleware + `iron-session` (encrypted cookie).

**Rationale:** No OAuth needed for a self-hosted single-user tool. `iron-session` is lightweight and stateless (no Redis required). Password set via `INITIAL_PASSWORD` env var on first boot, or via a `/setup` wizard if the env var is absent.

### D8: Flashcard–note integration (bidirectional)

**Choice:** Cards can be created from notes AND exist independently. Notes show associated cards in a sidebar panel. Decks are named collections — not tied to a single note.

**Rationale:** Note-first-only is too constraining (vocab lists, formulas); standalone-only loses the tight PKM integration. Bidirectional gives users both workflows without forcing either.

**Alternatives considered:**
- *Note-first only* — can't create standalone cards without a source note
- *Standalone decks only* — knowledge stays siloed from notes; misses the PKM advantage

### D9: FSRS v5 via ts-fsrs

**Choice:** `ts-fsrs` — the official TypeScript port of FSRS v5, maintained by the open-spaced-repetition org.

**Rationale:** FSRS is more accurate than SM-2 at the same review load and is what Anki adopted in 2023. Starting greenfield with the better algorithm costs nothing.

**Integration pattern:**
```ts
import { fsrs, generatorParameters, Rating } from 'ts-fsrs'
const f = fsrs(generatorParameters({ enable_fuzz: true }))
const { card: nextCard } = f.next(currentCard, now, rating)
// Persist nextCard fields to Flashcard row
```

**Alternatives considered:**
- *SM-2* — demonstrably less accurate; no reason to start with the older algorithm
- *Fixed intervals* — appropriate for casual use; not for serious spaced repetition

### D10: Card types — Basic + Cloze (image occlusion v2)

**Choice:** Basic (front/back flip) and Cloze (`{{c1::answer}}` syntax) for v1. Each cloze blank is a separate `Flashcard` row sharing the same `front` template with a `clozeIndex` int.

**Rationale:** Cloze pairs naturally with note content. Storing one row per blank keeps FSRS scheduling per-blank, which is how Anki handles it. Image occlusion requires a canvas-based review UI — significant added complexity, explicitly deferred.

**Schema extensibility for v2:** `CardType` enum gains `IMAGE_OCCLUSION`; `Flashcard` gains `occlusionData: Json?` — no breaking migration required.

### D11: Card creation UX — shortcut + sidebar panel

**Choice:** Both the `⌘⇧F` highlight-to-card shortcut and a persistent cards sidebar panel on note detail pages.

**Rationale:** The shortcut serves the fast-capture use case; the panel serves the browse-and-manage use case. Cloze creation uses the `{{c1::}}` syntax directly in the editor and syncs on save.

### D12: Review session — /review hub → full-screen session

**Choice:** `/review` deck hub showing per-deck due counts → `/review/session?deckId=[id]` (per-deck) or `/review/session` (all due cards) full-screen flip UI.

**Rationale:** The hub gives an overview before committing; the full-screen session minimizes distraction during review. Session queue lives in React state after initial fetch — no per-card refetches. "Again" cards re-enter the end of the queue (capped at 3 requeues per session).

### D13: Periodic notes (daily / weekly / monthly / quarterly / yearly)

**Choice:** First-class periodic note templates accessible via a calendar-style navigator in the sidebar. Each period type has its own template (configurable). Opening a period note for a date auto-creates the note if it doesn't exist, using the template.

**Supported periods:** Day, Week, ISO week, Month, Quarter, Year.

**Rationale:** Periodic notes are a core journaling and review workflow in PKM tools like Obsidian and Capacities. Supporting all five granularities in v1 gives users a complete journaling stack without needing a plugin.

**Implementation approach:**
- `Note` model gains a `periodType: PeriodType?` enum field (`DAY | WEEK | MONTH | QUARTER | YEAR`) and a `periodKey: String?` (e.g., `"2026-05-19"`, `"2026-W21"`, `"2026-05"`, `"2026-Q2"`, `"2026"`) with a unique constraint on `(periodType, periodKey)`.
- A `PeriodicTemplate` model stores user-defined Tiptap JSON templates per period type.
- tRPC procedure `note.getOrCreatePeriodic({ periodType, periodKey })` — idempotent, creates from template if absent.
- Calendar navigator component in sidebar: shows current day/week/month; clicking a date opens the day note; tabs switch between granularities.
- Wikilinks like `[[daily/2026-05-19]]` resolve to the correct periodic note.

**Alternatives considered:**
- *Plugin/extension only (v2)* — rejected; periodic notes are a fundamental workflow, not an advanced feature

### D14: Flashcard data model

Three new Prisma models alongside existing `Note`, `NoteLink`, `Task`, `User`:

```prisma
model Deck {
  id        String     @id @default(uuid())
  name      String
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  cards     DeckCard[]
}

model Flashcard {
  id          String     @id @default(uuid())
  type        CardType
  front       String
  back        String?
  clozeIndex  Int?
  noteId      String?
  note        Note?      @relation(fields: [noteId], references: [id], onDelete: SetNull)
  decks       DeckCard[]
  stability   Float      @default(0)
  difficulty  Float      @default(0)
  due         DateTime   @default(now())
  reps        Int        @default(0)
  lapses      Int        @default(0)
  state       FSRSState  @default(NEW)
  lastReview  DateTime?
  deletedAt   DateTime?
  createdAt   DateTime   @default(now())
}

model DeckCard {
  deck    Deck      @relation(fields: [deckId], references: [id], onDelete: Cascade)
  deckId  String
  card    Flashcard @relation(fields: [cardId], references: [id], onDelete: Cascade)
  cardId  String
  @@id([deckId, cardId])
}

enum CardType  { BASIC CLOZE }
enum FSRSState { NEW LEARNING REVIEW RELEARNING }
```

**Key model decisions:**
- FSRS state denormalized onto card row — due-date query is `WHERE due <= now() AND deletedAt IS NULL`
- `onDelete: SetNull` on `noteId` — deleting a note orphans cards (they survive in decks)
- `deletedAt` soft-delete — prevents cloze sync from re-creating manually deleted cards
- No tags on cards — deck membership serves that purpose

## Risks / Trade-offs

- [Risk] **SQLite concurrency** → single-writer; fine for single-user, blocks multi-user. Mitigation: WAL mode enabled by default; document Postgres upgrade path.
- [Risk] **Tiptap wikilink + cloze extension complexity** → custom ProseMirror extensions have a steep learning curve; bugs affect core editing. Mitigation: isolated unit tests for each extension's serializer; fallback to plain text if node resolution fails.
- [Risk] **React Flow performance on large graphs** → 1000+ nodes can lag. Mitigation: viewport culling + cap initial render to top-N connected nodes with a "show all" toggle.
- [Risk] **FTS5 vs tsvector divergence** → two search code paths. Mitigation: single `searchNotes(query)` helper; integration tests run against both dialects in CI.
- [Risk] **Cloze sync re-creating deleted cards** → user removes `{{c1::}}` syntax, then re-adds it. Mitigation: `deletedAt` soft-delete; cloze sync skips soft-deleted rows.
- [Risk] **Cloze sibling rendering** → review session needs sibling card data to render `[…]` for non-tested blanks. Mitigation: `review.rate` response includes siblings; dedicated integration test.
- [Risk] **ts-fsrs version lock** → FSRS parameters are algorithm-version-specific. Mitigation: pin to a specific minor version; document upgrade path in README.
- [Trade-off] **Session queue lost on page refresh** → client-side queue means refresh resets progress. Accepted: same behavior as Anki; acceptable for v1.
- [Trade-off] **No real-time sync across tabs** → stale data possible. Mitigation: 30s SWR revalidation on notes list and task list; optimistic updates on mutations.

## Migration Plan

Greenfield project — no existing data to migrate.

**Deployment:**
1. `docker compose up` — starts Next.js app + database volume
2. On first boot, if no user exists, redirect to `/setup` to set password (or read `INITIAL_PASSWORD` from env)
3. `prisma migrate deploy` runs automatically in the Docker entrypoint
4. To switch to Postgres: update `DATABASE_URL` in `.env`, re-run migrations

**Rollback:** Data lives in a volume-mounted SQLite file (or external Postgres). Rolling back the container image preserves all notes, tasks, and flashcard review history.

## Open Questions

- Should tags on notes be free-form strings or a normalized `Tag` table? (Free-form is simpler; normalized enables rename propagation — defer to specs phase.)
- Deck auto-creation from note tags: if a note has tag `biology`, should a `biology` deck be offered automatically? (Nice to have — not blocking v1.)
- Export formats: Markdown zip export is obvious; Obsidian vault format compatibility? (Nice to have — not blocking v1.)
