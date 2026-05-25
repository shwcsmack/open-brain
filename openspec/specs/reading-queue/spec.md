# reading-queue Specification

## Purpose
TBD - created by archiving change incremental-reading-module. Update Purpose after archive.
## Requirements
### Requirement: ReadingItem data model

The system SHALL provide a `ReadingItem` Prisma model with the following fields: `id`, `title`, `content` (markdown snapshot), `sourceType` (enum: `NOTE | URL | WIKIPEDIA | EXTRACT`), `url` (nullable), `articleUrl` (nullable, stores the Wikipedia article URL for whole-article imports), `sectionTitle` (nullable, retained for legacy compatibility), `sourceNoteId` (nullable FK → Note), `parentItemId` (nullable self-reference FK → ReadingItem for extract tree), `extractedText` (nullable, the exact passage lifted from the parent item), `priority` (Int, 0–100, default 50), FSRS scheduling fields (`stability`, `difficulty`, `due`, `reps`, `lapses`, `state`, `lastReview`) matching the existing Flashcard model, `archivedAt` (nullable, set when item is soft-archived), `hiddenPassages` (String, JSON array of hidden passage strings, default `"[]"`), `deletedAt` (nullable, set on hard delete), `createdAt`, and `updatedAt`.

#### Scenario: ReadingItem created for a note
- **WHEN** a user adds an existing note to the reading queue
- **THEN** a `ReadingItem` row is created with `sourceType = NOTE`, `sourceNoteId` set to the note's id, `content` set to the note's markdown body, and `due` defaulting to now

#### Scenario: Extract child item references parent
- **WHEN** the user extracts a passage from a ReadingItem
- **THEN** a new `ReadingItem` row is created with `sourceType = EXTRACT`, `parentItemId` set to the source item's id, and `extractedText` set to the selected passage

#### Scenario: Hard delete removes row permanently
- **WHEN** `reading.delete` is called on a ReadingItem
- **THEN** the row is permanently removed from the database

#### Scenario: Archived item excluded from active listings
- **WHEN** a ReadingItem has `archivedAt` set
- **THEN** it is excluded from `reading.listDue` and `reading.listAll` active results

---

### Requirement: Queue listing with due-first ordering

The system SHALL expose a `reading.listDue` tRPC query that returns all ReadingItems where `deletedAt IS NULL` AND `archivedAt IS NULL` AND `due <= now()`, ordered by `priority` descending then `due` ascending, so high-priority overdue items appear first.

#### Scenario: Due items returned in priority order
- **WHEN** two items are both due and item A has priority 80 and item B has priority 40
- **THEN** `reading.listDue` returns item A before item B

#### Scenario: Future items excluded
- **WHEN** a ReadingItem has `due` set to tomorrow
- **THEN** it does not appear in `reading.listDue` results

#### Scenario: Archived items excluded from due list
- **WHEN** a ReadingItem has `due` in the past but `archivedAt` is set
- **THEN** it does not appear in `reading.listDue` results

---

### Requirement: Full queue listing with filters

The system SHALL expose a `reading.listAll` tRPC query that returns all ReadingItems where `deletedAt IS NULL` AND `archivedAt IS NULL`, with optional filtering by `sourceType` and `state` (FSRS state), ordered by `priority` descending then `createdAt` descending.

#### Scenario: Filter by source type
- **WHEN** `reading.listAll` is called with `sourceType = WIKIPEDIA`
- **THEN** only ReadingItems with `sourceType = WIKIPEDIA` are returned

#### Scenario: Archived items excluded from listAll
- **WHEN** a ReadingItem has `archivedAt` set
- **THEN** it does not appear in `reading.listAll` results

---

### Requirement: Add existing note to queue

The system SHALL provide a `reading.addNote` tRPC mutation that accepts a `noteId`, creates a `ReadingItem` with `sourceType = NOTE` and `content` copied from the note's current `body`, and returns the new item.

