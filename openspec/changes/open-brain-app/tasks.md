## 1. Project Scaffolding

- [ ] 1.1 Initialize Next.js 14 App Router project with TypeScript (`create-next-app`)
- [ ] 1.2 Install and configure Tailwind CSS
- [ ] 1.3 Install and configure shadcn/ui (init; add Button, Input, Dialog, Badge, Dropdown, Skeleton, Toast components)
- [ ] 1.4 Install tRPC (`@trpc/server`, `@trpc/client`, `@trpc/next`) and configure root router and context
- [ ] 1.5 Install Prisma and create initial schema file with all models: `User`, `Note`, `NoteLink`, `Task`, `Deck`, `Flashcard`, `DeckCard`, `PeriodicTemplate`
- [ ] 1.6 Configure Prisma for SQLite default with `DATABASE_URL` env var
- [ ] 1.7 Create `.env.example` documenting all env vars (`DATABASE_URL`, `SESSION_SECRET`, `INITIAL_PASSWORD`, `PORT`, `BASE_URL`)
- [ ] 1.8 Set up path aliases and project folder structure (`app/`, `server/`, `lib/`, `components/`)

## 2. Database Schema & Migrations

- [ ] 2.1 Define `User` model: `id`, `passwordHash`, `createdAt`
- [ ] 2.2 Define `Note` model: `id` (UUID), `title`, `slug` (unique), `body`, `tags` (JSON), `periodType` (nullable enum), `periodKey` (nullable string), unique constraint on `(periodType, periodKey)`, `createdAt`, `updatedAt`
- [ ] 2.3 Define `NoteLink` model: `id`, `sourceNoteId` (FK), `targetNoteId` (FK), unique constraint on `(sourceNoteId, targetNoteId)`
- [ ] 2.4 Define `Task` model: `id` (UUID), `title`, `status` (TODO|IN_PROGRESS|DONE), `priority` (LOW|MEDIUM|HIGH), `dueDate` (nullable), `noteId` (nullable FK), `deletedAt` (nullable), `createdAt`, `updatedAt`
- [ ] 2.5 Define `Deck` model: `id` (UUID), `name`, `createdAt`, `updatedAt`
- [ ] 2.6 Define `Flashcard` model: `id` (UUID), `type` (BASIC|CLOZE), `front`, `back` (nullable), `clozeIndex` (nullable int), `noteId` (nullable FK, onDelete: SetNull), FSRS fields (`stability`, `difficulty`, `due`, `reps`, `lapses`, `state`, `lastReview`), `deletedAt` (nullable), `createdAt`
- [ ] 2.7 Define `DeckCard` join model: composite PK `(deckId, cardId)`, cascade delete on both FKs
- [ ] 2.8 Define `PeriodicTemplate` model: `id`, `periodType` (enum, unique), `content` (JSON Tiptap content), `updatedAt`
- [ ] 2.9 Create SQLite FTS5 virtual table migration for note and task full-text search (raw SQL migration)
- [ ] 2.10 Run `prisma migrate dev` to generate and apply initial migration

## 3. Authentication & Self-Hosting

- [ ] 3.1 Install `iron-session` and create session config (secret from env, 30-day expiry, HTTP-only cookie)
- [ ] 3.2 Implement startup validation that exits with descriptive error if `SESSION_SECRET` is missing
- [ ] 3.3 Create `/setup` page and tRPC procedure: check if user exists, hash password with bcrypt (cost 12), store user; redirect to `/login` if user already exists
- [ ] 3.4 Implement `INITIAL_PASSWORD` env var handling: on boot with no user, auto-create user from env var without requiring `/setup`
- [ ] 3.5 Create `/login` page and tRPC procedure: verify password against bcrypt hash, create session, redirect to `/`
- [ ] 3.6 Implement Next.js middleware protecting all routes; exempt `/login` and `/setup`
- [ ] 3.7 Implement logout route that clears the session cookie and redirects to `/login`
- [ ] 3.8 Write `Dockerfile` (multi-stage: builder + runner) with entrypoint running `prisma migrate deploy` then `next start`
- [ ] 3.9 Write `docker-compose.yml` with `app` service, named volume for SQLite, and env var passthrough

## 4. Note Editor — Core

- [ ] 4.1 Install Tiptap v2 (`@tiptap/react`, `@tiptap/starter-kit`) and create base `<NoteEditor>` component
- [ ] 4.2 Configure StarterKit: headings H1–H3, bold, italic, code, codeBlock, blockquote, ordered/unordered lists, horizontalRule
- [ ] 4.3 Implement auto-save hook: debounce 1 second after last keystroke, call tRPC `note.update`
- [ ] 4.4 Create tRPC `note` router with procedures: `list`, `getBySlug`, `create`, `update`, `delete`
- [ ] 4.5 Implement slug generation utility: lowercase, hyphenate, strip special chars, append numeric suffix on collision
- [ ] 4.6 Build notes list page (`/`): fetch all notes sorted by `updatedAt` desc, render title + 120-char excerpt + date
- [ ] 4.7 Build note detail page (`/notes/[slug]`): load note, render `<NoteEditor>`, title input, tag input
- [ ] 4.8 Implement tag input component: comma/Enter-separated input, renders as removable Badge chips, persists on blur/enter
- [ ] 4.9 Implement tag filter: clicking a tag chip in the notes list filters to matching notes
- [ ] 4.10 Add note deletion with confirmation dialog; redirect to `/` on success

