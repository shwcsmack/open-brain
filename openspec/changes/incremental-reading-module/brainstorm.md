<!--
Raw capture of superpowers:brainstorming session for incremental-reading-module.
Decision log format: background → Q1-Qn decisions → design sections.
-->

## Background

Open Brain is a self-hostable PKM (Next.js, tRPC, Prisma + SQLite) with notes (CodeMirror markdown editor), wikilinks, knowledge graph, FSRS spaced-repetition flashcards, task tracking, and periodic notes. The existing review system at `/review` schedules flashcard sessions via FSRS v5.

The user wants to add an **incremental reading module** — a SuperMemo-style system for progressively distilling long-form content into concise knowledge.

---

## Decision Chain

### Q1: Core behavior?

**Decision: Full incremental reading system** — queue management, FSRS scheduling, extract/highlight, and flashcard/note creation from extracts. Not just a reading list, not just progress tracking — the full loop.

### Q2: Content sources?

**Decision: Notes + external URLs + PDFs, with Wikipedia as a first-class citizen.** Wikipedia was explicitly called out as the primary motivating use case.

### Q3: What makes Wikipedia first-class?

**Decision: Fetch + follow + section-level queuing.** Wikipedia articles are fetched via API, rendered cleanly, wikilinks in the rendered content let you add referenced articles to the queue, and articles are broken into sections so you can queue individual sections rather than the whole article (which is often too long for one session).

### Q4: Scheduling?

**Decision: FSRS v5 (reuse existing algorithm).** Same scheduling algorithm already used for flashcards. No priority queue, no hybrid — pure FSRS so reading items and flashcards share a mental model.

### Q5: How do extracts work?

**Decision: Extracts are ReadingItems, not a separate concept.** Initially considered three options (highlights only, extract-always-becomes-note, choose per extract), but the user clarified the real model:

- Import a Wikipedia article → ReadingItem
- During reading, select a passage/section → creates a *child* ReadingItem in the queue
- The extracted passage is highlighted/collapsed in the parent view
- Each child can itself be extracted from further (recursive tree, multiple layers deep)
- Eventually, a leaf item is "terminalized" into a Note or Flashcard
- The goal is to *distill* source material progressively: article → sections → key points → notes/cards

This means extracts ARE ReadingItems. There is no separate Extract model.

### Q6: UI location?

**Decision: New `/reading` route**, separate from `/review`. The reading workflow is distinct enough from flashcard review to warrant its own section.

---

## Architectural Decision: Data Model Approach

Three options were considered:

**A — Notes-as-reading-items:** External content saved as Notes. Clean vault integration but pollutes the Notes table with imported content; section-level Wikipedia queuing requires splitting one article into many Notes.

**B — Separate ReadingItem table (chosen):** New model with its own content storage, sourceType enum, FSRS fields, and a parentItemId self-reference for the extract tree. Notes and Flashcards get a nullable `sourceReadingItemId` FK for provenance.

**C — Generalized FSRS service:** Shared FSRSCard table for both Flashcard and ReadingItem. Rejected as premature generalization requiring high-blast-radius refactor of the existing flashcard model.

**Chosen: Approach B** — clean separation, Wikipedia sections are first-class rows, no refactoring of existing Flashcard model.

---

## Design

### Section 1: Data Model

**`ReadingItem` model:**
```
ReadingItem
  id, title
  content (markdown snapshot)
  sourceType: NOTE | URL | WIKIPEDIA_SECTION | EXTRACT

  url?                         -- original URL (URL / WIKIPEDIA_SECTION)
  articleUrl?                  -- groups sections under a parent article
  sectionTitle?                -- section heading (WIKIPEDIA_SECTION)
  sourceNoteId? → Note         -- set when type = NOTE

  parentItemId? → ReadingItem  -- set on EXTRACT; forms a tree
  extractedText?               -- the exact passage lifted from parent
                               -- used to highlight/collapse in parent view

  priority: Int (0–100)        -- manual boost/bury
  stability, difficulty, due, reps, lapses, state, lastReview  -- FSRS fields

  deletedAt?, createdAt, updatedAt
```

