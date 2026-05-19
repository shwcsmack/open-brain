## ADDED Requirements

### Requirement: Search notes and tasks
The system SHALL provide a full-text search interface that queries note titles, note bodies, and task titles simultaneously. Results SHALL be ranked by relevance (BM25 for SQLite FTS5; `ts_rank` for Postgres). The search input SHALL be accessible via a keyboard shortcut (`Cmd/Ctrl + K`) from any page.

#### Scenario: Search returns matching notes
- **WHEN** the user types a query that appears in a note's title or body
- **THEN** the search results include that note ranked by relevance

#### Scenario: Search returns matching tasks
- **WHEN** the user types a query that matches a task title
- **THEN** the search results include that task with a task icon indicator

#### Scenario: Keyboard shortcut opens search
- **WHEN** the user presses `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux) from any page
- **THEN** the search modal opens with focus on the input field

### Requirement: Search result display
Each search result SHALL display: the note title or task title, a snippet of up to 160 characters of surrounding matched content with matched terms highlighted, the result type (note or task), and the last-modified date. Clicking a result SHALL navigate to that note or task.

#### Scenario: Result snippet highlights match
- **WHEN** search results are displayed
- **THEN** the matched terms within each snippet are visually highlighted (bold or marked)

#### Scenario: Clicking result navigates to item
- **WHEN** the user clicks a search result
- **THEN** the application navigates to the corresponding note detail or task list with the item focused

### Requirement: Search index stays current
The system SHALL update the full-text search index synchronously on every note save and task create/update/delete. No manual re-indexing step SHALL be required.

#### Scenario: New note is immediately searchable
- **WHEN** the user creates a note and then searches for a term in its title
- **THEN** the note appears in search results without any delay or manual index refresh

#### Scenario: Deleted note is removed from search
- **WHEN** a note is deleted and the user searches for a term that was only in that note
- **THEN** the deleted note does not appear in search results

### Requirement: Empty and no-result states
The system SHALL display a helpful empty state when the search query returns no results, including the query that was searched. The system SHALL display a prompt to start typing when the search input is empty.

#### Scenario: No results shows helpful message
- **WHEN** the user submits a query that matches no notes or tasks
- **THEN** the system displays "No results for '[query]'" and suggests checking spelling or trying different terms

#### Scenario: Empty input shows recent notes
- **WHEN** the search modal is open and the input is empty
- **THEN** the system displays the 5 most recently modified notes as quick-access items
