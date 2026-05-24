## Context

Open Brain is a self-hostable PKM (Next.js 16, tRPC, Prisma 7 + SQLite via better-sqlite3) with notes, wikilinks, a knowledge graph, FSRS-based flashcard review, task tracking, and periodic notes. The app runs as a single-user system with no external services.

The existing review system (`/review`, `server/routers/review.ts`) schedules flashcards via FSRS v5 (`lib/fsrs`). The note editor was recently migrated from TipTap to CodeMirror + react-markdown; the viewer component (`NoteViewer`) renders markdown via react-markdown and is available for reuse.

There is currently no mechanism for progressively reading long-form content. Wikipedia articles, imported URLs, and long notes are consumed ad hoc with no queue, no scheduling, and no structured extraction workflow. This change introduces an incremental reading module modeled on SuperMemo's approach: import content, extract interesting passages as new reading items, schedule all items via FSRS, and terminate leaf items as notes or flashcards.

---

## Goals / Non-Goals

**Goals:**
- A prioritized, FSRS-scheduled reading queue supporting notes, external URLs, and Wikipedia sections
- Wikipedia as a first-class source: server-side fetch, section-level queuing, wikilink follow from within a session
- A reading session UI that renders one item at a time with text-selection extraction and FSRS rating
- Recursive extract tree: extracts of extracts, each a full ReadingItem in the queue
- Terminal actions: distill a leaf ReadingItem into a Note or Flashcard with provenance tracking
- Reuse existing FSRS scheduling logic and NoteViewer renderer without modification

**Non-Goals:**
- PDF upload (explicitly deferred; `sourceType` enum leaves room for it)
- Offline reading / PWA caching
- Shared reading queues or collaboration
- Reading analytics or heatmaps
- Postgres support (out of scope for all features per existing README)

---

## Decisions

### D1: Extracts are ReadingItems, not a separate model

**Choice:** A text selection during reading creates a child `ReadingItem` row with `parentItemId` set, `sourceType = EXTRACT`, and `extractedText` storing the selected passage. There is no separate `Extract` table.

**Rationale:** The user described a recursive distillation model — extracts of extracts, multiple layers deep, each schedulable and re-readable. Treating extracts as first-class ReadingItems means every layer of the tree gets FSRS scheduling, can itself be extracted from, and can be terminated into a Note or Flashcard. A separate Extract model would need to duplicate or proxy these behaviors.

**Alternatives considered:**
- Separate `Extract` table with optional `noteId`/`flashcardId` FKs — rejected because it can't be FSRS-scheduled or recursively extracted without becoming a ReadingItem in disguise.
- Highlights-only (no new rows) — rejected because it can't be queued for later reading.

---

### D2: Separate ReadingItem table (not Notes-as-reading-items)

**Choice:** New `ReadingItem` model with its own content storage, sourceType enum, FSRS fields, and self-referencing `parentItemId`. Notes and Flashcards gain a nullable `sourceReadingItemId` FK.

**Rationale:** Storing imported content as Notes would pollute the vault with undifferentiated imported material. Users would lose the ability to distinguish authored notes from fetched Wikipedia articles. Section-level Wikipedia queuing would require splitting one article into many Notes, creating noise in the graph and search. ReadingItem is a distinct concept with a distinct lifecycle.

**Alternatives considered:**
- Notes-as-reading-items — rejected because it conflates authored and imported content and complicates section-level queuing.
- Generalized FSRS service (shared `FSRSCard` table for Flashcard + ReadingItem) — rejected as premature generalization; FSRS fields are small and stable, refactoring Flashcard carries high blast radius for no immediate gain.

---

### D3: Wikipedia fetched via mobile-sections REST API, stored as markdown

**Choice:** Server-side fetch from `https://en.wikipedia.org/api/rest_v1/page/mobile-sections/{title}`. Each section is stored as an individual `ReadingItem` row (`sourceType = WIKIPEDIA_SECTION`) with `articleUrl` (parent article URL) and `sectionTitle`. HTML is converted to markdown server-side before storage. No npm Wikipedia client needed — Node fetch is sufficient.

**Rationale:** The mobile-sections endpoint returns pre-split sections with titles and sanitized HTML, which is the exact granularity needed for section-level queuing. Converting to markdown at import time means the stored content is rendered consistently with the rest of the app (react-markdown / NoteViewer).

