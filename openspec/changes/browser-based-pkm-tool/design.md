## Context

Greenfield project: a self-hostable, browser-based personal knowledge management tool inspired by Obsidian. The user owns all data; no cloud dependency. Stack is full-stack TypeScript with Next.js App Router, tRPC, Prisma, shadcn/ui, and Tailwind. The application must support bidirectional note linking, a graph view, integrated task management, and full-text search — all deployable via Docker Compose.

## Goals / Non-Goals

**Goals:**
- Single-user, self-hosted web application with password-protected access
- Real-time Markdown editing with `[[wikilink]]` syntax parsed into persisted link edges
- Automatic backlink index maintained on every note save
- Interactive graph view of note relationships
- Task management integrated with notes (inline tasks + standalone task view)
- Full-text search across notes and tasks
- Docker Compose deployment with SQLite default; Postgres optional via env var

**Non-Goals:**
- Multi-user / multi-tenant support (single owner only)
- Real-time collaboration (no CRDT / WebSocket sync)
- Mobile native app
- Plugin ecosystem (no extension API in v1)
- Paid cloud hosting offering

## Decisions

### 1. Next.js App Router + tRPC for the full-stack layer

**Decision:** Use Next.js 14 App Router for routing and server components, with tRPC for all data mutations and queries served via route handlers.

**Why over alternatives:**
- REST API: tRPC gives end-to-end type safety with zero schema duplication — critical for a TypeScript-first project.
- Remix: Next.js App Router + tRPC is the more established pattern for this stack and has better shadcn/ui ecosystem support.
- tRPC runs over standard HTTP so it's compatible with Docker/self-hosting without websocket infra.

### 2. Prisma + SQLite (default) / PostgreSQL (optional)

**Decision:** Prisma ORM with SQLite as the default database, switchable to PostgreSQL via `DATABASE_URL` env var.

**Why:**
- SQLite requires zero infrastructure for self-hosters — just a mounted volume. Perfect for single-user PKM.
- Prisma's migration system works identically across both dialects, making the Postgres upgrade path painless.
- Full-text search: SQLite FTS5 virtual table for SQLite; `pg_trgm` + `to_tsvector` for Postgres, abstracted behind a raw query helper.

### 3. Tiptap (ProseMirror) for the editor

**Decision:** Use Tiptap v2 as the rich text editor, configured for Markdown-style input with a custom `[[wikilink]]` extension.

**Why over alternatives:**
- CodeMirror 6: better for plain-text/code editing; Tiptap gives a richer node-based document model that makes wikilink nodes first-class (clickable, hoverable, rendered distinctly).
- Draft.js / Lexical: smaller ecosystems, less maintained.
- Custom wikilink Tiptap extension: parses `[[Note Title]]` as a node, resolves to a note record, renders as an inline chip with a link icon. On save, the extension's serializer extracts all link nodes and persists them to the `NoteLink` join table.

### 4. React Flow for graph view

**Decision:** Use React Flow (not D3.js) for the interactive graph canvas.

**Why over D3:**
- React Flow is React-native — nodes are React components, which means they can use shadcn/ui styling and respond to state naturally.
- D3's imperative DOM manipulation is awkward to integrate with React's virtual DOM.
- React Flow handles zoom, pan, and drag out of the box.

### 5. Link / backlink persistence model

**Decision:** Maintain a dedicated `NoteLink` table (`sourceNoteId → targetNoteId`) updated on every note save via a diff algorithm.

**Why not parse on read:**
- Graph view and backlink panel both need to query links across all notes efficiently. Parsing on read would require loading all note bodies.
- The diff on save approach (compute new links from editor content, delete removed, insert added) keeps the index fresh with minimal overhead.

### 6. Task management model

**Decision:** Tasks are first-class database entities (`Task` table) with an optional `noteId` foreign key for inline tasks, plus a standalone task view.

**Why:**
- Inline tasks (Markdown checkboxes parsed by the editor) are synced to the `Task` table on save via the same Tiptap extension pattern as wikilinks.
- Standalone tasks have no associated note. Both surfaces share the same tRPC `task` router.
- Status values: `TODO | IN_PROGRESS | DONE`. Priority: `LOW | MEDIUM | HIGH`. Due date: nullable ISO date.

### 7. Authentication

**Decision:** Single-user session auth with a bcrypt-hashed password stored in the database, managed via Next.js middleware + `iron-session` (encrypted cookie).

**Why:**
- No OAuth needed for a self-hosted single-user tool.
- `iron-session` is lightweight and stateless (no Redis required).
- Password set via environment variable on first boot (or via a setup wizard on first visit if `INITIAL_PASSWORD` is not set).

### 8. Search

**Decision:** Database-native full-text search (SQLite FTS5 / Postgres tsvector) rather than a client-side library like Fuse.js.

**Why:**
- A PKM can accumulate thousands of notes; loading all into memory for client-side search doesn't scale.
- SQLite FTS5 is built-in and fast for the single-user case.
- Results ranked by BM25 relevance score.

## Risks / Trade-offs

- **SQLite concurrency** → SQLite is single-writer; fine for a single-user app but would be a blocker for multi-user. Mitigation: Document the Postgres path clearly; WAL mode enabled by default.
- **Tiptap wikilink extension complexity** → Custom ProseMirror extensions have a steep learning curve; bugs here affect the core editing experience. Mitigation: Isolated unit tests for the extension's serializer; fallback to plain `[[text]]` if node resolution fails.
- **React Flow performance on large graphs** → Rendering 1000+ nodes can lag. Mitigation: Implement a viewport culling strategy and cap initial render to top-N connected nodes, with a "show all" toggle.
- **FTS5 vs tsvector divergence** → Two code paths for search. Mitigation: Abstract behind a single `searchNotes(query)` Prisma raw-query helper; integration tests run against both dialects in CI.
- **No real-time sync** → Multiple browser tabs can show stale data. Mitigation: Add a simple polling SWR strategy (30s revalidation) and an optimistic update pattern on mutations.

## Migration Plan

This is a greenfield project; no existing data to migrate.

Deployment steps:
1. `docker compose up` — starts Next.js app + database volume
2. On first boot, if no user exists, redirect to `/setup` to set password
3. `prisma migrate deploy` runs automatically in the Docker entrypoint
4. To switch to Postgres: update `DATABASE_URL` in `.env`, re-run migrations

Rollback: since data lives in a volume-mounted database file (SQLite) or external Postgres, rolling back the container image preserves all notes.

## Open Questions

- Should tags be free-form strings or a normalized `Tag` table? (Free-form is simpler; normalized enables tag rename propagation — defer to specs phase.)
- Daily notes / journal feature: in scope for v1 or v2? (Likely v2 — not in proposal.)
- Export formats: Markdown zip export is obvious; should we also support Obsidian vault format compatibility? (Nice to have — not blocking v1.)
