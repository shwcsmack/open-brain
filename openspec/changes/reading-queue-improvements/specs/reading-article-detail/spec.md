## ADDED Requirements

### Requirement: Article detail page

The system SHALL provide a `/reading/[id]` Next.js route that renders a single ReadingItem identified by its `id`. The page SHALL be accessible for both active and archived items. The page SHALL display the article title, source type badge, article content rendered as markdown with tombstones for hidden passages, and a right sidebar. The page SHALL include a back link to `/reading` in the header.

#### Scenario: Active item renders without archive indicator
- **WHEN** the user navigates to `/reading/[id]` for an active (non-archived) ReadingItem
- **THEN** the article content is rendered and no archived banner is shown

#### Scenario: Non-existent item returns 404
- **WHEN** the user navigates to `/reading/[id]` with an id that does not exist
- **THEN** a 404 page is shown

---

### Requirement: Archived item indicator on detail page

The system SHALL display an amber banner at the top of the article content area when the ReadingItem has `archivedAt` set. The banner SHALL show the archive date and include a "Restore to queue" button that calls `reading.unarchive` and redirects to `/reading` on success.

#### Scenario: Archived banner shown for archived items
- **WHEN** the user navigates to `/reading/[id]` for an archived ReadingItem
- **THEN** an amber banner is displayed with the archive date and a "Restore to queue" button

#### Scenario: Restore to queue unarchives and redirects
- **WHEN** the user clicks "Restore to queue" on an archived item's detail page
- **THEN** `reading.unarchive` is called, `archivedAt` is cleared, and the user is redirected to `/reading`

---

### Requirement: Start reading from detail page

The system SHALL display a "Start reading from here" button in the detail page header for active (non-archived) ReadingItems. Clicking the button SHALL navigate to `/reading/session?startFrom=<id>`.

#### Scenario: Start reading from here navigates to session
- **WHEN** the user clicks "Start reading from here" on an active item's detail page
- **THEN** the browser navigates to `/reading/session?startFrom=<id>` where `<id>` is the item's id

---

### Requirement: Detail page right sidebar

The system SHALL render a right sidebar on `/reading/[id]` with four sections: **Review Stats**, **Extracts**, **Notes**, and **Flashcards**.

Review Stats SHALL display: review count (`reps`), stability (formatted as days), difficulty (formatted as a decimal), and last review date.

Extracts SHALL list all child ReadingItems with `parentItemId` matching the current item's id. Each entry SHALL show a truncated preview of `extractedText` and link to that extract's own `/reading/[id]` page.

Notes SHALL list all Notes with `sourceReadingItemId` matching the current item's id. Each entry SHALL show the note title and link to the note's page.

Flashcards SHALL list all Flashcards with `sourceReadingItemId` matching the current item's id. Each entry SHALL show the flashcard front text.

#### Scenario: Review stats displayed
- **WHEN** the user views the detail page for a ReadingItem with `reps = 5`, `stability = 14.2`
- **THEN** the Review Stats sidebar section shows "5 reviews" and "14.2d stability"

#### Scenario: Extracts listed in sidebar
- **WHEN** a ReadingItem has two child extracts
- **THEN** both extracts appear in the Extracts sidebar section with truncated previews

#### Scenario: Empty sidebar sections hidden or show empty state
- **WHEN** a ReadingItem has no extracts, notes, or flashcards
- **THEN** each empty section either shows an empty state message or is omitted

---

### Requirement: Single item fetch procedure

The system SHALL provide a `reading.getById` tRPC query that accepts a `readingItemId` and returns the matching ReadingItem regardless of `archivedAt` state, or throws a NOT_FOUND error if the item does not exist or has `deletedAt` set.

#### Scenario: Active item returned
- **WHEN** `reading.getById` is called with the id of an active ReadingItem
- **THEN** the item is returned with all fields

#### Scenario: Archived item returned
- **WHEN** `reading.getById` is called with the id of an archived ReadingItem
- **THEN** the item is returned (archived items are not hidden from getById)

#### Scenario: Hard-deleted item throws NOT_FOUND
- **WHEN** `reading.getById` is called with the id of a hard-deleted ReadingItem
- **THEN** a tRPC NOT_FOUND error is returned
