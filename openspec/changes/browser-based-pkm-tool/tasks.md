## 1. Project Scaffolding

- [ ] 1.1 Initialize Next.js 14 App Router project with TypeScript (`create-next-app`)
- [ ] 1.2 Install and configure Tailwind CSS
- [ ] 1.3 Install and configure shadcn/ui (init, add Button, Input, Dialog, Badge, Dropdown components)
- [ ] 1.4 Install tRPC (`@trpc/server`, `@trpc/client`, `@trpc/next`) and configure root router and context
- [ ] 1.5 Install Prisma and create initial schema file with `Note`, `NoteLink`, `Task`, and `User` models
- [ ] 1.6 Configure Prisma for SQLite default with `DATABASE_URL` env var
- [ ] 1.7 Create `.env.example` documenting all env vars (`DATABASE_URL`, `SESSION_SECRET`, `INITIAL_PASSWORD`, `PORT`, `BASE_URL`)
- [ ] 1.8 Set up path aliases and project folder structure (`app/`, `server/`, `lib/`, `components/`)

## 2. Database Schema & Migrations

- [ ] 2.1 Define `User` model: `id`, `passwordHash`, `createdAt`
- [ ] 2.2 Define `Note` model: `id` (UUID), `title`, `slug` (unique), `body`, `tags` (JSON), `createdAt`, `updatedAt`
- [ ] 2.3 Define `NoteLink` model: `id`, `sourceNoteId` (FK), `targetNoteId` (FK), unique constraint on `(sourceNoteId, targetNoteId)`
- [ ] 2.4 Define `Task` model: `id` (UUID), `title`, `status` (enum), `priority` (enum), `dueDate` (nullable), `noteId` (nullable FK), `createdAt`, `updatedAt`
- [ ] 2.5 Create SQLite FTS5 virtual table migration for note full-text search (raw SQL migration)
- [ ] 2.6 Run `prisma migrate dev` to generate and apply initial migration

## 3. Authentication & Self-Hosting

- [ ] 3.1 Install `iron-session` and create session config (secret from env, 30-day expiry, HTTP-only cookie)
- [ ] 3.2 Implement startup validation that exits with descriptive error if `SESSION_SECRET` is missing
- [ ] 3.3 Create `/setup` page and tRPC procedure: check if user exists, hash password with bcrypt (cost 12), store user
- [ ] 3.4 Create `/login` page and tRPC procedure: verify password against bcrypt hash, create session, redirect
- [ ] 3.5 Implement Next.js middleware that redirects unauthenticated requests to `/login` (except `/login` and `/setup`)
- [ ] 3.6 Add logic to redirect `/setup` to `/login` if a user already exists
- [ ] 3.7 Implement logout route that clears the session cookie
- [ ] 3.8 Write `Dockerfile` (multi-stage: builder + runner) with entrypoint running `prisma migrate deploy` then `next start`
- [ ] 3.9 Write `docker-compose.yml` with `app` service, named volume for SQLite, and env var passthrough

## 4. Note Editor — Core

- [ ] 4.1 Install Tiptap v2 (`@tiptap/react`, `@tiptap/starter-kit`) and create base `<NoteEditor>` component
- [ ] 4.2 Configure StarterKit extensions: headings, bold, italic, code, codeBlock, blockquote, lists, horizontalRule
- [ ] 4.3 Implement auto-save hook: debounce 1 second after last keystroke, call tRPC `note.update` mutation
- [ ] 4.4 Create tRPC `note` router with procedures: `list`, `getBySlug`, `create`, `update`, `delete`
- [ ] 4.5 Implement slug generation utility: lowercase, hyphenate, strip special chars, append suffix on collision
- [ ] 4.6 Build notes list page (`/`): fetch all notes sorted by `updatedAt` desc, render title + 120-char excerpt + date
- [ ] 4.7 Build note detail page (`/notes/[slug]`): load note, render `<NoteEditor>`, title input, tag input
- [ ] 4.8 Implement tag input component: comma-separated input, renders as Badge chips, persists on blur/enter
- [ ] 4.9 Implement tag filter: clicking a tag chip filters the notes list to matching notes
- [ ] 4.10 Add note deletion with confirmation dialog; redirect to `/` on success

## 5. Wikilinks & Backlinking

