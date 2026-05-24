## 1. Database Schema

- [x] 1.1 Add `ReadingItem` model to `prisma/schema.prisma` with all fields: id, title, content, sourceType enum (NOTE | URL | WIKIPEDIA_SECTION | EXTRACT), url, articleUrl, sectionTitle, sourceNoteId FK → Note, parentItemId self-reference FK → ReadingItem, extractedText, priority (Int default 50), FSRS fields (stability, difficulty, due, reps, lapses, state, lastReview) matching Flashcard, deletedAt, createdAt, updatedAt
- [x] 1.2 Add `FSRSState` enum reuse or duplicate for `ReadingItem.state` (NOTE: FSRSState already exists in schema for Flashcard — confirm it can be shared or must be re-declared)
- [x] 1.3 Add nullable `sourceReadingItemId` FK → ReadingItem to `Note` model
- [x] 1.4 Add nullable `sourceReadingItemId` FK → ReadingItem to `Flashcard` model
- [x] 1.5 Run `npx prisma migrate dev --name add-reading-module` and verify migration applies cleanly

## 2. tRPC Router — Queue Operations

- [x] 2.1 Create `server/routers/reading.ts` and register it in `server/root.ts`
- [x] 2.2 Implement `reading.listDue` — returns non-deleted ReadingItems where `due <= now()`, ordered by priority desc then due asc
- [x] 2.3 Implement `reading.listAll` — returns all non-deleted ReadingItems with optional `sourceType` and `state` filters, ordered by priority desc then createdAt desc
- [x] 2.4 Implement `reading.addNote` — accepts noteId, creates ReadingItem with sourceType=NOTE, content from note body, due=now; prevents duplicate (returns existing if non-deleted item exists)
- [x] 2.5 Implement `reading.review` — accepts readingItemId + rating (Again|Hard|Good|Easy), applies FSRS v5 from `lib/fsrs`, persists updated scheduling fields
- [x] 2.6 Implement `reading.extract` — accepts parentItemId + selectedText, creates child ReadingItem with sourceType=EXTRACT, parentItemId set, extractedText set, title from first 80 chars of selection, due=now
- [x] 2.7 Implement `reading.terminateNote` — accepts readingItemId + optional title override, creates Note with sourceReadingItemId set, soft-deletes the ReadingItem
- [x] 2.8 Write integration tests in `tests/reading.test.ts` for all procedures: addNote (including duplicate guard), listDue ordering, review FSRS advancement, extract child creation, terminateNote

## 3. tRPC Router — Wikipedia & URL Import

- [x] 3.1 Select and install HTML-to-markdown library (recommend `turndown`) — add to package.json
- [x] 3.2 Implement `reading.fetchWikipedia` — accepts Wikipedia URL or title, fetches `https://en.wikipedia.org/api/rest_v1/page/mobile-sections/{title}`, converts each section's HTML to markdown, returns array of `{ title, content }` sections; surfaces descriptive tRPC errors on 404 or network failure
- [x] 3.3 Implement `reading.addWikipedia` — accepts array of `{ title, content, articleUrl, sectionTitle }`, creates one ReadingItem per entry with sourceType=WIKIPEDIA_SECTION
- [x] 3.4 Implement `reading.addUrl` — accepts arbitrary URL, fetches server-side, extracts title + body, converts to markdown, creates ReadingItem with sourceType=URL; returns error (no item created) on fetch/parse failure
- [x] 3.5 Write integration tests for fetchWikipedia (mocked HTTP), addWikipedia (correct row creation), addUrl (success + failure paths)

## 4. Queue Overview Page (`/reading`)

- [x] 4.1 Create `app/reading/page.tsx` — two-tab layout ("Due" and "All") using existing sidebar/layout pattern from `/review`
- [x] 4.2 Wire "Due" tab to `reading.listDue` with source type badge (Note / Wikipedia / URL / Extract), due date, and priority display per row
- [x] 4.3 Wire "All" tab to `reading.listAll` with the same row format plus source type filter controls
- [x] 4.4 Add "Add to queue" button linking to `/reading/add` and "Start reading" button linking to `/reading/session` (shown only when due items exist)
- [x] 4.5 Add empty state message for Due tab when no items are due
- [x] 4.6 Add "Reading" nav link to the sidebar on all existing pages that have a sidebar (follow the same pattern as `/review`)

## 5. Add to Queue Page (`/reading/add`)

- [x] 5.1 Create `app/reading/add/page.tsx` with a URL input field
- [x] 5.2 Detect whether the submitted URL is a Wikipedia URL (hostname `en.wikipedia.org`); if so, call `reading.fetchWikipedia` and render a section checklist; otherwise call `reading.addUrl`
- [x] 5.3 Render Wikipedia section checklist: section titles with checkboxes and a collapsed content preview; "Add to queue" button calls `reading.addWikipedia` with selected sections then redirects to `/reading`
- [x] 5.4 Render non-Wikipedia URL preview: title + markdown preview (using NoteViewer); "Add to queue" button confirms the import
- [x] 5.5 Show inline error with retry on fetch failure; add "Paste content manually" fallback textarea for URL import failures
- [x] 5.6 Add existing note searchable dropdown (calls `reading.addNote`) as a second input method on this page

## 6. Reading Session Page (`/reading/session`)

- [x] 6.1 Create `app/reading/session/page.tsx` — loads first due item via `reading.listDue`, renders title + content using `NoteViewer`
- [x] 6.2 Fetch child ReadingItems for the current item (parentItemId = current item id) and inject dimmed highlight spans for each `extractedText` passage in the rendered content (fuzzy whitespace-normalized match; silent on no-match)
- [x] 6.3 Implement text selection detection: on `mouseup`/`selectionchange`, read `window.getSelection()` and show floating toolbar if selection is non-empty and within the content area
- [x] 6.4 Implement floating toolbar with three buttons: **Extract** (calls `reading.extract`, dims selected passage inline, dismisses toolbar), **Save as Note** (opens confirmation dialog), **Create Flashcard** (opens existing flashcard modal with front pre-filled)
- [x] 6.5 Implement Save as Note confirmation dialog: pre-filled title (first 80 chars of selection), editable, on confirm calls `reading.terminateNote`, advances session to next item
- [x] 6.6 Wire Create Flashcard button to existing flashcard creation modal; pass `sourceReadingItemId` so the created card is linked
- [x] 6.7 Implement FSRS rating bar at bottom: Again / Hard / Good / Easy buttons; on click calls `reading.review`, advances to next due item
- [x] 6.8 Show session completion state when no more due items remain, with link back to `/reading`
- [x] 6.9 For WIKIPEDIA_SECTION items: post-process rendered markdown links to detect Wikipedia URLs and inject "+" button adjacent to each; clicking "+" calls `reading.fetchWikipedia` + `reading.addWikipedia` for all sections of the linked article and shows a success toast

## 7. Note Detail Page — Add to Queue Button

- [x] 7.1 Add "Add to reading queue" / "In reading queue" button to `app/notes/[slug]/page.tsx` (or its client component)
- [x] 7.2 Query `reading.listAll` filtered by sourceNoteId to determine if the note is already queued; render button as disabled "In reading queue" if a non-deleted ReadingItem exists
- [x] 7.3 On button click, call `reading.addNote`; update button state to "In reading queue" (disabled) on success
