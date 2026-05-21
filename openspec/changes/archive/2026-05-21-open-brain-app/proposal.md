## Why

Obsidian and similar PKM tools are either desktop-only (Electron) or locked behind proprietary cloud services, leaving a gap for a fully open-source, browser-based alternative that users can self-host on their own hardware. Open-brain fills that gap: a full-featured knowledge management app deployable with a single `docker compose up`, with no vendor lock-in and no data leaving the user's machine. Adding first-class spaced repetition (FSRS) and periodic notes makes it a complete personal knowledge system — not just a note-taking app.

## What Changes

Introduce a new full-stack TypeScript application as the open-brain codebase. This is a greenfield project; there is no existing system being modified.

**New application**
- From: no application exists
- To: Next.js 14 + tRPC + Prisma + shadcn/ui app, self-hostable via Docker Compose
- Impact: new codebase in this repository

## Capabilities

### New Capabilities

- `note-editor`: Rich Markdown editor with auto-save, tag management, note creation/deletion, and title-based navigation
- `wiki-linking`: `[[wikilink]]` syntax parsed into persisted link edges; automatic backlink index maintained on every save; wikilink autocomplete
- `knowledge-graph`: Interactive canvas visualization of the note relationship graph with zoom, pan, node focus, and hop-depth filtering
- `task-management`: Inline checkbox tasks synced to a `Task` table; standalone task view with status, priority, due date, and filtering
- `full-text-search`: Database-native full-text search (SQLite FTS5 / Postgres tsvector) across notes and tasks, accessible via `⌘K` modal
- `self-hosting`: Single-user password auth (iron-session + bcrypt), Docker Compose deployment, environment configuration, and automatic database migrations
- `flashcard-system`: Bidirectional flashcard integration — Basic and Cloze card types, FSRS v5 scheduling via ts-fsrs, highlight-to-card shortcut, cloze syntax synced on save, per-note cards panel, `/review` deck hub, and full-screen review session
- `periodic-notes`: Auto-created daily, weekly, monthly, quarterly, and yearly notes from user-defined templates, accessible via a calendar navigator in the sidebar

### Modified Capabilities

## Impact

- **New codebase**: greenfield project in this repository
- **Tech stack**: TypeScript throughout — Next.js 14 App Router, tRPC, Prisma ORM (SQLite default / Postgres optional), shadcn/ui, Tailwind CSS
- **Editor**: Tiptap v2 (ProseMirror) with custom WikilinkExtension, TaskItemExtension, ClozeExtension
- **Graph**: React Flow canvas with d3-force layout
- **Spaced repetition**: ts-fsrs (FSRS v5)
- **Auth**: iron-session encrypted cookie, bcrypt password hash, Next.js middleware
- **Deployment**: Docker + Docker Compose; volume-mounted SQLite or external Postgres
- **New dependencies**: `@trpc/server`, `@trpc/client`, `@trpc/next`, `prisma`, `@tiptap/react`, `@tiptap/starter-kit`, `reactflow`, `d3-force`, `ts-fsrs`, `iron-session`, `bcrypt`