- [ ] 5.1 Implement custom Tiptap `WikilinkExtension`: parse `[[Title]]` text into `wikilink` nodes on input
- [ ] 5.2 Render resolved wikilink nodes as styled inline chips; render unresolved nodes with dimmed/dashed style
- [ ] 5.3 Implement wikilink autocomplete: detect `[[` trigger, query `note.searchTitles` tRPC procedure, show dropdown of up to 10 matches
- [ ] 5.4 Implement autocomplete selection: insert resolved `wikilink` node, close dropdown
- [ ] 5.5 Implement wikilink serializer: extract all `wikilink` nodes from editor JSON, return array of target note IDs
- [ ] 5.6 Create tRPC `noteLink.sync` procedure: diff new link set against existing `NoteLink` rows, delete removed, insert added (skip unresolved)
- [ ] 5.7 Wire auto-save to call `noteLink.sync` on every save with current wikilink node list
- [ ] 5.8 Build backlinks panel component: query `noteLink.getBacklinks(noteId)`, render source note title + 100-char context excerpt
- [ ] 5.9 Add backlink panel to note detail page layout

## 6. Graph View

- [ ] 6.1 Install React Flow (`reactflow`)
- [ ] 6.2 Create tRPC `graph.getAll` procedure: return all notes as nodes (`{id, title}`) and all `NoteLink` rows as edges
- [ ] 6.3 Build `/graph` page: fetch graph data, render React Flow canvas with force-directed layout (`d3-force` for positioning, React Flow for rendering)
- [ ] 6.4 Style note nodes as shadcn-themed cards showing truncated title (30 chars)
- [ ] 6.5 Implement node hover: highlight hovered node + direct edges + neighbor nodes; dim everything else
- [ ] 6.6 Implement node click: navigate to `/notes/[slug]` for the clicked note
- [ ] 6.7 Add "View in graph" button to note detail page that navigates to `/graph?focus=[noteId]`
- [ ] 6.8 Implement focus mode: when `?focus` param present, center on target node, dim/hide nodes beyond 2 hops
- [ ] 6.9 Add hop depth slider to focus mode UI (range 1–5, default 2); update visible node set on change

## 7. Task Management

- [ ] 7.1 Create tRPC `task` router with procedures: `list`, `create`, `update`, `delete`
- [ ] 7.2 Build `/tasks` page: fetch all tasks, group by status (TODO / IN_PROGRESS / DONE), sort by priority desc then dueDate asc
- [ ] 7.3 Implement task creation form: title input, priority select, due date picker; defaults to TODO + MEDIUM
- [ ] 7.4 Implement status toggle: checkbox for TODO↔DONE transition, status dropdown for full three-way control
- [ ] 7.5 Implement priority and due date edit via inline edit form (click-to-edit pattern)
- [ ] 7.6 Add status and priority filter controls to task list page
- [ ] 7.7 Implement task deletion with confirmation; remove from list on success
- [ ] 7.8 Implement Tiptap `TaskItemExtension`: parse `- [ ]` / `- [x]` checkbox list items as task nodes
- [ ] 7.9 Implement inline task sync on note save: diff checkbox nodes against `Task` rows for the note, insert new, update status changes, delete removed
- [ ] 7.10 Render linked note title (with link) on tasks in task list that have an associated `noteId`

## 8. Full-Text Search

- [ ] 8.1 Create `searchNotes(query)` raw-query helper supporting both SQLite FTS5 and Postgres `tsvector` (dialect detected from `DATABASE_URL`)
- [ ] 8.2 Sync FTS5/tsvector index on every `note.create`, `note.update`, `note.delete` and `task.create`, `task.update`, `task.delete`
- [ ] 8.3 Create tRPC `search.query` procedure: call search helper, return ranked results with type (`note` | `task`), title, snippet, and date
- [ ] 8.4 Build search modal component (`<SearchModal>`): `Cmd/Ctrl+K` keyboard shortcut opens/closes, input queries `search.query` with 200ms debounce
- [ ] 8.5 Render search results: type icon, title, 160-char snippet with matched terms bolded, date
- [ ] 8.6 Implement empty input state: show 5 most recently modified notes as quick-access list
- [ ] 8.7 Implement no-results state: display "No results for '[query]'" message
- [ ] 8.8 Mount `<SearchModal>` in root layout so it is available on all pages

## 9. Polish & Quality

- [ ] 9.1 Add responsive sidebar layout: notes list / navigation on left, main content on right; collapses on mobile
- [ ] 9.2 Add loading skeletons for notes list, note detail, and task list using shadcn Skeleton
- [ ] 9.3 Add optimistic updates on task status toggle (update UI before server confirms)
- [ ] 9.4 Implement 30-second SWR revalidation on notes list and task list to catch cross-tab changes
- [ ] 9.5 Add error boundary and toast notifications (shadcn Toast) for failed saves and mutations
- [ ] 9.6 Write Prisma seed script for development with sample notes, links, and tasks
- [ ] 9.7 Verify Docker Compose smoke test: `docker compose up`, create a note, restart container, confirm note persists
- [ ] 9.8 Write `README.md` covering: quickstart with Docker Compose, env var reference, Postgres upgrade path, development setup
