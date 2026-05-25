## ADDED Requirements

### Requirement: Archive log page

The system SHALL provide a `/reading/archive` Next.js route that lists all ReadingItems where `archivedAt IS NOT NULL` and `deletedAt IS NULL`, ordered by `archivedAt` descending. The page SHALL be linked from the left sidebar navigation as a sub-item under "Reading".

#### Scenario: Archived items listed in reverse archive order
- **WHEN** the user navigates to `/reading/archive`
- **THEN** all archived items are shown, most recently archived first

#### Scenario: Hard-deleted items excluded
- **WHEN** an item has both `archivedAt` and `deletedAt` set
- **THEN** it does not appear in the archive log

#### Scenario: Empty state when no archived items
- **WHEN** no ReadingItems have been archived
- **THEN** the page shows an empty state message

---

### Requirement: Archive log filtering and search

The archive log SHALL include a source type filter dropdown (same options as the active queue: All sources, Note, URL, Wikipedia, Extract) and a title search input. Applying a filter or typing in the search input SHALL narrow the displayed results client-side or via query parameter.

#### Scenario: Filter by source type
- **WHEN** the user selects "Wikipedia" from the source type filter
- **THEN** only archived items with `sourceType = WIKIPEDIA` are shown

#### Scenario: Title search narrows results
- **WHEN** the user types "quantum" in the search input
- **THEN** only archived items whose title contains "quantum" (case-insensitive) are shown

---

### Requirement: Archive log row links to detail page

Each row in the archive log SHALL display the source type badge, item title, and archived date. Clicking a row SHALL navigate to `/reading/[id]` for that item.

#### Scenario: Clicking archive row opens detail page
- **WHEN** the user clicks a row in the archive log
- **THEN** the browser navigates to `/reading/[id]` for that item

---

### Requirement: List archived items procedure

The system SHALL provide a `reading.listArchived` tRPC query that returns all ReadingItems where `archivedAt IS NOT NULL` and `deletedAt IS NULL`, with optional filtering by `sourceType`, ordered by `archivedAt` descending.

#### Scenario: Archived items returned in order
- **WHEN** `reading.listArchived` is called with no filters
- **THEN** all archived non-deleted items are returned, most recently archived first

#### Scenario: Source type filter applied
- **WHEN** `reading.listArchived` is called with `sourceType = WIKIPEDIA`
- **THEN** only archived Wikipedia items are returned
