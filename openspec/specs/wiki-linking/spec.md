## Purpose

Wiki-linking enables notes to reference each other via `[[Note Title]]` syntax, with autocomplete, backlink tracking, and a backlinks panel that surfaces all incoming links to a note.

## Requirements

### Requirement: Wikilink node parsing

The system SHALL parse `[[Note Title]]` syntax in the editor into a first-class `wikilink` node that resolves to a note record by title.

#### Scenario: Resolved wikilink rendering
- **WHEN** the editor contains `[[Biology]]` and a note titled "Biology" exists
- **THEN** the text renders as a styled inline chip with a link icon

#### Scenario: Unresolved wikilink rendering
- **WHEN** the editor contains `[[Nonexistent Note]]` and no note with that title exists
- **THEN** the text renders as a dimmed/dashed inline chip indicating the link is broken

---

### Requirement: Wikilink autocomplete

The system SHALL display an autocomplete dropdown of up to 10 ranked matching notes when the user types `[[` followed by at least one character. Each dropdown entry SHALL show the note's title and its tags (if any). Results SHALL be ranked by fuzzy match score against both title and tags, with title weighted higher than tags. The dropdown SHALL support keyboard navigation and SHALL be dismissible without inserting a wikilink.

#### Scenario: Autocomplete triggered
- **WHEN** the user types `[[Bio` in the editor
- **THEN** a dropdown appears showing up to 10 notes ranked by fuzzy match score, each entry displaying the note title and any associated tags

#### Scenario: Autocomplete matches on tags
- **WHEN** the user types `[[science` and a note titled "Biology" has a tag "science"
- **THEN** "Biology" appears in the dropdown results

#### Scenario: Autocomplete selection via click
- **WHEN** the user clicks a note entry in the autocomplete dropdown
- **THEN** a resolved `wikilink` node for that note is inserted at the cursor and the dropdown closes

#### Scenario: Autocomplete selection via Enter
- **WHEN** the dropdown is open and the user presses Enter
- **THEN** the currently highlighted note is inserted as a resolved `wikilink` node and the dropdown closes

#### Scenario: Keyboard navigation
- **WHEN** the dropdown is open and the user presses ↓ or ↑
- **THEN** the highlight moves to the next or previous item respectively, wrapping at the list boundaries

#### Scenario: Dismiss with Escape
- **WHEN** the dropdown is open and the user presses Escape
- **THEN** the dropdown closes and the typed `[[...` text is left as plain text in the editor

#### Scenario: Empty state
- **WHEN** the user types `[[xyzzy` and no notes match the query
- **THEN** the dropdown shows an empty state message and no items are selectable

---

### Requirement: Backlink index maintenance

The system SHALL maintain a `NoteLink` table of `(sourceNoteId, targetNoteId)` pairs, updated on every note save by diffing the current wikilink node set against persisted rows.

#### Scenario: Link added on save
- **WHEN** the user adds `[[Biology]]` to a note and the note auto-saves
- **THEN** a `NoteLink` row from the current note to the Biology note is inserted

#### Scenario: Link removed on save
- **WHEN** the user removes `[[Biology]]` from a note and the note auto-saves
- **THEN** the `NoteLink` row from the current note to the Biology note is deleted

#### Scenario: Unresolved links not persisted
- **WHEN** the editor contains `[[Nonexistent Note]]` and the note saves
- **THEN** no `NoteLink` row is inserted for the unresolved link

---

### Requirement: Backlinks panel

The system SHALL display a backlinks panel on every note detail page listing all notes that link to the current note, with each entry showing the source note's title and a 100-character context excerpt.

#### Scenario: Backlinks displayed
- **WHEN** the user views a note that two other notes link to
- **THEN** both source notes appear in the backlinks panel with their titles and excerpts

#### Scenario: Empty backlinks state
- **WHEN** no notes link to the current note
- **THEN** the backlinks panel shows an empty state message
