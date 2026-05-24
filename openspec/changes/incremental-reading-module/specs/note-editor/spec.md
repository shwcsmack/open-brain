## ADDED Requirements

### Requirement: Note reading item provenance

The system SHALL add a nullable `sourceReadingItemId` field (FK → ReadingItem) to the `Note` model. When a Note is created via the "Save as Note" terminal action in a reading session, the system SHALL set `sourceReadingItemId` to the id of the ReadingItem from which it was created.

#### Scenario: Note created from reading session has provenance
- **WHEN** the user saves a selection as a Note from a reading session
- **THEN** the resulting Note row has `sourceReadingItemId` set to the ReadingItem's id

#### Scenario: Notes created outside reading session unaffected
- **WHEN** a note is created via the normal note creation flow
- **THEN** `sourceReadingItemId` is null and all existing behavior is unchanged

---

### Requirement: Add to reading queue button on note detail

The system SHALL display an "Add to reading queue" button on each note detail page (the `/notes/[slug]` route). Clicking the button SHALL call `reading.addNote` with the note's id. If the note is already in the queue (non-deleted ReadingItem exists), the button SHALL instead show "In reading queue" in a disabled state.

#### Scenario: Button enqueues note
- **WHEN** the user clicks "Add to reading queue" on a note detail page
- **THEN** `reading.addNote` is called and the button changes to "In reading queue" (disabled)

#### Scenario: Already-queued note shows disabled state
- **WHEN** the user visits a note detail page for a note that already has a non-deleted ReadingItem
- **THEN** the button renders as "In reading queue" and is not clickable
