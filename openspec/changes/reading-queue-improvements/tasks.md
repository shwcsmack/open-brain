## 1. Database migration

- [ ] 1.1 Add `archivedAt DateTime?` and `hiddenPassages String @default("[]")` fields to `ReadingItem` in `prisma/schema.prisma`
- [ ] 1.2 Rename `WIKIPEDIA_SECTION` to `WIKIPEDIA` in the `ReadingSource` enum in `prisma/schema.prisma`
- [ ] 1.3 Write and run Prisma migration: hard-delete all rows with `sourceType = 'WIKIPEDIA_SECTION'`, then apply schema changes
- [ ] 1.4 Regenerate Prisma client and confirm TypeScript compiles cleanly

## 2. Core library — reading queue

- [ ] 2.1 Add `archiveItem(db, id)` and `unarchiveItem(db, id)` functions to `lib/readingQueue.ts`
- [ ] 2.2 Add `deleteItem(db, id)` (hard delete) function to `lib/readingQueue.ts`
- [ ] 2.3 Add `bulkArchive(db, ids[])` and `bulkDelete(db, ids[])` functions to `lib/readingQueue.ts`
- [ ] 2.4 Update `listDueItems` and `listAllItems` to filter out `archivedAt IS NOT NULL` rows
- [ ] 2.5 Add `getItemById(db, id)` function that returns active or archived items (excludes hard-deleted)
- [ ] 2.6 Add `listArchivedItems(db, filters?)` function ordered by `archivedAt DESC`
- [ ] 2.7 Add `getImportedWikipediaUrls(db)` function returning `Record<string, { id, archivedAt }>`
- [ ] 2.8 Add `hidePassage(db, id, text)` and `restorePassage(db, id, text)` functions (JSON array mutation)

## 3. Core library — Wikipedia import

- [ ] 3.1 Update `fetchWikipediaForReading` in `lib/readingQueue.ts` to return a single merged article object `{ title, content, articleUrl }` instead of an array of sections
- [ ] 3.2 Update `addWikipediaToQueue` to accept a single `{ title, content, articleUrl }` object and create one `ReadingItem` with `sourceType = WIKIPEDIA`
- [ ] 3.3 Update `lib/wikipedia.ts` — add a `mergeWikipediaSections` helper that concatenates sections with `## Section Title` headings

## 4. tRPC router

- [ ] 4.1 Add `reading.archive`, `reading.unarchive`, `reading.delete` procedures to `server/routers/reading.ts`
- [ ] 4.2 Add `reading.bulkArchive` and `reading.bulkDelete` procedures
- [ ] 4.3 Add `reading.getById` procedure
- [ ] 4.4 Add `reading.listArchived` procedure with optional `sourceType` filter
- [ ] 4.5 Add `reading.getImportedWikipediaUrls` procedure
- [ ] 4.6 Add `reading.hidePassage` and `reading.restorePassage` procedures
- [ ] 4.7 Update `reading.fetchWikipedia` input/output types for single merged article
- [ ] 4.8 Update `reading.addWikipedia` input schema from array to single object
- [ ] 4.9 Update `reading.listDue` and `reading.listAll` router wiring to exclude archived items (already handled in lib layer — verify types pass through)

## 5. Reading queue page (`/reading`)

- [ ] 5.1 Add hover-reveal archive and delete icon buttons to each item row
- [ ] 5.2 Implement inline delete confirmation state on item row (replaces action buttons with "Delete this item? Confirm / Cancel")
- [ ] 5.3 Add "Select" toggle button to queue header that activates per-row checkboxes
- [ ] 5.4 Implement sticky bulk action bar (appears when ≥1 item checked) with "Archive selected" and "Delete selected" buttons
- [ ] 5.5 Wire archive/delete mutations with optimistic removal from the list
- [ ] 5.6 Make item rows clickable — navigate to `/reading/session?startFrom=<id>` on row click (not on action button click)

## 6. Reading session page (`/reading/session`)

