# Retrospective: incremental-reading-module

**Date:** 2026-05-24

## What shipped

- `ReadingItem` model with FSRS scheduling, extract tree, and provenance on notes/flashcards
- tRPC `reading` router: queue CRUD, Wikipedia/URL import, session termination, ratings
- UI: `/reading` queue, `/reading/add` import, `/reading/session` with extract/highlight/wiki-link chips
- Note detail: add-to-reading-queue control
- 32 integration tests in `tests/reading.test.ts` wired into `npm test`

## What went well

- Reusing `lib/fsrs` and flashcard patterns kept scheduling consistent
- Splitting `previewUrl` from `addUrl` avoided accidental double-inserts on URL import
- Worktree isolation kept main clean while iterating a large vertical slice

## Friction / surprises

- `openspec` CLI not on PATH; `npx @fission-ai/openspec` required
- Jest ignored `tests/reading.test.ts`; fixed by chaining `tsx --test` in `npm test`
- Task wording lagged implementation (`previewUrl`, `ExtractHighlighter` vs `NoteViewer`)
- One subagent invocation failed; session UI completed in main agent

## Would do differently

- Add URL/Wikipedia dedup parity with `addNote` early (called out in verify warnings)
- Smoke checklist in tasks for the three routes (even without E2E harness)
- Commit in smaller slices during apply instead of one large tail commit

## Follow-ups (optional)

- E2E or Playwright smoke for reading flows
- Reading nav on graph page if that layout gains a sidebar
- Non-English Wikipedia host support beyond `en.wikipedia.org`
