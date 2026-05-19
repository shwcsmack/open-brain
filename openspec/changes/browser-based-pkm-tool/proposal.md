## Why

Obsidian and similar PKM tools are either desktop-only or locked behind proprietary cloud services, leaving a gap for a fully open-source, self-hostable, browser-based alternative. Building this now lets users own their knowledge graph entirely — no vendor lock-in, no electron dependency, accessible from any device with a browser.

## What Changes

- Introduce a new full-stack TypeScript application (Next.js + tRPC + Prisma) serving as a self-hostable personal knowledge management tool
- Add a rich Markdown note editor with wiki-style `[[link]]` syntax for creating forward links between notes
- Add automatic backlink tracking so every note shows what other notes link to it
- Add an interactive graph view visualizing the note link graph
- Add a task management system integrated with notes (tasks can be created inline in notes or in a dedicated task view)
- Add full-text search across all notes and tasks
- Ship with Docker Compose for easy self-hosting

## Capabilities

### New Capabilities

- `note-editor`: Rich Markdown editor with `[[wikilink]]` syntax, note creation, editing, deletion, and metadata (tags, creation date)
- `linking-backlinking`: Forward link parsing from note content and automatic backlink index maintained per note
- `graph-view`: Interactive canvas visualization of the note relationship graph, rendered in the browser
- `task-management`: Task creation, status tracking (todo/in-progress/done), due dates, priority, and inline embedding within notes
- `full-text-search`: Search across note titles, body content, and task text with ranked results
- `self-hosting`: Docker Compose setup, environment configuration, and database migration tooling for self-hosted deployment

### Modified Capabilities

## Impact

- **New codebase**: greenfield project in this repository
- **Tech stack**: TypeScript throughout — Next.js (App Router) for frontend and API routes, tRPC for end-to-end type-safe RPC, Prisma ORM with SQLite (default) or PostgreSQL
- **UI**: shadcn/ui component library + Tailwind CSS
- **Editor**: Tiptap (ProseMirror-based) for the rich Markdown/wikilink editor
- **Graph**: D3.js or React Flow for the graph view canvas
- **Auth**: simple single-user password auth for self-hosted scenario (no multi-tenant initially)
- **Deployment**: Docker + Docker Compose; database volume-mounted for persistence
