# Brainstorm: open-brain app

Raw capture of brainstorming session output.

---

## Background

Open-brain is a browser-based, open-source, self-hostable personal knowledge management app — like Obsidian or Capacities — that runs entirely in the browser with no Electron dependency. Users own all their data. The app is deployable via Docker Compose with zero cloud dependency.

Core features: wikilinks, backlinking, knowledge graph, task management, and an Anki-style spaced repetition flashcard system.

This builds directly on the prior `browser-based-pkm-tool` design (design.md, proposal.md, tasks.md already exist in that change) and extends it with the flashcard subsystem as a first-class feature.

---

## Decision Chain

### Q1 — How do flashcards relate to notes?

**Decision: Bidirectional (unified)**

Cards can be created from notes AND exist independently. Notes show their associated cards in a sidebar panel. The review queue pulls from all sources. Decks are named collections — not tied to a single note.

Rejected:
- *Note-first only* — too constraining; standalone cards have legitimate use cases (vocab lists, formulas not attached to any note)
- *Standalone decks only* — loses the tight note integration that makes a PKM flashcard system more powerful than a standalone Anki

### Q2 — Which spaced repetition algorithm?

**Decision: FSRS (v5)**

Use the `ts-fsrs` library — the official TypeScript port maintained by the open-spaced-repetition org. FSRS is more accurate than SM-2 at the same review load and is what Anki adopted in 2023.

Rejected:
- *SM-2* — well understood but demonstrably less accurate; no reason to start with the older algorithm on a greenfield project
- *Simple fixed intervals* — appropriate for casual use but not for users who take spaced repetition seriously

### Q3 — What card types?

**Decision: Basic + Cloze for v1; image occlusion explicitly deferred to v2**

Basic cards: front/back flip. Cloze cards: `{{c1::answer}}` syntax in note editor or card form. Each blank in a cloze template is a separate reviewable `Flashcard` row (same `front`, different `clozeIndex`).

Image occlusion: planned, out of scope for v1. Schema leaves room via a future `IMAGE_OCCLUSION` enum value + `occlusionData: Json?` field.

### Q4 — How are cards created from notes?

**Decision: Both — highlight+shortcut AND sidebar panel**

- *Shortcut (basic):* Select text → `⌘⇧F` → modal pre-filled with selection as front; user adds back, picks deck, saves.
- *Cloze syntax:* Type `{{c1::answer}}` in the Tiptap editor; on save, `ClozeExtension` serializer syncs cloze nodes to `Flashcard` rows (same diff-on-save pattern as `WikilinkExtension`).
- *Sidebar panel:* Persistent "Cards" panel alongside the note lists all associated cards with type badges and an "Add card" button.
- *Standalone:* Form at `/decks` or `/review` for cards with no source note.

### Q5 — What does a review session look like?

**Decision: /review hub → full-screen session**

- `/review` page: deck hub showing due counts per deck and an "All due cards" virtual row. Revalidates every 60s.
- "Start reviewing" → navigates to `/review/session?deck=[id]` (or `?deck=all`).
- Full-screen session: distraction-free card flip UI. Space or tap to reveal answer. Keys 1–4 (Again/Hard/Good/Easy) rate the card and advance the queue.
- "Again" cards re-enter the end of the current session queue, capped at 3 requeues per card per session.
- Session complete screen: cards reviewed, again count, estimated next session size.

---

## Architecture & Stack

Inherits from `browser-based-pkm-tool` design. Full stack:

- **Next.js 14 App Router** — routing, server components, API routes
- **tRPC** — end-to-end type-safe RPC for all queries and mutations
- **Prisma + SQLite** (default) / **PostgreSQL** (via `DATABASE_URL`) — ORM + auto-migrations on Docker entrypoint
- **Tiptap v2** — rich editor with `WikilinkExtension`, `TaskItemExtension`, `ClozeExtension` (new), card-creation toolbar action (new)
- **React Flow** — graph view canvas
- **shadcn/ui + Tailwind** — component library and styling
- **iron-session** — single-user password auth, encrypted cookie, no Redis
- **ts-fsrs** — FSRS v5 TypeScript implementation
- **Docker Compose** — app container + volume-mounted database