- [ ] 6.1 Read `startFrom` query param on mount; rotate/prepend the target item to become `current`
- [ ] 6.2 Add `⋮` overflow menu to article header with "Archive article" and "Delete article" actions
- [ ] 6.3 Wire archive/delete actions: call mutation, then call `advance()` to move to next item
- [ ] 6.4 Fetch `getImportedWikipediaUrls` on session mount; store in state and pass to `ExtractHighlighter`
- [ ] 6.5 Rewrite `handleAddWikipediaLink` to use push-to-front: fetch/unarchive item server-side, then `setCurrent(wikiItem); setQueue([currentItem, ...prev])`
- [ ] 6.6 Pass `hiddenPassages` from `current` reading item to `ExtractHighlighter`

## 7. ExtractHighlighter component

- [ ] 7.1 Accept `importedWikipediaUrls: Record<string, { id: string; archivedAt: Date | null }>` prop
- [ ] 7.2 Render `+` pill (green) for unimported Wikipedia links, blue `✓` pill for active imports, amber `✓` pill for archived imports
- [ ] 7.3 Accept `hiddenPassages: string[]` prop; replace each matching passage with an inline tombstone component
- [ ] 7.4 Implement tombstone component: shows "N passage(s) hidden" + "Restore" button; collapses consecutive hidden passages into one tombstone
- [ ] 7.5 Wire tombstone "Restore" button to call `reading.restorePassage` and update local state optimistically

## 8. SelectionToolbar component

- [ ] 8.1 Add "Delete passage" button as the fourth action in `SelectionToolbar`
- [ ] 8.2 Accept `onDeletePassage: (text: string) => void` prop and wire it to the new button
- [ ] 8.3 Update session page to pass `onDeletePassage` handler that calls `reading.hidePassage` and updates local `hiddenPassages` state optimistically

## 9. Wikipedia Add page (`/reading/add`)

- [ ] 9.1 Remove section checklist UI (checkboxes, select-all toggle, section count indicator)
- [ ] 9.2 Replace with single article preview (title + scrollable content) and "Add whole article to queue" button
- [ ] 9.3 Update `handleAddWikipediaSections` → `handleAddWholeArticle` to call updated `reading.addWikipedia` with merged article object

## 10. Article detail page (`/reading/[id]`)

- [ ] 10.1 Create `app/reading/[id]/page.tsx` route; fetch item via `reading.getById`
- [ ] 10.2 Render article title, source badge, and markdown content using `ExtractHighlighter` with tombstones
- [ ] 10.3 Show amber archived banner with archive date and "Restore to queue" button when `archivedAt` is set
- [ ] 10.4 Show "Start reading from here" button in header for active items (links to `/reading/session?startFrom=<id>`)
- [ ] 10.5 Implement right sidebar with Review Stats section (reps, stability, difficulty, last review)
- [ ] 10.6 Implement right sidebar Extracts section (child items via `reading.listAll { parentItemId }`)
- [ ] 10.7 Implement right sidebar Notes section (notes via `note.listByReadingItem` or filtered query)
- [ ] 10.8 Implement right sidebar Flashcards section (flashcards via `flashcard.listByReadingItem` or filtered query)

## 11. Archive log page (`/reading/archive`)

- [ ] 11.1 Create `app/reading/archive/page.tsx`; fetch via `reading.listArchived`
- [ ] 11.2 Render rows with source badge, title, archived date; clicking a row links to `/reading/[id]`
- [ ] 11.3 Add source type filter dropdown
- [ ] 11.4 Add title search input (client-side filter)
- [ ] 11.5 Add "Archive" sub-nav link to the sidebar nav (under Reading) in all reading pages

## 12. Tests

- [ ] 12.1 Update `tests/reading.test.ts` — fix all references to `WIKIPEDIA_SECTION` → `WIKIPEDIA`
- [ ] 12.2 Add tests for `archiveItem`, `unarchiveItem`, `deleteItem` (verify listDue/listAll exclusion)
- [ ] 12.3 Add tests for `hidePassage` and `restorePassage` (JSON array correctness)
- [ ] 12.4 Add tests for `getImportedWikipediaUrls` (active, archived, deleted cases)
- [ ] 12.5 Add tests for updated `addWikipediaToQueue` (single item created, articleUrl set)
- [ ] 12.6 Add tests for updated `fetchWikipediaForReading` (returns merged single object)