#### Scenario: Note enqueued
- **WHEN** `reading.addNote` is called with a valid noteId
- **THEN** a ReadingItem is created with `sourceType = NOTE`, `sourceNoteId` set, and `due` defaulting to now

#### Scenario: Duplicate enqueue prevented
- **WHEN** `reading.addNote` is called for a note that already has a non-deleted ReadingItem
- **THEN** the mutation returns the existing item without creating a duplicate

---

### Requirement: FSRS review advances scheduling

The system SHALL provide a `reading.review` tRPC mutation that accepts a `readingItemId` and a `rating` (Again | Hard | Good | Easy), applies the FSRS v5 scheduling algorithm from `lib/fsrs` to compute the next `due`, `stability`, `difficulty`, `reps`, `lapses`, and `state`, and persists these values on the ReadingItem.

#### Scenario: Good rating advances due date
- **WHEN** `reading.review` is called with rating `Good` on a ReadingItem in NEW state
- **THEN** the item's `due` is set to a future date, `reps` increments to 1, and `state` transitions to LEARNING

#### Scenario: Again rating does not advance due date significantly
- **WHEN** `reading.review` is called with rating `Again` on a ReadingItem
- **THEN** the item's `due` is set to a near-future date (within minutes), `lapses` increments, and `state` is RELEARNING or NEW

---

### Requirement: Extract creates child ReadingItem

The system SHALL provide a `reading.extract` tRPC mutation that accepts a `parentItemId` and `selectedText`, creates a child `ReadingItem` with `sourceType = EXTRACT`, `parentItemId` set, `extractedText` set to the selected text, `title` derived from the first line of the selection (truncated to 80 characters), and `content` set to the selected text, and returns the new child item.

#### Scenario: Extract queued immediately
- **WHEN** `reading.extract` is called with a passage selected from a Wikipedia section item
- **THEN** a child ReadingItem is created with `parentItemId` set, `due` defaulting to now, and the item appears in `reading.listDue`

#### Scenario: Multiple extracts from same parent
- **WHEN** three passages are extracted from the same ReadingItem
- **THEN** three child ReadingItems exist, each with `parentItemId` set to the original item's id

---

### Requirement: Terminate as note

The system SHALL provide a `reading.terminateNote` tRPC mutation that accepts a `readingItemId` and an optional `title` override, creates a `Note` with `title` (defaulting to the ReadingItem's title), `body` set to the ReadingItem's content, and `sourceReadingItemId` set to the ReadingItem's id, and soft-deletes the ReadingItem.

#### Scenario: Leaf item terminalized to note
- **WHEN** `reading.terminateNote` is called on a ReadingItem
- **THEN** a new Note is created with `sourceReadingItemId` set and the ReadingItem's `deletedAt` is set

---

### Requirement: Queue overview page

The system SHALL provide a `/reading` Next.js route displaying two tabs — "Due" and "All" — each listing ReadingItems with title, source type badge, due date, and priority. The page SHALL include an "Add to queue" button linking to `/reading/add` and a "Start reading" button linking to `/reading/session` when due items exist. Each item row SHALL be clickable, navigating to `/reading/session?startFrom=<id>` to start a reading session from that item. Each row SHALL reveal archive and delete icon buttons on hover. A "Select" toggle SHALL activate bulk-select checkboxes with a sticky action bar for bulk archive and bulk delete.

#### Scenario: Due tab shows only due items
- **WHEN** the user visits `/reading` and selects the "Due" tab
- **THEN** only items where `due <= now()` and `archivedAt IS NULL` are shown, ordered by priority descending

#### Scenario: Empty state shown when nothing due
- **WHEN** no ReadingItems are due
- **THEN** the Due tab shows an empty state message rather than an empty list

#### Scenario: Click row starts session from that item
- **WHEN** the user clicks a queue item row
- **THEN** the browser navigates to `/reading/session?startFrom=<id>` for that item

