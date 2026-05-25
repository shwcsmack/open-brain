## ADDED Requirements

### Requirement: Archive reading item

The system SHALL provide a `reading.archive` tRPC mutation that accepts a `readingItemId`, sets `archivedAt` to the current timestamp on the matching `ReadingItem`, and returns the updated item. Archived items SHALL be excluded from `reading.listDue` and `reading.listAll` (active view) but SHALL remain in the database and be accessible via `reading.listArchived` and `reading.getById`. Archiving SHALL NOT remove Wikipedia tracking (the `articleUrl` field is preserved and the item continues to appear in `reading.getImportedWikipediaUrls`).

#### Scenario: Item archived and hidden from active queue
- **WHEN** `reading.archive` is called on an active ReadingItem
- **THEN** the item's `archivedAt` is set, it no longer appears in `reading.listDue` or `reading.listAll`, and it appears in `reading.listArchived`

#### Scenario: Archived item retained in Wikipedia tracking
- **WHEN** a Wikipedia ReadingItem with `articleUrl` set is archived
- **THEN** `reading.getImportedWikipediaUrls` still returns that `articleUrl` with `archivedAt` populated

---

### Requirement: Unarchive reading item

The system SHALL provide a `reading.unarchive` tRPC mutation that accepts a `readingItemId`, clears `archivedAt` (sets to null), and returns the updated item. After unarchiving, the item SHALL appear in `reading.listAll` and, if `due <= now()`, in `reading.listDue`.

#### Scenario: Unarchived item returns to active queue
- **WHEN** `reading.unarchive` is called on an archived ReadingItem whose `due` is in the past
- **THEN** `archivedAt` is cleared and the item appears in `reading.listDue`

---

### Requirement: Hard delete reading item

The system SHALL provide a `reading.delete` tRPC mutation that accepts a `readingItemId` and permanently removes the `ReadingItem` row from the database. If the deleted item had `articleUrl` set, it SHALL no longer appear in `reading.getImportedWikipediaUrls` after deletion.

#### Scenario: Deleted item removed from database
- **WHEN** `reading.delete` is called on a ReadingItem
- **THEN** the row is permanently removed and no longer returned by any `reading.*` query

#### Scenario: Wikipedia tracking cleared on delete
- **WHEN** `reading.delete` is called on a ReadingItem with `articleUrl` set
- **THEN** `reading.getImportedWikipediaUrls` no longer contains that `articleUrl`

---

### Requirement: Bulk archive

The system SHALL provide a `reading.bulkArchive` tRPC mutation that accepts an array of `readingItemIds` and sets `archivedAt` on each matching item. The mutation SHALL return the count of successfully archived items.

#### Scenario: Multiple items archived in one call
- **WHEN** `reading.bulkArchive` is called with three item IDs
- **THEN** all three items have `archivedAt` set and are excluded from active queue listings

---

### Requirement: Bulk delete

The system SHALL provide a `reading.bulkDelete` tRPC mutation that accepts an array of `readingItemIds` and permanently removes all matching rows. The mutation SHALL return the count of deleted items.

#### Scenario: Multiple items deleted in one call
- **WHEN** `reading.bulkDelete` is called with two item IDs
- **THEN** both rows are permanently removed from the database

---

### Requirement: Per-item and bulk actions in queue UI

The queue overview page at `/reading` SHALL display an archive icon button and a delete icon button on each item row, revealed on hover. Clicking the delete button SHALL show an inline confirmation ("Delete this item?" with Confirm and Cancel) before calling `reading.delete`. Clicking the archive button SHALL immediately call `reading.archive` without a confirmation step.

The page SHALL provide a "Select" toggle button in the queue header. When active, each row SHALL display a checkbox. When one or more items are checked, a sticky action bar SHALL appear at the bottom of the list with "Archive selected" and "Delete selected" buttons. "Delete selected" SHALL show a confirmation before calling `reading.bulkDelete`.

#### Scenario: Hover reveals per-row actions
- **WHEN** the user hovers over a queue item row
- **THEN** archive and delete icon buttons appear on that row

#### Scenario: Inline delete confirmation
- **WHEN** the user clicks the delete button on a row
- **THEN** the row shows an inline "Delete this item?" confirmation with Confirm and Cancel; no modal is shown

#### Scenario: Bulk select mode activated
- **WHEN** the user clicks the "Select" toggle
- **THEN** checkboxes appear on all rows and the toggle is visually active

#### Scenario: Bulk action bar appears with selection
- **WHEN** the user checks two or more items in select mode
- **THEN** a sticky action bar appears at the bottom showing "Archive selected" and "Delete selected" buttons with the selected count