## 5. Wikilinks & Backlinking

- [ ] 5.1 Implement custom Tiptap `WikilinkExtension`: parse `[[Title]]` into `wikilink` nodes on input
- [ ] 5.2 Render resolved wikilink nodes as styled inline chips; unresolved nodes with dimmed/dashed style
- [ ] 5.3 Implement wikilink autocomplete: detect `[[` trigger, query `note.searchTitles`, show dropdown of up to 10 matches
- [ ] 5.4 Implement autocomplete selection: insert resolved `wikilink` node, close dropdown
- [ ] 5.5 Implement wikilink serializer: extract all `wikilink` nodes from editor JSON, return array of target note IDs
- [ ] 5.6 Create tRPC `noteLink.sync` procedure: diff new link set against existing `NoteLink` rows, delete removed, insert added (skip unresolved)
- [ ] 5.7 Wire auto-save to call `noteLink.sync` on every save with current wikilink node list
- [ ] 5.8 Build backlinks panel component: query `noteLink.getBacklinks(noteId)`, render source note title + 100-char context excerpt
- [ ] 5.9 Add backlink panel to note detail page layout

## 6. Knowledge Graph

- [ ] 6.1 Install React Flow (`reactflow`) and `d3-force`
- [ ] 6.2 Create tRPC `graph.getAll` procedure: return all notes as nodes (`{ id, title, slug }`) and all `NoteLink` rows as edges
- [ ] 6.3 Build `/graph` page: fetch graph data, render React Flow canvas with d3-force layout positioning
- [ ] 6.4 Style note nodes as shadcn-themed cards showing truncated title (30 chars)
- [ ] 6.5 Implement node hover: highlight hovered node + direct edges + neighbours; dim everything else
- [ ] 6.6 Implement node click: navigate to `/notes/[slug]`
- [ ] 6.7 Add "View in graph" button on note detail page navigating to `/graph?focus=[noteId]`
- [ ] 6.8 Implement focus mode: when `?focus` param present, centre on target node, hide nodes beyond 2 hops
- [ ] 6.9 Add hop depth slider to focus mode UI (range 1–5, default 2); update visible node set on change

## 7. Task Management

- [ ] 7.1 Create tRPC `task` router with procedures: `list`, `create`, `update`, `delete`
- [ ] 7.2 Build `/tasks` page: fetch all tasks, group by status, sort by priority desc then dueDate asc
- [ ] 7.3 Implement task creation form: title, priority select, due date picker; defaults to TODO + MEDIUM
- [ ] 7.4 Implement status toggle: checkbox for TODO↔DONE; status dropdown for three-way control
- [ ] 7.5 Implement priority and due date inline edit (click-to-edit pattern)
- [ ] 7.6 Add status and priority filter controls to task list page
- [ ] 7.7 Implement task deletion with confirmation dialog
- [ ] 7.8 Implement Tiptap `TaskItemExtension`: parse `- [ ]` / `- [x]` checkbox list items as task nodes
- [ ] 7.9 Implement inline task sync on note save: diff checkbox nodes against `Task` rows for the note; insert new, update status, soft-delete removed
- [ ] 7.10 Render linked note title (with link) on tasks in `/tasks` that have an associated `noteId`

## 8. Full-Text Search

- [ ] 8.1 Create `searchNotes(query)` raw-query helper supporting both SQLite FTS5 and Postgres `tsvector` (dialect detected from `DATABASE_URL`)
- [ ] 8.2 Sync FTS5/tsvector index on every `note.create`, `note.update`, `note.delete`, `task.create`, `task.update`, `task.delete`
- [ ] 8.3 Create tRPC `search.query` procedure: call search helper, return ranked results with `type`, `id`, `title`, `snippet` (160 chars, matched terms bolded), `updatedAt`
- [ ] 8.4 Build `<SearchModal>`: `⌘K` / `Ctrl+K` shortcut opens/closes; input queries `search.query` with 200ms debounce
- [ ] 8.5 Render search results: type icon, title, snippet, date; keyboard navigation with arrow keys + Enter
- [ ] 8.6 Implement empty input state: show 5 most recently modified notes as quick-access list
- [ ] 8.7 Implement no-results state: display `No results for '[query]'`
- [ ] 8.8 Mount `<SearchModal>` in root layout

## 9. Periodic Notes

