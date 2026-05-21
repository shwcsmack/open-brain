## ADDED Requirements

### Requirement: Note creation

The system SHALL allow the user to create a new note with a title, producing a unique URL-safe slug derived from the title.

#### Scenario: Create note with title
- **WHEN** the user submits a new note with title "My First Note"
- **THEN** a note record is created with slug `my-first-note` and the user is navigated to the note detail page

#### Scenario: Slug collision resolution
- **WHEN** a note with slug `my-first-note` already exists and the user creates another note titled "My First Note"
- **THEN** the new note receives slug `my-first-note-2`

---

### Requirement: Rich Markdown editing

The system SHALL provide a Tiptap v2 rich text editor supporting headings (H1–H3), bold, italic, inline code, code blocks, blockquotes, ordered lists, unordered lists, and horizontal rules.

#### Scenario: Heading input
- **WHEN** the user types `## Heading` and presses Enter
- **THEN** the text renders as a level-2 heading node in the editor

#### Scenario: Bold shortcut
- **WHEN** the user selects text and presses ⌘B
- **THEN** the selected text is wrapped in a bold mark

---

### Requirement: Auto-save

The system SHALL automatically persist note content to the database 1 second after the user stops typing, without requiring an explicit save action.

#### Scenario: Auto-save triggers after idle
- **WHEN** the user edits a note and stops typing for 1 second
- **THEN** a tRPC `note.update` mutation is called with the current editor content

#### Scenario: No duplicate saves during rapid typing
- **WHEN** the user types continuously for 5 seconds
- **THEN** at most one save is triggered (debounce resets on each keystroke)

---

### Requirement: Note deletion

The system SHALL allow the user to delete a note after confirming via a dialog, and SHALL redirect to the notes list on success.

#### Scenario: Deletion with confirmation
- **WHEN** the user clicks delete and confirms in the dialog
- **THEN** the note is removed from the database and the user is redirected to `/`

#### Scenario: Deletion cancelled
- **WHEN** the user clicks delete but dismisses the confirmation dialog
- **THEN** the note is not deleted and the user remains on the note detail page

---

### Requirement: Tag management

The system SHALL allow the user to add and remove free-form tags on a note, stored as a JSON array, and SHALL render tags as removable chip badges.

#### Scenario: Add tag
- **WHEN** the user types a tag name and presses Enter or comma
- **THEN** the tag is added to the note's tag array and rendered as a badge

#### Scenario: Remove tag
- **WHEN** the user clicks the × on a tag badge
- **THEN** the tag is removed from the note's tag array

---

### Requirement: Notes list

The system SHALL display all notes sorted by `updatedAt` descending, showing each note's title, a 120-character excerpt of body content, and last-updated date.

#### Scenario: Notes list order
- **WHEN** the user navigates to `/`
- **THEN** notes are displayed most-recently-updated first

#### Scenario: Tag filter
- **WHEN** the user clicks a tag chip in the notes list
- **THEN** the list filters to show only notes containing that tag
