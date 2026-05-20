## ADDED Requirements

### Requirement: Full-text search index

The system SHALL maintain a full-text search index over note titles, note body content, and task titles, updated on every create, update, and delete of a note or task.

#### Scenario: Index updated on note save
- **WHEN** the user saves a note with body text "mitochondria powerhouse"
- **THEN** a subsequent search for "mitochondria" returns that note in results

#### Scenario: Index updated on note delete
- **WHEN** a note is deleted
- **THEN** a subsequent search for its content returns no result for that note

---

### Requirement: Search query procedure

The system SHALL provide a tRPC `search.query` procedure that accepts a query string and returns ranked results with fields: `type` (note | task), `id`, `title`, `snippet` (160-char excerpt with matched terms), and `updatedAt`.

#### Scenario: Ranked results returned
- **WHEN** the client calls `search.query({ q: "mitochondria" })`
- **THEN** results are returned ordered by relevance score descending

#### Scenario: Mixed result types
- **WHEN** both a note and a task match the query
- **THEN** the response contains results of type `note` and type `task`

---

### Requirement: Search modal

The system SHALL mount a `<SearchModal>` component in the root layout, openable via `⌘K` (macOS) or `Ctrl+K` (Windows/Linux), with a text input that queries `search.query` with a 200ms debounce.

#### Scenario: Modal opens with shortcut
- **WHEN** the user presses ⌘K from any page
- **THEN** the search modal opens with focus on the input field

#### Scenario: Modal closes on Escape
- **WHEN** the search modal is open and the user presses Escape
- **THEN** the modal closes

#### Scenario: Results appear after debounce
- **WHEN** the user types "bio" and waits 200ms
- **THEN** search results for "bio" appear in the modal

---

### Requirement: Empty input state

The system SHALL display the 5 most recently modified notes as a quick-access list when the search input is empty.

#### Scenario: Recent notes shown on open
- **WHEN** the search modal opens with an empty input
- **THEN** the 5 most recently modified notes are listed

---

### Requirement: No-results state

The system SHALL display a "No results for '[query]'" message when the search returns no matches.

#### Scenario: No results message
- **WHEN** the user searches for a string with no matches
- **THEN** the message "No results for '[query]'" is displayed

---

### Requirement: Dialect abstraction

The system SHALL use SQLite FTS5 when `DATABASE_URL` points to a SQLite file and PostgreSQL `tsvector` when it points to a Postgres instance, with both paths behind a single `searchNotes(query)` helper.

#### Scenario: SQLite FTS5 search
- **WHEN** the app runs with a SQLite database
- **THEN** `search.query` returns results using FTS5 BM25 ranking

#### Scenario: Postgres tsvector search
- **WHEN** the app runs with a Postgres database
- **THEN** `search.query` returns results using tsvector ranking
