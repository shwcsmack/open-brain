## Why

Open Brain already excels at storing knowledge but offers no structured way to *consume* it. Long-form content — Wikipedia articles, imported URLs, lengthy notes — sits unread or gets skimmed once and forgotten. An incremental reading module brings a SuperMemo-style loop: import content, extract the parts worth revisiting, schedule those extracts via FSRS, and progressively distill them into notes and flashcards. Wikipedia is the primary motivating source because it is encyclopedic, interlinked, and too dense to absorb in one sitting.

## What Changes

New `/reading` section added to the app — a dedicated reading queue and session reader that sits alongside (but is separate from) the existing `/review` flashcard system. No existing routes or data models are modified; this is additive.

**Flashcard model**
- From: no provenance tracking
- To: optional `sourceReadingItemId` field linking a card back to the ReadingItem it was distilled from
- Impact: non-breaking, nullable FK

**Note model**
- From: no provenance tracking
- To: optional `sourceReadingItemId` field linking a note back to the ReadingItem it was distilled from
- Impact: non-breaking, nullable FK

## Capabilities

### New Capabilities

- `reading-queue`: A prioritized, FSRS-scheduled queue of ReadingItems sourced from notes, URLs, or Wikipedia sections. Supports the full item lifecycle: import → extract → terminate as note or flashcard.
- `reading-session`: The in-session reading UI — renders one ReadingItem at a time, supports text-selection extraction, FSRS rating, and Wikipedia wikilink queuing.
- `wikipedia-import`: Server-side fetch and parsing of Wikipedia articles into per-section ReadingItems, with wikilink follow support during reading sessions.

### Modified Capabilities

- `flashcard-system`: Add nullable `sourceReadingItemId` to `Flashcard` to track cards created from reading sessions.
- `note-editor`: Add nullable `sourceReadingItemId` to `Note` and surface an "Add to reading queue" button on note detail pages.

## Impact

- **New Prisma model**: `ReadingItem` with self-referencing `parentItemId` for the extract tree
- **New tRPC router**: `server/routers/reading.ts` (~10 procedures)
- **New Next.js routes**: `/reading`, `/reading/session`, `/reading/add`
- **Schema migration**: two nullable FK columns added to `Note` and `Flashcard`
- **New server-side HTTP dependency**: Wikipedia REST API (`en.wikipedia.org/api/rest_v1`) — no new npm package required (Node fetch)
- **Reused**: existing `NoteViewer` component, existing FSRS scheduling logic from `lib/fsrs`, existing flashcard creation modal