**New pages (flashcard additions):**
- `/review` — deck hub with due counts
- `/review/session` — full-screen FSRS review session
- `/decks` — deck management (create, rename, delete; browse cards)

---

## Data Model

New Prisma models (additions to existing `Note`, `NoteLink`, `Task`, `User`):

```prisma
model Deck {
  id        String     @id @default(uuid())
  name      String
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  cards     DeckCard[]
}

model Flashcard {
  id          String    @id @default(uuid())
  type        CardType
  front       String
  back        String?
  clozeIndex  Int?
  noteId      String?
  note        Note?     @relation(fields: [noteId], references: [id], onDelete: SetNull)
  decks       DeckCard[]
  // FSRS state
  stability   Float     @default(0)
  difficulty  Float     @default(0)
  due         DateTime  @default(now())
  reps        Int       @default(0)
  lapses      Int       @default(0)
  state       FSRSState @default(NEW)
  lastReview  DateTime?
  deletedAt   DateTime?
  createdAt   DateTime  @default(now())
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

**Key decisions:**
- Cloze cards are one row per blank. Sibling rows share the same `front` template and `noteId`, differ by `clozeIndex`.
- FSRS state is denormalized onto the card row for simple due-date queries (`WHERE due <= now() AND deletedAt IS NULL`).
- `onDelete: SetNull` on `noteId` — deleting a note orphans cards rather than cascade-deleting.
- `deletedAt` soft-delete prevents cloze sync from re-creating manually deleted cards.
- No tags on cards — deck membership serves that purpose.

---

## Flashcard Feature Design

### FSRS integration

```ts
import { fsrs, generatorParameters, Rating } from 'ts-fsrs'

const f = fsrs(generatorParameters({ enable_fuzz: true }))

// review.rate tRPC mutation:
const { card: nextCard } = f.next(currentCard, now, rating)
// Persist nextCard fields (stability, difficulty, due, state, reps, lapses) to DB
```

The `review.rate` mutation receives `{ cardId, rating }`, maps to `ts-fsrs` `Rating` enum, updates the row, and returns the updated card + next due card in queue.

### Cloze sync on note save

`ClozeExtension` serializer scans Tiptap document JSON for cloze nodes, extracts `{ front, clozeIndex }` tuples, diffs against existing `Flashcard` rows for the note:
- Insert new cloze cards (not soft-deleted)
- Skip soft-deleted rows (user explicitly removed them)
- Do not delete rows whose cloze node was removed — set `deletedAt` instead

### Review session state

Session queue lives in React state after initial fetch (no refetch between cards). "Again" cards append to the end of the queue, capped at 3 requeues per card per session. Page refresh loses session progress — acceptable for v1, same behavior as Anki.

### Cloze sibling rendering

During review, the `review.rate` response includes sibling card data so non-tested blanks render as `[…]`. The `flashcard.listDue` query must JOIN siblings. Integration test required.

---

## Risks & Trade-offs

| Risk | Mitigation |
|------|-----------|
| Cloze sync re-creating deleted cards | `deletedAt` soft-delete; sync skips soft-deleted rows |
| Cloze sibling rendering complexity | Include siblings in `review.rate` response; dedicated integration test |
| ts-fsrs version lock | Pin to specific minor version; document upgrade path in README |
| Session queue lost on page refresh | Acceptable v1 behavior; document it |
| SQLite concurrent writes | WAL mode + single-user; review hot path is single mutation |
| Image occlusion scope creep | Explicitly v2; schema extensible via `IMAGE_OCCLUSION` enum + `occlusionData: Json?` |