**Alternatives considered:**
- Full MediaWiki parse API — more powerful but returns raw wiki markup, requiring a full wikitext parser. The mobile-sections endpoint gives clean HTML for free.
- Store HTML, render HTML — inconsistent with the rest of the app's markdown-based rendering; introduces a sanitization surface.
- On-demand fetch (no storage) — content could change between sessions; offline resilience lost; can't extract from content that isn't stored.

---

### D4: Wikilink follow via "+" chip on rendered links

**Choice:** In `WIKIPEDIA_SECTION` items, links in the rendered markdown that resolve to other Wikipedia articles get a small "+" button injected adjacent to them. Clicking adds that article to the queue (triggering `reading.fetchWikipedia` server-side) without navigating away from the current session item.

**Rationale:** Keeps the user in the flow of reading while enabling the rabbit-hole behavior that makes Wikipedia reading sessions productive. "+" is a well-understood affordance for "add to queue."

**Alternatives considered:**
- Make all wikilinks clickable (navigate away) — breaks the session; user loses their place.
- Separate "discover links" panel — higher UI complexity, not needed for MVP.

---

### D5: FSRS scheduling reused verbatim from lib/fsrs

**Choice:** `ReadingItem` carries the same FSRS fields as `Flashcard` (stability, difficulty, due, reps, lapses, state, lastReview). The `reading.review` tRPC procedure calls the same scheduling functions from `lib/fsrs` that the flashcard review session uses.

**Rationale:** FSRS is already implemented, tested, and working correctly. Duplicating the field set is the minimal change; a shared service abstraction would require refactoring the existing Flashcard model with no user-visible benefit.

---

## Risks / Trade-offs

**[Risk] Wikipedia API availability** — The `en.wikipedia.org/api/rest_v1` endpoint is a public API with no authentication, subject to rate limiting and policy changes. → Mitigation: surface fetch errors clearly in the UI with a retry option; never silently drop items. Store content at import time so reading sessions don't depend on the API.

**[Risk] HTML-to-markdown conversion quality** — Some Wikipedia sections contain tables, infoboxes, or heavily nested lists that degrade when converted to markdown. → Mitigation: accept imperfect conversion for MVP; tables can be stripped or rendered as-is. The content remains readable even if structure is lost.

**[Risk] extractedText highlight matching** — The selected text must be located in the parent's markdown content to render as a dimmed/highlighted span. Whitespace normalization and minor edits to stored content could break the match. → Mitigation: fuzzy matching (trim + normalize); if no match is found the passage is simply not highlighted — non-blocking, session continues normally.

**[Trade-off] FSRS fields duplicated on ReadingItem vs. shared abstraction** — Duplicating FSRS fields means any future changes to the FSRS schema (new fields, algorithm update) require touching two models. → Accepted because the algorithm is stable (FSRS v5), the field set is small, and a shared abstraction introduces more complexity than it solves today.

**[Trade-off] No PDF support at launch** — PDFs are a natural reading source. → Accepted; `sourceType` enum is designed to accommodate `PDF` as a future value with no schema breakage.

---

## Migration Plan

1. Add `ReadingItem` model to `prisma/schema.prisma`
2. Add nullable `sourceReadingItemId` to `Note` and `Flashcard` models
3. Run `npx prisma migrate dev --name add-reading-module`
4. Deploy new tRPC router and Next.js routes (additive — no existing endpoints changed)
5. Rollback: drop the migration; no existing data is affected (all new tables/columns, all nullable FKs)

No data migration required. No existing features affected.

---

## Open Questions

- **HTML-to-markdown library**: No npm package currently installed for HTML→markdown conversion. Options: `turndown` (MIT, widely used), `node-html-markdown` (faster), or a minimal custom converter for the subset of HTML Wikipedia produces. Decision deferred to implementation.
- **Session ordering within a batch**: When multiple items are due, the session shows them one at a time. The ordering rule ("highest priority × due" or strictly FSRS `due` date) should be confirmed before implementing `reading.listDue`.
- **Extract highlight rendering**: The `NoteViewer` is a read-only react-markdown renderer. Injecting highlight spans for extracted passages requires either (a) post-processing the rendered output, (b) a custom react-markdown plugin, or (c) pre-processing the markdown to insert highlight markers. The right approach depends on how many extracts a typical item has and whether highlights need to be interactive.