- [ ] 9.1 Add `periodType` (nullable `PeriodType` enum) and `periodKey` (nullable string) to `Note` model; add unique constraint on `(periodType, periodKey)`; run migration
- [ ] 9.2 Create `PeriodicTemplate` model and tRPC `periodicTemplate` router: `get`, `upsert` procedures
- [ ] 9.3 Implement `note.getOrCreatePeriodic({ periodType, periodKey })` tRPC procedure: return existing note or create from template (idempotent)
- [ ] 9.4 Implement period key generation utilities: `todayKey()`, `weekKey(date)`, `monthKey(date)`, `quarterKey(date)`, `yearKey(date)`
- [ ] 9.5 Build `<CalendarNavigator>` sidebar component with five tabs (Day/Week/Month/Quarter/Year); highlight today and dates with existing periodic notes
- [ ] 9.6 Wire calendar day/week/month/quarter/year clicks to `note.getOrCreatePeriodic` and navigate to the resulting note
- [ ] 9.7 Implement periodic wikilink resolution in `WikilinkExtension`: detect `[[daily/YYYY-MM-DD]]`, `[[weekly/YYYY-WNN]]`, etc. and resolve to the matching periodic note via `note.getOrCreatePeriodic`
- [ ] 9.8 Add template editor UI in settings page: one Tiptap editor per period type, saved via `periodicTemplate.upsert`

## 10. Flashcard System — Data & Core

- [ ] 10.1 Create tRPC `flashcard` router with procedures: `listByNote`, `create`, `update`, `softDelete`
- [ ] 10.2 Create tRPC `deck` router with procedures: `list`, `create`, `rename`, `delete`
- [ ] 10.3 Create tRPC `review` router with procedures: `listDue`, `dueCounts`, `rate`
- [ ] 10.4 Install `ts-fsrs` and implement `computeNextState(card, rating)` helper wrapping `fsrs().next()`
- [ ] 10.5 Implement `review.rate` mutation: accept `{ cardId, rating }`, call `computeNextState`, persist updated FSRS fields, return updated card + sibling data for cloze rendering

## 11. Flashcard System — Editor Integration

- [ ] 11.1 Implement Tiptap `ClozeExtension`: parse `{{c1::answer}}` syntax into cloze nodes; render as highlighted blanks in edit mode
- [ ] 11.2 Implement cloze serializer: scan Tiptap JSON for cloze nodes, extract `{ front, clozeIndex }` tuples
- [ ] 11.3 Implement cloze sync on note save: diff cloze tuples against `Flashcard` rows for the note; insert new (skip soft-deleted), soft-delete removed, restore if re-added
- [ ] 11.4 Implement `⌘⇧F` shortcut: detect text selection, open card creation modal with `front` pre-filled
- [ ] 11.5 Build card creation modal: `type` toggle (Basic/Cloze), `front` input, `back` input (hidden for cloze), deck selector; on submit call `flashcard.create`
- [ ] 11.6 Build `<CardsPanel>` sidebar component: query `flashcard.listByNote(noteId)`, display cards with type badges; "Add card" button opens creation modal
- [ ] 11.7 Add `<CardsPanel>` to note detail page layout alongside backlinks panel

## 12. Flashcard System — Review UI

- [ ] 12.1 Build `/decks` page: list all decks with card counts; create/rename/delete deck controls
- [ ] 12.2 Build `/review` hub page: query `review.dueCounts`, display per-deck due counts + "All due cards" virtual row; auto-revalidate every 60s
- [ ] 12.3 Build `/review/session` page: on mount fetch `review.listDue({ deckId })`, store queue in React state
- [ ] 12.4 Implement card flip UI: show front on load; Space/Enter reveals answer side
- [ ] 12.5 Implement rating buttons (Again/Hard/Good/Easy) with keyboard shortcuts (1–4): call `review.rate`, advance queue
- [ ] 12.6 Implement cloze card rendering: display tested blank as `[...]` on front; reveal answer on flip; render sibling blanks from response data
- [ ] 12.7 Implement "Again" re-queue logic: append card to end of session queue, cap at 3 requeues per card per session
- [ ] 12.8 Build session complete screen: show cards reviewed, again count, estimated next session size (count of cards due tomorrow)
- [ ] 12.9 Show next-due interval on each rating button (e.g. "Good — 8d") by pre-computing FSRS previews client-side

## 13. Polish & Quality

- [ ] 13.1 Add responsive sidebar layout: notes list / navigation on left, main content on right; collapses on mobile
- [ ] 13.2 Add loading skeletons for notes list, note detail, and task list using shadcn Skeleton
- [ ] 13.3 Add optimistic updates on task status toggle and flashcard rating
- [ ] 13.4 Implement 30-second SWR revalidation on notes list and task list
- [ ] 13.5 Add error boundary and toast notifications (shadcn Toast) for failed saves and mutations
- [ ] 13.6 Write Prisma seed script: sample notes with wikilinks, tasks, flashcards, and periodic notes
- [ ] 13.7 Write integration tests for `WikilinkExtension` serializer, `ClozeExtension` sync, and `searchNotes` helper against both SQLite and Postgres
- [ ] 13.8 Verify Docker Compose smoke test: `docker compose up`, create a note, add a flashcard, restart container, confirm both persist
- [ ] 13.9 Write `README.md`: quickstart with Docker Compose, env var reference, Postgres upgrade path, development setup, periodic note templates guide
