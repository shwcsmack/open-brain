## ADDED Requirements

### Requirement: Flashcard reading item provenance

The system SHALL add a nullable `sourceReadingItemId` field (FK → ReadingItem) to the `Flashcard` model. When a Flashcard is created via the "Create Flashcard" terminal action in a reading session, the system SHALL set `sourceReadingItemId` to the id of the ReadingItem from which it was created.

#### Scenario: Flashcard created from reading session has provenance
- **WHEN** the user creates a flashcard from a reading session via the selection toolbar
- **THEN** the resulting Flashcard row has `sourceReadingItemId` set to the current ReadingItem's id

#### Scenario: Flashcards created outside reading session unaffected
- **WHEN** a flashcard is created via the existing ⌘⇧F shortcut or the /decks form
- **THEN** `sourceReadingItemId` is null and all existing behavior is unchanged
