## Why

The reading queue has no item management: there is no way to delete or archive items, no way to start a session from a specific item, and no way to act on an article while reading it. Wikipedia links lack import-state tracking, and importing Wikipedia content requires manually selecting sections. Text selection during reading offers no delete action. These gaps make the queue hard to curate and the reading session disconnected from content exploration.

## What Changes

**Reading queue item management**
- From: No per-item or bulk actions; items accumulate with no removal path.
- To: Hover reveals per-row Archive and Delete actions. A Select mode enables bulk archive and bulk delete with a sticky action bar.
- Reason: Users need to curate their queue over time.
- Impact: Non-breaking; new UI affordances and new API procedures.

**Start session from a specific item**
- From: Sessions always start from the top of the due queue.
- To: Clicking any queue row starts the session with that item as current (`?startFrom=<id>`).
- Reason: Users want to choose what to read next without reordering the full queue.
- Impact: Non-breaking; new query param on the existing session page.

**Archive vs hard delete**
- From: `deletedAt` is the only removal mechanism (soft delete treated as permanent).
- To: `archivedAt` added for reversible archiving. `deletedAt` becomes true hard delete. Archived items are visible at `/reading/archive` and at `/reading/[id]`.
- Reason: Users want a recoverable archive log, especially for Wikipedia articles they've processed.
- Impact: Prisma migration required; new field on `ReadingItem`.

**Wikipedia link import tracking**
- From: Wikipedia links in article content have no visual import state; every click triggers a new import.
- To: Links show a `+` pill (not imported) or `✓` pill (already imported/archived). Clicking any pill pushes the article to the front of the in-memory session queue. Archived articles are unarchived on click. Hard-deleted articles revert to `+`.
- Reason: Users need to know what they've already imported and navigate to linked articles without losing their place.
- Impact: New `getImportedWikipediaUrls` procedure; `ExtractHighlighter` receives import state map.

**Wikipedia whole-article import**
- From: Wikipedia import presents a section picker; users select individual sections as separate `ReadingItem`s.
- To: One `ReadingItem` per Wikipedia article; all sections concatenated. Section picker removed from the Add page and the in-session link handler. `ReadingSource` enum value renamed from `WIKIPEDIA_SECTION` to `WIKIPEDIA`. Existing per-section rows are hard-deleted in the migration.
- Reason: Per-section rows are stale fragments incompatible with the new whole-article model. Keeping them would pollute the queue and corrupt Wikipedia tracking state.
- Impact: Destructive data migration (existing Wikipedia items deleted). Breaking change to `addWikipediaToQueue` signature and the Add page UX.

**Delete text passage while reading**
- From: Selection toolbar offers Extract, Save as note, Create flashcard.
- To: A fourth "Delete passage" action hides the selected text. Hidden passages are stored in `hiddenPassages` (JSON array) on the `ReadingItem`. An inline tombstone placeholder marks the location with a Restore button.
- Reason: Users want to clean up article content progressively while reading.
- Impact: New field on `ReadingItem`; new `hidePassage` / `restorePassage` procedures.

**Article detail page**
- From: No per-item detail page; reading items are only accessible through the session queue.
- To: `/reading/[id]` renders any item (active or archived) with article content, tombstones for hidden passages, and a right sidebar showing Review Stats, Extracts, Notes, and Flashcards. Archived items show an amber banner with a Restore button.
- Reason: Archived items need a stable readable URL; ✓ pill links need a destination outside the session.
- Impact: New route; new `getById` procedure.

## Capabilities

### New Capabilities
- `reading-item-management`: Per-item and bulk archive/delete actions in the reading queue, including soft archive with recovery and hard delete with Wikipedia tracking removal.
- `reading-article-detail`: The `/reading/[id]` detail page with sidebar showing review stats, extracts, notes, and flashcards. Supports both active and archived items.
- `reading-archive-log`: The `/reading/archive` page listing archived reading items with source filter and title search, linked from the sidebar nav.
- `reading-passage-deletion`: Delete-passage action in the selection toolbar; inline tombstone placeholders with per-passage restore; `hiddenPassages` persisted on `ReadingItem`.

### Modified Capabilities
- `reading-queue`: New `startFrom` query param on the session page; queue row click navigates to session from that item; bulk select mode and sticky action bar.
- `reading-session`: `⋮` menu for archive/delete while reading; push-to-front Wikipedia link mechanism replaces direct import; selection toolbar gains Delete passage action.
- `wikipedia-import`: Whole-article import replaces section picker everywhere (session link handler and Add page); `getImportedWikipediaUrls` procedure for pill state.

## Impact

- **Prisma migration**: Add `archivedAt DateTime?` and `hiddenPassages String @default("[]")` to `ReadingItem`.
- **API**: 8 new tRPC procedures on `readingRouter`; `addWikipediaToQueue` signature changes (array input → single whole-article input).
- **UI**: 4 modified pages (`/reading`, `/reading/session`, `/reading/add`, `ExtractHighlighter`); 2 new pages (`/reading/[id]`, `/reading/archive`); 1 modified component (`SelectionToolbar`).
- **No external dependencies** added.
