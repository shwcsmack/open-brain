## ADDED Requirements

### Requirement: Create a new note
The system SHALL allow the user to create a new note with a title and Markdown body. Each note SHALL receive a unique slug derived from its title (URL-safe, lowercase, hyphenated) and a UUID primary key. Creation date and last-modified date SHALL be recorded automatically.

#### Scenario: Create note with title
- **WHEN** the user submits a new note title
- **THEN** the system creates a note record with that title, a generated slug, empty body, and timestamps

#### Scenario: Duplicate title generates unique slug
- **WHEN** the user creates a note whose title matches an existing note's title
- **THEN** the system appends a numeric suffix to the slug (e.g., `my-note-2`) to ensure uniqueness

### Requirement: Edit note body in rich Markdown editor
The system SHALL provide a rich text editor (Tiptap) that renders Markdown syntax in real time. The editor SHALL support headings, bold, italic, inline code, code blocks, blockquotes, ordered lists, unordered lists, and horizontal rules. The editor SHALL auto-save the note body to the server after a 1-second debounce following the last keystroke.

#### Scenario: Typing Markdown renders live preview
- **WHEN** the user types `**bold**` in the editor
- **THEN** the text renders as bold inline without requiring a separate preview pane

#### Scenario: Auto-save triggers after idle
- **WHEN** the user stops typing for 1 second
- **THEN** the system persists the current editor content to the database and updates `updatedAt`

#### Scenario: Auto-save does not trigger during rapid typing
- **WHEN** the user types continuously without pausing 1 second
- **THEN** no save request is sent until the 1-second idle threshold is reached

### Requirement: Delete a note
The system SHALL allow the user to delete a note. Deletion SHALL remove the note record and all associated forward links originating from that note. Backlinks from other notes pointing to the deleted note SHALL be preserved as unresolved links (the target note no longer exists).

#### Scenario: Delete note removes record
- **WHEN** the user confirms deletion of a note
- **THEN** the note record is removed from the database and the user is redirected to the notes list

#### Scenario: Deleting note removes its outgoing links
- **WHEN** a note is deleted
- **THEN** all `NoteLink` rows where `sourceNoteId` equals the deleted note's ID are removed

### Requirement: Note metadata — tags
The system SHALL support free-form string tags on notes. A note MAY have zero or more tags. Tags SHALL be stored as a JSON array on the note record. The editor SHALL provide a tag input field that accepts comma-separated values.

#### Scenario: Add tags to a note
- **WHEN** the user enters tags in the tag input and saves
- **THEN** the note's tags array is updated and the tags are displayed on the note detail page

#### Scenario: Filter notes list by tag
- **WHEN** the user clicks a tag chip anywhere in the UI
- **THEN** the notes list is filtered to show only notes that contain that tag

### Requirement: Notes list view
The system SHALL display a paginated or virtualized list of all notes sorted by last-modified date descending. Each list item SHALL show the note title, first 120 characters of plain-text body, and last-modified date.

#### Scenario: Notes list loads on app entry
- **WHEN** the user navigates to the root `/` path
- **THEN** the system renders the notes list with all existing notes

#### Scenario: Empty state shown when no notes exist
- **WHEN** no notes exist in the database
- **THEN** the system displays an empty state prompt encouraging the user to create their first note