**Terminal actions** (leaf items):
- "Save as Note" → creates Note, sets `Note.sourceReadingItemId`
- "Create Flashcard" → opens existing flashcard modal, sets `Flashcard.sourceReadingItemId`

`Note` and `Flashcard` models get a nullable `sourceReadingItemId` field for provenance tracking.

No separate Extract table. The reading loop: import → extract (child ReadingItem) → extract further → terminate as Note or Flashcard.

---

### Section 2: Routes & tRPC

**New Next.js routes:**
- `/reading` — queue overview: due items (FSRS due × priority), full queue, "Add to queue"
- `/reading/session` — active reader: one item at a time, markdown render, selection toolbar, FSRS rating
- `/reading/add` — paste URL or Wikipedia link, preview before queuing

**New tRPC router** (`server/routers/reading.ts`):

| Procedure | Purpose |
|---|---|
| `reading.listDue` | Due ReadingItems ordered by due × priority |
| `reading.listAll` | Full queue with source type / state filters |
| `reading.addNote` | Enqueue an existing Note |
| `reading.fetchWikipedia` | Server-fetch Wikipedia article, parse sections, return preview |
| `reading.addWikipedia` | Save selected sections as ReadingItems |
| `reading.addUrl` | Fetch URL, convert to markdown, save as ReadingItem |
| `reading.review` | Submit FSRS rating, advance scheduling |
| `reading.extract` | Create child ReadingItem from selected text |
| `reading.terminateNote` | Create Note from leaf item |
| `reading.terminateFlashcard` | Create Flashcard from leaf item |

**Wikipedia fetch:** Server-side call to `https://en.wikipedia.org/api/rest_v1/page/mobile-sections/{title}` — pre-split sections with titles and HTML. Convert HTML → markdown server-side. Each section stored as `WIKIPEDIA_SECTION` with `articleUrl` + `sectionTitle`.

---

### Section 3: Reading Session UI

**`/reading` (queue overview):**
- Two tabs: "Due" (FSRS-scheduled) and "All" (full queue)
- Each row: title, source type badge (Note / Wikipedia / URL / Extract), due date, priority
- "Add to queue" → `/reading/add`
- Note detail pages get an "Add to reading queue" button

**`/reading/session` (reader):**
- Loads highest-priority due item
- Renders content with `NoteViewer` (existing react-markdown renderer — reused as-is)
- Extracted passages appear as highlighted/dimmed spans (matched via `extractedText` on child items)
- **Selection toolbar** (appears on text selection):
  - **Extract** → child ReadingItem queued; passage highlighted in current view
  - **Save as Note** → `reading.terminateNote`, auto-titled confirmation
  - **Create Flashcard** → existing flashcard modal, front pre-filled
- **Rating bar** at bottom: Again / Hard / Good / Easy → `reading.review`
- **Wikipedia items:** wikilinks in rendered content show "+" chip — clicking adds that article/section to queue without leaving current item

**`/reading/add`:**
- Paste URL → server fetches and previews content
- Wikipedia URL → shows section checklist; select sections to queue
- Other URL → title + markdown preview, confirm to add
- Existing notes → searchable dropdown

---

### Section 4: Error Handling & Testing

**Error handling:**
- Wikipedia fetch failures → inline error with retry; never silently drop items
- URL fetch failures (paywall, timeout) → error with option to manually paste content
- FSRS review failure → optimistic UI rolls back; item stays due
- Extract with no selection → toolbar suppressed (selection guard)
- `extractedText` highlight matching is fuzzy (whitespace-normalized); if no match, passage simply isn't highlighted (non-blocking)

**Testing:**
- Integration tests for all tRPC procedures: add note, fetch Wikipedia, submit FSRS review, create extract, terminate to Note/Flashcard
- Wikipedia HTTP layer mocked (jest mock / MSW) — no live network in tests
- FSRS scheduling: assert `due` date advances correctly after each rating
- No UI component tests (covered by manual dogfooding per existing convention)

**Out of scope (explicit):**
- PDF upload (future `sourceType`)
- Offline reading / PWA caching
- Shared reading queues
- Reading analytics / heatmaps
