## ADDED Requirements

### Requirement: Wikilink syntax in editor
The system SHALL recognize `[[Note Title]]` syntax within the note editor as a wikilink. The editor SHALL render matched wikilinks as styled inline chips that are visually distinct from plain text. Unresolved wikilinks (no matching note title) SHALL render with a dimmed/dashed style to indicate the target does not exist.

#### Scenario: Resolved wikilink renders as chip
- **WHEN** the user types `[[Existing Note]]` and a note with that title exists
- **THEN** the editor renders an inline chip with the note title that navigates to that note on click

#### Scenario: Unresolved wikilink renders as broken link
- **WHEN** the user types `[[Nonexistent Note]]` and no note with that title exists
- **THEN** the editor renders the wikilink with a distinct unresolved style (e.g., dashed underline, muted color)

#### Scenario: Clicking a resolved wikilink navigates to the target note
- **WHEN** the user clicks a resolved wikilink chip in the editor
- **THEN** the application navigates to the target note's detail page

### Requirement: Wikilink autocomplete
The system SHALL display an autocomplete dropdown when the user types `[[` followed by one or more characters, listing notes whose titles match the typed prefix. Selecting an entry SHALL insert the full `[[Note Title]]` node.

#### Scenario: Autocomplete appears after typing `[[`
- **WHEN** the user types `[[` followed by at least one character
- **THEN** a dropdown appears listing matching note titles (up to 10 results)

#### Scenario: Selecting autocomplete entry inserts wikilink node
- **WHEN** the user selects a note from the autocomplete dropdown
- **THEN** the editor inserts a resolved `[[Note Title]]` node and closes the dropdown

#### Scenario: No autocomplete results shows empty state
- **WHEN** the user types `[[xyz` and no notes match
- **THEN** the dropdown shows a "No matches" message and optionally a "Create note titled xyz" action

### Requirement: Forward link persistence
The system SHALL extract all wikilink nodes from a note's editor content on every save and persist the resolved links as rows in the `NoteLink` table (`sourceNoteId`, `targetNoteId`). Links that existed in the previous save but are absent in the new content SHALL be deleted. New links absent in the previous save SHALL be inserted.

#### Scenario: Saving a note persists new forward links
- **WHEN** a note is saved containing `[[Target Note]]` and that link did not previously exist
- **THEN** a `NoteLink` row is inserted with the source note ID and target note ID

#### Scenario: Removing a wikilink deletes the persisted link
- **WHEN** a note is saved after a previously persisted `[[Target Note]]` wikilink was removed from the body
- **THEN** the corresponding `NoteLink` row is deleted

#### Scenario: Unresolved wikilinks are not persisted
- **WHEN** a note is saved containing `[[Nonexistent Note]]` and no matching note exists
- **THEN** no `NoteLink` row is created for that wikilink

### Requirement: Backlinks panel
The system SHALL display a backlinks panel on the note detail page listing all notes that contain a resolved wikilink pointing to the current note. Each backlink entry SHALL show the source note title and a short excerpt of the surrounding context (up to 100 characters around the wikilink).

#### Scenario: Backlinks panel shows referencing notes
- **WHEN** the user views a note that is linked to by two other notes
- **THEN** the backlinks panel lists both source notes with title and excerpt

#### Scenario: Backlinks panel is empty when no references exist
- **WHEN** the user views a note that no other note links to
- **THEN** the backlinks panel shows a "No backlinks yet" empty state

#### Scenario: Clicking a backlink navigates to the source note
- **WHEN** the user clicks a backlink entry
- **THEN** the application navigates to the source note's detail page
